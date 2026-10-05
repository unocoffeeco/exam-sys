"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { deleteQuestion, listMyQuestions, listSubjects } from "@/lib/questions";
import { QUESTION_TYPE_LABEL, type QuestionDoc } from "@/lib/schemas";

export default function QuestionBankPage() {
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
    if (!window.confirm("ลบข้อสอบข้อนี้ใช่หรือไม่?")) return;
    try {
      await deleteQuestion(q.id);
      setQuestions((qs) => (qs ?? []).filter((x) => x.id !== q.id)); // no re-fetch: saves reads
    } catch {
      setError("ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">คลังข้อสอบ</h2>
        <div className="flex items-center gap-2">
          <select
            aria-label="กรองตามวิชา"
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">ทุกวิชา</option>
            {Object.entries(subjects).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <Link href="/teacher/questions/new" className={buttonVariants()}>+ เพิ่มข้อสอบ</Link>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {questions === null && !error && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {questions && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">ยังไม่มีข้อสอบ กดปุ่มเพิ่มข้อสอบเพื่อเริ่มต้น</p>
      )}

      <div className="space-y-2">
        {shown.map((q) => (
          <Card key={q.id}>
            <CardContent className="flex items-start justify-between gap-3 pt-4">
              <div className="min-w-0 space-y-1">
                <p className="line-clamp-2 whitespace-pre-line text-sm">{q.body}</p>
                <p className="text-xs text-muted-foreground">
                  {subjects[q.subjectId] ?? q.subjectId} · {QUESTION_TYPE_LABEL[q.type]} · {q.points} คะแนน
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Link href={`/teacher/questions/${q.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>แก้ไข</Link>
                <Button variant="destructive" size="sm" onClick={() => onDelete(q)}>ลบ</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
