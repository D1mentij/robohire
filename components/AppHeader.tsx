"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const THEME_STORAGE_KEY = "robohire:theme";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/upload", label: "Upload" },
  { href: "/jobs", label: "Jobs" },
  { href: "/robot", label: "3D Robot" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    let initial: "light" | "dark" = "dark";
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        initial = saved;
      } else if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        initial = "light";
      }
    } catch {
      // Ignore storage access errors
    }
    document.documentElement.classList.toggle("dark", initial === "dark");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
  }, []);

  function toggleTheme() {
    const next: "light" | "dark" = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/90 bg-white/90 backdrop-blur-md transition-colors dark:border-slate-800/90 dark:bg-slate-900/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-slate-900 transition hover:opacity-90 dark:text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 font-mono text-xs font-extrabold text-white shadow-sm">
            R
          </span>
          <span className="text-base font-extrabold tracking-tight">
            RoboHire
          </span>
          <span className="hidden rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-700 dark:text-sky-300 sm:inline-block">
            Booster K1
          </span>
        </Link>

        {/* Navigation Links + Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          <nav
            aria-label="Main Navigation"
            className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-950/70"
          >
            {NAV_LINKS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition sm:px-3 ${
                    isActive
                      ? "bg-sky-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={toggleTheme}
            data-testid="theme-toggle-btn"
            aria-label={`Switch to ${theme === "dark" ? "Light" : "Dark"} theme`}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
