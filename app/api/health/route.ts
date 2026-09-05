import { EFFORT, MODEL, MODEL_FALLBACKS, errorKey, geminiKey, getClient } from "@/lib/ai";
import { configuredProviders, currentModel, streamFromProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** A model is spent for the day rather than broken. */
const isExhausted = (err: unknown) =>
  (err as { status?: number })?.status === 429 ||
  /quota|RESOURCE_EXHAUSTED|rate limit/i.test(String((err as Error)?.message ?? ""));

/**
 * Setup check: proves a key can actually reach Gemini. The home page calls
 * this so a misconfigured deploy says so instead of failing later inside a
 * feature the student is trying to use.
 *
 * It walks the sibling models exactly as the real request path does, because
 * Gemini counts free quota per model: reporting the primary as broken while
 * the app is happily serving from a sibling would be a lie.
 */
async function check(keys?: Record<string, string>) {
  const hasKey = geminiKey(keys);
  const backups = configuredProviders(keys).map((provider) => provider.label);

  if (!hasKey) {
    // A backup provider alone still runs chat, summaries and drafts; only
    // uploads and web search actually need Gemini.
    return Response.json({
      ok: false,
      reason: backups.length ? "error.noKeyPartial" : "error.noKey",
      fallbacks: backups,
    });
  }

  const client = getClient(keys);
  let lastError: unknown;

  for (const model of [MODEL, ...MODEL_FALLBACKS]) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
        config: { maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 0 } },
      });
      return Response.json({
        ok: true,
        model,
        // Says so plainly when the primary is spent but the app still works.
        degraded: model !== MODEL,
        effort: EFFORT,
        reply: response.text,
        fallbacks: backups,
      });
    } catch (err) {
      lastError = err;
      if (!isExhausted(err)) break;
    }
  }

  console.error("[study-buddy] health check failed:", lastError);
  return Response.json({
    ok: false,
    reason: errorKey(lastError),
    detail: lastError instanceof Error ? lastError.message : String(lastError),
    fallbacks: backups,
  });
}

/**
 * Sends one real completion to each backup provider, so a key the student
 * just pasted is confirmed against the API rather than merely looking
 * present. Reports per-provider rather than failing the whole check.
 *
 * The budget is deliberately generous: a reasoning model spends tokens
 * thinking before it writes anything, and a probe that starves it would
 * report a perfectly good key as broken.
 */
async function probeBackups(keys?: Record<string, string>) {
  const providers = configuredProviders(keys);
  return Promise.all(
    providers.map(async (provider) => {
      try {
        const text = await streamFromProvider(
          provider,
          "Reply with the single word: OK.",
          [{ role: "user", parts: [{ text: "Say OK." }] }],
          () => {},
          { maxTokens: 512, userKeys: keys },
        );
        return {
          id: provider.id,
          label: provider.label,
          ok: true,
          model: currentModel(provider),
          reply: text.trim().slice(0, 40),
        };
      } catch (err) {
        const status = (err as { status?: number })?.status;
        const key = (err as { key?: string })?.key;
        return {
          id: provider.id,
          label: provider.label,
          ok: false,
          model: currentModel(provider),
          // 401/403 is the case worth naming: the key itself was rejected.
          reason: key ?? (status === 401 || status === 403 ? "error.noKey" : "error.generic"),
          detail: `HTTP ${status ?? "?"} ${(err as { detail?: string })?.detail ?? ""}`.trim(),
        };
      }
    }),
  );
}

export async function GET() {
  return check();
}

export async function POST(request: Request) {
  const { keys, probe } = (await request.json().catch(() => ({}))) as {
    keys?: Record<string, string>;
    probe?: boolean;
  };
  if (!probe) return check(keys);

  const [gemini, backups] = await Promise.all([
    check(keys).then((response) => response.json()),
    probeBackups(keys),
  ]);
  return Response.json({ ...gemini, probed: backups });
}
