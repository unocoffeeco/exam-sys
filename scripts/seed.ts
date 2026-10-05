import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { isRole, type Role } from "../src/lib/roles";

const PROJECT_ID = "demo-exam-system";
const CLASSROOM_ID = "m4-1";
const PASSWORD = "Test1234!";

const USERS: { email: string; name: string; role: Role; classroomId?: string }[] = [
  { email: "admin@test.com", name: "ผู้ดูแลระบบ", role: "ADMIN" },
  { email: "teacher@test.com", name: "ครูสมชาย", role: "TEACHER" },
  { email: "student@test.com", name: "นักเรียนทดสอบ", role: "STUDENT", classroomId: CLASSROOM_ID },
];

function assertEmulatorOnly(): void {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID;

  const isLocal = (host?: string) =>
    !!host && /^(127\.0\.0\.1|localhost|\[::1\]):/.test(host);

  if (!isLocal(fsHost) || !isLocal(authHost)) {
    throw new Error(
      "Refusing to run: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST must point to a local emulator. Run via `npm run seed`.",
    );
  }
  if (projectId !== PROJECT_ID) {
    throw new Error(`Refusing to run: GCLOUD_PROJECT must be "${PROJECT_ID}" (got "${projectId ?? "unset"}").`);
  }
}

async function main() {
  assertEmulatorOnly(); // MUST run before the Admin SDK initializes

  const app = getApps().length > 0 ? getApp() : initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);

  // stable classroom doc (idempotent)
  await db.doc(`classrooms/${CLASSROOM_ID}`).set(
    { name: "ม.4/1", createdAt: new Date().toISOString() },
    { merge: true },
  );

  const SUBJECTS = [
    { id: "math", name: "คณิตศาสตร์" },
    { id: "thai", name: "ภาษาไทย" },
    { id: "science", name: "วิทยาศาสตร์" },
    { id: "english", name: "ภาษาอังกฤษ" },
    { id: "social", name: "สังคมศึกษา" },
  ];
  for (const s of SUBJECTS) {
    await db.doc(`subjects/${s.id}`).set({ name: s.name }, { merge: true });
  }

  for (const u of USERS) {
    if (!isRole(u.role)) throw new Error(`Invalid role for ${u.email}`);

    let uid: string;
    try {
      uid = (await auth.getUserByEmail(u.email)).uid;
      await auth.updateUser(uid, { password: PASSWORD, displayName: u.name });
    } catch (err) {
      if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      uid = (await auth.createUser({ email: u.email, password: PASSWORD, displayName: u.name })).uid;
    }

    // custom claims are the source of truth for authorization
    await auth.setCustomUserClaims(uid, {
      role: u.role,
      ...(u.classroomId ? { classroomId: u.classroomId } : {}),
    });

    await db.doc(`users/${uid}`).set(
      {
        name: u.name,
        email: u.email,
        role: u.role,
        classroomId: u.classroomId ?? null,
      },
      { merge: true },
    );

    console.log(`✔ ${u.role.padEnd(7)} ${u.email} (uid=${uid})`);
  }

  console.log("\nSeed complete. Password for all accounts:", PASSWORD);
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
