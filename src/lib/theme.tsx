"use client";

// Task 12 — light/dark theme (the static prototype ships both). The default
// is dark (html starts with class="dark" in the root layout); toggling flips
// the .dark class on <html>, which re-resolves every @theme CSS var in
// globals.css. The preference is persisted in localStorage `avs_theme`.
//
// An inline script in the root layout applies the stored theme before paint to
// avoid a dark/light flash; the provider below only handles the toggle.

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "avs_theme";

/** Apply a theme by toggling the `dark` class on <html>. */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.setAttribute("data-theme", theme);
}

/** Resolve the stored preference (default: dark). SSR → dark. */
export function resolveTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR-safe default; resolvedTheme() is what the toggle uses.
  const [theme, setThemeState] = useState<Theme>("dark");

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage errors (private mode)
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
