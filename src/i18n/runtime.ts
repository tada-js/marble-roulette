import { MESSAGES, type MessageKey } from "./messages";

export type Language = "ko" | "en";

type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export const LANGUAGE_STORAGE_KEY = "degururu:language";

const listeners = new Set<() => void>();

function normalizeLanguage(value: unknown): Language | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "ko" || raw.startsWith("ko-")) return "ko";
  if (raw === "en" || raw.startsWith("en-")) return "en";
  return null;
}

function readLanguageFromUrl(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    return normalizeLanguage(url.searchParams.get("lang"));
  } catch {
    return null;
  }
}

function readLanguageFromStorage(): Language | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function readLanguageFromNavigator(): Language | null {
  if (typeof navigator === "undefined") return null;
  return normalizeLanguage(navigator.language);
}

function detectInitialLanguage(): Language {
  return readLanguageFromUrl() || readLanguageFromStorage() || readLanguageFromNavigator() || "ko";
}

let currentLanguage: Language = detectInitialLanguage();

function writeLanguageToStorage(language: Language): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore storage errors.
  }
}

function replaceParams(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = params[key];
    return value == null ? "" : String(value);
  });
}

export function tWithLanguage(
  language: Language,
  key: MessageKey,
  params?: TranslationParams
): string {
  const dict = MESSAGES[language] || MESSAGES.ko;
  const fallback = MESSAGES.ko[key];
  const template = dict[key] || fallback || String(key);
  return replaceParams(template, params);
}

export function t(key: MessageKey, params?: TranslationParams): string {
  return tWithLanguage(currentLanguage, key, params);
}

function setMetaContent(selector: string, content: string): void {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLMetaElement)) return;
  element.content = content;
}

function setLinkHref(selector: string, href: string): void {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLLinkElement)) return;
  element.href = href;
}

function applyIndexMetadata(language: Language): void {
  if (!document.getElementById("root")) return;

  const title = tWithLanguage(language, "meta.title");
  const description = tWithLanguage(language, "meta.description");
  const keywords = tWithLanguage(language, "meta.keywords");
  const applicationName = tWithLanguage(language, "meta.applicationName");
  const ogLocale = tWithLanguage(language, "meta.ogLocale");
  const ogImageAlt = tWithLanguage(language, "meta.ogImageAlt");

  document.title = title;
  setMetaContent('meta[name="application-name"]', applicationName);
  setMetaContent('meta[name="apple-mobile-web-app-title"]', applicationName);
  setMetaContent('meta[name="keywords"]', keywords);
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:site_name"]', applicationName);
  setMetaContent('meta[property="og:locale"]', ogLocale);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[property="og:image:alt"]', ogImageAlt);
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);
  setMetaContent('meta[name="twitter:image:alt"]', ogImageAlt);
  setLinkHref('link[rel="manifest"]', language === "en" ? "/manifest-en.webmanifest" : "/manifest.webmanifest");

  const schemaScript = document.querySelector('script[type="application/ld+json"]');
  if (schemaScript instanceof HTMLScriptElement) {
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: tWithLanguage(language, "meta.structuredName"),
      alternateName: "Degururu",
      url: "https://degururu.vercel.app/",
      applicationCategory: "GameApplication",
      inLanguage: tWithLanguage(language, "meta.structuredInLanguage"),
      keywords: tWithLanguage(language, "meta.structuredKeywords")
        .split("|")
        .map((entry) => entry.trim())
        .filter(Boolean),
      description: tWithLanguage(language, "meta.structuredDescription"),
    };
    schemaScript.textContent = JSON.stringify(schema, null, 2);
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function applyDocumentLanguage(language: Language = currentLanguage): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  applyIndexMetadata(language);
}

export function initializeI18n(): void {
  const fromUrl = readLanguageFromUrl();
  if (fromUrl) {
    currentLanguage = fromUrl;
    writeLanguageToStorage(fromUrl);
  }
  applyDocumentLanguage(currentLanguage);
}

export function getCurrentLanguage(): Language {
  return currentLanguage;
}

export function setCurrentLanguage(nextValue: Language | string): Language {
  const next = normalizeLanguage(nextValue);
  if (!next) return currentLanguage;
  if (next === currentLanguage) {
    applyDocumentLanguage(currentLanguage);
    return currentLanguage;
  }

  currentLanguage = next;
  writeLanguageToStorage(next);
  applyDocumentLanguage(next);
  notify();
  return currentLanguage;
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resolveLanguage(value: unknown): Language {
  return normalizeLanguage(value) || "ko";
}
