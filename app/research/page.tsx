"use client";

import { useState } from "react";
import { useLang } from "@/components/lang-provider";
import { withKeys } from "@/lib/user-keys";
import { OutputPanel } from "@/components/output-panel";
import { ExpertPicker } from "@/components/expert-picker";
import { FileAttach } from "@/components/file-attach";
import { useStream } from "@/lib/use-stream";
import type { TKey } from "@/lib/i18n";
import type { Attachment } from "@/lib/types";

const DEPTHS: { value: string; label: TKey }[] = [
  { value: "quick", label: "research.depth.quick" },
  { value: "standard", label: "research.depth.standard" },
  { value: "deep", label: "research.depth.deep" },
];

export default function ResearchPage() {
  const { t, lang } = useLang();
  const stream = useStream();
  const [question, setQuestion] = useState("");
  const [field, setField] = useState("");
  const [depth, setDepth] = useState("standard");
  const [web, setWeb] = useState(true);
  const [files, setFiles] = useState<Attachment[]>([]);
  // The literature-review specialist is the default voice for this page.
  const [expert, setExpert] = useState<string | null>("research-synthesist");

  const start = () => {
    if (!question.trim() || stream.running) return;
    void stream.run("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withKeys({ question, field, depth, web, lang, expert, attachments: files })),
    });
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("research.title")}</h1>
        <p>{t("research.subtitle")}</p>
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
            <label htmlFor="question">{t("research.question")}</label>
            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("research.questionPlaceholder")}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="field">
              {t("research.field")} <span className="hint">({t("common.optional")})</span>
            </label>
            <input
              id="field"
              type="text"
              value={field}
              onChange={(event) => setField(event.target.value)}
              placeholder={t("research.fieldPlaceholder")}
            />
          </div>

          <div className="field">
            <label>{t("research.depth")}</label>
            <div className="segmented">
              {DEPTHS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={depth === option.value}
                  onClick={() => setDepth(option.value)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>

          <FileAttach value={files} onChange={setFiles} />

          <ExpertPicker value={expert} onChange={setExpert} />

          <div className="field">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={web}
                onChange={(event) => setWeb(event.target.checked)}
              />
              {t("research.web")}
            </label>
          </div>

          <div className="row">
            <button type="submit" className="button" disabled={stream.running || !question.trim()}>
              {stream.running ? t("research.running") : t("research.run")}
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
            kind="research"
            title={question.slice(0, 90) || t("research.title")}
            markdown={stream.text}
            sources={stream.sources}
            streaming={stream.running}
            status={stream.status}
            error={stream.error}
            attempts={stream.attempts}
            onRetry={start}
          />
          {!stream.text && !stream.running && !stream.error && (
            <div className="empty-state">{t("research.subtitle")}</div>
          )}
        </div>
      </div>
    </main>
  );
}
