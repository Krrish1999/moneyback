import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { PageHeading, PrimaryButton } from "../components/ui";
import { useAuth } from "../features/auth/AuthContext";
import { CONSENT_POINTS } from "./ConsentPage";

/**
 * Public privacy page, with "Delete my data" for a signed-in user.
 * PLACEHOLDER COPY: every string under `privacy.*` and `consent.*` is a draft until the founder approves it (F-010).
 * It does not yet state a retention period or a grievance contact, because neither has been decided.
 */
export function PrivacyPage() {
  const { t } = useTranslation();
  const { state, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "failed">("idle");

  async function onDelete() {
    setStep("busy");
    try {
      await deleteAccount();
      await navigate("/", { replace: true });
    } catch {
      setStep("failed");
    }
  }

  return (
    <>
      <title>{`${t("privacy.pageTitle")} · MoneyBack`}</title>
      <PageHeading>{t("privacy.title")}</PageHeading>
      <p className="mt-2 text-base text-muted">{t("privacy.intro")}</p>
      <p className="mt-4 rounded-lg border border-line bg-card px-4 py-3 text-base text-ink">{t("consent.draftNotice")}</p>

      <div className="mt-6 space-y-5">
        {CONSENT_POINTS.map((point) => (
          <section key={point}>
            <h2 className="text-lg font-semibold text-ink">{t(`consent.points.${point}.title`)}</h2>
            <p className="mt-1 text-base text-muted">{t(`consent.points.${point}.body`)}</p>
          </section>
        ))}
      </div>

      {state.status === "signedIn" && (
        <section className="mt-8 rounded-lg border border-line bg-card px-4 py-4">
          <h2 className="text-lg font-semibold text-ink">{t("privacy.delete.title")}</h2>
          <p className="mt-1 text-base text-muted">{t("privacy.delete.body")}</p>
          {step === "idle" || step === "failed" ? (
            <button
              type="button"
              data-testid="delete-data"
              onClick={() => setStep("confirm")}
              className="mt-4 min-h-11 rounded-full border border-ink px-5 text-base font-medium text-ink hover:bg-brand-soft"
            >
              {t("privacy.delete.start")}
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <p role="alert" className="text-base font-medium text-ink">
                {t("privacy.delete.confirmText")}
              </p>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton type="button" data-testid="delete-data-confirm" disabled={step === "busy"} onClick={() => void onDelete()}>
                  {step === "busy" ? t("privacy.delete.deleting") : t("privacy.delete.confirm")}
                </PrimaryButton>
                <button
                  type="button"
                  disabled={step === "busy"}
                  onClick={() => setStep("idle")}
                  className="min-h-11 rounded-full px-5 text-base font-medium text-brand hover:bg-brand-soft"
                >
                  {t("privacy.delete.cancel")}
                </button>
              </div>
            </div>
          )}
          {step === "failed" && (
            <p role="alert" className="mt-3 text-base font-medium text-ink">
              {t("privacy.delete.failed")}
            </p>
          )}
        </section>
      )}
    </>
  );
}
