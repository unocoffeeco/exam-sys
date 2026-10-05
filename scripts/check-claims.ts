// READ-ONLY audit of real Firebase: do Auth custom claims match what the rules/API expect?
// Run: npm run check:claims   (reads .env.local; writes nothing)
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const ROLES = new Set(["ADMIN", "TEACHER", "STUDENT"]);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Emulator env vars are set; unset them to audit real Firebase.");
  }
  const projectId = required("FIREBASE_PROJECT_ID");
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail: required("FIREBASE_CLIENT_EMAIL"),
            privateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
          }),
          projectId,
        });
  const auth = getAuth(app);
  const db = getFirestore(app);
  console.log(`Auditing project: ${projectId} (read-only)\n`);

  const classrooms = new Set((await db.collection("classrooms").get()).docs.map((d) => d.id));
  const userDocs = new Map((await db.collection("users").get()).docs.map((d) => [d.id, d.data()]));

  const problems: string[] = [];
  const counts: Record<string, number> = {};
  let total = 0;
  const authUids = new Set<string>();

  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      total++;
      authUids.add(u.uid);
      const claims = (u.customClaims ?? {}) as { role?: unknown; classroomId?: unknown };
      const role = typeof claims.role === "string" ? claims.role : undefined;
      const who = `${u.email ?? "(no email)"} [${u.uid}]`;
      counts[role ?? "NO_ROLE"] = (counts[role ?? "NO_ROLE"] ?? 0) + 1;

      if (!role || !ROLES.has(role)) {
        problems.push(`NO/INVALID role claim: ${who} (got ${JSON.stringify(claims.role)})`);
        continue;
      }
      if (role === "STUDENT") {
        const cid = typeof claims.classroomId === "string" ? claims.classroomId : "";
        if (!cid) problems.push(`STUDENT without classroomId claim: ${who}`);
        else if (!classrooms.has(cid)) problems.push(`STUDENT classroomId "${cid}" not in classrooms/: ${who}`);
      }
      const doc = userDocs.get(u.uid);
      if (!doc) {
        problems.push(`No users/${u.uid} document: ${who}`);
      } else {
        if (doc.role !== role) problems.push(`Role mismatch claim=${role} doc=${String(doc.role)}: ${who}`);
        if (role === "STUDENT" && (doc.classroomId ?? "") !== (claims.classroomId ?? "")) {
          problems.push(`classroomId mismatch claim=${String(claims.classroomId)} doc=${String(doc.classroomId)}: ${who}`);
        }
      }
      if (u.disabled) counts["(disabled accounts)"] = (counts["(disabled accounts)"] ?? 0) + 1;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  for (const uid of userDocs.keys()) {
    if (!authUids.has(uid)) problems.push(`users/${uid} has no Auth account (orphan doc)`);
  }

  console.log(`Auth users: ${total}`, counts);
  console.log(`classrooms: ${[...classrooms].join(", ") || "(none)"}\n`);
  if (problems.length === 0) console.log("✔ No problems found.");
  else {
    console.log(`✖ ${problems.length} problem(s):`);
    for (const p of problems) console.log(" -", p);
  }
}

main().catch((err) => {
  console.error("Audit failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
