"use client";

import JSZip from "jszip";
import mammoth from "mammoth/mammoth.browser";
import type { Attachment } from "./types";
import { keysForRequest } from "./user-keys";

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
    body: JSON.stringify({
      name: file.name,
      mimeType,
      size: file.size,
      keys: keysForRequest(),
    }),
  });
  const body = (await session.json().catch(() => ({}))) as {
    uploadUrl?: string;
    error?: string;
    detail?: string;
  };
  if (!session.ok || !body.uploadUrl) {
    throw detailed(body.error ?? "error.generic", body.detail ?? `session HTTP ${session.status}`);
  }

  // Google's resumable protocol wants every chunk but the last to be a
  // multiple of 256 KB; 3 MB also keeps each request under Vercel's ~4.5 MB cap.
  const CHUNK = 3 * 1024 * 1024;
  let uploaded: { file?: { uri?: string; mimeType?: string; name?: string; state?: string } } = {};

  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, file.size);
    const last = end >= file.size;

    const response = await fetch("/api/upload/chunk", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Upload-Url": body.uploadUrl,
        "X-Upload-Offset": String(offset),
        "X-Upload-Last": last ? "1" : "0",
      },
      body: file.slice(offset, end),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
      file?: { uri?: string; mimeType?: string; name?: string; state?: string };
    };

    if (!response.ok || payload.error) {
      throw detailed(payload.error ?? "error.upload", payload.detail ?? `chunk HTTP ${response.status}`);
    }

    onProgress?.(Math.round((end / file.size) * 100));
    if (last) uploaded = payload;
  }

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
    // Both: Gemini reads the file, everyone else reads this.
    text: mimeType === "application/pdf" ? await pdfText(file) : undefined,
  };
}

/** Polls until Google finishes processing an uploaded file. */
async function waitForActive(name: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const response = await fetch("/api/upload/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, keys: keysForRequest() }),
      });
      const { state } = (await response.json()) as { state?: string };
      if (state === "ACTIVE") return;
      if (state === "FAILED") throw new Error("error.fileType");
    } catch (err) {
      if ((err as Error)?.message?.startsWith("error.")) throw err;
    }
  }
  // Still processing after ~30s: let the request try anyway.
}

/**
 * Reads a PDF's text in the browser, alongside sending the file itself to
 * Google.
 *
 * This is what lets a document survive a provider switch. Gemini reads the
 * real PDF — layout, tables, scanned pages — and does it better. But no
 * backup provider can read a file held by Google, so without a text copy
 * travelling with the request, every turn carrying an attachment was locked
 * to Gemini and failed outright once its quota was spent. That is most of
 * the work this app is actually used for.
 *
 * Failure here is not fatal: the upload still works, the turn simply cannot
 * fall back.
 */
async function pdfText(file: File): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

    const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await task.promise;
    const pages: string[] = [];
    // Enough for the model to work from without holding a whole book in memory.
    const limit = Math.min(doc.numPages, 80);
    for (let n = 1; n <= limit; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) pages.push(line);
    }
    await task.destroy();
    const text = pages.join("\n\n");

    // Some producers store Arabic as visual-order presentation glyphs rather
    // than logical Unicode. That extracts as reversed, unspaced text: useless
    // to a reader, and — worse — plausible enough that a model would
    // summarise the nonsense confidently. Repairing it properly needs the
    // bidi algorithm plus word-boundary reconstruction and still gets it
    // wrong often, so such text is discarded. The turn then stays with
    // Gemini, which reads the real file correctly, and says so if it cannot.
    if (/[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) {
      console.warn("[study-buddy] pdf text is visual-order glyphs; not portable");
      return "";
    }
    return lamAlefLost(text) ? LIGATURE_NOTE + text : text;
  } catch (err) {
    console.warn("[study-buddy] pdf text extraction failed:", err);
    return "";
  }
}

/**
 * Word writes the lam-alef ligature (لا) as one glyph, and its PDF maps that
 * glyph to a single character — so the alef is simply gone from the extracted
 * text: خلال becomes خلل, الغلاف becomes الغلف.
 *
 * "لا" is among the most common sequences in Arabic, so not seeing it once in
 * a page of Arabic means every one of them was lost. The alef cannot be put
 * back without a dictionary, and guessing would corrupt real words — but a
 * reader recovers these from context effortlessly, and so does a model that
 * has been told to expect it. Losing the alef is a long way from the reversed
 * text that gets discarded above; the document is still perfectly usable.
 */
function lamAlefLost(text: string): boolean {
  const letters = (text.match(/[\u0621-\u064A]/g) ?? []).length;
  if (letters < 200) return false;
  const lam = (text.match(/\u0644/g) ?? []).length;
  const lamAlef = (text.match(/\u0644[\u0622\u0623\u0625\u0627]/g) ?? []).length;
  return lam >= 20 && lamAlef === 0;
}

const LIGATURE_NOTE =
  "[ملاحظة عن هذا النص: استُخرج من PDF فقد فيه حرف الألف بعد اللام في تركيب «لا». " +
  "أي كلمة تبدو ناقصة ألفاً بعد لام فاقرأها بالألف: «خلل» = «خلال»، «الغلف» = «الغلاف»، " +
  "«للطلب» = «للطلاب». صحّح ذلك ذهنياً ولا تنقل الكلمات الناقصة كما هي.]\n\n";

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
