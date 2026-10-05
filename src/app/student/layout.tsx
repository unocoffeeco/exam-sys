import { RoleGuard } from "@/components/role-guard";
import { AppHeader } from "@/components/app-header";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowed={["STUDENT"]}>
      <div className="min-h-dvh">
        <AppHeader title="นักเรียน" />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </RoleGuard>
  );
}
