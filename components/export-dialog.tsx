"use client";

import { useState } from "react";
import { useLang } from "./lang-provider";
import { coverRows, useDocMeta } from "@/lib/doc-meta";
import { type ExportFormat, exportPayload } from "@/lib/export";
import type { Source } from "@/lib/types";
import type { Lang, TKey } from "@/lib/i18n";
import type { DocTheme } from "@/lib/doc-theme";
import type { CiteStyle, Reference } from "@/lib/citations";

const FORMATS: { format: ExportFormat; label: string; icon: string; note: TKey }[] = [
  { format: "docx", label: "Word", icon: "📝", note: "export.note.docx" },
  { format: "pdf", label: "PDF", icon: "🖨", note: "export.note.pdf" },
  { format: "pptx", label: "PowerPoint", icon: "📊", note: "export.note.pptx" },
  { format: "html", label: "HTML", icon: "🌐", note: "export.note.html" },
  { format: "md", label: "Markdown", icon: "⌘", note: "export.note.md" },
  { format: "txt", label: "TXT", icon: "📄", note: "export.note.txt" },
];

interface Props {
  title: string;
  markdown: string;
  sources?: Source[];
  createdAt?: string;
  lang?: Lang;
  /** The design chosen in the editor, honoured by every format. */
  theme?: DocTheme;
  references?: Reference[];
  citeStyle?: CiteStyle;
  onClose: () => void;
}

/**
 * Asks about the cover page before exporting, and remembers the student's
 * details so the fields are already filled the next time.
 */
export function ExportDialog({
  title,
  markdown,
  sources,
  createdAt,
  lang,
  theme,
  references,
  citeStyle,
  onClose,
}: Props) {
  const { t, lang: uiLang } = useLang();
  const docLang = lang ?? uiLang;
  const { meta, update, ready } = useDocMeta();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState(false);

  const field = (key: keyof typeof meta, label: TKey, placeholder?: string) => (
    <div className="field" style={{ marginBottom: 9 }}>
      <label htmlFor={`m-${key}`}>{t(label)}</label>
      <input
        id={`m-${key}`}
        type="text"
        value={(meta[key] as string) ?? ""}
        placeholder={placeholder}
        onChange={(event) => update({ [key]: event.target.value })}
      />
    </div>
  );

  const run = async (format: ExportFormat) => {
    setBusy(format);
    setError(false);
    try {
      await exportPayload(format, {
        title,
        markdown,
        lang: docLang,
        sources,
        createdAt,
        meta,
        theme,
        references,
        citeStyle,
        coverRows: meta.cover ? coverRows(meta, docLang) : undefined,
      });
      if (format !== "pdf") onClose();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{t("export.title")}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        {ready && (
          <>
            <label className="checkbox" style={{ marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={meta.cover}
                onChange={(event) => update({ cover: event.target.checked })}
              />
              <strong>{t("export.cover")}</strong>
              <span className="hint">({t("common.optional")})</span>
            </label>
            <p className="hint" style={{ margin: "0 0 12px" }}>
              {t("export.coverHint")}
            </p>

            {meta.cover && (
              <div
                className="card card-tight"
                style={{ marginBottom: 14, background: "var(--surface-2)" }}
              >
                <div className="grid grid-2" style={{ gap: 0, columnGap: 12 }}>
                  {field("author", "export.author")}
                  {field("studentId", "export.studentId")}
                  {field("course", "export.course")}
                  {field("instructor", "export.instructor")}
                  {field("department", "export.department")}
                  {field("institution", "export.institution")}
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={meta.toc}
                    onChange={(event) => update({ toc: event.target.checked })}
                  />
                  {t("export.toc")}
                </label>
                <p className="hint" style={{ margin: "6px 0 0" }}>
                  {t("export.remembered")}
                </p>
              </div>
            )}
          </>
        )}

        {error && <div className="alert alert-error">{t("error.generic")}</div>}

        <strong className="small">{t("export.pick")}</strong>
        <div className="grid grid-3" style={{ marginTop: 9 }}>
          {FORMATS.map((item) => (
            <button
              key={item.format}
              type="button"
              className="card card-tight format-card"
              disabled={busy !== null}
              onClick={() => void run(item.format)}
            >
              <span style={{ fontSize: "1.3rem" }} aria-hidden="true">
                {item.icon}
              </span>
              <strong>{item.label}</strong>
              <span className="tiny muted">
                {busy === item.format ? "…" : t(item.note)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
