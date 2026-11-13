import { readFile, appendFile } from "node:fs/promises";

/**
 * The two logs the gate's timing questions are answered from.
 *
 * `calls.ndjson` is the wrapper's: one line per call, written by a process
 * the agent can start and cannot edit. `reads.ndjson` is the runner's: every
 * sheet the agent's stream showed it Read successfully, with the runner's own
 * clock at the moment the tool's result arrived. The stream carries no
 * timestamps, and the wrapper and the runner share this machine's clock, so
 * "read after rendered" is a comparison of two instants from one clock.
 */

export interface CallStep {
  /** The profile the step ran in, or, for revideokc's build, `sidecars`: gnosia-audio's transcript writer, in the narration profile. */
  step: "render" | "narrate" | "sidecars";
  exitCode: number | null;
  signal?: string | null;
  ms: number;
}

export interface WrapperCall {
  /** manimkc's `preview` and revideokc's `still` are the same step, a render to look at: `isLook` says so. */
  verb: "api" | "lint" | "narrate" | "preview" | "still" | "build" | "refused";
  scenes?: string[];
  names?: string[];
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  steps?: CallStep[];
  sceneSha256?: string | null;
  /** Scenes whose sheet the call wrote (revideokc's one stills sheet shows every scene, so a still that wrote it names them all). */
  rendered?: string[];
  deliverable?: { written: boolean } | null;
}

export interface SheetRead {
  path: string;
  at: string;
}

function lines<T>(body: string, keep: (value: unknown) => value is T): T[] {
  const out: T[] = [];
  for (const line of body.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const value: unknown = JSON.parse(line);
      if (keep(value)) out.push(value);
    } catch {
      /* a torn last line, from a wrapper killed mid-write */
    }
  }
  return out;
}

const VERBS = new Set(["api", "lint", "narrate", "preview", "still", "build", "refused"]);

/**
 * Whether a call is a render made to be looked at: manimkc's `preview`, one
 * sheet per scene, or revideokc's `still`, one sheet for the whole video.
 * The job view's preview and look steps and the gate's step 10 count both.
 */
export function isLook(call: Pick<WrapperCall, "verb">): boolean {
  return call.verb === "preview" || call.verb === "still";
}

function isCall(value: unknown): value is WrapperCall {
  if (typeof value !== "object" || value === null) return false;
  const call = value as Record<string, unknown>;
  return typeof call.verb === "string" && VERBS.has(call.verb) && typeof call.startedAt === "string" && typeof call.endedAt === "string";
}

function isRead(value: unknown): value is SheetRead {
  if (typeof value !== "object" || value === null) return false;
  const read = value as Record<string, unknown>;
  return typeof read.path === "string" && typeof read.at === "string";
}

export async function readCalls(file: string): Promise<WrapperCall[]> {
  try {
    return lines(await readFile(file, "utf8"), isCall);
  } catch {
    return [];
  }
}

export async function readReads(file: string): Promise<SheetRead[]> {
  try {
    return lines(await readFile(file, "utf8"), isRead);
  } catch {
    return [];
  }
}

export async function appendRead(file: string, read: SheetRead): Promise<void> {
  await appendFile(file, `${JSON.stringify(read)}\n`, "utf8");
}

/**
 * The agent's stream, handled one line at a time and in order, with a way
 * to wait for the last line to be done.
 *
 * The stream's callback is synchronous and handling a line is not: a sheet
 * Read becomes a line in `reads.ndjson`, which the gate reads as soon as the
 * session ends. With each line's work started and forgotten, the gate could
 * read that file before the last Read landed and fail a job that had looked
 * at every sheet (Greptile on #201). Work is chained, so lines are handled in
 * the order they came, and `settled()` resolves once every line pushed so far
 * is handled. A line whose handling throws does not stop the ones after it.
 */
export class LineQueue {
  private tail: Promise<void> = Promise.resolve();

  push(work: () => Promise<void>): void {
    this.tail = this.tail.then(work).catch(() => undefined);
  }

  settled(): Promise<void> {
    return this.tail;
  }
}

/**
 * A stream line's successful Reads, matched across the two events that make
 * one: the `tool_use` that names the file, in an assistant message, and the
 * `tool_result` that says it worked, in the user message after it. Only a
 * result that is not an error counts: a Read the permission file refused was
 * not a look.
 */
export class ReadTracker {
  private readonly pending = new Map<string, string>();

  /** Every file path whose Read completed on this line. */
  observe(line: string): string[] {
    if (!line.includes("tool_use") && !line.includes("tool_result")) return [];
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return [];
    }
    const message = (event as { message?: { content?: unknown } } | null)?.message;
    const content = Array.isArray(message?.content) ? (message.content as unknown[]) : [];
    const done: string[] = [];
    for (const item of content) {
      if (typeof item !== "object" || item === null) continue;
      const block = item as Record<string, unknown>;
      if (block.type === "tool_use" && block.name === "Read" && typeof block.id === "string") {
        const input = block.input as { file_path?: unknown } | undefined;
        if (typeof input?.file_path === "string") this.pending.set(block.id, input.file_path);
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const file = this.pending.get(block.tool_use_id);
        if (file === undefined) continue;
        this.pending.delete(block.tool_use_id);
        if (block.is_error !== true) done.push(file);
      }
    }
    return done;
  }
}

/**
 * What the agent's last wrapper call printed, as the Bash tool handed it back:
 * the `tool_use` whose command names the job's wrapper, matched to its
 * `tool_result`. Kept for the job's events when its tools cannot start, since
 * the wrapper's log records exit codes and not output. The text is whatever
 * the call printed, an earlier step's output from the agent's own files
 * included, so it is shown to the owner and never put into a sentence the
 * planner reads.
 */
export class WrapperOutputTracker {
  private readonly pending = new Set<string>();
  private readonly wrapper: string;
  private readonly limit: number;
  last: string | null = null;

  constructor(wrapper: string, limit = 1_500) {
    this.wrapper = wrapper;
    this.limit = limit;
  }

  observe(line: string): void {
    if (!line.includes("tool_use") && !line.includes("tool_result")) return;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    const message = (event as { message?: { content?: unknown } } | null)?.message;
    const content = Array.isArray(message?.content) ? (message.content as unknown[]) : [];
    for (const item of content) {
      if (typeof item !== "object" || item === null) continue;
      const block = item as Record<string, unknown>;
      if (block.type === "tool_use" && block.name === "Bash" && typeof block.id === "string") {
        const command = (block.input as { command?: unknown } | undefined)?.command;
        if (typeof command === "string" && command.includes(this.wrapper)) this.pending.add(block.id);
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string" && this.pending.delete(block.tool_use_id)) {
        // Every wrapper call's result replaces the last, an empty one too:
        // an older call's text must never stand in for the call that ended.
        const text = resultText(block.content);
        this.last = text === "" ? null : text.length <= this.limit ? text : `…${text.slice(text.length - this.limit + 1)}`;
      }
    }
  }
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part === "object" && part !== null && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
    .join("\n")
    .trim();
}

/** The file paths the agent Edited on this line (the scene-code step). */
export function editsOn(line: string): string[] {
  if (!line.includes("tool_use")) return [];
  try {
    const event = JSON.parse(line) as { message?: { content?: unknown } };
    const content = Array.isArray(event.message?.content) ? (event.message.content as unknown[]) : [];
    return content.flatMap((item) => {
      const block = item as { type?: unknown; name?: unknown; input?: { file_path?: unknown } };
      return block.type === "tool_use" && (block.name === "Edit" || block.name === "Write" || block.name === "MultiEdit") && typeof block.input?.file_path === "string"
        ? [block.input.file_path]
        : [];
    });
  } catch {
    return [];
  }
}

/** True when the line is the result of a Bash call: the wrapper has exited, so `calls.ndjson` has its line. */
export function isToolResult(line: string): boolean {
  return line.includes("tool_result");
}
