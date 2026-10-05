import type { NextRequest } from "next/server";
import { createUserSchema, claimsFor } from "@/lib/admin-rules";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { generatePassword } from "@/lib/passwords";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const codeOf = (e: unknown) => (e as { code?: string } | null)?.code;

/** Admin creates a single account (student / teacher / admin). Password is shown once. */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const body = createUserSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return fail(400, "BAD_REQUEST");
    const b = body.data;

    const db = adminDb();
    const auth = adminAuth();
    if (b.role === "STUDENT" && !(await db.doc(`classrooms/${b.classroomId}`).get()).exists) {
      return fail(422, "CLASSROOM_NOT_FOUND");
    }

    const password = b.password ?? generatePassword();
    let uid: string;
    try {
      uid = (await auth.createUser({ email: b.email, password, displayName: b.name })).uid;
    } catch (e) {
      if (codeOf(e) === "auth/email-already-exists") return fail(409, "EMAIL_EXISTS");
      throw e;
    }

    try {
      await auth.setCustomUserClaims(uid, claimsFor(b.role, b.classroomId));
      await db.doc(`users/${uid}`).set({
        name: b.name,
        email: b.email,
        role: b.role,
        ...(b.role === "STUDENT" ? { classroomId: b.classroomId } : {}),
        disabled: false,
      });
    } catch (e) {
      await auth.deleteUser(uid).catch(() => undefined); // never leave a half-created account
      throw e;
    }

    return Response.json({ ok: true, uid, ...(b.password ? {} : { password }) });
  } catch (err) {
    return authErrorResponse(err);
  }
}
