import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";
import { computeFinalScore, round2 } from "@/lib/grading";
import type { KeyEntry } from "@/lib/publish";

const idSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);
const bodySchema = z.object({
  scores: z.record(z.string().max(128), z.number().min(0).max(1000)).refine((s) => Object.keys(s).length <= 300),
});

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

/** Teacher gives manual (essay) scores; recomputes the final score and status. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(req, ["TEACHER"]);
    const id = idSchema.safeParse((await ctx.params).id);
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!id.success || !body.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });

    const db = adminDb();
    const attemptRef = db.doc(`attempts/${id.data}`);
    const resultRef = db.doc(`attemptResults/${id.data}`);

    const out = await db.runTransaction(async (tx) => {
      const [attempt, result] = await Promise.all([tx.get(attemptRef), tx.get(resultRef)]);
      if (!attempt.exists || attempt.get("examOwnerId") !== uid) throw new HttpError(404, "NOT_FOUND");
      if (attempt.get("submittedAt") == null || !result.exists) throw new HttpError(409, "NOT_SUBMITTED");

      const keySnap = await tx.get(db.doc(`examKeys/${attempt.get("examId")}`));
      const key = keySnap.get("answers") as Record<string, KeyEntry>;

      const incoming: Record<string, number> = {};
      for (const [qid, v] of Object.entries(body.data.scores)) {
        const entry = key[qid];
        // only essay questions can be scored by hand, and not above their max points
        if (!entry || entry.type !== "ESSAY" || v > entry.points) throw new HttpError(422, "BAD_SCORES");
        incoming[qid] = round2(v);
      }
      const manual = { ...(result.get("manualScores") ?? {}), ...incoming } as Record<string, number>;
      const final = computeFinalScore(key, result.get("autoScore") as number, manual);
      const status = final.allGraded ? "GRADED" : "SUBMITTED";

      tx.update(resultRef, {
        manualScores: manual,
        score: final.score,
        maxScore: final.maxScore,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(attemptRef, { status });
      return { status, score: final.score, maxScore: final.maxScore };
    });

    return Response.json(out);
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ error: err.code }, { status: err.status });
    return authErrorResponse(err);
  }
}
