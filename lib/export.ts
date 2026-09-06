"use client";

import { markdownToText, renderMarkdown } from "./markdown";
import type { Lang } from "./i18n";
import type { DocMeta } from "./doc-meta";
import { DEFAULT_THEME, type DocTheme, MARGINS, PAGE, fontById, fontsHref } from "./doc-theme";
import { type CiteStyle, type Reference, referenceSection } from "./citations";
import type { Source, Task } from "./types";

export type ExportFormat = "md" | "txt" | "html" | "docx" | "pptx" | "pdf" | "json";

export interface ExportPayload {
  title: string;
  markdown: string;
  lang: Lang;
  sources?: Source[];
  createdAt?: string;
  meta?: DocMeta;
  coverRows?: { label: string; value: string }[];
  theme?: DocTheme;
  references?: Reference[];
  citeStyle?: CiteStyle;
}

/** Filesystem-safe filename that keeps Arabic characters intact. */
export function safeFilename(title: string): string {
  const cleaned = (title || "study-buddy")
    .replace(/[\\/:*?"<>|\n\r\t]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "study-buddy";
}

/** True inside the Android shell, false in any browser. */
const isNativeShell = () =>
  typeof window !== "undefined" &&
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

/**
 * Saves a generated file.
 *
 * An Android WebView never hands a `blob:` URL to its download manager, so
 * the anchor trick that works in every browser silently does nothing inside
 * the app — and every export this project makes is a blob. In the shell the
 * bytes are written to the device instead and offered to the share sheet,
 * which is how a phone expects to receive a file anyway.
 */
export async function download(blob: Blob, filename: string): Promise<void> {
  if (isNativeShell()) {
    try {
      await saveNatively(blob, filename);
      return;
    } catch (err) {
      // Fall through to the browser path rather than losing the document.
      console.warn("[study-buddy] native save failed, falling back:", err);
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Writes to the app's documents directory, then opens the share sheet. */
async function saveNatively(blob: Blob, filename: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    // Filesystem wants base64 without the data: prefix.
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const written = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Documents,
    recursive: true,
  });

  await Share.share({ title: filename, url: written.uri });
}

/** The student's own reference list, formatted in their chosen style. */
function withReferences(markdown: string, payload: ExportPayload): string {
  if (!payload.references?.length) return markdown;
  return markdown + referenceSection(payload.references, payload.citeStyle ?? "apa7", payload.lang);
}

function withSources(payload: ExportPayload): string {
  const body = withReferences(payload.markdown, payload);
  if (!payload.sources?.length) return body;
  const heading = payload.lang === "ar" ? "## المصادر" : "## Sources";
  const list = payload.sources
    .map((source, index) => `${index + 1}. [${source.title}](${source.url})`)
    .join("\n");
  return `${body}\n\n${heading}\n\n${list}\n`;
}

/** Drops a leading H1 that just repeats the title the cover already shows. */
function withoutRedundantTitle(markdown: string, title: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first === -1) return markdown;
  const heading = /^#\s+(.*)$/.exec(lines[first].trim());
  if (heading && heading[1].trim().slice(0, 40) === title.trim().slice(0, 40)) {
    return lines.slice(first + 1).join("\n");
  }
  return markdown;
}

/** Headings become a linked table of contents. */
function tocOf(markdown: string): { level: number; text: string; id: string }[] {
  const out: { level: number; text: string; id: string }[] = [];
  let n = 0;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (m) out.push({ level: m[1].length, text: m[2].replace(/[*`_]/g, ""), id: `h${n++}` });
  }
  return out;
}

/**
 * A complete, self-contained academic document — also what the PDF is printed
 * from, so the print rules matter as much as the screen ones.
 */
export function buildHtmlDocument(payload: ExportPayload): string {
  const rtl = payload.lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const theme = payload.theme ?? DEFAULT_THEME;
  const href = fontsHref(theme);
  const fontsLink = href ? `<link href="${href}" rel="stylesheet" />` : "";
  const source = withoutRedundantTitle(withSources(payload), payload.title);
  const toc = payload.meta?.toc ? tocOf(source) : [];

  // Give each heading the id the contents list points at, in document order.
  let index = 0;
  const html = renderMarkdown(source).replace(
    /<h([1-3])>/g,
    (_match, level: string) => `<h${level} id="h${index++}">`,
  );

  const brand = rtl ? "رفيق الدراسة" : "Study Buddy";
  const escapedTitle = payload.title.replace(/</g, "&lt;");
  const rows = payload.coverRows ?? [];
  const contentsLabel = rtl ? "المحتويات" : "Contents";

  const cover = payload.meta?.cover
    ? `<section class="cover">
    <div class="cover-inner">
      <h1 class="cover-title">${escapedTitle}</h1>
      <div class="cover-rule"></div>
      <dl class="cover-meta">
        ${rows
          .map(
            (row) =>
              `<div><dt>${row.label.replace(/</g, "&lt;")}</dt><dd>${row.value.replace(/</g, "&lt;")}</dd></div>`,
          )
          .join("\n        ")}
      </dl>
    </div>
  </section>`
    : `<header class="masthead">
    <h1>${escapedTitle}</h1>
    <p class="meta">${brand} — ${formatWhen(payload)}</p>
  </header>`;

  const contents = toc.length
    ? `<nav class="toc">
    <h2>${contentsLabel}</h2>
    <ol>
      ${toc
        .map((item) => `<li class="lvl${item.level}"><a href="#${item.id}">${item.text.replace(/</g, "&lt;")}</a></li>`)
        .join("\n      ")}
    </ol>
  </nav>`
    : "";

  return `<!doctype html>
<html lang="${payload.lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapedTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${fontsLink}
<style>
  :root{
    --ink:#1a1a1a; --soft:#4a5568; --faint:#7b8494;
    --accent:${theme.accent}; --rule:#d5dbe6; --band:#f5f6f9;
    --body:${fontById(theme.bodyFont).css};
    --display:${fontById(theme.headingFont).css};
    color-scheme:light;
  }
  *{box-sizing:border-box}
  body{
    font-family:var(--body); font-size:${theme.fontSize}pt; line-height:${theme.lineHeight}; color:var(--ink);
    background:#fff; margin:0 auto; padding:38px 30px 60px; max-width:190mm;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  }

  /* cover */
  .cover{min-height:88vh; display:flex; align-items:center; justify-content:center; text-align:center;
    padding:40px 20px; margin-bottom:34px;
    ${
      theme.coverStyle === "centered"
        ? "border-top:6px solid var(--accent); border-bottom:6px solid var(--accent);"
        : theme.coverStyle === "band"
          ? "background:var(--band); border-radius:8px;"
          : "border:1px solid var(--rule);"
    }}
  .cover-inner{width:100%}
  .cover-title{font-family:var(--display); font-size:27pt; line-height:1.5; margin:0 0 18px; color:var(--accent); text-wrap:balance;}
  .cover-rule{width:90px; height:3px; background:var(--accent); margin:0 auto 26px;}
  .cover-meta{margin:0; display:grid; gap:9px; justify-content:center;}
  .cover-meta div{display:flex; gap:8px; justify-content:center; font-size:11.5pt;}
  .cover-meta dt{margin:0; font-weight:600; color:var(--soft);}
  .cover-meta dt::after{content:":";}
  .cover-meta dd{margin:0; color:var(--ink);}

  .masthead{border-bottom:3px double var(--rule); padding-bottom:14px; margin-bottom:30px;}
  .masthead h1{font-family:var(--display); font-size:20pt; margin:0 0 6px; color:var(--accent); text-wrap:balance;}
  .masthead .meta{color:var(--faint); font-size:9.5pt; margin:0;}

  /* contents */
  .toc{background:var(--band); border:1px solid var(--rule); border-radius:6px; padding:16px 22px; margin:0 0 32px;}
  .toc h2{font-family:var(--display); font-size:13pt; margin:0 0 8px; color:var(--accent); border:none; padding:0;}
  .toc ol{list-style:none; margin:0; padding:0; counter-reset:toc;}
  .toc li{margin:3px 0; font-size:10.5pt;}
  .toc li.lvl2{padding-inline-start:16px;}
  .toc li.lvl3{padding-inline-start:32px; color:var(--soft);}
  .toc a{color:var(--ink); text-decoration:none;}
  .toc a:hover{text-decoration:underline;}

  /* headings */
  h1,h2,h3,h4{font-family:var(--display); color:var(--accent); text-wrap:balance; line-height:1.45;}
  h1{font-size:18pt; margin:30px 0 12px; ${theme.headingRule ? "padding-bottom:7px; border-bottom:2px solid var(--rule);" : ""}}
  h2{font-size:15pt; margin:26px 0 10px; ${theme.headingRule ? "padding-bottom:5px; border-bottom:1px solid var(--rule);" : ""}}
  h3{font-size:12.5pt; margin:20px 0 7px; color:var(--ink);}
  h4,h5,h6{font-size:11.5pt; margin:16px 0 6px; color:var(--soft);}

  /* prose */
  p{margin:0 0 11px; text-align:${theme.justify ? "justify" : "start"}; hyphens:auto;}
  ul,ol{margin:0 0 13px; padding-inline-start:26px;}
  li{margin-bottom:6px;}
  li::marker{color:var(--accent);}
  blockquote{margin:16px 0; padding:4px 18px; border-inline-start:3px solid var(--accent);
    background:var(--band); color:var(--soft); font-style:italic;}
  blockquote p{text-align:start;}
  code{font-family:ui-monospace,Consolas,monospace; background:#f1f3f7; padding:1px 5px;
    border-radius:3px; font-size:.88em; color:#8a0f3c;}
  pre{background:#f7f8fb; border:1px solid var(--rule); border-radius:5px; padding:12px 14px;
    overflow-x:auto; direction:ltr; text-align:left;}
  pre code{background:none; padding:0; color:var(--ink);}
  a{color:var(--accent);}
  hr{border:none; border-top:1px solid var(--rule); margin:26px 0;}

  /* tables */
  .table-wrap{overflow-x:auto; margin:0 0 18px;}
  table{border-collapse:collapse; width:100%; font-size:10.5pt;}
  caption{caption-side:top; text-align:start; font-size:10pt; color:var(--faint); padding-bottom:6px;}
  th,td{border:1px solid var(--rule); padding:8px 11px; text-align:start; vertical-align:top;}
  th{${theme.tableStyle === "filled" ? "background:var(--accent); color:#fff;" : "background:var(--band); color:var(--accent); border-bottom:2px solid var(--accent);"} font-weight:600;}
  ${theme.tableStyle === "filled" ? "tbody tr:nth-child(even){background:#fafbfd;}" : ""}

  .sources{margin-top:30px; padding-top:14px; border-top:1px solid var(--rule);}
  footer.doc{margin-top:38px; padding-top:12px; border-top:1px solid var(--rule);
    color:var(--faint); font-size:8.5pt; display:flex; justify-content:space-between; gap:12px;}

  @page{size:${PAGE[theme.pageSize].css}; margin:${MARGINS[theme.margin]}mm;}
  @media print{
    body{padding:0; max-width:none; font-size:11.5pt;}
    .cover{min-height:0; height:245mm; break-after:page; border:none;
      border-top:6px solid var(--accent); border-bottom:6px solid var(--accent);}
    .toc{break-after:page; background:none; border:none; padding:0;}
    h1,h2,h3{break-after:avoid;}
    p,li,blockquote{orphans:3; widows:3;}
    table,figure,pre,blockquote{break-inside:avoid;}
    thead{display:table-header-group;}
    a{color:var(--ink); text-decoration:none;}
    .toc a::after{content:"";}
  }
</style>
</head>
<body>
${cover}
${contents}
<article>
${html}
</article>
<footer class="doc"><span>${escapedTitle}</span><span>${brand}</span></footer>
</body>
</html>`;
}

function formatWhen(payload: ExportPayload): string {
  return new Date(payload.createdAt ?? Date.now()).toLocaleDateString(
    payload.lang === "ar" ? "ar" : "en-GB",
    { year: "numeric", month: "long", day: "numeric" },
  );
}

export async function exportMarkdown(payload: ExportPayload) {
  const text = `# ${payload.title}\n\n${withSources(payload)}`;
  await download(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
    `${safeFilename(payload.title)}.md`,
  );
}

export async function exportText(payload: ExportPayload) {
  const text = `${payload.title}\n${"=".repeat(payload.title.length)}\n\n${markdownToText(
    withSources(payload),
  )}\n`;
  await download(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
    `${safeFilename(payload.title)}.txt`,
  );
}

export async function exportHtml(payload: ExportPayload) {
  await download(
    new Blob([buildHtmlDocument(payload)], { type: "text/html;charset=utf-8" }),
    `${safeFilename(payload.title)}.html`,
  );
}

export async function exportJson(payload: ExportPayload) {
  const data = {
    title: payload.title,
    lang: payload.lang,
    createdAt: payload.createdAt ?? new Date().toISOString(),
    sources: payload.sources ?? [],
    content: payload.markdown,
  };
  await download(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    `${safeFilename(payload.title)}.json`,
  );
}

export async function exportPptx(payload: ExportPayload) {
  const response = await fetch("/api/export/pptx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markdown: withSources(payload),
      title: payload.title,
      lang: payload.lang,
      meta: payload.meta,
      coverRows: payload.coverRows,
      theme: payload.theme,
    }),
  });
  if (!response.ok) throw new Error("pptx export failed");
  await download(await response.blob(), `${safeFilename(payload.title)}.pptx`);
}

export async function exportDocx(payload: ExportPayload) {
  const response = await fetch("/api/export/docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markdown: withSources(payload),
      title: payload.title,
      lang: payload.lang,
      meta: payload.meta,
      coverRows: payload.coverRows,
      theme: payload.theme,
    }),
  });
  if (!response.ok) throw new Error("docx export failed");
  await download(await response.blob(), `${safeFilename(payload.title)}.docx`);
}

/**
 * Prints through a hidden iframe. The browser does the Arabic shaping, so the
 * resulting PDF keeps ligatures and RTL order that a JS PDF writer would break.
 */
export function exportPdf(payload: ExportPayload) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;inset:auto;width:0;height:0;border:0;opacity:0;";
  frame.srcdoc = buildHtmlDocument(payload);
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

export function exportPayload(format: ExportFormat, payload: ExportPayload) {
  switch (format) {
    case "md":
      return exportMarkdown(payload);
    case "txt":
      return exportText(payload);
    case "html":
      return exportHtml(payload);
    case "json":
      return exportJson(payload);
    case "docx":
      return exportDocx(payload);
    case "pptx":
      return exportPptx(payload);
    case "pdf":
      return exportPdf(payload);
  }
}

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export async function exportTasksCsv(tasks: Task[], lang: Lang) {
  const header =
    lang === "ar"
      ? ["العنوان", "المقرر", "النوع", "الأولوية", "الحالة", "التسليم", "الخطوات المنجزة", "ملاحظات"]
      : ["Title", "Course", "Type", "Priority", "Status", "Due", "Steps done", "Notes"];

  const rows = tasks.map((task) =>
    [
      task.title,
      task.course ?? "",
      task.type,
      task.priority,
      task.status,
      task.dueDate ?? "",
      `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}`,
      (task.notes ?? "").replace(/\n/g, " "),
    ]
      .map(csvCell)
      .join(","),
  );

  // The BOM makes Excel read the file as UTF-8 so Arabic is not mangled.
  const csv = "﻿" + [header.map(csvCell).join(","), ...rows].join("\r\n");
  await download(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `${safeFilename(lang === "ar" ? "المهام" : "tasks")}.csv`,
  );
}

/** Renders a task, its plan and its steps as Markdown for the generic exporters. */
export function taskToMarkdown(task: Task, lang: Lang): string {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const lines: string[] = [];

  if (task.course) lines.push(`**${t("المقرر", "Course")}:** ${task.course}`);
  lines.push(`**${t("النوع", "Type")}:** ${task.type}`);
  lines.push(`**${t("الأولوية", "Priority")}:** ${task.priority}`);
  lines.push(`**${t("الحالة", "Status")}:** ${task.status}`);
  if (task.dueDate) lines.push(`**${t("التسليم", "Due")}:** ${task.dueDate}`);
  lines.push("");

  if (task.notes) {
    lines.push(`## ${t("المتطلبات", "Requirements")}`, "", task.notes, "");
  }
  if (task.plan) {
    lines.push(`## ${t("خطة العمل", "Work plan")}`, "", task.plan, "");
  }
  if (task.subtasks.length) {
    lines.push(`## ${t("الخطوات", "Steps")}`, "");
    for (const sub of task.subtasks) {
      const mark = sub.done ? "[x]" : "[ ]";
      const extras = [
        sub.hours ? `${sub.hours} ${t("ساعة", "h")}` : "",
        sub.target ?? "",
      ]
        .filter(Boolean)
        .join(" — ");
      lines.push(`- ${mark} ${sub.title}${extras ? ` (${extras})` : ""}`);
    }
    lines.push("");
  }
  if (task.risks?.length) {
    lines.push(`## ${t("تنبيهات", "Watch out for")}`, "");
    for (const risk of task.risks) lines.push(`- ${risk}`);
  }
  return lines.join("\n");
}
