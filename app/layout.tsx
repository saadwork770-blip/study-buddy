import type { Metadata, Viewport } from "next";
import { LangProvider } from "@/components/lang-provider";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "رفيق الدراسة | Study Buddy",
  description:
    "مساعد ذكي لطلبة الماجستير: إدارة المهام، البحث، التلخيص، والمذاكرة — بالعربية والإنجليزية. An AI study companion for master's students.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1016" },
  ],
};

/**
 * Applied before paint so a stored theme choice does not flash the wrong
 * palette on first render.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("sb.theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;var l=localStorage.getItem("sb.lang");if(l==="en"||l==="ar"){document.documentElement.lang=l;document.documentElement.dir=l==="ar"?"rtl":"ltr";}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <LangProvider>
          <Nav />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
