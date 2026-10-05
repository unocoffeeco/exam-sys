import { describe, expect, it } from "vitest";
import { examInputSchema, normalizeQuestion, questionInputSchema, type QuestionInput } from "@/lib/schemas";

const base: QuestionInput = {
  subjectId: "math",
  type: "MCQ",
  body: "1+1 = ?",
  points: 1,
  choices: [
    { id: "a", text: "1", isCorrect: false },
    { id: "b", text: "2", isCorrect: true },
  ],
  acceptedAnswers: [],
  explanation: "",
};
const ok = (q: unknown) => questionInputSchema.safeParse(q).success;

describe("questionInputSchema", () => {
  it("accepts a valid MCQ", () => expect(ok(base)).toBe(true));
  it("rejects MCQ with < 2 choices", () =>
    expect(ok({ ...base, choices: [base.choices[1]] })).toBe(false));
  it("rejects MCQ with no or multiple correct answers", () => {
    expect(ok({ ...base, choices: base.choices.map((c) => ({ ...c, isCorrect: false })) })).toBe(false);
    expect(ok({ ...base, choices: base.choices.map((c) => ({ ...c, isCorrect: true })) })).toBe(false);
  });
  it("rejects empty body, zero/negative points, missing subject", () => {
    expect(ok({ ...base, body: "   " })).toBe(false);
    expect(ok({ ...base, points: 0 })).toBe(false);
    expect(ok({ ...base, points: -1 })).toBe(false);
    expect(ok({ ...base, subjectId: "" })).toBe(false);
  });
  it("validates TRUE_FALSE", () => {
    const tf = { ...base, type: "TRUE_FALSE" as const };
    expect(ok({ ...tf, choices: [{ id: "t", text: "ถูก", isCorrect: true }, { id: "f", text: "ผิด", isCorrect: false }] })).toBe(true);
    expect(ok({ ...tf, choices: [{ id: "t", text: "ถูก", isCorrect: false }, { id: "f", text: "ผิด", isCorrect: false }] })).toBe(false);
    expect(ok({ ...tf, choices: base.choices })).toBe(false);
  });
  it("SHORT needs at least one accepted answer", () => {
    const s = { ...base, type: "SHORT" as const, choices: [] };
    expect(ok({ ...s, acceptedAnswers: [] })).toBe(false);
    expect(ok({ ...s, acceptedAnswers: ["กรุงเทพ"] })).toBe(true);
  });
  it("ESSAY needs no choices or answers", () =>
    expect(ok({ ...base, type: "ESSAY", choices: [], acceptedAnswers: [] })).toBe(true));
});

describe("normalizeQuestion", () => {
  it("clears choices/acceptedAnswers that don't belong to the type", () => {
    const essay = normalizeQuestion({ ...base, type: "ESSAY", acceptedAnswers: ["x"] });
    expect(essay.choices).toEqual([]);
    expect(essay.acceptedAnswers).toEqual([]);
    const mcq = normalizeQuestion({ ...base, acceptedAnswers: ["x"] });
    expect(mcq.choices).toHaveLength(2);
    expect(mcq.acceptedAnswers).toEqual([]);
  });
});


describe("examInputSchema", () => {
  const exam = {
    title: "กลางภาค", subjectId: "math", durationMin: 60, openAtMs: 1000, closeAtMs: 2000,
    shuffleQuestions: true, shuffleChoices: true, showResult: false,
    classroomIds: ["m4-1"], questionIds: ["q1", "q2"],
  };
  const good = (e: unknown) => examInputSchema.safeParse(e).success;
  it("accepts a complete draft and a draft without dates/questions", () => {
    expect(good(exam)).toBe(true);
    expect(good({ ...exam, openAtMs: null, closeAtMs: null, questionIds: [], classroomIds: [] })).toBe(true);
  });
  it("rejects bad title, duration, window, duplicates", () => {
    expect(good({ ...exam, title: " " })).toBe(false);
    expect(good({ ...exam, durationMin: 0 })).toBe(false);
    expect(good({ ...exam, durationMin: 30.5 })).toBe(false);
    expect(good({ ...exam, closeAtMs: 500 })).toBe(false);
    expect(good({ ...exam, questionIds: ["q1", "q1"] })).toBe(false);
  });
});
