import { EFFORT, MODEL, errorKey, getClient } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Setup check: proves the configured key can actually reach Gemini. The home
 * page calls this so a misconfigured deploy says so instead of failing later
 * inside a feature the student is trying to use.
 */
export async function GET() {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    return Response.json({ ok: false, reason: "error.noKey" });
  }
  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
      config: { maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 0 } },
    });
    return Response.json({ ok: true, model: MODEL, effort: EFFORT, reply: response.text });
  } catch (err) {
    console.error("[study-buddy] health check failed:", err);
    return Response.json({
      ok: false,
      reason: errorKey(err),
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
