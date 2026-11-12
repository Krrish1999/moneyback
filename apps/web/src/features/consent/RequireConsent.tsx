import { Navigate, Outlet, useLocation } from "react-router";
import { CONSENT_VERSION } from "@moneyback/shared";
import { useAuth } from "../auth/AuthContext";

/**
 * Route guard, used inside <RequireAuth>: the screens below it are shown only after the user has agreed
 * to the current consent text. Anything that takes in documents must sit under this guard.
 * The API enforces the same rule on its side (`requireConsent`); this guard is for the user's benefit.
 */
export function RequireConsent() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status !== "signedIn") return null; // <RequireAuth> above handles every other state
  if (state.user.consentVersion !== CONSENT_VERSION) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/consent?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}
