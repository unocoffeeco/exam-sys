import type { NextRequest } from "next/server";
import type { Query } from "firebase-admin/firestore";
import { z } from "zod";
import { CODE_RE } from "@/lib/admin-rules";
import { authErrorResponse, requireAuth } from "@/lib/auth-guard";
import { adminDb } from "@/lib/firebase-admin";

const kindSchema = z.enum(["classrooms", "subjects"]);
const idSchema = z.string().regex(CODE_RE);

/**
 * Delete a classroom / subject. If it is still referenced we answer 409 IN_USE with the counts,
 * and delete only when the admin repeats the call with ?force=1.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ kind: string; id: string }> }) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const p = await ctx.params;
    const kind = kindSchema.safeParse(p.kind);
    const id = idSchema.safeParse(p.id);
    if (!kind.success || !id.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
    const force = req.nextUrl.searchParams.get("force") === "1";

    const db = adminDb();
    const count = async (q: Query) => (await q.count().get()).data().count;

    if (!force) {
      const usage =
        kind.data === "classrooms"
          ? {
              users: await count(db.collection("users").where("classroomId", "==", id.data)),
              exams: await count(db.collection("exams").where("classroomIds", "array-contains", id.data)),
            }
          : {
              questions: await count(db.collection("questions").where("subjectId", "==", id.data)),
              exams: await count(db.collection("exams").where("subjectId", "==", id.data)),
            };
      if (Object.values(usage).some((n) => n > 0)) return Response.json({ error: "IN_USE", usage }, { status: 409 });
    }

    await db.doc(`${kind.data}/${id.data}`).delete();
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
