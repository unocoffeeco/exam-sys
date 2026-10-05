"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  ArrowRight,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiPost, describeApiError } from "@/lib/api-client";
import { listMyAttempts, listMyVisibleResults, type AttemptDoc, type ScoreView } from "@/lib/attempts";
import { useAuth } from "@/lib/auth-context";
import { examFromData } from "@/lib/exams";
import { examCardState } from "@/lib/exam-session";
import { getClientFirestore } from "@/lib/firebase-client";
import type { ExamDoc } from "@/lib/schemas";
import { collection, getDocs, query, where } from "firebase/firestore";

const fmt = (ms: number | null) =>
  ms == null ? "—" : new Date(ms).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export default function StudentHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [classroom, setClassroom] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamDoc[] | null>(null);
  const [attempts, setAttempts] = useState<Record<string, AttemptDoc>>({});
  const [scores, setScores] = useState<Record<string, ScoreView>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user
      .getIdTokenResult()
      .then((tok) => {
        const classroomId = tok.claims.classroomId;
        if (typeof classroomId !== "string") throw new Error("NO_CLASSROOM");
        setClassroom(classroomId);
        return Promise.all([
          getDocs(
            query(
              collection(getClientFirestore(), "exams"),
              where("status", "==", "PUBLISHED"),
              where("classroomIds", "array-contains", classroomId),
            ),
          ),
          listMyAttempts(user.uid),
          listMyVisibleResults(user.uid),
        ]);
      })
      .then(([examSnap, myAttempts, myScores]) => {
        if (cancelled) return;
        setNow(Date.now());
        setExams(
          examSnap.docs.map((d) => examFromData(d.id, d.data())).sort((a, b) => (a.openAtMs ?? 0) - (b.openAtMs ?? 0)),
        );
        setAttempts(Object.fromEntries(myAttempts.map((a) => [a.examId, a])));
        setScores(myScores);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error && e.message === "NO_CLASSROOM"
            ? "บัญชีนี้ยังไม่ได้ระบุห้องเรียน กรุณาติดต่อผู้ดูแลระบบ"
            : "โหลดรายการสอบไม่สำเร็จ",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onStart(exam: ExamDoc) {
    setError(null);
    setBusyId(exam.id);
    try {
      const { attemptId } = await apiPost<{ attemptId: string }>(`/api/exams/${exam.id}/start`);
      router.push(`/student/exam/${attemptId}`);
    } catch (err) {
      setError(describeApiError(err));
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Student Banner */}
      <div className="rounded-2xl border border-primary/20 bg-linear-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">ห้องสอบนักเรียน</span>
              {classroom && (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  ห้อง {classroom}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight">แบบทดสอบที่ได้รับมอบหมาย</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              กรุณาเข้าสอบตามช่วงเวลาที่กำหนด และตรวจทานคำตอบก่อนส่ง
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {exams === null && !error && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border/70 bg-card p-4 animate-pulse" />
          ))}
        </div>
      )}

      {exams && exams.length === 0 && (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <BookOpen className="mx-auto size-10 text-muted-foreground/60" />
            <p className="font-semibold text-base">ยังไม่มีข้อสอบสำหรับห้องของคุณในขณะนี้</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              เมื่อคุณครูเปิดการสอบสำหรับห้องของคุณ รายการแบบทดสอบจะปรากฏที่นี่โดยอัตโนมัติ
            </p>
          </CardContent>
        </Card>
      )}

      {/* Exam List */}
      <div className="space-y-3">
        {exams?.map((exam) => {
          const attempt = attempts[exam.id];
          const state = examCardState(exam, attempt, now);
          const score = scores[exam.id];

          return (
            <Card
              key={exam.id}
              className={`transition-all hover:border-primary/40 ${
                state === "OPEN" || state === "RESUME" ? "ring-1 ring-primary/20 shadow-xs" : ""
              }`}
            >
              <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
                <div className="min-w-0 space-y-2">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-base text-foreground leading-snug">{exam.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        <span>{fmt(exam.openAtMs)} – {fmt(exam.closeAtMs)}</span>
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" />
                        <span>{exam.durationMin} นาที</span>
                      </span>
                      <span>·</span>
                      <span>{exam.questionCount ?? exam.questionIds.length} ข้อ</span>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  {state === "SUBMITTED" && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="size-3.5" />
                      <span>
                        ส่งข้อสอบแล้ว
                        {score
                          ? ` · ได้คะแนน ${score.score}/${score.maxScore}`
                          : " · กำลังรอครูประกาศผล"}
                      </span>
                    </div>
                  )}
                  {state === "MISSED" && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-destructive font-medium">
                      <AlertCircle className="size-3.5" />
                      <span>หมดเวลารับสอบแล้ว</span>
                    </div>
                  )}
                  {state === "NOT_OPEN" && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <Clock className="size-3.5" />
                      <span>ยังไม่ถึงเวลาเปิดสอบ</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="shrink-0 flex items-center gap-2">
                  {(state === "OPEN" || state === "RESUME") && (
                    <Button
                      disabled={busyId === exam.id}
                      onClick={() => onStart(exam)}
                      className="gap-2 w-full sm:w-auto shadow-xs"
                    >
                      {state === "RESUME" ? (
                        <>
                          <ArrowRight className="size-4" />
                          <span>ทำต่อ</span>
                        </>
                      ) : (
                        <>
                          <Play className="size-4 fill-current" />
                          <span>{busyId === exam.id ? "กำลังเตรียม…" : "เริ่มทำข้อสอบ"}</span>
                        </>
                      )}
                    </Button>
                  )}
                  {state === "EXPIRED" && attempt && (
                    <Link
                      href={`/student/exam/${attempt.id}`}
                      className={buttonVariants({ variant: "outline", className: "gap-2 w-full sm:w-auto" })}
                    >
                      <span>ส่งงานหลังหมดเวลา</span>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
