import type Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { ndjsonStream, streamTurn } from "@/lib/claude";
import { ROLE, summaryStylePrompt, systemPrompt } from "@/lib/prompts";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 600;

const MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

class InputError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

/**
 * Turns an uploaded file into content blocks. PDFs and images go to Claude as
 * native document/image blocks; Word files are converted to text locally.
 */
async function blocksForFile(file: File): Promise<Anthropic.ContentBlockParam[]> {
  if (file.size > MAX_BYTES) throw new InputError("error.fileTooBig");

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type || "";

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
        title: file.name,
      },
    ];
  }

  if (IMAGE_TYPES.includes(type)) {
    return [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: type as "image/png",
          data: buffer.toString("base64"),
        },
      },
    ];
  }

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    if (!value.trim()) throw new InputError("error.fileType");
    return [{ type: "text", text: `--- ${file.name} ---\n${value}` }];
  }

  if (
    type.startsWith("text/") ||
    /\.(txt|md|markdown|csv|tsv|json|rtf|tex|html?)$/.test(name)
  ) {
    return [
      { type: "text", text: `--- ${file.name} ---\n${buffer.toString("utf8")}` },
    ];
  }

  throw new InputError("error.fileType");
}

export async function POST(request: Request) {
  const form = await request.formData();
  const lang: Lang = form.get("lang") === "en" ? "en" : "ar";
  const style = String(form.get("style") ?? "brief");
  const text = String(form.get("text") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const file = form.get("file");

  const system = [
    systemPrompt(lang, ROLE.summarize),
    "",
    summaryStylePrompt(style),
    "",
    "Work only from the material the student supplied. If something is unclear or missing from it, say so rather than filling the gap from memory.",
  ].join("\n");

  return ndjsonStream(async (emit) => {
    const content: Anthropic.ContentBlockParam[] = [];

    if (file instanceof File && file.size > 0) {
      content.push(...(await blocksForFile(file)));
    }
    if (text) {
      content.push({ type: "text", text: `--- pasted text ---\n${text}` });
    }
    if (!content.length) return;

    content.push({
      type: "text",
      text: [
        title ? `The student calls this source: ${title}.` : "",
        "Summarise the material above following the required structure.",
      ]
        .filter(Boolean)
        .join(" "),
    });

    await streamTurn(emit, {
      system,
      messages: [{ role: "user", content }],
      maxTokens: 32000,
      statusLabels: { thinking: "out.thinking" },
      signal: request.signal,
    });
  });
}
