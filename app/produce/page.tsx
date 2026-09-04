"use client";

import { useState } from "react";
import { useLang } from "@/components/lang-provider";
import { OutputPanel } from "@/components/output-panel";
import { ExpertPicker } from "@/components/expert-picker";
import { FileAttach } from "@/components/file-attach";
import { useStream } from "@/lib/use-stream";
import type { TKey } from "@/lib/i18n";
import type { Attachment } from "@/lib/types";

const KINDS: { value: string; label: TKey }[] = [
  { value: "report", label: "produce.kind.report" },
  { value: "essay", label: "produce.kind.essay" },
  { value: "litreview", label: "produce.kind.litreview" },
  { value: "answers", label: "produce.kind.answers" },
  { value: "slides", label: "produce.kind.slides" },
];

const LENGTHS: { value: string; label: TKey }[] = [
  { value: "short", label: "produce.length.short" },
  { value: "standard", label: "produce.length.standard" },
  { value: "long", label: "produce.length.long" },
];

export default function ProducePage() {
  const { t, lang } = useLang();
  const stream = useStream();
  const [brief, setBrief] = useState("");
  const [course, setCourse] = useState("");
  const [kind, setKind] = useState("report");
  const [length, setLength] = useState("standard");
  const [web, setWeb] = useState(false);
  const [expert, setExpert] = useState<string | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const start = () => {
    if (stream.running) return;
    if (!brief.trim() && !files.length) {
      setLocalError("produce.need");
      return;
    }
    setLocalError(null);
    void stream.run("/api/produce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief,
        course,
        kind,
        length,
        web,
        lang,
        expert,
        attachments: files,
      }),
    });
  };

  const title = brief.slice(0, 80) || files[0]?.name || t("produce.title");

  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("produce.title")}</h1>
        <p>{t("produce.subtitle")}</p>
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
            <label htmlFor="brief">{t("produce.brief")}</label>
            <textarea
              id="brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder={t("produce.briefPh")}
              style={{ minHeight: 150 }}
            />
          </div>

          <div className="field">
            <label htmlFor="course">
              {t("produce.course")} <span className="hint">({t("common.optional")})</span>
            </label>
            <input
              id="course"
              type="text"
              value={course}
              onChange={(event) => setCourse(event.target.value)}
            />
          </div>

          <FileAttach value={files} onChange={setFiles} />

          <div className="field">
            <label htmlFor="kind">{t("produce.kind")}</label>
            <select id="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </div>

          {kind !== "slides" && (
            <div className="field">
              <label>{t("produce.length")}</label>
              <div className="segmented">
                {LENGTHS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={length === option.value}
                    onClick={() => setLength(option.value)}
                  >
                    {t(option.label)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ExpertPicker value={expert} onChange={setExpert} />

          <div className="field">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={web}
                onChange={(event) => setWeb(event.target.checked)}
              />
              {t("produce.web")}
            </label>
          </div>

          {localError && <div className="alert alert-error">{t(localError as TKey)}</div>}

          <div className="row">
            <button type="submit" className="button" disabled={stream.running}>
              {stream.running ? t("produce.running") : t("produce.run")}
            </button>
            {stream.running && (
              <button type="button" className="button button-ghost" onClick={stream.stop}>
                {t("chat.stop")}
              </button>
            )}
          </div>
        </form>

        <div>
          {kind === "slides" && !stream.text && (
            <div className="alert alert-info">{t("produce.slidesHint")}</div>
          )}

          <OutputPanel
            kind="summary"
            title={title}
            markdown={stream.text}
            sources={stream.sources}
            streaming={stream.running}
            status={stream.status}
            error={stream.error}
            onRetry={start}
          />

          {stream.text && !stream.running && (
            <p className="hint" style={{ marginTop: 10 }}>
              {t("produce.check")}
            </p>
          )}

          {!stream.text && !stream.running && !stream.error && (
            <div className="empty-state">{t("produce.subtitle")}</div>
          )}
        </div>
      </div>
    </main>
  );
}
