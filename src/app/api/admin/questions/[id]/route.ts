import type { NextRequest } from "next/server";
import { idSchema } from "@/lib/admin-rules";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Delete a question. Published exams are unaffected (they hold their own copy in examPapers);
 * a DRAFT exam that still lists it will fail validation on publish (INVALID_QUESTION), as for a teacher delete.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });

    const ref = adminDb().doc(`questions/${id.data}`);
    if (!(await ref.get()).exists) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    await ref.delete();
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
