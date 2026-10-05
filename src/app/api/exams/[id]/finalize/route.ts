import type { NextRequest } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { finalizeAttemptTx } from "@/lib/attempt-server";
import { SUBMIT_GRACE_MS } from "@/lib/exam-session";
import { adminDb } from "@/lib/firebase-admin";
import type { KeyEntry } from "@/lib/publish";

const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const MAX_PER_CALL = 500;

/**
 * Lazy grading (no scheduled functions on Spark): grade attempts whose deadline has passed
 * but were never submitted (student closed the browser). Called when a teacher opens the report.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(req, ["TEACHER"]);
    const parsed = idSchema.safeParse((await ctx.params).id);
    if (!parsed.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
    const examId = parsed.data;

    const db = adminDb();
    const examSnap = await db.doc(`exams/${examId}`).get();
    if (!examSnap.exists || examSnap.get("ownerId") !== uid) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const keySnap = await db.doc(`examKeys/${examId}`).get();
    if (!keySnap.exists) return Response.json({ finalized: 0 });
    const key = keySnap.get("answers") as Record<string, KeyEntry>;

    const cutoff = Date.now() - SUBMIT_GRACE_MS;
    const snaps = await db.collection("attempts").where("examId", "==", examId).where("examOwnerId", "==", uid).get();
    const expired = snaps.docs
      .filter((d) => d.get("submittedAt") == null && (d.get("deadlineAt") as Timestamp).toMillis() < cutoff)
      .slice(0, MAX_PER_CALL);

    let finalized = 0;
    for (const d of expired) {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(d.ref); // may have been submitted meanwhile
        if (fresh.get("submittedAt") != null) return;
        finalizeAttemptTx(tx, db, fresh, key, undefined, Date.now());
        finalized++;
      });
    }
    return Response.json({ finalized });
  } catch (err) {
    return authErrorResponse(err);
  }
}
