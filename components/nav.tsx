"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "./lang-provider";
import { STORAGE_KEYS } from "@/lib/store";
import type { TKey } from "@/lib/i18n";

const LINKS: { href: string; key: TKey; icon: string }[] = [
  { href: "/", key: "nav.home", icon: "🏠" },
  { href: "/tasks", key: "nav.tasks", icon: "🗂" },
  { href: "/research", key: "nav.research", icon: "🔎" },
  { href: "/summarize", key: "nav.summarize", icon: "📄" },
  { href: "/produce", key: "nav.produce", icon: "✍️" },
  { href: "/editor", key: "nav.editor", icon: "🖋" },
  { href: "/chat", key: "nav.chat", icon: "💬" },
  { href: "/library", key: "nav.library", icon: "📚" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEYS.theme);
    } catch {
      /* storage disabled */
    }
    const initial =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      /* storage disabled */
    }
  }, [theme]);

  return (
    <button
      type="button"
      className="icon-button"
      aria-label="theme"
      onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

export function Nav() {
  const { t, toggle } = useLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <span>{t("app.name")}</span>
        </Link>

        <nav className={`nav-links ${open ? "open" : ""}`}>
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "nav-link active" : "nav-link"}
                onClick={() => setOpen(false)}
              >
                <span aria-hidden="true">{link.icon}</span>
                {t(link.key)}
              </Link>
            );
          })}
        </nav>

        <div className="nav-actions">
          <button type="button" className="icon-button lang-button" onClick={toggle}>
            {t("nav.language")}
          </button>
          <ThemeToggle />
          <button
            type="button"
            className="icon-button menu-button"
            aria-label={t("nav.menu")}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}
