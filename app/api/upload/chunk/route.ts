export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Relays one chunk of a resumable upload to the Gemini Files API.
 *
 * The browser cannot POST to Google directly — Safari in particular refuses
 * the cross-origin upload — so the bytes come here first. Chunks are kept
 * under Vercel's ~4.5 MB body limit by the client, which is why a file of any
 * size still gets through without the browser ever making a cross-origin
 * request.
 */
export async function POST(request: Request) {
  const uploadUrl = request.headers.get("x-upload-url");
  const offset = request.headers.get("x-upload-offset") ?? "0";
  const last = request.headers.get("x-upload-last") === "1";

  if (!uploadUrl?.startsWith("https://")) {
    return Response.json({ error: "error.generic", detail: "missing upload url" }, { status: 400 });
  }

  const body = await request.arrayBuffer();

  try {
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Command": last ? "upload, finalize" : "upload",
        "X-Goog-Upload-Offset": offset,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.byteLength),
      },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      console.error("[study-buddy] chunk upload failed:", response.status, text.slice(0, 300));
      return Response.json(
        { error: "error.upload", detail: `Google HTTP ${response.status}: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }

    // Only the finalising chunk returns the file resource.
    if (!last) return Response.json({ ok: true });
    try {
      return Response.json(JSON.parse(text));
    } catch {
      return Response.json(
        { error: "error.upload", detail: `unexpected reply: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[study-buddy] chunk relay failed:", err);
    return Response.json(
      { error: "error.upload", detail: `relay failed: ${String(err).slice(0, 200)}` },
      { status: 502 },
    );
  }
}
