"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function AppHeader({ title }: { title: string }) {
  const { user, role, signOut } = useAuth();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        <p className="truncate text-xs text-muted-foreground">
          {user?.email ?? "-"} · {role ?? "-"}
        </p>
      </div>
      <Button
        variant="outline"
        onClick={async () => {
          await signOut();
          router.replace("/login");
        }}
      >
        ออกจากระบบ
      </Button>
    </header>
  );
}
