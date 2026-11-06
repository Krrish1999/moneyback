import { createContext, use, type ReactNode } from "react";
import type { MoneyBackApi } from "./types";

const ApiContext = createContext<MoneyBackApi | null>(null);

export function ApiProvider({ api, children }: { api: MoneyBackApi; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>;
}

export function useApi(): MoneyBackApi {
  const api = use(ApiContext);
  if (!api) throw new Error("useApi must be used inside <ApiProvider>");
  return api;
}
