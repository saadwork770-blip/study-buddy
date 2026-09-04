"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "./lang-provider";
import { DesignPanel } from "./design-panel";
import { ExportDialog } from "./export-dialog";
import { renderMarkdown, wordCount } from "@/lib/markdown";
import { DEFAULT_THEME, type DocTheme, fontById, fontsHref } from "@/lib/doc-theme";
import type { Source } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

interface Props {
  title: string;
  onTitleChange: (title: string) => void;
  markdown: string;
  onChange: (markdown: string) => void;
  theme: DocTheme;
  onThemeChange: (theme: DocTheme) => void;
  sources?: Source[];
  onSave?: () => void;
  saved?: boolean;
}

type Tool = {
  id: string;
  icon: string;
  label: TKey;
  /** Wraps the selection, or inserts at the caret when nothing is selected. */
  wrap?: [string, string];
  /** Prefixes every selected line. */
  linePrefix?: string;
  block?: string;
};

const TOOLS: Tool[][] = [
  [
    { id: "h1", icon: "H1", label: "ed.h1", linePrefix: "# " },
    { id: "h2", icon: "H2", label: "ed.h2", linePrefix: "## " },
    { id: "h3", icon: "H3", label: "ed.h3", linePrefix: "### " },
  ],
  [
    { id: "bold", icon: "B", label: "ed.bold", wrap: ["**", "**"] },
    { id: "italic", icon: "I", label: "ed.italic", wrap: ["*", "*"] },
    { id: "code", icon: "‹›", label: "ed.code", wrap: ["`", "`"] },
  ],
  [
    { id: "ul", icon: "•", label: "ed.bullet", linePrefix: "- " },
    { id: "ol", icon: "1.", label: "ed.number", linePrefix: "1. " },
    { id: "quote", icon: "❝", label: "ed.quote", linePrefix: "> " },
  ],
  [
    { id: "table", icon: "▦", label: "ed.table", block: "table" },
    { id: "rule", icon: "―", label: "ed.rule", block: "rule" },
    { id: "break", icon: "⤓", label: "ed.pagebreak", block: "break" },
  ],
];

/**
 * Writing, formatting and design in one place. Markdown stays the single
 * source of truth so every exporter keeps working unchanged; the preview is
 * styled with the live theme, so what is on screen is what gets exported.
 */
export function DocEditor(props: Props) {
  const { t, lang } = useLang();
  const { markdown, onChange, theme } = props;
  const area = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "design">("write");
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(true);

  const rtl = lang === "ar";
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);

  // Pull in the theme's webfonts so the preview shows the real faces.
  useEffect(() => {
    const href = fontsHref(theme);
    if (!href || document.querySelector(`link[data-doc-fonts="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.docFonts = href;
    document.head.appendChild(link);
  }, [theme]);

  const apply = useCallback(
    (tool: Tool) => {
      const el = area.current;
      if (!el) return;
      const { selectionStart: start, selectionEnd: end, value } = el;
      let next = value;
      let caret = end;

      if (tool.wrap) {
        const [open, close] = tool.wrap;
        const selected = value.slice(start, end) || t("ed.sample");
        next = value.slice(0, start) + open + selected + close + value.slice(end);
        caret = start + open.length + selected.length + close.length;
      } else if (tool.linePrefix) {
        const from = value.lastIndexOf("\n", start - 1) + 1;
        const to = value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end);
        const block = value.slice(from, to);
        const lines = block.split("\n").map((line, i) => {
          const bare = line.replace(/^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, "");
          if (line.startsWith(tool.linePrefix!)) return bare;
          return tool.linePrefix === "1. " ? `${i + 1}. ${bare}` : tool.linePrefix + bare;
        });
        next = value.slice(0, from) + lines.join("\n") + value.slice(to);
        caret = from + lines.join("\n").length;
      } else if (tool.block === "table") {
        const table = rtl
          ? "\n\n| العنصر | الوصف |\n| --- | --- |\n| — | — |\n| — | — |\n\n"
          : "\n\n| Item | Description |\n| --- | --- |\n| — | — |\n| — | — |\n\n";
        next = value.slice(0, start) + table + value.slice(end);
        caret = start + table.length;
      } else if (tool.block === "rule") {
        next = `${value.slice(0, start)}\n\n---\n\n${value.slice(end)}`;
        caret = start + 7;
      } else if (tool.block === "break") {
        // Honoured by the HTML/PDF exporter as a hard page break.
        next = `${value.slice(0, start)}\n\n<!--pagebreak-->\n\n${value.slice(end)}`;
        caret = start + 20;
      }

      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [onChange, rtl, t],
  );

  return (
    <div className="editor">
      <div className="editor-bar no-print">
        <div className="segmented">
          <button type="button" aria-pressed={tab === "write"} onClick={() => setTab("write")}>
            ✎ {t("ed.write")}
          </button>
          <button type="button" aria-pressed={tab === "design"} onClick={() => setTab("design")}>
            ◐ {t("ed.design")}
          </button>
        </div>

        <span className="tiny muted">
          {wordCount(markdown)} {t("common.words")}
        </span>

        <span className="spacer" />

        <button
          type="button"
          className="button button-ghost button-sm"
          aria-pressed={preview}
          onClick={() => setPreview((value) => !value)}
        >
          {preview ? "◧" : "▭"} {t("ed.preview")}
        </button>
        {props.onSave && (
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={props.onSave}
            disabled={props.saved}
          >
            {props.saved ? `✓ ${t("out.saved")}` : t("out.save")}
          </button>
        )}
        <button
          type="button"
          className="button button-sm"
          disabled={!markdown.trim()}
          onClick={() => setExporting(true)}
        >
          ⤓ {t("out.export")}
        </button>
      </div>

      <input
        className="editor-title"
        value={props.title}
        onChange={(event) => props.onTitleChange(event.target.value)}
        placeholder={t("ed.titlePh")}
        style={{ fontFamily: fontById(theme.headingFont).css, color: theme.accent }}
      />

      {tab === "design" ? (
        <DesignPanel theme={theme} onChange={props.onThemeChange} />
      ) : (
        <>
          <div className="toolbar no-print">
            {TOOLS.map((group, index) => (
              <div key={index} className="toolbar-group">
                {group.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    title={t(tool.label)}
                    aria-label={t(tool.label)}
                    onClick={() => apply(tool)}
                  >
                    {tool.icon}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className={preview ? "editor-split" : "editor-single"}>
            <textarea
              ref={area}
              className="editor-area"
              value={markdown}
              onChange={(event) => onChange(event.target.value)}
              placeholder={t("ed.bodyPh")}
              spellCheck
            />
            {preview && (
              <div
                className="editor-preview"
                style={
                  {
                    "--doc-accent": theme.accent,
                    "--doc-body": fontById(theme.bodyFont).css,
                    "--doc-display": fontById(theme.headingFont).css,
                    "--doc-size": `${theme.fontSize}pt`,
                    "--doc-line": String(theme.lineHeight),
                    "--doc-align": theme.justify ? "justify" : "start",
                  } as React.CSSProperties
                }
              >
                <div className="doc-page" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            )}
          </div>
        </>
      )}

      {exporting && (
        <ExportDialog
          title={props.title}
          markdown={markdown}
          sources={props.sources}
          theme={theme}
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  );
}
