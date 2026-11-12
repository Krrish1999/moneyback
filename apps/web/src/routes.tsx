import type { RouteObject } from "react-router";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./features/auth/AuthContext";
import { RequireAuth } from "./features/auth/RequireAuth";
import { RequireConsent } from "./features/consent/RequireConsent";
import { CasePage } from "./pages/CasePage";
import { ConsentPage } from "./pages/ConsentPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { HomePage } from "./pages/HomePage";
import { NewCasePage } from "./pages/NewCasePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignInPage } from "./pages/SignInPage";
import { UploadPage } from "./pages/UploadPage";

export const routes: RouteObject[] = [
  {
    element: (
      <AuthProvider>
        <Layout />
      </AuthProvider>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: "sign-in", element: <SignInPage /> },
      { path: "privacy", element: <PrivacyPage /> },
      {
        // Everything about a case needs a signed-in user.
        element: <RequireAuth />,
        children: [
          { path: "cases/new", element: <NewCasePage /> },
          { path: "consent", element: <ConsentPage /> },
          // Documents can be added only after the user has agreed to the current consent text.
          { element: <RequireConsent />, children: [{ path: "cases/:id/upload", element: <UploadPage /> }] },
          { path: "cases/:id", element: <CasePage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
