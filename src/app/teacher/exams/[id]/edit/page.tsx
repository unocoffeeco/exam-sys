"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExamForm } from "@/components/exam/exam-form";
import { useAuth } from "@/lib/auth-context";
import { getMyExam } from "@/lib/exams";
import type { ExamDoc } from "@/lib/schemas";

export default function EditExamPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [exam, setExam] = useState<ExamDoc | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    getMyExam(id, user.uid).then(setExam).catch(() => setExam(null));
  }, [id, user]);

  if (exam === undefined) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (exam === null) return <p className="text-sm text-destructive">ไม่พบชุดสอบ หรือคุณไม่มีสิทธิ์แก้ไข</p>;
  if (exam.status !== "DRAFT") {
    return <p className="text-sm text-destructive">ชุดสอบที่เผยแพร่แล้วแก้ไขไม่ได้</p>;
  }
  return (
    <div className="space-y-4">
      <h2 className="mx-auto max-w-2xl text-xl font-semibold">แก้ไขชุดสอบ</h2>
      <ExamForm initial={exam} />
    </div>
  );
}
