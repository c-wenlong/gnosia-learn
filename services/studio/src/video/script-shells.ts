import { readFileSync, realpathSync } from "node:fs";

/**
 * The shells a console script's first line needs, resolved; none for a script
 * that names its interpreter. uv writes gnosia-audio's console script in a
 * `#!/bin/sh` form when the venv's python path is too long for a shebang (a
 * checkout at a long path), and macOS's `/bin/sh` then execs the shell
 * `/private/var/select/sh` names (bash): a narrate profile that allows the
 * script must allow both, or the step dies with "Failed to exec /bin/bash as
 * variant for /bin/sh" (measured for remotionkc, 2026-10-04).
 */
export function scriptShells(script: string): string[] {
  let first = "";
  try {
    first = readFileSync(script, "utf8").split("\n", 1)[0] ?? "";
  } catch {
    return [];
  }
  if (!/^#!\s*\/bin\/sh\s*$/.test(first)) return [];
  let variant: string | null = null;
  try {
    variant = realpathSync("/private/var/select/sh");
  } catch {
    variant = null;
  }
  return [...new Set(["/bin/sh", variant].filter((shell): shell is string => shell !== null))];
}
