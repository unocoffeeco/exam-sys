"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { listClassrooms, saveExam } from "@/lib/exams";
import { listMyQuestions, listSubjects } from "@/lib/questions";
import { QUESTION_TYPE_LABEL, examInputSchema, type ExamDoc, type QuestionDoc } from "@/lib/schemas";

const fieldClass =
  "w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string): number | null => (v ? new Date(v).getTime() : null);

export function ExamForm({ initial }: { initial?: ExamDoc }) {
  const router = useRouter();
  const { user } = useAuth();

  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [bank, setBank] = useState<QuestionDoc[]>([]);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [durationMin, setDurationMin] = useState(String(initial?.durationMin ?? 60));
  const [openAt, setOpenAt] = useState(toLocalInput(initial?.openAtMs ?? null));
  const [closeAt, setCloseAt] = useState(toLocalInput(initial?.closeAtMs ?? null));
  const [shuffleQuestions, setShuffleQuestions] = useState(initial?.shuffleQuestions ?? true);
  const [shuffleChoices, setShuffleChoices] = useState(initial?.shuffleChoices ?? true);
  const [showResult, setShowResult] = useState(initial?.showResult ?? false);
  const [classroomIds, setClassroomIds] = useState<string[]>(initial?.classroomIds ?? []);
  const [questionIds, setQuestionIds] = useState<string[]>(initial?.questionIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listSubjects(), listClassrooms(), listMyQuestions(user.uid)])
      .then(([s, c, q]) => {
        if (cancelled) return;
        setSubjects(s);
        setClassrooms(c);
        setBank(q);
      })
      .catch(() => {
        if (!cancelled) setError("โหลดข้อมูลไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const selected = questionIds.map((id) => byId.get(id)).filter((q): q is QuestionDoc => !!q);
  const totalPoints = selected.reduce((sum, q) => sum + q.points, 0);
  const available = bank.filter(
    (q) => !questionIds.includes(q.id) && (!subjectId || q.subjectId === subjectId),
  );

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  function move(index: number, delta: -1 | 1) {
    setQuestionIds((ids) => {
      const next = [...ids];
      const j = index + delta;
      if (j < 0 || j >= next.length) return ids;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    const parsed = examInputSchema.safeParse({
      title,
      subjectId,
      durationMin: Number(durationMin),
      openAtMs: fromLocalInput(openAt),
      closeAtMs: fromLocalInput(closeAt),
      shuffleQuestions,
      shuffleChoices,
      showResult,
      classroomIds,
      questionIds,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
      return;
    }
    setSaving(true);
    try {
      await saveExam(user.uid, parsed.data, initial?.id);
      router.replace("/teacher/exams");
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="title">ชื่อชุดสอบ</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
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
              <Label htmlFor="duration">เวลาสอบ (นาที)</Label>
              <Input id="duration" type="number" inputMode="numeric" min="1" max="600" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openAt">เปิดให้เริ่มสอบ</Label>
              <Input id="openAt" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closeAt">ปิดรับ (ต้องส่งก่อนเวลานี้)</Label>
              <Input id="closeAt" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">ห้องที่สอบได้</legend>
            <div className="flex flex-wrap gap-3">
              {classrooms.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={classroomIds.includes(c.id)} onChange={() => setClassroomIds((ids) => toggle(ids, c.id))} />
                  {c.name}
                </label>
              ))}
              {classrooms.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีห้องเรียน (ให้ผู้ดูแลระบบเพิ่ม)</p>}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">ตัวเลือก</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> สลับลำดับข้อ
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shuffleChoices} onChange={(e) => setShuffleChoices(e.target.checked)} /> สลับตัวเลือกในข้อปรนัย
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showResult} onChange={(e) => setShowResult(e.target.checked)} /> ให้นักเรียนดูคะแนนหลังส่ง
            </label>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-medium">ข้อสอบในชุด ({selected.length} ข้อ · {totalPoints} คะแนน)</h3>
          </div>
          {selected.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่ได้เลือกข้อสอบ</p>}
          <ol className="space-y-2">
            {selected.map((q, i) => (
              <li key={q.id} className="flex items-start gap-2 rounded-lg border p-2">
                <span className="w-6 shrink-0 text-sm text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 whitespace-pre-line text-sm">{q.body}</p>
                  <p className="text-xs text-muted-foreground">{QUESTION_TYPE_LABEL[q.type]} · {q.points} คะแนน</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">↑</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง">↓</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setQuestionIds((ids) => ids.filter((x) => x !== q.id))}>เอาออก</Button>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <h3 className="font-medium">เลือกจากคลังข้อสอบ{subjectId ? " (เฉพาะวิชาที่เลือก)" : ""}</h3>
          {available.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีข้อสอบที่เพิ่มได้</p>}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {available.map((q) => (
              <li key={q.id} className="flex items-start gap-2 rounded-lg border p-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 whitespace-pre-line text-sm">{q.body}</p>
                  <p className="text-xs text-muted-foreground">{QUESTION_TYPE_LABEL[q.type]} · {q.points} คะแนน</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setQuestionIds((ids) => [...ids, q.id])}>+ เพิ่ม</Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>ยกเลิก</Button>
      </div>
    </form>
  );
}
