"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listUsers, type UserRecord } from "@/lib/admin-users";
import { apiPatch, describeApiError } from "@/lib/api-client";
import { getClientFirestore } from "@/lib/firebase-client";

const ROLE_LABEL = { ADMIN: "ผู้ดูแลระบบ", TEACHER: "ครู", STUDENT: "นักเรียน" } as const;
const selectClass = "rounded-lg border border-input bg-background px-2 py-1.5 text-sm";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsers(), getDocs(collection(getClientFirestore(), "classrooms"))])
      .then(([u, r]) => {
        if (cancelled) return;
        setUsers(u);
        setRooms(r.docs.map((d) => ({ id: d.id, name: String(d.get("name") ?? d.id) })).sort((a, b) => a.name.localeCompare(b.name, "th")));
      })
      .catch(() => {
        if (!cancelled) setError("โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!roomFilter || u.classroomId === roomFilter) &&
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  }, [users, search, roleFilter, roomFilter]);

  async function patch(u: UserRecord, body: object, apply: (u: UserRecord) => UserRecord, okMsg?: (r: { password?: string }) => string) {
    setError(null);
    setNotice(null);
    setBusyUid(u.uid);
    try {
      const r = await apiPatch<{ password?: string }>(`/api/admin/users/${u.uid}`, body);
      setUsers((list) => (list ?? []).map((x) => (x.uid === u.uid ? apply(x) : x)));
      if (okMsg) setNotice(okMsg(r));
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusyUid(null);
    }
  }

  const onMove = (u: UserRecord, classroomId: string) => {
    if (!classroomId || classroomId === u.classroomId) return;
    if (!window.confirm(`ย้าย ${u.name} ไป ${roomName(classroomId)}? (ผู้ใช้จะต้องเข้าสู่ระบบใหม่)`)) return;
    void patch(u, { classroomId }, (x) => ({ ...x, classroomId }));
  };
  const onReset = (u: UserRecord) => {
    if (!window.confirm(`รีเซ็ตรหัสผ่านของ ${u.name}?`)) return;
    void patch(u, { resetPassword: true }, (x) => x, (r) => `รหัสผ่านใหม่ของ ${u.name}: ${r.password} (แสดงครั้งเดียว กรุณาจดไว้)`);
  };
  const onToggle = (u: UserRecord) => {
    const disabled = !u.disabled;
    if (!window.confirm(`${disabled ? "ระงับ" : "เปิดใช้งาน"}บัญชีของ ${u.name}?`)) return;
    void patch(u, { disabled }, (x) => ({ ...x, disabled }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h2 className="text-xl font-semibold">ผู้ใช้</h2>

      <div className="flex flex-wrap gap-2">
        <Input className="w-56" placeholder="ค้นหาชื่อหรืออีเมล" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="กรองบทบาท" className={selectClass} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">ทุกบทบาท</option>
          <option value="STUDENT">นักเรียน</option>
          <option value="TEACHER">ครู</option>
          <option value="ADMIN">ผู้ดูแลระบบ</option>
        </select>
        <select aria-label="กรองห้อง" className={selectClass} value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
          <option value="">ทุกห้อง</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-lg border bg-muted p-3 text-sm font-medium">{notice}</p>}
      {users === null && !error && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {users && <p className="text-xs text-muted-foreground">{shown.length} จาก {users.length} บัญชี</p>}

      <div className="space-y-2">
        {shown.map((u) => (
          <Card key={u.uid} className={u.disabled ? "opacity-60" : ""}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="min-w-0">
                <p className="font-medium">
                  {u.name || "(ไม่มีชื่อ)"}{" "}
                  <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{ROLE_LABEL[u.role] ?? u.role}</span>
                  {u.disabled && <span className="ml-1 text-xs text-destructive">ระงับ</span>}
                </p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              {u.role !== "ADMIN" && (
                <div className="flex flex-wrap items-center gap-1">
                  {u.role === "STUDENT" && (
                    <select
                      aria-label={`ห้องของ ${u.name}`}
                      className={selectClass}
                      value={u.classroomId}
                      disabled={busyUid === u.uid}
                      onChange={(e) => onMove(u, e.target.value)}
                    >
                      {!rooms.some((r) => r.id === u.classroomId) && <option value={u.classroomId}>{u.classroomId || "— ไม่มีห้อง —"}</option>}
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}
                  <Button variant="outline" size="sm" disabled={busyUid === u.uid} onClick={() => onReset(u)}>รีเซ็ตรหัสผ่าน</Button>
                  <Button variant={u.disabled ? "outline" : "destructive"} size="sm" disabled={busyUid === u.uid} onClick={() => onToggle(u)}>
                    {u.disabled ? "เปิดใช้งาน" : "ระงับ"}
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
