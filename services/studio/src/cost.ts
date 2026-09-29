/**
 * What a job spent, and how sure we are of the number.
 *
 * A10 recorded `cost_usd` from the agent's final `stream-json` result event and
 * from nowhere else. That figure is exact, and it has three holes.
 *
 * **A job is up to three attempts and the column held one.** `finish` read the
 * last attempt's result event, so a job that failed its gate twice and passed
 * on the third recorded a third of what it cost.
 *
 * **An interrupted job records nothing at all**, which phase 3 wrote down as a
 * known gap: the process that would read the result event is the process that
 * died, and three interrupted rows from that phase's testing say `$0.00` for
 * work that was really paid for.
 *
 * **A killed attempt may write no result event.** The runner sends SIGTERM to
 * the process group and SIGKILL five seconds later, and whether the CLI flushes
 * a result in between is not something this repo has evidence for either way —
 * every one of the nine finished sessions on disk exited cleanly and has one.
 * So this module does not assume the answer. It prefers the result event
 * wherever one arrives and accumulates where one does not, which is right under
 * both readings.
 *
 * ## What the intermediate events actually carry
 *
 * Established by parsing the nine real `session.ndjson` files phases 3 and 4
 * left behind, not by assuming. Every `type: "assistant"` event carries
 * `message.usage`:
 *
 * ```
 * {"input_tokens":2,"cache_creation_input_tokens":8474,"cache_read_input_tokens":22277,
 *  "cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":8474},
 *  "output_tokens":16,"service_tier":"standard"}
 * ```
 *
 * plus `message.model` (`claude-sonnet-5`). Nothing else in the stream carries
 * usage: `system/init`, `system/task_summary`, `system/thinking_tokens`,
 * `system/post_turn_summary`, `system/permission_denied`, `user` and
 * `rate_limit_event` all have none.
 *
 * Two properties of those numbers decide the shape of this module.
 *
 * **One event per content block, not per message.** A message whose content is
 * a `tool_use` and a `text` block arrives as two events sharing one
 * `message.id` and carrying the same `usage` object, so summing the events
 * double counts. Summing once per `message.id` reproduces the result event's
 * `input_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens`
 * **exactly, on all nine sessions**.
 *
 * **`output_tokens` is a floor, not a total.** It is the value from the API's
 * `message_start` frame, before the message finished generating, and nothing
 * later in the stream corrects it. Across those nine sessions the accumulated
 * output ran from 4% to 46% of the final figure — 65 tokens against 3,432 on
 * one, 703 against 5,889 on another.
 *
 * Because cache traffic rather than output is most of a drawing job's bill,
 * that lands the **whole estimate between 80% and 93% of the true cost**, on
 * every one of the nine (mean 88%). It is an under-estimate, always, and by a
 * knowable amount. Nothing here scales it up to close the gap: a fudge factor
 * would make the number unauditable against the CLI's own figure, which is the
 * one check that can catch a stale rate table. Instead every row records **where
 * its figure came from** — `result` for the exact one, `stream` for this one —
 * and every surface that shows a figure shows that beside it.
 *
 * `system/thinking_tokens` events carry a cumulative `estimated_tokens` and
 * were measured as a way to close the output gap. They do not: adding them
 * leaves five of the nine still low and pushes two over by half. They are not
 * used.
 */

/** Tokens of each kind, which is all pricing needs to know. */
export interface TokenUsage {
  inputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

/**
 * Where a recorded cost came from.
 *
 * `result` is the CLI's own `total_cost_usd`. `stream` is this module's
 * accumulation, which is an under-estimate for the reason above. A reader that
 * cannot tell them apart cannot tell a bill from a guess.
 */
export type CostSource = "result" | "stream";

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
};

/** US dollars per million tokens. */
export interface Rates {
  input: number;
  output: number;
  /** A five-minute cache write: 1.25x the input rate. */
  cacheWrite5m: number;
  /** A one-hour cache write: 2x the input rate. Claude Code uses this one. */
  cacheWrite1h: number;
  /** A cache read: 0.1x the input rate. */
  cacheRead: number;
}

const rates = (input: number, output: number, cacheRead: number = input * 0.1): Rates => ({
  input,
  output,
  cacheWrite5m: input * 1.25,
  cacheWrite1h: input * 2,
  cacheRead,
});

/**
 * The rate table. **One module, and this is it.**
 *
 * Base input and output rates are Anthropic's published first-party API list
 * prices as of **2026-09-22**, taken from the `claude-api` skill's model table
 * (itself cached 2026-06-24): Claude Sonnet 5 at $2.00 / $10.00 per MTok, and
 * Claude Opus 5 at $5.00 / $25.00. The three cache rates are the published
 * multipliers on the input rate — 1.25x for a five-minute write, 2x for a
 * one-hour write, 0.1x for a read.
 *
 * **Checked against real spend rather than trusted.** Pricing the result
 * event's own token counts with this table reproduces the CLI's
 * `total_cost_usd` to the last published digit on **all nine** finished
 * sessions on disk, from $0.131777 to $0.465849. Two of them, for the shape:
 *
 * | Job | tokens (in / 1h write / read / out) | priced here | `total_cost_usd` |
 * | --- | --- | --- | --- |
 * | `16ce74e7` | 12 / 18,715 / 207,915 / 1,531 | $0.131777 | $0.131777 |
 * | `da89c92d` | 26 / 50,830 / 837,984 / 9,488 | $0.465849 | $0.465849 |
 *
 * `services/studio/test/cost.test.ts` runs that check over the committed
 * fixture, so a rate that drifts fails a test rather than quietly mispricing a
 * cap. The same check by hand on a live job: `job.cost_usd` where
 * `cost_source` is `result` is the CLI's figure, and pricing that row's tokens
 * here should land on it.
 *
 * Keyed on the canonical model id the stream reports. The brief's own `sonnet`
 * and `opus` are aliases onto the current generation, which is what
 * `--model sonnet` resolves to at spawn time.
 */
export const RATE_TABLE: Readonly<Record<string, Rates>> = {
  "claude-sonnet-5": rates(2, 10),
  "claude-opus-5": rates(5, 25),
  // Added 2026-09-29 for the settings panel (D53 of docs/STUDIO-VIDEOS.md),
  // which offers every model this table prices. From the same skill table,
  // cached 2026-09-25. Cache reads are the published per-model figures where
  // they are not the 0.1x multiplier: $0.25 on Fable 5.1 and $0.20 on Opus 5.5.
  // Not yet checked against a finished session's `total_cost_usd` as the two
  // above were; a `result` figure is the CLI's own and never uses these.
  "claude-sonnet-5-5": rates(2, 10, 0.2),
  "claude-opus-5-5": rates(4, 20, 0.2),
  "claude-fable-5": rates(10, 50),
  "claude-fable-5-1": rates(10, 50, 0.25),
};

/** The model names a brief or the panel may pass, onto the id the table keys on. */
export const MODEL_ALIASES: Readonly<Record<string, string>> = {
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-5",
  fable: "claude-fable-5-1",
};

/**
 * The rates for a model, or null when the table has never heard of it.
 *
 * Null rather than a guess: a model this table does not price is a model whose
 * cost this module cannot honestly report, and inventing a rate would put a
 * number on a row that nothing backs up.
 */
export function ratesFor(model: string | null): Rates | null {
  return canonicalModel(model) === null ? null : (RATE_TABLE[canonicalModel(model)!] ?? null);
}

/**
 * The rate table's own name for a model, or null when it has none.
 *
 * The brief says `sonnet` and the stream says `claude-sonnet-5`, and a figure
 * that reports which of those it was priced at should say the one the table
 * keyed on rather than whichever spelling happened to arrive first.
 */
export function canonicalModel(model: string | null): string | null {
  if (model === null) return null;
  // A context-window suffix (`claude-fable-5-1[1m]`, as the owner's settings
  // name it) prices the same as the bare id.
  const bare = model.replace(/\[[0-9a-z]{1,8}\]$/, "");
  const canonical = MODEL_ALIASES[bare] ?? bare;
  return canonical in RATE_TABLE ? canonical : null;
}

/**
 * The table's id to price `model` at: its own when the table has it, else
 * the newest of its family by name (`fable`, `opus`, `sonnet`), else the
 * dearest rate in the table, so an unknown model over-counts against the cap
 * rather than under-counting.
 */
export function priceableAs(model: string): string {
  const own = canonicalModel(model);
  if (own !== null) return own;
  const lower = model.toLowerCase();
  for (const family of ["fable", "opus", "sonnet"] as const) {
    if (lower.includes(family)) return canonicalModel(family)!;
  }
  return Object.entries(RATE_TABLE).sort((a, b) => b[1].output - a[1].output)[0]![0];
}

/** Price one bag of tokens. Null when the model is not in the table. */
export function priceUsd(usage: TokenUsage, model: string | null): number | null {
  const rate = ratesFor(model);
  if (rate === null) return null;
  return (
    (usage.inputTokens * rate.input +
      usage.cacheWrite5mTokens * rate.cacheWrite5m +
      usage.cacheWrite1hTokens * rate.cacheWrite1h +
      usage.cacheReadTokens * rate.cacheRead +
      usage.outputTokens * rate.output) /
    1_000_000
  );
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Pull the five token counts out of one `message.usage` object. */
export function readUsage(raw: unknown): TokenUsage | null {
  const usage = record(raw);
  if (usage === null) return null;
  const creation = record(usage.cache_creation);
  const total = count(usage.cache_creation_input_tokens);
  // `cache_creation` splits the write by TTL, and the two rates differ by 60%.
  // When the split is missing, everything is charged at the dearer of the two:
  // an unknown that costs the estimate upward is the right direction for a cap.
  const fiveMinute = creation === null ? 0 : count(creation.ephemeral_5m_input_tokens);
  const oneHour = creation === null ? total : count(creation.ephemeral_1h_input_tokens);
  return {
    inputTokens: count(usage.input_tokens),
    cacheWrite5mTokens: fiveMinute,
    cacheWrite1hTokens: oneHour + Math.max(0, total - fiveMinute - oneHour),
    cacheReadTokens: count(usage.cache_read_input_tokens),
    outputTokens: count(usage.output_tokens),
  };
}

export function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cacheWrite5mTokens: left.cacheWrite5mTokens + right.cacheWrite5mTokens,
    cacheWrite1hTokens: left.cacheWrite1hTokens + right.cacheWrite1hTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

export function isEmptyUsage(usage: TokenUsage): boolean {
  return (
    usage.inputTokens === 0 &&
    usage.cacheWrite5mTokens === 0 &&
    usage.cacheWrite1hTokens === 0 &&
    usage.cacheReadTokens === 0 &&
    usage.outputTokens === 0
  );
}

export interface CostReading {
  /**
   * Null when nothing priceable has been seen, **and when what was seen could
   * not be priced at all**.
   *
   * The second case is the one worth stating. Usage the rate table cannot price
   * is not usage that cost nothing, and a zero here would be recorded as a
   * zero-dollar job and then skipped by the rolling window — which is a paid
   * attempt that the cap never sees. Null says "unknown", which is true, and is
   * visible on the row as a cost that is missing rather than a cost that is
   * free.
   */
  usd: number | null;
  source: CostSource | null;
  /** Everything seen, whether it was priced from a result event or from usage. */
  usage: TokenUsage;
  /** The model the stream named, for the row. May be one this table cannot price. */
  model: string | null;
  /**
   * The model the figure was actually priced at.
   *
   * Differs from `model` only when the stream named something the rate table
   * has never heard of and the brief's own model was used instead. Null when
   * nothing could price it.
   */
  pricedAs: string | null;
  /** How many distinct assistant messages contributed. Diagnostics, not billing. */
  messages: number;
}

/**
 * What one job has spent, fed one `stream-json` line at a time.
 *
 * **One meter per job, not per attempt.** A job is up to three attempts against
 * one session log, and every one of them spends. Reading the last attempt's
 * result event — which is what the column did before — reports a retry's cost
 * and forgets the two that preceded it.
 *
 * **A result event settles everything before it.** The exact figure is
 * preferred wherever one exists, so a job whose first two attempts finished
 * cleanly and whose third was cancelled records two exact costs plus one
 * estimate, and calls the total an estimate because part of it is. The whole
 * total is only `result` when no usage is left unsettled.
 *
 * **The same object serves live and replay.** The runner feeds it the agent's
 * stdout as it arrives; the reconcile pass feeds it `session.ndjson` off disk
 * for a job whose runner died before it could write anything down. One
 * implementation, so the two cannot disagree. Studio's own events are appended
 * to that same file and are ignored here, because none of them is an assistant
 * or a result event.
 */
export class JobCostMeter {
  /** Sum of the exact `total_cost_usd` figures seen so far. */
  private settledUsd = 0;
  private settledUsage: TokenUsage = EMPTY_USAGE;
  /** Usage no result event has accounted for yet. */
  private pending: TokenUsage = EMPTY_USAGE;
  /** The last model the stream named, priceable or not. Reported, not used. */
  private model: string | null = null;
  /**
   * The last model named that this table can actually price.
   *
   * Kept apart from `model`, and this is the whole of the difference: a stream
   * naming a model the table has never heard of used to *replace* the brief's
   * own, after which the attempt priced at no rate at all and recorded zero —
   * and a zero is skipped by the rolling window, so a paid cancelled attempt
   * would have walked straight past the cap the day a model generation changed.
   * An unknown name is now a reason to keep pricing at the model the brief
   * asked for, which is the model `--model` was passed and is always one of the
   * two this table knows. Caught by Greptile on the phase 7 PR.
   */
  private priceableModel: string | null = null;
  private sawResult = false;
  /** True when something was seen that no rate could be found for. */
  private unpriced = false;
  /**
   * Message ids already counted in *this attempt*: one event per content
   * block, one usage each.
   *
   * Cleared at each result event, because that is where one attempt ends and
   * the next begins. Two reasons, and the second is the one that matters: a
   * message id is only unique within a session, so carrying the set across a
   * boundary makes correctness depend on the CLI never reusing one — and it
   * grows without limit over a long job.
   */
  private seen = new Set<string>();
  private messages = 0;

  /**
   * A model to fall back on when the stream never names a priceable one. A
   * model the table cannot price (one the settings panel or the owner's own
   * settings named, newer than this table) is priced as its family, or at the
   * dearest rate the table has, never at none: a killed attempt with no
   * figure is one the daily cap cannot count (the #207 review). The reading's
   * `pricedAs` says which rate it was, so the figure stays an estimate on the
   * record, and a clean exit's own `total_cost_usd` never uses it.
   */
  constructor(fallbackModel: string | null = null) {
    this.model = fallbackModel;
    this.priceableModel = fallbackModel === null ? null : priceableAs(fallbackModel);
  }

  /** One raw line. Anything unparseable, or irrelevant, is ignored. */
  observe(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    this.observeEvent(parsed);
  }

  observeEvent(parsed: unknown): void {
    const event = record(parsed);
    if (event === null) return;

    if (event.type === "assistant") {
      const message = record(event.message);
      if (message === null) return;
      const id = typeof message.id === "string" ? message.id : null;
      // No id is not a reason to skip the spend, but it is a reason not to
      // claim it was deduplicated. Counted once, keyed on nothing.
      if (id !== null && this.seen.has(id)) return;
      const usage = readUsage(message.usage);
      if (usage === null || isEmptyUsage(usage)) return;
      if (id !== null) this.seen.add(id);
      if (typeof message.model === "string") {
        this.model = message.model;
        this.priceableModel = canonicalModel(message.model) ?? this.priceableModel;
      }
      this.pending = addUsage(this.pending, usage);
      this.messages += 1;
      return;
    }

    if (event.type === "result") {
      const exact =
        typeof event.total_cost_usd === "number" && Number.isFinite(event.total_cost_usd)
          ? event.total_cost_usd
          : null;
      // The result's own usage is the authority on what this attempt used, and
      // it is a superset of the per-message numbers: it carries the finished
      // `output_tokens` the message-start frames could not.
      const settled = readUsage(event.usage) ?? this.pending;
      this.settledUsage = addUsage(this.settledUsage, settled);
      // No `total_cost_usd` on a result event has not been seen in the wild,
      // but the field is optional in shape and a missing one should cost the
      // precision of that attempt rather than its whole cost.
      if (exact !== null) {
        this.settledUsd += exact;
      } else {
        const priced = priceUsd(settled, this.priceableModel);
        if (priced === null) this.unpriced = true;
        else this.settledUsd += priced;
      }
      if (exact !== null) this.sawResult = true;
      this.pending = EMPTY_USAGE;
      this.seen = new Set();
      return;
    }
  }

  /** Feed a whole `session.ndjson` body. */
  observeLog(body: string): void {
    for (const line of body.split("\n")) {
      if (line.trim() !== "") this.observe(line);
    }
  }

  read(): CostReading {
    const pendingUsd = isEmptyUsage(this.pending)
      ? 0
      : priceUsd(this.pending, this.priceableModel);
    const unpriced = this.unpriced || pendingUsd === null;
    const anything = this.sawResult || this.settledUsd > 0 || !isEmptyUsage(this.pending);
    const usd = !anything || unpriced ? null : round(this.settledUsd + (pendingUsd ?? 0));
    return {
      // Unknown beats zero. See the note on `usd` above.
      usd,
      // A source with no figure beside it says where a number came from and
      // then does not have one, which is also what `job_cost_source_paired_check`
      // refuses. No figure means no statement about its provenance; that
      // something unpriceable was seen is carried by `pricedAs` being null with
      // `usage` non-empty.
      source: usd === null ? null : isEmptyUsage(this.pending) ? "result" : "stream",
      usage: addUsage(this.settledUsage, this.pending),
      model: this.model,
      pricedAs: this.priceableModel,
      messages: this.messages,
    };
  }
}

/** Six decimal places, which is what the CLI's own figure carries. */
function round(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Replay a job's write-ahead log. The reconcile pass's whole cost story. */
export function costFromLog(body: string, fallbackModel: string | null = null): CostReading {
  const meter = new JobCostMeter(fallbackModel);
  meter.observeLog(body);
  return meter.read();
}

/* -------------------------------------------------------------------------- */
/* The rolling window                                                         */
/* -------------------------------------------------------------------------- */

/** All the window needs from a job. Structural, so this module imports no store. */
export interface SpendEntry {
  startedAt: string | null;
  /** When it stopped spending. Null while it still is. */
  finishedAt?: string | null;
  costUsd: number | null;
}

export interface SpendWindow {
  /** What has been spent inside the window. */
  totalUsd: number;
  /** How many jobs contributed a non-zero figure. */
  jobs: number;
  /** The instant the oldest counted job is attributed to. Null when none is. */
  oldestCountedAt: string | null;
  /**
   * The moment the oldest counted job leaves the window, which is the earliest
   * the total can fall. Null when nothing is counted.
   *
   * It is not a promise that the cap clears then — a second job inside the
   * window keeps holding it up — but it is the only honest answer to "when can
   * I try again", and a 429 that says nothing about that is a dead end.
   */
  oldestAgesOutAt: string | null;
}

/**
 * Sum what was spent in the last 24 hours.
 *
 * **Rolling, not a calendar day.** A calendar cap resets at midnight in some
 * timezone, which means a run of expensive jobs at 23:50 is free again ten
 * minutes later, and a cap with a known free moment is not a cap.
 *
 * **Never `requested_at`.** Spending happens when a runner claims a job and
 * launches an agent. A job that sat queued for two days and ran an hour ago
 * spent an hour ago, and pricing it against the day it was asked for would let
 * a queue drained after a pause spend a second day's budget on the first day's
 * requests. A job that never started has no timestamp and no cost, so it never
 * counts either way.
 *
 * **A finished job is attributed to when it *stopped* spending, not when it
 * started.** `cost_usd` is the sum of every attempt, and a job runs up to three
 * of them across as much as forty-five minutes; `started_at` is set before the
 * first and never moves. Hanging the whole aggregate on it expires a third
 * attempt's spend up to three quarters of an hour early, and the cap can let
 * another paid job through in that gap. Per-attempt timestamps would be exact,
 * and would mean a second record shape for an error measured in minutes at the
 * tail of a twenty-four hour window; `finished_at` costs one field and errs the
 * other way — a little too long rather than a little too early, which is the
 * direction a cap should err. A job still running has no `finished_at` and is
 * counted from its start, which is right: it has not stopped spending yet.
 *
 * Caught by Greptile on the phase 7 PR.
 */
export function spendWindow(
  entries: readonly SpendEntry[],
  windowMs: number,
  now: number = Date.now(),
): SpendWindow {
  const floor = now - windowMs;
  let totalUsd = 0;
  let jobs = 0;
  let oldest: number | null = null;
  for (const entry of entries) {
    if (entry.startedAt === null || entry.costUsd === null || entry.costUsd <= 0) continue;
    const at = Date.parse(entry.finishedAt ?? entry.startedAt);
    // A timestamp that will not parse is a record this cannot reason about;
    // counting it against an unknown instant would be worse than leaving it
    // out, and it is a shape `job.json` has never had.
    if (!Number.isFinite(at) || at < floor) continue;
    totalUsd += entry.costUsd;
    jobs += 1;
    if (oldest === null || at < oldest) oldest = at;
  }
  return {
    totalUsd: round(totalUsd),
    jobs,
    oldestCountedAt: oldest === null ? null : new Date(oldest).toISOString(),
    oldestAgesOutAt: oldest === null ? null : new Date(oldest + windowMs).toISOString(),
  };
}
