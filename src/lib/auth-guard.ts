import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { isRole, type Role } from "@/lib/roles";

export type VerifiedUser = { uid: string; role: Role };
export type TokenVerifier = (idToken: string) => Promise<{ uid: string; role?: unknown }>;

export class AuthError extends Error {
  readonly status: 401 | 403;
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN";
  constructor(status: 401 | 403, code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

/** Only these Admin SDK codes mean "bad token" -> 401. Anything else is a real 500. */
const INVALID_TOKEN_CODES = new Set([
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/argument-error",
  "auth/user-disabled",
  "auth/user-not-found",
]);

function isInvalidTokenError(err: unknown): boolean {
  if (err instanceof AuthError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && INVALID_TOKEN_CODES.has(code);
}

export function extractBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Pure core: no Firebase import at call time, verifier is injected.
 * Missing/invalid/expired token -> 401. Valid token with missing or
 * disallowed role -> 403.
 */
export async function verifyRequestAuth(
  token: string | null,
  allowedRoles: readonly Role[],
  verifyToken: TokenVerifier,
): Promise<VerifiedUser> {
  if (!token) throw new AuthError(401, "UNAUTHENTICATED");

  let decoded: { uid: string; role?: unknown };
  try {
    decoded = await verifyToken(token);
  } catch (err) {
    if (!isInvalidTokenError(err)) throw err; // unexpected -> let route return 500
    throw new AuthError(401, "UNAUTHENTICATED"); // never leak internals
  }

  const { uid, role } = decoded;
  if (!uid || !isRole(role) || !allowedRoles.includes(role)) {
    throw new AuthError(403, "FORBIDDEN");
  }
  return { uid, role };
}

/** Thin wrapper for API routes: pulls the Bearer token and wires the real Admin SDK. */
export async function requireAuth(
  req: NextRequest,
  allowedRoles: readonly Role[],
): Promise<VerifiedUser> {
  const token = extractBearerToken(req.headers.get("authorization"));
  return verifyRequestAuth(token, allowedRoles, async (idToken) => {
    const decoded = await adminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, role: (decoded as { role?: unknown }).role };
  });
}

/** Map an AuthError to a safe JSON response. Never include internals. */
export function authErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.code }, { status: err.status });
  }
  return Response.json({ error: "INTERNAL" }, { status: 500 });
}
