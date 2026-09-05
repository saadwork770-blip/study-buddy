import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { AiMessage, AiPart, Attachment, Source, StreamEvent } from "./types";
import { type UserKeys, fallbackChain, isTextOnly, streamFromProvider } from "./providers";

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

/**
 * The Gemini key for a request. The student's own comes first on purpose:
 * they only ever open the settings page because something is broken, and a
 * key deployed with the site that has expired or been revoked must not keep
 * winning over the fresh one they just pasted in to fix it.
 */
export function geminiKey(userKeys?: UserKeys): string | undefined {
  return (
    userKeys?.gemini?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim()
  );
}

export function getClient(userKeys?: UserKeys): GoogleGenAI {
  const apiKey = geminiKey(userKeys);
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

// 429 is deliberately absent: a spent daily quota does not refill in the two
// seconds a backoff would wait, so retrying it just makes the student watch a
// spinner before the fallback they were always going to get. The model walk
// and the provider chain handle it instead.
const TRANSIENT = new Set([500, 502, 503, 504]);

function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status && TRANSIENT.has(status)) return true;
  return /overloaded|high demand|UNAVAILABLE|ECONNRESET|fetch failed/i.test(
    String((err as { message?: string })?.message ?? ""),
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Out of quota, rather than a transient blip — worth switching model. */
function isExhausted(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = String((err as { message?: string })?.message ?? "");
  return status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(message);
}

/**
 * Whether a backup provider should be given the turn.
 *
 * Anything that stops Gemini serving the request qualifies, not just a spent
 * quota: an expired or revoked key, an overloaded backend, a network failure.
 * Treating only quota as fallback-worthy meant a dead key took the whole site
 * down while three working backup providers sat unused.
 */
function canFallOver(err: unknown): boolean {
  if (err instanceof MissingKeyError) return true;
  const status = (err as { status?: number })?.status;
  if (status && [401, 403, 429, 500, 502, 503, 504].includes(status)) return true;
  return /quota|RESOURCE_EXHAUSTED|rate limit|API[_ ]?KEY|UNAUTHENTICATED|PERMISSION_DENIED|overloaded|UNAVAILABLE|fetch failed|ECONNRESET/i.test(
    String((err as { message?: string })?.message ?? ""),
  );
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
  /** Keys the student entered in the site's settings page. */
  keys?: UserKeys;
}

/**
 * Streams one turn into the NDJSON emitter and returns any web sources the
 * model grounded its answer on.
 */
export async function streamTurn(
  emit: Emit,
  opts: StreamOptions,
): Promise<{ text: string; sources: Source[] }> {
  // Not fatal on its own: with no Gemini key at all, a configured backup
  // provider can still answer a plain text turn, so the failure is carried
  // to the fallback below rather than thrown here.
  let ai: GoogleGenAI | null = null;
  let keyError: unknown;
  try {
    ai = getClient(opts.keys);
  } catch (err) {
    keyError = err;
  }

  const openStream = (model: string) =>
    withRetry(
      () =>
        ai!.models.generateContentStream({
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
  let lastError: unknown = keyError;

  // Primary model, then its siblings — each has its own daily allowance.
  for (const model of ai ? [MODEL, ...MODEL_FALLBACKS] : []) {
    try {
      stream = await openStream(model);
      if (model !== MODEL) {
        console.warn(`[study-buddy] ${MODEL} out of quota, using ${model}`);
      }
      break;
    } catch (err) {
      lastError = err;
      // Quota is counted per model, so a sibling may still have room. Any
      // other failure — a dead key above all — applies to all of them.
      if (!isExhausted(err)) break;
    }
  }

  if (!stream) {
    const err = lastError;
    // Gemini cannot serve this turn — hand it to a backup provider, but only
    // when nothing about the request depends on Gemini specifically.
    const chain = fallbackChain(opts.keys);
    if (!canFallOver(err) || !chain.length || opts.search || !isTextOnly(opts.messages)) {
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
          {
            maxTokens: Math.min(opts.maxTokens ?? 8192, 8192),
            signal: opts.signal,
            userKeys: opts.keys,
          },
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
  keys?: UserKeys,
): Promise<T | null> {
  let ai: GoogleGenAI | null = null;
  let keyError: unknown;
  try {
    ai = getClient(keys);
  } catch (err) {
    keyError = err;
  }

  const attempt = (model: string) =>
    withRetry(() =>
      ai!.models.generateContent({
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
  let lastError: unknown = keyError;
  for (const model of ai ? [MODEL, ...MODEL_FALLBACKS] : []) {
    try {
      response = await attempt(model);
      break;
    } catch (err) {
      lastError = err;
      if (!canFallOver(err)) throw err;
      // As above: only a spent per-model quota is worth another model.
      if (!isExhausted(err)) break;
    }
  }

  if (!response) {
    // Plan and task-card generation would otherwise die with Gemini, even
    // with working backups. They cannot take a Gemini-side response schema,
    // so the shape is asked for in the prompt and validated by the parse.
    const chain = extraParts.length ? [] : fallbackChain(keys);
    for (const provider of chain) {
      try {
        const answer = await streamFromProvider(
          provider,
          `${system}\n\nReply with JSON only — no prose, no code fence — matching this schema:\n${JSON.stringify(schema)}`,
          [{ role: "user", parts: [{ text: prompt }] }],
          () => {},
          { maxTokens: 8192, json: true, userKeys: keys },
        );
        const parsed = parseJson<T>(answer);
        if (parsed) return parsed;
      } catch (err) {
        console.warn(`[study-buddy] json fallback ${provider.id} failed:`, err);
      }
    }
    throw lastError;
  }

  return response.text ? parseJson<T>(response.text) : null;
}

/** Tolerates a model that wrapped its JSON in prose or a code fence. */
function parseJson<T>(text: string): T | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
