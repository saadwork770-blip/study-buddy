"use client";

import { useLang } from "./lang-provider";
import {
  CITE_STYLES,
  type CiteStyle,
  type Reference,
  formatReference,
  inTextCitation,
  orderReferences,
} from "@/lib/citations";
import { uid } from "@/lib/store";
import type { TKey } from "@/lib/i18n";

interface Props {
  references: Reference[];
  onChange: (references: Reference[]) => void;
  style: CiteStyle;
  onStyleChange: (style: CiteStyle) => void;
  /** Drops an in-text citation at the caret in the editor. */
  onInsert: (marker: string) => void;
}

const FIELDS: { key: keyof Reference; label: TKey; wide?: boolean }[] = [
  { key: "authors", label: "ref.authors", wide: true },
  { key: "year", label: "ref.year" },
  { key: "title", label: "ref.title", wide: true },
  { key: "container", label: "ref.container", wide: true },
  { key: "detail", label: "ref.detail" },
  { key: "doi", label: "ref.doi" },
  { key: "url", label: "ref.url", wide: true },
];

/** Manages the document's sources and how they are cited. */
export function ReferencesPanel({
  references,
  onChange,
  style,
  onStyleChange,
  onInsert,
}: Props) {
  const { t, lang } = useLang();
  const ordered = orderReferences(references, style);

  const update = (id: string, patch: Partial<Reference>) =>
    onChange(references.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="design">
      <section>
        <h3>{t("ref.style")}</h3>
        <div className="segmented">
          {CITE_STYLES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={style === option.id}
              onClick={() => onStyleChange(option.id)}
            >
              {lang === "ar" ? option.ar : option.en}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 7 }}>{t("ref.styleHint")}</p>
      </section>

      <section>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>
            {t("ref.list")} <span className="tiny muted">({references.length})</span>
          </h3>
          <button
            type="button"
            className="button button-sm"
            onClick={() =>
              onChange([
                ...references,
                { id: uid(), authors: "", year: "", title: "" },
              ])
            }
          >
            + {t("ref.add")}
          </button>
        </div>

        {references.length === 0 ? (
          <div className="empty-state">{t("ref.empty")}</div>
        ) : (
          references.map((reference) => {
            const position = ordered.findIndex((r) => r.id === reference.id);
            const marker = inTextCitation(reference, style, position, lang);
            return (
              <div key={reference.id} className="card card-tight" style={{ marginBottom: 10 }}>
                <div className="grid grid-2" style={{ gap: 0, columnGap: 12 }}>
                  {FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="field"
                      style={{ marginBottom: 8, gridColumn: field.wide ? "1 / -1" : undefined }}
                    >
                      <label htmlFor={`${reference.id}-${field.key}`}>{t(field.label)}</label>
                      <input
                        id={`${reference.id}-${field.key}`}
                        type="text"
                        value={(reference[field.key] as string) ?? ""}
                        onChange={(event) => update(reference.id, { [field.key]: event.target.value })}
                      />
                    </div>
                  ))}
                </div>

                <p className="small muted" style={{ margin: "4px 0 9px", overflowWrap: "anywhere" }}>
                  {formatReference(reference, style, position).replace(/\*/g, "") ||
                    t("ref.preview")}
                </p>

                <div className="row">
                  <button
                    type="button"
                    className="button button-ghost button-sm"
                    onClick={() => onInsert(marker)}
                  >
                    ⎘ {t("ref.insert")} <code>{marker}</code>
                  </button>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="button button-danger button-sm"
                    onClick={() => onChange(references.filter((r) => r.id !== reference.id))}
                  >
                    {t("out.delete")}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <p className="hint">{t("ref.appended")}</p>
    </div>
  );
}
