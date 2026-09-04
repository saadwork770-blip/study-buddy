"use client";

import { useRef, useState } from "react";
import { useLang } from "@/components/lang-provider";
import { OutputPanel } from "@/components/output-panel";
import { ExpertPicker } from "@/components/expert-picker";
import { useStream } from "@/lib/use-stream";
import type { TKey } from "@/lib/i18n";

const STYLES: { value: string; label: TKey }[] = [
  { value: "brief", label: "summarize.style.brief" },
  { value: "detailed", label: "summarize.style.detailed" },
  { value: "critical", label: "summarize.style.critical" },
  { value: "notes", label: "summarize.style.notes" },
  { value: "flashcards", label: "summarize.style.flashcards" },
  { value: "outline", label: "summarize.style.outline" },
];

const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 4;
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export default function SummarizePage() {
  const { t, lang } = useLang();
  const stream = useStream();
  const [text, setText] = useState("");
  const [style, setStyle] = useState("brief");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expert, setExpert] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chooseFile = (next: File | null) => {
    if (next && next.size > MAX_BYTES) {
      setLocalError("error.fileTooBig");
      return;
    }
    setLocalError(null);
    setFile(next);
  };

  const start = () => {
    if (stream.running) return;
    if (!text.trim() && !file) {
      setLocalError("summarize.needInput");
      return;
    }
    setLocalError(null);

    const form = new FormData();
    form.set("lang", lang);
    form.set("style", style);
    form.set("text", text);
    if (expert) form.set("expert", expert);
    if (file) {
      form.set("file", file);
      form.set("title", file.name);
    }
    void stream.run("/api/summarize", { method: "POST", body: form });
  };

  const title = file?.name || text.slice(0, 60) || t("summarize.title");

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

          <div className="field">
            <label>{t("summarize.upload")}</label>
            {file ? (
              <div className="row-between card card-tight">
                <span className="small" style={{ overflowWrap: "anywhere" }}>
                  📎 {file.name}{" "}
                  <span className="tiny muted">({Math.round(file.size / 1024)} KB)</span>
                </span>
                <button
                  type="button"
                  className="button button-ghost button-sm"
                  onClick={() => {
                    chooseFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  {t("summarize.remove")}
                </button>
              </div>
            ) : (
              <div
                className={dragging ? "dropzone drag" : "dropzone"}
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  chooseFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <div style={{ fontSize: "1.6rem" }} aria-hidden="true">
                  ⬆
                </div>
                <div className="small">{t("summarize.upload")}</div>
                <div className="hint">{t("summarize.uploadHint", { n: MAX_UPLOAD_MB })}</div>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              hidden
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,image/*"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
          </div>

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

          {localError && <div className="alert alert-error">{t(localError as TKey, { n: MAX_UPLOAD_MB })}</div>}

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
