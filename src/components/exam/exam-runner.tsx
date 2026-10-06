"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Clock, AlertCircle, Check, ChevronLeft, ChevronRight, Cloud, CloudOff, LayoutGrid, Loader2, Send, CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiPost, describeApiError } from "@/lib/api-client";
import { flushAnswers, getAttempt, getMyResult, getPaper, type AttemptDoc, type ScoreView } from "@/lib/attempts";
import { useAuth } from "@/lib/auth-context";
import type { PaperQuestion } from "@/lib/publish";
import { getServerOffset } from "@/lib/server-time";
import { useAwayDetector } from "./use-away-detector";

type SubmitResult = { status: string; showResult: boolean; score: number | null; maxScore: number | null };

const AUTOSAVE_MS = 30_000;
const RETRY_SUBMIT_MS = 5_000;
const textareaClass =
  "w-full rounded-lg border border-input bg-background px-2.5 py-2 text-base outline-none md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const localKey = (attemptId: string) => `exam-answers:${attemptId}`;

/**
 * `answers`: what the student typed on this device. `synced`: the values we last wrote to Firestore successfully.
 * On reload a qid whose local value still equals `synced` has no unsent edits, so the server copy wins
 * (it may include edits made on another device). Any other local value is an unsent edit and wins.
 */
type LocalStore = { answers: Record<string, string>; synced: Record<string, string> };

function readLocal(attemptId: string): LocalStore {
  try {
    const raw = window.localStorage.getItem(localKey(attemptId));
    if (!raw) return { answers: {}, synced: {} };
    const parsed = JSON.parse(raw) as Partial<LocalStore> & Record<string, unknown>;
    if (parsed && typeof parsed === "object" && parsed.answers && typeof parsed.answers === "object") {
      return { answers: parsed.answers as Record<string, string>, synced: (parsed.synced as Record<string, string>) ?? {} };
    }
    // legacy format (a plain qid -> answer map): treat everything as unsent
    return { answers: parsed as Record<string, string>, synced: {} };
  } catch {
    return { answers: {}, synced: {} };
  }
}
function writeLocal(attemptId: string, store: LocalStore) {
  try {
    window.localStorage.setItem(localKey(attemptId), JSON.stringify(store));
  } catch {
    /* storage full / disabled: Firestore flush is still the source of truth */
  }
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const TYPE_LABEL: Record<string, string> = {
  MCQ: "ปรนัย",
  TRUE_FALSE: "ถูก/ผิด",
  SHORT: "ตอบสั้น",
  ESSAY: "อัตนัย",
};

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type Loaded = { attempt: AttemptDoc; questions: PaperQuestion[]; offsetMs: number; myScore: ScoreView | null };

export function ExamRunner({ attemptId }: { attemptId: string }) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(0); // answers not yet written to Firestore
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const syncedRef = useRef<Record<string, string>>({});
  const blockedRef = useRef(false); // server refuses writes (deadline passed): stop retrying
  const answersRef = useRef<Record<string, string>>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  const flushingRef = useRef(false);
  const submittingRef = useRef(false);
  const lastSubmitTryRef = useRef(0);
  const submittedRef = useRef(false);

  // ---- load attempt + paper + server clock (promise chain: no sync setState in effect) ----
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getAttempt(attemptId)
      .then(async (attempt) => {
        if (!attempt || attempt.studentId !== user.uid) throw new Error("NOT_FOUND");
        const [questions, offsetMs, myScore] = await Promise.all([
          getPaper(attempt.examId),
          getServerOffset(),
          attempt.submitted ? getMyResult(attemptId) : Promise.resolve(null),
        ]);
        return { attempt, questions, offsetMs, myScore };
      })
      .then((data) => {
        if (cancelled) return;
        const { attempt } = data;
        // merge: see LocalStore. Unsent local edits win; otherwise the server copy wins.
        const local = attempt.submitted ? { answers: {}, synced: {} } : readLocal(attemptId);
        const merged: Record<string, string> = { ...attempt.answers };
        for (const [qid, v] of Object.entries(local.answers)) {
          if (v === local.synced[qid] && qid in attempt.answers) continue; // no unsent edit here
          merged[qid] = v;
          if (attempt.answers[qid] !== v) dirtyRef.current.add(qid);
        }
        syncedRef.current = { ...attempt.answers };
        setPending(dirtyRef.current.size);
        answersRef.current = merged;
        setAnswers(merged);
        setLoaded(data);
        if (attempt.submitted) {
          submittedRef.current = true;
          setResult({
            status: attempt.status,
            showResult: attempt.showResult,
            score: data.myScore?.score ?? null,
            maxScore: data.myScore?.maxScore ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("ไม่พบข้อสอบ หรือคุณไม่มีสิทธิ์เข้าถึง");
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, user]);

  // ---- autosave: localStorage on every change, Firestore on question change / interval ----
  const flush = useCallback(async () => {
    if (dirtyRef.current.size === 0 || flushingRef.current || submittedRef.current || blockedRef.current) return;
    flushingRef.current = true;
    setSaving(true);
    const sent: Record<string, string> = {};
    for (const qid of dirtyRef.current) sent[qid] = answersRef.current[qid] ?? "";
    try {
      await flushAnswers(attemptId, sent);
      syncedRef.current = { ...syncedRef.current, ...sent };
      for (const [qid, v] of Object.entries(sent)) {
        if ((answersRef.current[qid] ?? "") === v) dirtyRef.current.delete(qid); // unchanged since sending
      }
      writeLocal(attemptId, { answers: answersRef.current, synced: syncedRef.current });
    } catch (err) {
      // permission-denied = past the deadline: retrying is pointless, the auto-submit takes over.
      // Anything else (offline, quota) keeps the answers dirty; localStorage still has them.
      if ((err as { code?: string } | null)?.code === "permission-denied") blockedRef.current = true;
    } finally {
      flushingRef.current = false;
      setSaving(false);
      setPending(dirtyRef.current.size);
    }
  }, [attemptId]);

  function setAnswer(qid: string, value: string) {
    answersRef.current = { ...answersRef.current, [qid]: value };
    setAnswers(answersRef.current);
    dirtyRef.current.add(qid);
    setPending(dirtyRef.current.size);
    writeLocal(attemptId, { answers: answersRef.current, synced: syncedRef.current });
  }

  const running = loaded !== null && result === null;
  const { awayCount } = useAwayDetector({
    attemptId,
    enabled: running,
    initialCount: loaded?.attempt.awayCount ?? 0,
  });

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => void flush(), AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [running, flush]);

  useEffect(() => {
    if (running) void flush(); // flush when the student changes question
  }, [index, running, flush]);

  // come back online: push whatever is waiting right away
  useEffect(() => {
    if (running && online) void flush();
  }, [online, running, flush]);

  // warn before closing the tab / navigating away while answers are not on the server yet
  useEffect(() => {
    if (!running || pending === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running, pending]);

  // ---- submit (manual or automatic at the deadline) ----
  const submit = useCallback(async () => {
    if (submittingRef.current || submittedRef.current) return;
    submittingRef.current = true;
    lastSubmitTryRef.current = Date.now();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await apiPost<SubmitResult>(`/api/attempts/${attemptId}/submit`, { answers: answersRef.current });
      submittedRef.current = true;
      setConfirmOpen(false);
      try {
        window.localStorage.removeItem(localKey(attemptId));
      } catch {
        /* ignore */
      }
      setResult(r);
    } catch (err) {
      setSubmitError(describeApiError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [attemptId]);

  // ---- countdown from the SERVER deadline and server clock offset ----
  const deadlineMs = loaded?.attempt.deadlineMs ?? null;
  const offsetMs = loaded?.offsetMs ?? 0;
  useEffect(() => {
    if (!running || deadlineMs == null) return;
    const tick = () => {
      const left = deadlineMs - (Date.now() + offsetMs);
      setRemainingMs(left);
      if (left <= 0 && Date.now() - lastSubmitTryRef.current > RETRY_SUBMIT_MS) void submit();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running, deadlineMs, offsetMs, submit]);

  const questions = useMemo(() => {
    if (!loaded) return [];
    const byId = new Map(loaded.questions.map((q) => [q.id, q]));
    return loaded.attempt.order.map((id) => byId.get(id)).filter((q): q is PaperQuestion => !!q);
  }, [loaded]);

  // ---- render ----
  if (loadError) {
    return (
      <div className="mx-auto max-w-md space-y-3 text-center">
        <p className="text-sm text-destructive">{loadError}</p>
        <Link href="/student" className={buttonVariants({ variant: "outline" })}>กลับหน้ารายการสอบ</Link>
      </div>
    );
  }
  if (!loaded) return <p className="text-sm text-muted-foreground">กำลังโหลดข้อสอบ…</p>;

  if (result) {
    return (
      <div className="mx-auto max-w-md space-y-5 text-center py-6">
        <Card className="border-border/80 shadow-md">
          <CardContent className="space-y-4 pt-8 pb-6 px-6">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight">ส่งข้อสอบเรียบร้อยแล้ว</h2>
              <p className="text-xs text-muted-foreground">ระบบได้บันทึกคำตอบและปิดการสอบของคุณแล้ว</p>
            </div>

            {result.showResult && result.score != null ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">คะแนนที่คุณทำได้</span>
                <p className="text-3xl font-extrabold text-primary tabular-nums">
                  {result.score} <span className="text-base font-normal text-muted-foreground">/ {result.maxScore}</span>
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 bg-muted/40 p-3.5 text-xs text-muted-foreground">
                ข้อสอบชุดนี้ยังไม่ประกาศคะแนนทันที กรุณารอคุณครูตรวจข้อสอบและแจ้งผล
              </div>
            )}
          </CardContent>
        </Card>
        <Link href="/student" className={buttonVariants({ size: "lg", className: "w-full gap-2 shadow-xs" })}>
          กลับสู่หน้ารายการสอบ
        </Link>
      </div>
    );
  }

  const q = questions[index];
  if (!q) return <p className="text-sm text-destructive">ชุดสอบนี้ไม่มีข้อสอบ กรุณาแจ้งครู</p>;
  const answeredCount = questions.filter((x) => (answers[x.id] ?? "").trim() !== "").length;
  const low = remainingMs != null && remainingMs <= 5 * 60_000;
  const expired = remainingMs != null && remainingMs <= 0;
  const orderedChoices = q.choices.length
    ? (loaded.attempt.choiceOrder[q.id] ?? q.choices.map((c) => c.id))
        .map((id) => q.choices.find((c) => c.id === id))
        .filter((c): c is { id: string; text: string } => !!c)
    : [];

  const unanswered = questions.map((x, i) => ({ id: x.id, n: i + 1, done: (answers[x.id] ?? "").trim() !== "" })).filter((x) => !x.done);
  const warnLevel = remainingMs == null ? null : remainingMs <= 60_000 ? "1" : remainingMs <= 5 * 60_000 ? "5" : null;

  const saveStatus = !online
    ? { icon: CloudOff, text: "ออฟไลน์ · บันทึกในเครื่องแล้ว", cls: "text-amber-700 dark:text-amber-300" }
    : saving
      ? { icon: Loader2, text: "กำลังบันทึก…", cls: "text-muted-foreground", spin: true }
      : pending > 0
        ? { icon: Cloud, text: "ยังไม่ขึ้นเซิร์ฟเวอร์", cls: "text-amber-700 dark:text-amber-300" }
        : { icon: Cloud, text: "บันทึกแล้ว", cls: "text-muted-foreground" };
  const SaveIcon = saveStatus.icon;

  // Question jump grid: shown inline on desktop and inside a dialog on phones.
  const jumpGrid = (onPick: () => void) => (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
      {questions.map((x, i) => {
        const done = (answers[x.id] ?? "").trim() !== "";
        const current = i === index;
        return (
          <button
            key={x.id}
            type="button"
            onClick={() => {
              setIndex(i);
              onPick();
            }}
            aria-label={`ไปข้อ ${i + 1}${done ? " (ตอบแล้ว)" : " (ยังไม่ตอบ)"}`}
            aria-current={current ? "step" : undefined}
            className={`flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition-all sm:h-9 sm:text-xs ${
              current
                ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary ring-offset-2 ring-offset-background"
                : done
                  ? "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                  : "border border-border/80 bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );

  const submitButton = (
    <Button className="h-11 w-full gap-2 font-semibold shadow-sm sm:h-10" disabled={submitting} onClick={() => setConfirmOpen(true)}>
      <Send className="size-4" />
      <span>{submitting ? "กำลังส่งคำตอบ…" : "ส่งข้อสอบ"}</span>
    </Button>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24 sm:pb-0">
      {/* Sticky progress + timer (the app header is not sticky on this page, so this is the only pinned bar) */}
      <div className="sticky top-0 z-20 overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-sm backdrop-blur-md">
        <div className="h-1.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="min-w-0 space-y-0.5 text-xs sm:text-sm">
            <p className="truncate">
              <span className="font-semibold text-foreground">
                ข้อ {index + 1}/{questions.length}
              </span>
              <span className="text-muted-foreground"> · ตอบแล้ว {answeredCount}</span>
            </p>
            <p className={`flex items-center gap-1 text-xs ${saveStatus.cls}`} role="status">
              <SaveIcon className={`size-3 ${"spin" in saveStatus && saveStatus.spin ? "animate-spin" : ""}`} />
              <span className="truncate">{saveStatus.text}</span>
            </p>
          </div>

          <div
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold tabular-nums transition-colors ${
              low ? "bg-destructive/10 text-destructive ring-1 ring-destructive/30" : "bg-muted/70 text-foreground"
            }`}
          >
            {low ? <AlertCircle className="size-4" /> : <Clock className="size-4" />}
            <span aria-hidden="true">{remainingMs == null ? "--:--" : formatRemaining(remainingMs)}</span>
            <span className="sr-only">
              เวลาที่เหลือ {remainingMs == null ? "ไม่ทราบ" : formatRemaining(remainingMs)}
            </span>
          </div>
        </div>
      </div>

      {/* Screen readers hear the clock only at 5 min and 1 min left, not every second */}
      <p className="sr-only" role="status" aria-live="polite">
        {warnLevel === "1" ? "เหลือเวลาไม่ถึง 1 นาที" : warnLevel === "5" ? "เหลือเวลาไม่ถึง 5 นาที" : ""}
      </p>

      {!online && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-100">
          <CloudOff className="size-4 shrink-0" />
          <span>ขาดการเชื่อมต่ออินเทอร์เน็ต คำตอบถูกเก็บไว้ในเครื่อง และจะส่งขึ้นระบบอัตโนมัติเมื่อกลับมาออนไลน์ อย่าปิดหน้านี้</span>
        </div>
      )}

      {awayCount > 0 && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-100"
        >
          <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>ระบบบันทึกแล้วว่าคุณสลับแท็บหรือออกจากหน้าสอบ {awayCount} ครั้ง (ข้อมูลนี้จะส่งให้คุณครู)</span>
        </div>
      )}

      {expired && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>หมดเวลาการสอบแล้ว ระบบกำลังส่งข้อสอบโดยอัตโนมัติ…</span>
        </div>
      )}

      {/* Main question card */}
      <Card className="border-border/80 shadow-xs">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  คำถามข้อที่ {index + 1}
                </span>
                <span className="inline-block rounded-md border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">
                  {TYPE_LABEL[q.type] ?? q.type}
                </span>
              </div>
              <p className="whitespace-pre-line pt-1 text-base font-medium leading-relaxed text-foreground sm:text-lg">{q.body}</p>
            </div>
            <span className="shrink-0 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {q.points} คะแนน
            </span>
          </div>

          {/* Multiple choice / true-false */}
          {orderedChoices.length > 0 && (
            <div role="radiogroup" aria-label={`ตัวเลือกข้อ ${index + 1}`} className="space-y-2.5 pt-2">
              {orderedChoices.map((c, i) => {
                const isSelected = answers[q.id] === c.id;
                return (
                  <label
                    key={c.id}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-all has-focus-visible:ring-3 has-focus-visible:ring-ring/50 sm:text-base ${
                      isSelected
                        ? "border-primary bg-primary/5 font-medium text-foreground shadow-xs"
                        : "border-border/70 text-foreground/90 hover:border-border hover:bg-muted/30"
                    } ${expired ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={isSelected}
                      onChange={() => setAnswer(q.id, c.id)}
                      disabled={expired}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                      }`}
                    >
                      {isSelected ? <Check className="size-4" /> : String.fromCharCode(65 + i)}
                    </span>
                    <span className="leading-snug">{c.text}</span>
                  </label>
                );
              })}
            </div>
          )}

          {q.type === "SHORT" && (
            <div className="space-y-1.5 pt-2">
              <label htmlFor={`short-${q.id}`} className="text-xs text-muted-foreground">
                คำตอบแบบสั้น:
              </label>
              <Input
                id={`short-${q.id}`}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="พิมพ์คำตอบของคุณที่นี่…"
                disabled={expired}
                maxLength={500}
                autoComplete="off"
                className="h-11 text-base sm:h-10"
              />
            </div>
          )}

          {q.type === "ESSAY" && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <label htmlFor={`essay-${q.id}`}>คำตอบเชิงบรรยาย (อัตนัย):</label>
                <span>{(answers[q.id] ?? "").length} / 5000 ตัวอักษร</span>
              </div>
              <textarea
                id={`essay-${q.id}`}
                rows={8}
                className={textareaClass}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="พิมพ์คำอธิบายหรือเนื้อหาคำตอบของคุณอย่างละเอียดที่นี่…"
                disabled={expired}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground">ระบบบันทึกคำตอบลงเครื่องและเซิร์ฟเวอร์โดยอัตโนมัติ</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prev / next: pinned to the bottom on phones, inline on larger screens */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-border/80 bg-background/95 px-3 pt-2 backdrop-blur-md sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} className="h-11 flex-1 gap-1.5 sm:h-9 sm:flex-none">
          <ChevronLeft className="size-4" />
          <span>ก่อนหน้า</span>
        </Button>

        <Button variant="secondary" onClick={() => setGridOpen(true)} className="h-11 gap-1.5 sm:hidden" aria-label="ดูทุกข้อ">
          <LayoutGrid className="size-4" />
          <span>
            {answeredCount}/{questions.length}
          </span>
        </Button>

        <Button
          variant="outline"
          disabled={index === questions.length - 1}
          onClick={() => setIndex((i) => i + 1)}
          className="h-11 flex-1 gap-1.5 sm:h-9 sm:flex-none"
        >
          <span>ถัดไป</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Desktop overview + submit */}
      <Card className="hidden border-border/80 shadow-xs sm:block">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">สารบัญข้อสอบ</span>
            <span className="text-xs text-muted-foreground">คลิกเลขข้อเพื่อกระโดดไปยังข้อนั้นทันที</span>
          </div>
          {jumpGrid(() => {})}
          {submitError && !confirmOpen && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
          {submitButton}
        </CardContent>
      </Card>

      {/* Phone overview dialog */}
      <Dialog open={gridOpen} onOpenChange={setGridOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              สารบัญข้อสอบ ({answeredCount}/{questions.length})
            </DialogTitle>
            <DialogDescription>แตะเลขข้อเพื่อไปยังข้อนั้น ข้อที่ตอบแล้วจะเป็นสีฟ้า</DialogDescription>
          </DialogHeader>
          {jumpGrid(() => setGridOpen(false))}
          <DialogFooter>
            <Button
              className="h-11 gap-2"
              onClick={() => {
                setGridOpen(false);
                setConfirmOpen(true);
              }}
            >
              <Send className="size-4" />
              <span>ส่งข้อสอบ</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit confirmation: a DOM dialog never blurs the window, so it cannot be counted as "leaving the exam" */}
      <Dialog open={confirmOpen && !expired} onOpenChange={(open) => !submitting && setConfirmOpen(open)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>ยืนยันการส่งข้อสอบ</DialogTitle>
            <DialogDescription>
              ตอบแล้ว {answeredCount} จาก {questions.length} ข้อ · เมื่อส่งแล้วจะแก้ไขคำตอบไม่ได้
            </DialogDescription>
          </DialogHeader>

          {unanswered.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs font-medium text-amber-900 dark:text-amber-100">ยังไม่ได้ตอบ {unanswered.length} ข้อ (แตะเพื่อกลับไปทำ)</p>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {unanswered.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setIndex(u.n - 1);
                      setConfirmOpen(false);
                    }}
                    className="h-9 min-w-9 rounded-md border border-amber-600/40 bg-background px-2 text-xs font-semibold hover:bg-muted"
                  >
                    {u.n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {pending > 0 && (
            <p className="text-xs text-muted-foreground">ระบบจะส่งคำตอบล่าสุดจากหน้านี้ไปพร้อมกับการส่งข้อสอบ</p>
          )}
          {submitError && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="h-11 sm:h-9" disabled={submitting} onClick={() => setConfirmOpen(false)}>
              กลับไปตรวจคำตอบ
            </Button>
            <Button className="h-11 gap-2 sm:h-9" disabled={submitting} onClick={() => void submit()}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              <span>{submitting ? "กำลังส่ง…" : "ยืนยันส่งข้อสอบ"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
