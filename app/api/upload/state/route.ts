import { MissingKeyError, errorKey, geminiKey } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * Reports whether an uploaded file has finished processing. A file referenced
 * while still PROCESSING is rejected by generateContent, so the browser waits
 * on this before using it.
 *
 * It is a POST rather than a GET because the student's own Gemini key may be
 * the only one available, and a key does not belong in a URL.
 */
export async function POST(request: Request) {
  try {
    const { name, keys } = (await request.json()) as {
      name?: string;
      keys?: Record<string, string>;
    };

    const key = geminiKey(keys);
    if (!key) throw new MissingKeyError();

    if (!name?.startsWith("files/")) {
      return Response.json({ error: "error.generic" }, { status: 400 });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}`,
      { headers: { "x-goog-api-key": key } },
    );
    if (!response.ok) return Response.json({ state: "FAILED" });

    const file = (await response.json()) as { state?: string };
    return Response.json({ state: file.state ?? "ACTIVE" });
  } catch (err) {
    console.error("[study-buddy] upload state check failed:", err);
    return Response.json({ error: errorKey(err) }, { status: 500 });
  }
}
