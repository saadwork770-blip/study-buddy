"use client";

import { useLang } from "./lang-provider";
import { EXPERT_META } from "@/lib/experts-meta.generated";
import type { TKey } from "@/lib/i18n";

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Hide the "General" option on pages where a specialist always applies. */
  allowNone?: boolean;
}

/**
 * Picks the specialist persona layered onto the system prompt. Only metadata
 * reaches the browser — the persona text itself stays server-side.
 */
export function ExpertPicker({ value, onChange, allowNone = true }: Props) {
  const { t } = useLang();

  const active = EXPERT_META.find((expert) => expert.id === value);
  const about = active ? t(`expert.${active.id}.about` as TKey) : t("expert.hint");

  return (
    <div className="field">
      <label>{t("expert.label")}</label>
      <div className="segmented">
        {allowNone && (
          <button type="button" aria-pressed={value === null} onClick={() => onChange(null)}>
            {t("expert.none")}
          </button>
        )}
        {EXPERT_META.map((expert) => (
          <button
            key={expert.id}
            type="button"
            aria-pressed={value === expert.id}
            onClick={() => onChange(expert.id)}
          >
            <span aria-hidden="true">{expert.emoji}</span> {t(`expert.${expert.id}` as TKey)}
          </button>
        ))}
      </div>
      <span className="hint">{about}</span>
    </div>
  );
}
