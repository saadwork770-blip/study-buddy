"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Lang, type TKey, dirFor, translate } from "@/lib/i18n";
import { STORAGE_KEYS } from "@/lib/store";

interface LangValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  toggle: () => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangValue | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  // Arabic is the default; the stored preference is applied after mount so the
  // server-rendered markup and the first client render agree.
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEYS.lang);
      if (stored === "en" || stored === "ar") setLangState(stored);
    } catch {
      /* storage disabled */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirFor(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.lang, next);
    } catch {
      /* storage disabled */
    }
  }, []);

  const value = useMemo<LangValue>(
    () => ({
      lang,
      dir: dirFor(lang),
      setLang,
      toggle: () => setLang(lang === "ar" ? "en" : "ar"),
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const value = useContext(LangContext);
  if (!value) throw new Error("useLang must be used inside <LangProvider>");
  return value;
}
