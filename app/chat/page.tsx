"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/lang-provider";
import { withKeys } from "@/lib/user-keys";
import { Markdown } from "@/components/markdown";
import { ExpertPicker } from "@/components/expert-picker";
import { FileAttach } from "@/components/file-attach";
import { useLibrary } from "@/lib/store";
import { useStream } from "@/lib/use-stream";
import { exportPayload } from "@/lib/export";
import type { Attachment, ChatMessage } from "@/lib/types";
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
  const stream = useStream();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("tutor");
  const [subject, setSubject] = useState("");
  const [expert, setExpert] = useState<string | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [saved, setSaved] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, stream.running]);

  const send = async (content: string) => {
    const question = content.trim();
    if (!question || stream.running) return;

    const history: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setSaved(false);

    // Routes through the shared stream reader so a quota switch is actually
    // remembered (cooldowns), shown while it happens (status), and explained
    // if every provider refuses (attempts) — not just the raw text delta.
    const answer = await stream.run(
      "/api/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withKeys({ messages: history, lang, mode, subject, expert, attachments: files })),
      },
      (full) => setMessages([...history, { role: "assistant", content: full }]),
    );

    if (!answer) setMessages(history);
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
              disabled={saved || stream.running}
            >
              {saved ? `✓ ${t("out.saved")}` : t("out.save")}
            </button>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => void exportPayload("docx", { title, markdown: transcript, lang })}
              disabled={stream.running}
            >
              ⤓ Word
            </button>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => exportPayload("pdf", { title, markdown: transcript, lang })}
              disabled={stream.running}
            >
              🖨 PDF
            </button>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => {
                setMessages([]);
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
        <div style={{ marginTop: 12 }}>
          <ExpertPicker value={expert} onChange={setExpert} />
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
                  {stream.status ? t(stream.status as TKey) : t("out.thinking")}
                </span>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>
      )}

      {stream.error && (
        <div className="alert alert-error">
          {t(stream.error as TKey)}
          {stream.attempts.length > 0 && (
            <div className="tiny" style={{ marginTop: 8, opacity: 0.9 }}>
              {t("out.tried")}:{" "}
              {stream.attempts
                .map((a) => `${a.provider} (${t(a.reason as TKey)})`)
                .join(" · ")}
            </div>
          )}
        </div>
      )}

      <div className="no-print" style={{ marginBottom: 8 }}>
        <FileAttach value={files} onChange={setFiles} compact />
      </div>

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
        {stream.running ? (
          <button type="button" className="button button-ghost" onClick={stream.stop}>
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
