import type { Lang } from "./i18n";

export type CiteStyle = "apa7" | "mla9" | "chicago" | "harvard" | "ieee";

export interface Reference {
  id: string;
  /** As written on the source: "الزهراني، محمد" or "Garrison, D. R.". */
  authors: string;
  year: string;
  title: string;
  /** Journal, publisher, conference — whatever carries the work. */
  container?: string;
  /** Volume(issue), pages, edition. */
  detail?: string;
  url?: string;
  doi?: string;
}

export const CITE_STYLES: { id: CiteStyle; ar: string; en: string }[] = [
  { id: "apa7", ar: "APA 7", en: "APA 7" },
  { id: "mla9", ar: "MLA 9", en: "MLA 9" },
  { id: "chicago", ar: "شيكاغو", en: "Chicago" },
  { id: "harvard", ar: "هارفارد", en: "Harvard" },
  { id: "ieee", ar: "IEEE", en: "IEEE" },
];

export const referencesHeading = (style: CiteStyle, lang: Lang): string => {
  if (lang === "ar") return style === "mla9" ? "الأعمال المستشهد بها" : "المراجع";
  return style === "mla9" ? "Works Cited" : style === "ieee" ? "References" : "References";
};

/**
 * Splits an author field into people. Latin lists are the awkward case, since
 * the comma separates surname from initials as well as one author from the
 * next — so match the "Surname, A. B." shape instead of splitting blindly.
 * Arabic lists separate people with "و", and "،" sits inside a single name.
 */
function authorParts(authors: string): string[] {
  const latin = authors.match(/[\p{Lu}][\p{L}'\-]+,\s*(?:[\p{Lu}]\.\s*)+/gu);
  if (latin?.length) return latin.map((part) => part.trim().replace(/,$/, ""));
  return authors
    .split(/[;؛]|\s+&\s+|\s+and\s+|\s+و(?=\s)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The family name alone, which is what author-date styles print. */
function surnameOf(part: string): string {
  return part.split(/[,،]/)[0].trim() || part.trim();
}

/** Surname of the first author, for sorting and single-author citations. */
function surname(authors: string): string {
  return surnameOf(authorParts(authors)[0] ?? authors);
}

/**
 * The in-text marker for a reference. IEEE numbers its sources, so it needs the
 * position in the list; the rest are author-date or author-page.
 */
export function inTextCitation(
  reference: Reference,
  style: CiteStyle,
  index: number,
  lang: Lang,
): string {
  if (style === "ieee") return `[${index + 1}]`;

  // APA 7, Harvard, Chicago and MLA all name both authors for a pair, and
  // shorten to "et al." only from three onwards.
  const parts = authorParts(reference.authors).map(surnameOf);
  const name =
    parts.length === 2
      ? parts.join(lang === "ar" ? " و" : " & ")
      : parts[0] + (parts.length > 2 ? (lang === "ar" ? " وآخرون" : " et al.") : "");

  const comma = lang === "ar" ? "،" : ",";
  switch (style) {
    case "mla9":
      return `(${name})`;
    case "chicago":
      return `(${name} ${reference.year})`;
    default:
      return `(${name}${comma} ${reference.year})`;
  }
}

const join = (parts: (string | undefined)[], sep = " ") =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(sep)
    // Author fields often already end in a period; do not double it up.
    .replace(/\.{2,}/g, ".")
    .replace(/\.\s*,/g, ".,")
    .replace(/,\s*\./g, ".");

const link = (reference: Reference) =>
  reference.doi ? `https://doi.org/${reference.doi.replace(/^https?:\/\/doi\.org\//, "")}` : reference.url;

/** One formatted entry for the reference list, in the chosen style. */
export function formatReference(
  reference: Reference,
  style: CiteStyle,
  index: number,
): string {
  const { authors, year, title, container, detail } = reference;
  const url = link(reference);

  switch (style) {
    case "mla9":
      // Author. "Title." Container, detail, year, URL.
      return join([
        authors && `${authors}.`,
        title && `"${title}."`,
        container && `*${container}*,`,
        detail && `${detail},`,
        year && `${year},`,
        url,
      ]).replace(/,\s*$/, "");

    case "chicago":
      // Author. "Title." Container detail (year). URL.
      return join([
        authors && `${authors}.`,
        title && `"${title}."`,
        container && `*${container}*`,
        detail,
        year && `(${year}).`,
        url,
      ]);

    case "harvard":
      // Author (year) 'Title', Container, detail. URL.
      return join([
        authors,
        year && `(${year})`,
        title && `'${title}',`,
        container && `*${container}*,`,
        detail && `${detail}.`,
        url,
      ]);

    case "ieee":
      // [n] Author, "Title," Container, detail, year. URL.
      return join([
        `[${index + 1}]`,
        authors && `${authors},`,
        title && `"${title},"`,
        container && `*${container}*,`,
        detail && `${detail},`,
        year && `${year}.`,
        url,
      ]);

    default:
      // APA 7 — Author (year). Title. Container, detail. URL
      return join([
        authors,
        year && `(${year}).`,
        title && `${title}.`,
        container && `*${container}*${detail ? "," : "."}`,
        detail && `${detail}.`,
        url,
      ]);
  }
}

/** APA and Harvard alphabetise; IEEE keeps citation order. */
export function orderReferences(references: Reference[], style: CiteStyle): Reference[] {
  if (style === "ieee") return references;
  return [...references].sort((a, b) =>
    surname(a.authors).localeCompare(surname(b.authors), "ar"),
  );
}

/** The whole reference list as Markdown, ready to append to a document. */
export function referenceSection(
  references: Reference[],
  style: CiteStyle,
  lang: Lang,
): string {
  const usable = references.filter((r) => r.authors?.trim() || r.title?.trim());
  if (!usable.length) return "";
  const ordered = orderReferences(usable, style);
  const lines = ordered.map((reference, index) => formatReference(reference, style, index));
  return `\n\n## ${referencesHeading(style, lang)}\n\n${lines
    .map((line) => `- ${line}`)
    .join("\n")}\n`;
}

/** What to tell the model so it cites in the student's chosen style. */
export function citationInstruction(
  style: CiteStyle,
  references: Reference[],
  lang: Lang,
): string {
  const name = CITE_STYLES.find((s) => s.id === style)?.en ?? "APA 7";
  const lines = [
    `Cite in ${name} style. In-text citations must match that style exactly${
      style === "ieee" ? " — numbered in square brackets, in order of first appearance" : ""
    }.`,
    "Do not invent sources. Where a claim needs one you were not given, write [مرجع مطلوب] / [citation needed] instead of inventing a plausible-looking reference.",
  ];

  const usable = references.filter((r) => r.authors?.trim() || r.title?.trim());
  if (usable.length) {
    lines.push(
      "",
      "These are the student's sources. Cite them where they genuinely support a claim, and do not cite one for something it does not say:",
      ...orderReferences(usable, style).map(
        (reference, index) =>
          `${inTextCitation(reference, style, index, lang)} — ${join([
            reference.authors,
            reference.year && `(${reference.year})`,
            reference.title,
          ])}`,
      ),
      "",
      "Do not write the reference list yourself; it is appended automatically.",
    );
  }

  return lines.join("\n");
}
