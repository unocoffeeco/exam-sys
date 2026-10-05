"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getClientFirestore } from "@/lib/firebase-client";

type Item = { id: string; name: string };
const CODE_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** Simple CRUD for { name } documents (classrooms, subjects). Admin-only via Firestore Rules. */
export function CollectionManager({
  collectionName,
  title,
  codeHint,
  deleteWarning,
}: {
  collectionName: "classrooms" | "subjects";
  title: string;
  codeHint: string;
  deleteWarning: string;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    if (!window.confirm(`ลบ "${item.name}" ใช่หรือไม่?\n${deleteWarning}`)) return;
    try {
      await deleteDoc(doc(getClientFirestore(), collectionName, item.id));
      setItems((list) => (list ?? []).filter((i) => i.id !== item.id));
    } catch {
      setError("ลบไม่สำเร็จ");
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
      {items === null && !error && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {items && items.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>}

      <div className="space-y-2">
        {items?.map((i) => (
          <Card key={i.id}>
            <CardContent className="flex items-center justify-between gap-2 pt-4">
              <div>
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-muted-foreground">รหัส: {i.id}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => onRename(i)}>เปลี่ยนชื่อ</Button>
                <Button variant="destructive" size="sm" onClick={() => onDelete(i)}>ลบ</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
