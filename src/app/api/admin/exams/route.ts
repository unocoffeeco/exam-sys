import type { NextRequest } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";

const ms = (v: unknown): number | null => (v && typeof (v as Timestamp).toMillis === "function" ? (v as Timestamp).toMillis() : null);

/** All exams of all teachers (Rules hide them from admins on the client, so this goes through the Admin SDK). */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const db = adminDb();
    const snap = await db.collection("exams").get();

    const ownerIds = [...new Set(snap.docs.map((d) => String(d.get("ownerId") ?? "")).filter(Boolean))];
    const owners = ownerIds.length ? await db.getAll(...ownerIds.map((id) => db.doc(`users/${id}`))) : [];
    const ownerName = new Map(owners.map((o) => [o.id, String(o.get("name") ?? "")]));

    const exams = snap.docs
      .map((d) => ({
        id: d.id,
        title: String(d.get("title") ?? ""),
        subjectId: String(d.get("subjectId") ?? ""),
        ownerId: String(d.get("ownerId") ?? ""),
        ownerName: ownerName.get(String(d.get("ownerId") ?? "")) ?? "",
        status: String(d.get("status") ?? "DRAFT"),
        durationMin: Number(d.get("durationMin") ?? 0),
        openAtMs: ms(d.get("openAt")),
        closeAtMs: ms(d.get("closeAt")),
        classroomIds: (d.get("classroomIds") as string[] | undefined) ?? [],
        questionCount: Number(d.get("questionCount") ?? (d.get("questionIds") as string[] | undefined)?.length ?? 0),
        totalPoints: d.get("totalPoints") == null ? null : Number(d.get("totalPoints")),
      }))
      .sort((a, b) => (b.openAtMs ?? 0) - (a.openAtMs ?? 0));

    return Response.json({ exams });
  } catch (err) {
    return authErrorResponse(err);
  }
}
