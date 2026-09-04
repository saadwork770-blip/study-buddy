"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/lang-provider";
import { DocEditor } from "@/components/doc-editor";
import { DEFAULT_THEME, type DocTheme } from "@/lib/doc-theme";
import type { CiteStyle, Reference } from "@/lib/citations";
import { useLibrary } from "@/lib/store";

const DRAFT = "sb.draft";
const THEME = "sb.theme.doc";

function Editor() {
  const { t } = useLang();
  const params = useSearchParams();
  const { items, saveItem, ready } = useLibrary();
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [theme, setTheme] = useState<DocTheme>(DEFAULT_THEME);
  const [references, setReferences] = useState<Reference[]>([]);
  const [citeStyle, setCiteStyle] = useState<CiteStyle>("apa7");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Open a library item when asked, otherwise restore the working draft.
  useEffect(() => {
    if (!ready || loaded) return;
    const id = params.get("id");
    const item = id ? items.find((entry) => entry.id === id) : null;

    if (item) {
      setTitle(item.title);
      setMarkdown(item.content);
    } else {
      try {
        const raw = window.localStorage.getItem(DRAFT);
        if (raw) {
          const draft = JSON.parse(raw) as {
            title: string;
            markdown: string;
            references?: Reference[];
            citeStyle?: CiteStyle;
          };
          setTitle(draft.title ?? "");
          setMarkdown(draft.markdown ?? "");
          if (draft.references) setReferences(draft.references);
          if (draft.citeStyle) setCiteStyle(draft.citeStyle);
        }
      } catch {
        /* storage disabled */
      }
    }

    try {
      const raw = window.localStorage.getItem(THEME);
      if (raw) setTheme({ ...DEFAULT_THEME, ...(JSON.parse(raw) as DocTheme) });
    } catch {
      /* storage disabled */
    }
    setLoaded(true);
  }, [ready, loaded, params, items]);

  // Autosave the draft so a refresh never loses work.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT,
          JSON.stringify({ title, markdown, references, citeStyle }),
        );
      } catch {
        /* storage disabled */
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, markdown, references, citeStyle, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(THEME, JSON.stringify(theme));
    } catch {
      /* storage disabled */
    }
  }, [theme, loaded]);

  useEffect(() => setSaved(false), [markdown, title]);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>{t("nav.editor")}</h1>
        <p>{t("ed.subtitle")}</p>
      </div>

      <DocEditor
        title={title}
        onTitleChange={setTitle}
        markdown={markdown}
        onChange={setMarkdown}
        theme={theme}
        onThemeChange={setTheme}
        references={references}
        onReferencesChange={setReferences}
        citeStyle={citeStyle}
        onCiteStyleChange={setCiteStyle}
        saved={saved}
        onSave={() => {
          saveItem({
            kind: "summary",
            title: title || t("nav.editor"),
            content: markdown,
            lang: "ar",
          });
          setSaved(true);
        }}
      />
    </main>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <Editor />
    </Suspense>
  );
}
