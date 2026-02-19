import { useSyncExternalStore } from "react";
import type { MessageKey } from "./messages";
import {
  getCurrentLanguage,
  setCurrentLanguage,
  subscribeLanguage,
  t,
  tWithLanguage,
  type Language,
} from "./runtime";

type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export function useI18n() {
  const language = useSyncExternalStore(subscribeLanguage, getCurrentLanguage, getCurrentLanguage);

  return {
    language,
    setLanguage: setCurrentLanguage,
    t: (key: MessageKey, params?: TranslationParams) => tWithLanguage(language, key, params),
  } as {
    language: Language;
    setLanguage: (next: Language | string) => Language;
    t: (key: MessageKey, params?: TranslationParams) => string;
  };
}

export { t };
