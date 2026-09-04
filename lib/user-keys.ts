"use client";

import { PROVIDER_IDS } from "./provider-ids";

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

export const KEY_FIELDS: { id: string; label: string; ar: string; hint: string; arHint: string; url: string }[] = [
  {
    id: "gemini",
    label: "Gemini",
    ar: "Gemini",
    hint: "The main provider. Leave empty to use the one deployed with the site.",
    arHint: "المزوّد الأساسي. اتركه فارغاً لاستخدام المفتاح المنشور مع الموقع.",
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
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UserKeys) : {};
  } catch {
    return {};
  }
}

export function writeKeys(keys: UserKeys) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    /* storage disabled */
  }
}

/** Only send keys that are actually filled in. */
export function keysForRequest(): UserKeys {
  const keys = readKeys();
  const out: UserKeys = {};
  for (const id of PROVIDER_IDS) {
    const value = keys[id]?.trim();
    if (value) out[id] = value;
  }
  return out;
}

/** Adds the student's keys to a JSON request body. */
export function withKeys<T extends object>(body: T): T & { keys?: UserKeys } {
  const keys = keysForRequest();
  return Object.keys(keys).length ? { ...body, keys } : body;
}
