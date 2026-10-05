import type { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { canAcceptAnswers } from "@/lib/exam-session";
import { adminDb } from "@/lib/firebase-admin";
import { applyAwayEvents, awayReportSchema, shouldThrottle, type StoredAwayEvent } from "@/lib/integrity";

const idSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);

type PostOutcome = { kind: "ok"; awayCount: number } | { kind: "not_found" } | { kind: "closed" } | { kind: "throttled" };

/**
 * Student reports "away from the exam page" episodes (tab switch, window blur).
 * Time is stamped here (server clock); durations are clamped by applyAwayEvents.
 * Writes: attempts.integrity.* counters (so the report needs no extra reads) + attemptEvents/{id} log.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(req, ["STUDENT"]);
    const parsedId = idSchema.safeParse((await ctx.params).id);
    if (!parsedId.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
    const body = awayReportSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });

    const db = adminDb();
    const attemptRef = db.doc(`attempts/${parsedId.data}`);
    const eventsRef = db.doc(`attemptEvents/${parsedId.data}`);

    const outcome = await db.runTransaction(async (tx): Promise<PostOutcome> => {
      const [attemptSnap, eventsSnap] = await Promise.all([tx.get(attemptRef), tx.get(eventsRef)]);
      if (!attemptSnap.exists || attemptSnap.get("studentId") !== uid) return { kind: "not_found" };

      const nowMs = Date.now();
      const deadlineMs = (attemptSnap.get("deadlineAt") as Timestamp).toMillis();
      if (!canAcceptAnswers(nowMs, deadlineMs)) return { kind: "closed" };

      const lastReportMs = (eventsSnap.get("lastReportMs") as number | undefined) ?? null;
      if (shouldThrottle(lastReportMs, nowMs)) return { kind: "throttled" };

      const currentCount = Number(attemptSnap.get("integrity.awayCount") ?? 0);
      const startedAtMs = (attemptSnap.get("startedAt") as Timestamp | undefined)?.toMillis() ?? 0;
      const existing = (eventsSnap.get("events") as StoredAwayEvent[] | undefined) ?? [];
      const applied = applyAwayEvents(existing, body.data.events, { nowMs, startedAtMs });
      if (applied.addedCount === 0) return { kind: "ok", awayCount: currentCount }; // only blips: nothing to write

      tx.set(eventsRef, {
        examId: attemptSnap.get("examId"),
        examOwnerId: attemptSnap.get("examOwnerId"),
        studentId: uid,
        events: applied.events,
        truncated: Boolean(eventsSnap.get("truncated")) || applied.truncated,
        lastReportMs: nowMs,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Field paths: never overwrite answers / status / other attempt fields.
      tx.update(attemptRef, {
        "integrity.awayCount": FieldValue.increment(applied.addedCount),
        "integrity.awayTotalMs": FieldValue.increment(applied.addedMs),
      });
      return { kind: "ok", awayCount: currentCount + applied.addedCount };
    });

    if (outcome.kind === "not_found") return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if (outcome.kind === "closed") return Response.json({ error: "ALREADY_CLOSED" }, { status: 409 });
    if (outcome.kind === "throttled") return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
    return Response.json({ awayCount: outcome.awayCount });
  } catch (err) {
    return authErrorResponse(err);
  }
}

/** Teacher (owner of the exam) or admin reads the detailed log for one attempt. One document read. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { uid, role } = await requireAuth(req, ["TEACHER", "ADMIN"]);
    const parsedId = idSchema.safeParse((await ctx.params).id);
    if (!parsedId.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });

    const snap = await adminDb().doc(`attemptEvents/${parsedId.data}`).get();
    if (!snap.exists) return Response.json({ events: [], truncated: false });
    if (role === "TEACHER" && snap.get("examOwnerId") !== uid) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const events = ((snap.get("events") as StoredAwayEvent[] | undefined) ?? []).map((e) => ({
      via: e.via,
      durationMs: e.durationMs,
      reportedAtMs: e.reportedAtMs,
    }));
    return Response.json({ events, truncated: Boolean(snap.get("truncated")) });
  } catch (err) {
    return authErrorResponse(err);
  }
}
