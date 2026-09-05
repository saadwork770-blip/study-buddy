import type { Deck, DeckSlide } from "./deck";
import { DEFAULT_THEME, type DocTheme, fontById, fontsHref, tint } from "./doc-theme";

/**
 * The same deck as HTML, at the same 16:9 proportions as the PowerPoint, so
 * the preview in the app is the deck the student will actually get rather
 * than an approximation of it.
 */
export function deckToHtml(deck: Deck, rtl: boolean, docTheme?: DocTheme): string {
  const theme = docTheme ?? DEFAULT_THEME;
  const accent = theme.accent;
  const wash = tint(accent, 0.94).replace(/^/, "#");
  const soft = tint(accent, 0.86).replace(/^/, "#");
  const head = fontById(theme.headingFont).css;
  const body = fontById(theme.bodyFont).css;
  const dir = rtl ? "rtl" : "ltr";

  const esc = (value = "") =>
    value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  const slideHtml = (s: DeckSlide, index: number): string => {
    const head2 = `<h2>${esc(s.title)}</h2>${
      s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ""
    }<div class="rule"></div>`;
    const items = s.items ?? [];

    switch (s.layout) {
      case "title":
        return `<section class="slide title"><div class="panel"></div><div class="titlebody">
          <h1>${esc(s.title ?? deck.title)}</h1><div class="rule"></div>
          ${s.subtitle || deck.subtitle ? `<p class="sub">${esc(s.subtitle ?? deck.subtitle)}</p>` : ""}
        </div></section>`;

      case "section":
        return `<section class="slide section"><div class="bar"></div>
          <div class="mid"><h2 class="big">${esc(s.title)}</h2>
          ${s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ""}</div></section>`;

      case "statement":
        return `<section class="slide statement">
          ${s.title && s.body ? `<p class="eyebrow">${esc(s.title)}</p>` : ""}
          <div class="rule short"></div>
          <p class="claim">${esc(s.body ?? s.title)}</p></section>`;

      case "quote":
        return `<section class="slide quote"><div class="mark">&rdquo;</div>
          <blockquote>${esc(s.body)}</blockquote>
          ${s.source ? `<p class="src">${esc(s.source)}</p>` : ""}</section>`;

      case "stats":
        return `<section class="slide">${head2}<div class="grid stats">${items
          .slice(0, 4)
          .map(
            (i) =>
              `<div class="stat"><div class="cap"></div><strong>${esc(i.label)}</strong><span>${esc(
                i.text,
              )}</span></div>`,
          )
          .join("")}</div></section>`;

      case "columns":
        return `<section class="slide">${head2}<div class="grid cols">${items
          .slice(0, 3)
          .map(
            (i) =>
              `<div class="col"><div class="cap"></div><h3>${esc(i.label)}</h3><p>${esc(
                i.text,
              )}</p></div>`,
          )
          .join("")}</div></section>`;

      case "compare":
        return `<section class="slide">${head2}<div class="grid cols">${items
          .slice(0, 2)
          .map(
            (i, n) =>
              `<div class="side ${n ? "b" : "a"}"><h3>${esc(i.label)}</h3><p>${esc(i.text)}</p></div>`,
          )
          .join("")}</div></section>`;

      case "steps":
        return `<section class="slide">${head2}<ol class="steps">${items
          .slice(0, 5)
          .map(
            (i, n) =>
              `<li><span class="num">${n + 1}</span><div><strong>${esc(i.label)}</strong>${
                i.text ? `<p>${esc(i.text)}</p>` : ""
              }</div></li>`,
          )
          .join("")}</ol></section>`;

      case "chart": {
        const points = (s.items ?? []).filter((i) => Number.isFinite(i.value));
        const max = Math.max(...points.map((i) => Number(i.value)), 1);
        return `<section class="slide">${head2}<div class="chart">${points
          .map(
            (i) =>
              `<div class="bar"><span class="v">${esc(String(i.value))}${
                s.unit ? `<i>${esc(s.unit)}</i>` : ""
              }</span><div class="fill" style="height:${(Number(i.value) / max) * 100}%"></div>` +
              `<span class="cat">${esc(i.label)}</span></div>`,
          )
          .join("")}</div></section>`;
      }

      case "timeline":
        return `<section class="slide">${head2}<div class="timeline">${(s.items ?? [])
          .slice(0, 5)
          .map(
            (i) =>
              `<div class="ev"><strong>${esc(i.label)}</strong><span class="dot"></span>` +
              `<p>${esc(i.text)}</p></div>`,
          )
          .join("")}</div></section>`;

      case "table": {
        const t = s.table;
        if (!t?.header?.length) return `<section class="slide">${head2}</section>`;
        return `<section class="slide">${head2}<table><thead><tr>${t.header
          .map((c) => `<th>${esc(c)}</th>`)
          .join("")}</tr></thead><tbody>${t.rows
          .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></section>`;
      }

      case "close":
        return `<section class="slide close"><h2>${esc(s.title)}</h2>
          <div class="rule light"></div>
          ${s.body || s.subtitle ? `<p>${esc(s.body ?? s.subtitle)}</p>` : ""}</section>`;

      default:
        return `<section class="slide">${head2}<ul class="bullets">${(s.bullets ?? [])
          .slice(0, 6)
          .map((b) => `<li>${esc(b)}</li>`)
          .join("")}</ul><span class="pn">${index + 1}</span></section>`;
    }
  };

  return `<!doctype html><html lang="${rtl ? "ar" : "en"}" dir="${dir}"><head>
<meta charset="utf-8"><title>${esc(deck.title)}</title>
<link rel="stylesheet" href="${fontsHref(theme)}">
<style>
:root{--accent:${accent};--wash:${wash};--soft:${soft};--ink:#16233A;--muted:#5B6A85}
*{box-sizing:border-box}
body{margin:0;background:#EEF1F6;font-family:${body};padding:22px;display:flex;flex-direction:column;align-items:center;gap:20px}
/* Slides are laid out at a fixed 960x540 so the preview matches the exported
   file exactly. Scaling to the available width is done in script below,
   because zoom needs a unitless ratio and CSS cannot divide a viewport width
   down to one. */
.slide{width:960px;height:540px;background:#fff;position:relative;overflow:hidden;
  box-shadow:0 2px 14px rgba(20,35,60,.13);border-radius:6px;padding:58px 60px;display:flex;flex-direction:column}
h1,h2,h3{font-family:${head};margin:0;color:var(--ink);line-height:1.22}
h2{font-size:34px;font-weight:700}
.sub{color:var(--muted);font-size:17px;margin:8px 0 0;font-style:italic}
.rule{width:110px;height:5px;background:var(--accent);margin:16px 0 0;border-radius:2px}
.rule.short{width:86px;margin:0 0 20px}
.rule.light{background:rgba(255,255,255,.5);width:96px;margin:18px auto}
.pn{position:absolute;bottom:22px;inset-inline-end:34px;color:var(--muted);font-size:13px}

.title{flex-direction:row;padding:0}
.title .panel{width:36%;background:var(--accent);position:relative}
.title .panel::after{content:"";position:absolute;inset-inline-start:-46px;bottom:-46px;width:190px;height:190px;
  border-radius:50%;background:rgba(255,255,255,.13)}
.title .titlebody{flex:1;padding:64px 58px;display:flex;flex-direction:column;justify-content:center}
.title h1{font-size:50px;font-weight:700}

.section{background:var(--wash);justify-content:center;padding-inline-start:96px}
.section .bar{position:absolute;inset-inline-start:0;top:0;bottom:0;width:15px;background:var(--accent)}
.big{font-size:44px;color:var(--accent)}

.statement{justify-content:center}
.eyebrow{color:var(--accent);font-weight:700;font-size:15px;letter-spacing:.06em;margin:0 0 14px}
.claim{font-family:${head};font-size:40px;font-weight:700;line-height:1.28;color:var(--ink);margin:0}

.quote{background:var(--wash);justify-content:center}
.mark{font-family:${head};font-size:130px;line-height:.7;color:var(--accent);height:64px}
blockquote{margin:26px 0 0;font-family:${head};font-size:31px;font-style:italic;line-height:1.34;color:var(--ink)}
.src{color:var(--muted);font-size:16px;margin-top:22px}
.src::before{content:"— "}

.grid{display:flex;gap:20px;margin-top:30px;flex:1}
.stat{flex:1;background:var(--wash);border-radius:10px;padding:26px 20px;text-align:center;position:relative;
  overflow:hidden;display:flex;flex-direction:column;justify-content:center}
.stat .cap{position:absolute;inset-inline:0;top:0;height:7px;background:var(--accent)}
.stat strong{display:block;font-family:${head};font-size:52px;color:var(--accent);line-height:1.1}
.stat span{display:block;margin-top:12px;color:var(--muted);font-size:15px;line-height:1.42}
.col{flex:1;display:flex;flex-direction:column}
.col .cap{height:6px;background:var(--accent);border-radius:2px}
.col h3{font-size:21px;margin:16px 0 8px}
.col p{margin:0;color:var(--muted);font-size:16px;line-height:1.5}
.side{flex:1;border-radius:10px;overflow:hidden;padding:0 0 20px;display:flex;flex-direction:column}
.side h3{font-size:18px;padding:14px 20px;margin:0}
.side.a{background:#F4F6FA}.side.a h3{background:var(--soft);color:var(--ink)}
.side.b{background:var(--wash)}.side.b h3{background:var(--accent);color:#fff}
.side p{margin:0 20px;font-size:16px;line-height:1.5;color:var(--muted);flex:1;display:flex;align-items:center}
.side.b p{color:var(--ink)}

.steps{list-style:none;margin:26px 0 0;padding:0;flex:1;display:flex;flex-direction:column;
  justify-content:center;gap:18px}
.steps li{display:flex;gap:18px;align-items:flex-start}
.num{flex:0 0 42px;height:42px;border-radius:50%;background:var(--accent);color:#fff;
  font-family:${head};font-weight:700;display:flex;align-items:center;justify-content:center;font-size:18px}
.steps strong{font-family:${head};font-size:19px;color:var(--ink)}
.steps p{margin:3px 0 0;color:var(--muted);font-size:15px}

.bullets{margin:28px 0 0;padding:0;list-style:none;flex:1;display:flex;flex-direction:column;
  justify-content:center;gap:18px}
.bullets li{position:relative;padding-inline-start:26px;font-size:20px;color:var(--ink);line-height:1.45}
.bullets li::before{content:"";position:absolute;inset-inline-start:0;top:.55em;width:10px;height:10px;background:var(--accent)}

.chart{flex:1;display:flex;align-items:flex-end;gap:22px;margin-top:34px;padding-bottom:34px}
.bar{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;position:relative}
.bar .fill{width:100%;max-width:110px;background:var(--accent);border-radius:6px 6px 0 0;min-height:6px}
.bar .v{font-family:${head};font-weight:700;font-size:20px;color:var(--accent);margin-bottom:8px}
.bar .v i{font-style:normal;font-size:13px;margin-inline-start:2px;opacity:.75}
.bar .cat{position:absolute;bottom:-30px;font-size:14px;color:var(--muted);text-align:center;line-height:1.25}

/* No flex:1 — the block sits on its own auto margins so it centres in the
   space under the heading, while every event still starts at the same y so
   the dots line up on the rail. */
.timeline{display:flex;gap:14px;margin:auto 0;position:relative}
.timeline::before{content:"";position:absolute;inset-inline:8%;top:34px;height:3px;background:var(--soft)}
.ev{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center}
.ev strong{font-family:${head};font-size:17px;color:var(--accent);margin-bottom:10px}
.ev .dot{width:15px;height:15px;border-radius:50%;background:var(--accent);position:relative;z-index:1}
.ev p{margin:14px 4px 0;font-size:14px;color:var(--muted);line-height:1.45}

table{width:100%;border-collapse:collapse;margin-top:26px;font-size:16px}
th{background:var(--accent);color:#fff;text-align:start;padding:11px 14px}
td{padding:11px 14px;border-bottom:1px solid #E3E8F0}
tbody tr:nth-child(odd){background:var(--wash)}

.close{background:var(--accent);align-items:center;justify-content:center;text-align:center}
.close h2{color:#fff;font-size:40px}
.close p{color:rgba(255,255,255,.9);font-size:19px;max-width:660px;line-height:1.5}
</style></head><body>
${deck.slides.map(slideHtml).join("\n")}
</body></html>`;
}
