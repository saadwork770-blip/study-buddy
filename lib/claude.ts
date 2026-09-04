import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Source, StreamEvent } from "./types";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
export const EFFORT = (process.env.ANTHROPIC_EFFORT || "high") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** Thrown before any network call when the key is not configured. */
export class MissingKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "MissingKeyError";
  }
}

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingKeyError();
  // The SDK reads ANTHROPIC_API_KEY itself; the check above only exists so we
  // can show the student a useful message instead of a 401.
  return new Anthropic({ maxRetries: 2 });
}

/** Maps any thrown error onto a translation key the browser can render. */
export function errorKey(err: unknown): string {
  if (err instanceof MissingKeyError) return "error.noKey";
  // Input-validation errors carry the translation key they want shown.
  if (err && typeof err === "object" && "key" in err) {
    return String((err as { key: unknown }).key);
  }
  if (err instanceof Anthropic.AuthenticationError) return "error.noKey";
  if (err instanceof Anthropic.RateLimitError) return "error.rate";
  return "error.generic";
}

type Emit = (event: StreamEvent) => void;

/**
 * Wraps a unit of work in an NDJSON response: one JSON object per line, so the
 * browser can interleave text deltas with status and source events.
 */
export function ndjsonStream(run: (emit: Emit) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit: Emit = (event) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        await run(emit);
      } catch (err) {
        console.error("[study-buddy] stream failed:", err);
        emit({ type: "error", message: errorKey(err) });
      } finally {
        emit({ type: "done" });
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Stops proxies (and `next start` behind nginx) from buffering the stream.
      "X-Accel-Buffering": "no",
    },
  });
}

export interface StreamOptions {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  tools?: Anthropic.ToolUnion[];
  /** Emitted as a status event while Claude is reasoning or searching. */
  statusLabels?: { thinking?: string; searching?: string };
  signal?: AbortSignal;
}

/**
 * Streams one Claude turn into the NDJSON emitter and returns the final
 * message, so callers can pull citations or structured data out of it.
 */
export async function streamTurn(
  emit: Emit,
  opts: StreamOptions,
): Promise<Anthropic.Message> {
  const client = getClient();
  const params: Anthropic.MessageStreamParams = {
    model: MODEL,
    max_tokens: opts.maxTokens ?? 32000,
    output_config: { effort: EFFORT },
    // Opus 5 runs adaptive thinking by default; stated explicitly so the
    // behaviour does not change if ANTHROPIC_MODEL points elsewhere.
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
    ],
    messages: opts.messages,
    ...(opts.tools?.length ? { tools: opts.tools } : {}),
  };

  let produced = false;

  /** The beta and stable stream helpers differ in type but not in shape. */
  interface StreamLike {
    [Symbol.asyncIterator](): AsyncIterator<{
      type: string;
      content_block?: { type: string };
      delta?: { type: string; text?: string };
    }>;
    finalMessage(): Promise<unknown>;
    abort(): void;
  }

  const pump = async (stream: StreamLike): Promise<Anthropic.Message> => {
    for await (const event of stream) {
      if (opts.signal?.aborted) {
        stream.abort();
        break;
      }
      if (event.type === "content_block_start") {
        const type = event.content_block?.type;
        if (type === "thinking" && opts.statusLabels?.thinking) {
          emit({ type: "status", label: opts.statusLabels.thinking });
        } else if (type === "server_tool_use" && opts.statusLabels?.searching) {
          emit({ type: "status", label: opts.statusLabels.searching });
        }
      } else if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        produced = true;
        emit({ type: "text", text: event.delta.text ?? "" });
      }
    }
    // An aborted stream rejects on finalMessage(); the caller stopped on
    // purpose, so hand back an empty message instead of an error.
    if (opts.signal?.aborted) {
      return { content: [], stop_reason: null } as unknown as Anthropic.Message;
    }
    return (await stream.finalMessage()) as Anthropic.Message;
  };

  try {
    // Server-side refusal fallback: if a policy classifier declines the turn,
    // the API retries it on a fallback model inside the same call.
    const betaStream = client.beta.messages.stream({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as never) as unknown as StreamLike;
    return await pump(betaStream);
  } catch (err) {
    // If the beta is unavailable on this account, fall back to the stable
    // endpoint - but only when nothing has reached the browser yet.
    if (produced || !(err instanceof Anthropic.BadRequestError)) throw err;
    console.warn("[study-buddy] refusal-fallback beta unavailable, retrying");
    return pump(client.messages.stream(params) as unknown as StreamLike);
  }
}

/** Pulls web-search citations out of a finished message, de-duplicated. */
export function extractSources(message: Anthropic.Message): Source[] {
  const seen = new Map<string, Source>();
  for (const block of message.content) {
    if (block.type !== "web_search_tool_result") continue;
    const content = (block as { content: unknown }).content;
    if (!Array.isArray(content)) continue; // an error object, not results
    for (const result of content) {
      const url = (result as { url?: string }).url;
      if (!url || seen.has(url)) continue;
      seen.set(url, {
        url,
        title: (result as { title?: string }).title || url,
      });
    }
  }
  return [...seen.values()];
}

/** Concatenated text of a finished message. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 8,
} as unknown as Anthropic.ToolUnion;
