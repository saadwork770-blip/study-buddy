import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TableOfContents,
  TextRun,
  WidthType,
  type IRunOptions,
} from "docx";
import type { DocMeta } from "./doc-meta";
import { DEFAULT_THEME, type DocTheme, PAGE, bare, fontById, marginTwips, tint } from "./doc-theme";

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

const INK = "1A1A1A";
const RULE = "C8CEDA";

export interface DocxOptions {
  title: string;
  rtl: boolean;
  meta?: DocMeta;
  /** Pre-rendered cover rows, label/value pairs. */
  coverRows?: { label: string; value: string }[];
  theme?: DocTheme;
}

/** Splits inline markdown (**bold**, *italic*, `code`) into styled runs. */
function runs(text: string, rtl: boolean, base: Partial<IRunOptions> = {}): TextRun[] {
  const out: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const push = (value: string, extra: Partial<IRunOptions> = {}) => {
    if (!value) return;
    out.push(new TextRun({ text: value, rightToLeft: rtl, ...base, ...extra }));
  };

  while ((match = pattern.exec(text)) !== null) {
    push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) push(token.slice(2, -2), { bold: true });
    else if (token.startsWith("`")) push(token.slice(1, -1), { font: "Consolas", color: "8A0F3C" });
    else push(token.slice(1, -1), { italics: true });
    last = match.index + token.length;
  }
  push(text.slice(last));
  return out.length ? out : [new TextRun({ text: "", rightToLeft: rtl })];
}

const splitRow = (line: string) =>
  line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

const isDivider = (line: string) =>
  /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

/** Strips the leading H1 when it merely repeats the document title. */
function dropRedundantTitle(markdown: string, title: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first === -1) return markdown;
  const heading = /^#\s+(.*)$/.exec(lines[first].trim());
  if (heading && heading[1].trim().slice(0, 40) === title.trim().slice(0, 40)) {
    return lines.slice(first + 1).join("\n");
  }
  return markdown;
}

export async function markdownToDocx(
  markdown: string,
  options: DocxOptions,
): Promise<Buffer> {
  const { rtl, meta } = options;
  const theme = options.theme ?? DEFAULT_THEME;
  const ACCENT = bare(theme.accent);
  const HEAD_FILL = theme.tableStyle === "filled" ? tint(theme.accent, 0.88) : "FFFFFF";
  const align = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const justify = theme.justify ? AlignmentType.JUSTIFIED : align;
  const font = fontById(theme.bodyFont).word;
  const headingFont = fontById(theme.headingFont).word;
  // Word sizes are half-points; the theme carries points.
  const bodyHalfPt = Math.round(theme.fontSize * 2);
  const lineTwips = Math.round(theme.lineHeight * 240);
  const body: (Paragraph | Table)[] = [];

  const paragraph = (
    text: string,
    extra: Record<string, unknown> = {},
    style: Partial<IRunOptions> = {},
  ) =>
    new Paragraph({
      children: runs(text, rtl, style),
      bidirectional: rtl,
      alignment: align,
      spacing: { after: 140, line: lineTwips },
      ...extra,
    });

  // ---------- cover page ----------
  if (meta?.cover) {
    body.push(
      new Paragraph({ text: "", spacing: { after: 1400 } }),
      new Paragraph({
        children: [
          new TextRun({ text: options.title, bold: true, size: 44, color: ACCENT, font: headingFont, rightToLeft: rtl }),
        ],
        alignment: AlignmentType.CENTER,
        bidirectional: rtl,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: "",
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 1 } },
        spacing: { after: 700 },
      }),
    );

    for (const row of options.coverRows ?? []) {
      body.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${row.label}: `, bold: true, size: 26, rightToLeft: rtl, color: "44506A" }),
            new TextRun({ text: row.value, size: 26, rightToLeft: rtl }),
          ],
          alignment: AlignmentType.CENTER,
          bidirectional: rtl,
          spacing: { after: 160 },
        }),
      );
    }

    body.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // ---------- table of contents ----------
  if (meta?.toc) {
    body.push(
      new Paragraph({
        children: [
          new TextRun({
            text: rtl ? "المحتويات" : "Contents",
            bold: true,
            size: 32,
            color: ACCENT,
            font: headingFont,
            rightToLeft: rtl,
          }),
        ],
        bidirectional: rtl,
        alignment: align,
        spacing: { after: 220 },
      }),
      new TableOfContents("", { hyperlink: true, headingStyleRange: "1-3" }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  // ---------- body ----------
  const lines = dropRedundantTitle(markdown, options.title).replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      for (const codeLine of code) {
        body.push(
          new Paragraph({
            children: [new TextRun({ text: codeLine || " ", font: "Consolas", size: 19 })],
            alignment: AlignmentType.LEFT,
            spacing: { after: 0 },
            shading: { type: ShadingType.CLEAR, fill: "F5F6F8" },
          }),
        );
      }
      body.push(new Paragraph({ text: "", spacing: { after: 140 } }));
      continue;
    }

    if (trimmed.startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      const header = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++].trim()));
      i--;

      const cell = (text: string, head: boolean) =>
        new TableCell({
          children: [
            new Paragraph({
              children: runs(text, rtl, { bold: head, size: 21 }),
              bidirectional: rtl,
              alignment: align,
              spacing: { after: 0 },
            }),
          ],
          margins: { top: 90, bottom: 90, left: 130, right: 130 },
          shading: head ? { type: ShadingType.CLEAR, fill: HEAD_FILL } : undefined,
        });

      body.push(
        new Table({
          visuallyRightToLeft: rtl,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
            left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
            right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE },
          },
          rows: [
            new TableRow({ tableHeader: true, children: header.map((t) => cell(t, true)) }),
            ...rows.map(
              (row) => new TableRow({ children: header.map((_, j) => cell(row[j] ?? "", false)) }),
            ),
          ],
        }),
      );
      body.push(new Paragraph({ text: "", spacing: { after: 180 } }));
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      body.push(
        new Paragraph({
          text: "",
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } },
          spacing: { after: 220 },
        }),
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      body.push(
        new Paragraph({
          children: runs(heading[2], rtl, {
            bold: true,
            font: headingFont,
            size: level === 1 ? 32 : level === 2 ? 27 : 24,
            color: level <= 2 ? ACCENT : INK,
          }),
          heading: HEADINGS[level - 1],
          bidirectional: rtl,
          alignment: align,
          spacing: { before: level <= 2 ? 320 : 240, after: 130 },
          ...(level === 1 && theme.headingRule
            ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 4 } } }
            : {}),
        }),
      );
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      i--;
      body.push(
        paragraph(
          quote.join(" "),
          {
            indent: rtl ? { right: 480 } : { left: 480 },
            border: rtl
              ? { right: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 10 } }
              : { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 10 } },
            spacing: { before: 120, after: 180, line: lineTwips },
          },
          { italics: true, color: "3C4761" },
        ),
      );
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      const depth = Math.min(Math.floor((line.length - line.trimStart().length) / 2), 3);
      body.push(paragraph(bullet[1], { bullet: { level: depth }, spacing: { after: 90, line: lineTwips } }));
      continue;
    }

    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      body.push(
        paragraph(numbered[2], {
          numbering: { reference: "ordered", level: 0 },
          spacing: { after: 90, line: lineTwips },
        }),
      );
      continue;
    }

    // Body prose is justified, which is what Arabic academic writing expects.
    body.push(paragraph(trimmed, { alignment: justify }));
  }

  const doc = new Document({
    creator: options.meta?.author || "Study Buddy",
    title: options.title,
    description: options.meta?.course,
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: rtl ? { right: 460, hanging: 260 } : { left: 460, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font, size: bodyHalfPt, color: INK },
          paragraph: { spacing: { line: lineTwips } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE[theme.pageSize].twipsW,
              height: PAGE[theme.pageSize].twipsH,
            },
            margin: {
              top: marginTwips(theme.margin),
              bottom: marginTwips(theme.margin),
              left: marginTwips(theme.margin),
              right: marginTwips(theme.margin),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: options.title, size: 18, color: "8892A6", rightToLeft: rtl }),
                ],
                alignment: align,
                bidirectional: rtl,
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E6EE", space: 6 } },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "8892A6" }),
                ],
              }),
            ],
          }),
        },
        children: body.length ? body : [new Paragraph({ text: "" })],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
