import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { I18nextProvider } from "react-i18next";
import { ApiProvider } from "./api/context";
import { createMockApi } from "./api/mock";
import { createI18n } from "./i18n";
import { routes } from "./routes";
import "./index.css";

// Swap for the HTTP client once W1-03 (POST /cases, GET /cases/:id) is available.
const api = createMockApi({ latencyMs: 200 });
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
