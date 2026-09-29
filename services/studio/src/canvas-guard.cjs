"use strict";

/**
 * The diagram agent's Bash guard, the check itself (`diagram-guard.ts` says
 * why it exists and how it is wired). Plain CommonJS with no imports, because
 * this exact text is copied into each job's hook file and run there by node
 * alone: the tests load this file, and the hook runs this file, so the two
 * cannot drift apart.
 *
 * `canvasCommandAllowed(command, policy)` is true only for
 *
 *   npm run --silent canvas -- <verb> <argument>...
 *
 * where the verb is one the diagram agent is taught, every flag is one that
 * verb takes (and not one that launches a browser the agent chooses or opens
 * a window or a port), every file argument is an absolute path to the job's
 * candidate document, its SVG, or a file inside its scratch directory, and
 * every other value is a plain word, a number, or a quoted string with no
 * `$`, backtick or backslash in it.
 *
 * The command is read by a tokenizer that knows three token shapes and
 * nothing else: a bare word of `[A-Za-z0-9_./:,@+=-]` not starting with `=`
 * (zsh expands a leading `=`), a single-quoted string, and a double-quoted
 * string. Tokens are separated by spaces. Anything else in the line, which is
 * every pipe, list, substitution, redirect, background `&`, glob, brace,
 * tilde, variable, comment, escape, tab and line break a shell would act on,
 * makes the whole command a refusal. So what the shell passes to npm is
 * exactly the token values this checked, whatever the CLI's matcher would
 * have made of the line.
 */

/** The fixed prefix, token by token. `--silent` is required: without it `--json` output is unparseable. */
const PREFIX = ["npm", "run", "--silent", "canvas", "--"];

const BARE = /^[A-Za-z0-9_./:,@+-][A-Za-z0-9_./:,@+=-]*$/;
/** What a quoted string may hold: no quote of its kind, no `$`, backtick or backslash, no control character. */
const QUOTED_BODY = /^[^\u0000-\u001f\u007f$`\\]*$/;
const NUMBER = /^[0-9]+(\.[0-9]+)?$/;

/**
 * The flags each kind of value is checked as. `path` is a file argument,
 * `text` any token, `number` a non-negative number, `flag` takes no value.
 */
const GLOBAL_FLAGS = {
  "--json": "flag",
  "--quiet": "flag",
  "--allow-lints": "flag",
  "--timeout": "number",
  "--page": "text",
  "--padding": "number",
  "--pixel-ratio": "number",
  // Left out on purpose: `--chromium <path>` launches the binary it names,
  // and `--headed` opens a window on the owner's screen.
};

const META_FLAGS = { "--title": "text", "--topic": "text", "--concept": "text", "--source": "text" };

/**
 * The verbs the agent is taught (docs/STUDIO-CHAT-FIRST.md's manual,
 * `prompt.ts`), with the flags each takes in tldrawkc's own table
 * (`COMMAND_OPTIONS` in tools/tldrawkc/src/cli/args.ts) and how many file
 * arguments. `list` and `serve` are not here: one walks a directory the agent
 * names, the other opens a port and a browser.
 */
const VERBS = {
  api: { files: 0, flags: {} },
  doctor: { files: 0, flags: {} },
  inspect: { files: 1, flags: {} },
  new: { files: 1, flags: { "--from": "path", ...META_FLAGS } },
  run: {
    files: 1,
    flags: {
      "--code": "path",
      "--eval": "text",
      "--shot": "path",
      "--svg": "path",
      "--create": "flag",
      "--no-save": "flag",
      "--no-subset-fonts": "flag",
    },
  },
  shot: { files: 1, flags: { "-o": "path", "--output": "path", "--ids": "text" } },
  export: { files: 1, flags: { "--svg": "path", "--png": "path", "--ids": "text", "--no-subset-fonts": "flag" } },
  "from-mermaid": { files: 1, flags: { "--source": "path", "--append": "flag", "--shot": "path" } },
  verify: { files: 1, flags: { "-o": "path", "--output": "path", "--width": "number" } },
  // `meta set <doc>`: the subcommand is checked as the first word below.
  meta: { files: 1, flags: META_FLAGS, sub: "set" },
};

/**
 * The command's words as the shell will pass them, or null when the line
 * holds anything but the three token shapes.
 */
function tokenize(command) {
  const tokens = [];
  let i = 0;
  while (i < command.length) {
    if (command[i] === " ") {
      i += 1;
      continue;
    }
    let value;
    const quote = command[i];
    if (quote === "'" || quote === '"') {
      const end = command.indexOf(quote, i + 1);
      if (end === -1) return null;
      value = command.slice(i + 1, end);
      if (!QUOTED_BODY.test(value)) return null;
      i = end + 1;
    } else {
      let end = command.indexOf(" ", i);
      if (end === -1) end = command.length;
      value = command.slice(i, end);
      if (!BARE.test(value)) return null;
      i = end;
    }
    // A quoted string glued to anything (`"a"b`, `--x="a"`) is a shape this does not read.
    if (i < command.length && command[i] !== " ") return null;
    tokens.push(value);
  }
  return tokens;
}

/** An absolute path with `.` and repeated slashes removed, or null for a relative one or any `..`. */
function normal(value) {
  if (!value.startsWith("/")) return null;
  const parts = [];
  for (const part of value.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

/** One of the job's two candidate files, or a file somewhere inside its scratch directory. */
function pathAllowed(value, policy) {
  const target = normal(value);
  if (target === null) return false;
  if (policy.files.includes(target)) return true;
  return policy.dirs.some((dir) => target.startsWith(`${dir}/`));
}

function valueAllowed(kind, value, policy) {
  if (kind === "path") return pathAllowed(value, policy);
  if (kind === "number") return NUMBER.test(value);
  // A value that looks like a flag is one tldrawkc's parser might read as a
  // flag rather than a value, and a check that agrees with the parser only
  // most of the time is not a check.
  return kind === "text" && !value.startsWith("-");
}

function canvasCommandAllowed(command, policy) {
  if (typeof command !== "string" || policy === null || typeof policy !== "object") return false;
  if (!Array.isArray(policy.files) || !Array.isArray(policy.dirs)) return false;
  const tokens = tokenize(command);
  if (tokens === null || tokens.length <= PREFIX.length) return false;
  for (let i = 0; i < PREFIX.length; i += 1) if (tokens[i] !== PREFIX[i]) return false;
  const verb = tokens[PREFIX.length];
  const spec = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
  if (spec === undefined) return false;
  let rest = tokens.slice(PREFIX.length + 1);
  if (spec.sub !== undefined) {
    if (rest[0] !== spec.sub) return false;
    rest = rest.slice(1);
  }
  let files = 0;
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith("-") && token !== "-") {
      const kind = Object.hasOwn(spec.flags, token)
        ? spec.flags[token]
        : Object.hasOwn(GLOBAL_FLAGS, token)
          ? GLOBAL_FLAGS[token]
          : undefined;
      if (kind === undefined) return false;
      if (kind === "flag") continue;
      i += 1;
      if (i >= rest.length || !valueAllowed(kind, rest[i], policy)) return false;
      continue;
    }
    if (!pathAllowed(token, policy)) return false;
    files += 1;
  }
  return files === spec.files;
}

module.exports = { canvasCommandAllowed };
