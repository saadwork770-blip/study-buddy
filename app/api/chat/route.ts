import { attachmentParts, ndjsonStream, streamTurn } from "@/lib/ai";
import { ROLE, chatModePrompt, systemPrompt } from "@/lib/prompts";
import { type ExpertId, withExpert } from "@/lib/experts";
import type { AiMessage, Attachment, ChatMessage } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import type { Cooldowns } from "@/lib/cooldown";
import type { CustomProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  messages: ChatMessage[];
  lang: Lang;
  mode?: string;
  subject?: string;
  expert?: ExpertId;
  attachments?: Attachment[];
  keys?: Record<string, string>;
  cooldowns?: Cooldowns;
  custom?: CustomProvider[];
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

  const messages: AiMessage[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Attachments ride with the latest question so Claude sees them in context.
  const files = attachmentParts(body.attachments);
  const last = messages[messages.length - 1];
  if (files.length && last?.role === "user") last.parts = [...files, ...last.parts];

  return ndjsonStream(async (emit) => {
    if (!messages.length) return;
    await streamTurn(emit, {
      system,
      messages,
      maxTokens: 8192,
      statusLabels: { thinking: "out.thinking" },
      signal: request.signal,
      keys: body.keys,
      cooldowns: body.cooldowns,
      custom: body.custom,
    });
  });
}
