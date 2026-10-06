"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { describeAdminError } from "@/lib/admin-client";
import { ApiError, apiDelete, apiPost } from "@/lib/api-client";
import { getClientFirestore } from "@/lib/firebase-client";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Item = { id: string; name: string };
const CODE_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

const USAGE_LABEL: Record<string, string> = {
  users: "ผู้ใช้",
  exams: "ชุดสอบ",
  questions: "ข้อสอบ",
};

/**
 * CRUD for { name } documents (classrooms, subjects). Create/rename use Firestore directly (Rules: admin only);
 * delete goes through the API so usage is checked first. Classrooms can also move all their students at once.
 */
export function CollectionManager({
  collectionName,
  title,
  codeHint,
  deleteWarning,
  moveStudents = false,
}: {
  collectionName: "classrooms" | "subjects";
  title: string;
  codeHint: string;
  deleteWarning: string;
  moveStudents?: boolean;
}) {
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(getClientFirestore(), collectionName))
      .then((snap) => {
        if (cancelled) return;
        setItems(
          snap.docs
            .map((d) => ({ id: d.id, name: String(d.get("name") ?? d.id) }))
            .sort((a, b) => a.name.localeCompare(b.name, "th")),
        );
      })
      .catch(() => {
        if (!cancelled) setError("โหลดข้อมูลไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [collectionName]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    const c = code.trim().toLowerCase();
    if (!n) return setError("กรุณากรอกชื่อ");
    if (!CODE_RE.test(c)) return setError("รหัสต้องเป็นตัวพิมพ์เล็ก ตัวเลข หรือ - เท่านั้น (เช่น m4-1)");
    if (items?.some((i) => i.id === c)) return setError("รหัสนี้ถูกใช้แล้ว");
    try {
      await setDoc(doc(getClientFirestore(), collectionName, c), { name: n });
      setItems((list) => [...(list ?? []), { id: c, name: n }].sort((a, b) => a.name.localeCompare(b.name, "th")));
      setName("");
      setCode("");
    } catch {
      setError("บันทึกไม่สำเร็จ");
    }
  }

  async function onRename(item: Item) {
    const n = window.prompt("ชื่อใหม่", item.name)?.trim();
    if (!n || n === item.name) return;
    try {
      await updateDoc(doc(getClientFirestore(), collectionName, item.id), { name: n });
      setItems((list) => (list ?? []).map((i) => (i.id === item.id ? { ...i, name: n } : i)));
    } catch {
      setError("แก้ไขไม่สำเร็จ");
    }
  }

  async function onDelete(item: Item) {
    setError(null);
    setNotice(null);
    if (!await confirm(`ลบ "${item.name}" ใช่หรือไม่?\n${deleteWarning}`)) return;
    const base = `/api/admin/catalog/${collectionName}/${encodeURIComponent(item.id)}`;
    try {
      try {
        await apiDelete(base);
      } catch (err) {
        // Still referenced: show how much, and only delete if the admin insists.
        if (!(err instanceof ApiError) || err.code !== "IN_USE") throw err;
        const usage = (err.data?.usage ?? {}) as Record<string, number>;
        const detail = Object.entries(usage)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${USAGE_LABEL[k] ?? k} ${n} รายการ`)
          .join(", ");
        if (!await confirm(`"${item.name}" ยังถูกใช้งานอยู่: ${detail}\nลบต่อไปหรือไม่?`)) return;
        await apiDelete(`${base}?force=1`);
      }
      setItems((list) => (list ?? []).filter((i) => i.id !== item.id));
    } catch (err) {
      setError(describeAdminError(err));
    }
  }

  async function onMoveStudents(item: Item) {
    const target = items?.find((i) => i.id === moveTo);
    if (!target) return setError("กรุณาเลือกห้องปลายทาง");
    if (!await confirm(`ย้ายนักเรียนทั้งหมดจาก "${item.name}" ไป "${target.name}"?\n(นักเรียนต้องเข้าสู่ระบบใหม่)`)) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const r = await apiPost<{ moved: number; failed: number; remaining: number }>(
        `/api/admin/classrooms/${encodeURIComponent(item.id)}/move-students`,
        { toClassroomId: target.id },
      );
      const rest = r.remaining > 0 ? ` (เหลืออีก ${r.remaining} คน กดย้ายอีกครั้ง)` : "";
      const bad = r.failed > 0 ? ` ไม่สำเร็จ ${r.failed} คน` : "";
      setNotice(`ย้ายนักเรียน ${r.moved} คนไป ${target.name} แล้ว${bad}${rest}`);
      if (r.remaining === 0 && r.failed === 0) setMoveFrom(null);
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1">
              <label htmlFor="item-name" className="text-sm font-medium">ชื่อ</label>
              <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="w-40 space-y-1">
              <label htmlFor="item-code" className="text-sm font-medium">รหัส ({codeHint})</label>
              <Input id="item-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button type="submit">+ เพิ่ม</Button>
          </form>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm">{notice}</p>}
      {items === null && !error && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {items && items.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>}

      <div className="space-y-2">
        {items?.map((i) => (
          <Card key={i.id}>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">รหัส: {i.id}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {moveStudents && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMoveFrom((cur) => (cur === i.id ? null : i.id));
                        setMoveTo("");
                      }}
                    >
                      ย้ายนักเรียน
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => onRename(i)}>เปลี่ยนชื่อ</Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(i)}>ลบ</Button>
                </div>
              </div>
              {moveStudents && moveFrom === i.id && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <span className="text-xs">ย้ายนักเรียนทั้งห้องไป</span>
                  <select
                    aria-label="ห้องปลายทาง"
                    className="h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs"
                    value={moveTo}
                    onChange={(e) => setMoveTo(e.target.value)}
                  >
                    <option value="">— เลือกห้อง —</option>
                    {items.filter((o) => o.id !== i.id).map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <Button size="sm" disabled={busy || !moveTo} onClick={() => void onMoveStudents(i)}>
                    {busy ? "กำลังย้าย…" : "ยืนยันการย้าย"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
