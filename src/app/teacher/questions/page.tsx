"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  PlusCircle,
  Edit,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { deleteQuestion, listMyQuestions, listSubjects } from "@/lib/questions";
import { QUESTION_TYPE_LABEL, type QuestionDoc } from "@/lib/schemas";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function QuestionBankPage() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const [questions, setQuestions] = useState<QuestionDoc[] | null>(null);
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listMyQuestions(user.uid), listSubjects()])
      .then(([qs, subs]) => {
        if (cancelled) return;
        setQuestions(qs);
        setSubjects(Object.fromEntries(subs.map((s) => [s.id, s.name])));
      })
      .catch(() => {
        if (!cancelled) setError("โหลดคลังข้อสอบไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const shown = useMemo(
    () => (questions ?? []).filter((q) => !filter || q.subjectId === filter),
    [questions, filter],
  );

  async function onDelete(q: QuestionDoc) {
    if (!await confirm("ลบข้อสอบข้อนี้ใช่หรือไม่?")) return;
    try {
      await deleteQuestion(q.id);
      setQuestions((qs) => (qs ?? []).filter((x) => x.id !== q.id));
    } catch {
      setError("ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">คลังข้อสอบ</h2>
          <p className="text-xs text-muted-foreground">ข้อสอบรายข้อของคุณสำหรับนำไปจัดชุดสอบ</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              aria-label="กรองตามวิชา"
              className="h-8 rounded-lg border border-input bg-background pl-2.5 pr-8 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">ทุกกลุ่มวิชา</option>
              {Object.entries(subjects).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <Link href="/teacher/questions/new" className={buttonVariants({ size: "sm", className: "gap-1.5 shadow-2xs" })}>
            <PlusCircle className="size-3.5" />
            <span>เพิ่มข้อสอบใหม่</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {questions === null && !error && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-border/70 bg-card p-4 animate-pulse" />
          ))}
        </div>
      )}

      {questions && shown.length === 0 && (
        <Card className="text-center py-12">
          <CardContent className="space-y-3">
            <BookOpen className="mx-auto size-10 text-muted-foreground/60" />
            <p className="font-semibold text-base">
              {filter ? "ไม่พบข้อสอบในวิชาที่เลือก" : "ยังไม่มีข้อสอบในคลัง"}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              สร้างข้อสอบใหม่เพื่อนำไปใช้จัดชุดสอบให้นักเรียน
            </p>
            <Link href="/teacher/questions/new" className={buttonVariants({ size: "sm", className: "gap-1.5" })}>
              <PlusCircle className="size-3.5" />
              <span>เพิ่มข้อสอบแรก</span>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {shown.map((q) => (
          <Card key={q.id} className="transition-all hover:border-primary/40 hover:shadow-2xs">
            <CardContent className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {subjects[q.subjectId] ?? q.subjectId}
                  </span>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    {QUESTION_TYPE_LABEL[q.type]}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-medium text-foreground">{q.points} คะแนน</span>
                </div>

                <p className="line-clamp-3 whitespace-pre-line text-sm text-foreground/90 leading-relaxed">
                  {q.body}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-start pt-1 sm:pt-0">
                <Link
                  href={`/teacher/questions/${q.id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1" })}
                >
                  <Edit className="size-3.5" />
                  <span>แก้ไข</span>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(q)}
                  className="text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
