"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  "w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const localKey = (attemptId: string) => `exam-answers:${attemptId}`;
function readLocal(attemptId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(localKey(attemptId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function writeLocal(attemptId: string, answers: Record<string, string>) {
  try {
    window.localStorage.setItem(localKey(attemptId), JSON.stringify(answers));
  } catch {
    /* storage full / disabled: Firestore flush is still the source of truth */
  }
}

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
        // local backup wins over the server copy; re-flush anything the server doesn't have yet
        const local = attempt.submitted ? {} : readLocal(attemptId);
        const merged = { ...attempt.answers, ...local };
        for (const [qid, v] of Object.entries(local)) {
          if (attempt.answers[qid] !== v) dirtyRef.current.add(qid);
        }
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
    if (dirtyRef.current.size === 0 || flushingRef.current || submittedRef.current) return;
    flushingRef.current = true;
    const sent: Record<string, string> = {};
    for (const qid of dirtyRef.current) sent[qid] = answersRef.current[qid] ?? "";
    try {
      await flushAnswers(attemptId, sent);
      for (const [qid, v] of Object.entries(sent)) {
        if ((answersRef.current[qid] ?? "") === v) dirtyRef.current.delete(qid); // unchanged since sending
      }
    } catch {
      /* offline or past deadline: keep dirty, localStorage still has it */
    } finally {
      flushingRef.current = false;
    }
  }, [attemptId]);

  function setAnswer(qid: string, value: string) {
    answersRef.current = { ...answersRef.current, [qid]: value };
    setAnswers(answersRef.current);
    dirtyRef.current.add(qid);
    writeLocal(attemptId, answersRef.current);
  }

  const running = loaded !== null && result === null;
  const { awayCount, suppress } = useAwayDetector({
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
      <div className="mx-auto max-w-md space-y-4 text-center">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h2 className="text-xl font-semibold">ส่งข้อสอบเรียบร้อยแล้ว</h2>
            {result.showResult && result.score != null ? (
              <p>คะแนนของคุณ <span className="text-2xl font-bold">{result.score}</span> / {result.maxScore}</p>
            ) : (
              <p className="text-sm text-muted-foreground">รอครูประกาศผลคะแนน</p>
            )}
          </CardContent>
        </Card>
        <Link href="/student" className={buttonVariants()}>กลับหน้ารายการสอบ</Link>
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

  function onSubmitClick() {
    const left = questions.length - answeredCount;
    const msg = left > 0 ? `ยังไม่ได้ตอบ ${left} ข้อ ต้องการส่งข้อสอบใช่หรือไม่?` : "ต้องการส่งข้อสอบใช่หรือไม่?";
    // our own confirm() blurs the window in some browsers: don't count it as leaving the exam
    if (suppress(() => window.confirm(msg))) void submit();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border bg-background/95 px-3 py-2 backdrop-blur">
        <span className="text-sm text-muted-foreground">
          ข้อ {index + 1}/{questions.length} · ตอบแล้ว {answeredCount}
        </span>
        <span className={`font-mono text-lg font-semibold ${low ? "text-destructive" : ""}`} aria-live="off">
          {remainingMs == null ? "--:--" : formatRemaining(remainingMs)}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        ระบบจะบันทึกเมื่อคุณสลับแท็บหรือออกจากหน้าสอบ และครูจะเห็นข้อมูลนี้
      </p>
      {awayCount > 0 && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          บันทึกแล้วว่าคุณออกจากหน้าสอบ {awayCount} ครั้ง
        </p>
      )}

      {expired && <p className="text-sm text-destructive">หมดเวลาแล้ว กำลังส่งข้อสอบอัตโนมัติ…</p>}

      <Card>
        <CardContent className="space-y-4 pt-4">
          <p className="whitespace-pre-line text-base">
            <span className="mr-1 font-semibold">{index + 1}.</span>
            {q.body} <span className="text-xs text-muted-foreground">({q.points} คะแนน)</span>
          </p>

          {orderedChoices.length > 0 && (
            <div className="space-y-2">
              {orderedChoices.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${
                    answers[q.id] === c.id ? "border-primary bg-muted" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === c.id}
                    onChange={() => setAnswer(q.id, c.id)}
                    disabled={expired}
                    className="size-4 shrink-0"
                  />
                  {c.text}
                </label>
              ))}
            </div>
          )}
          {q.type === "SHORT" && (
            <Input
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="พิมพ์คำตอบ"
              disabled={expired}
              maxLength={500}
            />
          )}
          {q.type === "ESSAY" && (
            <textarea
              rows={8}
              className={textareaClass}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="พิมพ์คำตอบ"
              disabled={expired}
              maxLength={5000}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between gap-2">
        <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>ก่อนหน้า</Button>
        <Button variant="outline" disabled={index === questions.length - 1} onClick={() => setIndex((i) => i + 1)}>ถัดไป</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap gap-2">
            {questions.map((x, i) => {
              const done = (answers[x.id] ?? "").trim() !== "";
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`ไปข้อ ${i + 1}${done ? " (ตอบแล้ว)" : ""}`}
                  className={`size-9 rounded-md border text-sm ${
                    i === index ? "ring-2 ring-ring" : ""
                  } ${done ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <Button className="w-full" disabled={submitting} onClick={onSubmitClick}>
            {submitting ? "กำลังส่ง…" : "ส่งข้อสอบ"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
