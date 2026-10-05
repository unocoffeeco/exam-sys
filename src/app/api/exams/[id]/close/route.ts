import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";

const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(req, ["TEACHER"]);
    const parsedId = idSchema.safeParse((await ctx.params).id);
    if (!parsedId.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });

    const ref = adminDb().doc(`exams/${parsedId.data}`);
    const snap = await ref.get();
    if (!snap.exists || snap.get("ownerId") !== uid) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (snap.get("status") !== "PUBLISHED") {
      return Response.json({ error: "NOT_PUBLISHED" }, { status: 409 });
    }
    await ref.update({ status: "CLOSED", closedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
