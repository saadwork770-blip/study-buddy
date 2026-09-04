"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "./markdown";
import { useLang } from "./lang-provider";
import { type ExportFormat, exportPayload } from "@/lib/export";
import { wordCount } from "@/lib/markdown";
import { useLibrary } from "@/lib/store";
import type { LibraryKind, Source } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

const FORMATS: { format: ExportFormat; label: string; icon: string }[] = [
  { format: "docx", label: "Word (.docx)", icon: "📝" },
  { format: "pptx", label: "PowerPoint (.pptx)", icon: "📊" },
  { format: "pdf", label: "PDF", icon: "🖨" },
  { format: "md", label: "Markdown (.md)", icon: "⌘" },
  { format: "html", label: "HTML", icon: "🌐" },
  { format: "txt", label: "Text (.txt)", icon: "📄" },
  { format: "json", label: "JSON", icon: "{ }" },
];

interface Props {
  title: string;
  markdown: string;
  kind: LibraryKind;
  sources?: Source[];
  streaming?: boolean;
  /** Translation key for the current activity, shown while streaming. */
  status?: string | null;
  error?: string | null;
  onRetry?: () => void;
}

export function OutputPanel({
  title,
  markdown,
  kind,
  sources,
  streaming,
  status,
  error,
  onRetry,
}: Props) {
  const { t, lang } = useLang();
  const { saveItem } = useLibrary();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    setSaved(false);
  }, [markdown]);

  const payload = { title, markdown, lang, sources };

  const handleExport = async (format: ExportFormat) => {
    setMenuOpen(false);
    setBusy(format);
    try {
      await exportPayload(format, payload);
    } catch {
      window.alert(t("error.generic"));
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  if (error) {
    return (
      <div className="card">
        <div className="alert alert-error">{t(error as TKey)}</div>
        {onRetry && (
          <button type="button" className="button button-ghost" onClick={onRetry}>
            {t("common.retry")}
          </button>
        )}
      </div>
    );
  }

  if (!markdown && !streaming) return null;

  return (
    <div className="card">
      <div className="output-toolbar no-print">
        <strong className="small">{t("out.result")}</strong>
        {streaming ? (
          <span className="status-line">
            <span className="dot-pulse" />
            {status ? t(status as TKey) : t("common.loading")}
          </span>
        ) : (
          <span className="tiny muted">
            {wordCount(markdown)} {t("common.words")}
          </span>
        )}

        <span className="spacer" />

        <button
          type="button"
          className="button button-ghost button-sm"
          onClick={handleCopy}
          disabled={!markdown}
        >
          {copied ? `✓ ${t("out.copied")}` : t("out.copy")}
        </button>

        <button
          type="button"
          className="button button-ghost button-sm"
          disabled={!markdown || streaming || saved}
          onClick={() => {
            saveItem({ kind, title, content: markdown, lang, sources });
            setSaved(true);
          }}
        >
          {saved ? `✓ ${t("out.saved")}` : t("out.save")}
        </button>

        <div className="export-menu" ref={menuRef}>
          <button
            type="button"
            className="button button-sm"
            disabled={!markdown || streaming}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⤓ {t("out.export")}
          </button>
          {menuOpen && (
            <div className="export-list" role="menu">
              {FORMATS.map((item) => (
                <button
                  key={item.format}
                  type="button"
                  role="menuitem"
                  disabled={busy !== null}
                  onClick={() => handleExport(item.format)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                  {busy === item.format && <span className="tiny muted">…</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Markdown text={markdown} />
      {streaming && <span className="caret" aria-hidden="true" />}

      {!!sources?.length && (
        <div className="sources">
          <strong className="small">{t("research.sources")}</strong>
          <ol>
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
