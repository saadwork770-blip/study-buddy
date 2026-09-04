import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { AiMessage, AiPart, Attachment, Source, StreamEvent } from "./types";
import { fallbackChain, isTextOnly, streamFromProvider } from "./providers";

export const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Gemini's free quota is counted per project PER MODEL, so a model that is
 * exhausted says nothing about the next one. Trying a sibling model first is
 * free, needs no extra key, and unlike an external provider it keeps Google
 * Search grounding and uploaded files working.
 */
export const MODEL_FALLBACKS = (
  process.env.GEMINI_FALLBACK_MODELS ||
  "gemini-2.5-flash-lite,gemini-2.0-flash,gemini-2.0-flash-lite"
)
  .split(",")
  .map((model) => model.trim())
  .filter((model) => model && model !== MODEL);
export const EFFORT = (process.env.AI_EFFORT || "high") as
  | "low"
  | "medium"
  | "high";

/** Effort maps onto Gemini's thinking budget: 0 disables, -1 lets it decide. */
const THINKING_BUDGET: Record<string, number> = {
  low: 0,
  medium: 4096,
  high: -1,
};

export class MissingKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set");
    this.name = "MissingKeyError";
  }
}

export function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  // Checked here so the student sees a useful message instead of a raw 400.
  if (!apiKey) throw new MissingKeyError();
  // GEMINI_BASE_URL lets the endpoint be pointed at a proxy or a test double.
  const baseUrl = process.env.GEMINI_BASE_URL?.trim();
  return new GoogleGenAI({ apiKey, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) });
}

/** Maps a thrown error onto a translation key the browser can render. */
export function errorKey(err: unknown): string {
  if (err instanceof MissingKeyError) return "error.noKey";
  if (err && typeof err === "object" && "key" in err) {
    return String((err as { key: unknown }).key);
  }
  const status = (err as { status?: number })?.status;
  const message = String((err as { message?: string })?.message ?? "");
  if (status === 401 || status === 403) return "error.noKey";
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(message)) return "error.rate";
  if (
    status === 503 ||
    status === 500 ||
    /overloaded|high demand|UNAVAILABLE/i.test(message)
  )
    return "error.busy";
  if (/API key not valid|API_KEY_INVALID/i.test(message)) return "error.noKey";
  return "error.generic";
}

/** Turns uploaded attachments into message parts. */
export function attachmentParts(attachments: Attachment[] | undefined): AiPart[] {
  if (!attachments?.length) return [];
  return attachments.flatMap((file): AiPart[] => {
    if (file.fileUri) {
      return [{ fileData: { mimeType: file.mimeType, fileUri: file.fileUri } }];
    }
    if (file.text) return [{ text: `--- ${file.name} ---\n${file.text}` }];
    return [];
  });
}

type Emit = (event: StreamEvent) => void;

const TRANSIENT = new Set([429, 500, 502, 503, 504]);

function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status && TRANSIENT.has(status)) return true;
  return /overloaded|high demand|UNAVAILABLE|ECONNRESET|fetch failed/i.test(
    String((err as { message?: string })?.message ?? ""),
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Out of quota, rather than a transient blip — worth switching provider. */
function isExhausted(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = String((err as { message?: string })?.message ?? "");
  return status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(message);
}

/**
 * Gemini's free tier returns 503 under load often enough that one attempt is
 * not enough. Retries only while nothing has been sent to the browser yet, so
 * a half-written answer is never restarted on top of itself.
 */
async function withRetry<T>(
  attempt: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let tries = 0; tries < 3; tries++) {
    if (signal?.aborted) throw new Error("aborted");
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      if (!isTransient(err)) throw err;
      await wait(600 * 2 ** tries);
    }
  }
  throw lastError;
}

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
      "X-Accel-Buffering": "no",
    },
  });
}

export interface StreamOptions {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  /** Turns on Google Search grounding, which is what produces real citations. */
  search?: boolean;
  statusLabels?: { thinking?: string; searching?: string };
  signal?: AbortSignal;
}

/**
 * Streams one turn into the NDJSON emitter and returns any web sources the
 * model grounded its answer on.
 */
export async function streamTurn(
  emit: Emit,
  opts: StreamOptions,
): Promise<{ text: string; sources: Source[] }> {
  const ai = getClient();

  const openStream = (model: string) =>
    withRetry(
      () =>
        ai.models.generateContentStream({
        model,
        contents: opts.messages,
        config: {
          systemInstruction: opts.system,
          maxOutputTokens: opts.maxTokens ?? 8192,
          thinkingConfig: { thinkingBudget: THINKING_BUDGET[EFFORT] ?? -1 },
          ...(opts.search ? { tools: [{ googleSearch: {} }] } : {}),
        },
        }),
      opts.signal,
    );

  let stream: Awaited<ReturnType<typeof openStream>> | null = null;
  let lastError: unknown;

  // Primary model, then its siblings — each has its own daily allowance.
  for (const model of [MODEL, ...MODEL_FALLBACKS]) {
    try {
      stream = await openStream(model);
      if (model !== MODEL) {
        console.warn(`[study-buddy] ${MODEL} out of quota, using ${model}`);
      }
      break;
    } catch (err) {
      lastError = err;
      if (!isExhausted(err)) break;
    }
  }

  if (!stream) {
    const err = lastError;
    // Primary is out of quota: hand the turn to a fallback provider, but only
    // when nothing about it depends on Gemini specifically.
    const chain = fallbackChain();
    if (!isExhausted(err) || !chain.length || opts.search || !isTextOnly(opts.messages)) {
      throw err;
    }
    for (const provider of chain) {
      try {
        emit({ type: "status", label: "out.fallback" });
        const answer = await streamFromProvider(
          provider,
          opts.system,
          opts.messages,
          (delta) => emit({ type: "text", text: delta }),
          { maxTokens: Math.min(opts.maxTokens ?? 8192, 8192), signal: opts.signal },
        );
        if (answer.trim()) return { text: answer, sources: [] };
      } catch (fallbackError) {
        console.warn(`[study-buddy] fallback ${provider.id} failed:`, fallbackError);
      }
    }
    throw err;
  }

  const sources = new Map<string, Source>();
  let text = "";
  let announcedSearch = false;

  if (opts.statusLabels?.thinking) {
    emit({ type: "status", label: opts.statusLabels.thinking });
  }

  for await (const chunk of stream) {
    if (opts.signal?.aborted) break;

    const grounding = chunk.candidates?.[0]?.groundingMetadata;
    if (grounding?.groundingChunks?.length) {
      if (!announcedSearch && opts.statusLabels?.searching) {
        announcedSearch = true;
        emit({ type: "status", label: opts.statusLabels.searching });
      }
      for (const item of grounding.groundingChunks) {
        const uri = item.web?.uri;
        if (!uri || sources.has(uri)) continue;
        sources.set(uri, { url: uri, title: item.web?.title || uri });
      }
    }

    const delta = chunk.text;
    if (delta) {
      text += delta;
      emit({ type: "text", text: delta });
    }
  }

  // An empty answer with no thrown error would otherwise look like success.
  if (!text.trim() && !opts.signal?.aborted) {
    throw Object.assign(new Error("empty completion"), { key: "error.busy" });
  }

  return { text, sources: [...sources.values()] };
}

/** One non-streaming call that must come back as JSON matching `schema`. */
export async function generateJson<T>(
  system: string,
  prompt: string,
  schema: Record<string, unknown>,
  extraParts: AiPart[] = [],
): Promise<T | null> {
  const ai = getClient();

  const attempt = (model: string) =>
    withRetry(() =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [...extraParts, { text: prompt }] }],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseSchema: schema,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: THINKING_BUDGET[EFFORT] ?? -1 },
        },
      }),
    );

  // Same per-model quota walk as the streaming path.
  let response: Awaited<ReturnType<typeof attempt>> | null = null;
  let lastError: unknown;
  for (const model of [MODEL, ...MODEL_FALLBACKS]) {
    try {
      response = await attempt(model);
      break;
    } catch (err) {
      lastError = err;
      if (!isExhausted(err)) throw err;
    }
  }
  if (!response) throw lastError;

  const text = response.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
