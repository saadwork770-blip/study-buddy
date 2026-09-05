"use client";

import { useState } from "react";
import { useLang } from "./lang-provider";
import {
  ACCENTS,
  FONTS,
  PRESETS,
  PRESET_GROUPS,
  type DocTheme,
  type PresetGroup,
  fontById,
  presetTheme,
} from "@/lib/doc-theme";
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
  // The library is large enough that showing it all at once is worse than
  // showing one shelf; open on the shelf the current theme belongs to.
  const [group, setGroup] = useState<PresetGroup>(
    PRESETS.find((preset) => preset.id === theme.preset)?.group ?? "academic",
  );
  const name = (id: string) => (ar ? fontById(id).ar : fontById(id).en);

  return (
    <div className="design">
      <section>
        <h3>{t("design.preset")}</h3>
        <div className="segmented" style={{ marginBottom: 10, flexWrap: "wrap" }}>
          {PRESET_GROUPS.map((shelf) => (
            <button
              key={shelf.id}
              type="button"
              aria-pressed={group === shelf.id}
              onClick={() => setGroup(shelf.id)}
            >
              {ar ? shelf.ar : shelf.en}
            </button>
          ))}
        </div>
        <div className="preset-grid">
          {PRESETS.filter((preset) => preset.group === group).map((preset) => {
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
                  {preset.theme.headingFont === preset.theme.bodyFont
                    ? name(preset.theme.headingFont)
                    : `${name(preset.theme.headingFont)} · ${name(preset.theme.bodyFont)}`}
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
            {["ar", "la"].map((script) => (
              <optgroup key={script} label={script === "ar" ? (ar ? "عربي" : "Arabic") : (ar ? "لاتيني" : "Latin")}>
                {FONTS.filter((font) => (font.script ?? "la") === script).map((font) => (
                  <option key={font.id} value={font.id}>
                    {ar ? font.ar : font.en}
                  </option>
                ))}
              </optgroup>
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
            {/* Display faces are left out: they are built for a heading at
                30pt and are punishing to read in a paragraph. */}
            {["ar", "la"].map((script) => (
              <optgroup key={script} label={script === "ar" ? (ar ? "عربي" : "Arabic") : (ar ? "لاتيني" : "Latin")}>
                {FONTS.filter(
                  (font) => font.role !== "heading" && (font.script ?? "la") === script,
                ).map((font) => (
                  <option key={font.id} value={font.id}>
                    {ar ? font.ar : font.en}
                  </option>
                ))}
              </optgroup>
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

      <section className="grid grid-2">
        <div className="field">
          <label>{t("design.pageSize")}</label>
          <div className="segmented">
            {(["a4", "letter"] as const).map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={theme.pageSize === size}
                onClick={() => set({ pageSize: size, preset: "custom" })}
              >
                {size === "a4" ? "A4" : t("design.letter")}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{t("design.margin")}</label>
          <div className="segmented">
            {(["narrow", "normal", "wide"] as const).map((margin) => (
              <button
                key={margin}
                type="button"
                aria-pressed={theme.margin === margin}
                onClick={() => set({ margin, preset: "custom" })}
              >
                {t(`design.margin.${margin}` as TKey)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="hint">{t("design.appliesTo")}</p>
    </div>
  );
}
