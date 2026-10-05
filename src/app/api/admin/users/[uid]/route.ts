import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { claimsFor, idSchema } from "@/lib/admin-rules";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { generatePassword } from "@/lib/passwords";

type AnyRole = "ADMIN" | "TEACHER" | "STUDENT";

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().toLowerCase().email().max(200).optional(),
    classroomId: z.string().min(1).max(128).optional(),
    role: z.enum(["ADMIN", "TEACHER", "STUDENT"]).optional(),
    disabled: z.boolean().optional(),
    resetPassword: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty");

const fail = (status: number, error: string) => Response.json({ error }, { status });
const codeOf = (e: unknown) => (e as { code?: string } | null)?.code;

/**
 * Admin edits one user: name / email / classroom / role / disable / reset password.
 * An admin can manage other admins but never their own account (so the last admin can't lock themselves out).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    const caller = await requireAuth(req, ["ADMIN"]);
    const uid = idSchema.safeParse((await ctx.params).uid);
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!uid.success || !body.success) return fail(400, "BAD_REQUEST");
    const b = body.data;
    if (uid.data === caller.uid) return fail(400, "CANNOT_EDIT_SELF");

    const auth = adminAuth();
    const db = adminDb();
    const user = await auth.getUser(uid.data).catch(() => null);
    if (!user) return fail(404, "NOT_FOUND");

    const currentRole = user.customClaims?.role as AnyRole | undefined;
    const role = (b.role ?? currentRole) as AnyRole | undefined;
    if (!role) return fail(422, "ROLE_REQUIRED");

    // Only students keep a classroom.
    let classroomId: string | undefined = b.classroomId ?? (user.customClaims?.classroomId as string | undefined);
    if (role !== "STUDENT") classroomId = undefined;
    if (role === "STUDENT") {
      if (!classroomId) return fail(422, "CLASSROOM_REQUIRED");
      if (b.classroomId && !(await db.doc(`classrooms/${b.classroomId}`).get()).exists) return fail(422, "CLASSROOM_NOT_FOUND");
    }

    const newPassword = b.resetPassword ? generatePassword() : undefined;
    try {
      await auth.updateUser(uid.data, {
        ...(b.name ? { displayName: b.name } : {}),
        ...(b.email ? { email: b.email } : {}),
        ...(b.disabled !== undefined ? { disabled: b.disabled } : {}),
        ...(newPassword ? { password: newPassword } : {}),
      });
    } catch (e) {
      if (codeOf(e) === "auth/email-already-exists") return fail(409, "EMAIL_EXISTS");
      throw e;
    }

    const claimsChanged = role !== currentRole || classroomId !== user.customClaims?.classroomId;
    if (claimsChanged) await auth.setCustomUserClaims(uid.data, claimsFor(role, classroomId));
    if (claimsChanged || newPassword || b.disabled) await auth.revokeRefreshTokens(uid.data);

    await db.doc(`users/${uid.data}`).set(
      {
        ...(b.name ? { name: b.name } : {}),
        ...(b.email ? { email: b.email } : {}),
        role,
        classroomId: classroomId ?? FieldValue.delete(),
        ...(b.disabled !== undefined ? { disabled: b.disabled } : {}),
      },
      { merge: true },
    );

    return Response.json({ ok: true, ...(newPassword ? { password: newPassword } : {}) });
  } catch (err) {
    return authErrorResponse(err);
  }
}

/**
 * Permanently delete an account (Auth + users doc).
 * - A teacher who still owns questions/exams is refused (HAS_CONTENT): transfer their content first.
 * - A student's past attempts/scores are kept so teachers' reports stay intact.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    const caller = await requireAuth(req, ["ADMIN"]);
    const uid = idSchema.safeParse((await ctx.params).uid);
    if (!uid.success) return fail(400, "BAD_REQUEST");
    if (uid.data === caller.uid) return fail(400, "CANNOT_EDIT_SELF");

    const auth = adminAuth();
    const db = adminDb();
    const user = await auth.getUser(uid.data).catch(() => null);
    if (!user) return fail(404, "NOT_FOUND");

    if (user.customClaims?.role === "TEACHER") {
      const [q, e] = await Promise.all([
        db.collection("questions").where("ownerId", "==", uid.data).limit(1).get(),
        db.collection("exams").where("ownerId", "==", uid.data).limit(1).get(),
      ]);
      if (!q.empty || !e.empty) return fail(409, "HAS_CONTENT");
    }

    await auth.deleteUser(uid.data);
    await db.doc(`users/${uid.data}`).delete();
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
