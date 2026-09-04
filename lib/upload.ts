"use client";

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

  const uploaded = await new Promise<{ file?: { uri?: string; mimeType?: string } }>(
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

  return {
    name: file.name,
    mimeType: uploaded.file?.mimeType || file.type || "application/pdf",
    size: file.size,
    fileUri: uri,
  };
}

/** Reads a file the API cannot host (.docx, other text) into plain text here. */
async function toText(file: File): Promise<Attachment> {
  const name = file.name.toLowerCase();
  let text: string;

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = value;
  } else if (name.endsWith(".doc")) {
    throw new Error("error.fileDoc");
  } else {
    text = await file.text();
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

export const ACCEPT =
  ".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.png,.jpg,.jpeg,.webp,image/*";
