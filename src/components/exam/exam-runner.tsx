"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, AlertCircle, ChevronLeft, ChevronRight, Send, CheckCircle2 } from "lucide-react";
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

  function onSubmitClick() {
    const left = questions.length - answeredCount;
    const msg = left > 0 ? `ยังไม่ได้ตอบ ${left} ข้อ ต้องการส่งข้อสอบใช่หรือไม่?` : "ต้องการส่งข้อสอบใช่หรือไม่?";
    // our own confirm() blurs the window in some browsers: don't count it as leaving the exam
    if (suppress(() => window.confirm(msg))) void submit();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Sticky Progress & Timer Bar */}
      <div className="sticky top-0 z-20 overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-sm backdrop-blur-md">
        {/* Progress Fill Bar */}
        <div className="h-1.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="font-semibold text-foreground">
              ข้อ {index + 1} จาก {questions.length}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              ตอบแล้ว {answeredCount}/{questions.length} ข้อ
            </span>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-bold tabular-nums transition-colors ${
              low
                ? "bg-destructive/10 text-destructive animate-pulse"
                : "bg-muted/70 text-foreground"
            }`}
          >
            <Clock className="size-3.5" />
            <span aria-live="off">{remainingMs == null ? "--:--" : formatRemaining(remainingMs)}</span>
          </div>
        </div>
      </div>

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

      {/* Main Question Card */}
      <Card className="shadow-xs border-border/80">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                คำถามข้อที่ {index + 1}
              </span>
              <p className="whitespace-pre-line text-base sm:text-lg font-medium text-foreground leading-relaxed pt-1">
                {q.body}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {q.points} คะแนน
            </span>
          </div>

          {/* Multiple choice radio list */}
          {orderedChoices.length > 0 && (
            <div className="space-y-2.5 pt-2">
              {orderedChoices.map((c, i) => {
                const isSelected = answers[q.id] === c.id;
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-3.5 rounded-xl border p-3.5 text-sm transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 text-foreground shadow-xs font-medium"
                        : "border-border/70 hover:border-border hover:bg-muted/30 text-foreground/90"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={isSelected}
                      onChange={() => setAnswer(q.id, c.id)}
                      disabled={expired}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground mr-0.5">{String.fromCharCode(65 + i)}.</span>
                    <span className="leading-snug">{c.text}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Short answer input */}
          {q.type === "SHORT" && (
            <div className="space-y-1.5 pt-2">
              <label className="text-xs text-muted-foreground">คำตอบแบบสั้น:</label>
              <Input
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="พิมพ์คำตอบของคุณที่นี่…"
                disabled={expired}
                maxLength={500}
                className="h-10 text-sm"
              />
            </div>
          )}

          {/* Essay answer textarea */}
          {q.type === "ESSAY" && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>คำตอบเชิงบรรยาย (อัตนัย):</span>
                <span>{(answers[q.id] ?? "").length} / 5000 ตัวอักษร</span>
              </div>
              <textarea
                rows={8}
                className={textareaClass}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="พิมพ์คำอธิบายหรือเนื้อหาคำตอบของคุณอย่างละเอียดที่นี่…"
                disabled={expired}
                maxLength={5000}
              />
              <p className="text-3xs text-muted-foreground">ระบบบันทึกคำตอบลงเครื่องและเซิร์ฟเวอร์โดยอัตโนมัติ</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prev / Next Navigation Controls */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
          className="gap-1.5 shadow-2xs"
        >
          <ChevronLeft className="size-4" />
          <span>ข้อก่อนหน้า</span>
        </Button>

        <Button
          variant="outline"
          disabled={index === questions.length - 1}
          onClick={() => setIndex((i) => i + 1)}
          className="gap-1.5 shadow-2xs"
        >
          <span>ข้อถัดไป</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Question Jump Grid & Final Submit */}
      <Card className="shadow-xs border-border/80">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              สารบัญข้อสอบ
            </span>
            <span className="text-xs text-muted-foreground">
              คลิกเลขข้อเพื่อกระโดดไปยังข้อนั้นทันที
            </span>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {questions.map((x, i) => {
              const done = (answers[x.id] ?? "").trim() !== "";
              const current = i === index;
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`ไปข้อ ${i + 1}${done ? " (ตอบแล้ว)" : ""}`}
                  className={`flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                    current
                      ? "ring-2 ring-primary ring-offset-2 bg-primary text-primary-foreground shadow-xs"
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

          {submitError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <Button
            className="w-full gap-2 shadow-sm font-semibold h-10"
            disabled={submitting}
            onClick={onSubmitClick}
          >
            <Send className="size-4" />
            <span>{submitting ? "กำลังส่งคำตอบ…" : "ส่งข้อสอบ"}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
