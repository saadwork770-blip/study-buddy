"use client";

import { useRef, useState } from "react";
import { useLang } from "./lang-provider";
import { ACCEPT, uploadAttachment } from "@/lib/upload";
import type { Attachment } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

interface Props {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** Compact chip row for the chat composer; full dropzone elsewhere. */
  compact?: boolean;
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/** Attaches files to any AI feature. Large files go straight to Google. */
export function FileAttach({ value, onChange, compact }: Props) {
  const { t } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      setBusy(file.name);
      setProgress(0);
      try {
        const attachment = await uploadAttachment(file, setProgress);
        onChange([...value, attachment]);
      } catch (err) {
        setError((err as Error)?.message || "error.generic");
      } finally {
        setBusy(null);
      }
    }
    if (input.current) input.current.value = "";
  };

  const list = value.map((file, index) => (
    <span key={`${file.name}-${index}`} className="attach-chip">
      <span aria-hidden="true">{file.text ? "📃" : "📎"}</span>
      <span className="attach-name">{file.name}</span>
      <span className="tiny muted">{sizeLabel(file.size)}</span>
      <button
        type="button"
        aria-label={t("summarize.remove")}
        onClick={() => onChange(value.filter((_, i) => i !== index))}
      >
        ✕
      </button>
    </span>
  ));

  return (
    <div className="attach">
      {!compact && <label className="attach-label">{t("attach.title")}</label>}

      {compact ? (
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={() => input.current?.click()}
            disabled={!!busy}
          >
            📎 {t("attach.add")}
          </button>
          {list}
        </div>
      ) : (
        <>
          <div
            className={dragging ? "dropzone drag" : "dropzone"}
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") input.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void take(e.dataTransfer.files);
            }}
          >
            <div style={{ fontSize: "1.5rem" }} aria-hidden="true">
              ⬆
            </div>
            <div className="small">{t("attach.add")}</div>
            <div className="hint">{t("attach.hint")}</div>
          </div>
          {value.length > 0 && (
            <div className="row" style={{ gap: 6, marginTop: 9 }}>
              {list}
            </div>
          )}
        </>
      )}

      {busy && (
        <div className="attach-progress">
          <span className="small">{t("attach.uploading", { name: busy })}</span>
          <div className="progress">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <div className="alert alert-error small">{t(error as TKey)}</div>}

      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={ACCEPT}
        onChange={(e) => void take(e.target.files)}
      />
    </div>
  );
}
