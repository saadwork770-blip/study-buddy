/** Shared between client and server, so neither imports the other's module. */
export const PROVIDER_IDS = ["gemini", "groq", "cerebras", "openrouter", "mistral", "github", "anthropic"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
