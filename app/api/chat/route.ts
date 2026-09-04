import type Anthropic from "@anthropic-ai/sdk";
import { ndjsonStream, streamTurn } from "@/lib/claude";
import { ROLE, chatModePrompt, systemPrompt } from "@/lib/prompts";
import { type ExpertId, withExpert } from "@/lib/experts";
import type { ChatMessage } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  messages: ChatMessage[];
  lang: Lang;
  mode?: string;
  subject?: string;
  expert?: ExpertId;
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const lang: Lang = body.lang === "en" ? "en" : "ar";
  const history = (body.messages ?? []).filter((m) => m.content?.trim());

  const system = withExpert(
    [
      systemPrompt(lang, ROLE.chat),
      "",
      chatModePrompt(body.mode ?? "tutor"),
      body.subject?.trim()
        ? `\nThe student is currently studying: ${body.subject.trim()}. Ground your examples in that subject.`
        : "",
    ].join("\n"),
    body.expert ?? null,
  );

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return ndjsonStream(async (emit) => {
    if (!messages.length) return;
    await streamTurn(emit, {
      system,
      messages,
      maxTokens: 32000,
      statusLabels: { thinking: "out.thinking" },
      signal: request.signal,
    });
  });
}
