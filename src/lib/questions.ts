// Firestore access for the teacher's question bank (client SDK, protected by Rules).
// Quota note: one query per list page, no listeners, no composite index (sorted in memory).
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { getClientFirestore } from "@/lib/firebase-client";
import {
  normalizeQuestion,
  questionInputSchema,
  type QuestionDoc,
  type QuestionInput,
} from "@/lib/schemas";

type Timestampish = Timestamp | null | undefined;
const ms = (t: Timestampish) => (t instanceof Timestamp ? t.toMillis() : undefined);

function toDoc(id: string, data: Record<string, unknown>): QuestionDoc {
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    subjectId: String(data.subjectId ?? ""),
    type: data.type as QuestionDoc["type"],
    body: String(data.body ?? ""),
    points: Number(data.points ?? 1),
    choices: (data.choices as QuestionDoc["choices"]) ?? [],
    acceptedAnswers: (data.acceptedAnswers as string[]) ?? [],
    explanation: String(data.explanation ?? ""),
    createdAt: ms(data.createdAt as Timestampish),
    updatedAt: ms(data.updatedAt as Timestampish),
  };
}

export async function listMyQuestions(uid: string): Promise<QuestionDoc[]> {
  const snap = await getDocs(
    query(collection(getClientFirestore(), "questions"), where("ownerId", "==", uid)),
  );
  return snap.docs
    .map((d) => toDoc(d.id, d.data()))
    .sort((a, b) => (b.createdAt ?? Date.now()) - (a.createdAt ?? Date.now()));
}

export async function getMyQuestion(id: string, uid: string): Promise<QuestionDoc | null> {
  const snap = await getDoc(doc(getClientFirestore(), "questions", id));
  if (!snap.exists()) return null;
  const q = toDoc(snap.id, snap.data());
  return q.ownerId === uid ? q : null;
}

/** Validates with Zod, then creates (id omitted) or updates. Returns the doc id. */
export async function saveQuestion(uid: string, input: QuestionInput, id?: string): Promise<string> {
  const data = normalizeQuestion(questionInputSchema.parse(input));
  const db = getClientFirestore();
  if (id) {
    // merge keeps ownerId/createdAt; Rules block changing ownerId
    await setDoc(doc(db, "questions", id), { ...data, ownerId: uid, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(db, "questions"), {
    ...data,
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteQuestion(id: string): Promise<void> {
  await deleteDoc(doc(getClientFirestore(), "questions", id));
}

export async function listSubjects(): Promise<{ id: string; name: string }[]> {
  const snap = await getDocs(collection(getClientFirestore(), "subjects"));
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}
