import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import schema from "../templates/init/schema.yml" with { type: "text" };
import workflow from "../templates/init/WORKFLOW.md" with { type: "text" };
import spec from "../templates/init/Spec.md" with { type: "text" };
import decision from "../templates/init/Decision.md" with { type: "text" };
import effort from "../templates/init/Effort.md" with { type: "text" };
import type { Tree } from "../tree";
import type { Command, Result } from "./shared";

const FILES: [string, string][] = [
  [".lore/schema.yml", schema],
  [".lore/WORKFLOW.md", workflow],
  [".lore/templates/Spec.md", spec],
  [".lore/templates/Decision.md", decision],
  [".lore/templates/Effort.md", effort],
];

export const SKILLS = ["lore-spec", "lore-plan", "lore-build", "lore-ship", "lore-decide", "lore-next", "lore-graph"];
export const INSTALL = "npx skills add apisandipas/lore";
// Where agents look for skills, per project and per user. The skills CLI
// installs them; init only looks (see lore:0010).
const SKILL_DIRS = [".claude/skills", ".agents/skills"];

export function runInit(tree: Tree, opts: { json: boolean; home?: string }): Result {
  const { root } = tree;
  const created: string[] = [];
  const kept: string[] = [];
  for (const [path, text] of FILES) {
    // Never overwrite: an existing file may be this project's edited copy.
    if (tree.exists(path)) {
      kept.push(path);
      continue;
    }
    tree.write(path, text);
    created.push(path);
  }

  const home = opts.home ?? homedir();
  // The project's skill directories are in the tree; the user's are under ~,
  // which is not, so they are looked for on the disk.
  const places = [
    ...SKILL_DIRS.map((d) => ({ label: d, has: (skill: string) => tree.exists(`${d}/${skill}/SKILL.md`) })),
    ...SKILL_DIRS.map((d) => ({ label: `~/${d}`, has: (skill: string) => existsSync(join(home, d, skill, "SKILL.md")) })),
  ];
  const found = places.filter((p) => SKILLS.some(p.has)).map((p) => p.label);
  const missing = SKILLS.filter((s) => !places.some((p) => p.has(s)));

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

export const command: Command = { name: "init", flags: {}, graph: false, run: (tree, { json }) => runInit(tree, { json }) };
