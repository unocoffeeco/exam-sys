"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ROLE_HOME } from "@/lib/roles";

const ROLE_NAME: Record<string, string> = {
  ADMIN: "ผู้ดูแลระบบ",
  TEACHER: "ครูผู้สอน",
  STUDENT: "นักเรียน",
};

export function AppHeader({ title }: { title: string }) {
  const { user, role, signOut } = useAuth();
  const router = useRouter();

  const homeHref = role ? ROLE_HOME[role] : "/";

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={homeHref}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors hover:bg-primary/20"
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
                <span className="hidden sm:inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {ROLE_NAME[role] ?? role}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              ระบบสอบออนไลน์ รร.มัธยม
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-right">
            <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-xs">
              <UserIcon className="size-4" />
            </div>
            <div className="text-left text-xs leading-tight">
              <p className="font-medium max-w-[160px] truncate">{user?.displayName || user?.email?.split("@")[0] || "-"}</p>
              <p className="text-muted-foreground max-w-[160px] truncate">{user?.email ?? "-"}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-destructive/40 hover:bg-destructive/5"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
