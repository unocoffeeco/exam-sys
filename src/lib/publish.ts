// Pure logic for publishing an exam. No Firebase imports: unit-testable.
import {
  normalizeQuestion,
  questionInputSchema,
  type QuestionInput,
  type QuestionType,
} from "@/lib/schemas";

export type PublishErrorCode =
  | "NO_TITLE"
  | "NO_QUESTIONS"
  | "NO_CLASSROOM"
  | "BAD_DURATION"
  | "BAD_WINDOW"
  | "ALREADY_CLOSED"
  | "INVALID_QUESTION";

export class PublishError extends Error {
  constructor(readonly code: PublishErrorCode) {
    super(code);
    this.name = "PublishError";
  }
}

export type ExamDraftFields = {
  title: string;
  durationMin: number;
  openAtMs: number | null;
  closeAtMs: number | null;
  classroomIds: string[];
  questionIds: string[];
};

export function validateExamForPublish(e: ExamDraftFields, nowMs: number): PublishErrorCode[] {
  const errors: PublishErrorCode[] = [];
  if (!e.title.trim()) errors.push("NO_TITLE");
  if (e.questionIds.length === 0) errors.push("NO_QUESTIONS");
  if (e.classroomIds.length === 0) errors.push("NO_CLASSROOM");
  if (!Number.isFinite(e.durationMin) || e.durationMin < 1 || e.durationMin > 600) errors.push("BAD_DURATION");
  if (e.openAtMs == null || e.closeAtMs == null || e.closeAtMs <= e.openAtMs) {
    errors.push("BAD_WINDOW");
  } else if (e.closeAtMs <= nowMs) {
    errors.push("ALREADY_CLOSED");
  }
  return errors;
}

export type PaperQuestion = {
  id: string;
  type: QuestionType;
  body: string;
  points: number;
  choices: { id: string; text: string }[]; // never contains isCorrect
};

export type KeyEntry = {
  type: QuestionType;
  points: number;
  /** MCQ/TRUE_FALSE: correct choice id. SHORT: accepted answers. ESSAY: null (manual grading). */
  correct: string | string[] | null;
};

export type BuiltExam = {
  paper: { questions: PaperQuestion[] };
  key: { answers: Record<string, KeyEntry> };
  totalPoints: number;
};

/**
 * Split question-bank docs into a student-safe paper and a server-only key,
 * following the order of `order` (the exam's questionIds).
 */
export function buildPaperAndKey(
  questions: Array<QuestionInput & { id: string }>,
  order: string[],
): BuiltExam {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const paperQs: PaperQuestion[] = [];
  const answers: Record<string, KeyEntry> = {};
  let totalPoints = 0;

  for (const id of order) {
    const raw = byId.get(id);
    if (!raw) throw new PublishError("INVALID_QUESTION");
    const parsed = questionInputSchema.safeParse(raw);
    if (!parsed.success) throw new PublishError("INVALID_QUESTION");
    const q = normalizeQuestion(parsed.data);

    paperQs.push({
      id,
      type: q.type,
      body: q.body,
      points: q.points,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
    });

    let correct: KeyEntry["correct"] = null;
    if (q.type === "MCQ" || q.type === "TRUE_FALSE") {
      correct = q.choices.find((c) => c.isCorrect)?.id ?? null;
    } else if (q.type === "SHORT") {
      correct = q.acceptedAnswers;
    }
    answers[id] = { type: q.type, points: q.points, correct };
    totalPoints += q.points;
  }

  return { paper: { questions: paperQs }, key: { answers }, totalPoints };
}
