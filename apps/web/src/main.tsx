import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { I18nextProvider } from "react-i18next";
import { ApiProvider } from "./api/context";
import { createHttpApi } from "./api/http";
import { createMockApi } from "./api/mock";
import { API_URL } from "./config";
import { createI18n } from "./i18n";
import { routes } from "./routes";
import "./index.css";

// With an API address the app talks to apps/api; without one it runs on the in-memory mock (demo, e2e).
const api = API_URL ? createHttpApi(API_URL) : createMockApi({ latencyMs: 200 });
const i18n = createI18n();
const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <ApiProvider api={api}>
        <RouterProvider router={router} />
      </ApiProvider>
    </I18nextProvider>
  </StrictMode>,
);
