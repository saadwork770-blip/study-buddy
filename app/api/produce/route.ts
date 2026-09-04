import { attachmentParts, ndjsonStream, streamTurn } from "@/lib/ai";
import { deliverableLength, deliverableSystemPrompt } from "@/lib/prompts";
import { type ExpertId, withExpert } from "@/lib/experts";
import type { AiPart, Attachment } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { type CiteStyle, type Reference, citationInstruction } from "@/lib/citations";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  brief: string;
  kind?: string;
  length?: string;
  course?: string;
  lang: Lang;
  web?: boolean;
  expert?: ExpertId;
  attachments?: Attachment[];
  citeStyle?: CiteStyle;
  references?: Reference[];
  keys?: Record<string, string>;
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const lang: Lang = body.lang === "en" ? "en" : "ar";
  const brief = (body.brief ?? "").trim();
  const kind = body.kind ?? "report";
  const useWeb = body.web === true;

  const system = withExpert(
    [
      deliverableSystemPrompt(lang, kind),
      "",
      deliverableLength(body.length ?? "standard"),
      "",
      useWeb
        ? "You have Google Search. Use it to ground factual claims, and cite what you actually read."
        : "You have no web access. Use the attached material and your own knowledge; mark anything needing a source as [citation needed] rather than inventing one.",
      "",
      "",
      citationInstruction(body.citeStyle ?? "apa7", body.references ?? [], lang),
      "",
      "Output the document itself as Markdown, starting with its title as a level-1 heading. Nothing before it, nothing after it.",
    ].join("\n"),
    body.expert ?? null,
  );

  const parts: AiPart[] = [...attachmentParts(body.attachments)];
  parts.push({
    text: [
      body.course?.trim() ? `Course: ${body.course.trim()}` : "",
      body.attachments?.length
        ? "The material above is the source you must work from."
        : "",
      `The assignment:\n${brief}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  return ndjsonStream(async (emit) => {
    if (!brief && !body.attachments?.length) return;
    const { sources } = await streamTurn(emit, {
      system,
      messages: [{ role: "user", parts }],
      maxTokens: 32768,
      search: useWeb,
      statusLabels: { thinking: "out.thinking", searching: "research.searching" },
      signal: request.signal,
      keys: body.keys,
    });
    if (sources.length) emit({ type: "sources", sources });
  });
}
