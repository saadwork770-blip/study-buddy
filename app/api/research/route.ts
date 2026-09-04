import {
  WEB_SEARCH_TOOL,
  extractSources,
  ndjsonStream,
  streamTurn,
} from "@/lib/claude";
import { ROLE, researchDepthPrompt, systemPrompt } from "@/lib/prompts";
import { type ExpertId, withExpert } from "@/lib/experts";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 600;

interface Body {
  question: string;
  field?: string;
  depth?: string;
  web?: boolean;
  lang: Lang;
  expert?: ExpertId;
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
        ? "Use the web search tool before answering. Cite a source inline as [n] and rely only on what you actually read; if the evidence is thin, say so."
        : "You have no web access in this run. Work from what you know, and mark clearly anything the student must verify against a real source. Do not fabricate citations.",
    ].join("\n"),
    // The literature-review specialist is the natural default for this page.
    body.expert === undefined ? "research-synthesist" : body.expert,
  );

  const prompt = [
    body.field?.trim() ? `Field of study: ${body.field.trim()}` : "",
    `Research question / topic: ${question}`,
  ]
    .filter(Boolean)
    .join("\n");

  return ndjsonStream(async (emit) => {
    if (!question) return;
    const message = await streamTurn(emit, {
      system,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 64000,
      tools: useWeb ? [WEB_SEARCH_TOOL] : undefined,
      statusLabels: {
        thinking: "out.thinking",
        searching: "research.searching",
      },
      signal: request.signal,
    });
    const sources = extractSources(message);
    if (sources.length) emit({ type: "sources", sources });
  });
}
