import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ITEMS = [
  { href: "/admin/users", title: "ผู้ใช้", desc: "ดูรายชื่อ ย้ายห้อง รีเซ็ตรหัสผ่าน ระงับบัญชี" },
  { href: "/admin/users/import", title: "นำเข้าผู้ใช้จาก CSV", desc: "เพิ่มนักเรียนและครูทีละหลายคน" },
  { href: "/admin/classrooms", title: "ห้องเรียน", desc: "เพิ่ม/แก้ไขห้อง (สร้างก่อนนำเข้านักเรียน)" },
  { href: "/admin/subjects", title: "รายวิชา", desc: "เพิ่ม/แก้ไขวิชา" },
];

export default function AdminHome() {
  return (
    <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href}>
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle>{i.title}</CardTitle>
              <CardDescription>{i.desc}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
