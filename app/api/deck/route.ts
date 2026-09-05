import { attachmentParts, errorKey, generateJson } from "@/lib/ai";
import { DECK_SCHEMA, type Deck, deckInstruction, normalizeDeck } from "@/lib/deck";
import { type ExpertId, withExpert } from "@/lib/experts";
import { ROLE, systemPrompt } from "@/lib/prompts";
import type { AiPart, Attachment } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  brief: string;
  course?: string;
  lang: Lang;
  slides?: number;
  expert?: ExpertId;
  attachments?: Attachment[];
  keys?: Record<string, string>;
}

/**
 * Designs a deck rather than writing one. The model returns a structured
 * plan — a layout per slide — which the renderers turn into PowerPoint and
 * HTML, so the visual design stays the app's job and the model only decides
 * what shape each idea should take.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const lang: Lang = body.lang === "en" ? "en" : "ar";
  const brief = (body.brief ?? "").trim();
  const count = Math.min(Math.max(body.slides ?? 10, 4), 20);

  if (!brief && !body.attachments?.length) {
    return Response.json({ error: "produce.need" }, { status: 400 });
  }

  const system = withExpert(
    [systemPrompt(lang, ROLE.deck), "", deckInstruction(lang, count)].join("\n"),
    body.expert ?? null,
  );

  const parts: AiPart[] = [...attachmentParts(body.attachments)];
  const prompt = [
    body.course?.trim() ? `Course: ${body.course.trim()}` : "",
    body.attachments?.length ? "Build the deck from the material above." : "",
    `The brief:\n${brief}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const deck = await generateJson<Deck>(system, prompt, DECK_SCHEMA, parts, body.keys);
    const clean = normalizeDeck(deck, brief.slice(0, 80) || "Presentation");
    if (!clean) return Response.json({ error: "error.busy" }, { status: 502 });
    return Response.json({ deck: clean });
  } catch (err) {
    console.error("[study-buddy] deck design failed:", err);
    return Response.json({ error: errorKey(err) }, { status: 500 });
  }
}
