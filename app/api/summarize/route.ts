import mammoth from "mammoth";
import { ndjsonStream, streamTurn } from "@/lib/ai";
import { ROLE, summaryStylePrompt, systemPrompt } from "@/lib/prompts";
import { type ExpertId, withExpert } from "@/lib/experts";
import type { AiPart } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel's serverless request body caps at ~4.5 MB, so the default is 4.
// Self-hosting (Node server, Docker, Railway) can raise it freely.
const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 4;
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

class InputError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

/**
 * Turns an uploaded file into message parts. Gemini reads PDFs and images
 * natively; Word files are converted to text locally.
 */
async function partsForFile(file: File): Promise<AiPart[]> {
  if (file.size > MAX_BYTES) throw new InputError("error.fileTooBig");

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type || "";

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return [
      { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } },
    ];
  }

  if (IMAGE_TYPES.includes(type)) {
    return [{ inlineData: { mimeType: type, data: buffer.toString("base64") } }];
  }

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    if (!value.trim()) throw new InputError("error.fileType");
    return [{ text: `--- ${file.name} ---\n${value}` }];
  }

  if (
    type.startsWith("text/") ||
    /\.(txt|md|markdown|csv|tsv|json|rtf|tex|html?)$/.test(name)
  ) {
    return [{ text: `--- ${file.name} ---\n${buffer.toString("utf8")}` }];
  }

  throw new InputError("error.fileType");
}

export async function POST(request: Request) {
  const form = await request.formData();
  const lang: Lang = form.get("lang") === "en" ? "en" : "ar";
  const style = String(form.get("style") ?? "brief");
  const text = String(form.get("text") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const expert = (form.get("expert") as ExpertId) || null;
  const file = form.get("file");

  const system = withExpert(
    [
      systemPrompt(lang, ROLE.summarize),
      "",
      summaryStylePrompt(style),
      "",
      "Work only from the material the student supplied. If something is unclear or missing from it, say so rather than filling the gap from memory.",
    ].join("\n"),
    expert,
  );

  return ndjsonStream(async (emit) => {
    const parts: AiPart[] = [];

    if (file instanceof File && file.size > 0) {
      parts.push(...(await partsForFile(file)));
    }
    if (text) parts.push({ text: `--- pasted text ---\n${text}` });
    if (!parts.length) return;

    parts.push({
      text: [
        title ? `The student calls this source: ${title}.` : "",
        "Summarise the material above following the required structure.",
      ]
        .filter(Boolean)
        .join(" "),
    });

    await streamTurn(emit, {
      system,
      messages: [{ role: "user", parts }],
      maxTokens: 8192,
      statusLabels: { thinking: "out.thinking" },
      signal: request.signal,
    });
  });
}
