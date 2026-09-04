import PptxGenJS from "pptxgenjs";
import type { DocMeta } from "./doc-meta";
import { DEFAULT_THEME, type DocTheme, bare, fontById, tint } from "./doc-theme";

interface Slide {
  title: string;
  level: number;
  bullets: { text: string; level: number }[];
  table?: { header: string[]; rows: string[][] };
  notes: string[];
}

export interface PptxOptions {
  title: string;
  rtl: boolean;
  meta?: DocMeta;
  coverRows?: { label: string; value: string }[];
  theme?: DocTheme;
}

const INK = "16233A";
const SOFT = "5B6A85";
const RULE = "D5DBE6";

/** Strips inline markdown that has no meaning on a slide. */
const clean = (text: string) =>
  text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

const splitRow = (line: string) =>
  line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

const isDivider = (line: string) =>
  /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

/**
 * Splits Markdown into slides: each heading starts one, list items become
 * bullets, a table stays a table, and loose prose becomes speaker notes so a
 * slide never turns into a wall of text.
 */
function toSlides(markdown: string, fallback: string): Slide[] {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const slides: Slide[] = [];
  let current: Slide | null = null;

  const push = () => {
    if (current && (current.title || current.bullets.length || current.notes.length)) {
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
      current = { title: clean(heading[2]), level: heading[1].length, bullets: [], notes: [] };
      continue;
    }

    if (!current) current = { title: fallback, level: 2, bullets: [], notes: [] };

    if (trimmed.startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      const header = splitRow(trimmed).map(clean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i].trim()).map(clean));
        i++;
      }
      i--;
      // One table per slide keeps it legible; extra tables go to the notes.
      if (!current.table) current.table = { header, rows };
      else current.notes.push([header.join(" | "), ...rows.map((r) => r.join(" | "))].join("\n"));
      continue;
    }

    const bullet = /^([-*+])\s+(.*)$/.exec(trimmed);
    if (bullet) {
      const indent = line.length - line.trimStart().length;
      current.bullets.push({ text: clean(bullet[2]), level: Math.min(Math.floor(indent / 2), 3) });
      continue;
    }

    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      current.bullets.push({ text: clean(numbered[2]), level: 0 });
      continue;
    }

    current.notes.push(clean(trimmed));
  }

  push();
  return slides.length ? slides : [{ title: fallback, level: 1, bullets: [], notes: [] }];
}

/** Prose-only slides read better with the short paragraphs promoted to bullets. */
function balance(slide: Slide): Slide {
  if (slide.bullets.length || slide.table || slide.notes.length === 0) return slide;
  const promoted = slide.notes.filter((n) => n.length < 240).slice(0, 5);
  if (!promoted.length) return slide;
  return {
    ...slide,
    bullets: promoted.map((text) => ({ text, level: 0 })),
    notes: slide.notes.filter((n) => !promoted.includes(n)),
  };
}

/** A long slide is split rather than overflowing off the bottom. */
function paginate(slides: Slide[]): Slide[] {
  const MAX = 7;
  const out: Slide[] = [];
  for (const slide of slides) {
    if (slide.bullets.length <= MAX || slide.table) {
      out.push(slide);
      continue;
    }
    for (let i = 0; i < slide.bullets.length; i += MAX) {
      out.push({
        ...slide,
        title: i === 0 ? slide.title : `${slide.title} (${Math.floor(i / MAX) + 1})`,
        bullets: slide.bullets.slice(i, i + MAX),
        notes: i === 0 ? slide.notes : [],
        table: undefined,
      });
    }
  }
  return out;
}

export async function markdownToPptx(
  markdown: string,
  options: PptxOptions,
): Promise<Buffer> {
  const { rtl } = options;
  const theme = options.theme ?? DEFAULT_THEME;
  const ACCENT = bare(theme.accent);
  const BAND = tint(theme.accent, 0.93);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.rtlMode = rtl;
  pptx.author = options.meta?.author || "Study Buddy";
  pptx.title = options.title;
  pptx.company = options.meta?.institution ?? "";

  const font = fontById(theme.bodyFont).word;
  const headFont = fontById(theme.headingFont).word;
  const align = rtl ? ("right" as const) : ("left" as const);
  const W = 10;
  const M = 0.55;

  // ---------- title slide ----------
  const cover = pptx.addSlide();
  cover.background = { color: "FFFFFF" };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.42, fill: { color: ACCENT } });
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 5.21, w: W, h: 0.42, fill: { color: ACCENT } });
  cover.addText(options.title, {
    x: M, y: 1.55, w: W - M * 2, h: 1.5,
    fontSize: 34, bold: true, color: INK, fontFace: headFont,
    align: "center", rtlMode: rtl, valign: "middle",
  });

  const rows = options.coverRows ?? [];
  if (rows.length) {
    cover.addShape(pptx.ShapeType.rect, {
      x: W / 2 - 0.9, y: 3.05, w: 1.8, h: 0.035, fill: { color: ACCENT },
    });
    cover.addText(
      rows.map((row) => ({
        text: `${row.label}: ${row.value}`,
        options: { breakLine: true },
      })),
      {
        x: M, y: 3.35, w: W - M * 2, h: 1.6,
        fontSize: 13, color: SOFT, fontFace: font,
        align: "center", rtlMode: rtl, lineSpacingMultiple: 1.45,
      },
    );
  }

  // ---------- content ----------
  const slides = paginate(toSlides(markdown, options.title).map(balance));
  const footer = options.meta?.course || options.title;

  slides.forEach((slide, index) => {
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };

    // A top-level heading becomes a section divider rather than a content slide.
    const isSection = slide.level === 1 && !slide.bullets.length && !slide.table;
    if (isSection) {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 2.15, w: W, h: 1.3, fill: { color: BAND } });
      s.addText(slide.title, {
        x: M, y: 2.15, w: W - M * 2, h: 1.3,
        fontSize: 28, bold: true, color: ACCENT, fontFace: headFont,
        align: "center", valign: "middle", rtlMode: rtl,
      });
      if (slide.notes.length) s.addNotes(slide.notes.join("\n"));
      return;
    }

    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.09, h: 5.63, fill: { color: ACCENT } });
    s.addText(slide.title, {
      x: M, y: 0.42, w: W - M * 2, h: 0.72,
      fontSize: 22, bold: true, color: INK, fontFace: headFont, align, rtlMode: rtl, valign: "middle",
    });
    s.addShape(pptx.ShapeType.rect, {
      x: rtl ? W - M - 1.3 : M, y: 1.16, w: 1.3, h: 0.035, fill: { color: ACCENT },
    });

    let y = 1.45;

    if (slide.bullets.length) {
      const size = slide.bullets.length > 5 ? 14 : 16;
      s.addText(
        slide.bullets.map((b) => ({
          text: b.text,
          options: {
            bullet: { indent: 16 },
            indentLevel: b.level,
            breakLine: true,
            fontSize: b.level > 0 ? size - 2 : size,
            color: b.level > 0 ? SOFT : INK,
          },
        })),
        {
          x: M, y, w: W - M * 2, h: slide.table ? 1.5 : 3.5,
          fontSize: size, color: INK, fontFace: font,
          align, rtlMode: rtl, valign: "top", lineSpacingMultiple: Math.min(theme.lineHeight, 1.5),
        },
      );
      y += slide.table ? 1.7 : 0;
    }

    if (slide.table) {
      const head = slide.table.header.map((text) => ({
        text,
        options:
          theme.tableStyle === "filled"
            ? { bold: true, color: "FFFFFF", fill: { color: ACCENT }, fontSize: 12 }
            : { bold: true, color: ACCENT, fill: { color: BAND }, fontSize: 12 },
      }));
      const bodyRows = slide.table.rows.slice(0, 8).map((row) =>
        slide.table!.header.map((_, i) => ({
          text: row[i] ?? "",
          options: { fontSize: 11, color: INK },
        })),
      );
      s.addTable([head, ...bodyRows], {
        x: M, y, w: W - M * 2,
        border: { type: "solid", pt: 0.5, color: RULE },
        align, fontFace: font, valign: "middle",
        rowH: 0.32, autoPage: false,
      });
      if (slide.table.rows.length > 8) {
        slide.notes.push(
          `${slide.table.rows.length - 8} more rows omitted from the slide.`,
        );
      }
    }

    // footer
    s.addText(footer, {
      x: M, y: 5.16, w: W - M * 2 - 0.6, h: 0.3,
      fontSize: 9, color: "9AA4B5", fontFace: font, align, rtlMode: rtl,
    });
    s.addText(String(index + 1), {
      x: rtl ? M : W - M - 0.5, y: 5.16, w: 0.5, h: 0.3,
      fontSize: 9, color: "9AA4B5", fontFace: font,
      align: rtl ? "left" : "right",
    });

    if (slide.notes.length) s.addNotes(slide.notes.join("\n"));
  });

  return (await pptx.write({ outputType: "nodebuffer" })) as unknown as Buffer;
}
