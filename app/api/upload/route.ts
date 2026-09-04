import { MissingKeyError, errorKey } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * Reports whether an uploaded file has finished processing. A file referenced
 * while still PROCESSING is rejected by generateContent, so the browser waits
 * on this before using it.
 */
export async function GET(request: Request) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return Response.json({ error: "error.noKey" }, { status: 500 });

  const name = new URL(request.url).searchParams.get("name");
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
}

/**
 * Mints a resumable-upload session against the Gemini Files API and hands the
 * session URL to the browser, which then sends the bytes straight to Google.
 *
 * The file never passes through this server, so Vercel's ~4.5 MB request-body
 * limit does not apply. The session URL is created with the secret key and is
 * self-authenticating afterwards, so the key is never exposed to the browser.
 */
export async function POST(request: Request) {
  try {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) throw new MissingKeyError();

    const { name, mimeType, size } = (await request.json()) as {
      name: string;
      mimeType: string;
      size: number;
    };

    if (!mimeType || !Number.isFinite(size) || size <= 0) {
      return Response.json({ error: "error.fileType" }, { status: 400 });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/upload/v1beta/files",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(size),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: name?.slice(0, 120) || "upload" } }),
      },
    );

    const uploadUrl = response.headers.get("x-goog-upload-url");
    if (!response.ok || !uploadUrl) {
      const detail = await response.text();
      console.error("[study-buddy] upload session failed:", response.status, detail);
      return Response.json(
        {
          error:
            response.status === 401 || response.status === 403
              ? "error.noKey"
              : "error.upload",
          detail: `Files API HTTP ${response.status}: ${detail.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    return Response.json({ uploadUrl });
  } catch (err) {
    console.error("[study-buddy] upload route failed:", err);
    return Response.json({ error: errorKey(err) }, { status: 500 });
  }
}
