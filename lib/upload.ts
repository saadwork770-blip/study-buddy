"use client";

import JSZip from "jszip";
import mammoth from "mammoth/mammoth.browser";
import type { Attachment } from "./types";

/**
 * The only types worth sending to the Files API. Everything else is read as
 * text in the browser, which is smaller and has fewer ways to fail.
 */
const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/**
 * iOS Safari hands back files with an empty `type` when they come from the
 * Files app or iCloud Drive. Sending "application/octet-stream" in that case
 * makes the Files API reject the upload, so resolve the type from the name.
 */
function resolveMime(file: File): string | null {
  const fromName = BY_EXTENSION[extensionOf(file.name)];
  if (fromName) return fromName;
  if (file.type && Object.values(BY_EXTENSION).includes(file.type)) return file.type;
  return null;
}

/** An Error carrying both a translation key and the raw cause, for display. */
export function detailed(key: string, detail: string): Error & { detail: string } {
  return Object.assign(new Error(key), { detail });
}

const isNative = (file: File) => resolveMime(file) !== null;

/**
 * Sends the file straight to Google's Files API using a session minted by our
 * server, so nothing large passes through the app and no size cap applies.
 */
async function toGoogle(file: File, onProgress?: (pct: number) => void): Promise<Attachment> {
  const mimeType = resolveMime(file);
  if (!mimeType) throw detailed("error.fileType", `unrecognised type for ${file.name}`);

  const session = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, mimeType, size: file.size }),
  });
  const body = (await session.json().catch(() => ({}))) as {
    uploadUrl?: string;
    error?: string;
    detail?: string;
  };
  if (!session.ok || !body.uploadUrl) {
    throw detailed(body.error ?? "error.generic", body.detail ?? `session HTTP ${session.status}`);
  }

  const uploaded = await new Promise<{
    file?: { uri?: string; mimeType?: string; name?: string; state?: string };
  }>(
    (resolve, reject) => {
      // XHR rather than fetch, because only XHR reports upload progress.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", body.uploadUrl!);
      xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");
      xhr.setRequestHeader("X-Goog-Upload-Offset", "0");
      xhr.setRequestHeader("Content-Type", mimeType);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(detailed("error.generic", `bad JSON from Google: ${xhr.responseText.slice(0, 300)}`));
          }
        } else {
          reject(
            detailed(
              xhr.status === 403 || xhr.status === 401 ? "error.noKey" : "error.upload",
              `Google returned HTTP ${xhr.status}: ${xhr.responseText.slice(0, 300)}`,
            ),
          );
        }
      };
      // A network-level failure here is usually CORS or connectivity.
      xhr.onerror = () =>
        reject(detailed("error.upload", "the browser could not reach Google (network or CORS)"));
      xhr.send(file);
    },
  );

  const uri = uploaded.file?.uri;
  if (!uri) throw new Error("error.generic");

  // A PDF is usually ready at once, but not always; using it too early fails.
  if (uploaded.file?.state === "PROCESSING" && uploaded.file.name) {
    await waitForActive(uploaded.file.name);
  }

  return {
    name: file.name,
    mimeType: uploaded.file?.mimeType || mimeType,
    size: file.size,
    fileUri: uri,
  };
}

/** Polls until Google finishes processing an uploaded file. */
async function waitForActive(name: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const response = await fetch(`/api/upload?name=${encodeURIComponent(name)}`);
      const { state } = (await response.json()) as { state?: string };
      if (state === "ACTIVE") return;
      if (state === "FAILED") throw new Error("error.fileType");
    } catch (err) {
      if ((err as Error)?.message?.startsWith("error.")) throw err;
    }
  }
  // Still processing after ~30s: let the request try anyway.
}

/** Office XML files are zips; pull the readable text straight out of them. */
async function officeXmlText(file: File, kind: "pptx" | "xlsx"): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const strip = (xml: string) =>
    (xml.match(/<a:t>([^<]*)<\/a:t>|<t[^>]*>([^<]*)<\/t>/g) ?? [])
      .map((tag) => tag.replace(/<[^>]+>/g, ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  if (kind === "pptx") {
    const numbered = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => numbered(a) - numbered(b));
    const notes = Object.keys(zip.files).filter((n) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n),
    );

    const out: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const body = strip(await zip.files[slides[i]].async("string"));
      const noteFile = notes.find((n) => numbered(n) === numbered(slides[i]));
      const note = noteFile ? strip(await zip.files[noteFile].async("string")) : "";
      out.push(`--- Slide ${i + 1} ---\n${body}${note ? `\n[Speaker notes] ${note}` : ""}`);
    }
    return out.join("\n\n");
  }

  // xlsx: shared strings carry most cell text
  const parts: string[] = [];
  const shared = zip.files["xl/sharedStrings.xml"];
  if (shared) parts.push(strip(await shared.async("string")));
  const sheets = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  for (const name of sheets) parts.push(strip(await zip.files[name].async("string")));
  return parts.filter(Boolean).join("\n\n");
}

/** Reads a file the API cannot host (.docx, .pptx, .xlsx, other text) into plain text here. */
async function toText(file: File): Promise<Attachment> {
  const name = file.name.toLowerCase();
  let text: string;

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = value;
  } else if (name.endsWith(".pptx")) {
    text = await officeXmlText(file, "pptx");
  } else if (name.endsWith(".xlsx")) {
    text = await officeXmlText(file, "xlsx");
  } else if (/\.(doc|ppt|xls)$/.test(name)) {
    // The pre-2007 binary formats are not zip-based and cannot be read here.
    throw detailed("error.fileOld", `${file.name} is a pre-2007 binary format`);
  } else if (/\.(txt|md|markdown|csv|tsv|json|html?|tex|rtf|log|yml|yaml)$/.test(name)) {
    text = await file.text();
  } else {
    throw detailed("error.fileType", `unsupported file: ${file.name}`);
  }

  if (!text.trim()) throw detailed("error.fileEmpty", `no text found in ${file.name}`);
  return { name: file.name, mimeType: "text/plain", size: file.size, text };
}

export async function uploadAttachment(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Attachment> {
  if (isNative(file)) return toGoogle(file, onProgress);
  return toText(file);
}

export const ACCEPT = [
  ".pdf",
  ".docx", ".pptx", ".xlsx",
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".html", ".htm", ".tex", ".rtf",
  ".png", ".jpg", ".jpeg", ".webp", ".heic",
  "image/*",
].join(",");
