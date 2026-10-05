"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app"; // Import FirebaseError เข้ามาใช้งาน
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClientAuth } from "@/lib/firebase-client";
import { isRole, ROLE_HOME } from "@/lib/roles";

// เพิ่มการตั้งค่า Error Messages ให้ครอบคลุมเคสต่างๆ เพิ่มขึ้น
const ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
  "auth/user-not-found": "ไม่พบบัญชีผู้ใช้นี้ในระบบ",
  "auth/wrong-password": "รหัสผ่านไม่ถูกต้อง",
  "auth/too-many-requests": "พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง",
  "auth/user-disabled": "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
  "auth/operation-not-allowed": "ระบบยังไม่ได้เปิดใช้งานการล็อกอินด้วยอีเมลและรหัสผ่าน",
  "auth/network-request-failed": "ไม่สามารถเชื่อมต่อเครือข่ายได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต",
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(getClientAuth(), email.trim(), password);
      // force refresh: custom claims may not be in the cached token yet
      const token = await cred.user.getIdTokenResult(true);
      const role = token.claims.role;
      if (!isRole(role)) {
        setError("บัญชีนี้ยังไม่ได้รับสิทธิ์การใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
        return;
      }
      router.replace(ROLE_HOME[role]);
    } catch (err: unknown) {
      // 1. ดักจับถ้าเป็น FirebaseError โดยเฉพาะ
      if (err instanceof FirebaseError) {
        // พิมพ์ Error Code และ Message ละเอียดใน Console เพื่อช่วย Debug
        console.error(`[Firebase Auth Error] Code: ${err.code} | Message: ${err.message}`);

        // ดึงข้อความแสดงให้ผู้ใช้ตามตาราง หรือใช้ข้อความเริ่มต้นหากไม่พบ Code
        const userFriendlyMessage = ERROR_MESSAGES[err.code] ?? `เกิดข้อผิดพลาดในการเข้าสู่ระบบ (${err.code})`;
        setError(userFriendlyMessage);
      } 
      // 2. ดักจับกรณีเป็น Error ทั่วไปอื่นๆ
      else if (err instanceof Error) {
        console.error("[General Error]:", err.message);
        setError(err.message);
      } 
      // 3. Fallback สำหรับข้อผิดพลาดที่ไม่รู้จัก
      else {
        console.error("[Unknown Error]:", err);
        setError("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>เข้าสู่ระบบ</CardTitle>
        <CardDescription>ระบบสอบออนไลน์</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">อีเมล</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">รหัสผ่าน</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}