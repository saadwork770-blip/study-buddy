import type { Lang } from "./i18n";

/**
 * A designed deck, as opposed to Markdown poured into title-and-bullets.
 *
 * The point of the layouts is that a deck stops looking like a document: a
 * claim gets a whole slide, three numbers get three numbers, a comparison
 * gets two sides. The model picks the layout per slide, which is the part
 * that makes a deck feel designed rather than dumped.
 */
export type SlideLayout =
  | "title"
  | "section"
  | "bullets"
  | "statement"
  | "stats"
  | "columns"
  | "compare"
  | "steps"
  | "quote"
  | "table"
  | "close";

export interface DeckItem {
  /** Heading, number, or side name depending on the layout. */
  label: string;
  /** The supporting line. Empty is fine for a bare list. */
  text?: string;
}

export interface DeckSlide {
  layout: SlideLayout;
  title?: string;
  subtitle?: string;
  /** One sentence for `statement`, the quotation for `quote`. */
  body?: string;
  bullets?: string[];
  /** Stats, columns, comparison sides, or process steps. */
  items?: DeckItem[];
  table?: { header: string[]; rows: string[][] };
  /** Attribution for `quote`. */
  source?: string;
  /** Speaker notes — what to actually say. */
  notes?: string;
}

export interface Deck {
  title: string;
  subtitle?: string;
  slides: DeckSlide[];
}

export const LAYOUTS: SlideLayout[] = [
  "title", "section", "bullets", "statement", "stats",
  "columns", "compare", "steps", "quote", "table", "close",
];

/**
 * Gemini validates against this; the backup providers are given it in the
 * prompt instead. Kept to the OpenAPI subset Gemini accepts — no oneOf, no
 * nested optionality beyond what `required` expresses.
 */
export const DECK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "The deck title." },
    subtitle: { type: "string", description: "One line under the title." },
    slides: {
      type: "array",
      description: "The slides in order, including the opening title slide.",
      items: {
        type: "object",
        properties: {
          layout: {
            type: "string",
            enum: LAYOUTS,
            description: "The layout that suits this slide's content.",
          },
          title: { type: "string", description: "Slide heading, short." },
          subtitle: { type: "string", description: "Optional second line." },
          body: {
            type: "string",
            description: "For 'statement', the single sentence. For 'quote', the quotation.",
          },
          bullets: {
            type: "array",
            description: "For 'bullets' only. 3-5 items, one line each.",
            items: { type: "string" },
          },
          items: {
            type: "array",
            description:
              "For 'stats' (label = the number), 'columns', 'compare' (exactly 2) and 'steps'.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                text: { type: "string" },
              },
              required: ["label"],
            },
          },
          source: { type: "string", description: "Attribution for 'quote'." },
          notes: { type: "string", description: "What the presenter should say." },
        },
        required: ["layout"],
      },
    },
  },
  required: ["title", "slides"],
};

/** What to tell the model so it designs rather than transcribes. */
export function deckInstruction(lang: Lang, count: number): string {
  return [
    `Design a presentation of about ${count} slides. You are choosing layouts, not writing a document.`,
    "",
    "Available layouts, and when each earns its place:",
    "- title: the opening slide. Exactly one, first.",
    "- section: a divider before a new part of the argument. Title only.",
    "- bullets: 3-5 short parallel points. Never more than 5, never a paragraph.",
    "- statement: one claim that deserves a whole slide. Put it in `body`, under 20 words.",
    "- stats: 2-4 figures. `label` is the number itself ('68%', '3.2x'), `text` says what it counts.",
    "- columns: 2-3 parallel ideas that are not opposed. `label` heads each, `text` explains.",
    "- compare: exactly 2 items, genuinely opposed — before/after, method A/method B.",
    "- steps: an ordered process, 3-5 items. `label` names the step, `text` describes it.",
    "- quote: a quotation worth showing verbatim. `body` is the quote, `source` the attribution.",
    "- table: only for real tabular data.",
    "- close: the last slide — the single thing to remember.",
    "",
    "Rules that make the difference between a designed deck and a dumped one:",
    "- Vary the layout. A deck that is bullets throughout has failed. Use at most two bullet slides in a row, and reach for statement, stats, compare and steps wherever the content allows.",
    "- One idea per slide. If a slide needs two, it is two slides.",
    "- Slide text is not prose. Short, telegraphic, no trailing full stops on bullets.",
    "- Put the explanation in `notes`, not on the slide. Every content slide gets notes.",
    "- Do not invent statistics for a stats slide. Use it only for figures you were actually given or that came from a source.",
    lang === "ar"
      ? "- Write every slide in Arabic. Numbers stay in Western digits."
      : "- Write every slide in English.",
  ].join("\n");
}

/** Guards against a model that ignores the layout contract. */
export function normalizeDeck(deck: Deck | null, fallbackTitle: string): Deck | null {
  if (!deck?.slides?.length) return null;

  const slides = deck.slides
    .filter((slide) => slide && typeof slide === "object")
    .map((slide): DeckSlide => {
      const layout = LAYOUTS.includes(slide.layout) ? slide.layout : "bullets";
      const items = (slide.items ?? []).filter((item) => item?.label?.trim());
      return {
        ...slide,
        layout,
        // A compare slide with one side is a broken layout, not a design.
        ...(layout === "compare" && items.length !== 2
          ? { layout: items.length ? "columns" : "bullets" }
          : {}),
        items: items.length ? items : undefined,
        bullets: slide.bullets?.filter((b) => b?.trim()).slice(0, 6),
      };
    })
    .filter(
      (slide) =>
        slide.title?.trim() ||
        slide.body?.trim() ||
        slide.bullets?.length ||
        slide.items?.length ||
        slide.table,
    );

  if (!slides.length) return null;
  // Every deck opens on a title slide, whether or not the model produced one.
  if (slides[0].layout !== "title") {
    slides.unshift({ layout: "title", title: deck.title || fallbackTitle, subtitle: deck.subtitle });
  }
  return { title: deck.title || fallbackTitle, subtitle: deck.subtitle, slides };
}
