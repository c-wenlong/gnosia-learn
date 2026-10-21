import { access, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { agentEnv } from "./agent";

/**
 * The Codex harness: OpenAI's Codex CLI (`codex exec`), run on the owner's
 * own codex login — ChatGPT or an API key — the way `claude` runs on the
 * claude login. Codex reads no provider key the way BYOK does; `codex login`
 * is the setup, and `codexSignedIn` is how the pick tells it is done.
 *
 * Codex's headless surface is `codex exec --json`: `thread.started`,
 * `turn.started`, `item.*` and `turn.*` NDJSON, a shape of its own rather
 * than claude's, so `planner.ts` translates the lines rather than sharing
 * the parser (`codexEvent`). Sessions are threads: `thread.started` mints
 * the id, and a later turn continues it as `codex exec resume <id>`.
 *
 * The seal is the draft's own `CODEX_HOME`, not flags: codex loads the
 * owner's `config.toml`, `AGENTS.md`, skills and plugins from it, so the
 * spawn's `CODEX_HOME` is a per-draft directory holding only a symlink to
 * the real `auth.json` — the login shared, everything else sealed. `HOME`
 * is sealed the way `byokEnv` seals it, so the `~/.agents/skills` and
 * `~/.codex` reads resolve nowhere.
 */

/** The real `CODEX_HOME`: the env's own, else `~/.codex`. */
export function codexHome(env: NodeJS.ProcessEnv): string {
  return env.CODEX_HOME ?? path.join(env.HOME ?? homedir(), ".codex");
}

/** Whether a `codex exec` can authenticate: a login file, or an API key in env. */
export async function codexSignedIn(env: NodeJS.ProcessEnv): Promise<boolean> {
  if (typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.trim() !== "") return true;
  return access(path.join(codexHome(env), "auth.json")).then(() => true, () => false);
}

/**
 * Make the draft's sealed `CODEX_HOME` under `tmp` and link the real
 * `auth.json` into it — a symlink, so a refreshed token reaches both.
 * `linked` says whether one was found: without it, `OPENAI_API_KEY` is the
 * spawn's only credential and `codexEnv` must keep it rather than strip it.
 */
export async function sealCodexHome(tmp: string, env: NodeJS.ProcessEnv): Promise<{ home: string; linked: boolean }> {
  const home = path.join(tmp, "codex-home");
  await mkdir(home, { recursive: true });
  const real = path.join(codexHome(env), "auth.json");
  const link = path.join(home, "auth.json");
  const linked = (await access(real).then(() => true, () => false));
  if (linked) {
    const target = await readlink(link).catch(() => null);
    if (target !== real) {
      await rm(link, { force: true });
      await symlink(real, link).catch(() => undefined);
    }
  } else {
    await rm(link, { force: true });
  }
  return { home, linked };
}

/**
 * The codex spawn's environment: `agentEnv`'s login-mode seal (no ambient
 * Anthropic auth) plus OpenAI's own auth variables removed — unless the
 * owner's `OPENAI_API_KEY` *is* the credential, which it is when the sealed
 * home linked no `auth.json` (`codexSignedIn` and the spawn then agree: the
 * key that passed the gate is the key that reaches the process). `HOME` and
 * `CODEX_HOME` are the draft's: skills, plugins, hooks, MCP servers and
 * `AGENTS.md` all resolve inside the sealed home, which holds only
 * `auth.json`.
 */
export function codexEnv(base: NodeJS.ProcessEnv, tmp: string, home: string, opts?: { keepKey?: boolean }): NodeJS.ProcessEnv {
  const env = agentEnv(base, "login", tmp);
  if (opts?.keepKey !== true) {
    delete env.OPENAI_API_KEY;
    delete env.OPENAI_BASE_URL;
  }
  env.HOME = tmp;
  env.CODEX_HOME = home;
  return env;
}
