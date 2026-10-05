"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { AwayLogDialog } from "@/components/exam/away-log-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  describeAdminError,
  fmtDateTime,
  fromLocalInput,
  loadClassrooms,
  loadSubjects,
  nameOf,
  toLocalInput,
  type AdminExam,
  type NamedItem,
} from "@/lib/admin-client";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { formatAwayDuration, integrityLevel } from "@/lib/integrity";
import { ROW_STATUS_LABEL, summarize } from "@/lib/report";
import { loadExamResultsAsAdmin, type ResultRow } from "@/lib/results";
import { EXAM_STATUS_LABEL } from "@/lib/schemas";

async function fetchRows(examId: string): Promise<ResultRow[]> {
  let loaded = await loadExamResultsAsAdmin(examId);
  if (loaded.expiredCount > 0) {
    // Same lazy grading the teacher's report does for students who closed the browser.
    await apiPost(`/api/exams/${examId}/finalize`);
    loaded = await loadExamResultsAsAdmin(examId);
  }
  return loaded.rows;
}

export default function AdminExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<AdminExam | null>(null);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [rooms, setRooms] = useState<NamedItem[]>([]);
  const [subjects, setSubjects] = useState<NamedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logRow, setLogRow] = useState<ResultRow | null>(null);
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");

  const applyExam = useCallback((e: AdminExam) => {
    setExam(e);
    setOpenAt(toLocalInput(e.openAtMs));
    setCloseAt(toLocalInput(e.closeAtMs));
  }, []);

  const fetchExam = useCallback(async () => (await apiGet<{ exam: AdminExam }>(`/api/admin/exams/${id}`)).exam, [id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchExam(), fetchRows(id), loadClassrooms(), loadSubjects()])
      .then(([e, r, rm, sb]) => {
        if (cancelled) return;
        applyExam(e);
        setRows(r);
        setRooms(rm);
        setSubjects(sb);
      })
      .catch(() => {
        if (!cancelled) setError("โหลดข้อมูลชุดสอบไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [id, fetchExam, applyExam]);

  const summary = useMemo(() => summarize(rows ?? []), [rows]);

  async function run(action: () => Promise<void>, okMsg?: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
      if (okMsg) setNotice(okMsg);
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setBusy(false);
    }
  }

  const patchExam = (body: object, okMsg: string) =>
    run(async () => {
      await apiPatch(`/api/admin/exams/${id}`, body);
      applyExam(await fetchExam());
    }, okMsg);

  const onClose = () => {
    if (!window.confirm("ปิดการสอบนี้ทันที? นักเรียนที่ยังไม่เริ่มจะเข้าสอบไม่ได้")) return;
    void patchExam({ status: "CLOSED" }, "ปิดการสอบแล้ว");
  };
  const onReopen = () => {
    const closeAtMs = fromLocalInput(closeAt);
    if (!closeAtMs) return setError("กรุณาระบุเวลาปิดใหม่");
    if (!window.confirm("เปิดการสอบนี้อีกครั้งตามเวลาปิดที่ระบุ?")) return;
    void patchExam({ status: "PUBLISHED", closeAtMs }, "เปิดการสอบอีกครั้งแล้ว");
  };
  const onSaveWindow = () => {
    const openAtMs = fromLocalInput(openAt);
    const closeAtMs = fromLocalInput(closeAt);
    void patchExam(
      { ...(openAtMs ? { openAtMs } : {}), ...(closeAtMs ? { closeAtMs } : {}) },
      "บันทึกช่วงเวลาแล้ว (ผู้ที่เริ่มสอบไปแล้วใช้เวลาเดิม)",
    );
  };

  const onDelete = () => {
    if (!exam) return;
    const n = rows?.length ?? 0;
    if (!window.confirm(`ลบชุดสอบ "${exam.title}" ถาวร?\nรวมถึงผลสอบของนักเรียน ${n} คน ไม่สามารถกู้คืนได้`)) return;
    void run(async () => {
      await apiDelete(`/api/admin/exams/${id}`);
      router.replace("/admin/exams");
    });
  };

  const onResetAttempt = (r: ResultRow) => {
    if (!window.confirm(`รีเซ็ตการสอบของ ${r.studentName}?\nคำตอบและคะแนนจะถูกลบ และนักเรียนเริ่มสอบใหม่ได้ (ถ้าการสอบยังเปิดอยู่)`)) return;
    void run(async () => {
      await apiDelete(`/api/admin/attempts/${r.attemptId}`);
      setRows((list) => (list ?? []).filter((x) => x.attemptId !== r.attemptId));
    }, `รีเซ็ตการสอบของ ${r.studentName} แล้ว`);
  };

  const canEditWindow = exam && exam.status !== "DRAFT";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-1">
        <Link href="/admin/exams" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-3.5" />
          <span>กลับรายการชุดสอบ</span>
        </Link>
        <h2 className="text-xl font-bold tracking-tight">{exam?.title ?? "ชุดสอบ"}</h2>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && <div className="rounded-xl border border-primary/20 bg-primary/10 p-3.5 text-xs font-medium">{notice}</div>}

      {exam && (
        <Card>
          <CardContent className="space-y-4 pt-4">
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted-foreground">สถานะ: </dt><dd className="inline font-medium">{EXAM_STATUS_LABEL[exam.status]}</dd></div>
              <div><dt className="inline text-muted-foreground">ครูเจ้าของ: </dt><dd className="inline">{exam.ownerName || "—"}</dd></div>
              <div><dt className="inline text-muted-foreground">วิชา: </dt><dd className="inline">{nameOf(subjects, exam.subjectId)}</dd></div>
              <div><dt className="inline text-muted-foreground">จำนวน: </dt><dd className="inline">{exam.questionCount} ข้อ · {exam.totalPoints ?? "—"} คะแนน · {exam.durationMin} นาที</dd></div>
              <div className="sm:col-span-2"><dt className="inline text-muted-foreground">ห้องที่สอบได้: </dt><dd className="inline">{exam.classroomIds.map((c) => nameOf(rooms, c)).join(", ") || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="inline text-muted-foreground">ช่วงเวลา: </dt><dd className="inline">{fmtDateTime(exam.openAtMs)} – {fmtDateTime(exam.closeAtMs)}</dd></div>
            </dl>

            {canEditWindow ? (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="openAt" className="text-xs font-medium">เวลาเปิด</label>
                    <Input id="openAt" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="closeAt" className="text-xs font-medium">เวลาปิด</label>
                    <Input id="closeAt" type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={onSaveWindow}>บันทึกช่วงเวลา</Button>
                  {exam.status === "PUBLISHED" && (
                    <Button size="sm" variant="destructive" disabled={busy} onClick={onClose}>ปิดการสอบทันที</Button>
                  )}
                  {exam.status === "CLOSED" && (
                    <Button size="sm" disabled={busy} onClick={onReopen}>เปิดการสอบอีกครั้ง</Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">ชุดสอบนี้ยังเป็นฉบับร่าง ครูเจ้าของเป็นผู้แก้ไขและเผยแพร่</p>
            )}
          </CardContent>
        </Card>
      )}

      {rows && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            ["ผู้เข้าสอบ", summary.total],
            ["กำลังสอบ", summary.inProgress],
            ["รอตรวจอัตนัย", summary.pending],
            ["คะแนนเฉลี่ย", summary.avg ?? "—"],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
              <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีนักเรียนเข้าสอบ</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>นักเรียน</TableHead>
                <TableHead>ห้อง</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">คะแนน</TableHead>
                <TableHead>ออกจากหน้าสอบ</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const level = integrityLevel(r.awayCount, r.awayTotalMs);
                return (
                  <TableRow key={r.attemptId}>
                    <TableCell className="font-medium">{r.studentName}</TableCell>
                    <TableCell>{nameOf(rooms, r.classroomId)}</TableCell>
                    <TableCell>{ROW_STATUS_LABEL[r.status]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.score != null && r.maxScore != null ? `${r.score}/${r.maxScore}` : "—"}
                    </TableCell>
                    <TableCell>
                      {r.awayCount > 0 ? (
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1 text-xs underline ${level === "HIGH" ? "text-destructive" : ""}`}
                          onClick={() => setLogRow(r)}
                        >
                          {level === "HIGH" && <ShieldAlert className="size-3" />}
                          {r.awayCount} ครั้ง · {formatAwayDuration(r.awayTotalMs)}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={busy} onClick={() => onResetAttempt(r)}>
                        <RotateCcw className="size-3" />
                        <span>รีเซ็ต</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {exam && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-muted-foreground">ลบชุดสอบพร้อมผลสอบทั้งหมดถาวร</p>
          <Button variant="destructive" size="sm" className="gap-1 text-xs" disabled={busy} onClick={onDelete}>
            <Trash2 className="size-3" />
            <span>ลบชุดสอบ</span>
          </Button>
        </div>
      )}

      <AwayLogDialog attemptId={logRow?.attemptId ?? null} studentName={logRow?.studentName ?? ""} onClose={() => setLogRow(null)} />
    </div>
  );
}
