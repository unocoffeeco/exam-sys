"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiPost, describeApiError } from "@/lib/api-client";
import { toCsv } from "@/lib/report";
import { IMPORT_TEMPLATE, mapRecords, parseCsv, userRowSchema } from "@/lib/user-import";

type RowResult = { row: number; email: string; status: "created" | "updated" | "error"; message?: string; password?: string };

const STATUS_LABEL = { created: "สร้างใหม่", updated: "อัปเดต", error: "ผิดพลาด" } as const;

function download(filename: string, text: string) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportUsersPage() {
  const [text, setText] = useState("");
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const { rows, missing } = mapRecords(parseCsv(text));
    const checked = rows.map((r, i) => {
      const p = userRowSchema.safeParse(r);
      return { n: i + 1, row: r, error: p.success ? null : (p.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง") };
    });
    return { rows, missing, checked, bad: checked.filter((c) => c.error).length };
  }, [text]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
    setResults(null);
  }

  async function onImport() {
    if (!preview || preview.missing.length > 0 || preview.rows.length === 0) return;
    if (!window.confirm(`นำเข้า ${preview.rows.length} รายการ ใช่หรือไม่?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ results: RowResult[] }>("/api/admin/users/import", { rows: preview.rows });
      setResults(r.results);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  function exportCredentials() {
    if (!results) return;
    const created = results.filter((r) => r.status === "created");
    download("รหัสผ่านที่สร้างใหม่.csv", toCsv([["อีเมล", "รหัสผ่าน"], ...created.map((r) => [r.email, r.password ?? ""])]));
  }

  const createdCount = results?.filter((r) => r.status === "created").length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">นำเข้าผู้ใช้จาก CSV</h2>
        <Link href="/admin" className="text-sm text-muted-foreground underline">← กลับ</Link>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4 text-sm">
          <p>
            คอลัมน์: <b>ชื่อ-สกุล, อีเมล</b> (จำเป็น), บทบาท (นักเรียน/ครู ถ้าไม่ใส่ถือเป็นนักเรียน), ห้อง (จำเป็นสำหรับนักเรียน ต้องสร้างห้องก่อน), รหัสผ่าน (ถ้าเว้นว่าง ระบบสร้างให้)
          </p>
          <Button variant="outline" size="sm" onClick={() => download("แม่แบบนำเข้าผู้ใช้.csv", IMPORT_TEMPLATE)}>ดาวน์โหลดแม่แบบ</Button>
          <div className="space-y-2">
            <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} aria-label="เลือกไฟล์ CSV" />
            <textarea
              rows={8}
              className="w-full rounded-lg border border-input bg-background p-2 font-mono text-xs"
              placeholder="หรือวางข้อมูล CSV ที่นี่"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResults(null);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {preview?.missing.length ? (
        <p className="text-sm text-destructive">ไม่พบคอลัมน์ที่จำเป็น: {preview.missing.join(", ")}</p>
      ) : null}

      {preview && preview.missing.length === 0 && !results && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm">
              พบ {preview.rows.length} แถว {preview.bad > 0 && <span className="text-destructive">· มีปัญหา {preview.bad} แถว (แถวที่มีปัญหาจะถูกข้ามและแจ้งหลังนำเข้า)</span>}
            </p>
            <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
              {preview.checked.slice(0, 200).map((c) => (
                <li key={c.n} className={c.error ? "text-destructive" : "text-muted-foreground"}>
                  {c.n}. {c.row.name} · {c.row.email} · {c.row.role === "STUDENT" ? "นักเรียน" : c.row.role === "TEACHER" ? "ครู" : c.row.role} {c.row.classroom && `· ${c.row.classroom}`}
                  {c.error && ` ← ${c.error}`}
                </li>
              ))}
            </ul>
            <Button onClick={onImport} disabled={busy || preview.rows.length === 0}>{busy ? "กำลังนำเข้า…" : "นำเข้า"}</Button>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {results && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm">
              สร้างใหม่ {createdCount} · อัปเดต {results.filter((r) => r.status === "updated").length} · ผิดพลาด{" "}
              {results.filter((r) => r.status === "error").length}
            </p>
            {createdCount > 0 && (
              <div className="space-y-1">
                <Button size="sm" onClick={exportCredentials}>ดาวน์โหลดรหัสผ่านที่สร้างใหม่ (CSV)</Button>
                <p className="text-xs text-muted-foreground">รหัสผ่านแสดงครั้งเดียว ไม่สามารถดูย้อนหลังได้ (รีเซ็ตได้ที่หน้าผู้ใช้) เก็บไฟล์ไว้ในที่ปลอดภัย</p>
              </div>
            )}
            <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
              {results.map((r) => (
                <li key={r.row} className={r.status === "error" ? "text-destructive" : ""}>
                  {r.row}. {r.email} — {STATUS_LABEL[r.status]}
                  {r.message && `: ${r.message}`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
