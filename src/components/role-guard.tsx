"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ROLE_HOME, type Role } from "@/lib/roles";

export function RoleGuard({ allowed, children }: { allowed: Role[]; children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!role) {
      router.replace("/login"); // claims not ready / not provisioned
      return;
    }
    if (!allowed.includes(role)) router.replace(ROLE_HOME[role]);
  }, [loading, user, role, allowed, router]);

  if (loading || !user || !role || !allowed.includes(role)) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        กำลังโหลด…
      </div>
    );
  }
  return <>{children}</>;
}
