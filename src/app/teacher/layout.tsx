import { RoleGuard } from "@/components/role-guard";
import { AppHeader } from "@/components/app-header";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowed={["TEACHER"]}>
      <div className="min-h-dvh">
        <AppHeader title="ครู" />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </RoleGuard>
  );
}
