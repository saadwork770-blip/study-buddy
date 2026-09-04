// Verifies ANTHROPIC_API_KEY actually works, before you deploy.
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
    /* no such file — fall back to the real environment */
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";

if (!key) {
  console.error("✗ ANTHROPIC_API_KEY is not set.");
  console.error("  Put it in .env.local:  ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}
if (!key.startsWith("sk-ant-")) {
  console.error('✗ That key does not look right — it should start with "sk-ant-".');
  process.exit(1);
}

console.log(`… asking ${model} to reply, using the key in your environment`);

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model,
    max_tokens: 1024,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Reply with the single word: OK" }],
  }),
});

if (!response.ok) {
  const body = await response.text();
  console.error(`✗ HTTP ${response.status}`);
  if (response.status === 401) console.error("  The key was rejected. Check you copied all of it.");
  else if (response.status === 400 && body.includes("credit"))
    console.error("  The account has no credit. Add some in the Anthropic console.");
  else if (response.status === 429) console.error("  Rate limited — wait a moment and re-run.");
  console.error("  " + body.slice(0, 400));
  process.exit(1);
}

const data = await response.json();
const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
console.log(`✓ Working. ${data.model} replied: ${text || "(no text)"}`);
console.log(`  tokens in/out: ${data.usage?.input_tokens}/${data.usage?.output_tokens}`);
