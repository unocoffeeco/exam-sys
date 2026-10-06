"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FileSpreadsheet,
  PlusCircle,
  Clock,
  Calendar,
  Award,
  AlertCircle,
  Eye,
  Trash2,
  Edit,
  Send,
  Lock,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiPost, describeApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { deleteExam, listMyExams } from "@/lib/exams";
import { EXAM_STATUS_LABEL, type ExamDoc, type ExamStatus } from "@/lib/schemas";
import { useConfirm } from "@/components/ui/confirm-dialog";

const fmt = (ms: number | null) =>
  ms == null ? "—" : new Date(ms).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export default function ExamsPage() {
  const confirm = useConfirm();
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
    if (!await confirm(`เผยแพร่ "${e.title}" ใช่หรือไม่? หลังเผยแพร่จะแก้ไขข้อสอบไม่ได้`)) return;
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
    if (!await confirm(`ปิดการสอบ "${e.title}" ใช่หรือไม่?`)) return;
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
    if (!await confirm(`ลบชุดสอบ "${e.title}" ใช่หรือไม่?`)) return;
    try {
      await deleteExam(e.id);
      setExams((list) => (list ?? []).filter((x) => x.id !== e.id));
    } catch {
      setError("ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">ชุดข้อสอบทั้งหมด</h2>
          <p className="text-xs text-muted-foreground">ชุดข้อสอบที่คุณสร้างและเผยแพร่ให้นักเรียน</p>
        </div>
        <Link href="/teacher/exams/new" className={buttonVariants({ className: "gap-1.5 shadow-2xs" })}>
          <PlusCircle className="size-4" />
          <span>สร้างชุดสอบใหม่</span>
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {exams === null && !error && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-border/70 bg-card p-4 animate-pulse" />
          ))}
        </div>
      )}

      {exams && exams.length === 0 && (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <FileSpreadsheet className="mx-auto size-10 text-muted-foreground/60" />
            <p className="font-semibold text-base">ยังไม่มีชุดข้อสอบ</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              สร้างชุดข้อสอบจากคลังข้อสอบของคุณเพื่อกำหนดช่วงเวลาและห้องเรียนที่เข้าสอบ
            </p>
            <Link href="/teacher/exams/new" className={buttonVariants({ size: "sm", className: "gap-1.5" })}>
              <PlusCircle className="size-3.5" />
              <span>สร้างชุดสอบแรก</span>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {exams?.map((e) => (
          <Card key={e.id} className="transition-all hover:border-primary/40 hover:shadow-2xs">
            <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base text-foreground leading-snug">{e.title}</h3>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      e.status === "PUBLISHED"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : e.status === "DRAFT"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                        : "bg-muted text-muted-foreground border border-border/70"
                    }`}
                  >
                    {EXAM_STATUS_LABEL[e.status]}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    <span>{fmt(e.openAtMs)} – {fmt(e.closeAtMs)}</span>
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    <span>{e.durationMin} นาที</span>
                  </span>
                  <span>·</span>
                  <span>{e.questionCount ?? e.questionIds.length} ข้อ</span>
                  {e.totalPoints != null && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Award className="size-3.5 text-primary" />
                        <span>{e.totalPoints} คะแนน</span>
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex shrink-0 items-center gap-1.5">
                {e.status === "DRAFT" && (
                  <>
                    <Link
                      href={`/teacher/exams/${e.id}/edit`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1" })}
                    >
                      <Edit className="size-3.5" />
                      <span>แก้ไข</span>
                    </Link>
                    <Button
                      size="sm"
                      disabled={busyId === e.id}
                      onClick={() => onPublish(e)}
                      className="gap-1 shadow-2xs"
                    >
                      <Send className="size-3.5" />
                      <span>{busyId === e.id ? "กำลังเผยแพร่…" : "เผยแพร่"}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(e)}
                      className="text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
                {e.status !== "DRAFT" && (
                  <Link
                    href={`/teacher/exams/${e.id}/results`}
                    className={buttonVariants({ size: "sm", className: "gap-1.5 shadow-2xs" })}
                  >
                    <Eye className="size-3.5" />
                    <span>ดูผลสอบ</span>
                  </Link>
                )}
                {e.status === "PUBLISHED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === e.id}
                    onClick={() => onClose(e)}
                    className="gap-1"
                  >
                    <Lock className="size-3.5" />
                    <span>ปิดการสอบ</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
