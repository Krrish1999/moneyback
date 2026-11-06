import i18next, { type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { hi } from "./hi";

export const LANGUAGES = ["en", "hi"] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = "moneyback.language";

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** localStorage can throw (private mode, blocked storage); the app must work without it. */
export function readStoredLanguage(): Language | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLanguage(language: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not fatal: the choice just won't survive a reload.
  }
}

/** Creates an initialised i18next instance. Resources are bundled, so init is synchronous. */
export function createI18n(language: Language = readStoredLanguage() ?? "en"): I18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: { en: { translation: en }, hi: { translation: hi } },
    lng: language,
    fallbackLng: "en",
    supportedLngs: [...LANGUAGES],
    interpolation: { escapeValue: false }, // React already escapes.
    initAsync: false,
    returnNull: false,
  });
  const applyLang = (lng: string) => {
    if (typeof document !== "undefined") document.documentElement.lang = lng;
  };
  applyLang(language);
  instance.on("languageChanged", (lng) => {
    applyLang(lng);
    if (isLanguage(lng)) storeLanguage(lng);
  });
  return instance;
}
