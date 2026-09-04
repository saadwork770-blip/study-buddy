import { markdownToDocx } from "@/lib/markdown-docx";
import type { DocMeta } from "@/lib/doc-meta";
import type { DocTheme } from "@/lib/doc-theme";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { markdown, title, lang, meta, coverRows, theme } = (await request.json()) as {
    markdown: string;
    title?: string;
    lang?: string;
    meta?: DocMeta;
    coverRows?: { label: string; value: string }[];
    theme?: DocTheme;
  };

  const safeTitle = (title || "study-buddy").slice(0, 120);
  const buffer = await markdownToDocx(markdown ?? "", {
    title: safeTitle,
    rtl: lang !== "en",
    meta,
    coverRows,
    theme,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // The browser supplies the real filename; this is only a fallback.
      "Content-Disposition": 'attachment; filename="document.docx"',
      "Cache-Control": "no-store",
    },
  });
}
