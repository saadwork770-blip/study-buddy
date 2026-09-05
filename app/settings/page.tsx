"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/components/lang-provider";
import type { TKey } from "@/lib/i18n";
import { ProviderStatus } from "@/components/provider-status";
import { KEY_FIELDS, type UserKeys, keysForRequest, readKeys, writeKeys } from "@/lib/user-keys";

interface Probe {
  ok: boolean;
  model?: string;
  degraded?: boolean;
  source?: "typed" | "deployed" | "none";
  reason?: string;
  detail?: string;
  probed?: {
    id: string;
    label: string;
    ok: boolean;
    model?: string;
    reply?: string;
    reason?: string;
    detail?: string;
  }[];
}

/**
 * Lets the student add provider keys without touching Vercel or redeploying.
 * Keys stay in this browser and travel with each request; a key deployed with
 * the site still takes precedence.
 */
export default function SettingsPage() {
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const [keys, setKeys] = useState<UserKeys>({});
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Probe | null>(null);

  useEffect(() => {
    setKeys(readKeys());
    setReady(true);
  }, []);

  const set = (id: string, value: string) => {
    const next = { ...keys, [id]: value };
    setKeys(next);
    writeKeys(next);
    setSaved(true);
    // A key just changed, so the last verdict no longer describes it.
    setResult(null);
    setTimeout(() => setSaved(false), 1500);
  };

  /** Sends every saved key to the real APIs, so "it works" is not a guess. */
  const verify = async () => {
    setChecking(true);
    setResult(null);
    try {
      const response = await fetch("/api/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: keysForRequest(), probe: true }),
      });
      setResult((await response.json()) as Probe);
    } catch (err) {
      setResult({ ok: false, reason: "error.generic", detail: String(err) });
    } finally {
      setChecking(false);
    }
  };

  if (!ready) return null;

  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("settings.title")}</h1>
        <p>{t("settings.subtitle")}</p>
      </div>

      <div className="card">
        {KEY_FIELDS.map((field) => (
          <div key={field.id} className="field" style={{ marginBottom: 18 }}>
            <label htmlFor={`k-${field.id}`}>
              {ar ? field.ar : field.label}{" "}
              <a href={field.url} target="_blank" rel="noopener noreferrer" className="tiny">
                {t("settings.get")} ↗
              </a>
            </label>
            <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <input
                id={`k-${field.id}`}
                type={shown[field.id] ? "text" : "password"}
                value={keys[field.id] ?? ""}
                placeholder={field.id === "groq" ? "gsk_..." : "..."}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => set(field.id, event.target.value)}
                style={{ direction: "ltr", textAlign: "left" }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={t("settings.show")}
                onClick={() => setShown((s) => ({ ...s, [field.id]: !s[field.id] }))}
              >
                {shown[field.id] ? "🙈" : "👁"}
              </button>
              {keys[field.id] && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("out.delete")}
                  onClick={() => set(field.id, "")}
                >
                  ✕
                </button>
              )}
            </div>
            <span className="hint">{ar ? field.arHint : field.hint}</span>
          </div>
        ))}

        <div className="row">
          {saved && <span className="badge badge-success">✓ {t("settings.saved")}</span>}
          <span className="spacer" />
          <button type="button" className="button button-sm" onClick={verify} disabled={checking}>
            {checking ? t("settings.verifying") : t("settings.verify")}
          </button>
          <a className="button button-ghost button-sm" href="/check">
            {t("settings.upload")} →
          </a>
        </div>

        {result && (
          <div style={{ marginTop: 14 }}>
            {[
              {
                id: "gemini",
                label: "Gemini",
                ok: result.ok,
                note: [
                  result.ok
                    ? result.model
                    : t((result.reason ?? "error.generic") as TKey),
                  result.ok && result.degraded ? t("settings.degraded") : "",
                  // Says outright whose key answered, so a stale key set in
                  // the host's dashboard cannot masquerade as this one.
                  result.source === "typed"
                    ? t("settings.srcTyped")
                    : result.source === "deployed"
                      ? t("settings.srcDeployed")
                      : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              },
              ...(result.probed ?? []).map((provider) => ({
                id: provider.id,
                label: provider.label,
                ok: provider.ok,
                note: provider.ok
                  ? [t("settings.works"), provider.model].filter(Boolean).join(" · ")
                  : [
                      t((provider.reason ?? "error.generic") as TKey),
                      provider.model,
                      provider.detail,
                    ]
                      .filter(Boolean)
                      .join(" · "),
              })),
            ].map((row) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "9px 0",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: "1.05rem", lineHeight: 1.5 }}>
                  {row.ok ? "✅" : "❌"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong className="small">{row.label}</strong>
                  <div
                    className="tiny"
                    style={{
                      color: row.ok ? "var(--muted)" : "var(--danger)",
                      overflowWrap: "anywhere",
                      marginTop: 3,
                    }}
                  >
                    {row.note}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProviderStatus />

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        {t("settings.privacy")}
      </div>
    </main>
  );
}
