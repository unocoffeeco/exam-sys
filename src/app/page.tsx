"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  LogIn,
  BookOpen,
  ShieldCheck,
  Clock,
  Shuffle,
  BarChart3,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { ROLE_HOME } from "@/lib/roles";

export default function HomePage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && role) {
      router.replace(ROLE_HOME[role]);
    }
  }, [loading, user, role, router]);

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Top Navbar */}
      <header className="border-b border-border/70 bg-card/60 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="size-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight">ระบบสอบออนไลน์</span>
              <p className="text-xs text-muted-foreground hidden sm:block">โรงเรียนมัธยมศึกษา</p>
            </div>
          </div>

          <Link
            href="/login"
            className={buttonVariants({ size: "sm", className: "gap-2 shadow-xs" })}
          >
            <LogIn className="size-4" />
            <span>เข้าสู่ระบบ</span>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-12 sm:py-16 sm:px-6 text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" />
            <span>มาตรฐานระบบสอบออนไลน์ระดับโรงเรียนมัธยม</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground text-balance max-w-3xl mx-auto leading-tight">
            ระบบทดสอบและประเมินผลออนไลน์ที่โปร่งใสและแม่นยำ
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed">
            แพลตฟอร์มทดสอบสำหรับนักเรียนและคุณครู ออกแบบมาเพื่อการวัดผลที่มีประสิทธิภาพ
            พร้อมระบบจับเวลาเซิร์ฟเวอร์ ตรวจจับการสลับหน้าจอ และสถิติคะแนนเชิงลึก
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/login"
              className={buttonVariants({ size: "lg", className: "gap-2 px-6 shadow-sm" })}
            >
              <LogIn className="size-4" />
              <span>เข้าสู่ระบบเพื่อใช้งาน</span>
            </Link>
          </div>
        </section>

        {/* Portal Entrance Roles */}
        <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="transition-all hover:border-primary/40 hover:shadow-md">
              <CardHeader className="space-y-2">
                <div className="size-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <GraduationCap className="size-5" />
                </div>
                <CardTitle className="text-lg">สำหรับนักเรียน</CardTitle>
                <CardDescription>
                  เข้าสอบตามตารางห้องเรียน บันทึกคำตอบอัตโนมัติ และตรวจดูผลคะแนนพร้อมเฉลยเมื่อประกาศผล
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="transition-all hover:border-primary/40 hover:shadow-md">
              <CardHeader className="space-y-2">
                <div className="size-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <BookOpen className="size-5" />
                </div>
                <CardTitle className="text-lg">สำหรับครูผู้สอน</CardTitle>
                <CardDescription>
                  สร้างคลังข้อสอบ จัดทำชุดสอบ กำหนดเวลา ตรวจข้อสอบอัตนัย และดูรายงานสถิติข้อสอบ
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="transition-all hover:border-primary/40 hover:shadow-md">
              <CardHeader className="space-y-2">
                <div className="size-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Users className="size-5" />
                </div>
                <CardTitle className="text-lg">สำหรับผู้ดูแลระบบ</CardTitle>
                <CardDescription>
                  จัดการห้องเรียน รายวิชา นำเข้าข้อมูลนักเรียนและครูจากไฟล์ CSV พร้อมระบบจัดการสิทธิ์
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        {/* Security & Integrity Highlights */}
        <section className="border-t border-border/60 bg-muted/30 py-12">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                คุณสมบัติเพื่อความยุติธรรมและเสถียรภาพ
              </h2>
              <p className="text-sm text-muted-foreground">
                ออกแบบตามมาตรฐานความปลอดภัยสำหรับการสอบในสถานศึกษา
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-2xs">
                <Clock className="size-5 text-primary" />
                <h3 className="font-semibold text-sm">เวลาเซิร์ฟเวอร์แม่นยำ</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  จับเวลาตรงจากเซิร์ฟเวอร์ นักเรียนไม่สามารถแก้ไขเวลาในอุปกรณ์เพื่อยืดเวลาสอบได้
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-2xs">
                <Shuffle className="size-5 text-primary" />
                <h3 className="font-semibold text-sm">สุ่มลำดับข้อและตัวเลือก</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  สุ่มข้อและตัวเลือกเฉพาะบุคคลด้วย Deterministic Seed ป้องกันการลอกระหว่างสอบ
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-2xs">
                <ShieldCheck className="size-5 text-primary" />
                <h3 className="font-semibold text-sm">ตรวจจับการสลับหน้าจอ</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  บันทึกจังหวะการออกจากหน้าสอบหรือสลับแท็บให้ครูผู้คุมสอบดูรายงานความซื่อสัตย์
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 shadow-2xs">
                <BarChart3 className="size-5 text-primary" />
                <h3 className="font-semibold text-sm">รายงานสถิติและส่งออก CSV</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  ดูคะแนนเฉลี่ย สูงสุด ต่ำสุด และดาวน์โหลดสรุปผลเข้าโปรแกรม Excel ได้ทันที
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        <p>ระบบสอบออนไลน์ โรงเรียนมัธยมศึกษา · ขับเคลื่อนด้วย Next.js และ Firebase</p>
      </footer>
    </div>
  );
}
