/**
 * A model's name as a person reads it: `claude-fable-5-1[1m]` is "Fable 5.1,
 * 1M context", `claude-opus-5` "Opus 5", `sonnet` "Sonnet". The context-window
 * suffix the owner's settings carry is said in words rather than shown raw,
 * or left out with `context: false` where the room is short (a menu's
 * default), and a name that is none of these is left as it is.
 */
export function modelName(model: string, { context: withContext = true }: { context?: boolean } = {}): string {
  const suffix = /\[(\d+)([km])\]$/.exec(model);
  const bare = suffix === null ? model : model.slice(0, suffix.index);
  const context = suffix === null || !withContext ? "" : `, ${suffix[1]}${suffix[2]!.toUpperCase()} context`;
  const match = /^(?:claude-)?([a-z]+)((?:-\d+)*)$/.exec(bare);
  if (match === null || (match[2] === "" && !bare.startsWith("claude-") && !KNOWN_FAMILIES.has(match[1]!))) return model;
  const family = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1);
  const version = match[2]!.split("-").filter((part) => part !== "").join(".");
  return `${family}${version === "" ? "" : ` ${version}`}${context}`;
}

/** The aliases `claude --model` takes, which read as a name with no version. */
const KNOWN_FAMILIES = new Set(["fable", "opus", "sonnet", "haiku"]);
