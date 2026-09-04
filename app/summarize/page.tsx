"use client";

import { useState } from "react";
import { useLang } from "@/components/lang-provider";
import { OutputPanel } from "@/components/output-panel";
import { ExpertPicker } from "@/components/expert-picker";
import { FileAttach } from "@/components/file-attach";
import { useStream } from "@/lib/use-stream";
import type { TKey } from "@/lib/i18n";
import type { Attachment } from "@/lib/types";

const STYLES: { value: string; label: TKey }[] = [
  { value: "brief", label: "summarize.style.brief" },
  { value: "detailed", label: "summarize.style.detailed" },
  { value: "critical", label: "summarize.style.critical" },
  { value: "notes", label: "summarize.style.notes" },
  { value: "flashcards", label: "summarize.style.flashcards" },
  { value: "outline", label: "summarize.style.outline" },
];

export default function SummarizePage() {
  const { t, lang } = useLang();
  const stream = useStream();
  const [text, setText] = useState("");
  const [style, setStyle] = useState("brief");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [expert, setExpert] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const start = () => {
    if (stream.running) return;
    if (!text.trim() && !files.length) {
      setLocalError("summarize.needInput");
      return;
    }
    setLocalError(null);

    void stream.run("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, style, text, expert, attachments: files }),
    });
  };

  const title = files[0]?.name || text.slice(0, 60) || t("summarize.title");

  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("summarize.title")}</h1>
        <p>{t("summarize.subtitle")}</p>
      </div>

      <div className="split">
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <div className="field">
            <label htmlFor="text">{t("summarize.paste")}</label>
            <textarea
              id="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("summarize.pastePlaceholder")}
              style={{ minHeight: 160 }}
            />
          </div>

          <FileAttach value={files} onChange={setFiles} />

          <div className="field">
            <label htmlFor="style">{t("summarize.style")}</label>
            <select id="style" value={style} onChange={(event) => setStyle(event.target.value)}>
              {STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </div>

          <ExpertPicker value={expert} onChange={setExpert} />

          {localError && <div className="alert alert-error">{t(localError as TKey)}</div>}

          <div className="row">
            <button type="submit" className="button" disabled={stream.running}>
              {stream.running ? t("summarize.running") : t("summarize.run")}
            </button>
            {stream.running && (
              <button type="button" className="button button-ghost" onClick={stream.stop}>
                {t("chat.stop")}
              </button>
            )}
          </div>
        </form>

        <div>
          <OutputPanel
            kind="summary"
            title={title}
            markdown={stream.text}
            streaming={stream.running}
            status={stream.status}
            error={stream.error}
            onRetry={start}
          />
          {!stream.text && !stream.running && !stream.error && (
            <div className="empty-state">{t("summarize.subtitle")}</div>
          )}
        </div>
      </div>
    </main>
  );
}
