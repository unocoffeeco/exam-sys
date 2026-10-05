"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiPost, describeApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { deleteExam, listMyExams } from "@/lib/exams";
import { EXAM_STATUS_LABEL, type ExamDoc, type ExamStatus } from "@/lib/schemas";

const fmt = (ms: number | null) =>
  ms == null ? "—" : new Date(ms).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export default function ExamsPage() {
  const { user } = useAuth();
  const [exams, setExams] = useState<ExamDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listMyExams(user.uid)
      .then((list) => {
        if (!cancelled) setExams(list);
      })
      .catch(() => {
        if (!cancelled) setError("โหลดชุดสอบไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  function setStatus(id: string, status: ExamStatus, extra?: Partial<ExamDoc>) {
    setExams((list) => (list ?? []).map((e) => (e.id === id ? { ...e, status, ...extra } : e)));
  }

  async function onPublish(e: ExamDoc) {
    if (!window.confirm(`เผยแพร่ "${e.title}" ใช่หรือไม่? หลังเผยแพร่จะแก้ไขข้อสอบไม่ได้`)) return;
    setError(null);
    setBusyId(e.id);
    try {
      const r = await apiPost<{ questionCount: number; totalPoints: number }>(`/api/exams/${e.id}/publish`);
      setStatus(e.id, "PUBLISHED", { questionCount: r.questionCount, totalPoints: r.totalPoints });
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onClose(e: ExamDoc) {
    if (!window.confirm(`ปิดการสอบ "${e.title}" ใช่หรือไม่?`)) return;
    setError(null);
    setBusyId(e.id);
    try {
      await apiPost(`/api/exams/${e.id}/close`);
      setStatus(e.id, "CLOSED");
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(e: ExamDoc) {
    if (!window.confirm(`ลบชุดสอบ "${e.title}" ใช่หรือไม่?`)) return;
    try {
      await deleteExam(e.id);
      setExams((list) => (list ?? []).filter((x) => x.id !== e.id));
    } catch {
      setError("ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">ชุดสอบ</h2>
        <Link href="/teacher/exams/new" className={buttonVariants()}>+ สร้างชุดสอบ</Link>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {exams === null && !error && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {exams && exams.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีชุดสอบ</p>}

      <div className="space-y-2">
        {exams?.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-4">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  {e.title}{" "}
                  <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{EXAM_STATUS_LABEL[e.status]}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmt(e.openAtMs)} – {fmt(e.closeAtMs)} · {e.durationMin} นาที ·{" "}
                  {e.questionCount ?? e.questionIds.length} ข้อ
                  {e.totalPoints != null ? ` · ${e.totalPoints} คะแนน` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {e.status === "DRAFT" && (
                  <>
                    <Link href={`/teacher/exams/${e.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>แก้ไข</Link>
                    <Button size="sm" disabled={busyId === e.id} onClick={() => onPublish(e)}>
                      {busyId === e.id ? "กำลังเผยแพร่…" : "เผยแพร่"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => onDelete(e)}>ลบ</Button>
                  </>
                )}
                {e.status !== "DRAFT" && (
                  <Link href={`/teacher/exams/${e.id}/results`} className={buttonVariants({ variant: "outline", size: "sm" })}>ผลสอบ</Link>
                )}
                {e.status === "PUBLISHED" && (
                  <Button variant="outline" size="sm" disabled={busyId === e.id} onClick={() => onClose(e)}>ปิดการสอบ</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
