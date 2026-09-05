import PptxGenJS from "pptxgenjs";
import type { Deck, DeckSlide } from "./deck";
import type { DocMeta } from "./doc-meta";
import { DEFAULT_THEME, type DocTheme, bare, fontById, tint } from "./doc-theme";

export interface DeckPptxOptions {
  rtl: boolean;
  theme?: DocTheme;
  meta?: DocMeta;
}

const INK = "16233A";
const SOFT = "5B6A85";

/** 16:9 at pptxgenjs's inch scale. */
const W = 10;
const H = 5.63;
const M = 0.62;

export async function deckToPptx(deck: Deck, options: DeckPptxOptions): Promise<Buffer> {
  const { rtl } = options;
  const theme = options.theme ?? DEFAULT_THEME;
  const ACCENT = bare(theme.accent);
  const WASH = tint(theme.accent, 0.94);
  const SOFTFILL = tint(theme.accent, 0.86);

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.rtlMode = rtl;
  pptx.title = deck.title;
  pptx.author = options.meta?.author || "Study Buddy";
  pptx.company = options.meta?.institution ?? "";

  const body = fontById(theme.bodyFont).word;
  const head = fontById(theme.headingFont).word;
  const align = rtl ? ("right" as const) : ("left" as const);
  /** Mirrors a box so a layout designed left-to-right reads correctly in Arabic. */
  const mx = (x: number, w: number) => (rtl ? W - x - w : x);

  const text = (
    slide: PptxGenJS.Slide,
    content: Parameters<PptxGenJS.Slide["addText"]>[0],
    opts: PptxGenJS.TextPropsOptions,
  ) => slide.addText(content, { rtlMode: rtl, fontFace: body, ...opts });

  /** Title, accent rule, and the y where content may start. */
  const header = (slide: PptxGenJS.Slide, s: DeckSlide) => {
    text(slide, s.title ?? "", {
      x: mx(M, W - M * 2), y: 0.44, w: W - M * 2, h: 0.7,
      fontSize: 24, bold: true, color: INK, fontFace: head, align, valign: "middle",
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: mx(M, 1.15), y: 1.2, w: 1.15, h: 0.045, fill: { color: ACCENT },
    });
    if (s.subtitle) {
      text(slide, s.subtitle, {
        x: mx(M, W - M * 2), y: 1.32, w: W - M * 2, h: 0.4,
        fontSize: 13, color: SOFT, align, italic: true,
      });
      return 1.85;
    }
    return 1.55;
  };

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };

    switch (s.layout) {
      // A full-bleed accent panel down one side, so the opener does not look
      // like a content slide with bigger type.
      case "title": {
        slide.addShape(pptx.ShapeType.rect, {
          x: mx(0, 3.5), y: 0, w: 3.5, h: H, fill: { color: ACCENT },
        });
        slide.addShape(pptx.ShapeType.ellipse, {
          x: mx(-1.1, 2.6), y: 3.5, w: 2.6, h: 2.6, fill: { color: "FFFFFF", transparency: 88 },
        });
        text(slide, s.title ?? deck.title, {
          x: mx(4.1, 5.3), y: 1.5, w: 5.3, h: 1.7,
          fontSize: 34, bold: true, color: INK, fontFace: head, align, valign: "bottom",
        });
        slide.addShape(pptx.ShapeType.rect, {
          x: mx(4.1, 1.0), y: 3.35, w: 1.0, h: 0.05, fill: { color: ACCENT },
        });
        if (s.subtitle || deck.subtitle) {
          text(slide, s.subtitle ?? deck.subtitle ?? "", {
            x: mx(4.1, 5.3), y: 3.6, w: 5.3, h: 1.0,
            fontSize: 15, color: SOFT, align, valign: "top", lineSpacingMultiple: 1.3,
          });
        }
        break;
      }

      // A divider earns a whole slide only by looking unmistakably different.
      case "section": {
        slide.background = { color: WASH };
        slide.addShape(pptx.ShapeType.rect, {
          x: mx(0, 0.16), y: 0, w: 0.16, h: H, fill: { color: ACCENT },
        });
        text(slide, s.title ?? "", {
          x: mx(1.1, 7.8), y: 1.9, w: 7.8, h: 1.5,
          fontSize: 30, bold: true, color: ACCENT, fontFace: head, align, valign: "middle",
        });
        if (s.subtitle) {
          text(slide, s.subtitle, {
            x: mx(1.1, 7.8), y: 3.35, w: 7.8, h: 0.6,
            fontSize: 14, color: SOFT, align,
          });
        }
        break;
      }

      // One claim, set large, with air around it. The whole point is restraint.
      case "statement": {
        slide.addShape(pptx.ShapeType.rect, {
          x: mx(M, 0.9), y: 1.15, w: 0.9, h: 0.06, fill: { color: ACCENT },
        });
        text(slide, s.body ?? s.title ?? "", {
          x: mx(M, W - M * 2), y: 1.5, w: W - M * 2, h: 2.6,
          fontSize: 28, bold: true, color: INK, fontFace: head,
          align, valign: "middle", lineSpacingMultiple: 1.22,
        });
        if (s.title && s.body) {
          text(slide, s.title, {
            x: mx(M, W - M * 2), y: 0.6, w: W - M * 2, h: 0.45,
            fontSize: 13, color: ACCENT, bold: true, align, charSpacing: 1,
          });
        }
        break;
      }

      case "quote": {
        slide.background = { color: WASH };
        text(slide, "”", {
          x: mx(M - 0.05, 1.2), y: 0.55, w: 1.2, h: 1.2,
          fontSize: 96, color: ACCENT, fontFace: head, align, valign: "middle",
        });
        text(slide, s.body ?? "", {
          x: mx(M, W - M * 2), y: 1.6, w: W - M * 2, h: 2.1,
          fontSize: 22, italic: true, color: INK, fontFace: head,
          align, valign: "middle", lineSpacingMultiple: 1.3,
        });
        if (s.source) {
          text(slide, `— ${s.source}`, {
            x: mx(M, W - M * 2), y: 3.85, w: W - M * 2, h: 0.5,
            fontSize: 13, color: SOFT, align,
          });
        }
        break;
      }

      // Numbers big enough to be the point of the slide, not a footnote.
      case "stats": {
        const top = header(slide, s);
        const items = (s.items ?? []).slice(0, 4);
        const n = Math.max(items.length, 1);
        const gap = 0.28;
        const cw = (W - M * 2 - gap * (n - 1)) / n;
        items.forEach((item, i) => {
          const x = mx(M + i * (cw + gap), cw);
          slide.addShape(pptx.ShapeType.roundRect, {
            x, y: top, w: cw, h: 2.5, fill: { color: WASH }, rectRadius: 0.08,
          });
          slide.addShape(pptx.ShapeType.rect, {
            x, y: top, w: cw, h: 0.07, fill: { color: ACCENT },
          });
          text(slide, item.label, {
            x, y: top + 0.45, w: cw, h: 1.0,
            fontSize: n > 3 ? 30 : 38, bold: true, color: ACCENT, fontFace: head,
            align: "center", valign: "middle",
          });
          text(slide, item.text ?? "", {
            x: x + 0.16, y: top + 1.5, w: cw - 0.32, h: 0.85,
            fontSize: 12, color: SOFT, align: "center", valign: "top",
            lineSpacingMultiple: 1.2,
          });
        });
        break;
      }

      case "columns": {
        const top = header(slide, s);
        const items = (s.items ?? []).slice(0, 3);
        const n = Math.max(items.length, 1);
        const gap = 0.3;
        const cw = (W - M * 2 - gap * (n - 1)) / n;
        items.forEach((item, i) => {
          const x = mx(M + i * (cw + gap), cw);
          slide.addShape(pptx.ShapeType.rect, {
            x, y: top, w: cw, h: 0.06, fill: { color: ACCENT },
          });
          text(slide, item.label, {
            x, y: top + 0.22, w: cw, h: 0.55,
            fontSize: 16, bold: true, color: INK, fontFace: head, align, valign: "top",
          });
          text(slide, item.text ?? "", {
            x, y: top + 0.82, w: cw, h: 2.0,
            fontSize: 13, color: SOFT, align, valign: "top", lineSpacingMultiple: 1.3,
          });
        });
        break;
      }

      // Two sides, visually opposed — the tint difference does the work.
      case "compare": {
        const top = header(slide, s);
        const items = (s.items ?? []).slice(0, 2);
        const gap = 0.3;
        const cw = (W - M * 2 - gap) / 2;
        items.forEach((item, i) => {
          const x = mx(M + i * (cw + gap), cw);
          slide.addShape(pptx.ShapeType.roundRect, {
            x, y: top, w: cw, h: 2.6,
            fill: { color: i === 0 ? "F4F6FA" : WASH }, rectRadius: 0.08,
          });
          slide.addShape(pptx.ShapeType.rect, {
            x, y: top, w: cw, h: 0.5,
            fill: { color: i === 0 ? SOFTFILL : ACCENT },
          });
          text(slide, item.label, {
            x: x + 0.2, y: top, w: cw - 0.4, h: 0.5,
            fontSize: 14, bold: true, fontFace: head,
            color: i === 0 ? INK : "FFFFFF", align, valign: "middle",
          });
          text(slide, item.text ?? "", {
            x: x + 0.24, y: top + 0.68, w: cw - 0.48, h: 1.75,
            fontSize: 13, color: i === 0 ? SOFT : INK, align, valign: "top",
            lineSpacingMultiple: 1.3,
          });
        });
        break;
      }

      // Numbered rows with a rail behind them, so order is visible at a glance.
      case "steps": {
        const top = header(slide, s);
        const items = (s.items ?? []).slice(0, 5);
        const rowH = Math.min(0.72, (H - top - 0.4) / Math.max(items.length, 1));
        slide.addShape(pptx.ShapeType.rect, {
          x: mx(M + 0.24, 0.03), y: top + 0.2, w: 0.03,
          h: Math.max(rowH * (items.length - 1), 0.1), fill: { color: SOFTFILL },
        });
        items.forEach((item, i) => {
          const y = top + i * rowH;
          slide.addShape(pptx.ShapeType.ellipse, {
            x: mx(M, 0.52), y, w: 0.52, h: 0.52, fill: { color: ACCENT },
          });
          text(slide, String(i + 1), {
            x: mx(M, 0.52), y, w: 0.52, h: 0.52,
            fontSize: 15, bold: true, color: "FFFFFF", fontFace: head,
            align: "center", valign: "middle",
          });
          text(slide, item.label, {
            x: mx(M + 0.75, W - M * 2 - 0.75), y: y - 0.02, w: W - M * 2 - 0.75, h: 0.34,
            fontSize: 15, bold: true, color: INK, fontFace: head, align, valign: "middle",
          });
          if (item.text) {
            text(slide, item.text, {
              x: mx(M + 0.75, W - M * 2 - 0.75), y: y + 0.3, w: W - M * 2 - 0.75, h: 0.34,
              fontSize: 12, color: SOFT, align, valign: "middle",
            });
          }
        });
        break;
      }

      // A native PowerPoint chart, not a picture of one, so the student can
      // edit the numbers in PowerPoint after downloading.
      case "chart": {
        const top = header(slide, s);
        const points = (s.items ?? []).filter((item) => Number.isFinite(item.value));
        slide.addChart(
          pptx.ChartType.bar,
          [
            {
              name: s.unit || s.title || "",
              labels: points.map((item) => item.label),
              values: points.map((item) => item.value as number),
            },
          ],
          {
            x: M, y: top, w: W - M * 2, h: H - top - 0.5,
            barDir: "col",
            chartColors: [ACCENT],
            showValue: true,
            dataLabelColor: INK,
            dataLabelFontSize: 11,
            dataLabelFontFace: body,
            catAxisLabelColor: SOFT,
            catAxisLabelFontSize: 11,
            catAxisLabelFontFace: body,
            valAxisLabelColor: SOFT,
            valAxisLabelFontSize: 10,
            valAxisLabelFontFace: body,
            valGridLine: { style: "dash", color: "E3E8F0" },
            catGridLine: { style: "none" },
            showLegend: false,
            border: { pt: 0, color: "FFFFFF" },
          },
        );
        break;
      }

      // Time reads along the slide, so the eye follows the sequence.
      case "timeline": {
        const top = header(slide, s);
        const points = (s.items ?? []).slice(0, 5);
        const n = Math.max(points.length, 1);
        // Centred in the space under the heading rather than pinned near it.
        const railY = top + (H - top - 0.5) / 2 - 0.1;
        const cw = (W - M * 2) / n;
        slide.addShape(pptx.ShapeType.rect, {
          x: M + cw / 2, y: railY, w: W - M * 2 - cw, h: 0.03, fill: { color: SOFTFILL },
        });
        points.forEach((item, i) => {
          const cx = mx(M + i * cw, cw);
          slide.addShape(pptx.ShapeType.ellipse, {
            x: cx + cw / 2 - 0.11, y: railY - 0.08, w: 0.22, h: 0.22,
            fill: { color: ACCENT },
          });
          text(slide, item.label, {
            x: cx, y: railY - 0.62, w: cw, h: 0.45,
            fontSize: 13, bold: true, color: ACCENT, fontFace: head,
            align: "center", valign: "bottom",
          });
          text(slide, item.text ?? "", {
            x: cx + 0.08, y: railY + 0.28, w: cw - 0.16, h: 1.5,
            fontSize: 11, color: SOFT, align: "center", valign: "top",
            lineSpacingMultiple: 1.25,
          });
        });
        break;
      }

      case "table": {
        const top = header(slide, s);
        const t = s.table;
        if (t?.header?.length) {
          slide.addTable(
            [
              t.header.map((cell) => ({
                text: cell,
                options: { bold: true, color: "FFFFFF", fill: { color: ACCENT } },
              })),
              ...t.rows.map((row, r) =>
                row.map((cell) => ({
                  text: cell,
                  options: { fill: { color: r % 2 ? "FFFFFF" : WASH } },
                })),
              ),
            ],
            {
              x: M, y: top, w: W - M * 2,
              fontSize: 12, fontFace: body, color: INK,
              border: { type: "solid", color: "E3E8F0", pt: 1 },
              align, autoPage: false,
            },
          );
        }
        break;
      }

      case "close": {
        slide.background = { color: ACCENT };
        text(slide, s.title ?? "", {
          x: M, y: 1.7, w: W - M * 2, h: 1.3,
          fontSize: 30, bold: true, color: "FFFFFF", fontFace: head,
          align: "center", valign: "bottom",
        });
        slide.addShape(pptx.ShapeType.rect, {
          x: W / 2 - 0.5, y: 3.15, w: 1.0, h: 0.05,
          fill: { color: "FFFFFF", transparency: 40 },
        });
        if (s.body || s.subtitle) {
          text(slide, s.body ?? s.subtitle ?? "", {
            x: M + 0.6, y: 3.4, w: W - M * 2 - 1.2, h: 1.0,
            fontSize: 15, color: "FFFFFF", align: "center", valign: "top",
            lineSpacingMultiple: 1.3, transparency: 12,
          });
        }
        break;
      }

      // bullets, and anything a model invented that we mapped back to it.
      default: {
        const top = header(slide, s);
        const bullets = (s.bullets ?? []).slice(0, 6);
        const rowH = Math.min(0.62, (H - top - 0.35) / Math.max(bullets.length, 1));
        bullets.forEach((line, i) => {
          const y = top + i * rowH;
          slide.addShape(pptx.ShapeType.rect, {
            x: mx(M + 0.02, 0.14), y: y + 0.13, w: 0.14, h: 0.14, fill: { color: ACCENT },
          });
          text(slide, line, {
            x: mx(M + 0.42, W - M * 2 - 0.42), y, w: W - M * 2 - 0.42, h: rowH,
            fontSize: bullets.length > 4 ? 14 : 16, color: INK, align, valign: "middle",
            lineSpacingMultiple: 1.2,
          });
        });
        break;
      }
    }

    // Page number on everything except the covers.
    if (s.layout !== "title" && s.layout !== "close") {
      const index = deck.slides.indexOf(s) + 1;
      text(slide, String(index), {
        x: mx(W - M - 0.5, 0.5), y: H - 0.45, w: 0.5, h: 0.3,
        fontSize: 10, color: SOFT, align: rtl ? "left" : "right",
      });
    }
    if (s.notes?.trim()) slide.addNotes(s.notes.trim());
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
