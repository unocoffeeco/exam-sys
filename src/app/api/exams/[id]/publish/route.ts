import type { NextRequest } from "next/server";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";
import { PublishError, buildPaperAndKey, validateExamForPublish } from "@/lib/publish";
import type { QuestionInput } from "@/lib/schemas";

const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

const json = (error: string, status: number, extra?: object) =>
  Response.json({ error, ...extra }, { status });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(req, ["TEACHER"]);
    const parsedId = idSchema.safeParse((await ctx.params).id);
    if (!parsedId.success) return json("BAD_REQUEST", 400);
    const examId = parsedId.data;

    const db = adminDb();
    const examRef = db.doc(`exams/${examId}`);
    const examSnap = await examRef.get();
    // same response for "missing" and "not yours" so ids can't be probed
    if (!examSnap.exists || examSnap.get("ownerId") !== uid) return json("NOT_FOUND", 404);
    if (examSnap.get("status") !== "DRAFT") return json("NOT_DRAFT", 409);

    const questionIds: string[] = examSnap.get("questionIds") ?? [];
    const draft = {
      title: String(examSnap.get("title") ?? ""),
      durationMin: Number(examSnap.get("durationMin")),
      openAtMs: (examSnap.get("openAt") as Timestamp | null)?.toMillis() ?? null,
      closeAtMs: (examSnap.get("closeAt") as Timestamp | null)?.toMillis() ?? null,
      classroomIds: (examSnap.get("classroomIds") as string[]) ?? [],
      questionIds,
    };
    const problems = validateExamForPublish(draft, Date.now());
    if (problems.length > 0) return json("INVALID_EXAM", 422, { problems });

    // Load all questions in one round trip; every one must belong to this teacher
    const qSnaps = await db.getAll(...questionIds.map((id) => db.doc(`questions/${id}`)));
    const questions: Array<QuestionInput & { id: string }> = [];
    for (const s of qSnaps) {
      if (!s.exists || s.get("ownerId") !== uid) return json("INVALID_EXAM", 422, { problems: ["INVALID_QUESTION"] });
      questions.push({ ...(s.data() as QuestionInput), id: s.id });
    }

    const { paper, key, totalPoints } = buildPaperAndKey(questions, questionIds);

    const batch = db.batch();
    batch.set(db.doc(`examPapers/${examId}`), paper);
    batch.set(db.doc(`examKeys/${examId}`), key);
    batch.update(examRef, {
      status: "PUBLISHED",
      questionCount: questionIds.length,
      totalPoints,
      publishedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return Response.json({ ok: true, questionCount: questionIds.length, totalPoints });
  } catch (err) {
    if (err instanceof PublishError) return json("INVALID_EXAM", 422, { problems: [err.code] });
    return authErrorResponse(err);
  }
}
