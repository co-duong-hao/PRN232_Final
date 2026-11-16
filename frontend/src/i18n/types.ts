export type Language = "vi" | "en";

export const LANGUAGE_STORAGE_KEY = "exe_language";

export function getStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === "vi" || saved === "en") {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return "vi"; // Mặc định khi mở lần đầu là Tiếng Việt
}

export function setStoredLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors
  }
}
