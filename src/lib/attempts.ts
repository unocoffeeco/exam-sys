// Student-side Firestore access for attempts and papers (client SDK, protected by Rules).
import { collection, doc, getDoc, getDocs, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { getClientFirestore } from "@/lib/firebase-client";
import type { PaperQuestion } from "@/lib/publish";

export type AttemptDoc = {
  id: string;
  examId: string;
  studentId: string;
  deadlineMs: number;
  submitted: boolean;
  status: string;
  order: string[];
  choiceOrder: Record<string, string[]>;
  answers: Record<string, string>;
  showResult: boolean;
  studentName: string;
  classroomId: string;
  /** Number of away-from-exam episodes recorded by the server (see lib/integrity.ts). */
  awayCount: number;
};

function toAttempt(id: string, d: Record<string, unknown>): AttemptDoc {
  return {
    id,
    examId: String(d.examId),
    studentId: String(d.studentId),
    deadlineMs: d.deadlineAt instanceof Timestamp ? d.deadlineAt.toMillis() : 0,
    submitted: d.submittedAt != null,
    status: String(d.status ?? "IN_PROGRESS"),
    order: (d.order as string[]) ?? [],
    choiceOrder: (d.choiceOrder as Record<string, string[]>) ?? {},
    answers: (d.answers as Record<string, string>) ?? {},
    showResult: Boolean(d.showResult),
    studentName: String(d.studentName ?? ""),
    classroomId: String(d.classroomId ?? ""),
    awayCount: Number((d.integrity as { awayCount?: unknown } | undefined)?.awayCount ?? 0) || 0,
  };
}

export async function getAttempt(id: string): Promise<AttemptDoc | null> {
  const snap = await getDoc(doc(getClientFirestore(), "attempts", id));
  return snap.exists() ? toAttempt(snap.id, snap.data()) : null;
}

export async function listMyAttempts(uid: string): Promise<AttemptDoc[]> {
  const snap = await getDocs(query(collection(getClientFirestore(), "attempts"), where("studentId", "==", uid)));
  return snap.docs.map((d) => toAttempt(d.id, d.data()));
}

export async function getPaper(examId: string): Promise<PaperQuestion[]> {
  const snap = await getDoc(doc(getClientFirestore(), "examPapers", examId));
  if (!snap.exists()) throw new Error("PAPER_MISSING");
  return snap.get("questions") as PaperQuestion[];
}

/** One write for any number of answers (field paths keep other answers untouched). */
export async function flushAnswers(attemptId: string, updates: Record<string, string>): Promise<void> {
  const payload = Object.fromEntries(Object.entries(updates).map(([qid, v]) => [`answers.${qid}`, v]));
  await updateDoc(doc(getClientFirestore(), "attempts", attemptId), payload);
}

export type ScoreView = { score: number; maxScore: number };

/** The student's own score, or null when Rules hide it (showResult off / not fully graded). */
export async function getMyResult(attemptId: string): Promise<ScoreView | null> {
  try {
    const snap = await getDoc(doc(getClientFirestore(), "attemptResults", attemptId));
    if (!snap.exists()) return null;
    return { score: Number(snap.get("score")), maxScore: Number(snap.get("maxScore")) };
  } catch {
    return null; // permission-denied = hidden by Rules
  }
}

/** All scores this student may see, keyed by examId (one query). */
export async function listMyVisibleResults(uid: string): Promise<Record<string, ScoreView>> {
  const snap = await getDocs(
    query(
      collection(getClientFirestore(), "attemptResults"),
      where("studentId", "==", uid),
      where("showResult", "==", true),
      where("status", "==", "GRADED"),
    ),
  );
  return Object.fromEntries(
    snap.docs.map((d) => [String(d.get("examId")), { score: Number(d.get("score")), maxScore: Number(d.get("maxScore")) }]),
  );
}
