"use client";

import { useParams } from "next/navigation";
import { ExamRunner } from "@/components/exam/exam-runner";

export default function ExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return <ExamRunner attemptId={attemptId} />;
}
