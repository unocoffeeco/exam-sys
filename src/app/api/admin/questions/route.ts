import type { NextRequest } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { countQuestionUsage, projectQuestion } from "@/lib/admin-rules";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Question bank across all teachers. Answers are NEVER returned (project rule: no isCorrect to clients);
 * admins see body/type/points and where the question is used.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const db = adminDb();
    const [qs, exams] = await Promise.all([db.collection("questions").get(), db.collection("exams").select("questionIds").get()]);

    const usage = countQuestionUsage(exams.docs.map((e) => (e.get("questionIds") as string[] | undefined) ?? []));
    const ownerIds = [...new Set(qs.docs.map((d) => String(d.get("ownerId") ?? "")).filter(Boolean))];
    const owners = ownerIds.length ? await db.getAll(...ownerIds.map((id) => db.doc(`users/${id}`))) : [];
    const ownerName = new Map(owners.map((o) => [o.id, String(o.get("name") ?? "")]));

    const questions = qs.docs
      .map((d) => {
        const created = d.get("createdAt") as Timestamp | undefined;
        return {
          ...projectQuestion(d.id, d.data(), usage.get(d.id) ?? 0, created?.toMillis?.() ?? null),
          ownerName: ownerName.get(String(d.get("ownerId") ?? "")) ?? "",
        };
      })
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

    return Response.json({ questions });
  } catch (err) {
    return authErrorResponse(err);
  }
}
