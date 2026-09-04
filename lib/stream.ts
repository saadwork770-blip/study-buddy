"use client";

import type { StreamEvent } from "./types";

/**
 * Reads an NDJSON response body and hands each event to the caller.
 * Partial lines are buffered across chunks.
 */
export async function readNdjson(
  response: Response,
  onEvent: (event: StreamEvent) => void,
) {
  if (!response.body) throw new Error("no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handle = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onEvent(JSON.parse(trimmed) as StreamEvent);
    } catch {
      // A malformed line means the stream was cut mid-write; ignore it.
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handle(line);
  }
  handle(buffer);
}
