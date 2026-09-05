import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { AiMessage, AiPart, Attachment, Source, StreamEvent } from "./types";
import {
  type CustomProvider,
  type UserKeys,
  currentModel,
  fallbackChain,
  isTextOnly,
  keyFor,
  streamFromProvider,
} from "./providers";
import { type Cooldowns, cooldownFor, order, prune } from "./cooldown";

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

/**
 * Google retires model names, and a name that still works for an existing
 * project can be closed to new ones — "no longer available to new users" is
 * a 404 for exactly one student and nobody else. Any hard-coded list above
 * is therefore a guess with an expiry date, so it is only ever the opening
 * guess: when it is refused, the API is asked what this key can actually
 * call, and the answer is used and remembered.
 */
interface GeminiModel {
  name: string;
  supportedGenerationMethods?: string[];
}

const geminiBaseUrl = () =>
  (process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com").replace(
    /\/$/,
    "",
  );

/** Models that exist but cannot answer a chat turn. */
const NOT_CHAT_MODEL =
  /embedding|aqa|imagen|veo|tts|image-generation|learnlm-.*-vision|gemma/i;

/**
 * Preference, lowest first: a flash model is the one with a usable free
 * allowance, and a newer version beats an older one. Nothing here names a
 * specific model, so a version Google ships after this was written still
 * sorts correctly.
 */
function rankGeminiModel(name: string): [number, number, number] {
  const bare = name.replace(/^models\//, "");
  const family = /flash-lite/i.test(bare)
    ? 1
    : /flash/i.test(bare)
      ? 0
      : /pro/i.test(bare)
        ? 2
        : 3;
  // Negated so a higher version sorts first.
  const version = -Number.parseFloat(/(\d+(?:\.\d+)?)/.exec(bare)?.[1] ?? "0");
  const unstable = /-(exp|preview|latest)\b|-\d{3,}$/i.test(bare) ? 1 : 0;
  return [family, unstable, version];
}

/** Ordered list of models this key may actually call, remembered per key. */
const modelCache = new Map<string, string[]>();

async function listGeminiModels(key: string, signal?: AbortSignal): Promise<string[]> {
  const cached = modelCache.get(key);
  if (cached) return cached;

  const response = await fetch(`${geminiBaseUrl()}/v1beta/models`, {
    headers: { "x-goog-api-key": key },
    signal,
  });
  if (!response.ok) return [];

  const body = (await response.json().catch(() => ({}))) as { models?: GeminiModel[] };
  const usable = (body.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
    .map((model) => model.name.replace(/^models\//, ""))
    .filter((name) => name && !NOT_CHAT_MODEL.test(name))
    .sort((a, b) => {
      const [fa, ua, va] = rankGeminiModel(a);
      const [fb, ub, vb] = rankGeminiModel(b);
      return fa - fb || ua - ub || va - vb;
    });

  // One deployment has few keys; the cap is only to stop unbounded growth.
  if (modelCache.size > 20) modelCache.clear();
  if (usable.length) modelCache.set(key, usable);
  return usable;
}

/** True when Google refused the model itself rather than the key or quota. */
function isModelGone(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = String((err as { message?: string })?.message ?? "");
  if (status === 404) return true;
  return /NOT_FOUND|no longer available|is not found|not supported for|does not exist/i.test(
    message,
  );
}
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

const isCoolingId = (cooldowns: Cooldowns, id: string, now: number) =>
  (cooldowns?.[id]?.until ?? 0) > now;

/** Tells the browser what to skip next time; it is the only thing that remembers. */
function emitCooldowns(emit: Emit, learned: Cooldowns) {
  if (Object.keys(learned).length) emit({ type: "cooldowns", cooldowns: learned });
}

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
  // A retired model — or a key allowed to call none at all — is as fatal to
  // this turn as a dead key, and just as worth handing to a provider that
  // still answers.
  if (isModelGone(err)) return true;
  if ((err as { key?: string })?.key === "error.noModel") return true;
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
 * Runs `attempt` against the best model this key can actually call.
 *
 * The walk is ordered by what each failure means: a spent quota is counted
 * per model, so a sibling is worth trying; a retired or restricted model is
 * gone for good, so the API is asked what exists and the answer is used.
 * Discovery happens once and is remembered, so the cost is one extra request
 * the first time a hard-coded name goes stale — and never again.
 */
async function withGeminiModel<T>(
  keys: UserKeys | undefined,
  attempt: (model: string) => Promise<T>,
  signal?: AbortSignal,
): Promise<{ value: T; model: string }> {
  const key = geminiKey(keys);
  if (!key) throw new MissingKeyError();

  const known = modelCache.get(key) ?? [];
  const tried = new Set<string>();
  const candidates = [...known.slice(0, 1), MODEL, ...MODEL_FALLBACKS];
  let lastError: unknown;
  let sawMissingModel = false;

  for (const model of candidates) {
    if (!model || tried.has(model)) continue;
    tried.add(model);
    try {
      return { value: await attempt(model), model };
    } catch (err) {
      lastError = err;
      if (isModelGone(err)) {
        sawMissingModel = true;
        continue;
      }
      // Quota is per model, so a sibling may still have room; anything else
      // (a dead key, a malformed request) is the same for every model.
      if (!isExhausted(err)) throw err;
    }
  }

  // Every name we knew was refused or spent. Ask what this key can call.
  const available = await listGeminiModels(key, signal).catch(() => []);
  for (const model of available.filter((m) => !tried.has(m)).slice(0, 4)) {
    try {
      const value = await attempt(model);
      console.warn(`[study-buddy] gemini: ${MODEL} unusable, using ${model}`);
      return { value, model };
    } catch (err) {
      lastError = err;
      if (!isModelGone(err) && !isExhausted(err)) throw err;
    }
  }

  if (sawMissingModel && !available.length) {
    throw Object.assign(new Error("no usable Gemini model for this key"), {
      key: "error.noModel",
    });
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
  /** Which providers are known to be spent, and until when. */
  cooldowns?: Cooldowns;
  /** Providers the student added themselves. */
  custom?: CustomProvider[];
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

  const now = Date.now();
  const cooldowns = prune(opts.cooldowns ?? {}, now);
  /** What this turn learned about availability, sent back to the browser. */
  const learned: Cooldowns = {};

  const note = (id: string, err: unknown) => {
    const entry = cooldownFor(
      {
        status: (err as { status?: number })?.status,
        message: String((err as { message?: string })?.message ?? ""),
        retryAfter: (err as { retryAfter?: number })?.retryAfter,
      },
      Date.now(),
    );
    if (entry) learned[id] = entry;
  };

  let stream: Awaited<ReturnType<typeof openStream>> | null = null;
  let lastError: unknown = keyError;

  // Gemini leads when it can: it is the only one with Search grounding and
  // the only one that can read an uploaded file. When it is spent, the whole
  // point of the rotation is not to spend a request finding that out again.
  const geminiReady = ai && !isCoolingId(cooldowns, "gemini", now);
  if (ai && !geminiReady) {
    lastError = Object.assign(new Error("gemini cooling"), { status: 429 });
  }

  if (geminiReady) {
    try {
      stream = (await withGeminiModel(opts.keys, openStream, opts.signal)).value;
    } catch (err) {
      lastError = err;
      note("gemini", err);
    }
  }

  if (!stream) {
    const err = lastError;
    // Only an uploaded file genuinely cannot go: no backup can read a file
    // held by Google. A web search can — losing the grounding is a smaller
    // loss than losing the answer, so the turn goes ahead and says so.
    const chain = order(fallbackChain(opts.keys, opts.custom), cooldowns, now);
    if ((geminiReady && !canFallOver(err)) || !chain.length || !isTextOnly(opts.messages)) {
      emitCooldowns(emit, learned);
      throw err;
    }
    for (const provider of chain) {
      try {
        emit({
          type: "status",
          label: opts.search ? "out.fallbackNoSearch" : "out.fallback",
        });
        const answer = await streamFromProvider(
          provider,
          opts.search
            ? `${opts.system}\n\nIMPORTANT: the web search tool is NOT available for this answer. Do not claim to have searched, and do not invent citations or URLs. Where a claim needs a source you were not given, write [مرجع مطلوب] / [citation needed].`
            : opts.system,
          opts.messages,
          (delta) => emit({ type: "text", text: delta }),
          {
            maxTokens: Math.min(opts.maxTokens ?? 8192, 8192),
            signal: opts.signal,
            userKeys: opts.keys,
          },
        );
        if (answer.trim()) {
          emit({ type: "served", provider: provider.label, model: currentModel(provider) });
          emitCooldowns(emit, learned);
          return { text: answer, sources: [] };
        }
      } catch (fallbackError) {
        console.warn(`[study-buddy] fallback ${provider.id} failed:`, fallbackError);
        note(provider.id, fallbackError);
      }
    }
    emitCooldowns(emit, learned);
    throw err;
  }

  emitCooldowns(emit, learned);

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

/**
 * One tiny call for the setup check, using the same model walk as everything
 * else. Returns the reply and the model that produced it.
 */
export async function probeGemini(
  keys?: UserKeys,
): Promise<{ value: string; model: string }> {
  const ai = getClient(keys);
  return withGeminiModel(keys, async (model) => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
      config: { maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 0 } },
    });
    return response.text ?? "";
  });
}

/** One non-streaming call that must come back as JSON matching `schema`. */
export async function generateJson<T>(
  system: string,
  prompt: string,
  schema: Record<string, unknown>,
  extraParts: AiPart[] = [],
  keys?: UserKeys,
  routing: { cooldowns?: Cooldowns; custom?: CustomProvider[] } = {},
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
  const cooling = isCoolingId(prune(routing.cooldowns ?? {}), "gemini", Date.now());
  if (ai && !cooling) {
    try {
      response = (await withGeminiModel(keys, attempt)).value;
    } catch (err) {
      lastError = err;
      if (!canFallOver(err)) throw err;
    }
  } else if (cooling) {
    lastError = Object.assign(new Error("gemini cooling"), { status: 429 });
  }

  if (!response) {
    // Plan and task-card generation would otherwise die with Gemini, even
    // with working backups. They cannot take a Gemini-side response schema,
    // so the shape is asked for in the prompt and validated by the parse.
    // Same rotation as the streaming path: skip what is known to be spent.
    const chain = extraParts.length
      ? []
      : order(
          fallbackChain(keys, routing.custom),
          prune(routing.cooldowns ?? {}),
        );
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
