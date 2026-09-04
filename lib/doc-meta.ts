"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "./i18n";

/** Cover-page and front-matter details, remembered between exports. */
export interface DocMeta {
  cover: boolean;
  toc: boolean;
  author?: string;
  studentId?: string;
  course?: string;
  instructor?: string;
  institution?: string;
  department?: string;
  /** Blank means "today", formatted for the document's language. */
  date?: string;
}

export const EMPTY_META: DocMeta = { cover: false, toc: false };

const KEY = "sb.docmeta";

/**
 * The student's own details barely change between assignments, so they are
 * kept in the browser and pre-filled on every export.
 */
export function useDocMeta() {
  const [meta, setMeta] = useState<DocMeta>(EMPTY_META);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setMeta({ ...EMPTY_META, ...(JSON.parse(raw) as DocMeta) });
    } catch {
      /* storage disabled */
    }
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<DocMeta>) => {
    setMeta((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage disabled */
      }
      return next;
    });
  }, []);

  return { meta, update, ready };
}

export function formatDate(lang: Lang, value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value ?? "";
  return date.toLocaleDateString(lang === "ar" ? "ar" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Row labels for the cover page, in the document's own language. */
export function coverLabels(lang: Lang) {
  return lang === "ar"
    ? {
        author: "إعداد الطالب",
        studentId: "الرقم الجامعي",
        course: "المقرر",
        instructor: "إشراف",
        institution: "الجامعة",
        department: "الكلية / القسم",
        date: "التاريخ",
        toc: "المحتويات",
      }
    : {
        author: "Prepared by",
        studentId: "Student ID",
        course: "Course",
        instructor: "Supervised by",
        institution: "University",
        department: "Faculty / Department",
        date: "Date",
        toc: "Contents",
      };
}

/** The cover rows that actually have a value, in display order. */
export function coverRows(meta: DocMeta, lang: Lang): { label: string; value: string }[] {
  const L = coverLabels(lang);
  return (
    [
      ["author", meta.author],
      ["studentId", meta.studentId],
      ["course", meta.course],
      ["instructor", meta.instructor],
      ["department", meta.department],
      ["institution", meta.institution],
    ] as const
  )
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => ({ label: L[key], value: (value as string).trim() }))
    .concat({ label: L.date, value: formatDate(lang, meta.date) });
}
