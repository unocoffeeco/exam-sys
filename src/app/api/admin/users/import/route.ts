import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { generatePassword } from "@/lib/passwords";
import { resolveClassroomId, userRowSchema, type UserRow } from "@/lib/user-import";

const MAX_ROWS = 500;
const bodySchema = z.object({ rows: z.array(z.unknown()).min(1).max(MAX_ROWS) });

type RowResult = {
  row: number;
  email: string;
  status: "created" | "updated" | "error";
  message?: string;
  /** only returned for newly created accounts (shown once to the admin) */
  password?: string;
};

const isNotFound = (e: unknown) => (e as { code?: string }).code === "auth/user-not-found";

async function upsertUser(auth: Auth, r: UserRow, classroomId: string | null, rowNo: number): Promise<RowResult> {
  const db = adminDb();
  const claims = { role: r.role, ...(classroomId ? { classroomId } : {}) };

  let existing = null;
  try {
    existing = await auth.getUserByEmail(r.email);
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }

  let uid: string;
  let status: RowResult["status"];
  let password: string | undefined;

  if (existing) {
    if (existing.customClaims?.role === "ADMIN") {
      return { row: rowNo, email: r.email, status: "error", message: "เป็นบัญชีผู้ดูแลระบบ ไม่สามารถแก้ไขจากการนำเข้า" };
    }
    uid = existing.uid;
    await auth.updateUser(uid, { displayName: r.name, ...(r.password ? { password: r.password } : {}) });
    const changed =
      existing.customClaims?.role !== claims.role ||
      existing.customClaims?.classroomId !== (classroomId ?? undefined);
    await auth.setCustomUserClaims(uid, claims);
    if (changed) await auth.revokeRefreshTokens(uid); // force re-login so new claims apply
    status = "updated";
  } else {
    password = r.password ?? generatePassword();
    uid = (await auth.createUser({ email: r.email, password, displayName: r.name })).uid;
    await auth.setCustomUserClaims(uid, claims);
    status = "created";
  }

  await db.doc(`users/${uid}`).set(
    {
      name: r.name,
      email: r.email,
      role: r.role,
      classroomId: classroomId ?? FieldValue.delete(),
      disabled: false,
    },
    { merge: true },
  );
  return { row: rowNo, email: r.email, status, ...(status === "created" && !r.password ? { password } : {}) };
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });

    const auth = adminAuth();
    const classrooms = (await adminDb().collection("classrooms").get()).docs.map((d) => ({
      id: d.id,
      name: String(d.get("name") ?? d.id),
    }));

    const seen = new Set<string>();
    const results: RowResult[] = [];

    for (const [i, raw] of body.data.rows.entries()) {
      const rowNo = i + 1;
      const parsed = userRowSchema.safeParse(raw);
      const rawEmail = String((raw as { email?: unknown } | null)?.email ?? "");
      if (!parsed.success) {
        results.push({ row: rowNo, email: rawEmail, status: "error", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
        continue;
      }
      const r = parsed.data;
      if (seen.has(r.email)) {
        results.push({ row: rowNo, email: r.email, status: "error", message: "อีเมลซ้ำในไฟล์" });
        continue;
      }
      seen.add(r.email);

      let classroomId: string | null = null;
      if (r.role === "STUDENT") {
        classroomId = resolveClassroomId(r.classroom ?? "", classrooms);
        if (!classroomId) {
          results.push({ row: rowNo, email: r.email, status: "error", message: `ไม่พบห้อง "${r.classroom ?? ""}" (สร้างห้องก่อนนำเข้า)` });
          continue;
        }
      }

      try {
        results.push(await upsertUser(auth, r, classroomId, rowNo));
      } catch {
        results.push({ row: rowNo, email: r.email, status: "error", message: "สร้างบัญชีไม่สำเร็จ" });
      }
    }

    return Response.json({ results });
  } catch (err) {
    return authErrorResponse(err);
  }
}
