import { z } from "zod";

export const QUESTION_TYPES = ["MCQ", "TRUE_FALSE", "SHORT", "ESSAY"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  MCQ: "ปรนัย",
  TRUE_FALSE: "ถูก/ผิด",
  SHORT: "เติมคำ",
  ESSAY: "อัตนัย",
};

export const TRUE_FALSE_CHOICES = [
  { id: "t", text: "ถูก" },
  { id: "f", text: "ผิด" },
] as const;

const choiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1, "ตัวเลือกต้องไม่ว่าง").max(500),
  isCorrect: z.boolean(),
});
export type Choice = z.infer<typeof choiceSchema>;

/** Shape that is written to Firestore (without ownerId / timestamps). */
export const questionInputSchema = z
  .object({
    subjectId: z.string().min(1, "กรุณาเลือกวิชา"),
    type: z.enum(QUESTION_TYPES),
    body: z.string().trim().min(1, "กรุณากรอกโจทย์").max(5000),
    points: z.number("คะแนนต้องเป็นตัวเลข").positive("คะแนนต้องมากกว่า 0").max(100),
    choices: z.array(choiceSchema).max(8),
    acceptedAnswers: z.array(z.string().trim().min(1)).max(10),
    explanation: z.string().trim().max(2000),
  })
  .superRefine((q, ctx) => {
    const add = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });

    if (q.type === "MCQ") {
      if (q.choices.length < 2) add("ปรนัยต้องมีอย่างน้อย 2 ตัวเลือก", ["choices"]);
      if (q.choices.filter((c) => c.isCorrect).length !== 1) {
        add("ต้องเลือกคำตอบที่ถูกต้อง 1 ข้อ", ["choices"]);
      }
    }
    if (q.type === "TRUE_FALSE") {
      const ids = q.choices.map((c) => c.id).sort().join(",");
      if (ids !== "f,t" || q.choices.filter((c) => c.isCorrect).length !== 1) {
        add("ข้อถูก/ผิดต้องเลือกคำตอบ 1 ข้อ", ["choices"]);
      }
    }
    if (q.type === "SHORT" && q.acceptedAnswers.length < 1) {
      add("เติมคำต้องมีคำตอบที่ยอมรับอย่างน้อย 1 คำ", ["acceptedAnswers"]);
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Drop fields that don't belong to the chosen type so stale data is never saved. */
export function normalizeQuestion(q: QuestionInput): QuestionInput {
  return {
    ...q,
    choices: q.type === "MCQ" || q.type === "TRUE_FALSE" ? q.choices : [],
    acceptedAnswers: q.type === "SHORT" ? q.acceptedAnswers : [],
  };
}

export type QuestionDoc = QuestionInput & {
  id: string;
  ownerId: string;
  createdAt?: number;
  updatedAt?: number;
};

// ---------------------------------------------------------------------------
// Exams (draft fields saved from the client; publishing is validated server-side)
// ---------------------------------------------------------------------------
export const EXAM_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  DRAFT: "ฉบับร่าง",
  PUBLISHED: "เผยแพร่แล้ว",
  CLOSED: "ปิดแล้ว",
};

export const examInputSchema = z
  .object({
    title: z.string().trim().min(1, "กรุณากรอกชื่อชุดสอบ").max(200),
    subjectId: z.string().min(1, "กรุณาเลือกวิชา"),
    durationMin: z
      .number("เวลาสอบต้องเป็นตัวเลข")
      .int("เวลาสอบต้องเป็นจำนวนเต็ม")
      .min(1, "เวลาสอบอย่างน้อย 1 นาที")
      .max(600, "เวลาสอบไม่เกิน 600 นาที"),
    openAtMs: z.number().nullable(),
    closeAtMs: z.number().nullable(),
    shuffleQuestions: z.boolean(),
    shuffleChoices: z.boolean(),
    showResult: z.boolean(),
    classroomIds: z.array(z.string().min(1)).max(50),
    questionIds: z.array(z.string().min(1)).max(300),
  })
  .superRefine((e, ctx) => {
    if (e.openAtMs != null && e.closeAtMs != null && e.closeAtMs <= e.openAtMs) {
      ctx.addIssue({ code: "custom", message: "เวลาปิดต้องอยู่หลังเวลาเปิด", path: ["closeAtMs"] });
    }
    if (new Set(e.questionIds).size !== e.questionIds.length) {
      ctx.addIssue({ code: "custom", message: "มีข้อสอบซ้ำในชุดสอบ", path: ["questionIds"] });
    }
  });

export type ExamInput = z.infer<typeof examInputSchema>;

export type ExamDoc = ExamInput & {
  id: string;
  ownerId: string;
  status: ExamStatus;
  questionCount?: number;
  totalPoints?: number;
};
