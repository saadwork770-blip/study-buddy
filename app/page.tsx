"use client";

import Link from "next/link";
import { useLang } from "@/components/lang-provider";
import type { TKey } from "@/lib/i18n";

const CARDS: { href: string; icon: string; title: TKey; body: TKey }[] = [
  { href: "/tasks", icon: "🗂", title: "home.card.tasks.title", body: "home.card.tasks.body" },
  { href: "/research", icon: "🔎", title: "home.card.research.title", body: "home.card.research.body" },
  { href: "/summarize", icon: "📄", title: "home.card.summarize.title", body: "home.card.summarize.body" },
  { href: "/chat", icon: "💬", title: "home.card.chat.title", body: "home.card.chat.body" },
  { href: "/library", icon: "⤓", title: "home.card.export.title", body: "home.card.export.body" },
  { href: "/chat", icon: "ع", title: "home.card.arabic.title", body: "home.card.arabic.body" },
];

export default function HomePage() {
  const { t } = useLang();

  return (
    <main className="page">
      <section className="hero">
        <h1>{t("app.tagline")}</h1>
        <p>{t("app.description")}</p>
        <div className="row">
          <Link href="/tasks" className="button">
            {t("home.start")}
          </Link>
          <Link href="/chat" className="button button-ghost">
            {t("nav.chat")}
          </Link>
        </div>
      </section>

      <h2 className="section-title">{t("home.features")}</h2>
      <div className="grid grid-3">
        {CARDS.map((card, index) => (
          <Link key={`${card.href}-${index}`} href={card.href} className="card card-link">
            <span className="card-icon" aria-hidden="true">
              {card.icon}
            </span>
            <h2>{t(card.title)}</h2>
            <p className="small muted">{t(card.body)}</p>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 26 }}>
        <h2>{t("home.setup.title")}</h2>
        <p className="small muted">{t("home.setup.body")}</p>
        <pre className="prose" style={{ marginTop: 10 }} dir="ltr">
          <code>ANTHROPIC_API_KEY=sk-ant-...</code>
        </pre>
      </div>
    </main>
  );
}
