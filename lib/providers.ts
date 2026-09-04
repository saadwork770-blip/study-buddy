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
}

export const PROVIDERS: Provider[] = [
  {
    id: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    envModel: "GROQ_MODEL",
    free: "Free tier, no card. Very fast; ~30 requests/minute.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
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

/** A provider is usable if the server has a key for it, or the student does. */
export const keyFor = (provider: Provider, userKeys?: UserKeys): string | undefined =>
  userKeys?.[provider.id]?.trim() || process.env[provider.envKey]?.trim();

export const configuredProviders = (userKeys?: UserKeys): Provider[] =>
  PROVIDERS.filter((provider) => Boolean(keyFor(provider, userKeys)));

/** Order to try fallbacks in; FALLBACK_ORDER overrides it. */
export function fallbackChain(userKeys?: UserKeys): Provider[] {
  const order = process.env.FALLBACK_ORDER?.split(",").map((id) => id.trim());
  const available = configuredProviders(userKeys);
  if (!order?.length) return available;
  return order
    .map((id) => available.find((provider) => provider.id === id))
    .filter((provider): provider is Provider => Boolean(provider));
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

/**
 * Streams one turn from an OpenAI-compatible provider, emitting text as it
 * arrives. Throws on any non-2xx so the caller can try the next provider.
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
  const model = process.env[provider.envModel]?.trim() || provider.defaultModel;
  // <ID>_BASE_URL redirects a provider at a proxy, a self-hosted gateway, or a
  // stub during testing.
  const baseUrl =
    process.env[`${provider.id.toUpperCase()}_BASE_URL`]?.trim() || provider.baseUrl;

  const response = await fetch(`${baseUrl}/chat/completions`, {
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
    throw Object.assign(new Error(`${provider.id} HTTP ${response.status}`), {
      status: response.status,
      detail: detail.slice(0, 300),
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

  return text;
}
