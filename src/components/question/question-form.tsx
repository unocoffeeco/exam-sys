"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { listSubjects, saveQuestion } from "@/lib/questions";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  TRUE_FALSE_CHOICES,
  questionInputSchema,
  type Choice,
  type QuestionDoc,
  type QuestionType,
} from "@/lib/schemas";

const fieldClass =
  "w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const newId = () => crypto.randomUUID().slice(0, 8);
const emptyChoices = (): Choice[] => [
  { id: newId(), text: "", isCorrect: false },
  { id: newId(), text: "", isCorrect: false },
  { id: newId(), text: "", isCorrect: false },
  { id: newId(), text: "", isCorrect: false },
];

export function QuestionForm({ initial }: { initial?: QuestionDoc }) {
  const router = useRouter();
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [type, setType] = useState<QuestionType>(initial?.type ?? "MCQ");
  const [body, setBody] = useState(initial?.body ?? "");
  const [points, setPoints] = useState(String(initial?.points ?? 1));
  const [choices, setChoices] = useState<Choice[]>(
    initial?.type === "MCQ" && initial.choices.length ? initial.choices : emptyChoices(),
  );
  const [tfAnswer, setTfAnswer] = useState<"t" | "f">(
    initial?.type === "TRUE_FALSE" ? (initial.choices.find((c) => c.isCorrect)?.id as "t" | "f") ?? "t" : "t",
  );
  const [accepted, setAccepted] = useState((initial?.acceptedAnswers ?? []).join("\n"));
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listSubjects().then(setSubjects).catch(() => setError("โหลดรายวิชาไม่สำเร็จ"));
  }, []);

  function setCorrect(id: string) {
    setChoices((cs) => cs.map((c) => ({ ...c, isCorrect: c.id === id })));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const draft = {
      subjectId,
      type,
      body,
      points: Number(points),
      choices:
        type === "MCQ"
          ? choices.filter((c) => c.text.trim() !== "")
          : type === "TRUE_FALSE"
            ? TRUE_FALSE_CHOICES.map((c) => ({ ...c, isCorrect: c.id === tfAnswer }))
            : [],
      acceptedAnswers: type === "SHORT" ? accepted.split("\n").map((s) => s.trim()).filter(Boolean) : [],
      explanation,
    };

    const parsed = questionInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }

    setSaving(true);
    try {
      await saveQuestion(user.uid, parsed.data, initial?.id);
      router.replace("/teacher/questions");
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="subject">วิชา</Label>
              <select id="subject" className={fieldClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">— เลือกวิชา —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">ประเภทข้อสอบ</Label>
              <select id="type" className={fieldClass} value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">โจทย์</Label>
            <textarea id="body" rows={4} className={fieldClass} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          {type === "MCQ" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">ตัวเลือก (เลือกวงกลมหน้าข้อที่ถูก)</legend>
              {choices.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    aria-label={`ข้อ ${i + 1} ถูกต้อง`}
                    checked={c.isCorrect}
                    onChange={() => setCorrect(c.id)}
                    className="size-4 shrink-0"
                  />
                  <Input
                    value={c.text}
                    placeholder={`ตัวเลือก ${i + 1}`}
                    onChange={(e) => setChoices((cs) => cs.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))}
                  />
                  {choices.length > 2 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setChoices((cs) => cs.filter((x) => x.id !== c.id))}>
                      ลบ
                    </Button>
                  )}
                </div>
              ))}
              {choices.length < 8 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setChoices((cs) => [...cs, { id: newId(), text: "", isCorrect: false }])}>
                  + เพิ่มตัวเลือก
                </Button>
              )}
            </fieldset>
          )}

          {type === "TRUE_FALSE" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">คำตอบที่ถูกต้อง</legend>
              <div className="flex gap-4">
                {TRUE_FALSE_CHOICES.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="tf" checked={tfAnswer === c.id} onChange={() => setTfAnswer(c.id)} />
                    {c.text}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {type === "SHORT" && (
            <div className="space-y-2">
              <Label htmlFor="accepted">คำตอบที่ยอมรับ (บรรทัดละ 1 คำตอบ)</Label>
              <textarea id="accepted" rows={3} className={fieldClass} value={accepted} onChange={(e) => setAccepted(e.target.value)} />
            </div>
          )}

          {type === "ESSAY" && (
            <p className="text-sm text-muted-foreground">อัตนัย: ครูให้คะแนนด้วยตัวเองหลังนักเรียนส่งข้อสอบ</p>
          )}

          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="points">คะแนน</Label>
              <Input id="points" type="number" inputMode="decimal" min="0.5" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="explanation">เฉลยอธิบาย (ไม่บังคับ)</Label>
              <textarea id="explanation" rows={2} className={fieldClass} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>ยกเลิก</Button>
      </div>
    </form>
  );
}
