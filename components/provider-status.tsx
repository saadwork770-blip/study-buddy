"use client";

import { useEffect, useState } from "react";
import { useLang } from "./lang-provider";
import {
  type CustomProvider,
  clearCooldowns,
  readCooldowns,
  readProviders,
  writeProviders,
} from "@/lib/user-keys";
import { safeBaseUrlClient } from "@/lib/safe-url";
import type { Cooldowns } from "@/lib/cooldown";
import type { TKey } from "@/lib/i18n";

const BUILT_IN = ["gemini", "groq", "cerebras", "openrouter", "mistral", "github", "anthropic"];
const LABELS: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  cerebras: "Cerebras",
  openrouter: "OpenRouter",
  mistral: "Mistral",
  github: "GitHub Models",
  anthropic: "Claude",
};

const blank: CustomProvider = { id: "", label: "", baseUrl: "", model: "", key: "" };

/**
 * Shows which providers are in play and which are resting, and lets the
 * student add their own. The rotation is meant to be invisible; this is
 * where it becomes inspectable when they want to know why an answer came
 * from somewhere unexpected.
 */
export function ProviderStatus() {
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const [cooldowns, setCooldowns] = useState<Cooldowns>({});
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [draft, setDraft] = useState<CustomProvider>(blank);
  const [badUrl, setBadUrl] = useState(false);

  useEffect(() => {
    setCooldowns(readCooldowns());
    setProviders(readProviders());
    // Cooldowns expire on their own; re-read so the screen does not go stale.
    const timer = setInterval(() => setCooldowns(readCooldowns()), 20_000);
    return () => clearInterval(timer);
  }, []);

  const at = (until: number) =>
    new Date(until).toLocaleString(ar ? "ar" : "en", {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });

  const add = () => {
    const id = draft.id.trim() || draft.label.trim().toLowerCase().replace(/\s+/g, "-");
    if (!safeBaseUrlClient(draft.baseUrl) || !id || !draft.key.trim()) {
      setBadUrl(true);
      return;
    }
    const next = [...providers.filter((p) => p.id !== id), { ...draft, id }];
    setProviders(next);
    writeProviders(next);
    setDraft(blank);
    setBadUrl(false);
  };

  const remove = (id: string) => {
    const next = providers.filter((p) => p.id !== id);
    setProviders(next);
    writeProviders(next);
  };

  const rows = [
    ...BUILT_IN.map((id) => ({ id, label: LABELS[id] })),
    ...providers.map((p) => ({ id: `custom:${p.id}`, label: p.label || p.id })),
  ];

  return (
    <>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{t("settings.status")}</h3>
          <span className="spacer" />
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={() => {
              clearCooldowns();
              setCooldowns({});
            }}
          >
            {t("settings.clearCool")}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>{t("settings.rotation")}</p>

        {rows.map((row) => {
          const cool = cooldowns[row.id];
          const resting = (cool?.until ?? 0) > Date.now();
          return (
            <div
              key={row.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 0",
                borderTop: "1px solid var(--border)",
              }}
            >
              <span aria-hidden="true">{resting ? "⏸" : "✅"}</span>
              <strong className="small">{row.label}</strong>
              <span className="spacer" />
              <span className="tiny" style={{ color: resting ? "var(--danger)" : "var(--muted)" }}>
                {resting
                  ? `${t(cool.reason as TKey)} · ${t("settings.until", { time: at(cool.until) })}`
                  : t("settings.ready")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t("settings.custom")}</h3>
        <p className="hint" style={{ marginTop: 0 }}>{t("settings.customHint")}</p>

        {providers.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "8px 0",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong className="small">{p.label || p.id}</strong>
              <div className="tiny muted" style={{ overflowWrap: "anywhere" }}>
                {p.baseUrl}
                {p.model ? ` · ${p.model}` : ""}
              </div>
            </div>
            <button type="button" className="icon-button" onClick={() => remove(p.id)}>
              ✕
            </button>
          </div>
        ))}

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="p-name">{t("settings.pName")}</label>
            <input
              id="p-name"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Together"
            />
          </div>
          <div className="field">
            <label htmlFor="p-model">{t("settings.pModel")}</label>
            <input
              id="p-model"
              value={draft.model ?? ""}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              style={{ direction: "ltr", textAlign: "left" }}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-url">{t("settings.pUrl")}</label>
          <input
            id="p-url"
            value={draft.baseUrl}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            style={{ direction: "ltr", textAlign: "left" }}
          />
        </div>
        <div className="field">
          <label htmlFor="p-key">{t("settings.pKey")}</label>
          <input
            id="p-key"
            type="password"
            autoComplete="off"
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            style={{ direction: "ltr", textAlign: "left" }}
          />
        </div>

        {badUrl && <div className="alert alert-error">{t("settings.pBad")}</div>}

        <button type="button" className="button button-sm" onClick={add}>
          {t("settings.pAdd")}
        </button>
      </div>
    </>
  );
}
