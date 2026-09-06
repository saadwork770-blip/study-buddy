"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "./lang-provider";
import type { TKey } from "@/lib/i18n";
import { deckToHtml } from "@/lib/deck-html";
import { download } from "@/lib/export";
import { DEFAULT_THEME, type DocTheme } from "@/lib/doc-theme";
import type { Deck } from "@/lib/deck";
import { withKeys } from "@/lib/user-keys";

const THEME_KEY = "sb.theme.doc";
/** The width deck-html lays slides out at. */
const DECK_WIDTH = 1008;

/**
 * Shows the designed deck exactly as it will be exported — the preview is
 * the same renderer at the same proportions, not a summary of it — and hands
 * over the PowerPoint on request.
 */
export function DeckView({ deck }: { deck: Deck }) {
  const { t, lang } = useLang();
  const rtl = lang !== "en";
  const [theme, setTheme] = useState<DocTheme>(DEFAULT_THEME);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Slides are authored at a fixed width so the preview matches the exported
  // file; the whole frame is scaled to whatever room the panel has.
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // The same design the editor and the other exporters use.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(THEME_KEY);
      if (raw) setTheme({ ...DEFAULT_THEME, ...(JSON.parse(raw) as DocTheme) });
    } catch {
      /* keep the default */
    }
  }, []);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const fit = () => setScale(Math.min(1, element.clientWidth / DECK_WIDTH));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const html = useMemo(() => deckToHtml(deck, rtl, theme), [deck, rtl, theme]);

  const save = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/export/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withKeys({ deck, lang, theme })),
      });
      if (!response.ok) throw new Error(String(response.status));
      // The shared helper, so this works inside the Android shell too.
      await download(await response.blob(), `${deck.title.slice(0, 60) || "deck"}.pptx`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const counts = deck.slides.reduce<Record<string, number>>((acc, slide) => {
    acc[slide.layout] = (acc[slide.layout] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <strong>{deck.title}</strong>
        <span className="spacer" />
        <span className="hint">{t("deck.count", { n: String(deck.slides.length) })}</span>
        <button type="button" className="button button-sm" onClick={save} disabled={busy}>
          {busy ? t("deck.building") : t("deck.download")}
        </button>
      </div>

      {failed && <div className="alert alert-error">{t("error.generic")}</div>}

      <p className="hint" style={{ marginBottom: 10 }}>
        {Object.entries(counts)
          .map(([layout, n]) => `${t(`deck.layout.${layout}` as TKey)} ×${n}`)
          .join(" · ")}
      </p>

      <div
        ref={box}
        style={{
          width: "100%",
          height: "min(72vh, 760px)",
          overflow: "hidden",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "#EEF1F6",
        }}
      >
        <iframe
          title={deck.title}
          srcDoc={html}
          style={{
            width: DECK_WIDTH,
            // Scaling shrinks what is drawn, not the frame, so the frame is
            // made proportionally taller to fill the box it sits in.
            height: `calc(min(72vh, 760px) / ${scale})`,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: rtl ? "top right" : "top left",
            display: "block",
            marginInlineStart: rtl ? "auto" : undefined,
          }}
        />
      </div>
    </div>
  );
}
