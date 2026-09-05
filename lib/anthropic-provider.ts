import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiMessage } from "./types";
import { EmptyReplyError, type Provider, type UserKeys, keyFor } from "./providers";

/**
 * Claude speaks its own Messages API rather than the OpenAI chat shape every
 * other backup here uses, so it gets its own adapter instead of being forced
 * through the shared one.
 *
 * Note for whoever reads this next: Anthropic has no free tier. This provider
 * is here because the student asked for it, and it is the one in the rotation
 * that costs money per request.
 */
export const ANTHROPIC_ID = "anthropic";

/** Flattens our parts into the text Claude expects, dropping file references. */
function toMessages(messages: AiMessage[]): Anthropic.MessageParam[] {
  return messages
    .map((message) => ({
      role: message.role === "model" ? ("assistant" as const) : ("user" as const),
      content: message.parts
        .map((part) => ("text" in part ? part.text : ""))
        .filter(Boolean)
        .join("\n\n"),
    }))
    .filter((message) => message.content.trim());
}

/** A model this key can call, when the configured one is refused. */
async function discoverModel(client: Anthropic, rejected: string[]): Promise<string | undefined> {
  const listed = await client.models.list().catch(() => null);
  if (!listed) return undefined;
  const ids = listed.data
    .map((model) => model.id)
    .filter((id) => id && !rejected.includes(id));
  // Prefer the cheaper tiers for a backup that bills per token.
  return (
    ids.find((id) => /haiku/i.test(id)) ??
    ids.find((id) => /sonnet/i.test(id)) ??
    ids[0]
  );
}

const modelCache = new Map<string, string>();

export function anthropicModel(provider: Provider): string {
  return (
    modelCache.get(provider.id) ??
    process.env[provider.envModel]?.trim() ??
    provider.defaultModel
  );
}

/** True when Claude refused the model rather than the key or the request. */
const isModelProblem = (err: unknown) => {
  const status = (err as { status?: number })?.status;
  return status === 404 || /model/i.test(String((err as Error)?.message ?? ""));
};

export async function streamFromAnthropic(
  provider: Provider,
  system: string,
  messages: AiMessage[],
  onText: (delta: string) => void,
  options: { maxTokens?: number; signal?: AbortSignal; userKeys?: UserKeys } = {},
): Promise<string> {
  const apiKey = keyFor(provider, options.userKeys)!;
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim();
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });

  const run = async (model: string): Promise<string> => {
    let text = "";
    // `thinking` is deliberately not sent: Claude Opus 5 runs adaptive
    // thinking when it is omitted, while the cheaper models reject the
    // adaptive form — omitting it is the one setting correct for both.
    const stream = client.messages.stream(
      {
        model,
        max_tokens: Math.min(options.maxTokens ?? 8192, 32000),
        system,
        messages: toMessages(messages),
      },
      { signal: options.signal },
    );

    stream.on("text", (delta) => {
      text += delta;
      onText(delta);
    });

    const final = await stream.finalMessage();
    // A safety decline is a real answer from the API, not a transport error.
    if (final.stop_reason === "refusal") {
      throw Object.assign(new Error("claude declined this request"), {
        key: "error.refused",
        status: 200,
      });
    }
    if (!text.trim()) throw new EmptyReplyError(model);
    return text;
  };

  const first = anthropicModel(provider);
  try {
    return await run(first);
  } catch (err) {
    if (options.signal?.aborted || !isModelProblem(err)) throw normalize(err);
    const replacement = await discoverModel(client, [first]);
    if (!replacement) throw normalize(err);
    const text = await run(replacement);
    modelCache.set(provider.id, replacement);
    console.warn(`[study-buddy] anthropic: ${first} refused, using ${replacement}`);
    return text;
  }
}

/** Surfaces status and Retry-After so the cooldown can use the real numbers. */
function normalize(err: unknown): unknown {
  if (err instanceof Anthropic.APIError) {
    const retry = Number(err.headers?.get?.("retry-after"));
    return Object.assign(new Error(`anthropic HTTP ${err.status}: ${err.message}`), {
      status: err.status,
      detail: String(err.message).slice(0, 300),
      retryAfter: Number.isFinite(retry) && retry > 0 ? retry : undefined,
    });
  }
  return err;
}
