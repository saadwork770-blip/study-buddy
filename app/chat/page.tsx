"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/lang-provider";
import { Markdown } from "@/components/markdown";
import { useLibrary } from "@/lib/store";
import { readNdjson } from "@/lib/stream";
import { exportPayload } from "@/lib/export";
import type { ChatMessage } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

const MODES: { value: string; label: TKey }[] = [
  { value: "tutor", label: "chat.mode.tutor" },
  { value: "socratic", label: "chat.mode.socratic" },
  { value: "quiz", label: "chat.mode.quiz" },
  { value: "explain", label: "chat.mode.explain" },
];

const SUGGESTIONS: TKey[] = ["chat.suggest.1", "chat.suggest.2", "chat.suggest.3"];

export default function ChatPage() {
  const { t, lang } = useLang();
  const { saveItem } = useLibrary();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("tutor");
  const [subject, setSubject] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, running]);

  const send = async (content: string) => {
    const question = content.trim();
    if (!question || running) return;

    const history: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setSaved(false);
    setRunning(true);

    const abort = new AbortController();
    controller.current = abort;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, lang, mode, subject }),
        signal: abort.signal,
      });

      let answer = "";
      await readNdjson(response, (event) => {
        if (event.type === "text") {
          answer += event.text;
          setMessages([...history, { role: "assistant", content: answer }]);
        } else if (event.type === "error") {
          setError(event.message);
        }
      });

      if (!answer) setMessages(history);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError("error.generic");
      setMessages(history);
    } finally {
      controller.current = null;
      setRunning(false);
    }
  };

  const transcript = messages
    .map((message) => {
      const who =
        message.role === "user"
          ? lang === "ar"
            ? "**السؤال:**"
            : "**You:**"
          : lang === "ar"
            ? "**الإجابة:**"
            : "**Study Buddy:**";
      return `${who}\n\n${message.content}`;
    })
    .join("\n\n---\n\n");

  const title = messages[0]?.content.slice(0, 70) || t("chat.title");

  return (
    <main className="page">
      <div className="page-head row-between">
        <div>
          <h1>{t("chat.title")}</h1>
          <p>{t("chat.subtitle")}</p>
        </div>
        {messages.length > 0 && (
          <div className="row no-print">
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => {
                saveItem({ kind: "chat", title, content: transcript, lang });
                setSaved(true);
              }}
              disabled={saved || running}
            >
              {saved ? `✓ ${t("out.saved")}` : t("out.save")}
            </button>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => void exportPayload("docx", { title, markdown: transcript, lang })}
              disabled={running}
            >
              ⤓ Word
            </button>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => exportPayload("pdf", { title, markdown: transcript, lang })}
              disabled={running}
            >
              🖨 PDF
            </button>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => {
                setMessages([]);
                setError(null);
                setSaved(false);
              }}
            >
              {t("chat.clear")}
            </button>
          </div>
        )}
      </div>

      <div className="card card-tight no-print" style={{ marginBottom: 18 }}>
        <div className="row">
          <div className="segmented">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                onClick={() => setMode(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={t("chat.subject")}
            style={{ flex: 1, minWidth: 180 }}
          />
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="empty-state">
          <p>{t("chat.empty")}</p>
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            {SUGGESTIONS.map((key) => (
              <button key={key} type="button" className="chip" onClick={() => void send(t(key))}>
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="chat-log">
          {messages.map((message, index) => (
            <div key={index} className={`bubble ${message.role}`}>
              {message.role === "user" ? (
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.content}</p>
              ) : message.content ? (
                <Markdown text={message.content} />
              ) : (
                <span className="status-line">
                  <span className="dot-pulse" />
                  {t("out.thinking")}
                </span>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>
      )}

      {error && <div className="alert alert-error">{t(error as TKey)}</div>}

      <form
        className="composer no-print"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("chat.placeholder")}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
        />
        {running ? (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => controller.current?.abort()}
          >
            {t("chat.stop")}
          </button>
        ) : (
          <button type="submit" className="button" disabled={!input.trim()}>
            {t("chat.send")}
          </button>
        )}
      </form>
    </main>
  );
}
