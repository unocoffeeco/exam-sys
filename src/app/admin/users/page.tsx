"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ArrowLeft,
  KeyRound,
  Ban,
  AlertCircle,
  User as UserIcon,
  UserPlus,
  Pencil,
  Trash2,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { describeAdminError, loadClassrooms, selectClass, type NamedItem } from "@/lib/admin-client";
import { listUsers, type UserRecord } from "@/lib/admin-users";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Role = UserRecord["role"];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "ผู้ดูแลระบบ",
  TEACHER: "ครูผู้สอน",
  STUDENT: "นักเรียน",
};

/** Form for adding one account. The generated password is shown once, like the CSV import. */
function CreateUserCard({
  rooms,
  onCreated,
  onError,
}: {
  rooms: NamedItem[];
  onCreated: (u: UserRecord, password?: string) => void;
  onError: (msg: string) => void;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("STUDENT");
  const [classroomId, setClassroomId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "ADMIN" && !await confirm("สร้างบัญชีผู้ดูแลระบบ? ผู้ดูแลระบบจัดการข้อมูลทั้งหมดได้")) return;
    setBusy(true);
    try {
      const r = await apiPost<{ uid: string; password?: string }>("/api/admin/users", {
        name,
        email,
        role,
        ...(role === "STUDENT" ? { classroomId } : {}),
        ...(password.trim() ? { password } : {}),
      });
      onCreated(
        {
          uid: r.uid,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          classroomId: role === "STUDENT" ? classroomId : "",
          disabled: false,
        },
        r.password,
      );
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      onError(describeAdminError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="new-name" className="text-xs font-medium">ชื่อ-สกุล</label>
            <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label htmlFor="new-email" className="text-xs font-medium">อีเมล</label>
            <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label htmlFor="new-role" className="text-xs font-medium">บทบาท</label>
            <select id="new-role" className={`${selectClass} w-full`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="STUDENT">นักเรียน</option>
              <option value="TEACHER">ครูผู้สอน</option>
              <option value="ADMIN">ผู้ดูแลระบบ</option>
            </select>
          </div>
          {role === "STUDENT" ? (
            <div className="space-y-1">
              <label htmlFor="new-room" className="text-xs font-medium">ห้องเรียน</label>
              <select id="new-room" className={`${selectClass} w-full`} value={classroomId} onChange={(e) => setClassroomId(e.target.value)} required>
                <option value="">— เลือกห้อง —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div />
          )}
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="new-pass" className="text-xs font-medium">รหัสผ่าน (เว้นว่างเพื่อให้ระบบสร้างให้)</label>
            <Input id="new-pass" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? "กำลังสร้าง…" : "สร้างบัญชี"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Edit name / email / role and the dangerous actions (delete, hand content to another teacher). */
function EditPanel({
  user,
  rooms,
  teachers,
  busy,
  onSave,
  onDelete,
  onTransfer,
}: {
  user: UserRecord;
  rooms: NamedItem[];
  teachers: UserRecord[];
  busy: boolean;
  onSave: (body: { name?: string; email?: string; role?: Role; classroomId?: string }) => void;
  onDelete: () => void;
  onTransfer: (toUid: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [classroomId, setClassroomId] = useState(user.classroomId);
  const [toUid, setToUid] = useState("");

  function save(e: React.FormEvent) {
    e.preventDefault();
    const body: { name?: string; email?: string; role?: Role; classroomId?: string } = {};
    if (name.trim() && name.trim() !== user.name) body.name = name.trim();
    if (email.trim() && email.trim().toLowerCase() !== user.email) body.email = email.trim();
    if (role !== user.role) body.role = role;
    if (role === "STUDENT" && classroomId && classroomId !== user.classroomId) body.classroomId = classroomId;
    if (Object.keys(body).length === 0) return;
    onSave(body);
  }

  return (
    <div className="space-y-4 border-t border-border/70 bg-muted/20 p-4">
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor={`n-${user.uid}`}>ชื่อ-สกุล</label>
          <Input id={`n-${user.uid}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor={`e-${user.uid}`}>อีเมล</label>
          <Input id={`e-${user.uid}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor={`r-${user.uid}`}>บทบาท</label>
          <select id={`r-${user.uid}`} className={`${selectClass} w-full`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="STUDENT">นักเรียน</option>
            <option value="TEACHER">ครูผู้สอน</option>
            <option value="ADMIN">ผู้ดูแลระบบ</option>
          </select>
        </div>
        {role === "STUDENT" && (
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor={`c-${user.uid}`}>ห้องเรียน</label>
            <select id={`c-${user.uid}`} className={`${selectClass} w-full`} value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
              <option value="">— เลือกห้อง —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>บันทึกการแก้ไข</Button>
          <span className="ml-2 text-xs text-muted-foreground">การเปลี่ยนบทบาท/ห้อง/อีเมล ผู้ใช้ต้องเข้าสู่ระบบใหม่</span>
        </div>
      </form>

      {user.role === "TEACHER" && (
        <div className="space-y-1.5 rounded-lg border border-border/70 bg-background p-3">
          <p className="text-xs font-medium">โอนข้อสอบและชุดสอบทั้งหมดของครูท่านนี้</p>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="เลือกครูผู้รับโอน" className={selectClass} value={toUid} onChange={(e) => setToUid(e.target.value)}>
              <option value="">— เลือกครูผู้รับ —</option>
              {teachers.filter((t) => t.uid !== user.uid && !t.disabled).map((t) => (
                <option key={t.uid} value={t.uid}>{t.name || t.email}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={busy || !toUid} onClick={() => onTransfer(toUid)}>
              <ArrowRightLeft className="size-3" />
              <span>โอนข้อมูล</span>
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs text-muted-foreground">ลบบัญชีถาวร (ไม่สามารถกู้คืนได้)</p>
        <Button variant="destructive" size="sm" className="gap-1 text-xs" disabled={busy} onClick={onDelete}>
          <Trash2 className="size-3" />
          <span>ลบบัญชี</span>
        </Button>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const confirm = useConfirm();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [rooms, setRooms] = useState<NamedItem[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUid, setEditUid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsers(), loadClassrooms()])
      .then(([u, r]) => {
        if (cancelled) return;
        setUsers(u);
        setRooms(r);
      })
      .catch(() => {
        if (!cancelled) setError("โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;
  const teachers = useMemo(() => (users ?? []).filter((u) => u.role === "TEACHER"), [users]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!roomFilter || u.classroomId === roomFilter) &&
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  }, [users, search, roleFilter, roomFilter]);

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  async function patch(u: UserRecord, body: object, apply: (u: UserRecord) => UserRecord, okMsg?: (r: { password?: string }) => string) {
    resetMessages();
    setBusyUid(u.uid);
    try {
      const r = await apiPatch<{ password?: string }>(`/api/admin/users/${u.uid}`, body);
      setUsers((list) => (list ?? []).map((x) => (x.uid === u.uid ? apply(x) : x)));
      if (okMsg) setNotice(okMsg(r));
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setBusyUid(null);
    }
  }

  const onMove = async (u: UserRecord, classroomId: string) => {
    if (!classroomId || classroomId === u.classroomId) return;
    if (!await confirm(`ย้าย ${u.name} ไป ${roomName(classroomId)}? (ผู้ใช้จะต้องเข้าสู่ระบบใหม่)`)) return;
    void patch(u, { classroomId }, (x) => ({ ...x, classroomId }));
  };
  const onReset = async (u: UserRecord) => {
    if (!await confirm(`รีเซ็ตรหัสผ่านของ ${u.name}?`)) return;
    void patch(u, { resetPassword: true }, (x) => x, (r) => `รหัสผ่านใหม่ของ ${u.name}: ${r.password} (แสดงครั้งเดียว กรุณาจดไว้)`);
  };
  const onToggle = async (u: UserRecord) => {
    const disabled = !u.disabled;
    if (!await confirm(`${disabled ? "ระงับ" : "เปิดใช้งาน"}บัญชีของ ${u.name}?`)) return;
    void patch(u, { disabled }, (x) => ({ ...x, disabled }));
  };

  async function onSave(u: UserRecord, body: { name?: string; email?: string; role?: Role; classroomId?: string }) {
    if (body.role === "ADMIN" && !await confirm(`ให้ ${u.name} เป็นผู้ดูแลระบบ?`)) return;
    if (body.role && u.role === "ADMIN" && !await confirm(`ถอดสิทธิ์ผู้ดูแลระบบของ ${u.name}?`)) return;
    void patch(
      u,
      body,
      (x) => {
        const role = body.role ?? x.role;
        return {
          ...x,
          ...(body.name ? { name: body.name } : {}),
          ...(body.email ? { email: body.email.toLowerCase() } : {}),
          role,
          classroomId: role === "STUDENT" ? (body.classroomId ?? x.classroomId) : "",
        };
      },
      () => `บันทึกข้อมูลของ ${body.name ?? u.name} แล้ว`,
    );
  }

  async function onDelete(u: UserRecord) {
    if (!await confirm(`ลบบัญชี "${u.name}" ถาวร?\nไม่สามารถกู้คืนได้`)) return;
    resetMessages();
    setBusyUid(u.uid);
    try {
      await apiDelete(`/api/admin/users/${u.uid}`);
      setUsers((list) => (list ?? []).filter((x) => x.uid !== u.uid));
      setEditUid(null);
      setNotice(`ลบบัญชีของ ${u.name} แล้ว`);
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setBusyUid(null);
    }
  }

  async function onTransfer(u: UserRecord, toUid: string) {
    const to = teachers.find((t) => t.uid === toUid);
    if (!to || !await confirm(`โอนข้อสอบและชุดสอบทั้งหมดของ ${u.name} ให้ ${to.name}?`)) return;
    resetMessages();
    setBusyUid(u.uid);
    try {
      const r = await apiPost<{ questions: number; exams: number }>("/api/admin/users/transfer", { fromUid: u.uid, toUid });
      setNotice(`โอนข้อสอบ ${r.questions} ข้อ และชุดสอบ ${r.exams} ชุด ให้ ${to.name} แล้ว`);
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setBusyUid(null);
    }
  }

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
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight">รายชื่อผู้ใช้งานทั้งหมด</h2>
            <p className="text-xs text-muted-foreground">จัดการนักเรียน ครูผู้สอน และผู้ดูแลระบบ</p>
          </div>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setShowCreate((v) => !v)}>
            <UserPlus className="size-3.5" />
            <span>{showCreate ? "ปิดฟอร์ม" : "เพิ่มผู้ใช้"}</span>
          </Button>
        </div>
      </div>

      {showCreate && (
        <CreateUserCard
          rooms={rooms}
          onError={(m) => {
            setNotice(null);
            setError(m);
          }}
          onCreated={(u, password) => {
            setError(null);
            setUsers((list) => [...(list ?? []), u]);
            setNotice(
              password
                ? `สร้างบัญชี ${u.email} แล้ว รหัสผ่าน: ${password} (แสดงครั้งเดียว กรุณาจดไว้)`
                : `สร้างบัญชี ${u.email} แล้ว`,
            );
          }}
        />
      )}

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
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3.5 text-xs font-medium text-foreground break-words">
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
        {shown.map((u) => {
          const isSelf = u.uid === me?.uid;
          return (
            <Card key={u.uid} className={`transition-all hover:border-primary/40 ${u.disabled ? "opacity-60 bg-muted/30" : ""}`}>
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
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
                        {isSelf && (
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-2xs font-medium text-emerald-600">
                            บัญชีของคุณ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>

                  {!isSelf && (
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
                      <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={busyUid === u.uid} onClick={() => onReset(u)}>
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        aria-expanded={editUid === u.uid}
                        onClick={() => setEditUid((cur) => (cur === u.uid ? null : u.uid))}
                      >
                        <Pencil className="size-3" />
                        <span>แก้ไข</span>
                      </Button>
                    </div>
                  )}
                </div>

                {!isSelf && editUid === u.uid && (
                  <EditPanel
                    key={`${u.uid}-${u.role}-${u.classroomId}-${u.name}-${u.email}`}
                    user={u}
                    rooms={rooms}
                    teachers={teachers}
                    busy={busyUid === u.uid}
                    onSave={(body) => onSave(u, body)}
                    onDelete={() => void onDelete(u)}
                    onTransfer={(toUid) => void onTransfer(u, toUid)}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
