/**
 * The same rule the server enforces, applied in the browser so a mistyped
 * URL is caught while typing rather than as a failed request. The server
 * check is the one that matters; this one is only courtesy.
 */
export function safeBaseUrlClient(raw: string): boolean {
  let url: URL;
  try {
    url = new URL((raw ?? "").trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return !(
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    /^\[?[0-9a-f:]*\]?$/i.test(host) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  );
}
