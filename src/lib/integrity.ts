// Pure logic for exam-integrity logging (tab switch / leaving the exam page).
// No Firebase imports: unit-testable. Used by the exam runner (client), the events API (server)
// and the teacher report.
//
// Trust model: the browser reports "away" episodes; the server never trusts client clocks for
// *when* (it stamps its own time) and clamps durations. A determined student can still bypass
// client-side detection (second device, modified JS), so this is an audit signal, not proof.
import { z } from "zod";

export type AwayVia = "hidden" | "blur";

/** One continuous period where the student was not on the exam page. */
export type AwayEpisode = { via: AwayVia; durationMs: number };

/** What the server stores in attemptEvents/{attemptId}.events. */
export type StoredAwayEvent = { type: "AWAY"; via: AwayVia; durationMs: number; reportedAtMs: number };

/** Ignore blips shorter than this (notification shade, focus flicker, native dialogs). */
export const MIN_AWAY_MS = 1_000;
/** Max episodes accepted per API call. */
export const MAX_EVENTS_PER_CALL = 20;
/** Max detailed events kept per attempt (counters keep counting beyond this). */
export const MAX_EVENTS_PER_ATTEMPT = 100;
/** Server-side throttle between two reports for the same attempt. */
export const MIN_REPORT_INTERVAL_MS = 1_000;

/** Request body of POST /api/attempts/[id]/events. */
export const awayReportSchema = z.object({
  events: z
    .array(
      z.object({
        via: z.enum(["hidden", "blur"]),
        durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
      }),
    )
    .min(1)
    .max(MAX_EVENTS_PER_CALL),
});

// ---- client: away tracker (immutable state machine) ------------------------

export type AwayTracker = { open: { startMs: number; via: AwayVia } | null };

export const IDLE_TRACKER: AwayTracker = { open: null };

/** Student left the page. blur + hidden usually fire together: keep the first start, prefer "hidden". */
export function leave(state: AwayTracker, nowMs: number, via: AwayVia): AwayTracker {
  if (!state.open) return { open: { startMs: nowMs, via } };
  return via === "hidden" && state.open.via !== "hidden" ? { open: { ...state.open, via: "hidden" } } : state;
}

/** Student is back. Returns the finished episode, or null if there was none / it was a blip. */
export function comeBack(state: AwayTracker, nowMs: number): { state: AwayTracker; episode: AwayEpisode | null } {
  if (!state.open) return { state, episode: null };
  const durationMs = Math.max(0, nowMs - state.open.startMs);
  const episode = durationMs >= MIN_AWAY_MS ? { via: state.open.via, durationMs } : null;
  return { state: IDLE_TRACKER, episode };
}

// ---- client: localStorage persistence (survives refresh / closing the tab) -----

export type PersistedAway = { pending: AwayEpisode[]; open: AwayTracker["open"] };

const isVia = (v: unknown): v is AwayVia => v === "hidden" || v === "blur";

/** Defensive parse: localStorage can be edited or corrupted, never throw. */
export function parsePersisted(raw: string | null): PersistedAway {
  const empty: PersistedAway = { pending: [], open: null };
  if (!raw) return empty;
  try {
    const d = JSON.parse(raw) as { pending?: unknown; open?: unknown };
    const pending = (Array.isArray(d.pending) ? d.pending : [])
      .filter(
        (e): e is AwayEpisode =>
          !!e && isVia((e as AwayEpisode).via) && Number.isFinite((e as AwayEpisode).durationMs) && (e as AwayEpisode).durationMs >= 0,
      )
      .map((e) => ({ via: e.via, durationMs: Math.floor(e.durationMs) }))
      .slice(0, MAX_EVENTS_PER_ATTEMPT);
    const o = d.open as { startMs?: unknown; via?: unknown } | null | undefined;
    const open = o && Number.isFinite(o.startMs) && isVia(o.via) ? { startMs: o.startMs as number, via: o.via } : null;
    return { pending, open };
  } catch {
    return empty;
  }
}

// ---- server: merge reported episodes into the stored log -------------------

export type ApplyResult = {
  events: StoredAwayEvent[];
  addedCount: number;
  addedMs: number;
  truncated: boolean;
};

/**
 * Validates and merges incoming episodes. Durations are clamped to the attempt's age (nobody can be
 * away longer than the attempt has existed), blips are dropped, and the detailed log is capped.
 * Counters (addedCount/addedMs) still reflect every accepted episode, even past the cap.
 */
export function applyAwayEvents(
  existing: readonly StoredAwayEvent[],
  incoming: readonly AwayEpisode[],
  ctx: { nowMs: number; startedAtMs: number; maxEvents?: number },
): ApplyResult {
  const maxEvents = ctx.maxEvents ?? MAX_EVENTS_PER_ATTEMPT;
  const maxDuration = Math.max(0, ctx.nowMs - ctx.startedAtMs);
  const accepted = incoming
    .map((e) => ({ via: e.via, durationMs: Math.min(Math.max(0, Math.floor(e.durationMs)), maxDuration) }))
    .filter((e) => e.durationMs >= MIN_AWAY_MS);

  const room = Math.max(0, maxEvents - existing.length);
  const stored: StoredAwayEvent[] = accepted
    .slice(0, room)
    .map((e) => ({ type: "AWAY", via: e.via, durationMs: e.durationMs, reportedAtMs: ctx.nowMs }));

  return {
    events: [...existing, ...stored],
    addedCount: accepted.length,
    addedMs: accepted.reduce((s, e) => s + e.durationMs, 0),
    truncated: accepted.length > room,
  };
}

/** True when the previous report was too recent (cheap abuse / quota guard). */
export function shouldThrottle(lastReportMs: number | null | undefined, nowMs: number): boolean {
  return lastReportMs != null && nowMs - lastReportMs < MIN_REPORT_INTERVAL_MS;
}

// ---- teacher report helpers --------------------------------------------------

export type IntegrityLevel = "NONE" | "NOTICE" | "HIGH";

export const HIGH_AWAY_COUNT = 3;
export const HIGH_AWAY_TOTAL_MS = 120_000;

export function integrityLevel(awayCount: number, awayTotalMs: number): IntegrityLevel {
  if (awayCount <= 0) return "NONE";
  return awayCount >= HIGH_AWAY_COUNT || awayTotalMs >= HIGH_AWAY_TOTAL_MS ? "HIGH" : "NOTICE";
}

/** Thai, human-friendly: "45 วินาที", "2 นาที 5 วินาที", "1 ชม. 3 นาที". */
export function formatAwayDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
  if (m > 0) return s > 0 ? `${m} นาที ${s} วินาที` : `${m} นาที`;
  return `${s} วินาที`;
}
