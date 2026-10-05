"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Users, FileUp, School, BookMarked, ArrowRight, ShieldCheck, ClipboardList, Library } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminStats } from "@/lib/admin-client";
import { apiGet } from "@/lib/api-client";

const ITEMS = [
  {
    href: "/admin/users",
    title: "จัดการผู้ใช้งาน",
    desc: "เพิ่ม แก้ไข ย้ายห้อง รีเซ็ตรหัสผ่าน ระงับ หรือลบบัญชี และโอนข้อมูลของครู",
    icon: Users,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    href: "/admin/users/import",
    title: "นำเข้าผู้ใช้จากไฟล์ CSV",
    desc: "เพิ่มบัญชีนักเรียนและครูทีละจำนวนมาก พร้อมดาวน์โหลดรหัสผ่านชุดแรก",
    icon: FileUp,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    href: "/admin/classrooms",
    title: "จัดการห้องเรียน",
    desc: "เพิ่ม เปลี่ยนชื่อ ลบ และย้ายนักเรียนทั้งห้อง (เช่น เลื่อนชั้นปี)",
    icon: School,
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    href: "/admin/subjects",
    title: "จัดการกลุ่มสาระและรายวิชา",
    desc: "เพิ่ม แก้ไข รหัสและชื่อวิชาสำหรับคลังข้อสอบและชุดข้อสอบ",
    icon: BookMarked,
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    href: "/admin/exams",
    title: "จัดการชุดสอบทั้งหมด",
    desc: "ดูชุดสอบของครูทุกคน ปิด/เปิดสอบใหม่ ขยายเวลา รีเซ็ตการสอบของนักเรียน หรือลบชุดสอบ",
    icon: ClipboardList,
    color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    href: "/admin/questions",
    title: "คลังข้อสอบทั้งหมด",
    desc: "ตรวจดูและลบข้อสอบในคลังของครูทุกคน (ไม่แสดงเฉลย)",
    icon: Library,
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
];

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
      <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function AdminHome() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<AdminStats>("/api/admin/stats")
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => undefined); // the dashboard still works without numbers
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Admin Banner */}
      <div className="rounded-2xl border border-primary/20 bg-linear-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="size-4" />
            <span>ศูนย์ควบคุมระบบ (Admin Console)</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">การจัดการข้อมูลสถานศึกษา</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            จัดการบัญชีผู้ใช้ ห้องเรียน รายวิชา ชุดสอบ และคลังข้อสอบได้ครบในที่เดียว
          </p>
        </div>
      </div>

      {/* Overview numbers */}
      {stats && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="นักเรียน" value={stats.users.students} />
          <Stat label="ครู" value={stats.users.teachers} />
          <Stat label="ห้องเรียน" value={stats.classrooms} />
          <Stat label="รายวิชา" value={stats.subjects} />
          <Stat label="ชุดสอบที่เปิดอยู่" value={stats.exams.published} />
          <Stat label="กำลังสอบอยู่" value={stats.attemptsInProgress} />
          <Stat label="ข้อสอบในคลัง" value={stats.questions} />
          <Stat label="บัญชีที่ถูกระงับ" value={stats.users.disabled} />
        </div>
      )}

      {/* Grid of Admin Tools */}
      <div className="grid gap-4 sm:grid-cols-2">
        {ITEMS.map((i) => {
          const Icon = i.icon;
          return (
            <Link key={i.href} href={i.href} className="group">
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className={`size-11 rounded-xl flex items-center justify-center ${i.color}`}>
                      <Icon className="size-5" />
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{i.title}</CardTitle>
                    <CardDescription className="pt-1">{i.desc}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
