import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { generatePassword } from "@/lib/passwords";

const uidSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    classroomId: z.string().min(1).max(128).optional(),
    role: z.enum(["STUDENT", "TEACHER"]).optional(),
    disabled: z.boolean().optional(),
    resetPassword: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty");

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Admin edits one user: name / classroom / role / disable / reset password. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    const caller = await requireAuth(req, ["ADMIN"]);
    const uid = uidSchema.safeParse((await ctx.params).uid);
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!uid.success || !body.success) return fail(400, "BAD_REQUEST");
    const b = body.data;

    const auth = adminAuth();
    const db = adminDb();
    const user = await auth.getUser(uid.data).catch(() => null);
    if (!user) return fail(404, "NOT_FOUND");

    const currentRole = user.customClaims?.role as string | undefined;
    if (currentRole === "ADMIN") return fail(403, "CANNOT_EDIT_ADMIN"); // admins are managed outside the app
    if (uid.data === caller.uid) return fail(400, "CANNOT_EDIT_SELF");

    const role = (b.role ?? currentRole) as "STUDENT" | "TEACHER";
    if (!role) return fail(422, "ROLE_REQUIRED");
    let classroomId: string | undefined = b.classroomId ?? (user.customClaims?.classroomId as string | undefined);
    if (role === "TEACHER") classroomId = undefined;
    if (role === "STUDENT") {
      if (!classroomId) return fail(422, "CLASSROOM_REQUIRED");
      if (b.classroomId && !(await db.doc(`classrooms/${b.classroomId}`).get()).exists) return fail(422, "CLASSROOM_NOT_FOUND");
    }

    const newPassword = b.resetPassword ? generatePassword() : undefined;
    await auth.updateUser(uid.data, {
      ...(b.name ? { displayName: b.name } : {}),
      ...(b.disabled !== undefined ? { disabled: b.disabled } : {}),
      ...(newPassword ? { password: newPassword } : {}),
    });

    const claimsChanged = role !== currentRole || classroomId !== user.customClaims?.classroomId;
    if (claimsChanged) {
      await auth.setCustomUserClaims(uid.data, { role, ...(classroomId ? { classroomId } : {}) });
    }
    if (claimsChanged || newPassword || b.disabled) await auth.revokeRefreshTokens(uid.data);

    await db.doc(`users/${uid.data}`).set(
      {
        ...(b.name ? { name: b.name } : {}),
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
