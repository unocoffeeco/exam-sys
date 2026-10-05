import { describe, expect, it } from "vitest";
import { generatePassword } from "@/lib/passwords";
import { mapRecords, normalizeRole, parseCsv, resolveClassroomId, userRowSchema } from "@/lib/user-import";

describe("parseCsv", () => {
  it("handles BOM, CRLF, quotes, escaped quotes and blank lines", () => {
    const t = parseCsv('\uFEFFname,email\r\n"Somchai, Jr.","a@x.com"\r\n\r\n"Say ""hi""",b@x.com\r\n');
    expect(t).toEqual([["name", "email"], ["Somchai, Jr.", "a@x.com"], ['Say "hi"', "b@x.com"]]);
  });
  it("auto-detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("keeps a final row without trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toHaveLength(2);
  });
});

describe("mapRecords", () => {
  it("maps Thai headers and normalizes roles", () => {
    const { rows, missing } = mapRecords(parseCsv("ชื่อ-สกุล,อีเมล,บทบาท,ห้อง\nสมชาย,s@x.com,นักเรียน,ม.4/1\nสมหญิง,t@x.com,ครู,"));
    expect(missing).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "สมชาย", email: "s@x.com", role: "STUDENT", classroom: "ม.4/1" });
    expect(rows[1].role).toBe("TEACHER");
  });
  it("defaults the role to STUDENT when the column is missing", () => {
    expect(mapRecords(parseCsv("name,email\nA,a@x.com")).rows[0].role).toBe("STUDENT");
  });
  it("reports missing required columns", () => {
    expect(mapRecords(parseCsv("name\nA")).missing).toEqual(["email"]);
  });
  it("keeps an invalid role text so validation can complain", () => {
    expect(mapRecords(parseCsv("name,email,role\nA,a@x.com,admin")).rows[0].role).toBe("admin");
  });
});

describe("normalizeRole", () => {
  it("never maps to ADMIN", () => {
    expect(normalizeRole("admin")).toBeNull();
    expect(normalizeRole("ผู้ดูแลระบบ")).toBeNull();
    expect(normalizeRole("Teacher")).toBe("TEACHER");
  });
});

describe("userRowSchema", () => {
  const ok = { name: "A", email: " A@X.com ", password: "", role: "STUDENT", classroom: "m4-1" };
  it("normalizes email and blank password", () => {
    const r = userRowSchema.parse(ok);
    expect(r.email).toBe("a@x.com");
    expect(r.password).toBeUndefined();
  });
  it("rejects bad email, short password, ADMIN role, empty name", () => {
    expect(userRowSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(userRowSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(userRowSchema.safeParse({ ...ok, role: "ADMIN" }).success).toBe(false);
    expect(userRowSchema.safeParse({ ...ok, name: " " }).success).toBe(false);
  });
});

describe("resolveClassroomId", () => {
  const rooms = [{ id: "m4-1", name: "ม.4/1" }, { id: "m4-2", name: "ม.4/2" }];
  it("matches by id or name ignoring spaces and case", () => {
    expect(resolveClassroomId("ม.4/1", rooms)).toBe("m4-1");
    expect(resolveClassroomId(" ม. 4/2 ", rooms)).toBe("m4-2");
    expect(resolveClassroomId("M4-1", rooms)).toBe("m4-1");
  });
  it("returns null for unknown or empty input", () => {
    expect(resolveClassroomId("ม.9/9", rooms)).toBeNull();
    expect(resolveClassroomId("", rooms)).toBeNull();
  });
});

describe("generatePassword", () => {
  it("has the requested length, only safe characters, and varies", () => {
    const a = generatePassword();
    expect(a).toHaveLength(10);
    expect(a).toMatch(/^[A-Za-z2-9]+$/);
    expect(a).not.toMatch(/[lIO01]/);
    expect(generatePassword()).not.toBe(a);
  });
});
