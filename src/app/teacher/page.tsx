import Link from "next/link";
import {
  BookOpen,
  FileSpreadsheet,
  PlusCircle,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function TeacherHome() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Teacher Welcome Banner */}
      <div className="rounded-2xl border border-primary/20 bg-linear-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">ระบบบริหารการสอบ</span>
            <h2 className="text-2xl font-bold tracking-tight">แดชบอร์ดครูผู้สอน</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              จัดการคลังข้อสอบ กำหนดช่วงเวลาสอบ ตรวจข้อสอบอัตนัย และติดตามสถิติผู้เข้าสอบ
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/teacher/questions/new"
              className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5 shadow-2xs" })}
            >
              <PlusCircle className="size-3.5" />
              <span>เพิ่มข้อสอบ</span>
            </Link>
            <Link
              href="/teacher/exams/new"
              className={buttonVariants({ size: "sm", className: "gap-1.5 shadow-2xs" })}
            >
              <PlusCircle className="size-3.5" />
              <span>สร้างชุดสอบ</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Hub Navigation Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/teacher/questions" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="size-11 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <BookOpen className="size-5" />
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
              <div>
                <CardTitle className="text-lg">คลังข้อสอบ</CardTitle>
                <CardDescription className="pt-1">
                  สร้าง จัดหมวดหมู่ตามรายวิชา ปรนัย เลือกตอบ ถูก/ผิด และอัตนัย พร้อมคำอธิบายเฉลย
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/teacher/exams" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="size-11 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <FileSpreadsheet className="size-5" />
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
              <div>
                <CardTitle className="text-lg">ชุดข้อสอบและการเปิดสอบ</CardTitle>
                <CardDescription className="pt-1">
                  สร้างชุดข้อสอบ กำหนดห้องเรียน เวลาเปิด/ปิดสอบ ตรวจผลคะแนน และดูรายงานการสลับแท็บ
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* Exam Workflow Steps */}
      <Card className="border-border/70 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold">ขั้นตอนการจัดการสอบออนไลน์</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4 text-xs">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1">
              <span className="font-bold text-primary">1. สร้างข้อสอบ</span>
              <p className="text-muted-foreground leading-relaxed">เพิ่มข้อสอบเข้าคลังข้อสอบ ระบุตัวเลือกและกำหนดเฉลย</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1">
              <span className="font-bold text-primary">2. จัดชุดสอบ</span>
              <p className="text-muted-foreground leading-relaxed">เลือกข้อสอบ กำหนดเวลา และเลือกห้องเรียนที่มีสิทธิ์สอบ</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1">
              <span className="font-bold text-primary">3. เผยแพร่ข้อสอบ</span>
              <p className="text-muted-foreground leading-relaxed">ระบบจะตัดเฉลยออก และสร้างกระดาษคำถามให้นักเรียน</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1">
              <span className="font-bold text-primary">4. ตรวจและดูสถิติ</span>
              <p className="text-muted-foreground leading-relaxed">ตรวจข้อเขียนอัตนัย ดูคะแนนเฉลี่ย และส่งออกไฟล์ CSV</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
