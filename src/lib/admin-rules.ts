// Pure rules for admin-console operations. No Firebase imports: unit-testable.
import { z } from "zod";
import type { ExamStatus } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("chunk size must be a positive integer");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const ID_RE = /^[A-Za-z0-9_-]+$/;
export const idSchema = z.string().min(1).max(256).regex(ID_RE);
/** Classroom / subject ids are lower-case codes (same rule as CollectionManager). */
export const CODE_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

// ---------------------------------------------------------------------------
// Create one user
// ---------------------------------------------------------------------------
export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "กรุณากรอกชื่อ").max(100),
    email: z.string().trim().toLowerCase().email("อีเมลไม่ถูกต้อง").max(200),
    role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
    classroomId: z.string().trim().min(1).max(128).optional(),
    password: z
      .string()
      .max(100)
      .optional()
      .transform((v) => (v && v.trim() ? v.trim() : undefined))
      .refine((v) => v === undefined || v.length >= 8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
  })
  .refine((u) => u.role !== "STUDENT" || !!u.classroomId, {
    message: "นักเรียนต้องมีห้องเรียน",
    path: ["classroomId"],
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Custom claims for a role. Only students carry a classroomId. */
export function claimsFor(role: "ADMIN" | "TEACHER" | "STUDENT", classroomId?: string): Record<string, string> {
  return { role, ...(role === "STUDENT" && classroomId ? { classroomId } : {}) };
}

// ---------------------------------------------------------------------------
// Admin edits to an exam (bypasses the teacher-only DRAFT restriction)
// ---------------------------------------------------------------------------
export const examPatchSchema = z
  .object({
    status: z.enum(["PUBLISHED", "CLOSED"]).optional(),
    openAtMs: z.number().int().positive().optional(),
    closeAtMs: z.number().int().positive().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty");
export type ExamPatch = z.infer<typeof examPatchSchema>;

export type ExamSnapshot = {
  status: ExamStatus;
  openAtMs: number | null;
  closeAtMs: number | null;
  /** examPapers + examKeys both exist (i.e. the exam was published at least once). */
  hasPaper: boolean;
};

export type ExamPlanError =
  | "DRAFT_NOT_SUPPORTED" // teacher still owns drafts; publishing needs the teacher's validation
  | "PAPER_MISSING"
  | "BAD_WINDOW"
  | "ALREADY_CLOSED"
  | "NO_CHANGE";

export type ExamPlan =
  | { ok: true; update: { status?: ExamStatus; openAtMs?: number; closeAtMs?: number } }
  | { ok: false; error: ExamPlanError };

/**
 * Decide what an admin may change on an exam:
 *  - PUBLISHED: close it, or move the open/close window (window must stay valid and in the future)
 *  - CLOSED: re-open it (needs a fresh future closeAt and an existing paper), or fix the window
 *  - DRAFT: not editable here
 * Students' existing attempts keep their own deadlines; only new starts see the new window.
 */
export function planExamUpdate(current: ExamSnapshot, patch: ExamPatch, nowMs: number): ExamPlan {
  if (current.status === "DRAFT") return { ok: false, error: "DRAFT_NOT_SUPPORTED" };

  const nextStatus: ExamStatus = patch.status ?? current.status;
  const openAtMs = patch.openAtMs ?? current.openAtMs;
  const closeAtMs = patch.closeAtMs ?? current.closeAtMs;

  const update: { status?: ExamStatus; openAtMs?: number; closeAtMs?: number } = {};
  if (nextStatus !== current.status) update.status = nextStatus;
  if (patch.openAtMs !== undefined && patch.openAtMs !== current.openAtMs) update.openAtMs = patch.openAtMs;
  if (patch.closeAtMs !== undefined && patch.closeAtMs !== current.closeAtMs) update.closeAtMs = patch.closeAtMs;
  if (Object.keys(update).length === 0) return { ok: false, error: "NO_CHANGE" };

  const windowKnown = openAtMs != null && closeAtMs != null;
  if (windowKnown && closeAtMs <= openAtMs) return { ok: false, error: "BAD_WINDOW" };

  if (nextStatus === "PUBLISHED") {
    if (!current.hasPaper) return { ok: false, error: "PAPER_MISSING" };
    if (!windowKnown) return { ok: false, error: "BAD_WINDOW" };
    if (closeAtMs <= nowMs) return { ok: false, error: "ALREADY_CLOSED" };
  }
  return { ok: true, update };
}

// ---------------------------------------------------------------------------
// Safe question projection for the admin list (never exposes answers)
// ---------------------------------------------------------------------------
export type AdminQuestionRow = {
  id: string;
  ownerId: string;
  subjectId: string;
  type: string;
  body: string;
  points: number;
  choiceCount: number;
  usedIn: number;
  createdAtMs: number | null;
};

export function projectQuestion(
  id: string,
  d: Record<string, unknown>,
  usedIn: number,
  createdAtMs: number | null,
): AdminQuestionRow {
  const choices = Array.isArray(d.choices) ? d.choices : [];
  return {
    id,
    ownerId: String(d.ownerId ?? ""),
    subjectId: String(d.subjectId ?? ""),
    type: String(d.type ?? ""),
    body: String(d.body ?? "").slice(0, 300),
    points: Number(d.points ?? 0),
    choiceCount: choices.length,
    usedIn,
    createdAtMs,
  };
}

/** How many exams reference each question id. */
export function countQuestionUsage(examQuestionIds: string[][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const ids of examQuestionIds) for (const id of new Set(ids)) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}
