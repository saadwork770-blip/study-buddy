"use client";

import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/components/lang-provider";
import { readNdjson } from "@/lib/stream";

type State = "run" | "ok" | "fail";

interface Step {
  id: string;
  label: string;
  state: State;
  info?: string;
}

const STEPS: { id: string; ar: string; en: string }[] = [
  { id: "key", ar: "المفتاح والاتصال بـ Gemini", en: "API key reaches Gemini" },
  { id: "session", ar: "إنشاء جلسة رفع", en: "Upload session is created" },
  { id: "upload", ar: "الرفع من المتصفح إلى Google", en: "Browser uploads to Google" },
  { id: "read", ar: "قراءة الملف المرفوع", en: "Gemini reads the uploaded file" },
];

/**
 * Runs the upload pipeline one stage at a time so a failure points at the
 * exact stage rather than showing one generic message.
 */
export default function CheckPage() {
  const { t, lang } = useLang();
  const isAr = lang === "ar";
  const [steps, setSteps] = useState<Step[]>(
    STEPS.map((s) => ({ id: s.id, label: isAr ? s.ar : s.en, state: "run" })),
  );
  const [done, setDone] = useState(false);

  const set = useCallback(
    (id: string, state: State, info?: string) =>
      setSteps((current) =>
        current.map((step) => (step.id === id ? { ...step, state, info } : step)),
      ),
    [],
  );

  const run = useCallback(async () => {
    setDone(false);
    setSteps(STEPS.map((s) => ({ id: s.id, label: isAr ? s.ar : s.en, state: "run" })));

    // 1. key
    let health: { ok?: boolean; model?: string; reason?: string; detail?: string } = {};
    try {
      health = await (await fetch("/api/health")).json();
      if (health.ok) set("key", "ok", health.model);
      else set("key", "fail", `${health.reason ?? "?"} — ${health.detail ?? ""}`);
    } catch (err) {
      set("key", "fail", String(err));
    }
    if (!health.ok) {
      ["session", "upload", "read"].forEach((id) =>
        set(id, "fail", isAr ? "أُوقف: المفتاح لم ينجح" : "skipped: the key step failed"),
      );
      setDone(true);
      return;
    }

    // 2. upload session — a tiny real PDF generated here
    const pdf = new Blob(
      [
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
          "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
          "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
          "trailer<</Root 1 0 R>>",
      ],
      { type: "application/pdf" },
    );

    let uploadUrl = "";
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "check.pdf", mimeType: "application/pdf", size: pdf.size }),
      });
      const body = (await response.json()) as { uploadUrl?: string; detail?: string; error?: string };
      if (response.ok && body.uploadUrl) {
        uploadUrl = body.uploadUrl;
        set("session", "ok");
      } else {
        set("session", "fail", body.detail || body.error || `HTTP ${response.status}`);
      }
    } catch (err) {
      set("session", "fail", String(err));
    }
    if (!uploadUrl) {
      ["upload", "read"].forEach((id) =>
        set(id, "fail", isAr ? "أُوقف" : "skipped"),
      );
      setDone(true);
      return;
    }

    // 3. browser -> Google
    let fileUri = "";
    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
        body: pdf,
      });
      const text = await response.text();
      if (!response.ok) {
        set("upload", "fail", `HTTP ${response.status}: ${text.slice(0, 200)}`);
      } else {
        fileUri = (JSON.parse(text) as { file?: { uri?: string } }).file?.uri ?? "";
        set("upload", fileUri ? "ok" : "fail", fileUri ? undefined : text.slice(0, 200));
      }
    } catch (err) {
      set(
        "upload",
        "fail",
        `${String(err)} — ${isAr ? "غالباً CORS أو حجب الشبكة" : "likely CORS or a network block"}`,
      );
    }
    if (!fileUri) {
      set("read", "fail", isAr ? "أُوقف" : "skipped");
      setDone(true);
      return;
    }

    // 4. can the model actually read it back
    try {
      let answer = "";
      let failure = "";
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          messages: [{ role: "user", content: "Reply with the single word: OK" }],
          attachments: [
            { name: "check.pdf", mimeType: "application/pdf", size: pdf.size, fileUri },
          ],
        }),
      });
      await readNdjson(response, (event) => {
        if (event.type === "text") answer += event.text;
        else if (event.type === "error") failure = event.message;
      });
      if (failure) set("read", "fail", failure);
      else set("read", answer.trim() ? "ok" : "fail", answer.trim().slice(0, 60) || "empty reply");
    } catch (err) {
      set("read", "fail", String(err));
    }
    setDone(true);
  }, [isAr, lang, set]);

  useEffect(() => {
    void run();
  }, [run]);

  const allOk = done && steps.every((s) => s.state === "ok");

  return (
    <main className="page">
      <div className="page-head">
        <h1>{isAr ? "فحص الرفع" : "Upload diagnostics"}</h1>
        <p>
          {isAr
            ? "يختبر كل خطوة على حدة ليظهر أين تفشل العملية بالضبط."
            : "Runs each stage separately so a failure points at the exact step."}
        </p>
      </div>

      <div className="card">
        {steps.map((step) => (
          <div
            key={step.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "11px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "1.1rem", lineHeight: 1.5 }}>
              {step.state === "run" ? "⏳" : step.state === "ok" ? "✅" : "❌"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong className="small">{step.label}</strong>
              {step.info && (
                <div
                  className="tiny"
                  style={{
                    color: step.state === "fail" ? "var(--danger)" : "var(--muted)",
                    overflowWrap: "anywhere",
                    marginTop: 3,
                    fontFamily: step.state === "fail" ? "monospace" : undefined,
                  }}
                >
                  {step.info}
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="button" onClick={() => void run()} disabled={!done}>
            {isAr ? "أعِد الفحص" : "Run again"}
          </button>
          {done && (
            <span className="small" style={{ color: allOk ? "var(--success)" : "var(--danger)" }}>
              {allOk
                ? isAr
                  ? "كل شيء يعمل — الرفع سليم."
                  : "Everything works — uploads are fine."
                : isAr
                  ? "انسخ السطر الأحمر أعلاه وأرسله."
                  : "Copy the red line above and send it."}
            </span>
          )}
        </div>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        {t("health.detail")}: /api/health · /api/upload
      </p>
    </main>
  );
}
