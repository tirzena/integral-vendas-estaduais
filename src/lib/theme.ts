export type IntegralTheme = "dark" | "light";
export const THEME_STORAGE_KEY = "os-integral-theme";
export function readSavedTheme(): IntegralTheme {
  try { return typeof window !== "undefined" && window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}
export function applyTheme(theme: IntegralTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset["theme"] = theme;
  root.style.colorScheme = theme;
  try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Theme remains usable without storage. */ }
}
