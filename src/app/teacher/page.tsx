import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TeacherHome() {
  return (
    <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
      <Link href="/teacher/questions">
        <Card className="transition-colors hover:bg-muted/50">
          <CardHeader>
            <CardTitle>คลังข้อสอบ</CardTitle>
            <CardDescription>สร้างและจัดการข้อสอบรายข้อ</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link href="/teacher/exams">
        <Card className="transition-colors hover:bg-muted/50">
          <CardHeader>
            <CardTitle>ชุดสอบ</CardTitle>
            <CardDescription>สร้างชุดสอบจากคลังข้อสอบ กำหนดเวลา และเผยแพร่</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
