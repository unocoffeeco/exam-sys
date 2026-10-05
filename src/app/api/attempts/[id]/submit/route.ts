import type { NextRequest } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { finalizeAttemptTx, type SubmitResult } from "@/lib/attempt-server";
import { SESSION_ERROR_STATUS, SessionError } from "@/lib/exam-session";
import { adminDb } from "@/lib/firebase-admin";
import type { KeyEntry } from "@/lib/publish";

const idSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);
const bodySchema = z.object({
  // final answers from the client; only used if still within deadline + grace
  answers: z.record(z.string().max(128), z.string().max(5000)).refine((a) => Object.keys(a).length <= 300).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(req, ["STUDENT"]);
    const parsedId = idSchema.safeParse((await ctx.params).id);
    if (!parsedId.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
    const body = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });

    const db = adminDb();
    const attemptRef = db.doc(`attempts/${parsedId.data}`);

    const result = await db.runTransaction(async (tx): Promise<SubmitResult> => {
      const snap = await tx.get(attemptRef);
      if (!snap.exists || snap.get("studentId") !== uid) throw new SessionError("NOT_FOUND");

      if (snap.get("submittedAt") != null) {
        // idempotent: double submit / retry returns the existing outcome
        const showResult = Boolean(snap.get("showResult"));
        const resSnap = await tx.get(db.doc(`attemptResults/${snap.id}`));
        const final = resSnap.get("status") === "GRADED";
        return {
          status: snap.get("status"),
          showResult,
          score: showResult && final ? resSnap.get("score") : null,
          maxScore: showResult && final ? resSnap.get("maxScore") : null,
        };
      }

      const keySnap = await tx.get(db.doc(`examKeys/${snap.get("examId")}`));
      if (!keySnap.exists) throw new SessionError("PAPER_MISSING");
      return finalizeAttemptTx(tx, db, snap, keySnap.get("answers") as Record<string, KeyEntry>, body.data.answers, Date.now());
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: err.code }, { status: SESSION_ERROR_STATUS[err.code] });
    }
    return authErrorResponse(err);
  }
}
