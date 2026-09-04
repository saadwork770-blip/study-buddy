import { markdownToPptx } from "@/lib/markdown-pptx";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const { markdown, title, lang, subtitle } = (await request.json()) as {
    markdown: string;
    title?: string;
    lang?: string;
    subtitle?: string;
  };

  const buffer = await markdownToPptx(markdown ?? "", {
    title: (title || "study-buddy").slice(0, 120),
    subtitle,
    rtl: lang !== "en",
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": 'attachment; filename="slides.pptx"',
      "Cache-Control": "no-store",
    },
  });
}
