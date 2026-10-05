import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "demo-exam-system";
let env: RulesTestEnvironment;

// ---- actors -------------------------------------------------------------
const ADMIN = { uid: "admin1", claims: { role: "ADMIN" } };
const T1 = { uid: "teacher1", claims: { role: "TEACHER" } };
const T2 = { uid: "teacher2", claims: { role: "TEACHER" } };
const S1 = { uid: "student1", claims: { role: "STUDENT", classroomId: "m4-1" } };
const S_OTHER_ROOM = { uid: "student3", claims: { role: "STUDENT", classroomId: "m4-2" } };
const NO_ROLE = { uid: "norole", claims: {} };

const db = (a: { uid: string; claims: Record<string, unknown> }) =>
  env.authenticatedContext(a.uid, a.claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const future = () => Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
const past = () => Timestamp.fromMillis(Date.now() - 60 * 1000);

// ---- fixtures -----------------------------------------------------------
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, "users/student1"), { name: "S1", role: "STUDENT", classroomId: "m4-1" });
    await setDoc(doc(d, "users/student2"), { name: "S2", role: "STUDENT", classroomId: "m4-1" });
    await setDoc(doc(d, "classrooms/m4-1"), { name: "ม.4/1" });
    await setDoc(doc(d, "subjects/math"), { name: "คณิตศาสตร์" });

    await setDoc(doc(d, "questions/q1"), { ownerId: "teacher1", body: "1+1", choices: [{ id: "a", isCorrect: true }] });

    await setDoc(doc(d, "exams/examPub"), {
      ownerId: "teacher1", status: "PUBLISHED", classroomIds: ["m4-1"], title: "pub",
    });
    await setDoc(doc(d, "exams/examDraft"), {
      ownerId: "teacher1", status: "DRAFT", classroomIds: ["m4-1"], title: "draft",
    });

    await setDoc(doc(d, "examPapers/examPub"), { questions: [{ id: "q1", body: "1+1" }] });
    await setDoc(doc(d, "examKeys/examPub"), { answers: { q1: "a" } });

    // student1 has started examPub (attempt id = {examId}_{uid}); deadline in the future
    await setDoc(doc(d, "attempts/examPub_student1"), {
      examId: "examPub", examOwnerId: "teacher1", studentId: "student1",
      startedAt: Timestamp.now(), deadlineAt: future(), submittedAt: null,
      answers: {}, score: null, status: "IN_PROGRESS",
    });
    // student2's attempt (to test cross-student access)
    await setDoc(doc(d, "attempts/examPub_student2"), {
      examId: "examPub", examOwnerId: "teacher1", studentId: "student2",
      startedAt: Timestamp.now(), deadlineAt: future(), submittedAt: null,
      answers: {}, score: null, status: "IN_PROGRESS",
    });
    // expired attempt, already submitted attempt
    await setDoc(doc(d, "attempts/examExpired_student1"), {
      examId: "examExpired", examOwnerId: "teacher1", studentId: "student1",
      startedAt: Timestamp.now(), deadlineAt: past(), submittedAt: null,
      answers: {}, score: null, status: "IN_PROGRESS",
    });
    await setDoc(doc(d, "attempts/examDone_student1"), {
      examId: "examDone", examOwnerId: "teacher1", studentId: "student1",
      startedAt: Timestamp.now(), deadlineAt: future(), submittedAt: Timestamp.now(),
      answers: { q1: "a" }, score: 1, status: "SUBMITTED",
    });
    // results: student1 visible (showResult, GRADED); student2 hidden (showResult false); pending one
    await setDoc(doc(d, "attemptResults/examPub_student1"), {
      examId: "examPub", examOwnerId: "teacher1", studentId: "student1",
      showResult: true, status: "GRADED", score: 8, maxScore: 10,
    });
    await setDoc(doc(d, "attemptResults/examPub_student2"), {
      examId: "examPub", examOwnerId: "teacher1", studentId: "student2",
      showResult: false, status: "GRADED", score: 3, maxScore: 10,
    });
    await setDoc(doc(d, "attemptResults/examDone_student1"), {
      examId: "examDone", examOwnerId: "teacher1", studentId: "student1",
      showResult: true, status: "SUBMITTED", score: 1, maxScore: 10,
    });
    // attempt of an exam owned by teacher2
    await setDoc(doc(d, "attempts/examT2_student1"), {
      examId: "examT2", examOwnerId: "teacher2", studentId: "student1",
      startedAt: Timestamp.now(), deadlineAt: future(), submittedAt: null,
      answers: {}, score: null, status: "IN_PROGRESS",
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

// ========================================================================
describe("unauthenticated / no role", () => {
  it("anonymous cannot read anything", async () => {
    await assertFails(getDoc(doc(anon(), "classrooms/m4-1")));
    await assertFails(getDoc(doc(anon(), "examPapers/examPub")));
    await assertFails(getDoc(doc(anon(), "attempts/examPub_student1")));
  });
  it("signed-in user without role claim cannot read questions/exams/papers", async () => {
    await assertFails(getDoc(doc(db(NO_ROLE), "questions/q1")));
    await assertFails(getDoc(doc(db(NO_ROLE), "exams/examPub")));
    await assertFails(getDoc(doc(db(NO_ROLE), "examPapers/examPub")));
  });
});

describe("examKeys (answer keys)", () => {
  it("nobody can read or write from the client", async () => {
    for (const a of [S1, T1, ADMIN]) {
      await assertFails(getDoc(doc(db(a), "examKeys/examPub")));
      await assertFails(setDoc(doc(db(a), "examKeys/examPub"), { answers: {} }));
    }
  });
});

describe("users", () => {
  it("user reads own doc; student cannot read others", async () => {
    await assertSucceeds(getDoc(doc(db(S1), "users/student1")));
    await assertFails(getDoc(doc(db(S1), "users/student2")));
  });
  it("teacher/admin can read users", async () => {
    await assertSucceeds(getDoc(doc(db(T1), "users/student1")));
    await assertSucceeds(getDoc(doc(db(ADMIN), "users/student1")));
  });
  it("nobody writes users from the client (incl. self-promotion)", async () => {
    await assertFails(updateDoc(doc(db(S1), "users/student1"), { role: "ADMIN" }));
    await assertFails(setDoc(doc(db(ADMIN), "users/newuser"), { role: "ADMIN" }));
  });
});

describe("classrooms / subjects", () => {
  it("signed-in can read; only admin can write", async () => {
    await assertSucceeds(getDoc(doc(db(S1), "classrooms/m4-1")));
    await assertSucceeds(getDoc(doc(db(S1), "subjects/math")));
    await assertFails(setDoc(doc(db(T1), "classrooms/x"), { name: "x" }));
    await assertFails(setDoc(doc(db(S1), "subjects/x"), { name: "x" }));
    await assertSucceeds(setDoc(doc(db(ADMIN), "classrooms/m4-3"), { name: "ม.4/3" }));
  });
});

describe("questions", () => {
  it("student cannot read or write questions", async () => {
    await assertFails(getDoc(doc(db(S1), "questions/q1")));
    await assertFails(setDoc(doc(db(S1), "questions/new"), { ownerId: "student1" }));
  });
  it("teacher cannot read/update/delete another teacher's question", async () => {
    await assertFails(getDoc(doc(db(T2), "questions/q1")));
    await assertFails(updateDoc(doc(db(T2), "questions/q1"), { body: "hacked" }));
    await assertFails(deleteDoc(doc(db(T2), "questions/q1")));
  });
  it("teacher cannot create a question owned by someone else", async () => {
    await assertFails(setDoc(doc(db(T1), "questions/fake"), { ownerId: "teacher2", body: "x" }));
  });
  it("teacher cannot transfer ownership via update", async () => {
    await assertFails(updateDoc(doc(db(T1), "questions/q1"), { ownerId: "teacher2" }));
  });
  it("owner teacher can create/read/update/delete + query own", async () => {
    await assertSucceeds(setDoc(doc(db(T1), "questions/q2"), { ownerId: "teacher1", body: "2+2" }));
    await assertSucceeds(getDoc(doc(db(T1), "questions/q1")));
    await assertSucceeds(updateDoc(doc(db(T1), "questions/q1"), { body: "edited" }));
    await assertSucceeds(getDocs(query(collection(db(T1), "questions"), where("ownerId", "==", "teacher1"))));
    await assertSucceeds(deleteDoc(doc(db(T1), "questions/q2")));
  });
  it("teacher cannot list the whole collection (must filter by ownerId)", async () => {
    await assertFails(getDocs(collection(db(T1), "questions")));
  });
});

describe("exams", () => {
  it("student reads PUBLISHED exam of own classroom (doc + list query)", async () => {
    await assertSucceeds(getDoc(doc(db(S1), "exams/examPub")));
    await assertSucceeds(
      getDocs(query(
        collection(db(S1), "exams"),
        where("status", "==", "PUBLISHED"),
        where("classroomIds", "array-contains", "m4-1"),
      )),
    );
  });
  it("student cannot read a DRAFT exam", async () => {
    await assertFails(getDoc(doc(db(S1), "exams/examDraft")));
  });
  it("student from another classroom cannot read the exam", async () => {
    await assertFails(getDoc(doc(db(S_OTHER_ROOM), "exams/examPub")));
  });
  it("student cannot write exams", async () => {
    await assertFails(updateDoc(doc(db(S1), "exams/examPub"), { title: "x" }));
    await assertFails(setDoc(doc(db(S1), "exams/new"), { ownerId: "student1", status: "DRAFT" }));
  });
  it("other teacher cannot read or edit someone's exam", async () => {
    await assertFails(getDoc(doc(db(T2), "exams/examDraft")));
    await assertFails(updateDoc(doc(db(T2), "exams/examDraft"), { title: "x" }));
  });
  it("owner teacher can create DRAFT, edit DRAFT, delete DRAFT", async () => {
    await assertSucceeds(setDoc(doc(db(T1), "exams/e2"), { ownerId: "teacher1", status: "DRAFT", classroomIds: [] }));
    await assertSucceeds(updateDoc(doc(db(T1), "exams/examDraft"), { title: "edited" }));
    await assertSucceeds(deleteDoc(doc(db(T1), "exams/e2")));
  });
  it("teacher cannot self-publish from the client (must go through API)", async () => {
    await assertFails(setDoc(doc(db(T1), "exams/e3"), { ownerId: "teacher1", status: "PUBLISHED", classroomIds: [] }));
    await assertFails(updateDoc(doc(db(T1), "exams/examDraft"), { status: "PUBLISHED" }));
  });
  it("teacher cannot edit or delete an exam once published", async () => {
    await assertFails(updateDoc(doc(db(T1), "exams/examPub"), { title: "late edit" }));
    await assertFails(deleteDoc(doc(db(T1), "exams/examPub")));
  });
});

describe("examPapers", () => {
  it("student WITHOUT an attempt cannot read the paper (no early peek)", async () => {
    await assertFails(getDoc(doc(db(S_OTHER_ROOM), "examPapers/examPub")));
    await assertFails(getDoc(doc(db({ uid: "student9", claims: { role: "STUDENT", classroomId: "m4-1" } }), "examPapers/examPub")));
  });
  it("student WITH an attempt can read the paper", async () => {
    await assertSucceeds(getDoc(doc(db(S1), "examPapers/examPub")));
  });
  it("teacher/admin can read; nobody writes", async () => {
    await assertSucceeds(getDoc(doc(db(T1), "examPapers/examPub")));
    await assertSucceeds(getDoc(doc(db(ADMIN), "examPapers/examPub")));
    await assertFails(setDoc(doc(db(T1), "examPapers/examPub"), { questions: [] }));
    await assertFails(setDoc(doc(db(S1), "examPapers/examPub"), { questions: [] }));
  });
});

describe("attempts: read", () => {
  it("student reads own attempt only", async () => {
    await assertSucceeds(getDoc(doc(db(S1), "attempts/examPub_student1")));
    await assertFails(getDoc(doc(db(S1), "attempts/examPub_student2")));
  });
  it("owner teacher reads attempts of own exams; other teacher cannot", async () => {
    await assertSucceeds(getDoc(doc(db(T1), "attempts/examPub_student1")));
    await assertFails(getDoc(doc(db(T2), "attempts/examPub_student1")));
    await assertSucceeds(
      getDocs(query(collection(db(T1), "attempts"), where("examOwnerId", "==", "teacher1"))),
    );
    await assertFails(getDocs(collection(db(T1), "attempts")));
  });
  it("student can list their own attempts (query by studentId)", async () => {
    await assertSucceeds(getDocs(query(collection(db(S1), "attempts"), where("studentId", "==", "student1"))));
  });
  it("student cannot list another student's attempts", async () => {
    await assertFails(getDocs(query(collection(db(S1), "attempts"), where("studentId", "==", "student2"))));
  });
  it("admin can read any attempt", async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), "attempts/examPub_student1")));
  });
});

describe("attempts: create/delete", () => {
  it("nobody creates an attempt from the client", async () => {
    const data = {
      examId: "examPub", examOwnerId: "teacher1", studentId: "student9",
      deadlineAt: future(), submittedAt: null, answers: {},
    };
    await assertFails(setDoc(doc(db({ uid: "student9", claims: S1.claims }), "attempts/examPub_student9"), data));
    await assertFails(setDoc(doc(db(T1), "attempts/examPub_x"), data));
    await assertFails(setDoc(doc(db(ADMIN), "attempts/examPub_y"), data));
  });
  it("nobody deletes an attempt", async () => {
    await assertFails(deleteDoc(doc(db(S1), "attempts/examPub_student1")));
    await assertFails(deleteDoc(doc(db(ADMIN), "attempts/examPub_student1")));
  });
});

describe("attempts: update (autosave)", () => {
  it("owner can update answers before the deadline", async () => {
    await assertSucceeds(updateDoc(doc(db(S1), "attempts/examPub_student1"), { "answers.q1": "a" }));
  });
  it("cannot write answers after the deadline", async () => {
    await assertFails(updateDoc(doc(db(S1), "attempts/examExpired_student1"), { "answers.q1": "a" }));
  });
  it("cannot write answers after submit", async () => {
    await assertFails(updateDoc(doc(db(S1), "attempts/examDone_student1"), { "answers.q1": "b" }));
  });
  it("cannot update someone else's attempt", async () => {
    await assertFails(updateDoc(doc(db(S1), "attempts/examPub_student2"), { "answers.q1": "a" }));
  });
  it("cannot touch score, status, deadlineAt, submittedAt, manualScores", async () => {
    const ref = doc(db(S1), "attempts/examPub_student1");
    await assertFails(updateDoc(ref, { score: 100 }));
    await assertFails(updateDoc(ref, { status: "GRADED" }));
    await assertFails(updateDoc(ref, { deadlineAt: Timestamp.fromMillis(Date.now() + 9e9) }));
    await assertFails(updateDoc(ref, { submittedAt: Timestamp.now() }));
    await assertFails(updateDoc(ref, { manualScores: { q1: 10 } }));
  });
  it("cannot mix answers with a forbidden field in the same write", async () => {
    await assertFails(updateDoc(doc(db(S1), "attempts/examPub_student1"), { "answers.q1": "a", score: 100 }));
  });
  it("answers must stay a map (cannot replace with a string)", async () => {
    await assertFails(updateDoc(doc(db(S1), "attempts/examPub_student1"), { answers: "oops" }));
  });
  it("teacher cannot update attempts from the client (grading goes through API)", async () => {
    await assertFails(updateDoc(doc(db(T1), "attempts/examPub_student1"), { score: 1 }));
    await assertFails(updateDoc(doc(db(T1), "attempts/examPub_student1"), { "answers.q1": "a" }));
  });
});

describe("attemptResults (scores)", () => {
  it("student reads own result only when showResult is true AND status is GRADED", async () => {
    await assertSucceeds(getDoc(doc(db(S1), "attemptResults/examPub_student1")));
    await assertFails(getDoc(doc(db(S1), "attemptResults/examDone_student1"))); // still SUBMITTED (pending essay)
  });
  it("student cannot read a result when showResult is false", async () => {
    await assertFails(getDoc(doc(db({ uid: "student2", claims: S1.claims }), "attemptResults/examPub_student2")));
  });
  it("student cannot read another student's result", async () => {
    await assertFails(getDoc(doc(db({ uid: "student2", claims: S1.claims }), "attemptResults/examPub_student1")));
  });
  it("student list query for own visible results works; hidden ones are not reachable", async () => {
    await assertSucceeds(
      getDocs(query(
        collection(db(S1), "attemptResults"),
        where("studentId", "==", "student1"),
        where("showResult", "==", true),
        where("status", "==", "GRADED"),
      )),
    );
    await assertFails(getDocs(query(collection(db(S1), "attemptResults"), where("studentId", "==", "student1"))));
  });
  it("owner teacher reads results of own exams; other teacher cannot", async () => {
    await assertSucceeds(getDoc(doc(db(T1), "attemptResults/examPub_student2")));
    await assertFails(getDoc(doc(db(T2), "attemptResults/examPub_student2")));
    await assertSucceeds(
      getDocs(query(collection(db(T1), "attemptResults"), where("examOwnerId", "==", "teacher1"))),
    );
    await assertFails(getDocs(collection(db(T1), "attemptResults")));
  });
  it("nobody writes results from the client", async () => {
    for (const a of [S1, T1, ADMIN]) {
      await assertFails(setDoc(doc(db(a), "attemptResults/examPub_student1"), { score: 100 }));
      await assertFails(updateDoc(doc(db(a), "attemptResults/examPub_student1"), { score: 100 }));
      await assertFails(deleteDoc(doc(db(a), "attemptResults/examPub_student1")));
    }
  });
});
