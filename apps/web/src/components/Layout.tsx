import { Link, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "./LanguageSwitch";

export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:rounded focus:bg-card focus:px-3 focus:py-2"
      >
        {t("app.skipToContent")}
      </a>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" aria-label={t("app.homeLink")} className="flex items-center gap-2 text-lg font-semibold text-ink">
            <img src="/icon.svg" alt="" width={28} height={28} className="rounded-md" />
            {t("app.name")}
          </Link>
          <LanguageSwitch />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-xl px-4 py-5 text-base text-muted">{t("footer.disclaimer")}</p>
      </footer>
    </div>
  );
}
