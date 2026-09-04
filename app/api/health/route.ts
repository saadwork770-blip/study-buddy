import { EFFORT, MODEL, errorKey, getClient } from "@/lib/ai";
import { configuredProviders, streamFromProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Setup check: proves a key can actually reach Gemini. The home page calls
 * this so a misconfigured deploy says so instead of failing later inside a
 * feature the student is trying to use.
 *
 * It is a POST because the working key may be the one the student pasted into
 * the settings page, which lives in their browser and travels in the body.
 */
async function check(keys?: Record<string, string>) {
  const hasKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || keys?.gemini?.trim();
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

  try {
    const response = await getClient(keys).models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
      config: { maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 0 } },
    });
    return Response.json({
      ok: true,
      model: MODEL,
      effort: EFFORT,
      reply: response.text,
      fallbacks: backups,
    });
  } catch (err) {
    console.error("[study-buddy] health check failed:", err);
    return Response.json({
      ok: false,
      reason: errorKey(err),
      detail: err instanceof Error ? err.message : String(err),
      fallbacks: backups,
    });
  }
}

export async function GET() {
  return check();
}

/**
 * Sends one tiny completion to each backup provider, so a key the student
 * just pasted is confirmed against the real API rather than merely looking
 * present. Reports per-provider rather than failing the whole check.
 */
async function probeBackups(keys?: Record<string, string>) {
  const providers = configuredProviders(keys);
  return Promise.all(
    providers.map(async (provider) => {
      try {
        const text = await streamFromProvider(
          provider,
          "Reply with the single word: OK",
          [{ role: "user", parts: [{ text: "OK" }] }],
          () => {},
          { maxTokens: 16, userKeys: keys },
        );
        return { id: provider.id, label: provider.label, ok: Boolean(text.trim()) };
      } catch (err) {
        const status = (err as { status?: number })?.status;
        return {
          id: provider.id,
          label: provider.label,
          ok: false,
          // 401/403 is the case worth naming: the key itself was rejected.
          reason: status === 401 || status === 403 ? "error.noKey" : "error.generic",
          detail: `HTTP ${status ?? "?"} ${(err as { detail?: string })?.detail ?? ""}`.trim(),
        };
      }
    }),
  );
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
