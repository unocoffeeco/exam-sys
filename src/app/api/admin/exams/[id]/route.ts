import type { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { deleteExamCascade } from "@/lib/admin-data";
import { examPatchSchema, idSchema, planExamUpdate } from "@/lib/admin-rules";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";
import type { ExamStatus } from "@/lib/schemas";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return fail(400, "BAD_REQUEST");

    const db = adminDb();
    const snap = await db.doc(`exams/${id.data}`).get();
    if (!snap.exists) return fail(404, "NOT_FOUND");
    const owner = await db.doc(`users/${snap.get("ownerId")}`).get();

    return Response.json({
      exam: {
        id: snap.id,
        title: String(snap.get("title") ?? ""),
        subjectId: String(snap.get("subjectId") ?? ""),
        ownerId: String(snap.get("ownerId") ?? ""),
        ownerName: String(owner.get("name") ?? ""),
        status: String(snap.get("status") ?? "DRAFT"),
        durationMin: Number(snap.get("durationMin") ?? 0),
        openAtMs: ms(snap.get("openAt")),
        closeAtMs: ms(snap.get("closeAt")),
        classroomIds: (snap.get("classroomIds") as string[] | undefined) ?? [],
        questionCount: Number(snap.get("questionCount") ?? 0),
        totalPoints: snap.get("totalPoints") == null ? null : Number(snap.get("totalPoints")),
        showResult: Boolean(snap.get("showResult")),
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}

/** Close / re-open an exam or move its window. Rules (see lib/admin-rules.ts) live in planExamUpdate. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const id = idSchema.safeParse((await ctx.params).id);
    const body = examPatchSchema.safeParse(await req.json().catch(() => null));
    if (!id.success || !body.success) return fail(400, "BAD_REQUEST");

    const db = adminDb();
    const ref = db.doc(`exams/${id.data}`);
    const [snap, paper, key] = await Promise.all([ref.get(), db.doc(`examPapers/${id.data}`).get(), db.doc(`examKeys/${id.data}`).get()]);
    if (!snap.exists) return fail(404, "NOT_FOUND");

    const plan = planExamUpdate(
      {
        status: String(snap.get("status")) as ExamStatus,
        openAtMs: ms(snap.get("openAt")),
        closeAtMs: ms(snap.get("closeAt")),
        hasPaper: paper.exists && key.exists,
      },
      body.data,
      Date.now(),
    );
    if (!plan.ok) return fail(plan.error === "NO_CHANGE" ? 409 : 422, plan.error);

    const u = plan.update;
    await ref.update({
      ...(u.status ? { status: u.status } : {}),
      ...(u.openAtMs !== undefined ? { openAt: Timestamp.fromMillis(u.openAtMs) } : {}),
      ...(u.closeAtMs !== undefined ? { closeAt: Timestamp.fromMillis(u.closeAtMs) } : {}),
      ...(u.status === "CLOSED" ? { closedAt: FieldValue.serverTimestamp() } : {}),
      ...(u.status === "PUBLISHED" ? { closedAt: FieldValue.delete() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}

/** Delete an exam with its paper, key, attempts, scores and away logs. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return fail(400, "BAD_REQUEST");

    const db = adminDb();
    if (!(await db.doc(`exams/${id.data}`).get()).exists) return fail(404, "NOT_FOUND");
    const { attempts } = await deleteExamCascade(db, id.data);
    return Response.json({ ok: true, attempts });
  } catch (err) {
    return authErrorResponse(err);
  }
}
