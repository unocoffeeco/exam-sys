import { describe, expect, it } from "vitest";
import {
  buildOrder,
  canAcceptAnswers,
  checkCanStart,
  computeDeadlineMs,
  examCardState,
  seededShuffle,
  SUBMIT_GRACE_MS,
} from "@/lib/exam-session";
import { gradeAttempt, normalizeText } from "@/lib/grading";
import type { KeyEntry } from "@/lib/publish";

const MIN = 60_000;

describe("computeDeadlineMs", () => {
  it("is now + duration when the window is wide", () =>
    expect(computeDeadlineMs(0, 60, 10 * 60 * MIN)).toBe(60 * MIN));
  it("is capped by closeAt", () => expect(computeDeadlineMs(0, 60, 20 * MIN)).toBe(20 * MIN));
});

describe("canAcceptAnswers", () => {
  it("accepts before and within grace, rejects after", () => {
    expect(canAcceptAnswers(999, 1000)).toBe(true);
    expect(canAcceptAnswers(1000 + SUBMIT_GRACE_MS, 1000)).toBe(true);
    expect(canAcceptAnswers(1000 + SUBMIT_GRACE_MS + 1, 1000)).toBe(false);
  });
});

describe("checkCanStart", () => {
  const e = { status: "PUBLISHED", classroomIds: ["m4-1"], openAtMs: 1000, closeAtMs: 5000 };
  it("allows an eligible student inside the window", () => expect(checkCanStart(e, "m4-1", 2000)).toBeNull());
  it("rejects wrong state, classroom, or time", () => {
    expect(checkCanStart({ ...e, status: "DRAFT" }, "m4-1", 2000)).toBe("NOT_PUBLISHED");
    expect(checkCanStart({ ...e, status: "CLOSED" }, "m4-1", 2000)).toBe("NOT_PUBLISHED");
    expect(checkCanStart(e, "m4-2", 2000)).toBe("NOT_IN_CLASSROOM");
    expect(checkCanStart(e, null, 2000)).toBe("NOT_IN_CLASSROOM");
    expect(checkCanStart(e, "m4-1", 999)).toBe("NOT_OPEN_YET");
    expect(checkCanStart(e, "m4-1", 5000)).toBe("ALREADY_CLOSED");
  });
});

describe("seededShuffle / buildOrder", () => {
  const items = Array.from({ length: 20 }, (_, i) => `q${i}`);
  it("is deterministic per seed and does not lose items", () => {
    expect(seededShuffle(items, "a")).toEqual(seededShuffle(items, "a"));
    expect([...seededShuffle(items, "a")].sort()).toEqual([...items].sort());
  });
  it("differs between seeds", () => expect(seededShuffle(items, "a")).not.toEqual(seededShuffle(items, "b")));
  it("does not mutate the input", () => {
    const copy = [...items];
    seededShuffle(items, "x");
    expect(items).toEqual(copy);
  });
  it("buildOrder: keeps order when shuffle is off; never shuffles true/false", () => {
    const qs = [
      { id: "q1", type: "MCQ", choiceIds: ["a", "b", "c", "d"] },
      { id: "q2", type: "TRUE_FALSE", choiceIds: ["t", "f"] },
      { id: "q3", type: "ESSAY", choiceIds: [] },
    ];
    const off = buildOrder({ questions: qs, seed: "s", shuffleQuestions: false, shuffleChoices: false });
    expect(off.order).toEqual(["q1", "q2", "q3"]);
    expect(off.choiceOrder.q1).toEqual(["a", "b", "c", "d"]);
    expect(off.choiceOrder.q3).toBeUndefined();
    const on = buildOrder({ questions: qs, seed: "s", shuffleQuestions: true, shuffleChoices: true });
    expect([...on.order].sort()).toEqual(["q1", "q2", "q3"]);
    expect([...on.choiceOrder.q1].sort()).toEqual(["a", "b", "c", "d"]);
    expect(on.choiceOrder.q2).toEqual(["t", "f"]);
  });
});

describe("examCardState", () => {
  const exam = { openAtMs: 1000, closeAtMs: 5000 };
  it("covers every state", () => {
    expect(examCardState(exam, undefined, 500)).toBe("NOT_OPEN");
    expect(examCardState(exam, undefined, 2000)).toBe("OPEN");
    expect(examCardState(exam, undefined, 6000)).toBe("MISSED");
    expect(examCardState(exam, { submitted: false, deadlineMs: 3000 }, 2000)).toBe("RESUME");
    expect(examCardState(exam, { submitted: false, deadlineMs: 3000 }, 3000)).toBe("EXPIRED");
    expect(examCardState(exam, { submitted: true, deadlineMs: 3000 }, 2000)).toBe("SUBMITTED");
  });
});

describe("gradeAttempt", () => {
  const key: Record<string, KeyEntry> = {
    q1: { type: "MCQ", points: 2, correct: "b" },
    q2: { type: "TRUE_FALSE", points: 1, correct: "t" },
    q3: { type: "SHORT", points: 3, correct: ["กรุงเทพ", "Bangkok"] },
    q4: { type: "ESSAY", points: 5, correct: null },
  };
  it("scores correct, wrong and missing answers", () => {
    const r = gradeAttempt(key, { q1: "b", q2: "f", q3: "  bangkok " });
    expect(r.autoScore).toBe(2 + 0 + 3);
    expect(r.maxScore).toBe(11);
    expect(r.hasManual).toBe(true);
    expect(r.autoScores).toEqual({ q1: 2, q2: 0, q3: 3 });
  });
  it("gives 0 for no answers and ignores essays/unknown ids", () => {
    const r = gradeAttempt(key, { zzz: "b", q4: "long text" });
    expect(r.autoScore).toBe(0);
    expect(r.autoScores.q4).toBeUndefined();
  });
  it("is not fooled by non-string answers or empty accepted text", () => {
    expect(gradeAttempt(key, { q1: ["b"], q3: "" }).autoScore).toBe(0);
  });
  it("hasManual is false without essays", () => {
    expect(gradeAttempt({ q1: key.q1 }, { q1: "b" }).hasManual).toBe(false);
  });
});

describe("normalizeText", () => {
  it("trims, lowercases and collapses whitespace", () => expect(normalizeText("  Hello   World ")).toBe("hello world"));
});
