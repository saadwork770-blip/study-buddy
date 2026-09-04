import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
} from "docx";

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

/** Splits inline markdown (**bold**, *italic*, `code`) into styled runs. */
function runs(text: string, rtl: boolean, base: { bold?: boolean } = {}): TextRun[] {
  const out: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const push = (value: string, extra: Partial<IRunOptions> = {}) => {
    if (!value) return;
    out.push(new TextRun({ text: value, rightToLeft: rtl, ...base, ...extra }));
  };

  while ((match = pattern.exec(text)) !== null) {
    push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      push(token.slice(2, -2), { bold: true });
    } else if (token.startsWith("`")) {
      push(token.slice(1, -1), { font: "Consolas" });
    } else {
      push(token.slice(1, -1), { italics: true });
    }
    last = match.index + token.length;
  }
  push(text.slice(last));
  return out.length ? out : [new TextRun({ text: "", rightToLeft: rtl })];
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isDivider = (line: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

/**
 * Converts a Markdown document to Word. Only the subset the app actually
 * produces is handled: headings, lists, tables, quotes, code fences and rules.
 */
export async function markdownToDocx(
  markdown: string,
  options: { title: string; rtl: boolean },
): Promise<Buffer> {
  const { rtl } = options;
  const align = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const children: (Paragraph | Table)[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const paragraph = (
    text: string,
    extra: Record<string, unknown> = {},
    style: { bold?: boolean } = {},
  ) =>
    new Paragraph({
      children: runs(text, rtl, style),
      bidirectional: rtl,
      alignment: align,
      spacing: { after: 120 },
      ...extra,
    });

  children.push(
    new Paragraph({
      children: [new TextRun({ text: options.title, bold: true, size: 36, rightToLeft: rtl })],
      bidirectional: rtl,
      alignment: align,
      spacing: { after: 300 },
    }),
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      for (const codeLine of code) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: codeLine || " ", font: "Consolas", size: 20 })],
            alignment: AlignmentType.LEFT,
            spacing: { after: 0 },
          }),
        );
      }
      continue;
    }

    // Table
    if (trimmed.startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      const header = splitRow(trimmed);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        body.push(splitRow(lines[i].trim()));
        i++;
      }
      i--;

      const cell = (text: string, bold: boolean) =>
        new TableCell({
          children: [
            new Paragraph({
              children: runs(text, rtl, { bold }),
              bidirectional: rtl,
              alignment: align,
            }),
          ],
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
        });

      children.push(
        new Table({
          visuallyRightToLeft: rtl,
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: header.map((text) => cell(text, true)),
            }),
            ...body.map(
              (row) =>
                new TableRow({
                  children: header.map((_, index) => cell(row[index] ?? "", false)),
                }),
            ),
          ],
        }),
      );
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      children.push(
        new Paragraph({
          text: "",
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } },
          spacing: { after: 200 },
        }),
      );
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      children.push(
        paragraph(heading[2], {
          heading: HEADINGS[heading[1].length - 1],
          spacing: { before: 240, after: 120 },
        }),
      );
      continue;
    }

    // Block quote
    if (trimmed.startsWith(">")) {
      children.push(
        paragraph(trimmed.replace(/^>\s?/, ""), {
          indent: rtl ? { right: 400 } : { left: 400 },
        }, { }),
      );
      continue;
    }

    // Bulleted list
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      const depth = Math.min(Math.floor((line.length - line.trimStart().length) / 2), 3);
      children.push(paragraph(bullet[1], { bullet: { level: depth } }));
      continue;
    }

    // Numbered list
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      children.push(paragraph(`${numbered[1]}. ${numbered[2]}`, { indent: rtl ? { right: 360 } : { left: 360 } }));
      continue;
    }

    children.push(paragraph(trimmed));
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: rtl ? "Arial" : "Calibri", size: 24 },
          paragraph: { spacing: { line: 320 } },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: children.length ? children : [new Paragraph({ text: "" })],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
