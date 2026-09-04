import { EFFORT, MODEL, errorKey, getClient } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Setup check: proves the configured key can actually reach Claude. The home
 * page calls this so a misconfigured deploy says so instead of failing later
 * inside a feature the student is trying to use.
 */
export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, reason: "error.noKey" }, { status: 200 });
  }
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with the single word: OK" }],
    });
    return Response.json({ ok: true, model: response.model, effort: EFFORT });
  } catch (err) {
    console.error("[study-buddy] health check failed:", err);
    return Response.json({
      ok: false,
      reason: errorKey(err),
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
