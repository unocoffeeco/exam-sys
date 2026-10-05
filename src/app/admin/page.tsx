import Link from "next/link";
import { Users, FileUp, School, BookMarked, ArrowRight, ShieldCheck } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ITEMS = [
  {
    href: "/admin/users",
    title: "จัดการผู้ใช้งาน",
    desc: "ดูรายชื่อนักเรียนและครู ย้ายห้องเรียน รีเซ็ตรหัสผ่าน และระงับบัญชีผู้ใช้",
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
    desc: "กำหนดรหัสห้องเรียนและชื่อห้อง (ควรสร้างห้องเรียนก่อนนำเข้านักเรียน)",
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
];

export default function AdminHome() {
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
            จัดการบัญชีผู้ใช้งาน ห้องเรียน รายวิชา และการนำเข้าข้อมูลส่วนกลาง
          </p>
        </div>
      </div>

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
