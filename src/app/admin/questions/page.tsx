"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { describeAdminError, loadSubjects, nameOf, selectClass, type AdminQuestion, type NamedItem } from "@/lib/admin-client";
import { apiDelete, apiGet } from "@/lib/api-client";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES, type QuestionType } from "@/lib/schemas";

const PAGE = 30;

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [subjects, setSubjects] = useState<NamedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet<{ questions: AdminQuestion[] }>("/api/admin/questions"), loadSubjects()])
      .then(([q, s]) => {
        if (cancelled) return;
        setQuestions(q.questions);
        setSubjects(s);
      })
      .catch(() => {
        if (!cancelled) setError("โหลดคลังข้อสอบไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of questions ?? []) m.set(q.ownerId, q.ownerName || q.ownerId);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [questions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (questions ?? []).filter(
      (x) =>
        (!owner || x.ownerId === owner) &&
        (!subject || x.subjectId === subject) &&
        (!type || x.type === type) &&
        (!q || x.body.toLowerCase().includes(q)),
    );
  }, [questions, search, owner, subject, type]);

  async function onDelete(q: AdminQuestion) {
    const used = q.usedIn > 0 ? `\nข้อสอบนี้ถูกใช้ในชุดสอบ ${q.usedIn} ชุด (ชุดที่เผยแพร่แล้วไม่ได้รับผลกระทบ ส่วนฉบับร่างจะเผยแพร่ไม่ได้จนกว่าครูจะแก้)` : "";
    if (!window.confirm(`ลบข้อสอบนี้ถาวร?\n"${q.body.slice(0, 80)}"${used}`)) return;
    setError(null);
    setNotice(null);
    setBusyId(q.id);
    try {
      await apiDelete(`/api/admin/questions/${q.id}`);
      setQuestions((list) => (list ?? []).filter((x) => x.id !== q.id));
      setNotice("ลบข้อสอบแล้ว");
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setBusyId(null);
    }
  }

  const shown = filtered.slice(0, limit);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-1">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-3.5" />
          <span>กลับหน้าควบคุมระบบ</span>
        </Link>
        <h2 className="text-xl font-bold tracking-tight">คลังข้อสอบทั้งหมด</h2>
        <p className="text-xs text-muted-foreground">แสดงโจทย์ของครูทุกคนเพื่อการดูแลระบบ (ไม่แสดงตัวเลือกและเฉลย)</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-xs"
            placeholder="ค้นหาในโจทย์…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(PAGE);
            }}
          />
        </div>
        <select aria-label="กรองครู" className={selectClass} value={owner} onChange={(e) => { setOwner(e.target.value); setLimit(PAGE); }}>
          <option value="">ครูทุกคน</option>
          {owners.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select aria-label="กรองวิชา" className={selectClass} value={subject} onChange={(e) => { setSubject(e.target.value); setLimit(PAGE); }}>
          <option value="">ทุกวิชา</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select aria-label="กรองประเภท" className={selectClass} value={type} onChange={(e) => { setType(e.target.value); setLimit(PAGE); }}>
          <option value="">ทุกประเภท</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs font-medium">{notice}</div>}
      {questions === null && !error && <div className="h-20 animate-pulse rounded-xl border border-border/70 bg-card" />}
      {questions && <p className="text-xs text-muted-foreground">แสดง {shown.length} จาก {filtered.length} ข้อ (ทั้งหมด {questions.length})</p>}
      {questions && filtered.length === 0 && <p className="text-sm text-muted-foreground">ไม่พบข้อสอบ</p>}

      <div className="space-y-2.5">
        {shown.map((q) => (
          <Card key={q.id}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm">{q.body}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-2xs">
                  <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                    {QUESTION_TYPE_LABEL[q.type as QuestionType] ?? q.type}
                  </span>
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">{nameOf(subjects, q.subjectId)}</span>
                  <span className="text-muted-foreground">{q.points} คะแนน · ครู {q.ownerName || "—"}</span>
                  {q.usedIn > 0 && <span className="text-muted-foreground">· ใช้ใน {q.usedIn} ชุดสอบ</span>}
                </div>
              </div>
              <Button variant="destructive" size="sm" className="shrink-0 gap-1 text-xs" disabled={busyId === q.id} onClick={() => void onDelete(q)}>
                <Trash2 className="size-3" />
                <span>ลบ</span>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length > shown.length && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>แสดงเพิ่ม</Button>
        </div>
      )}
    </div>
  );
}
