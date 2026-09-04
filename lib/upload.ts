"use client";

import JSZip from "jszip";
import mammoth from "mammoth/mammoth.browser";
import type { Attachment } from "./types";

/** Gemini reads these natively; everything else is turned into text here. */
const NATIVE = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/markdown",
  "text/csv",
];

const isNative = (file: File) =>
  NATIVE.includes(file.type) || /\.(pdf|png|jpe?g|webp|txt|md|csv)$/i.test(file.name);

/**
 * Sends the file straight to Google's Files API using a session minted by our
 * server, so nothing large passes through the app and no size cap applies.
 */
async function toGoogle(file: File, onProgress?: (pct: number) => void): Promise<Attachment> {
  const session = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  const body = (await session.json()) as { uploadUrl?: string; error?: string };
  if (!session.ok || !body.uploadUrl) throw new Error(body.error ?? "error.generic");

  const uploaded = await new Promise<{
    file?: { uri?: string; mimeType?: string; name?: string; state?: string };
  }>(
    (resolve, reject) => {
      // XHR rather than fetch, because only XHR reports upload progress.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", body.uploadUrl!);
      xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");
      xhr.setRequestHeader("X-Goog-Upload-Offset", "0");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("error.generic"));
          }
        } else {
          reject(new Error("error.generic"));
        }
      };
      xhr.onerror = () => reject(new Error("error.generic"));
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
    mimeType: uploaded.file?.mimeType || file.type || "application/pdf",
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
    throw new Error("error.fileOld");
  } else if (/\.(txt|md|markdown|csv|tsv|json|html?|tex|rtf)$/.test(name)) {
    text = await file.text();
  } else {
    throw new Error("error.fileType");
  }

  if (!text.trim()) throw new Error("error.fileEmpty");
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
