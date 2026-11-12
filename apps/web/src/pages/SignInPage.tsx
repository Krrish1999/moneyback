import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/types";
import { PageHeading } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import { GoogleButton } from "../features/auth/GoogleButton";
import { safeNextPath } from "../features/auth/RequireAuth";
import { GOOGLE_CLIENT_ID } from "../config";

type Problem = "failed" | "tooMany" | "unavailable" | "conflict";

function problemFor(err: unknown): Problem {
  if (err instanceof ApiError) {
    if (err.status === 429) return "tooMany";
    if (err.status === 409) return "conflict";
    if (err.status === 0 || err.status >= 500) return "unavailable";
  }
  return "failed";
}

export function SignInPage({ clientId = GOOGLE_CLIENT_ID }: { clientId?: string }) {
  const { t, i18n } = useTranslation();
  const { state, signInWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "signedIn") return <Navigate to={safeNextPath(params.get("next"))} replace />;

  async function onCredential(credential: string) {
    setBusy(true);
    setProblem(null);
    try {
      await signInWithGoogle(credential);
    } catch (err) {
      setProblem(problemFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <title>{`${t("auth.pageTitle")} · MoneyBack`}</title>
      <PageHeading>{t("auth.title")}</PageHeading>
      <p className="mt-2 text-base text-muted">{t("auth.body")}</p>

      <div className="mt-6 space-y-4">
        {clientId ? (
          <GoogleButton
            clientId={clientId}
            locale={i18n.resolvedLanguage ?? "en"}
            onCredential={(credential) => void onCredential(credential)}
            onUnavailable={() => setProblem("unavailable")}
          />
        ) : (
          <p role="alert" className="rounded-lg border border-line bg-card px-4 py-3 text-base text-ink">
            {t("auth.notConfigured")}
          </p>
        )}
        {busy && (
          <p role="status" className="text-base text-muted">
            {t("auth.signingIn")}
          </p>
        )}
        {problem && (
          <p role="alert" className="rounded-lg border border-line bg-card px-4 py-3 text-base text-ink">
            {t(`auth.problems.${problem}`)}
          </p>
        )}
      </div>
    </>
  );
}
