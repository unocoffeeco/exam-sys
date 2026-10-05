import type { NextRequest } from "next/server";
import type { Query } from "firebase-admin/firestore";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";

/** Dashboard numbers via aggregation queries (cheap: ~1 read per 1000 docs counted). */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const db = adminDb();
    const count = async (q: Query) => (await q.count().get()).data().count;

    const [admins, teachers, students, disabled, classrooms, subjects, draft, published, closed, questions, inProgress] =
      await Promise.all([
        count(db.collection("users").where("role", "==", "ADMIN")),
        count(db.collection("users").where("role", "==", "TEACHER")),
        count(db.collection("users").where("role", "==", "STUDENT")),
        count(db.collection("users").where("disabled", "==", true)),
        count(db.collection("classrooms")),
        count(db.collection("subjects")),
        count(db.collection("exams").where("status", "==", "DRAFT")),
        count(db.collection("exams").where("status", "==", "PUBLISHED")),
        count(db.collection("exams").where("status", "==", "CLOSED")),
        count(db.collection("questions")),
        count(db.collection("attempts").where("status", "==", "IN_PROGRESS")),
      ]);

    return Response.json({
      users: { admins, teachers, students, disabled },
      classrooms,
      subjects,
      exams: { draft, published, closed },
      questions,
      attemptsInProgress: inProgress,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
