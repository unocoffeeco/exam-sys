import type { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { buildOrder, checkCanStart, computeDeadlineMs, SESSION_ERROR_STATUS, SessionError } from "@/lib/exam-session";
import { adminDb } from "@/lib/firebase-admin";
import type { PaperQuestion } from "@/lib/publish";

const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(req, ["STUDENT"]);
    const parsed = idSchema.safeParse((await ctx.params).id);
    if (!parsed.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
    const examId = parsed.data;

    const db = adminDb();
    // Deterministic id: one attempt per student per exam, and Rules can exists()-check it.
    const attemptRef = db.doc(`attempts/${examId}_${uid}`);
    const examRef = db.doc(`exams/${examId}`);

    const result = await db.runTransaction(async (tx) => {
      const existing = await tx.get(attemptRef);
      if (existing.exists) return { attemptId: attemptRef.id, resumed: true }; // refresh / double click

      const [examSnap, userSnap, paperSnap] = await Promise.all([
        tx.get(examRef),
        tx.get(db.doc(`users/${uid}`)),
        tx.get(db.doc(`examPapers/${examId}`)),
      ]);
      if (!examSnap.exists) throw new SessionError("NOT_FOUND");

      const nowMs = Date.now();
      const openAtMs = (examSnap.get("openAt") as Timestamp | null)?.toMillis() ?? null;
      const closeAtMs = (examSnap.get("closeAt") as Timestamp | null)?.toMillis() ?? null;
      const problem = checkCanStart(
        {
          status: String(examSnap.get("status")),
          classroomIds: (examSnap.get("classroomIds") as string[]) ?? [],
          openAtMs,
          closeAtMs,
        },
        (userSnap.get("classroomId") as string | undefined) ?? null,
        nowMs,
      );
      if (problem) throw new SessionError(problem);
      if (!paperSnap.exists) throw new SessionError("PAPER_MISSING");

      const questions = (paperSnap.get("questions") as PaperQuestion[]).map((q) => ({
        id: q.id,
        type: q.type,
        choiceIds: q.choices.map((c) => c.id),
      }));
      const { order, choiceOrder } = buildOrder({
        questions,
        seed: attemptRef.id,
        shuffleQuestions: Boolean(examSnap.get("shuffleQuestions")),
        shuffleChoices: Boolean(examSnap.get("shuffleChoices")),
      });
      const deadlineMs = computeDeadlineMs(nowMs, Number(examSnap.get("durationMin")), closeAtMs as number);

      tx.create(attemptRef, {
        examId,
        examOwnerId: examSnap.get("ownerId"),
        studentId: uid,
        studentName: String(userSnap.get("name") ?? ""),
        classroomId: String(userSnap.get("classroomId") ?? ""),
        startedAt: FieldValue.serverTimestamp(),
        deadlineAt: Timestamp.fromMillis(deadlineMs),
        submittedAt: null,
        order,
        choiceOrder,
        answers: {},
        showResult: Boolean(examSnap.get("showResult")),
        status: "IN_PROGRESS",
      });
      return { attemptId: attemptRef.id, resumed: false };
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: err.code }, { status: SESSION_ERROR_STATUS[err.code] });
    }
    return authErrorResponse(err);
  }
}
