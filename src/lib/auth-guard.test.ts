import { describe, expect, it, vi } from "vitest";
import { AuthError, extractBearerToken, verifyRequestAuth, type TokenVerifier } from "@/lib/auth-guard";

const ok = (uid: string, role?: unknown): TokenVerifier =>
  vi.fn(async () => ({ uid, role }));

describe("extractBearerToken", () => {
  it("reads a valid Bearer header", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer  spaced ")).toBe("spaced");
  });
  it("returns null when absent or malformed", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Token abc")).toBeNull();
  });
});

describe("verifyRequestAuth", () => {
  it("401 when there is no token", async () => {
    await expect(verifyRequestAuth(null, ["ADMIN"], ok("u1", "ADMIN")))
      .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("401 when the token is invalid/expired", async () => {
    const verifier: TokenVerifier = vi.fn(async () => {
      throw Object.assign(new Error("expired"), { code: "auth/id-token-expired" });
    });
    await expect(verifyRequestAuth("bad", ["ADMIN"], verifier))
      .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("403 when the role is not allowed", async () => {
    await expect(verifyRequestAuth("t", ["ADMIN"], ok("u1", "STUDENT")))
      .rejects.toBeInstanceOf(AuthError);
    await expect(verifyRequestAuth("t", ["ADMIN"], ok("u1", "STUDENT")))
      .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("403 when the role claim is missing or malformed", async () => {
    await expect(verifyRequestAuth("t", ["ADMIN"], ok("u1", undefined)))
      .rejects.toMatchObject({ status: 403 });
    await expect(verifyRequestAuth("t", ["ADMIN"], ok("u1", "SUPERUSER")))
      .rejects.toMatchObject({ status: 403 });
  });

  it("returns { uid, role } when the role is allowed", async () => {
    await expect(verifyRequestAuth("t", ["TEACHER", "ADMIN"], ok("u1", "TEACHER")))
      .resolves.toEqual({ uid: "u1", role: "TEACHER" });
  });

  it("does not swallow unexpected Admin SDK errors as 401", async () => {
    const verifier: TokenVerifier = vi.fn(async () => {
      throw Object.assign(new Error("backend down"), { code: "app/network-error" });
    });
    await expect(verifyRequestAuth("t", ["ADMIN"], verifier)).rejects.toThrow("backend down");
  });
});
