"use client";

import { useMemo, useRef, useState } from "react";
import { useLang } from "@/components/lang-provider";
import { Markdown } from "@/components/markdown";
import { type Backup, applyBackup, readBackup, useLibrary } from "@/lib/store";
import { type ExportFormat, download, exportPayload, safeFilename } from "@/lib/export";
import type { LibraryItem } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "docx", label: "Word" },
  { format: "pptx", label: "PPT" },
  { format: "pdf", label: "PDF" },
  { format: "md", label: "MD" },
  { format: "html", label: "HTML" },
  { format: "txt", label: "TXT" },
  { format: "json", label: "JSON" },
];

export default function LibraryPage() {
  const { t, lang } = useLang();
  const { items, removeItem, ready } = useLibrary();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<LibraryItem | null>(null);
  const [notice, setNotice] = useState<TKey | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.content.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Backup;
      if (parsed?.app !== "study-buddy") throw new Error("bad file");
      applyBackup(parsed);
      setNotice("library.importDone");
      // Storage is read on mount, so reload to show the merged data.
      setTimeout(() => window.location.reload(), 700);
    } catch {
      setNotice("library.importFail");
    }
  };

  return (
    <main className="page">
      <div className="page-head row-between">
        <div>
          <h1>{t("library.title")}</h1>
          <p>{t("library.subtitle")}</p>
        </div>
        <div className="row no-print">
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={() => {
              const backup = readBackup();
              download(
                new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
                `${safeFilename("study-buddy-backup")}-${backup.exportedAt.slice(0, 10)}.json`,
              );
            }}
          >
            ⤓ {t("library.exportAll")}
          </button>
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={() => fileInput.current?.click()}
          >
            ⤒ {t("library.importAll")}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      {notice && <div className="alert alert-info">{t(notice)}</div>}

      <div className="field no-print">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("library.search")}
        />
      </div>

      {!ready ? null : filtered.length === 0 ? (
        <div className="empty-state">{t("library.empty")}</div>
      ) : (
        <div className="grid">
          {filtered.map((item) => (
            <div key={item.id} className="card library-item">
              <div className="body">
                <h3>{item.title}</h3>
                <div className="row" style={{ gap: 6, marginBottom: 8 }}>
                  <span className="badge badge-accent">
                    {t(`library.kind.${item.kind}` as TKey)}
                  </span>
                  <span className="tiny muted">
                    {new Date(item.createdAt).toLocaleString(
                      item.lang === "ar" ? "ar" : "en-GB",
                    )}
                  </span>
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {item.content.replace(/[#*`>\-]/g, " ").slice(0, 190)}…
                </p>

                <div className="row no-print" style={{ marginTop: 11 }}>
                  <button
                    type="button"
                    className="button button-ghost button-sm"
                    onClick={() => setActive(item)}
                  >
                    {t("library.open")}
                  </button>
                  {FORMATS.map((format) => (
                    <button
                      key={format.format}
                      type="button"
                      className="button button-ghost button-sm"
                      onClick={() =>
                        void exportPayload(format.format, {
                          title: item.title,
                          markdown: item.content,
                          lang: item.lang,
                          sources: item.sources,
                          createdAt: item.createdAt,
                        })
                      }
                    >
                      {format.label}
                    </button>
                  ))}
                  <span className="spacer" />
                  <button
                    type="button"
                    className="button button-danger button-sm"
                    onClick={() => removeItem(item.id)}
                  >
                    {t("out.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {active && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setActive(null);
          }}
        >
          <div className="modal" dir={active.lang === "ar" ? "rtl" : "ltr"}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{active.title}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setActive(null)}
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>
            <Markdown text={active.content} />
            {!!active.sources?.length && (
              <div className="sources">
                <strong className="small">{t("research.sources")}</strong>
                <ol>
                  {active.sources.map((source) => (
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
        </div>
      )}
      <span hidden>{lang}</span>
    </main>
  );
}
