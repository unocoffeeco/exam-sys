import { describe, expect, it } from "vitest";
import { PublishError, buildPaperAndKey, validateExamForPublish } from "@/lib/publish";
import type { QuestionInput } from "@/lib/schemas";

const mcq: QuestionInput & { id: string } = {
  id: "q1", subjectId: "math", type: "MCQ", body: "1+1", points: 2, explanation: "secret reasoning",
  choices: [
    { id: "a", text: "1", isCorrect: false },
    { id: "b", text: "2", isCorrect: true },
  ],
  acceptedAnswers: [],
};
const short: QuestionInput & { id: string } = {
  id: "q2", subjectId: "math", type: "SHORT", body: "capital?", points: 1, explanation: "",
  choices: [], acceptedAnswers: ["กรุงเทพ", "bangkok"],
};
const essay: QuestionInput & { id: string } = {
  id: "q3", subjectId: "math", type: "ESSAY", body: "explain", points: 5, explanation: "",
  choices: [], acceptedAnswers: [],
};

describe("buildPaperAndKey", () => {
  const built = buildPaperAndKey([essay, short, mcq], ["q1", "q2", "q3"]);

  it("never leaks answers into the paper", () => {
    const json = JSON.stringify(built.paper);
    expect(json).not.toContain("isCorrect");
    expect(json).not.toContain("secret reasoning");
    expect(json).not.toContain("acceptedAnswers");
    expect(json).not.toContain("bangkok");
  });
  it("keeps the exam's order, not the input order", () => {
    expect(built.paper.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });
  it("puts the correct answers in the key", () => {
    expect(built.key.answers.q1.correct).toBe("b");
    expect(built.key.answers.q2.correct).toEqual(["กรุงเทพ", "bangkok"]);
    expect(built.key.answers.q3.correct).toBeNull();
  });
  it("sums total points", () => expect(built.totalPoints).toBe(8));
  it("choices in the paper only have id and text", () => {
    expect(built.paper.questions[0].choices).toEqual([{ id: "a", text: "1" }, { id: "b", text: "2" }]);
  });
  it("throws INVALID_QUESTION for a missing or malformed question", () => {
    expect(() => buildPaperAndKey([mcq], ["q1", "nope"])).toThrow(PublishError);
    const bad = { ...mcq, choices: mcq.choices.map((c) => ({ ...c, isCorrect: false })) };
    expect(() => buildPaperAndKey([bad], ["q1"])).toThrow(PublishError);
  });
});

describe("validateExamForPublish", () => {
  const now = Date.UTC(2026, 9, 3);
  const ok = {
    title: "สอบกลางภาค", durationMin: 60, classroomIds: ["m4-1"], questionIds: ["q1"],
    openAtMs: now + 3600_000, closeAtMs: now + 7200_000,
  };
  it("accepts a complete exam", () => expect(validateExamForPublish(ok, now)).toEqual([]));
  it("reports every missing piece", () => {
    const errs = validateExamForPublish(
      { ...ok, title: " ", classroomIds: [], questionIds: [], durationMin: 0 }, now);
    expect(errs).toEqual(expect.arrayContaining(["NO_TITLE", "NO_CLASSROOM", "NO_QUESTIONS", "BAD_DURATION"]));
  });
  it("rejects missing, inverted, or already-passed windows", () => {
    expect(validateExamForPublish({ ...ok, openAtMs: null }, now)).toContain("BAD_WINDOW");
    expect(validateExamForPublish({ ...ok, closeAtMs: ok.openAtMs }, now)).toContain("BAD_WINDOW");
    expect(validateExamForPublish({ ...ok, openAtMs: now - 7200_000, closeAtMs: now - 3600_000 }, now))
      .toContain("ALREADY_CLOSED");
  });
});
