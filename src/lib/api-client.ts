import { getClientAuth } from "@/lib/firebase-client";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly problems?: string[],
    readonly data?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

/** POST to our own API route with the Firebase ID token as Bearer. */
export const apiPost = <T = unknown>(path: string, body?: unknown) => apiRequest<T>("POST", path, body);
export const apiPatch = <T = unknown>(path: string, body?: unknown) => apiRequest<T>("PATCH", path, body);
export const apiGet = <T = unknown>(path: string) => apiRequest<T>("GET", path);
export const apiDelete = <T = unknown>(path: string) => apiRequest<T>("DELETE", path);

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const user = getClientAuth().currentUser;
  if (!user) throw new ApiError(401, "UNAUTHENTICATED");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; problems?: string[] };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "UNKNOWN", data.problems, data as Record<string, unknown>);
  return data as T;
}

const PROBLEM_MESSAGES: Record<string, string> = {
  NO_TITLE: "ยังไม่ได้ตั้งชื่อชุดสอบ",
  NO_QUESTIONS: "ยังไม่ได้เลือกข้อสอบ",
  NO_CLASSROOM: "ยังไม่ได้เลือกห้องที่สอบได้",
  BAD_DURATION: "เวลาสอบไม่ถูกต้อง",
  BAD_WINDOW: "ยังไม่ได้ตั้งช่วงเวลาเปิด-ปิด หรือเวลาปิดอยู่ก่อนเวลาเปิด",
  ALREADY_CLOSED: "เวลาปิดสอบผ่านไปแล้ว",
  INVALID_QUESTION: "มีข้อสอบที่ไม่สมบูรณ์หรือถูกลบไปแล้ว",
};

export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.problems?.length) return err.problems.map((p) => PROBLEM_MESSAGES[p] ?? p).join(" / ");
    if (err.code === "NOT_DRAFT") return "ชุดสอบนี้เผยแพร่ไปแล้ว";
    if (err.code === "NOT_PUBLISHED") return "ชุดสอบนี้ยังไม่ได้เผยแพร่";
    if (err.code === "CANNOT_EDIT_ADMIN") return "ไม่สามารถแก้ไขบัญชีผู้ดูแลระบบจากหน้านี้";
    if (err.code === "CANNOT_EDIT_SELF") return "ไม่สามารถแก้ไขบัญชีของตัวเอง";
    if (err.code === "CLASSROOM_REQUIRED") return "นักเรียนต้องมีห้องเรียน";
    if (err.code === "CLASSROOM_NOT_FOUND") return "ไม่พบห้องเรียนที่เลือก";
    if (err.code === "NOT_FOUND") return "ไม่พบข้อมูล";
    if (err.code === "NOT_IN_CLASSROOM") return "ชุดสอบนี้ไม่ได้เปิดให้ห้องของคุณ";
    if (err.code === "NOT_OPEN_YET") return "ยังไม่ถึงเวลาเปิดสอบ";
    if (err.code === "ALREADY_CLOSED") return "หมดเวลารับสอบแล้ว";
    if (err.code === "PAPER_MISSING") return "ข้อสอบยังไม่พร้อม กรุณาแจ้งครู";
    if (err.status === 401 || err.status === 403) return "ไม่มีสิทธิ์ดำเนินการ กรุณาเข้าสู่ระบบใหม่";
  }
  return "เกิดข้อผิดพลาด กรุณาลองใหม่";
}
