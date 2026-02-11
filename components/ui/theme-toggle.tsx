"use client";

import { useEffect, useState } from "react";
import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark";

const STORAGE_KEY = "erp-client-theme";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    const initialTheme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : document.documentElement.dataset.theme === "dark"
          ? "dark"
          : document.documentElement.dataset.theme === "light"
            ? "light"
            : getSystemTheme();

    applyTheme(initialTheme);
    setTheme(initialTheme);
    setMounted(true);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncWithSystem = () => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const next = getSystemTheme();
        applyTheme(next);
        setTheme(next);
      }
    };

    mediaQuery.addEventListener("change", syncWithSystem);
    return () => mediaQuery.removeEventListener("change", syncWithSystem);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  const buttonText = !mounted ? "Theme" : theme === "dark" ? "Light" : "Dark";
  const ariaLabel =
    !mounted || theme === "light"
      ? "Switch to dark mode"
      : "Switch to light mode";

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <span className={styles.indicator} aria-hidden>
        {theme === "dark" ? "L" : "D"}
      </span>
      <span className={styles.text}>{buttonText}</span>
    </button>
  );
}
