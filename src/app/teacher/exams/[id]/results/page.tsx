"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AwayLogDialog } from "@/components/exam/away-log-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiPost } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { getMyExam } from "@/lib/exams";
import { formatAwayDuration, integrityLevel } from "@/lib/integrity";
import { ROW_STATUS_LABEL, summarize, toCsv } from "@/lib/report";
import { loadExamResults, type ResultRow } from "@/lib/results";
import type { ExamDoc } from "@/lib/schemas";

type Data = { exam: ExamDoc; rows: ResultRow[] };

export default function ExamResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logRow, setLogRow] = useState<ResultRow | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyExam(id, user.uid)
      .then(async (exam) => {
        if (!exam) throw new Error("NOT_FOUND");
        let loaded = await loadExamResults(id, user.uid);
        if (loaded.expiredCount > 0) {
          // lazy grading: grade students who ran out of time without pressing submit
          await apiPost(`/api/exams/${id}/finalize`);
          loaded = await loadExamResults(id, user.uid);
        }
        return { exam, rows: loaded.rows };
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error && e.message === "NOT_FOUND" ? "ไม่พบชุดสอบ" : "โหลดผลสอบไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const summary = useMemo(() => summarize(data?.rows ?? []), [data]);
  const highAway = useMemo(
    () => (data?.rows ?? []).filter((r) => integrityLevel(r.awayCount, r.awayTotalMs) === "HIGH").length,
    [data],
  );

  function exportCsv() {
    if (!data) return;
    const csv = toCsv([
      ["ชื่อ-สกุล", "ห้อง", "สถานะ", "คะแนนที่ได้", "คะแนนเต็ม", "ออกจากหน้าสอบ (ครั้ง)", "รวมเวลาที่ออก (วินาที)"],
      ...data.rows.map((r) => [
        r.studentName,
        r.classroomId,
        ROW_STATUS_LABEL[r.status],
        r.score,
        r.maxScore,
        r.awayCount,
        Math.round(r.awayTotalMs / 1000),
      ]),
    ]);
    // BOM so Excel opens Thai text correctly
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ผลสอบ-${data.exam.title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">กำลังโหลดผลสอบ…</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">ผลสอบ: {data.exam.title}</h2>
          <Link href="/teacher/exams" className="text-sm text-muted-foreground underline">← กลับ</Link>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={data.rows.length === 0}>ดาวน์โหลด CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["ผู้เข้าสอบ", summary.total],
          ["ตรวจแล้ว", summary.graded],
          ["รอตรวจอัตนัย", summary.pending],
          ["กำลังสอบ", summary.inProgress],
          ["คะแนนเฉลี่ย", summary.avg ?? "—"],
          ["สูงสุด", summary.max ?? "—"],
          ["ต่ำสุด", summary.min ?? "—"],
        ["ออกจากหน้าสอบมาก", highAway],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีนักเรียนเข้าสอบ</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อ-สกุล</TableHead>
                  <TableHead>ห้อง</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">คะแนน</TableHead>
                  <TableHead>ออกจากหน้าสอบ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.attemptId}>
                    <TableCell>{r.studentName}</TableCell>
                    <TableCell>{r.classroomId}</TableCell>
                    <TableCell>{ROW_STATUS_LABEL[r.status]}</TableCell>
                    <TableCell className="text-right">
                      {r.score != null ? `${r.score}${r.status === "PENDING_MANUAL" ? "*" : ""}/${r.maxScore}` : "—"}
                    </TableCell>
                    <TableCell>
                      {r.awayCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setLogRow(r)}
                          className={`rounded-md border px-2 py-0.5 text-xs underline-offset-2 hover:underline ${
                            integrityLevel(r.awayCount, r.awayTotalMs) === "HIGH"
                              ? "border-destructive/50 bg-destructive/10 text-destructive"
                              : "border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                          }`}
                        >
                          {r.awayCount} ครั้ง · {formatAwayDuration(r.awayTotalMs)}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(r.status === "PENDING_MANUAL" || r.status === "GRADED") && (
                        <Link
                          href={`/teacher/exams/${id}/grade/${r.attemptId}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          ตรวจ/ดู
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">* คะแนนบางส่วน ยังไม่รวมข้ออัตนัยที่ยังไม่ตรวจ</p>
        </CardContent>
      </Card>

      <AwayLogDialog
        attemptId={logRow?.attemptId ?? null}
        studentName={logRow?.studentName ?? ""}
        onClose={() => setLogRow(null)}
      />
    </div>
  );
}
