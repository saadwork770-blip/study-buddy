"use client";

import { useLang } from "./lang-provider";
import { ACCENTS, FONTS, PRESETS, type DocTheme, presetTheme } from "@/lib/doc-theme";
import type { TKey } from "@/lib/i18n";

interface Props {
  theme: DocTheme;
  onChange: (theme: DocTheme) => void;
}

/** Every control here feeds Word, PDF, HTML and PowerPoint alike. */
export function DesignPanel({ theme, onChange }: Props) {
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const set = (patch: Partial<DocTheme>) => onChange({ ...theme, ...patch });

  return (
    <div className="design">
      <section>
        <h3>{t("design.preset")}</h3>
        <div className="preset-grid">
          {PRESETS.map((preset) => {
            const active = theme.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={active ? "preset active" : "preset"}
                onClick={() => onChange(presetTheme(preset.id))}
              >
                <span
                  className="preset-swatch"
                  style={{ background: preset.theme.accent }}
                  aria-hidden="true"
                />
                <strong>{ar ? preset.ar : preset.en}</strong>
                <span className="tiny muted">
                  {t(`design.preset.${preset.id}` as TKey)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3>{t("design.accent")}</h3>
        <div className="row">
          {ACCENTS.map((accent) => (
            <button
              key={accent.id}
              type="button"
              className="swatch"
              aria-pressed={theme.accent.toLowerCase() === accent.hex.toLowerCase()}
              aria-label={ar ? accent.ar : accent.en}
              title={ar ? accent.ar : accent.en}
              style={{ background: accent.hex }}
              onClick={() => set({ accent: accent.hex, preset: "custom" })}
            />
          ))}
          <label className="swatch-custom">
            <input
              type="color"
              value={theme.accent}
              onChange={(event) => set({ accent: event.target.value, preset: "custom" })}
            />
            <span className="tiny">{t("design.custom")}</span>
          </label>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="field">
          <label htmlFor="hf">{t("design.headingFont")}</label>
          <select
            id="hf"
            value={theme.headingFont}
            onChange={(event) => set({ headingFont: event.target.value, preset: "custom" })}
          >
            {FONTS.map((font) => (
              <option key={font.id} value={font.id}>
                {ar ? font.ar : font.en}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="bf">{t("design.bodyFont")}</label>
          <select
            id="bf"
            value={theme.bodyFont}
            onChange={(event) => set({ bodyFont: event.target.value, preset: "custom" })}
          >
            {FONTS.map((font) => (
              <option key={font.id} value={font.id}>
                {ar ? font.ar : font.en}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="field">
          <label htmlFor="fs">
            {t("design.size")} <span className="hint">{theme.fontSize}pt</span>
          </label>
          <input
            id="fs"
            type="range"
            min={9}
            max={16}
            step={0.5}
            value={theme.fontSize}
            onChange={(event) => set({ fontSize: Number(event.target.value), preset: "custom" })}
          />
        </div>
        <div className="field">
          <label htmlFor="lh">
            {t("design.line")} <span className="hint">{theme.lineHeight.toFixed(2)}</span>
          </label>
          <input
            id="lh"
            type="range"
            min={1.3}
            max={2.4}
            step={0.05}
            value={theme.lineHeight}
            onChange={(event) => set({ lineHeight: Number(event.target.value), preset: "custom" })}
          />
        </div>
      </section>

      <section>
        <h3>{t("design.layout")}</h3>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={theme.justify}
            onChange={(event) => set({ justify: event.target.checked, preset: "custom" })}
          />
          {t("design.justify")}
        </label>
        <label className="checkbox" style={{ marginInlineStart: 18 }}>
          <input
            type="checkbox"
            checked={theme.headingRule}
            onChange={(event) => set({ headingRule: event.target.checked, preset: "custom" })}
          />
          {t("design.rule")}
        </label>
      </section>

      <section className="grid grid-2">
        <div className="field">
          <label>{t("design.cover")}</label>
          <div className="segmented">
            {(["centered", "band", "minimal"] as const).map((style) => (
              <button
                key={style}
                type="button"
                aria-pressed={theme.coverStyle === style}
                onClick={() => set({ coverStyle: style, preset: "custom" })}
              >
                {t(`design.cover.${style}` as TKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{t("design.table")}</label>
          <div className="segmented">
            {(["filled", "lines"] as const).map((style) => (
              <button
                key={style}
                type="button"
                aria-pressed={theme.tableStyle === style}
                onClick={() => set({ tableStyle: style, preset: "custom" })}
              >
                {t(`design.table.${style}` as TKey)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="hint">{t("design.appliesTo")}</p>
    </div>
  );
}
