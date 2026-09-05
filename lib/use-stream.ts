"use client";

import { useCallback, useRef, useState } from "react";
import { readNdjson } from "./stream";
import { mergeCooldowns } from "./user-keys";
import type { Source } from "./types";

/** Drives one streaming request: accumulated text, status, sources, errors. */
export function useStream() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which backup answered, when the primary could not. */
  const [servedBy, setServedBy] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
    setStatus(null);
  }, []);

  const run = useCallback(
    async (url: string, init: RequestInit, onText?: (full: string) => void) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;

      setText("");
      setSources([]);
      setError(null);
      setStatus(null);
      setServedBy(null);
      setRunning(true);

      let accumulated = "";
      try {
        const response = await fetch(url, { ...init, signal: abort.signal });
        if (!response.ok && response.headers.get("content-type")?.includes("json")) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "error.generic");
        }
        await readNdjson(response, (event) => {
          switch (event.type) {
            case "text":
              accumulated += event.text;
              setText(accumulated);
              setStatus(null);
              onText?.(accumulated);
              break;
            case "status":
              setStatus(event.label);
              break;
            // The server has no memory between requests; this browser does.
            case "cooldowns":
              mergeCooldowns(event.cooldowns);
              break;
            case "served":
              setServedBy(event.provider);
              break;
            case "sources":
              setSources(event.sources);
              break;
            case "error":
              setError(event.message);
              break;
            case "done":
              setStatus(null);
              break;
          }
        });
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setError((err as Error)?.message?.startsWith("error.")
            ? (err as Error).message
            : "error.generic");
        }
      } finally {
        if (controller.current === abort) controller.current = null;
        setRunning(false);
        setStatus(null);
      }
      return accumulated;
    },
    [],
  );

  return { text, setText, status, sources, running, error, servedBy, run, stop };
}
