"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiPost, describeApiError } from "@/lib/api-client";
import { getAttempt, getPaper, type AttemptDoc } from "@/lib/attempts";
import { useAuth } from "@/lib/auth-context";
import { getClientFirestore } from "@/lib/firebase-client";
import type { PaperQuestion } from "@/lib/publish";

type Loaded = { attempt: AttemptDoc; essays: PaperQuestion[]; manual: Record<string, number> };

export default function GradeAttemptPage() {
  const { id: examId, attemptId } = useParams<{ id: string; attemptId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      getAttempt(attemptId),
      getDoc(doc(getClientFirestore(), "attemptResults", attemptId)),
    ])
      .then(async ([attempt, result]) => {
        if (!attempt || attempt.examId !== examId || !attempt.submitted || !result.exists()) throw new Error("NOT_FOUND");
        const paper = await getPaper(attempt.examId);
        return {
          attempt,
          essays: paper.filter((q) => q.type === "ESSAY"),
          manual: (result.get("manualScores") ?? {}) as Record<string, number>,
        };
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setScores(Object.fromEntries(Object.entries(d.manual).map(([k, v]) => [k, String(v)])));
      })
      .catch(() => {
        if (!cancelled) setError("ไม่พบข้อสอบที่ส่งแล้ว หรือไม่มีสิทธิ์เข้าถึง");
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, examId, user]);

  async function onSave() {
    if (!data) return;
    setError(null);
    const payload: Record<string, number> = {};
    for (const q of data.essays) {
      const raw = (scores[q.id] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > q.points) {
        setError(`คะแนนข้อ "${q.body.slice(0, 30)}…" ต้องอยู่ระหว่าง 0 ถึง ${q.points}`);
        return;
      }
      payload[q.id] = n;
    }
    if (Object.keys(payload).length === 0) {
      setError("ยังไม่ได้กรอกคะแนน");
      return;
    }
    setSaving(true);
    try {
      await apiPost(`/api/attempts/${attemptId}/grade`, { scores: payload });
      router.push(`/teacher/exams/${examId}/results`);
    } catch (err) {
      setError(describeApiError(err));
      setSaving(false);
    }
  }

  if (error && !data) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">ตรวจข้อสอบ: {data.attempt.studentName || "นักเรียน"}</h2>
        <Link href={`/teacher/exams/${examId}/results`} className="text-sm text-muted-foreground underline">← กลับผลสอบ</Link>
      </div>

      {data.essays.length === 0 && <p className="text-sm text-muted-foreground">ชุดสอบนี้ไม่มีข้ออัตนัย</p>}

      {data.essays.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="space-y-3 pt-4">
            <p className="whitespace-pre-line text-sm font-medium">{i + 1}. {q.body}</p>
            <div className="whitespace-pre-line rounded-lg bg-muted p-3 text-sm">
              {(data.attempt.answers[q.id] ?? "").trim() || <span className="text-muted-foreground">(ไม่ได้ตอบ)</span>}
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="w-28"
                type="number"
                inputMode="decimal"
                min="0"
                max={q.points}
                step="0.25"
                aria-label={`คะแนนข้อ ${i + 1}`}
                value={scores[q.id] ?? ""}
                onChange={(e) => setScores((s) => ({ ...s, [q.id]: e.target.value }))}
              />
              <span className="text-sm text-muted-foreground">/ {q.points} คะแนน</span>
            </div>
          </CardContent>
        </Card>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {data.essays.length > 0 && (
        <Button onClick={onSave} disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึกคะแนน"}</Button>
      )}
    </div>
  );
}
