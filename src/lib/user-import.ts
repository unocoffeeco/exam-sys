// Pure CSV parsing / validation for bulk user import. No Firebase imports: unit-testable.
import { z } from "zod";

/** Minimal CSV parser: BOM, CRLF, quoted fields with "" escapes, delimiter auto-detect (, ; tab). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"]
    .map((d) => ({ d, n: firstLine.split(d).length - 1 }))
    .sort((a, b) => b.n - a.n)[0];
  const delim = delimiter && delimiter.n > 0 ? delimiter.d : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) endField();
    else if (ch === "\n") endRow();
    else if (ch === "\r") continue;
    else field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

export type RawUserRow = { name: string; email: string; password: string; role: string; classroom: string };

const HEADER_ALIASES: Record<keyof RawUserRow, string[]> = {
  name: ["name", "fullname", "full name", "ชื่อ", "ชื่อ-สกุล", "ชื่อ-นามสกุล", "ชื่อสกุล", "ชื่อนามสกุล"],
  email: ["email", "e-mail", "อีเมล", "อีเมล์"],
  password: ["password", "รหัสผ่าน"],
  role: ["role", "บทบาท", "ประเภท"],
  classroom: ["classroom", "class", "ห้อง", "ห้องเรียน"],
};

export function normalizeRole(raw: string): "STUDENT" | "TEACHER" | null {
  const v = raw.trim().toLowerCase();
  if (v === "") return "STUDENT"; // default when the column is absent/blank
  if (["student", "นักเรียน", "นร.", "นร"].includes(v)) return "STUDENT";
  if (["teacher", "ครู", "อาจารย์", "คุณครู"].includes(v)) return "TEACHER";
  return null;
}

/** Map a parsed table (first row = headers) to user rows. Reports missing required columns. */
export function mapRecords(table: string[][]): { rows: RawUserRow[]; missing: string[] } {
  if (table.length === 0) return { rows: [], missing: ["name", "email"] };
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const col = {} as Record<keyof RawUserRow, number>;
  for (const key of Object.keys(HEADER_ALIASES) as Array<keyof RawUserRow>) {
    col[key] = headers.findIndex((h) => HEADER_ALIASES[key].includes(h));
  }
  const missing = (["name", "email"] as const).filter((k) => col[k] < 0);
  if (missing.length > 0) return { rows: [], missing };

  const get = (r: string[], k: keyof RawUserRow) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
  const rows = table.slice(1).map((r) => {
    const roleRaw = get(r, "role");
    return {
      name: get(r, "name"),
      email: get(r, "email"),
      password: get(r, "password"),
      role: normalizeRole(roleRaw) ?? roleRaw, // keep invalid text so validation can report it
      classroom: get(r, "classroom"),
    };
  });
  return { rows, missing: [] };
}

/** Shared by the preview (client) and the API (server). Admin accounts can never be imported. */
export const userRowSchema = z.object({
  name: z.string().trim().min(1, "ไม่มีชื่อ").max(100, "ชื่อยาวเกินไป"),
  email: z.string().trim().toLowerCase().email("อีเมลไม่ถูกต้อง").max(200),
  password: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || v.length >= 8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
  role: z.enum(["STUDENT", "TEACHER"], "บทบาทต้องเป็น นักเรียน หรือ ครู"),
  classroom: z.string().trim().max(100).optional(),
});
export type UserRow = z.infer<typeof userRowSchema>;

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, "").toLowerCase();

/** Match by classroom id or name (ignoring spaces/case), e.g. "ม.4/1" or "m4-1". */
export function resolveClassroomId(input: string, classrooms: Array<{ id: string; name: string }>): string | null {
  const q = norm(input);
  if (!q) return null;
  return classrooms.find((c) => norm(c.id) === q || norm(c.name) === q)?.id ?? null;
}

export const IMPORT_TEMPLATE = "ชื่อ-สกุล,อีเมล,บทบาท,ห้อง,รหัสผ่าน\nสมชาย ใจดี,somchai@school.ac.th,นักเรียน,ม.4/1,\nสมหญิง รักเรียน,somying@school.ac.th,ครู,,";
