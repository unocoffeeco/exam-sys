"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onIdTokenChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase-client";
import { isRole, type Role } from "@/lib/roles";

type AuthState = {
  user: User | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onIdTokenChanged also fires after a claims refresh, so role stays current.
    const unsub = onIdTokenChanged(getClientAuth(), async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }
      const token = await nextUser.getIdTokenResult();
      setUser(nextUser);
      setRole(isRole(token.claims.role) ? token.claims.role : null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setRole(null); // clear immediately so no stale role lingers
    await fbSignOut(getClientAuth());
  }, []);

  const value = useMemo<AuthState>(() => ({ user, role, loading, signOut }), [user, role, loading, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
