"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { GraduationCap, Mail, Lock, LogIn, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClientAuth } from "@/lib/firebase-client";
import { isRole, ROLE_HOME } from "@/lib/roles";

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
      const token = await cred.user.getIdTokenResult(true);
      const role = token.claims.role;
      if (!isRole(role)) {
        setError("บัญชีนี้ยังไม่ได้รับสิทธิ์การใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
        return;
      }
      router.replace(ROLE_HOME[role]);
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        console.error(`[Firebase Auth Error] Code: ${err.code} | Message: ${err.message}`);
        const userFriendlyMessage = ERROR_MESSAGES[err.code] ?? `เกิดข้อผิดพลาดในการเข้าสู่ระบบ (${err.code})`;
        setError(userFriendlyMessage);
      } else if (err instanceof Error) {
        console.error("[General Error]:", err.message);
        setError(err.message);
      } else {
        console.error("[Unknown Error]:", err);
        setError("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg border-border/70">
      <CardHeader className="text-center space-y-2 pb-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-1">
          <GraduationCap className="size-6" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">เข้าสู่ระบบ</CardTitle>
        <CardDescription className="text-sm">
          ระบบสอบและประเมินผลออนไลน์ โรงเรียนมัธยมศึกษา
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-medium">
              อีเมลสถานศึกษา
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="name@school.ac.th"
                className="pl-9 h-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-medium">
              รหัสผ่าน
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="pl-9 h-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <p className="leading-tight">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full gap-2 shadow-xs" disabled={submitting}>
            <LogIn className="size-4" />
            <span>{submitting ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}