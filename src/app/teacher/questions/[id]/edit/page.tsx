"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QuestionForm } from "@/components/question/question-form";
import { useAuth } from "@/lib/auth-context";
import { getMyQuestion } from "@/lib/questions";
import type { QuestionDoc } from "@/lib/schemas";

export default function EditQuestionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [q, setQ] = useState<QuestionDoc | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    if (!user) return;
    getMyQuestion(id, user.uid).then(setQ).catch(() => setQ(null));
  }, [id, user]);

  if (q === undefined) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (q === null) return <p className="text-sm text-destructive">ไม่พบข้อสอบ หรือคุณไม่มีสิทธิ์แก้ไข</p>;
  return (
    <div className="space-y-4">
      <h2 className="mx-auto max-w-2xl text-xl font-semibold">แก้ไขข้อสอบ</h2>
      <QuestionForm initial={q} />
    </div>
  );
}
