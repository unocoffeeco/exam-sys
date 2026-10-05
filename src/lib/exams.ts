// Firestore access for exams (client SDK). Drafts only; publish/close go through the API.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getClientFirestore } from "@/lib/firebase-client";
import { examInputSchema, type ExamDoc, type ExamInput, type ExamStatus } from "@/lib/schemas";

const toMs = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);
const toTs = (ms: number | null) => (ms == null ? null : Timestamp.fromMillis(ms));

function toDoc(id: string, d: Record<string, unknown>): ExamDoc {
  return {
    id,
    ownerId: String(d.ownerId ?? ""),
    status: (d.status as ExamStatus) ?? "DRAFT",
    title: String(d.title ?? ""),
    subjectId: String(d.subjectId ?? ""),
    durationMin: Number(d.durationMin ?? 60),
    openAtMs: toMs(d.openAt),
    closeAtMs: toMs(d.closeAt),
    shuffleQuestions: Boolean(d.shuffleQuestions),
    shuffleChoices: Boolean(d.shuffleChoices),
    showResult: Boolean(d.showResult),
    classroomIds: (d.classroomIds as string[]) ?? [],
    questionIds: (d.questionIds as string[]) ?? [],
    questionCount: d.questionCount as number | undefined,
    totalPoints: d.totalPoints as number | undefined,
  };
}

export const examFromData = toDoc;

export async function listMyExams(uid: string): Promise<ExamDoc[]> {
  const snap = await getDocs(query(collection(getClientFirestore(), "exams"), where("ownerId", "==", uid)));
  return snap.docs.map((d) => toDoc(d.id, d.data())).sort((a, b) => (b.openAtMs ?? 0) - (a.openAtMs ?? 0));
}

export async function getMyExam(id: string, uid: string): Promise<ExamDoc | null> {
  const snap = await getDoc(doc(getClientFirestore(), "exams", id));
  if (!snap.exists()) return null;
  const e = toDoc(snap.id, snap.data());
  return e.ownerId === uid ? e : null;
}

export async function saveExam(uid: string, input: ExamInput, id?: string): Promise<string> {
  const e = examInputSchema.parse(input);
  const data = {
    title: e.title,
    subjectId: e.subjectId,
    durationMin: e.durationMin,
    openAt: toTs(e.openAtMs),
    closeAt: toTs(e.closeAtMs),
    shuffleQuestions: e.shuffleQuestions,
    shuffleChoices: e.shuffleChoices,
    showResult: e.showResult,
    classroomIds: e.classroomIds,
    questionIds: e.questionIds,
    status: "DRAFT" as const, // Rules only allow DRAFT from the client
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(getClientFirestore(), "exams", id), data);
    return id;
  }
  const ref = await addDoc(collection(getClientFirestore(), "exams"), {
    ...data,
    ownerId: uid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteExam(id: string): Promise<void> {
  await deleteDoc(doc(getClientFirestore(), "exams", id));
}

export async function listClassrooms(): Promise<{ id: string; name: string }[]> {
  const snap = await getDocs(collection(getClientFirestore(), "classrooms"));
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}
