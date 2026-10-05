// Server-only: grades a submitted attempt inside a transaction and writes the result doc.
// Used by /api/attempts/[id]/submit and /api/exams/[id]/finalize (lazy grading).
import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { canAcceptAnswers } from "@/lib/exam-session";
import { gradeAttempt } from "@/lib/grading";
import type { KeyEntry } from "@/lib/publish";

export type SubmitResult = {
  status: string;
  showResult: boolean;
  score: number | null;
  maxScore: number | null;
};

/** Reads must already be done (tx.get) — this function only writes. */
export function finalizeAttemptTx(
  tx: Transaction,
  db: Firestore,
  attemptSnap: DocumentSnapshot,
  key: Record<string, KeyEntry>,
  clientAnswers: Record<string, string> | undefined,
  nowMs: number,
): SubmitResult {
  const showResult = Boolean(attemptSnap.get("showResult"));
  const answers: Record<string, string> = { ...(attemptSnap.get("answers") ?? {}) };
  const deadlineMs = (attemptSnap.get("deadlineAt") as Timestamp).toMillis();

  if (clientAnswers && canAcceptAnswers(nowMs, deadlineMs)) {
    for (const [qid, v] of Object.entries(clientAnswers)) {
      if (key[qid]) answers[qid] = v; // ignore ids that are not in this exam
    }
  }

  const g = gradeAttempt(key, answers);
  const status = g.hasManual ? "SUBMITTED" : "GRADED";

  tx.update(attemptSnap.ref, {
    answers,
    submittedAt: FieldValue.serverTimestamp(),
    status,
  });
  // Scores live in a separate doc so Rules can hide them from students (showResult / GRADED).
  tx.set(db.doc(`attemptResults/${attemptSnap.id}`), {
    examId: attemptSnap.get("examId"),
    examOwnerId: attemptSnap.get("examOwnerId"),
    studentId: attemptSnap.get("studentId"),
    studentName: attemptSnap.get("studentName") ?? "",
    classroomId: attemptSnap.get("classroomId") ?? "",
    showResult,
    status,
    autoScore: g.autoScore,
    autoScores: g.autoScores,
    manualScores: {},
    score: g.autoScore,
    maxScore: g.maxScore,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const visible = showResult && !g.hasManual;
  return { status, showResult, score: visible ? g.autoScore : null, maxScore: visible ? g.maxScore : null };
}
