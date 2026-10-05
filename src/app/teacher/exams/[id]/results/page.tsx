"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Award,
  Download,
  ArrowLeft,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
} from "lucide-react";
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
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ผลสอบ-${data.exam.title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">กำลังโหลดผลสอบ…</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/teacher/exams"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>กลับหน้ารายการชุดสอบ</span>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight">รายงานผลสอบ: {data.exam.title}</h2>
          <p className="text-xs text-muted-foreground">สรุปผลคะแนน สถานะการตรวจ และรายงานความซื่อสัตย์</p>
        </div>
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={data.rows.length === 0}
          className="gap-2 shadow-2xs self-start sm:self-auto"
        >
          <Download className="size-4" />
          <span>ดาวน์โหลด CSV</span>
        </Button>
      </div>

      {/* Analytics Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">ผู้เข้าสอบทั้งหมด</span>
              <Users className="size-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{summary.total}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">ตรวจเรียบร้อย</span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {summary.graded}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">รอตรวจอัตนัย</span>
              <Clock className="size-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {summary.pending}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">สลับหน้าจอผิดปกติ</span>
              <ShieldAlert className="size-4 text-destructive" />
            </div>
            <p className="text-2xl font-bold tabular-nums text-destructive">
              {highAway}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">คะแนนเฉลี่ย</span>
              <Award className="size-4 text-primary" />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {summary.avg != null ? summary.avg : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">คะแนนสูงสุด</span>
              <TrendingUp className="size-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {summary.max != null ? summary.max : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">คะแนนต่ำสุด</span>
              <TrendingDown className="size-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {summary.min != null ? summary.min : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-2xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs">กำลังทำข้อสอบ</span>
              <Clock className="size-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{summary.inProgress}</p>
          </CardContent>
        </Card>
      </div>

      {/* Results Table Card */}
      <Card className="border-border/80 shadow-xs">
        <CardContent className="overflow-x-auto p-0">
          {data.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              ยังไม่มีนักเรียนเข้าสอบในชุดข้อสอบนี้
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold">ชื่อ-สกุล</TableHead>
                  <TableHead className="font-semibold">ห้อง</TableHead>
                  <TableHead className="font-semibold">สถานะ</TableHead>
                  <TableHead className="text-right font-semibold">คะแนน</TableHead>
                  <TableHead className="font-semibold">การสลับหน้าจอ</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => {
                  const level = integrityLevel(r.awayCount, r.awayTotalMs);
                  return (
                    <TableRow key={r.attemptId} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{r.studentName}</TableCell>
                      <TableCell className="text-muted-foreground">{r.classroomId}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {ROW_STATUS_LABEL[r.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {r.score != null ? (
                          <span>
                            {r.score}
                            {r.status === "PENDING_MANUAL" ? "*" : ""}
                            <span className="text-xs font-normal text-muted-foreground">/{r.maxScore}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-normal">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.awayCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setLogRow(r)}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                              level === "HIGH"
                                ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100 hover:bg-amber-500/20"
                            }`}
                          >
                            <AlertTriangle className="size-3" />
                            <span>{r.awayCount} ครั้ง ({formatAwayDuration(r.awayTotalMs)})</span>
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">ปกติ (0 ครั้ง)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(r.status === "PENDING_MANUAL" || r.status === "GRADED") && (
                          <Link
                            href={`/teacher/exams/${id}/grade/${r.attemptId}`}
                            className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}
                          >
                            {r.status === "PENDING_MANUAL" ? "ตรวจข้อสอบ" : "ดูผล"}
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground text-right">* หมายถึงคะแนนบางส่วน ยังไม่รวมข้ออัตนัยที่ยังไม่ได้ตรวจ</p>

      <AwayLogDialog
        attemptId={logRow?.attemptId ?? null}
        studentName={logRow?.studentName ?? ""}
        onClose={() => setLogRow(null)}
      />
    </div>
  );
}
