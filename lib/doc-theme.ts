/**
 * The design of an exported document: type, colour and layout choices that
 * every exporter honours, so Word, PDF, HTML and PowerPoint come out looking
 * like the same document.
 */
export interface DocTheme {
  preset: string;
  accent: string;
  /** Keys into FONTS. */
  headingFont: string;
  bodyFont: string;
  /** Body size in points. */
  fontSize: number;
  lineHeight: number;
  justify: boolean;
  headingRule: boolean;
  coverStyle: "centered" | "band" | "minimal";
  tableStyle: "filled" | "lines";
  pageSize: "a4" | "letter";
  margin: "narrow" | "normal" | "wide";
}

export interface FontChoice {
  id: string;
  ar: string;
  en: string;
  /** CSS stack for HTML and PDF. */
  css: string;
  /** The nearest font Word actually has installed. */
  word: string;
  /** Google Fonts family to request, if any. */
  google?: string;
}

export const FONTS: FontChoice[] = [
  {
    id: "naskh",
    ar: "أميري (نسخ)",
    en: "Amiri (Naskh)",
    css: '"Amiri","Traditional Arabic",Georgia,serif',
    word: "Traditional Arabic",
    google: "Amiri:wght@400;700",
  },
  {
    id: "plex",
    ar: "IBM Plex عربي",
    en: "IBM Plex Sans Arabic",
    css: '"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif',
    word: "Arial",
    google: "IBM+Plex+Sans+Arabic:wght@400;500;600;700",
  },
  {
    id: "cairo",
    ar: "القاهرة",
    en: "Cairo",
    css: '"Cairo","Segoe UI",Tahoma,sans-serif',
    word: "Arial",
    google: "Cairo:wght@400;600;700",
  },
  {
    id: "tajawal",
    ar: "تجوّل",
    en: "Tajawal",
    css: '"Tajawal","Segoe UI",Tahoma,sans-serif',
    word: "Arial",
    google: "Tajawal:wght@400;500;700",
  },
  {
    id: "serif",
    ar: "سيريف لاتيني",
    en: "Source Serif",
    css: '"Source Serif 4",Georgia,"Times New Roman",serif',
    word: "Times New Roman",
    google: "Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700",
  },
  {
    id: "system",
    ar: "افتراضي النظام",
    en: "System default",
    css: 'system-ui,"Segoe UI",Tahoma,sans-serif',
    word: "Calibri",
  },
];

export const fontById = (id: string): FontChoice =>
  FONTS.find((f) => f.id === id) ?? FONTS[1];

export const ACCENTS = [
  { id: "navy", hex: "#1F3864", ar: "كحلي", en: "Navy" },
  { id: "teal", hex: "#0D6A6F", ar: "أزرق مخضر", en: "Teal" },
  { id: "maroon", hex: "#7B2D3B", ar: "عنّابي", en: "Maroon" },
  { id: "forest", hex: "#1F5136", ar: "أخضر داكن", en: "Forest" },
  { id: "graphite", hex: "#2E3440", ar: "رمادي فحمي", en: "Graphite" },
  { id: "indigo", hex: "#3A3D8F", ar: "نيلي", en: "Indigo" },
];

export interface Preset {
  id: string;
  ar: string;
  en: string;
  theme: Omit<DocTheme, "preset">;
}

export const PRESETS: Preset[] = [
  {
    id: "classic",
    ar: "أكاديمي كلاسيكي",
    en: "Classic academic",
    theme: {
      accent: "#1F3864",
      headingFont: "naskh",
      bodyFont: "plex",
      fontSize: 12,
      lineHeight: 1.95,
      justify: true,
      headingRule: true,
      coverStyle: "centered",
      tableStyle: "filled",
      pageSize: "a4",
      margin: "normal",
    },
  },
  {
    id: "modern",
    ar: "حديث",
    en: "Modern",
    theme: {
      accent: "#0D6A6F",
      headingFont: "cairo",
      bodyFont: "plex",
      fontSize: 11.5,
      lineHeight: 1.85,
      justify: false,
      headingRule: false,
      coverStyle: "band",
      tableStyle: "lines",
      pageSize: "a4",
      margin: "normal",
    },
  },
  {
    id: "thesis",
    ar: "رسالة علمية",
    en: "Thesis",
    theme: {
      accent: "#2E3440",
      headingFont: "naskh",
      bodyFont: "naskh",
      fontSize: 13,
      lineHeight: 2.1,
      justify: true,
      headingRule: false,
      coverStyle: "minimal",
      tableStyle: "lines",
      pageSize: "a4",
      margin: "wide",
    },
  },
  {
    id: "report",
    ar: "تقرير رسمي",
    en: "Formal report",
    theme: {
      accent: "#7B2D3B",
      headingFont: "tajawal",
      bodyFont: "tajawal",
      fontSize: 11.5,
      lineHeight: 1.8,
      justify: true,
      headingRule: true,
      coverStyle: "band",
      tableStyle: "filled",
      pageSize: "a4",
      margin: "normal",
    },
  },
];

export const DEFAULT_THEME: DocTheme = { preset: "classic", ...PRESETS[0].theme };

export function presetTheme(id: string): DocTheme {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ? { preset: preset.id, ...preset.theme } : DEFAULT_THEME;
}

/** Page geometry in the units each exporter needs. */
export const PAGE = {
  a4: { css: "A4", widthMm: 210, heightMm: 297, twipsW: 11906, twipsH: 16838 },
  letter: { css: "Letter", widthMm: 216, heightMm: 279, twipsW: 12240, twipsH: 15840 },
} as const;

/** Margins in millimetres; Word wants twips (1mm = 56.7 twips). */
export const MARGINS = {
  narrow: 15,
  normal: 25,
  wide: 35,
} as const;

export const marginTwips = (margin: DocTheme["margin"]) =>
  Math.round(MARGINS[margin] * 56.7);

/** Hex without the leading # — the form Word and PowerPoint expect. */
export const bare = (hex: string) => hex.replace(/^#/, "").toUpperCase();

/** Mixes a colour towards white, for fills derived from the accent. */
export function tint(hex: string, amount: number): string {
  const value = hex.replace(/^#/, "");
  const to = (i: number) => parseInt(value.slice(i, i + 2), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const out = [mix(to(0)), mix(to(2)), mix(to(4))]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
  return out.toUpperCase();
}

/** The Google Fonts href a document needs for its chosen faces. */
export function fontsHref(theme: DocTheme): string {
  const families = [fontById(theme.headingFont), fontById(theme.bodyFont)]
    .map((f) => f.google)
    .filter((g, i, all): g is string => Boolean(g) && all.indexOf(g) === i);
  if (!families.length) return "";
  return `https://fonts.googleapis.com/css2?${families
    .map((f) => `family=${f}`)
    .join("&")}&display=swap`;
}
