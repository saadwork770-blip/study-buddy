"use client";

import { useEffect, useState } from "react";
import { Markdown } from "./markdown";
import { useLang } from "./lang-provider";
import { ExportDialog } from "./export-dialog";
import { useRouter } from "next/navigation";
import { wordCount } from "@/lib/markdown";
import { useLibrary } from "@/lib/store";
import type { LibraryKind, Source } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

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
  const [exporting, setExporting] = useState(false);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [markdown]);

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

        <button
          type="button"
          className="button button-ghost button-sm"
          disabled={!markdown || streaming}
          onClick={() => {
            // Hand the draft to the editor, which picks it up on load.
            try {
              window.localStorage.setItem(
                "sb.draft",
                JSON.stringify({ title, markdown }),
              );
            } catch {
              /* storage disabled */
            }
            router.push("/editor");
          }}
        >
          ✎ {t("ed.open")}
        </button>

        <button
          type="button"
          className="button button-sm"
          disabled={!markdown || streaming}
          onClick={() => setExporting(true)}
        >
          ⤓ {t("out.export")}
        </button>
      </div>

      <Markdown text={markdown} />
      {streaming && <span className="caret" aria-hidden="true" />}

      {exporting && (
        <ExportDialog
          title={title}
          markdown={markdown}
          sources={sources}
          onClose={() => setExporting(false)}
        />
      )}

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
