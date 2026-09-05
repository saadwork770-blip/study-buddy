import "server-only";
import type { AiMessage, Source } from "./types";

/**
 * Extra AI providers the app can fall back to when the primary one runs out of
 * free quota. All of these speak the OpenAI `/chat/completions` shape, so one
 * adapter covers them.
 *
 * They are text-only here: none of them can read a file the browser uploaded
 * to Google, and none has Google Search grounding, so a request that needs
 * either stays on the primary provider rather than silently losing it.
 */
export interface Provider {
  id: string;
  label: string;
  /** Environment variable holding the key. */
  envKey: string;
  baseUrl: string;
  /** Sensible default; these change often, so it is overridable. */
  defaultModel: string;
  envModel: string;
  /** What the free tier gives you, for the setup docs. */
  free: string;
  /**
   * Narrows what model discovery may pick for this provider — OpenRouter
   * lists paid models alongside free ones, and every provider lists
   * speech and embedding models that cannot hold a conversation.
   */
  usable?: (model: ModelInfo) => boolean;
}

/** One entry from an OpenAI-compatible `/models` listing. */
export interface ModelInfo {
  id: string;
  /** OpenRouter prices per model; "0" marks the free tier. */
  pricing?: { prompt?: string; completion?: string };
}

export const PROVIDERS: Provider[] = [
  {
    id: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    envModel: "GROQ_MODEL",
    free: "Free tier, no card. Very fast; ~30 requests/minute.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama3.3-70b",
    envModel: "CEREBRAS_MODEL",
    free: "Free tier, no card. High throughput.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    envModel: "OPENROUTER_MODEL",
    free: "Free models via the :free suffix; roughly 50 requests/day.",
    // Its catalogue is mostly paid, and a paid model would bill the student.
    usable: (model) =>
      model.id.endsWith(":free") || model.pricing?.prompt === "0",
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    envModel: "MISTRAL_MODEL",
    free: "Free experimental tier on La Plateforme.",
  },
  {
    id: "github",
    label: "GitHub Models",
    envKey: "GITHUB_MODELS_TOKEN",
    baseUrl: "https://models.github.ai/inference",
    defaultModel: "openai/gpt-4.1-mini",
    envModel: "GITHUB_MODELS_MODEL",
    // Its 8K input cap is small for long sources, so it sits last by default.
    free: "Free with a GitHub token: ~150 requests/day on mini models, but only 8K input tokens.",
  },
];

/** Keys the student pasted into the site, sent with the request. */
export type UserKeys = Record<string, string>;

/**
 * A provider the student added themselves, so a free service that appears
 * next year can be used without waiting for a release. Anything speaking the
 * OpenAI `/chat/completions` shape works.
 */
export interface CustomProvider {
  id: string;
  label: string;
  baseUrl: string;
  model?: string;
  key: string;
}

/**
 * The server is about to fetch a URL the browser chose, so the URL has to be
 * treated as hostile: without this it is a hole through which anything on the
 * deployment's private network could be reached. Public HTTPS only.
 */
export function safeBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    // Bare IPv4/IPv6 literals: a hostname is expected, and an address is how
    // the loopback and metadata endpoints are usually reached.
    /^\[?[0-9a-f:]*\]?$/i.test(host) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    return null;
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** Turns the student's entries into providers, dropping anything unusable. */
export function customProviders(list: CustomProvider[] | undefined): Provider[] {
  return (list ?? [])
    .map((entry): Provider | null => {
      const baseUrl = safeBaseUrl(entry.baseUrl ?? "");
      const id = String(entry.id ?? "").trim();
      if (!baseUrl || !id || !entry.key?.trim()) return null;
      return {
        id: `custom:${id}`,
        label: entry.label?.trim() || id,
        envKey: "",
        baseUrl,
        defaultModel: entry.model?.trim() || "",
        envModel: "",
        free: "",
      };
    })
    .filter((provider): provider is Provider => Boolean(provider));
}

/** A provider is usable if the server has a key for it, or the student does. */
export const keyFor = (provider: Provider, userKeys?: UserKeys): string | undefined =>
  userKeys?.[provider.id]?.trim() ||
  (provider.envKey ? process.env[provider.envKey]?.trim() : undefined);

export const configuredProviders = (userKeys?: UserKeys): Provider[] =>
  PROVIDERS.filter((provider) => Boolean(keyFor(provider, userKeys)));

/** Order to try fallbacks in; FALLBACK_ORDER overrides it. */
export function fallbackChain(
  userKeys?: UserKeys,
  custom?: CustomProvider[],
): Provider[] {
  const order = process.env.FALLBACK_ORDER?.split(",").map((id) => id.trim());
  const built = configuredProviders(userKeys);
  // The student's own entries go last: the built-in list is known to work.
  const available = [...built, ...customProviders(custom)];
  if (!order?.length) return available;
  const ranked = order
    .map((id) => available.find((provider) => provider.id === id))
    .filter((provider): provider is Provider => Boolean(provider));
  // FALLBACK_ORDER names preferences, not the whole world; keep the rest.
  return [...ranked, ...available.filter((p) => !ranked.includes(p))];
}

/** Flattens our message shape into plain text, which is all these accept. */
function toChatMessages(system: string, messages: AiMessage[]) {
  return [
    { role: "system", content: system },
    ...messages.map((message) => ({
      role: message.role === "model" ? ("assistant" as const) : ("user" as const),
      content: message.parts
        .map((part) => ("text" in part ? part.text : ""))
        .filter(Boolean)
        .join("\n\n"),
    })),
  ].filter((message) => message.content.trim());
}

const baseUrlFor = (provider: Provider) =>
  (provider.id.includes(":")
    ? undefined
    : process.env[`${provider.id.toUpperCase()}_BASE_URL`]?.trim()) || provider.baseUrl;

/** Models that exist but cannot answer a chat turn. */
const NOT_CHAT = /whisper|tts|embed|guard|moderation|rerank|ocr|image|vision-only|sora|dall/i;

/**
 * Parameter count in billions, read off the model id.
 *
 * This is the one signal every provider encodes the same way, and it is what
 * separates a model that can write a literature review from one that cannot.
 * An id with no size is assumed mid-sized rather than sorted last, since the
 * strong hosted models increasingly do not put a size in the name.
 */
function sizeOf(id: string): number {
  const moe = /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b(?![a-z\d])/i.exec(id);
  if (moe) return Number(moe[1]) * Number(moe[2]);
  const sizes = [...id.matchAll(/(\d+(?:\.\d+)?)\s*b(?![a-z\d])/gi)];
  const last = sizes[sizes.length - 1];
  return last ? Number(last[1]) : 40;
}

/** Families known to follow instructions well, as a tie-break only. */
const FAMILY = [/llama/i, /qwen/i, /deepseek/i, /mistral|mixtral/i, /gemma/i, /gpt-oss/i];

const familyOf = (id: string) => {
  const index = FAMILY.findIndex((pattern) => pattern.test(id));
  return index === -1 ? FAMILY.length : index;
};

/** Bigger first, then a known family, then stable ordering by name. */
const betterModel = (a: string, b: string) =>
  sizeOf(b) - sizeOf(a) || familyOf(a) - familyOf(b) || a.localeCompare(b);

/**
 * A model id that worked, remembered per provider. Providers rename and
 * retire models without warning, so a hard-coded id is a slow leak; this
 * keeps the discovered replacement for the life of the server instance.
 */
const discovered = new Map<string, string>();

/** Asks a provider what it actually serves right now. */
export async function listModels(
  provider: Provider,
  key: string,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  const response = await fetch(`${baseUrlFor(provider)}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal,
  });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => ({}))) as { data?: ModelInfo[] };
  return body.data ?? [];
}

/**
 * Picks a model the provider will accept, given that the configured one was
 * rejected. Returns undefined when nothing usable is on offer, which is a
 * real answer: the key works but the account has no chat model.
 */
export async function discoverModel(
  provider: Provider,
  key: string,
  rejected: string[],
  signal?: AbortSignal,
): Promise<string | undefined> {
  const models = await listModels(provider, key, signal).catch(() => []);
  const usable = models
    .filter((model) => model.id && !NOT_CHAT.test(model.id))
    .filter((model) => !rejected.includes(model.id))
    .filter((model) => (provider.usable ? provider.usable(model) : true))
    .sort((a, b) => betterModel(a.id, b.id));
  return usable[0]?.id;
}

/**
 * True when the provider rejected the model rather than the key or the
 * request — the case worth retrying with a different model. Providers
 * disagree on the status code, so the message matters as much as the code.
 */
function isModelProblem(status: number | undefined, detail: string): boolean {
  if (status === 404) return true;
  if (status !== 400 && status !== 422) return false;
  return /model|decommission|unavailable|not found|does not exist/i.test(detail);
}

/** True when a request can be served by a text-only fallback. */
export function isTextOnly(messages: AiMessage[]): boolean {
  return messages.every((message) =>
    message.parts.every((part) => "text" in part),
  );
}

export interface FallbackResult {
  text: string;
  sources: Source[];
}

/** Raised when a provider answers 200 but says nothing usable. */
export class EmptyReplyError extends Error {
  readonly key = "error.emptyReply";
  constructor(public model: string) {
    super(`empty completion from ${model}`);
    this.name = "EmptyReplyError";
  }
}

/** One streaming call against a specific model. Throws on any non-2xx. */
async function callProvider(
  provider: Provider,
  model: string,
  key: string,
  system: string,
  messages: AiMessage[],
  onText: (delta: string) => void,
  options: { maxTokens?: number; signal?: AbortSignal; json?: boolean },
): Promise<string> {
  const response = await fetch(`${baseUrlFor(provider)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: toChatMessages(system, messages),
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    const retryAfter = Number(response.headers.get("retry-after"));
    throw Object.assign(new Error(`${provider.id} HTTP ${response.status}: ${detail.slice(0, 160)}`), {
      status: response.status,
      detail: detail.slice(0, 300),
      // The provider's own answer to "when should I come back".
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      model,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onText(delta);
        }
      } catch {
        // A partial SSE frame; the next chunk completes it.
      }
    }
  }

  // A reasoning model given too small a budget spends it all before writing
  // any content, so 200-with-nothing is a model problem, not success.
  if (!text.trim()) throw new EmptyReplyError(model);

  return text;
}

/**
 * Streams one turn from an OpenAI-compatible provider, emitting text as it
 * arrives.
 *
 * Providers rename and retire models constantly, so a rejected model is not
 * treated as a dead end: the provider is asked what it actually serves and
 * the turn is retried once against that. Nothing is emitted to the caller
 * until a model answers, so a retry never lands on top of half an answer.
 */
export async function streamFromProvider(
  provider: Provider,
  system: string,
  messages: AiMessage[],
  onText: (delta: string) => void,
  options: {
    maxTokens?: number;
    signal?: AbortSignal;
    json?: boolean;
    userKeys?: UserKeys;
  } = {},
): Promise<string> {
  const key = keyFor(provider, options.userKeys)!;
  const configured =
    (provider.envModel ? process.env[provider.envModel]?.trim() : "") || provider.defaultModel;
  const first = discovered.get(provider.id) ?? configured;
  // No model to start from: ask before calling rather than send an empty one.
  if (!first) {
    const found = await discoverModel(provider, key, [], options.signal);
    if (!found) throw Object.assign(new Error(`${provider.id}: no usable model`), { status: 404 });
    discovered.set(provider.id, found);
    return callProvider(provider, found, key, system, messages, onText, options);
  }

  // Text goes to the caller as it arrives, so the answer still streams. The
  // flag is what makes a retry safe: every failure worth retrying — a
  // rejected model, an empty reply — happens before any text exists, so once
  // a token has been emitted the turn is committed to this model.
  let emitted = false;
  const send = (delta: string) => {
    emitted = true;
    onText(delta);
  };

  try {
    return await callProvider(provider, first, key, system, messages, send, options);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const detail = String((err as { detail?: string })?.detail ?? (err as Error)?.message ?? "");
    if (emitted || options.signal?.aborted) throw err;
    if (!(err instanceof EmptyReplyError) && !isModelProblem(status, detail)) throw err;

    const replacement = await discoverModel(provider, key, [first], options.signal);
    if (!replacement) throw err;

    console.warn(`[study-buddy] ${provider.id}: ${first} rejected, using ${replacement}`);
    const text = await callProvider(
      provider, replacement, key, system, messages, send, options,
    );
    // Only remembered once it has actually produced an answer.
    discovered.set(provider.id, replacement);
    return text;
  }
}

/** The model this provider will be asked for next, for diagnostics. */
export const currentModel = (provider: Provider): string =>
  discovered.get(provider.id) ??
  (provider.envModel ? process.env[provider.envModel]?.trim() : undefined) ??
  provider.defaultModel;
