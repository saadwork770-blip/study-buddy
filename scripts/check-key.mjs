// Verifies GEMINI_API_KEY actually works, before you deploy.
//   npm run check
import { readFileSync } from "node:fs";

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch {
    /* no such file - fall back to the real environment */
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!key) {
  console.error("✗ GEMINI_API_KEY is not set.");
  console.error("  Get one free at https://aistudio.google.com/apikey");
  console.error("  Then put it in .env.local:  GEMINI_API_KEY=AIza...");
  process.exit(1);
}

console.log(`… asking ${model} to reply, using the key in your environment`);

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-goog-api-key": key },
  body: JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
    generationConfig: { maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 0 } },
  }),
});

if (!response.ok) {
  const body = await response.text();
  console.error(`✗ HTTP ${response.status}`);
  if (response.status === 400 && /API_KEY_INVALID|not valid/i.test(body))
    console.error("  The key was rejected. Check you copied all of it.");
  else if (response.status === 429)
    console.error("  Free-tier quota reached for now. Wait and re-run, or slow down.");
  else if (response.status === 403)
    console.error("  The key exists but is not allowed to call this model.");
  console.error("  " + body.slice(0, 400));
  process.exit(1);
}

const data = await response.json();
const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text).join("").trim();
console.log(`✓ Working. ${model} replied: ${text || "(no text)"}`);
const u = data.usageMetadata;
if (u) console.log(`  tokens in/out: ${u.promptTokenCount}/${u.candidatesTokenCount}`);
