"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronRight, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fmtDateTime,
  loadClassrooms,
  loadSubjects,
  nameOf,
  selectClass,
  type AdminExam,
  type NamedItem,
} from "@/lib/admin-client";
import { apiGet } from "@/lib/api-client";
import { EXAM_STATUS_LABEL, EXAM_STATUSES } from "@/lib/schemas";

const STATUS_STYLE: Record<AdminExam["status"], string> = {
  DRAFT: "bg-secondary text-secondary-foreground",
  PUBLISHED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-muted text-muted-foreground",
};

export default function AdminExamsPage() {
  const [exams, setExams] = useState<AdminExam[] | null>(null);
  const [rooms, setRooms] = useState<NamedItem[]>([]);
  const [subjects, setSubjects] = useState<NamedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet<{ exams: AdminExam[] }>("/api/admin/exams"), loadClassrooms(), loadSubjects()])
      .then(([e, r, s]) => {
        if (cancelled) return;
        setExams(e.exams);
        setRooms(r);
        setSubjects(s);
      })
      .catch(() => {
        if (!cancelled) setError("โหลดรายการชุดสอบไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of exams ?? []) m.set(e.ownerId, e.ownerName || e.ownerId);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [exams]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exams ?? []).filter(
      (e) => (!status || e.status === status) && (!owner || e.ownerId === owner) && (!q || e.title.toLowerCase().includes(q)),
    );
  }, [exams, search, status, owner]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-1">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-3.5" />
          <span>กลับหน้าควบคุมระบบ</span>
        </Link>
        <h2 className="text-xl font-bold tracking-tight">ชุดสอบทั้งหมด</h2>
        <p className="text-xs text-muted-foreground">ชุดสอบของครูทุกคน เลือกเพื่อดูผู้เข้าสอบ ปิด/เปิดใหม่ ขยายเวลา หรือลบ</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9 h-9 text-xs" placeholder="ค้นหาชื่อชุดสอบ…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select aria-label="กรองสถานะ" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {EXAM_STATUSES.map((s) => (
            <option key={s} value={s}>{EXAM_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select aria-label="กรองครูเจ้าของ" className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">ครูทุกคน</option>
          {owners.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {exams === null && !error && <div className="h-20 animate-pulse rounded-xl border border-border/70 bg-card" />}
      {exams && <p className="text-xs text-muted-foreground">แสดง {shown.length} จาก {exams.length} ชุดสอบ</p>}
      {exams && shown.length === 0 && <p className="text-sm text-muted-foreground">ไม่พบชุดสอบ</p>}

      <div className="space-y-2.5">
        {shown.map((e) => (
          <Link key={e.id} href={`/admin/exams/${e.id}`} className="group block">
            <Card className="transition-all hover:border-primary/40 hover:shadow-md">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{e.title || "(ไม่มีชื่อ)"}</p>
                    <span className={`rounded-md px-2 py-0.5 text-2xs font-medium ${STATUS_STYLE[e.status]}`}>
                      {EXAM_STATUS_LABEL[e.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ครู {e.ownerName || "—"} · {nameOf(subjects, e.subjectId) || "—"} · {e.questionCount} ข้อ · {e.durationMin} นาที
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateTime(e.openAtMs)} – {fmtDateTime(e.closeAtMs)}
                  </p>
                  {e.classroomIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">ห้อง: {e.classroomIds.map((id) => nameOf(rooms, id)).join(", ")}</p>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
