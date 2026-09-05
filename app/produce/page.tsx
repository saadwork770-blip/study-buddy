"use client";

import { useState } from "react";
import { useLang } from "@/components/lang-provider";
import { withKeys } from "@/lib/user-keys";
import { OutputPanel } from "@/components/output-panel";
import { ExpertPicker } from "@/components/expert-picker";
import { FileAttach } from "@/components/file-attach";
import { DeckView } from "@/components/deck-view";
import { useStream } from "@/lib/use-stream";
import type { TKey } from "@/lib/i18n";
import type { Attachment } from "@/lib/types";
import type { CiteStyle, Reference } from "@/lib/citations";
import type { Deck } from "@/lib/deck";
import { CITE_STYLES } from "@/lib/citations";

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

/** Reuse the references the student maintains in the editor. */
function readDraftReferences(): Reference[] {
  try {
    const raw = window.localStorage.getItem("sb.draft");
    if (!raw) return [];
    return (JSON.parse(raw) as { references?: Reference[] }).references ?? [];
  } catch {
    return [];
  }
}

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
  const [citeStyle, setCiteStyle] = useState<CiteStyle>("apa7");
  const [slideCount, setSlideCount] = useState(10);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [designing, setDesigning] = useState(false);

  /** Slides take the deck designer; everything else streams Markdown. */
  const designDeck = async () => {
    setDesigning(true);
    setDeck(null);
    setLocalError(null);
    try {
      const response = await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withKeys({
            brief,
            course,
            lang,
            slides: slideCount,
            expert,
            attachments: files,
          }),
        ),
      });
      const payload = (await response.json()) as { deck?: Deck; error?: string };
      if (payload.deck) setDeck(payload.deck);
      else setLocalError(payload.error ?? "error.generic");
    } catch {
      setLocalError("error.generic");
    } finally {
      setDesigning(false);
    }
  };

  const start = () => {
    if (stream.running || designing) return;
    if (!brief.trim() && !files.length) {
      setLocalError("produce.need");
      return;
    }
    setLocalError(null);
    if (kind === "slides") {
      void designDeck();
      return;
    }
    void stream.run("/api/produce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withKeys({
        brief,
        course,
        kind,
        length,
        web,
        lang,
        expert,
        attachments: files,
        citeStyle,
        references: readDraftReferences(),
      })),
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

          {kind === "slides" && (
            <div className="field">
              <label htmlFor="slidecount">
                {t("deck.slides")} <span className="hint">({slideCount})</span>
              </label>
              <input
                id="slidecount"
                type="range"
                min={4}
                max={20}
                value={slideCount}
                onChange={(event) => setSlideCount(Number(event.target.value))}
              />
            </div>
          )}

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

          {kind !== "slides" && (
          <div className="field">
            <label>{t("ref.style")}</label>
            <div className="segmented">
              {CITE_STYLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={citeStyle === option.id}
                  onClick={() => setCiteStyle(option.id)}
                >
                  {lang === "ar" ? option.ar : option.en}
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
            <button
              type="submit"
              className="button"
              disabled={stream.running || designing}
            >
              {designing
                ? t("deck.designing")
                : stream.running
                  ? t("produce.running")
                  : t("produce.run")}
            </button>
            {stream.running && (
              <button type="button" className="button button-ghost" onClick={stream.stop}>
                {t("chat.stop")}
              </button>
            )}
          </div>
        </form>

        <div>
          {kind === "slides" ? (
            <>
              {!deck && !designing && (
                <div className="alert alert-info">{t("deck.subtitle")}</div>
              )}
              {designing && <div className="empty-state">{t("deck.designing")}</div>}
              {localError && <div className="alert alert-error">{t(localError as TKey)}</div>}
              {deck && <DeckView deck={deck} />}
            </>
          ) : (
            <>
          <OutputPanel
            kind="summary"
            title={title}
            markdown={stream.text}
            sources={stream.sources}
            streaming={stream.running}
            status={stream.status}
            error={stream.error}
            attempts={stream.attempts}
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
            </>
          )}
        </div>
      </div>
    </main>
  );
}
