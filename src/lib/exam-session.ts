// Pure logic for starting / running an exam. No Firebase imports: unit-testable.

export type SessionErrorCode =
  | "NOT_FOUND"
  | "NOT_PUBLISHED"
  | "NOT_IN_CLASSROOM"
  | "NOT_OPEN_YET"
  | "ALREADY_CLOSED"
  | "PAPER_MISSING";

export class SessionError extends Error {
  constructor(readonly code: SessionErrorCode) {
    super(code);
    this.name = "SessionError";
  }
}

export const SESSION_ERROR_STATUS: Record<SessionErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_PUBLISHED: 409,
  NOT_IN_CLASSROOM: 403,
  NOT_OPEN_YET: 409,
  ALREADY_CLOSED: 409,
  PAPER_MISSING: 500,
};

/** Answers sent with the final submit are accepted until deadline + grace (network latency). */
export const SUBMIT_GRACE_MS = 10_000;

export function computeDeadlineMs(nowMs: number, durationMin: number, closeAtMs: number): number {
  return Math.min(nowMs + durationMin * 60_000, closeAtMs);
}

export function canAcceptAnswers(nowMs: number, deadlineMs: number): boolean {
  return nowMs <= deadlineMs + SUBMIT_GRACE_MS;
}

export function checkCanStart(
  e: {
    status: string;
    classroomIds: string[];
    openAtMs: number | null;
    closeAtMs: number | null;
  },
  studentClassroomId: string | null,
  nowMs: number,
): SessionErrorCode | null {
  if (e.status !== "PUBLISHED") return "NOT_PUBLISHED";
  if (!studentClassroomId || !e.classroomIds.includes(studentClassroomId)) return "NOT_IN_CLASSROOM";
  if (e.openAtMs == null || e.closeAtMs == null) return "NOT_PUBLISHED";
  if (nowMs < e.openAtMs) return "NOT_OPEN_YET";
  if (nowMs >= e.closeAtMs) return "ALREADY_CLOSED";
  return null;
}

// ---- deterministic shuffle (same seed => same order after refresh) ----------

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildOrder(opts: {
  questions: Array<{ id: string; type: string; choiceIds: string[] }>;
  seed: string;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
}): { order: string[]; choiceOrder: Record<string, string[]> } {
  const ids = opts.questions.map((q) => q.id);
  const order = opts.shuffleQuestions ? seededShuffle(ids, `${opts.seed}:q`) : ids;
  const choiceOrder: Record<string, string[]> = {};
  for (const q of opts.questions) {
    if (q.choiceIds.length === 0) continue;
    // true/false keeps its fixed order; only MCQ is shuffled
    choiceOrder[q.id] =
      opts.shuffleChoices && q.type === "MCQ" ? seededShuffle(q.choiceIds, `${opts.seed}:${q.id}`) : q.choiceIds;
  }
  return { order, choiceOrder };
}

// ---- student's exam list state ---------------------------------------------

export type ExamCardState = "NOT_OPEN" | "OPEN" | "RESUME" | "SUBMITTED" | "EXPIRED" | "MISSED";

export function examCardState(
  exam: { openAtMs: number | null; closeAtMs: number | null },
  attempt: { submitted: boolean; deadlineMs: number } | undefined,
  nowMs: number,
): ExamCardState {
  if (attempt) {
    if (attempt.submitted) return "SUBMITTED";
    return nowMs >= attempt.deadlineMs ? "EXPIRED" : "RESUME";
  }
  if (exam.openAtMs != null && nowMs < exam.openAtMs) return "NOT_OPEN";
  if (exam.closeAtMs != null && nowMs >= exam.closeAtMs) return "MISSED";
  return "OPEN";
}
