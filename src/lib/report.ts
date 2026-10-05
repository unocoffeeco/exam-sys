// Pure helpers for the teacher's result report. No Firebase imports.

export type RowStatus = "IN_PROGRESS" | "EXPIRED" | "PENDING_MANUAL" | "GRADED";

export const ROW_STATUS_LABEL: Record<RowStatus, string> = {
  IN_PROGRESS: "กำลังสอบ",
  EXPIRED: "หมดเวลา (รอประมวลผล)",
  PENDING_MANUAL: "รอตรวจอัตนัย",
  GRADED: "ตรวจแล้ว",
};

export type SummaryRow = { status: RowStatus; score: number | null };

export function summarize(rows: SummaryRow[]) {
  const graded = rows.filter((r) => r.status === "GRADED" && r.score != null).map((r) => r.score as number);
  const sum = graded.reduce((a, b) => a + b, 0);
  return {
    total: rows.length,
    inProgress: rows.filter((r) => r.status === "IN_PROGRESS" || r.status === "EXPIRED").length,
    pending: rows.filter((r) => r.status === "PENDING_MANUAL").length,
    graded: graded.length,
    avg: graded.length ? Math.round((sum / graded.length) * 100) / 100 : null,
    max: graded.length ? Math.max(...graded) : null,
    min: graded.length ? Math.min(...graded) : null,
  };
}

/** CSV for Excel: quotes cells, and neutralises spreadsheet formulas (=, +, -, @). */
export function toCsv(rows: Array<Array<string | number | null>>): string {
  const cell = (v: string | number | null): string => {
    if (v == null) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
