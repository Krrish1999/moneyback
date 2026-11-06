import { useTranslation } from "react-i18next";
import { PRICES_PAISE, SUCCESS_FEE_RATE } from "@moneyback/shared";
import { PrimaryLink } from "../components/ui";
import { formatRate, formatRupees } from "../lib/money";

export function HomePage() {
  const { t } = useTranslation();

  // PLACEHOLDER — fee presentation and wording need founder approval (CLAUDE.md "founder decides").
  // Amounts come only from @moneyback/shared (D-002); never hard-code them here.
  const fees = [
    { key: "check", price: t("home.fees.free") },
    { key: "filing", price: formatRupees(PRICES_PAISE.filing) },
    { key: "escalation", price: formatRupees(PRICES_PAISE.escalation) },
    { key: "success", price: formatRate(SUCCESS_FEE_RATE) },
  ] as const;

  return (
    <>
      <title>{`${t("home.pageTitle")} · MoneyBack`}</title>
      <section aria-labelledby="home-title" className="space-y-4">
        <p className="text-base font-medium text-brand">{t("home.eyebrow")}</p>
        <h1 id="home-title" className="text-[1.75rem] font-semibold leading-tight text-ink">
          {t("home.title")}
        </h1>
        <p className="text-lg text-ink">{t("home.intro1")}</p>
        <p className="text-base text-muted">{t("home.intro2")}</p>
        <div className="pt-2">
          <PrimaryLink to="/cases/new" data-testid="start-case-button">
            {t("home.cta")}
          </PrimaryLink>
          <p className="mt-2 text-center text-base text-muted">{t("home.ctaHint")}</p>
        </div>
      </section>

      <section aria-labelledby="fees-title" className="mt-10">
        <h2 id="fees-title" className="text-xl font-semibold text-ink">
          {t("home.fees.title")}
        </h2>
        <p className="mt-1 text-base text-muted">{t("home.fees.intro")}</p>
        <ol className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {fees.map(({ key, price }) => (
            <li key={key} className="flex items-start justify-between gap-4 px-4 py-4">
              <div>
                <h3 className="text-base font-semibold text-ink">{t(`home.fees.${key}.title`)}</h3>
                <p className="mt-1 text-base text-muted">{t(`home.fees.${key}.body`)}</p>
              </div>
              <p className="shrink-0 text-lg font-semibold tabular-nums text-brand">{price}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
