import type { NextRequest } from "next/server";
import { z } from "zod";
import { chunk, CODE_RE, claimsFor } from "@/lib/admin-rules";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const idSchema = z.string().regex(CODE_RE);
const bodySchema = z.object({ toClassroomId: idSchema });
const MAX_PER_CALL = 200; // keeps one request inside serverless time limits; the UI says how many remain
const PARALLEL = 10;

/** Move every student of one classroom to another (e.g. end-of-year promotion). Claims + users doc stay in sync. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const from = idSchema.safeParse((await ctx.params).id);
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!from.success || !body.success || from.data === body.data.toClassroomId) {
      return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const to = body.data.toClassroomId;

    const db = adminDb();
    const auth = adminAuth();
    if (!(await db.doc(`classrooms/${to}`).get()).exists) return Response.json({ error: "CLASSROOM_NOT_FOUND" }, { status: 422 });

    const snap = await db.collection("users").where("classroomId", "==", from.data).where("role", "==", "STUDENT").get();
    const batchDocs = snap.docs.slice(0, MAX_PER_CALL);

    let moved = 0;
    let failed = 0;
    for (const group of chunk(batchDocs, PARALLEL)) {
      const results = await Promise.allSettled(
        group.map(async (d) => {
          await auth.setCustomUserClaims(d.id, claimsFor("STUDENT", to));
          await auth.revokeRefreshTokens(d.id); // force re-login so the new claim applies
          await d.ref.update({ classroomId: to });
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") moved++;
        else failed++;
      }
    }

    return Response.json({ ok: true, moved, failed, remaining: Math.max(0, snap.size - batchDocs.length) });
  } catch (err) {
    return authErrorResponse(err);
  }
}
