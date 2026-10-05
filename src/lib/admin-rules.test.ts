import { describe, expect, it } from "vitest";
import {
  chunk,
  claimsFor,
  countQuestionUsage,
  createUserSchema,
  examPatchSchema,
  planExamUpdate,
  projectQuestion,
  type ExamSnapshot,
} from "@/lib/admin-rules";

const NOW = 1_000_000;
const published: ExamSnapshot = { status: "PUBLISHED", openAtMs: NOW - 1000, closeAtMs: NOW + 60_000, hasPaper: true };
const closed: ExamSnapshot = { status: "CLOSED", openAtMs: NOW - 5000, closeAtMs: NOW - 1000, hasPaper: true };

describe("chunk", () => {
  it("splits into fixed sizes", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
  it("rejects bad sizes", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("createUserSchema", () => {
  it("normalises email and requires a classroom for students", () => {
    const ok = createUserSchema.safeParse({ name: " A ", email: " A@B.CO ", role: "STUDENT", classroomId: "m4-1" });
    expect(ok.success && ok.data.email).toBe("a@b.co");
    expect(createUserSchema.safeParse({ name: "A", email: "a@b.co", role: "STUDENT" }).success).toBe(false);
  });
  it("teachers and admins need no classroom", () => {
    expect(createUserSchema.safeParse({ name: "T", email: "t@b.co", role: "TEACHER" }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: "X", email: "x@b.co", role: "ADMIN" }).success).toBe(true);
  });
  it("blank password means auto-generate; short password is rejected", () => {
    const blank = createUserSchema.safeParse({ name: "T", email: "t@b.co", role: "TEACHER", password: "  " });
    expect(blank.success && blank.data.password).toBeUndefined();
    expect(createUserSchema.safeParse({ name: "T", email: "t@b.co", role: "TEACHER", password: "short" }).success).toBe(false);
  });
  it("rejects unknown roles", () => {
    expect(createUserSchema.safeParse({ name: "T", email: "t@b.co", role: "ROOT" }).success).toBe(false);
  });
});

describe("claimsFor", () => {
  it("only students carry classroomId", () => {
    expect(claimsFor("STUDENT", "m4-1")).toEqual({ role: "STUDENT", classroomId: "m4-1" });
    expect(claimsFor("TEACHER", "m4-1")).toEqual({ role: "TEACHER" });
    expect(claimsFor("ADMIN")).toEqual({ role: "ADMIN" });
  });
});

describe("examPatchSchema", () => {
  it("rejects empty patches and DRAFT as a target", () => {
    expect(examPatchSchema.safeParse({}).success).toBe(false);
    expect(examPatchSchema.safeParse({ status: "DRAFT" }).success).toBe(false);
    expect(examPatchSchema.safeParse({ status: "CLOSED" }).success).toBe(true);
  });
});

describe("planExamUpdate", () => {
  it("drafts are left to the teacher", () => {
    const draft: ExamSnapshot = { status: "DRAFT", openAtMs: null, closeAtMs: null, hasPaper: false };
    expect(planExamUpdate(draft, { status: "CLOSED" }, NOW)).toEqual({ ok: false, error: "DRAFT_NOT_SUPPORTED" });
  });
  it("closes a published exam", () => {
    expect(planExamUpdate(published, { status: "CLOSED" }, NOW)).toEqual({ ok: true, update: { status: "CLOSED" } });
  });
  it("extends the close time of a published exam", () => {
    const r = planExamUpdate(published, { closeAtMs: NOW + 120_000 }, NOW);
    expect(r).toEqual({ ok: true, update: { closeAtMs: NOW + 120_000 } });
  });
  it("refuses a window that ends before it starts or is already over", () => {
    expect(planExamUpdate(published, { closeAtMs: NOW - 2000 }, NOW)).toEqual({ ok: false, error: "BAD_WINDOW" });
    expect(planExamUpdate(published, { openAtMs: NOW + 10, closeAtMs: NOW + 5 }, NOW)).toEqual({ ok: false, error: "BAD_WINDOW" });
    const ended: ExamSnapshot = { ...published, openAtMs: NOW - 5000, closeAtMs: NOW - 1000 };
    expect(planExamUpdate(ended, { openAtMs: NOW - 4000 }, NOW)).toEqual({ ok: false, error: "ALREADY_CLOSED" });
  });
  it("re-opening a closed exam needs a future close time", () => {
    expect(planExamUpdate(closed, { status: "PUBLISHED" }, NOW)).toEqual({ ok: false, error: "ALREADY_CLOSED" });
    expect(planExamUpdate(closed, { status: "PUBLISHED", closeAtMs: NOW + 3600_000 }, NOW)).toEqual({
      ok: true,
      update: { status: "PUBLISHED", closeAtMs: NOW + 3600_000 },
    });
  });
  it("re-opening needs the stored paper", () => {
    const noPaper: ExamSnapshot = { ...closed, hasPaper: false };
    expect(planExamUpdate(noPaper, { status: "PUBLISHED", closeAtMs: NOW + 1000 }, NOW)).toEqual({ ok: false, error: "PAPER_MISSING" });
  });
  it("reports no-op patches", () => {
    expect(planExamUpdate(published, { status: "PUBLISHED" }, NOW)).toEqual({ ok: false, error: "NO_CHANGE" });
    expect(planExamUpdate(published, { closeAtMs: published.closeAtMs as number }, NOW)).toEqual({ ok: false, error: "NO_CHANGE" });
  });
});

describe("projectQuestion", () => {
  it("never leaks choices or correctness", () => {
    const row = projectQuestion(
      "q1",
      {
        ownerId: "t1",
        subjectId: "math",
        type: "MCQ",
        body: "x".repeat(500),
        points: 2,
        choices: [{ id: "a", text: "A", isCorrect: true }, { id: "b", text: "B", isCorrect: false }],
        acceptedAnswers: ["secret"],
        explanation: "because",
      },
      3,
      123,
    );
    expect(row.choiceCount).toBe(2);
    expect(row.body).toHaveLength(300);
    expect(JSON.stringify(row)).not.toMatch(/isCorrect|secret|because/);
  });
});

describe("countQuestionUsage", () => {
  it("counts each exam once per question", () => {
    const m = countQuestionUsage([["a", "b", "a"], ["a"], []]);
    expect(m.get("a")).toBe(2);
    expect(m.get("b")).toBe(1);
    expect(m.get("c")).toBeUndefined();
  });
});
