import PptxGenJS from "pptxgenjs";

interface Slide {
  title: string;
  bullets: { text: string; level: number }[];
  notes: string[];
}

/** Strips inline markdown that has no meaning on a slide. */
const clean = (text: string) =>
  text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

/**
 * Splits a Markdown document into slides: every heading starts a new slide,
 * list items become bullets, and loose paragraphs become speaker notes so a
 * slide stays readable instead of turning into a wall of text.
 */
function toSlides(markdown: string, fallbackTitle: string): Slide[] {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const slides: Slide[] = [];
  let current: Slide | null = null;

  const push = () => {
    if (current && (current.bullets.length || current.notes.length || current.title)) {
      slides.push(current);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("```")) {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      push();
      current = { title: clean(heading[2]), bullets: [], notes: [] };
      continue;
    }

    if (!current) current = { title: fallbackTitle, bullets: [], notes: [] };

    const bullet = /^([-*+])\s+(.*)$/.exec(trimmed);
    if (bullet) {
      const indent = line.length - line.trimStart().length;
      current.bullets.push({ text: clean(bullet[2]), level: Math.min(Math.floor(indent / 2), 4) });
      continue;
    }

    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      current.bullets.push({ text: clean(numbered[2]), level: 0 });
      continue;
    }

    // Table rows and prose go to the notes rather than crowding the slide.
    if (trimmed.startsWith("|")) {
      current.notes.push(clean(trimmed.replace(/\|/g, "  ")));
      continue;
    }
    current.notes.push(clean(trimmed));
  }

  push();
  return slides.length ? slides : [{ title: fallbackTitle, bullets: [], notes: [] }];
}

/** A slide holding only prose reads better with that prose promoted to bullets. */
function balance(slide: Slide): Slide {
  if (slide.bullets.length || slide.notes.length === 0) return slide;
  const promoted = slide.notes.filter((n) => n.length < 220).slice(0, 6);
  if (!promoted.length) return slide;
  return {
    title: slide.title,
    bullets: promoted.map((text) => ({ text, level: 0 })),
    notes: slide.notes.filter((n) => !promoted.includes(n)),
  };
}

export async function markdownToPptx(
  markdown: string,
  options: { title: string; rtl: boolean; subtitle?: string },
): Promise<Buffer> {
  const { rtl } = options;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.rtlMode = rtl;
  pptx.author = "Study Buddy";
  pptx.title = options.title;

  const font = rtl ? "Arial" : "Calibri";
  const align = rtl ? ("right" as const) : ("left" as const);
  const INK = "1B2333";
  const ACCENT = "4F46E5";
  const MUTED = "5B6478";

  // Title slide
  const cover = pptx.addSlide();
  cover.background = { color: "FFFFFF" };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.32, fill: { color: ACCENT },
  });
  cover.addText(options.title, {
    x: 0.6, y: 2.0, w: 8.8, h: 1.4,
    fontSize: 34, bold: true, color: INK, fontFace: font,
    align, rtlMode: rtl, valign: "middle",
  });
  if (options.subtitle) {
    cover.addText(options.subtitle, {
      x: 0.6, y: 3.3, w: 8.8, h: 0.6,
      fontSize: 16, color: MUTED, fontFace: font, align, rtlMode: rtl,
    });
  }
  cover.addText(
    new Date().toLocaleDateString(rtl ? "ar" : "en-GB", {
      year: "numeric", month: "long", day: "numeric",
    }),
    { x: 0.6, y: 4.6, w: 8.8, h: 0.4, fontSize: 12, color: MUTED, fontFace: font, align, rtlMode: rtl },
  );

  for (const raw of toSlides(markdown, options.title)) {
    const slide = balance(raw);
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };

    s.addText(slide.title, {
      x: 0.55, y: 0.38, w: 9.0, h: 0.8,
      fontSize: 24, bold: true, color: INK, fontFace: font, align, rtlMode: rtl,
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 0.55, y: 1.16, w: 1.5, h: 0.05, fill: { color: ACCENT },
    });

    if (slide.bullets.length) {
      s.addText(
        slide.bullets.map((b) => ({
          text: b.text,
          options: { bullet: { indent: 18 }, indentLevel: b.level, breakLine: true },
        })),
        {
          x: 0.55, y: 1.45, w: 9.0, h: 3.6,
          fontSize: slide.bullets.length > 7 ? 14 : 17,
          color: INK, fontFace: font, align, rtlMode: rtl, valign: "top", lineSpacingMultiple: 1.3,
        },
      );
    }

    if (slide.notes.length) s.addNotes(slide.notes.join("\n"));
  }

  const data = (await pptx.write({ outputType: "nodebuffer" })) as unknown as Buffer;
  return data;
}
