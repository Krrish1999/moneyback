import { Navigate, Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { PrimaryButton } from "../../components/ui";
import { useAuth } from "./AuthContext";

/** Only same-app paths are allowed as a return address, so a crafted link cannot send people elsewhere. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

/** Route guard: the screens below it are shown only to a signed-in user. */
export function RequireAuth() {
  const { state, retry } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <p role="status" data-testid="auth-loading" className="text-base text-muted">
        {t("auth.checking")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="space-y-4">
        <p className="text-base text-ink">{t("auth.unreachable")}</p>
        <PrimaryButton type="button" onClick={retry}>
          {t("auth.retry")}
        </PrimaryButton>
      </div>
    );
  }
  if (state.status === "signedOut") {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}
