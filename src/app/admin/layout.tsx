import { RoleGuard } from "@/components/role-guard";
import { AppHeader } from "@/components/app-header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowed={["ADMIN"]}>
      <div className="min-h-dvh">
        <AppHeader title="ผู้ดูแลระบบ" />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </RoleGuard>
  );
}
