import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import schema from "../templates/init/schema.yml" with { type: "text" };
import workflow from "../templates/init/WORKFLOW.md" with { type: "text" };
import spec from "../templates/init/Spec.md" with { type: "text" };
import decision from "../templates/init/Decision.md" with { type: "text" };
import effort from "../templates/init/Effort.md" with { type: "text" };
import { findRoot } from "../tree";
import type { Result } from "./shared";

const FILES: [string, string][] = [
  [".lore/schema.yml", schema],
  [".lore/WORKFLOW.md", workflow],
  [".lore/templates/Spec.md", spec],
  [".lore/templates/Decision.md", decision],
  [".lore/templates/Effort.md", effort],
];

export const SKILLS = ["lore-spec", "lore-plan", "lore-build", "lore-ship", "lore-decide", "lore-next"];
export const INSTALL = "npx skills add apisandipas/lore";
// Where agents look for skills, per project and per user. The skills CLI
// installs them; init only looks (see lore:0010).
const SKILL_DIRS = [".claude/skills", ".agents/skills"];

export async function runInit(cwd: string, opts: { json: boolean; home?: string }): Promise<Result> {
  const root = findRoot(cwd);
  const created: string[] = [];
  const kept: string[] = [];
  for (const [path, text] of FILES) {
    const abs = join(root, path);
    // Never overwrite: an existing file may be this project's edited copy.
    if (existsSync(abs)) {
      kept.push(path);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    await Bun.write(abs, text);
    created.push(path);
  }

  const home = opts.home ?? homedir();
  const places = [
    ...SKILL_DIRS.map((d) => ({ label: d, abs: join(root, d) })),
    ...SKILL_DIRS.map((d) => ({ label: `~/${d}`, abs: join(home, d) })),
  ];
  const found = places.filter((p) => SKILLS.some((s) => existsSync(join(p.abs, s, "SKILL.md")))).map((p) => p.label);
  const missing = SKILLS.filter((s) => !places.some((p) => existsSync(join(p.abs, s, "SKILL.md"))));

  if (opts.json) return { code: 0, out: `${JSON.stringify({ root, created, kept, skills: { found, missing } }, null, 2)}\n` };
  const lines = [...created.map((p) => `created ${p}`), ...kept.map((p) => `kept ${p} (already there)`), ""];
  if (!missing.length) lines.push(`skills: found in ${found.join(", ")}`);
  else {
    const which = found.length ? `${missing.join(", ")} missing` : "not installed";
    lines.push(`skills: ${which}; install them with:`, `  ${INSTALL}`);
  }
  lines.push("", "Read .lore/WORKFLOW.md, then start a spec with lore-spec.");
  return { code: 0, out: `${lines.join("\n")}\n` };
}
