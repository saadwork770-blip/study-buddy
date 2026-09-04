"use client";

import { useEffect, useState } from "react";
import { useLang } from "./lang-provider";
import type { TKey } from "@/lib/i18n";

interface Health {
  ok: boolean;
  model?: string;
  reason?: string;
  detail?: string;
}

/**
 * Runs once on the home page so a fresh deploy reports its own state instead
 * of looking fine until the student tries to use a feature.
 */
export function SetupCheck() {
  const { t } = useLang();
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: Health) => live && setHealth(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) return null;

  if (!health) {
    return (
      <div className="alert alert-info" role="status">
        {t("health.checking")}
      </div>
    );
  }

  if (health.ok) {
    return (
      <div
        className="alert"
        style={{ background: "var(--success-soft)", color: "var(--success)" }}
        role="status"
      >
        ✓ {t("health.ok", { model: health.model ?? "" })}
      </div>
    );
  }

  return (
    <div className="alert alert-error" role="alert">
      <strong>{t("health.fail")}</strong> — {t((health.reason ?? "error.generic") as TKey)}{" "}
      <a href="/check" style={{ textDecoration: "underline" }}>
        {t("health.diagnose")}
      </a>
      {health.detail && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: "pointer" }}>{t("health.detail")}</summary>
          <code style={{ fontSize: ".8rem", overflowWrap: "anywhere" }}>{health.detail}</code>
        </details>
      )}
    </div>
  );
}
