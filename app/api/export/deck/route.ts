import { type Deck, normalizeDeck } from "@/lib/deck";
import { deckToPptx } from "@/lib/deck-pptx";
import type { DocMeta } from "@/lib/doc-meta";
import type { DocTheme } from "@/lib/doc-theme";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const { deck, lang, meta, theme } = (await request.json()) as {
    deck: Deck;
    lang?: string;
    meta?: DocMeta;
    theme?: DocTheme;
  };

  const clean = normalizeDeck(deck, "Presentation");
  if (!clean) return Response.json({ error: "error.generic" }, { status: 400 });

  const buffer = await deckToPptx(clean, { rtl: lang !== "en", theme, meta });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": 'attachment; filename="deck.pptx"',
      "Cache-Control": "no-store",
    },
  });
}
