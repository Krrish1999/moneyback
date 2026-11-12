import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CONSENT_VERSION } from "@moneyback/shared";
import { PageHeading, PrimaryButton } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import { safeNextPath } from "../features/auth/RequireAuth";

export const CONSENT_POINTS = ["collect", "purpose", "processors", "control"] as const;

/**
 * Asks for consent before any document is uploaded. Shown inside <RequireAuth>.
 * PLACEHOLDER COPY: every string under `consent.*` is a draft until the founder approves it (F-010).
 */
export function ConsentPage() {
  const { t } = useTranslation();
  const { state, acceptConsent } = useAuth();
  const [params] = useSearchParams();
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState<"unchecked" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status !== "signedIn") return null;
  if (state.user.consentVersion === CONSENT_VERSION) return <Navigate to={safeNextPath(params.get("next"))} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!agreed) {
      setProblem("unchecked");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await acceptConsent();
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <title>{`${t("consent.pageTitle")} · MoneyBack`}</title>
      <PageHeading>{t("consent.title")}</PageHeading>
      <p className="mt-2 text-base text-muted">{t("consent.intro")}</p>
      <p data-testid="consent-draft" className="mt-4 rounded-lg border border-line bg-card px-4 py-3 text-base text-ink">
        {t("consent.draftNotice")}
      </p>

      <ul className="mt-6 space-y-4">
        {CONSENT_POINTS.map((point) => (
          <li key={point} className="rounded-lg border border-line bg-card px-4 py-3">
            <h2 className="text-lg font-semibold text-ink">{t(`consent.points.${point}.title`)}</h2>
            <p className="mt-1 text-base text-muted">{t(`consent.points.${point}.body`)}</p>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-base text-ink">
        <Link to="/privacy" className="font-medium text-brand underline">
          {t("consent.privacyLink")}
        </Link>
      </p>

      <form onSubmit={(event) => void onSubmit(event)} noValidate className="mt-6 space-y-4">
        <label className="flex min-h-11 items-start gap-3 text-base text-ink">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => {
              setAgreed(event.target.checked);
              setProblem(null);
            }}
            aria-invalid={problem === "unchecked"}
            aria-describedby={problem ? "consent-problem" : undefined}
            className="mt-1 size-6 shrink-0 accent-brand"
          />
          <span>{t("consent.checkbox")}</span>
        </label>
        {problem && (
          <p id="consent-problem" role="alert" className="text-base font-medium text-ink">
            {t(`consent.problems.${problem}`)}
          </p>
        )}
        <PrimaryButton type="submit" data-testid="consent-submit" disabled={busy}>
          {busy ? t("consent.saving") : t("consent.submit")}
        </PrimaryButton>
      </form>
    </>
  );
}
