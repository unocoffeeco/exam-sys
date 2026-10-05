// Pure auto-grading. Runs on the server only (needs the answer key).
import type { KeyEntry } from "@/lib/publish";

export function normalizeText(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export type GradeResult = {
  autoScore: number;
  maxScore: number;
  /** score per auto-graded question (essays are absent: they need manual grading) */
  autoScores: Record<string, number>;
  hasManual: boolean;
};

export function gradeAttempt(key: Record<string, KeyEntry>, answers: Record<string, unknown>): GradeResult {
  let autoScore = 0;
  let maxScore = 0;
  let hasManual = false;
  const autoScores: Record<string, number> = {};

  for (const [qid, entry] of Object.entries(key)) {
    maxScore += entry.points;
    if (entry.type === "ESSAY" || entry.correct == null) {
      hasManual = true;
      continue;
    }
    const given = answers[qid];
    let ok = false;
    if (typeof given === "string") {
      if (Array.isArray(entry.correct)) {
        const g = normalizeText(given);
        ok = g !== "" && entry.correct.some((c) => normalizeText(c) === g);
      } else {
        ok = given === entry.correct;
      }
    }
    const earned = ok ? entry.points : 0;
    autoScores[qid] = earned;
    autoScore += earned;
  }
  return { autoScore, maxScore, autoScores, hasManual };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Combine auto score + teacher's manual essay scores. Pure. */
export function computeFinalScore(
  key: Record<string, KeyEntry>,
  autoScore: number,
  manualScores: Record<string, number>,
): { score: number; maxScore: number; allGraded: boolean } {
  let maxScore = 0;
  let manualSum = 0;
  let allGraded = true;
  for (const [qid, entry] of Object.entries(key)) {
    maxScore += entry.points;
    if (entry.type === "ESSAY" || entry.correct == null) {
      const m = manualScores[qid];
      if (typeof m === "number") manualSum += m;
      else allGraded = false;
    }
  }
  return { score: round2(autoScore + manualSum), maxScore: round2(maxScore), allGraded };
}
