"use client";

import { markdownToText, renderMarkdown } from "./markdown";
import type { Lang } from "./i18n";
import type { Source, Task } from "./types";

export type ExportFormat = "md" | "txt" | "html" | "docx" | "pdf" | "json";

export interface ExportPayload {
  title: string;
  markdown: string;
  lang: Lang;
  sources?: Source[];
  createdAt?: string;
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

export function download(blob: Blob, filename: string) {
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

function withSources(payload: ExportPayload): string {
  if (!payload.sources?.length) return payload.markdown;
  const heading = payload.lang === "ar" ? "## المصادر" : "## Sources";
  const list = payload.sources
    .map((source, index) => `${index + 1}. [${source.title}](${source.url})`)
    .join("\n");
  return `${payload.markdown}\n\n${heading}\n\n${list}\n`;
}

/** A complete, self-contained HTML document — also what the PDF is printed from. */
export function buildHtmlDocument(payload: ExportPayload): string {
  const rtl = payload.lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const body = renderMarkdown(withSources(payload));
  const date = new Date(payload.createdAt ?? Date.now()).toLocaleDateString(
    rtl ? "ar" : "en-GB",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const brand = rtl ? "رفيق الدراسة" : "Study Buddy";
  const escapedTitle = payload.title.replace(/</g, "&lt;");

  return `<!doctype html>
<html lang="${payload.lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapedTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: ${rtl
      ? '"Cairo", "Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif'
      : '"Inter", "Segoe UI", Helvetica, Arial, sans-serif'};
    font-size: 12pt; line-height: 1.9; color: #16181d; background: #fff;
    margin: 0 auto; padding: 32px; max-width: 850px;
  }
  header { border-bottom: 2px solid #e6e8ee; padding-bottom: 14px; margin-bottom: 28px; }
  h1 { font-size: 20pt; margin: 0 0 6px; }
  .meta { color: #6b7280; font-size: 10pt; }
  h2 { font-size: 15pt; margin: 26px 0 10px; }
  h3 { font-size: 13pt; margin: 20px 0 8px; }
  p, li { margin: 0 0 10px; }
  ul, ol { padding-inline-start: 24px; }
  blockquote { margin-inline: 0; padding-inline-start: 14px; border-inline-start: 3px solid #cbd5e1; color: #475569; }
  code { font-family: "SFMono-Regular", Consolas, monospace; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11pt; }
  th, td { border: 1px solid #d9dee7; padding: 8px 10px; text-align: start; vertical-align: top; }
  th { background: #f4f6fa; font-weight: 600; }
  a { color: #1d4ed8; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }
  footer { margin-top: 34px; padding-top: 12px; border-top: 1px solid #e6e8ee; color: #94a3b8; font-size: 9pt; }
  @page { margin: 18mm; }
  @media print { body { padding: 0; max-width: none; } a { color: inherit; } }
</style>
</head>
<body>
<header>
  <h1>${escapedTitle}</h1>
  <div class="meta">${brand} — ${date}</div>
</header>
${body}
<footer>${brand}</footer>
</body>
</html>`;
}

export function exportMarkdown(payload: ExportPayload) {
  const text = `# ${payload.title}\n\n${withSources(payload)}`;
  download(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
    `${safeFilename(payload.title)}.md`,
  );
}

export function exportText(payload: ExportPayload) {
  const text = `${payload.title}\n${"=".repeat(payload.title.length)}\n\n${markdownToText(
    withSources(payload),
  )}\n`;
  download(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
    `${safeFilename(payload.title)}.txt`,
  );
}

export function exportHtml(payload: ExportPayload) {
  download(
    new Blob([buildHtmlDocument(payload)], { type: "text/html;charset=utf-8" }),
    `${safeFilename(payload.title)}.html`,
  );
}

export function exportJson(payload: ExportPayload) {
  const data = {
    title: payload.title,
    lang: payload.lang,
    createdAt: payload.createdAt ?? new Date().toISOString(),
    sources: payload.sources ?? [],
    content: payload.markdown,
  };
  download(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    `${safeFilename(payload.title)}.json`,
  );
}

export async function exportDocx(payload: ExportPayload) {
  const response = await fetch("/api/export/docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markdown: withSources(payload),
      title: payload.title,
      lang: payload.lang,
    }),
  });
  if (!response.ok) throw new Error("docx export failed");
  download(await response.blob(), `${safeFilename(payload.title)}.docx`);
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
    case "pdf":
      return exportPdf(payload);
  }
}

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function exportTasksCsv(tasks: Task[], lang: Lang) {
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
  download(
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
