import type { NextRequest } from "next/server";
import { z } from "zod";
import { idSchema } from "@/lib/admin-rules";
import { transferOwnership } from "@/lib/admin-data";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const bodySchema = z.object({ fromUid: idSchema, toUid: idSchema });
const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Move all questions and exams of one teacher to another (e.g. before deleting a teacher). */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success || body.data.fromUid === body.data.toUid) return fail(400, "BAD_REQUEST");

    const auth = adminAuth();
    const [from, to] = await Promise.all([
      auth.getUser(body.data.fromUid).catch(() => null),
      auth.getUser(body.data.toUid).catch(() => null),
    ]);
    if (!from || !to) return fail(404, "NOT_FOUND");
    // Rules only let a TEACHER touch questions/exams, so the receiver must be an active teacher.
    if (to.customClaims?.role !== "TEACHER" || to.disabled) return fail(422, "TARGET_NOT_TEACHER");

    const moved = await transferOwnership(adminDb(), from.uid, to.uid);
    return Response.json({ ok: true, ...moved });
  } catch (err) {
    return authErrorResponse(err);
  }
}
