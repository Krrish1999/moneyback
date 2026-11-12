import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CONSENT_VERSION } from "@moneyback/shared";
import { useApi } from "../../api/context";
import type { SessionUser } from "../../api/types";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: SessionUser }
  /** The API could not be reached, so we do not know. */
  | { status: "error" };

type AuthValue = {
  state: AuthState;
  signInWithGoogle(credential: string): Promise<void>;
  signOut(): Promise<void>;
  /** Records agreement to the current consent text. Rejects if the API refuses. */
  acceptConsent(): Promise<void>;
  /** Deletes the user and all their data, then signs out. Rejects if the API refuses. */
  deleteAccount(): Promise<void>;
  /** Ask the API again who is signed in (after an error). */
  retry(): void;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Holds who is signed in. The session itself is an HttpOnly cookie that this code cannot read. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.getMe().then(
      (user) => {
        if (!cancelled) setState(user ? { status: "signedIn", user } : { status: "signedOut" });
      },
      () => {
        if (!cancelled) setState({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const signInWithGoogle = useCallback(
    async (credential: string) => {
      const user = await api.signInWithGoogle(credential);
      setState({ status: "signedIn", user });
    },
    [api],
  );

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } finally {
      setState({ status: "signedOut" });
    }
  }, [api]);

  const acceptConsent = useCallback(async () => {
    const { version } = await api.acceptConsent(CONSENT_VERSION);
    setState((s) => (s.status === "signedIn" ? { status: "signedIn", user: { ...s.user, consentVersion: version } } : s));
  }, [api]);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    setState({ status: "signedOut" });
  }, [api]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ state, signInWithGoogle, signOut, acceptConsent, deleteAccount, retry }),
    [state, signInWithGoogle, signOut, acceptConsent, deleteAccount, retry],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
