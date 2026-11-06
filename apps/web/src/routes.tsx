import type { RouteObject } from "react-router";
import { Layout } from "./components/Layout";
import { CasePage } from "./pages/CasePage";
import { HomePage } from "./pages/HomePage";
import { NewCasePage } from "./pages/NewCasePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { UploadPage } from "./pages/UploadPage";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "cases/new", element: <NewCasePage /> },
      { path: "cases/:id/upload", element: <UploadPage /> },
      { path: "cases/:id", element: <CasePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
