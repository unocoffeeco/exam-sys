"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold">รายการสอบ</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {exams === null && !error && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {exams && exams.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีข้อสอบสำหรับห้องของคุณ</p>}

      <div className="space-y-2">
        {exams?.map((exam) => {
          const attempt = attempts[exam.id];
          const state = examCardState(exam, attempt, now);
          return (
            <Card key={exam.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(exam.openAtMs)} – {fmt(exam.closeAtMs)} · {exam.durationMin} นาที · {exam.questionCount ?? exam.questionIds.length} ข้อ
                  </p>
                  {state === "SUBMITTED" && (
                    <p className="text-xs">
                      ส่งแล้ว
                      {scores[exam.id]
                        ? ` · ได้ ${scores[exam.id].score}/${scores[exam.id].maxScore} คะแนน`
                        : " · รอประกาศผล"}
                    </p>
                  )}
                  {state === "MISSED" && <p className="text-xs text-destructive">หมดเวลารับสอบแล้ว</p>}
                  {state === "NOT_OPEN" && <p className="text-xs text-muted-foreground">ยังไม่ถึงเวลาเปิดสอบ</p>}
                </div>
                {(state === "OPEN" || state === "RESUME") && (
                  <Button disabled={busyId === exam.id} onClick={() => onStart(exam)}>
                    {busyId === exam.id ? "กำลังเตรียมข้อสอบ…" : state === "RESUME" ? "ทำต่อ" : "เริ่มสอบ"}
                  </Button>
                )}
                {state === "EXPIRED" && attempt && (
                  <Link href={`/student/exam/${attempt.id}`} className={buttonVariants({ variant: "outline" })}>
                    หมดเวลา · ส่งงาน
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
