import { attachmentParts, ndjsonStream, streamTurn } from "@/lib/ai";
import { ROLE, researchDepthPrompt, systemPrompt } from "@/lib/prompts";
import { type ExpertId, withExpert } from "@/lib/experts";
import type { Lang } from "@/lib/i18n";
import type { Cooldowns } from "@/lib/cooldown";
import type { CustomProvider } from "@/lib/providers";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  question: string;
  field?: string;
  depth?: string;
  web?: boolean;
  lang: Lang;
  expert?: ExpertId;
  attachments?: Attachment[];
  keys?: Record<string, string>;
  cooldowns?: Cooldowns;
  custom?: CustomProvider[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const lang: Lang = body.lang === "en" ? "en" : "ar";
  const question = (body.question ?? "").trim();
  const useWeb = body.web !== false;

  const system = withExpert(
    [
      systemPrompt(lang, ROLE.research),
      "",
      researchDepthPrompt(body.depth ?? "standard"),
      "",
      "Structure the brief exactly like this:",
      "1. **Framing the question** — what is really being asked, and how a researcher would narrow it.",
      "2. **Key concepts** — the terms and constructs involved, defined.",
      "3. **What the literature says** — the main strands, with the points of agreement and disagreement.",
      "4. **Gaps and open questions** — where the contribution of a new study could sit.",
      "5. **Suggested sub-questions** — 4-6 researchable questions.",
      "6. **Method notes** — designs, populations, instruments and analyses that suit this question.",
      "7. **Search terms** — Arabic and English keyword strings for databases.",
      "",
      useWeb
        ? "You have Google Search. Search before answering, and rely only on what you actually read; if the evidence is thin, say so."
        : "You have no web access in this run. Work from what you know, and mark clearly anything the student must verify against a real source. Do not fabricate citations.",
    ].join("\n"),
    body.expert === undefined ? "research-synthesist" : body.expert,
  );

  const prompt = [
    body.field?.trim() ? `Field of study: ${body.field.trim()}` : "",
    `Research question / topic: ${question}`,
    body.attachments?.length
      ? "The student attached sources above — read them and weave them into the brief."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return ndjsonStream(async (emit) => {
    if (!question) return;
    const { sources } = await streamTurn(emit, {
      system,
      messages: [
        { role: "user", parts: [...attachmentParts(body.attachments), { text: prompt }] },
      ],
      maxTokens: 16384,
      search: useWeb,
      statusLabels: { thinking: "out.thinking", searching: "research.searching" },
      signal: request.signal,
      keys: body.keys,
      cooldowns: body.cooldowns,
      custom: body.custom,
    });
    if (sources.length) emit({ type: "sources", sources });
  });
}
