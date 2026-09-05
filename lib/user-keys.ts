"use client";

import { PROVIDER_IDS } from "./provider-ids";
import { type Cooldowns, prune } from "./cooldown";

/**
 * API keys the student pastes into the site itself, kept in their browser.
 *
 * This exists so adding a backup provider never requires editing environment
 * variables and redeploying. Keys are sent with each request, used for that
 * request, and never stored on the server; a key set in the server environment
 * still wins, so a deployed default is not overridden by accident.
 */
export type UserKeys = Record<string, string>;

const KEY = "sb.keys";
const COOL = "sb.cooldowns";
const CUSTOM = "sb.providers";

/** A provider the student added: anything speaking the OpenAI chat shape. */
export interface CustomProvider {
  id: string;
  label: string;
  baseUrl: string;
  model?: string;
  key: string;
}

const read = <T>(name: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(name);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (name: string, value: unknown) => {
  try {
    window.localStorage.setItem(name, JSON.stringify(value));
  } catch {
    /* storage disabled */
  }
};

/**
 * Which providers are spent, and until when.
 *
 * A serverless instance is discarded between requests, so the server cannot
 * remember that Gemini's daily quota ran out an hour ago. The browser can,
 * and it is the one thing present on every request — so it carries the state,
 * and the server sends back whatever it learns.
 */
export const readCooldowns = (): Cooldowns => prune(read<Cooldowns>(COOL, {}));

export function mergeCooldowns(learned: Cooldowns) {
  const merged = prune({ ...readCooldowns(), ...learned });
  write(COOL, merged);
  return merged;
}

export const clearCooldowns = () => write(COOL, {});

export const readProviders = (): CustomProvider[] => read<CustomProvider[]>(CUSTOM, []);
export const writeProviders = (list: CustomProvider[]) => write(CUSTOM, list);

export const KEY_FIELDS: { id: string; label: string; ar: string; hint: string; arHint: string; url: string }[] = [
  {
    id: "gemini",
    label: "Gemini",
    ar: "Gemini",
    hint: "The main provider — needed for file uploads and web search. A real key starts with AIza; the short-lived AQ. tokens AI Studio also hands out expire.",
    arHint: "المزوّد الأساسي — لازم لرفع الملفات والبحث في الويب. المفتاح الصحيح يبدأ بـ AIza؛ أمّا رموز AQ. المؤقّتة فتنتهي صلاحيتها.",
    url: "https://aistudio.google.com/apikey",
  },
  {
    id: "groq",
    label: "Groq",
    ar: "Groq",
    hint: "Free backup, no card — about 1,000 requests a day.",
    arHint: "احتياطي مجاني بلا بطاقة — نحو ١٠٠٠ طلب يومياً.",
    url: "https://console.groq.com/keys",
  },
  {
    id: "anthropic",
    label: "Claude",
    ar: "Claude",
    hint: "Paid, no free tier — billed per token. Used only after every free provider is spent.",
    arHint: "مدفوع بلا باقة مجانية — يُحاسَب بالاستهلاك. لا يُستخدم إلا بعد نفاد كل المزوّدين المجانيين.",
    url: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    ar: "Cerebras",
    hint: "Free backup, no card.",
    arHint: "احتياطي مجاني بلا بطاقة.",
    url: "https://cloud.cerebras.ai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    ar: "OpenRouter",
    hint: "Free models carry a :free suffix.",
    arHint: "النماذج المجانية تحمل اللاحقة ‎:free.",
    url: "https://openrouter.ai/keys",
  },
];

export function readKeys(): UserKeys {
  return read<UserKeys>(KEY, {});
}

export function writeKeys(keys: UserKeys) {
  write(KEY, keys);
}

/** Only send keys that are actually filled in. */
export function keysForRequest(): UserKeys {
  const keys = readKeys();
  const out: UserKeys = {};
  for (const id of PROVIDER_IDS) {
    const value = keys[id]?.trim();
    if (value) out[id] = value;
  }
  for (const provider of readProviders()) {
    if (provider.id?.trim() && provider.key?.trim()) {
      out[`custom:${provider.id.trim()}`] = provider.key.trim();
    }
  }
  return out;
}

/**
 * Adds everything the server needs to route the turn: the student's keys, the
 * providers they added, and which providers are known to be spent right now.
 */
export function withKeys<T extends object>(body: T): T & {
  keys?: UserKeys;
  cooldowns?: Cooldowns;
  custom?: CustomProvider[];
} {
  const keys = keysForRequest();
  const cooldowns = readCooldowns();
  const custom = readProviders().filter((p) => p.baseUrl?.trim() && p.key?.trim());
  return {
    ...body,
    ...(Object.keys(keys).length ? { keys } : {}),
    ...(Object.keys(cooldowns).length ? { cooldowns } : {}),
    ...(custom.length ? { custom } : {}),
  };
}
