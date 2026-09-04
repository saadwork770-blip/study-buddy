// Compiles agents/*.md into a TypeScript module so the personas are bundled
// with the app instead of being read from disk at request time (which breaks
// on serverless deploys).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentsDir = join(root, "agents");

/** Pulls the YAML-ish frontmatter block off the top of a persona file. */
function parse(raw) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, "\n"));
  if (!match) throw new Error("missing frontmatter");

  const meta = {};
  for (const line of match[1].split("\n")) {
    const field = /^(\w+):\s*(.*)$/.exec(line);
    if (field) meta[field[1]] = field[2].replace(/^["']|["']$/g, "").trim();
  }
  return { meta, body: match[2].trim() };
}

const experts = readdirSync(agentsDir)
  .filter((file) => file.endsWith(".md") && file !== "NOTICE.md")
  .sort()
  .map((file) => {
    const { meta, body } = parse(readFileSync(join(agentsDir, file), "utf8"));
    return {
      id: file.replace(/\.md$/, ""),
      name: meta.name ?? file,
      description: meta.description ?? "",
      emoji: meta.emoji ?? "🎓",
      body,
    };
  });

const header = `// GENERATED FILE - do not edit.
// Source: agents/*.md (vendored from msitarzewski/agency-agents, MIT).
// Regenerate with: node scripts/build-experts.mjs
`;

// Server-side module: carries the full persona bodies.
writeFileSync(
  join(root, "lib", "experts.generated.ts"),
  `${header}
export interface ExpertPersona {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** The full persona prompt, minus its frontmatter. */
  body: string;
}

export const EXPERT_PERSONAS: ExpertPersona[] = ${JSON.stringify(experts, null, 2)};
`,
);

// Client module: metadata only, so the ~12k words of persona text stay on the
// server instead of being shipped in the browser bundle.
const meta = experts.map(({ id, name, description, emoji }) => ({
  id,
  name,
  description,
  emoji,
}));

writeFileSync(
  join(root, "lib", "experts-meta.generated.ts"),
  `${header}
export interface ExpertMeta {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

export const EXPERT_META: ExpertMeta[] = ${JSON.stringify(meta, null, 2)};
`,
);

console.log(`build-experts: wrote ${experts.length} personas (+ client metadata)`);
