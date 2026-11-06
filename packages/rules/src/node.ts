import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules } from "./library";
import type { Rule } from "./schema";

/** Absolute path of the library's rule folder (packages/rules/rules). */
export const RULES_DIR = fileURLToPath(new URL("../rules/", import.meta.url));

/**
 * Node-only loader: read every .yaml/.yml file in `dir` and validate it. Throws RulesLoadError listing every
 * problem (malformed YAML, schema errors, duplicate ids). Workers should bundle the text and call `parseRules`.
 */
export function loadRules(dir: string = RULES_DIR): Rule[] {
  const files = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
  return parseRules(files.map((f) => ({ path: f, text: readFileSync(join(dir, f), "utf8") })));
}
