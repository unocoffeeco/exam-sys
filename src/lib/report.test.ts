import { describe, expect, it } from "vitest";
import { computeFinalScore } from "@/lib/grading";
import type { KeyEntry } from "@/lib/publish";
import { summarize, toCsv } from "@/lib/report";

describe("toCsv", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "x\ny", 3]])).toBe('"a,b","say ""hi""","x\ny",3');
  });
  it("neutralises formula injection in text cells but not numbers", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-1", "@x", -5]])).toBe("'=SUM(A1),'+1,'-1,'@x,-5");
  });
  it("renders null as empty and joins rows with CRLF", () => {
    expect(toCsv([["a", null], ["b", "c"]])).toBe("a,\r\nb,c");
  });
});

describe("summarize", () => {
  it("counts statuses and aggregates graded scores only", () => {
    const s = summarize([
      { status: "GRADED", score: 10 },
      { status: "GRADED", score: 6 },
      { status: "PENDING_MANUAL", score: 4 },
      { status: "IN_PROGRESS", score: null },
      { status: "EXPIRED", score: null },
    ]);
    expect(s).toMatchObject({ total: 5, inProgress: 2, pending: 1, graded: 2, avg: 8, max: 10, min: 6 });
  });
  it("handles an empty list", () => {
    expect(summarize([])).toMatchObject({ total: 0, graded: 0, avg: null, max: null, min: null });
  });
});

describe("computeFinalScore", () => {
  const key: Record<string, KeyEntry> = {
    q1: { type: "MCQ", points: 2, correct: "a" },
    q2: { type: "ESSAY", points: 5, correct: null },
    q3: { type: "ESSAY", points: 3, correct: null },
  };
  it("is not final until every essay is scored", () => {
    expect(computeFinalScore(key, 2, { q2: 4 })).toEqual({ score: 6, maxScore: 10, allGraded: false });
  });
  it("is final when all essays are scored", () => {
    expect(computeFinalScore(key, 2, { q2: 4.5, q3: 1.25 })).toEqual({ score: 7.75, maxScore: 10, allGraded: true });
  });
  it("ignores manual scores for non-essay questions", () => {
    expect(computeFinalScore(key, 2, { q1: 99, q2: 0, q3: 0 }).score).toBe(2);
  });
});
