// Teacher-side loading of an exam's results (client SDK, protected by Rules).
// Quota: 2 queries per report view (attempts + attemptResults), no per-student reads.
import { collection, getDocs, query, Timestamp, where, type DocumentData, type QuerySnapshot } from "firebase/firestore";
import { SUBMIT_GRACE_MS } from "@/lib/exam-session";
import { getClientFirestore } from "@/lib/firebase-client";
import type { RowStatus } from "@/lib/report";

export type ResultRow = {
  attemptId: string;
  studentName: string;
  classroomId: string;
  status: RowStatus;
  score: number | null;
  maxScore: number | null;
  submittedAtMs: number | null;
  /** From attempts.integrity (server-written): times the student left the exam page. */
  awayCount: number;
  awayTotalMs: number;
};

type Snap = QuerySnapshot<DocumentData>;

function buildRows(attempts: Snap, results: Snap): { rows: ResultRow[]; expiredCount: number } {
  const resultById = new Map(results.docs.map((d) => [d.id, d.data()]));
  const now = Date.now();
  let expiredCount = 0;

  const rows: ResultRow[] = attempts.docs.map((d) => {
    const a = d.data();
    const submitted = a.submittedAt != null;
    const res = resultById.get(d.id);
    let status: RowStatus;
    if (!submitted) {
      const deadline = a.deadlineAt instanceof Timestamp ? a.deadlineAt.toMillis() : 0;
      const expired = now > deadline + SUBMIT_GRACE_MS;
      if (expired) expiredCount++;
      status = expired ? "EXPIRED" : "IN_PROGRESS";
    } else {
      status = res?.status === "GRADED" ? "GRADED" : "PENDING_MANUAL";
    }
    return {
      attemptId: d.id,
      studentName: String(a.studentName ?? "(ไม่ระบุชื่อ)"),
      classroomId: String(a.classroomId ?? ""),
      status,
      score: typeof res?.score === "number" ? res.score : null,
      maxScore: typeof res?.maxScore === "number" ? res.maxScore : null,
      submittedAtMs: a.submittedAt instanceof Timestamp ? a.submittedAt.toMillis() : null,
      awayCount: Number(a.integrity?.awayCount ?? 0) || 0,
      awayTotalMs: Number(a.integrity?.awayTotalMs ?? 0) || 0,
    };
  });
  rows.sort((x, y) => x.classroomId.localeCompare(y.classroomId, "th") || x.studentName.localeCompare(y.studentName, "th"));
  return { rows, expiredCount };
}

export async function loadExamResults(
  examId: string,
  uid: string,
): Promise<{ rows: ResultRow[]; expiredCount: number }> {
  const db = getClientFirestore();
  const [attempts, results] = await Promise.all([
    getDocs(query(collection(db, "attempts"), where("examOwnerId", "==", uid), where("examId", "==", examId))),
    getDocs(query(collection(db, "attemptResults"), where("examOwnerId", "==", uid), where("examId", "==", examId))),
  ]);
  return buildRows(attempts, results);
}

/** Admin variant: all attempts of the exam regardless of owner (Rules allow admins to read both collections). */
export async function loadExamResultsAsAdmin(examId: string): Promise<{ rows: ResultRow[]; expiredCount: number }> {
  const db = getClientFirestore();
  const [attempts, results] = await Promise.all([
    getDocs(query(collection(db, "attempts"), where("examId", "==", examId))),
    getDocs(query(collection(db, "attemptResults"), where("examId", "==", examId))),
  ]);
  return buildRows(attempts, results);
}
