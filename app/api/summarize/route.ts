import { attachmentParts, ndjsonStream, streamTurn } from "@/lib/ai";
import { ROLE, summaryStylePrompt, systemPrompt } from "@/lib/prompts";
import { type ExpertId, withExpert } from "@/lib/experts";
import type { AiPart, Attachment } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  lang: Lang;
  style?: string;
  text?: string;
  expert?: ExpertId;
  attachments?: Attachment[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const lang: Lang = body.lang === "en" ? "en" : "ar";
  const style = body.style ?? "brief";
  const text = (body.text ?? "").trim();

  const system = withExpert(
    [
      systemPrompt(lang, ROLE.summarize),
      "",
      summaryStylePrompt(style),
      "",
      "Work only from the material the student supplied. If something is unclear or missing from it, say so rather than filling the gap from memory.",
    ].join("\n"),
    body.expert ?? null,
  );

  return ndjsonStream(async (emit) => {
    const parts: AiPart[] = [...attachmentParts(body.attachments)];
    if (text) parts.push({ text: `--- pasted text ---\n${text}` });
    if (!parts.length) return;

    parts.push({ text: "Summarise the material above following the required structure." });

    await streamTurn(emit, {
      system,
      messages: [{ role: "user", parts }],
      maxTokens: 8192,
      statusLabels: { thinking: "out.thinking" },
      signal: request.signal,
    });
  });
}
