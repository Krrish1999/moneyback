import { useTranslation } from "react-i18next";
import { PageHeading, PrimaryLink } from "../components/ui";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <>
      <title>{`${t("notFound.pageTitle")} · MoneyBack`}</title>
      <PageHeading>{t("notFound.title")}</PageHeading>
      <p className="mt-2 text-base text-muted">{t("notFound.body")}</p>
      <PrimaryLink to="/" className="mt-6">
        {t("notFound.home")}
      </PrimaryLink>
    </>
  );
}
