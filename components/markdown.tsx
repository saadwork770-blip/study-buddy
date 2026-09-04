"use client";

import { useMemo } from "react";
import { renderMarkdown } from "@/lib/markdown";

/**
 * Model output is escaped inside `renderMarkdown` before any tags are added,
 * so the HTML handed to the DOM here never contains model-authored markup.
 */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
