import { useTranslation } from "react-i18next";

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const next = i18n.resolvedLanguage === "hi" ? "en" : "hi";
  return (
    <button
      type="button"
      data-testid="language-switch"
      aria-label={t("language.switchAria")}
      onClick={() => void i18n.changeLanguage(next)}
      className="min-h-11 rounded-full border border-line bg-card px-4 text-base font-medium text-brand hover:bg-brand-soft"
    >
      <span lang={next}>{t("language.switchLabel")}</span>
    </button>
  );
}
