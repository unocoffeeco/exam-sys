"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiPost } from "@/lib/api-client";
import {
  comeBack,
  IDLE_TRACKER,
  leave,
  MAX_EVENTS_PER_ATTEMPT,
  MAX_EVENTS_PER_CALL,
  parsePersisted,
  type AwayEpisode,
  type AwayTracker,
  type AwayVia,
} from "@/lib/integrity";

const RETRY_MS = 15_000;
const storeKey = (attemptId: string) => `exam-away:${attemptId}`;

/**
 * Detects when the student leaves the exam page (tab switch, minimise, another app, window blur)
 * and reports each finished "away" episode to /api/attempts/[id]/events.
 *
 * - localStorage keeps the open episode + unsent queue, so closing/reloading the page loses nothing.
 * - The server stamps the time; we only send durations. No onSnapshot, no polling beyond a retry
 *   timer that does nothing when the queue is empty.
 * - `suppress(fn)` ignores blur/hidden events caused by our own native dialogs (e.g. confirm()).
 */
export function useAwayDetector(opts: { attemptId: string; enabled: boolean; initialCount: number }) {
  const { attemptId, enabled, initialCount } = opts;
  const [reportedCount, setReportedCount] = useState<number | null>(null);

  const trackerRef = useRef<AwayTracker>(IDLE_TRACKER);
  const queueRef = useRef<AwayEpisode[]>([]);
  const sendingRef = useRef(false);
  const suppressRef = useRef(false);

  const persist = useCallback(() => {
    try {
      window.localStorage.setItem(
        storeKey(attemptId),
        JSON.stringify({ pending: queueRef.current, open: trackerRef.current.open }),
      );
    } catch {
      /* storage disabled: in-memory queue still works for this page load */
    }
  }, [attemptId]);

  const send = useCallback(async () => {
    if (sendingRef.current || queueRef.current.length === 0) return;
    sendingRef.current = true;
    const batch = queueRef.current.slice(0, MAX_EVENTS_PER_CALL);
    try {
      const r = await apiPost<{ awayCount: number }>(`/api/attempts/${attemptId}/events`, { events: batch });
      queueRef.current = queueRef.current.slice(batch.length);
      persist();
      setReportedCount(r.awayCount);
    } catch (err) {
      // 429 / 401 / network: keep the queue and retry later. Other 4xx (closed, not found,
      // bad request) will never succeed, so drop the batch instead of retrying forever.
      const permanent = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 401;
      if (permanent) {
        queueRef.current = queueRef.current.slice(batch.length);
        persist();
      }
    } finally {
      sendingRef.current = false;
    }
  }, [attemptId, persist]);

  const enqueue = useCallback(
    (episode: AwayEpisode) => {
      queueRef.current = [...queueRef.current, episode].slice(-MAX_EVENTS_PER_ATTEMPT);
      persist();
      void send();
    },
    [persist, send],
  );

  useEffect(() => {
    if (!enabled) return;

    // Restore state from a previous page load (reload / reopened tab) and close any open episode.
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storeKey(attemptId));
    } catch {
      /* ignore */
    }
    const saved = parsePersisted(raw);
    queueRef.current = saved.pending;
    trackerRef.current = saved.open ? { open: saved.open } : IDLE_TRACKER;
    if (trackerRef.current.open) {
      const r = comeBack(trackerRef.current, Date.now());
      trackerRef.current = r.state;
      if (r.episode) queueRef.current = [...queueRef.current, r.episode];
      persist();
    }
    void send();

    const onLeave = (via: AwayVia) => {
      if (suppressRef.current) return;
      const next = leave(trackerRef.current, Date.now(), via);
      if (next === trackerRef.current) return;
      trackerRef.current = next;
      persist();
    };

    // `force` = the student is clearly interacting with the page (pointer / key), so they are back
    // even if document.hasFocus() is unreliable on some mobile browsers.
    const onReturn = (force: boolean) => {
      if (!trackerRef.current.open) return;
      if (document.visibilityState !== "visible") return;
      if (!force && !document.hasFocus()) return;
      const r = comeBack(trackerRef.current, Date.now());
      trackerRef.current = r.state;
      if (r.episode) enqueue(r.episode);
      else persist();
    };

    const onVisibility = () => (document.visibilityState === "hidden" ? onLeave("hidden") : onReturn(false));
    const onBlur = () => onLeave("blur");
    const onFocus = () => onReturn(false);
    const onInteract = () => onReturn(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("pointerdown", onInteract);
    document.addEventListener("keydown", onInteract);
    const retry = window.setInterval(() => void send(), RETRY_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("pointerdown", onInteract);
      document.removeEventListener("keydown", onInteract);
      window.clearInterval(retry);
    };
  }, [enabled, attemptId, enqueue, persist, send]);

  const suppress = useCallback(<T,>(fn: () => T): T => {
    suppressRef.current = true;
    try {
      return fn();
    } finally {
      suppressRef.current = false;
    }
  }, []);

  return { awayCount: Math.max(reportedCount ?? 0, initialCount), suppress };
}
