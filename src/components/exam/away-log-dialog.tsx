"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet } from "@/lib/api-client";
import { formatAwayDuration, type AwayVia } from "@/lib/integrity";

type LogEvent = { via: AwayVia; durationMs: number; reportedAtMs: number };
type Log = { events: LogEvent[]; truncated: boolean };

const VIA_LABEL: Record<AwayVia, string> = { hidden: "สลับแท็บ/ย่อหน้าต่าง/ไปแอปอื่น", blur: "เปลี่ยนหน้าต่างที่ใช้งาน" };
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Mounted only while the dialog is open, so the fetch happens once per opening (1 document read).
function LogBody({ attemptId }: { attemptId: string }) {
  const [log, setLog] = useState<Log | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<Log>(`/api/attempts/${attemptId}/events`)
      .then((d) => {
        if (!cancelled) setLog(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (failed) return <p className="text-sm text-destructive">โหลดบันทึกไม่สำเร็จ</p>;
  if (!log) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (log.events.length === 0) return <p className="text-sm text-muted-foreground">ไม่มีบันทึกการออกจากหน้าสอบ</p>;

  return (
    <div className="space-y-2">
      <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
        {log.events.map((e, i) => (
          <li key={i} className="flex items-start justify-between gap-3 rounded-md border px-2.5 py-1.5">
            <span>
              <span className="font-medium">{formatAwayDuration(e.durationMs)}</span>
              <span className="block text-xs text-muted-foreground">{VIA_LABEL[e.via]}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">กลับมาเมื่อ {fmtTime(e.reportedAtMs)}</span>
          </li>
        ))}
      </ul>
      {log.truncated && (
        <p className="text-xs text-muted-foreground">แสดงเฉพาะรายการแรก ๆ ส่วนจำนวนครั้งรวมที่แสดงในรายงานยังนับครบ</p>
      )}
    </div>
  );
}

export function AwayLogDialog({
  attemptId,
  studentName,
  onClose,
}: {
  attemptId: string | null;
  studentName: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={attemptId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>การออกจากหน้าสอบ: {studentName}</DialogTitle>
          <DialogDescription>
            เวลาเป็นเวลาที่เซิร์ฟเวอร์ได้รับรายงาน (ประมาณช่วงที่กลับมา) ระยะเวลาเป็นค่าที่เบราว์เซอร์ของนักเรียนวัดได้
            ใช้ประกอบการพิจารณา ไม่ใช่หลักฐานชี้ขาด
          </DialogDescription>
        </DialogHeader>
        {attemptId && <LogBody key={attemptId} attemptId={attemptId} />}
      </DialogContent>
    </Dialog>
  );
}
