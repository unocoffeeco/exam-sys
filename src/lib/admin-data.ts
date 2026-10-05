// Server-only helpers for admin-console bulk operations (Admin SDK).
// Firestore batches are limited to 500 writes, so everything is chunked.
import type { DocumentReference, Firestore, Query } from "firebase-admin/firestore";
import { chunk } from "@/lib/admin-rules";

const BATCH_SIZE = 400;

export async function deleteRefs(db: Firestore, refs: DocumentReference[]): Promise<number> {
  for (const part of chunk(refs, BATCH_SIZE)) {
    const batch = db.batch();
    for (const r of part) batch.delete(r);
    await batch.commit();
  }
  return refs.length;
}

export async function deleteByQuery(db: Firestore, q: Query): Promise<number> {
  const snap = await q.select().get(); // ids only
  return deleteRefs(db, snap.docs.map((d) => d.ref));
}

export async function updateByQuery(db: Firestore, q: Query, data: Record<string, unknown>): Promise<number> {
  const snap = await q.select().get();
  for (const part of chunk(snap.docs, BATCH_SIZE)) {
    const batch = db.batch();
    for (const d of part) batch.update(d.ref, data);
    await batch.commit();
  }
  return snap.size;
}

/** Remove one attempt and everything derived from it (score doc + away log). */
export async function deleteAttemptCascade(db: Firestore, attemptId: string): Promise<void> {
  await deleteRefs(db, [
    db.doc(`attemptResults/${attemptId}`),
    db.doc(`attemptEvents/${attemptId}`),
    db.doc(`attempts/${attemptId}`),
  ]);
}

/**
 * Remove an exam and all its derived data. The exam doc goes last so a half-finished
 * run can simply be retried (the exam is still listed).
 */
export async function deleteExamCascade(db: Firestore, examId: string): Promise<{ attempts: number }> {
  const attempts = await deleteByQuery(db, db.collection("attempts").where("examId", "==", examId));
  await deleteByQuery(db, db.collection("attemptResults").where("examId", "==", examId));
  await deleteByQuery(db, db.collection("attemptEvents").where("examId", "==", examId));
  await deleteRefs(db, [db.doc(`examPapers/${examId}`), db.doc(`examKeys/${examId}`), db.doc(`exams/${examId}`)]);
  return { attempts };
}

/** Hand every question / exam (and the denormalised examOwnerId copies) from one teacher to another. */
export async function transferOwnership(
  db: Firestore,
  fromUid: string,
  toUid: string,
): Promise<{ questions: number; exams: number; attempts: number }> {
  const questions = await updateByQuery(db, db.collection("questions").where("ownerId", "==", fromUid), { ownerId: toUid });
  const exams = await updateByQuery(db, db.collection("exams").where("ownerId", "==", fromUid), { ownerId: toUid });
  const attempts = await updateByQuery(db, db.collection("attempts").where("examOwnerId", "==", fromUid), { examOwnerId: toUid });
  await updateByQuery(db, db.collection("attemptResults").where("examOwnerId", "==", fromUid), { examOwnerId: toUid });
  await updateByQuery(db, db.collection("attemptEvents").where("examOwnerId", "==", fromUid), { examOwnerId: toUid });
  return { questions, exams, attempts };
}
