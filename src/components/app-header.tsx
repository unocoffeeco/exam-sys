"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { ROLE_HOME, type Role } from "@/lib/roles";

const ROLE_NAME: Record<string, string> = {
  ADMIN: "ผู้ดูแลระบบ",
  TEACHER: "ครูผู้สอน",
  STUDENT: "นักเรียน",
};

type NavItem = { href: string; label: string; /** match only this exact path (home tab) */ exact?: boolean };

const NAV: Record<Role, NavItem[]> = {
  ADMIN: [
    { href: "/admin", label: "ภาพรวม", exact: true },
    { href: "/admin/users", label: "ผู้ใช้" },
    { href: "/admin/classrooms", label: "ห้องเรียน" },
    { href: "/admin/subjects", label: "รายวิชา" },
    { href: "/admin/questions", label: "คลังข้อสอบ" },
    { href: "/admin/exams", label: "ชุดสอบ" },
  ],
  TEACHER: [
    { href: "/teacher", label: "ภาพรวม", exact: true },
    { href: "/teacher/questions", label: "คลังข้อสอบ" },
    { href: "/teacher/exams", label: "ชุดสอบ" },
  ],
  STUDENT: [],
};

export function AppHeader({ title }: { title: string }) {
  const { user, role, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const homeHref = role ? ROLE_HOME[role] : "/";
  const nav = role ? NAV[role] : [];
  // During an exam the page's own sticky timer bar must be the only thing pinned to the top.
  const inExam = pathname.startsWith("/student/exam/");
  const displayName = user?.displayName || user?.email?.split("@")[0] || "-";

  return (
    <header
      className={`z-30 border-b border-border/70 bg-background/95 backdrop-blur-md ${inExam ? "" : "sticky top-0"}`}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={homeHref}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors hover:bg-primary/20"
            aria-label="หน้าหลัก"
            title="หน้าหลัก"
          >
            <GraduationCap className="size-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href={homeHref} className="truncate text-base font-semibold tracking-tight hover:underline">
                {title}
              </Link>
              {role && (
                <span className="hidden rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground sm:inline-flex">
                  {ROLE_NAME[role] ?? role}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">ระบบสอบออนไลน์ รร.มัธยม</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* name is shown at every width: on phones it is the only way to see who is signed in */}
          <div className="max-w-[9rem] text-right text-xs leading-tight sm:max-w-[200px]">
            <p className="truncate font-medium">{displayName}</p>
            <p className="hidden truncate text-muted-foreground sm:block">{user?.email ?? "-"}</p>
          </div>
          <ThemeToggle />
          <Button
            variant="outline"
            className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-foreground"
            aria-label="ออกจากระบบ"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </Button>
        </div>
      </div>

      {nav.length > 0 && (
        <nav aria-label="เมนูหลัก" className="mx-auto max-w-6xl overflow-x-auto px-2 sm:px-4">
          <ul className="flex min-w-max gap-1 pb-2">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
