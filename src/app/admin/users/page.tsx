"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import {
  Search,
  ArrowLeft,
  KeyRound,
  Ban,
  AlertCircle,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listUsers, type UserRecord } from "@/lib/admin-users";
import { apiPatch, describeApiError } from "@/lib/api-client";
import { getClientFirestore } from "@/lib/firebase-client";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "ผู้ดูแลระบบ",
  TEACHER: "ครูผู้สอน",
  STUDENT: "นักเรียน",
};

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-1">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>กลับหน้าควบคุมระบบ</span>
        </Link>
        <h2 className="text-xl font-bold tracking-tight">รายชื่อผู้ใช้งานทั้งหมด</h2>
        <p className="text-xs text-muted-foreground">จัดการนักเรียน ครูผู้สอน และบทบาทสิทธิ์</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-xs"
            placeholder="ค้นหาตามชื่อ หรืออีเมล…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select aria-label="กรองบทบาท" className={selectClass} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">ทุกบทบาท</option>
          <option value="STUDENT">นักเรียน</option>
          <option value="TEACHER">ครู</option>
          <option value="ADMIN">ผู้ดูแลระบบ</option>
        </select>
        <select aria-label="กรองห้อง" className={selectClass} value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
          <option value="">ทุกห้องเรียน</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3.5 text-xs font-medium text-foreground">
          {notice}
        </div>
      )}

      {users === null && !error && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-border/70 bg-card p-4 animate-pulse" />
          ))}
        </div>
      )}

      {users && (
        <p className="text-xs text-muted-foreground">แสดง {shown.length} จาก {users.length} บัญชีผู้ใช้</p>
      )}

      <div className="space-y-2.5">
        {shown.map((u) => (
          <Card key={u.uid} className={`transition-all hover:border-primary/40 ${u.disabled ? "opacity-60 bg-muted/30" : ""}`}>
            <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <UserIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-sm truncate">{u.name || "(ไม่มีชื่อ)"}</p>
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-2xs font-medium text-secondary-foreground">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                    {u.classroomId && (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                        ห้อง {roomName(u.classroomId)}
                      </span>
                    )}
                    {u.disabled && (
                      <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-2xs font-medium text-destructive">
                        ระงับบัญชี
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>

              {u.role !== "ADMIN" && (
                <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-auto">
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs"
                    disabled={busyUid === u.uid}
                    onClick={() => onReset(u)}
                  >
                    <KeyRound className="size-3" />
                    <span>รีเซ็ตรหัส</span>
                  </Button>
                  <Button
                    variant={u.disabled ? "outline" : "destructive"}
                    size="sm"
                    className="gap-1 text-xs"
                    disabled={busyUid === u.uid}
                    onClick={() => onToggle(u)}
                  >
                    <Ban className="size-3" />
                    <span>{u.disabled ? "เปิดใช้งาน" : "ระงับ"}</span>
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
