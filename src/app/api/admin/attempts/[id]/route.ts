import type { NextRequest } from "next/server";
import { deleteAttemptCascade } from "@/lib/admin-data";
import { idSchema } from "@/lib/admin-rules";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Reset a student's attempt (delete attempt + score + away log) so they can start again
 * while the exam is still open. Used for crashes, wrong-room starts, etc.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });

    const db = adminDb();
    if (!(await db.doc(`attempts/${id.data}`).get()).exists) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    await deleteAttemptCascade(db, id.data);
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
