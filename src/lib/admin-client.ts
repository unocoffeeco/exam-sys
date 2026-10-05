// Client-side helpers shared by the admin console pages.
import { collection, getDocs } from "firebase/firestore";
import { ApiError, describeApiError } from "@/lib/api-client";
import { getClientFirestore } from "@/lib/firebase-client";

export type NamedItem = { id: string; name: string };

export type AdminExam = {
  id: string;
  title: string;
  subjectId: string;
  ownerId: string;
  ownerName: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  durationMin: number;
  openAtMs: number | null;
  closeAtMs: number | null;
  classroomIds: string[];
  questionCount: number;
  totalPoints: number | null;
  showResult?: boolean;
};

export type AdminQuestion = {
  id: string;
  ownerId: string;
  ownerName: string;
  subjectId: string;
  type: string;
  body: string;
  points: number;
  choiceCount: number;
  usedIn: number;
  createdAtMs: number | null;
};

export type AdminStats = {
  users: { admins: number; teachers: number; students: number; disabled: number };
  classrooms: number;
  subjects: number;
  exams: { draft: number; published: number; closed: number };
  questions: number;
  attemptsInProgress: number;
};

export const selectClass =
  "h-9 rounded-lg border border-input bg-background px-3 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const fmtDateTime = (ms: number | null) =>
  ms == null ? "—" : new Date(ms).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

/** <input type="datetime-local"> value in the browser's local time. */
export function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v: string): number | null => (v ? new Date(v).getTime() : null);

async function loadNamed(name: "classrooms" | "subjects"): Promise<NamedItem[]> {
  const snap = await getDocs(collection(getClientFirestore(), name));
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.get("name") ?? d.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}
export const loadClassrooms = () => loadNamed("classrooms");
export const loadSubjects = () => loadNamed("subjects");

export const nameOf = (list: NamedItem[], id: string) => list.find((i) => i.id === id)?.name ?? id;

const ADMIN_ERRORS: Record<string, string> = {
  EMAIL_EXISTS: "อีเมลนี้มีบัญชีอยู่แล้ว",
  HAS_CONTENT: "ครูท่านนี้ยังมีข้อสอบหรือชุดสอบอยู่ กรุณาโอนข้อมูลให้ครูท่านอื่นก่อนลบ",
  TARGET_NOT_TEACHER: "ผู้รับโอนต้องเป็นครูที่ยังใช้งานอยู่",
  ROLE_REQUIRED: "ไม่พบบทบาทของผู้ใช้",
  CLASSROOM_NOT_FOUND: "ไม่พบห้องเรียนที่เลือก",
  DRAFT_NOT_SUPPORTED: "ชุดสอบฉบับร่างให้ครูเจ้าของเป็นผู้แก้ไขและเผยแพร่",
  PAPER_MISSING: "ชุดสอบนี้ไม่เคยถูกเผยแพร่ จึงเปิดใหม่ไม่ได้",
  BAD_WINDOW: "ช่วงเวลาไม่ถูกต้อง เวลาปิดต้องอยู่หลังเวลาเปิด",
  ALREADY_CLOSED: "เวลาปิดต้องอยู่หลังเวลาปัจจุบัน",
  NO_CHANGE: "ไม่มีอะไรเปลี่ยนแปลง",
};

/** Error text for admin actions; falls back to the shared messages. */
export function describeAdminError(err: unknown): string {
  if (err instanceof ApiError && ADMIN_ERRORS[err.code]) return ADMIN_ERRORS[err.code];
  return describeApiError(err);
}
