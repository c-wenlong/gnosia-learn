import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  costFromLog,
  JobCostMeter,
  priceableAs,
  priceUsd,
  RATE_TABLE,
  ratesFor,
  readUsage,
  spendWindow,
} from "../src/cost";

/**
 * What a job spent, measured against a real session rather than a made-up one.
 *
 * The two fixtures beside this file are reductions of one real job's
 * `session.ndjson`: every field the meter reads is kept verbatim — the usage
 * objects, the model, the result event's own totals — and everything else is
 * dropped, because the prompts, the tool inputs and the absolute paths in a
 * real transcript name the machine it ran on and have no business in the
 * repository. Message ids are hashed rather than removed, since the one thing
 * they are needed for is that two events share one.
 *
 * `session-clean.ndjson` is the whole session. `session-truncated.ndjson` is
 * the same session cut off immediately before its result event, which is what
 * a kill leaves behind if the CLI does not flush one — the case the whole phase
 * exists for, and the case this repo has no captured example of.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const read = (name: string): Promise<string> =>
  readFile(path.join(FIXTURES, `${name}.ndjson`), "utf8");

/** What the CLI itself reported for that session. Copied from the fixture. */
const EXACT_USD = 0.131777;
/** What accumulating the intermediate usage events gets to instead. */
const ESTIMATED_USD = 0.119827;

describe("the rate table", () => {
  it("reproduces the CLI's own total from the result event's token counts", async () => {
    // The check that catches a stale table. If a published rate moves and this
    // file does not, the two stop agreeing and this fails — which is the point
    // of pricing from tokens rather than trusting the table.
    const body = await read("session-clean");
    const result = body
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((event) => event.type === "result");
    const usage = readUsage((result as { usage: unknown }).usage);
    expect(usage).not.toBeNull();
    expect(priceUsd(usage!, "claude-sonnet-5")).toBeCloseTo(EXACT_USD, 6);
  });

  it("prices a one-hour cache write at twice the input rate and a read at a tenth", () => {
    const sonnet = RATE_TABLE["claude-sonnet-5"]!;
    expect(sonnet.cacheWrite1h).toBeCloseTo(sonnet.input * 2, 10);
    expect(sonnet.cacheWrite5m).toBeCloseTo(sonnet.input * 1.25, 10);
    expect(sonnet.cacheRead).toBeCloseTo(sonnet.input * 0.1, 10);
  });

  it("resolves the brief's own model names, and refuses one it has never heard of", () => {
    expect(ratesFor("sonnet")).toEqual(RATE_TABLE["claude-sonnet-5"]);
    expect(ratesFor("opus")).toEqual(RATE_TABLE["claude-opus-5"]);
    // Null, not a guess. A model this cannot price is a cost it cannot report,
    // and a made-up rate would put a number on a row nothing backs up.
    expect(ratesFor("claude-something-6")).toBeNull();
    // Every model the settings panel offers is priced: the aliases, and the
    // owner's own default with its context suffix.
    expect(ratesFor("fable")).toEqual(RATE_TABLE["claude-fable-5-1"]);
    expect(ratesFor("claude-fable-5-1[1m]")).toEqual(RATE_TABLE["claude-fable-5-1"]);
    expect(RATE_TABLE["claude-fable-5-1"]).toMatchObject({ input: 10, output: 50, cacheRead: 0.25, cacheWrite1h: 20 });
    expect(RATE_TABLE["claude-opus-5-5"]).toMatchObject({ input: 4, output: 20, cacheRead: 0.2 });
    expect(priceUsd({ inputTokens: 100, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0, outputTokens: 0 }, "claude-something-6")).toBeNull();
  });

  it("charges an unsplit cache write at the dearer of the two rates", () => {
    // An unknown that moves the estimate upward is the right direction for a
    // cap. `cache_creation` has always been present in practice; this is what
    // happens if it stops being.
    const usage = readUsage({ cache_creation_input_tokens: 1_000 });
    expect(usage?.cacheWrite1hTokens).toBe(1_000);
    expect(usage?.cacheWrite5mTokens).toBe(0);
  });
});

describe("accumulating a real session", () => {
  it("prefers the result event's exact figure when the session finished", async () => {
    const reading = costFromLog(await read("session-clean"));
    expect(reading.source).toBe("result");
    expect(reading.usd).toBeCloseTo(EXACT_USD, 6);
    expect(reading.model).toBe("claude-sonnet-5");
  });

  it("counts one usage per message, not one per content block", async () => {
    // Eight assistant events, six distinct messages: a message carrying a
    // `tool_use` and a `text` block arrives twice with the same usage object.
    // Summing the events would report those two twice over.
    const reading = costFromLog(await read("session-truncated"));
    expect(reading.messages).toBe(6);
    expect(reading.usage.inputTokens).toBe(12);
    expect(reading.usage.cacheWrite1hTokens).toBe(18_715);
    expect(reading.usage.cacheReadTokens).toBe(207_915);
  });

  it("reproduces the result event's input and cache totals exactly from the stream alone", async () => {
    const streamed = costFromLog(await read("session-truncated"));
    const whole = costFromLog(await read("session-clean"));
    expect(streamed.usage.inputTokens).toBe(whole.usage.inputTokens);
    expect(streamed.usage.cacheWrite1hTokens).toBe(whole.usage.cacheWrite1hTokens);
    expect(streamed.usage.cacheReadTokens).toBe(whole.usage.cacheReadTokens);
  });

  it("records a killed session's spend, and says it is an estimate", async () => {
    const reading = costFromLog(await read("session-truncated"));
    expect(reading.source).toBe("stream");
    expect(reading.usd).toBeCloseTo(ESTIMATED_USD, 6);
    // The number that matters about this number: it is low, never high, and by
    // a knowable amount. 80% to 93% of the exact figure across the nine real
    // sessions this was measured on.
    expect(reading.usd!).toBeLessThan(EXACT_USD);
    expect(reading.usd! / EXACT_USD).toBeGreaterThan(0.8);
  });

  it("under-reports output tokens, which is why the estimate is marked", async () => {
    const streamed = costFromLog(await read("session-truncated"));
    const whole = costFromLog(await read("session-clean"));
    // The `message_start` frame's value, before the message finished. Asserted
    // rather than worked around: a future CLI that fixed this would fail here,
    // which is the right way to find out.
    expect(streamed.usage.outputTokens).toBe(336);
    expect(whole.usage.outputTokens).toBe(1_531);
  });

  it("ignores the studio's own events in the same file", async () => {
    // `session.ndjson` is one file holding two streams: the agent's stdout and
    // the studio's progress events, which `emit` appends to it. Only the first
    // is spend.
    const body = await read("session-truncated");
    const withNoise = `${body}${[
      JSON.stringify({ type: "phase", note: "drawing", seq: 99 }),
      JSON.stringify({ type: "step", note: "drew 44 shapes", seq: 100 }),
      JSON.stringify({ type: "done", note: "ready", seq: 101 }),
      "not json at all",
      "",
    ].join("\n")}\n`;
    expect(costFromLog(withNoise).usd).toBeCloseTo(costFromLog(body).usd!, 10);
  });

  it("reports nothing at all when nothing priceable has been seen", () => {
    const meter = new JobCostMeter("sonnet");
    meter.observe(JSON.stringify({ type: "system", subtype: "init" }));
    meter.observe("garbage");
    const reading = meter.read();
    // Null, not zero. Zero is a claim that nothing was spent; this is the
    // absence of a claim, and the two mean different things on a cancelled row.
    expect(reading.usd).toBeNull();
    expect(reading.source).toBeNull();
  });
});

/** One message's frames as `--include-partial-messages` prints them, in order. */
function partialMessage(id: string, output: number, lineage: string | null = null): object[] {
  const usage = {
    input_tokens: 2,
    cache_creation_input_tokens: 1_000,
    cache_read_input_tokens: 10_000,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1_000 },
    output_tokens: 1,
  };
  const frame = (event: object) => ({ type: "stream_event", parent_tool_use_id: lineage, event });
  return [
    frame({ type: "message_start", message: { id, model: "claude-sonnet-5", usage } }),
    { type: "assistant", parent_tool_use_id: lineage, message: { id, model: "claude-sonnet-5", usage, content: [{ type: "thinking" }] } },
    { type: "assistant", parent_tool_use_id: lineage, message: { id, model: "claude-sonnet-5", usage, content: [{ type: "tool_use" }] } },
    // The delta's cache counts carry no TTL split; only its output is read.
    frame({ type: "message_delta", usage: { input_tokens: 2, cache_creation_input_tokens: 1_000, cache_read_input_tokens: 10_000, output_tokens: output } }),
  ];
}

describe("the partial frames (Phase 2 measured)", () => {
  it("counts a message's finished output from its message_delta, once", () => {
    const meter = new JobCostMeter("sonnet");
    for (const event of [...partialMessage("m1", 900), ...partialMessage("m2", 1_500)]) meter.observeEvent(event);
    const reading = meter.read();
    expect(reading.messages).toBe(2);
    // Before this, the stream said 1 + 1: the count as each message began.
    expect(reading.usage.outputTokens).toBe(2_400);
    expect(reading.usage.inputTokens).toBe(4);
    expect(reading.usage.cacheWrite1hTokens).toBe(2_000);
    expect(reading.usage.cacheWrite5mTokens).toBe(0);
    expect(reading.usage.cacheReadTokens).toBe(20_000);
    expect(reading.source).toBe("stream");
  });

  it("counts output as it arrives, so a figure read mid-job already has it", () => {
    const meter = new JobCostMeter("sonnet");
    const frames = partialMessage("m1", 900);
    for (const event of frames.slice(0, 3)) meter.observeEvent(event);
    expect(meter.read().usage.outputTokens).toBe(1);
    meter.observeEvent(frames[3]);
    expect(meter.read().usage.outputTokens).toBe(900);
    // A repeated delta is the same message's last word, not more of it.
    meter.observeEvent(frames[3]);
    expect(meter.read().usage.outputTokens).toBe(900);
  });

  it("credits a delta to the message on its own line of descent, and drops one with no start", () => {
    const meter = new JobCostMeter("sonnet");
    const outer = partialMessage("outer", 700);
    const inner = partialMessage("inner", 300, "toolu_1");
    // A sub-agent's message starts inside the outer one; each delta is its own.
    for (const event of [outer[0], inner[0], inner[1], inner[3], outer[1], outer[3]]) meter.observeEvent(event!);
    expect(meter.read().usage.outputTokens).toBe(1_000);
    const orphan = new JobCostMeter("sonnet");
    orphan.observeEvent(partialMessage("x", 500)[3]);
    expect(orphan.read().usage.outputTokens).toBe(0);
    expect(orphan.read().usd).toBeNull();
  });

  it("still lets the result event settle the attempt, and starts the next one clean", () => {
    const meter = new JobCostMeter("sonnet");
    for (const event of partialMessage("m1", 900)) meter.observeEvent(event);
    meter.observeEvent({ type: "result", total_cost_usd: 0.05, usage: { input_tokens: 2, cache_creation_input_tokens: 1_000, cache_read_input_tokens: 10_000, output_tokens: 900 } });
    expect(meter.read()).toMatchObject({ usd: 0.05, source: "result" });
    // The same id on the next attempt is a new message there.
    for (const event of partialMessage("m1", 400)) meter.observeEvent(event);
    expect(meter.read().usage.outputTokens).toBe(1_300);
    expect(meter.read().source).toBe("stream");
  });
});

describe("a real session with the partial frames (Phase 2 measured)", () => {
  // `session-partial.ndjson`: a real diagram job run on 2026-09-29 with
  // `--include-partial-messages`, reduced the same way as the two above. Nine
  // messages, $0.444758 by the CLI's own figure, 5,082 output tokens. The
  // meter this replaced summed 68 of them from the stream, $0.394618 (88.7%).
  const EXACT_PARTIAL_USD = 0.444758;
  const cut = (body: string, before: (event: { type?: string; event?: { type?: string } }) => boolean, last = false): string => {
    const lines = body.split("\n").filter((line) => line !== "");
    const events = lines.map((line) => JSON.parse(line) as { type?: string; event?: { type?: string } });
    const index = last ? events.findLastIndex(before) : events.findIndex(before);
    return `${lines.slice(0, index).join("\n")}\n`;
  };

  it("reports the CLI's own figure from the result event", async () => {
    const reading = costFromLog(await read("session-partial"));
    expect(reading).toMatchObject({ usd: EXACT_PARTIAL_USD, source: "result" });
    expect(reading.usage.outputTokens).toBe(5_082);
  });

  it("reaches the whole cost from the stream alone when the session is cut before its result", async () => {
    const reading = costFromLog(cut(await read("session-partial"), (event) => event.type === "result"));
    expect(reading.source).toBe("stream");
    expect(reading.messages).toBe(9);
    expect(reading.usage.outputTokens).toBe(5_082);
    expect(reading.usd).toBeCloseTo(EXACT_PARTIAL_USD, 6);
  });

  it("stays at or under the true figure when a kill lands mid-message", async () => {
    // Before the last message's delta: its output was never reported.
    const reading = costFromLog(cut(await read("session-partial"), (event) => event.event?.type === "message_delta", true));
    expect(reading.source).toBe("stream");
    expect(reading.usd!).toBeLessThan(EXACT_PARTIAL_USD);
    expect(reading.usd! / EXACT_PARTIAL_USD).toBeGreaterThan(0.95);
  });
});

describe("a job that took more than one attempt", () => {
  it("adds every attempt, rather than reporting the last one", async () => {
    const meter = new JobCostMeter("sonnet");
    meter.observeLog(await read("session-clean"));
    meter.observeLog(await read("session-clean"));
    const reading = meter.read();
    // Two clean attempts: two exact figures, and the total is still exact.
    expect(reading.usd).toBeCloseTo(EXACT_USD * 2, 6);
    expect(reading.source).toBe("result");
  });

  it("calls a total an estimate when any part of it is one", async () => {
    // The shape of a job whose first attempt finished and whose second was
    // cancelled: one exact figure plus one accumulation.
    //
    // It also pins the dedupe's scope. Both fixtures are reductions of the
    // same session, so they carry the same message ids — which is not what two
    // real attempts look like, but is exactly what a meter whose `seen` set
    // outlived the attempt would silently swallow.
    const meter = new JobCostMeter("sonnet");
    meter.observeLog(await read("session-clean"));
    meter.observeLog(await read("session-truncated"));
    const reading = meter.read();
    expect(reading.usd).toBeCloseTo(EXACT_USD + ESTIMATED_USD, 6);
    expect(reading.source).toBe("stream");
  });

  it("prices from the brief's model when the stream never named one", () => {
    // A session killed before its first assistant event has tokens from
    // nowhere, but a later attempt's might arrive; the seed is what stops an
    // early kill pricing at no rate at all.
    const meter = new JobCostMeter("opus");
    meter.observeEvent({
      type: "assistant",
      message: { id: "m1", usage: { input_tokens: 1_000_000 } },
    });
    // $5/MTok is Opus, not Sonnet's $2.
    expect(meter.read().usd).toBeCloseTo(5, 6);
  });
});

describe("a model the rate table has never heard of", () => {
  it("keeps pricing at the brief's model rather than dropping to no rate", () => {
    // The hole this closes: the stream naming an unknown model used to replace
    // the priceable one from the brief, after which the attempt priced at
    // nothing and recorded zero — and `spendWindow` skips a zero, so a paid
    // cancelled attempt would have walked past the cap the day a model
    // generation changed. Caught by Greptile on the phase 7 PR.
    const meter = new JobCostMeter("sonnet");
    meter.observeEvent({
      type: "assistant",
      message: { id: "m1", model: "claude-something-6", usage: { input_tokens: 1_000_000 } },
    });
    const reading = meter.read();
    expect(reading.usd).toBeCloseTo(2, 6);
    // The row still says what the stream named; the price says what it was
    // priced at. Those are two facts and they disagree here.
    expect(reading.model).toBe("claude-something-6");
    expect(reading.pricedAs).toBe("claude-sonnet-5");
  });

  it("reports unknown rather than zero when nothing can price it", () => {
    const meter = new JobCostMeter(null);
    meter.observeEvent({
      type: "assistant",
      message: { id: "m1", model: "claude-something-6", usage: { input_tokens: 1_000_000 } },
    });
    const reading = meter.read();
    // A zero would be recorded as a zero-dollar job and then skipped by the
    // window. Null says "unknown", which is true, and shows up as a cost that
    // is missing rather than a cost that is free.
    expect(reading.usd).toBeNull();
    expect(reading.pricedAs).toBeNull();
    expect(reading.usage.inputTokens).toBe(1_000_000);
    // And no source, because there is no figure for a source to describe —
    // which is also what `job_cost_source_paired_check` requires.
    expect(reading.source).toBeNull();
  });

  it("still takes an exact figure from a result event for a model it cannot price", () => {
    const meter = new JobCostMeter(null);
    meter.observeEvent({
      type: "assistant",
      message: { id: "m1", model: "claude-something-6", usage: { input_tokens: 10 } },
    });
    meter.observeEvent({ type: "result", total_cost_usd: 0.42, usage: { input_tokens: 10 } });
    // The CLI's own number needs no rate table.
    expect(meter.read().usd).toBeCloseTo(0.42, 6);
    expect(meter.read().source).toBe("result");
  });
});

describe("the rolling 24 hour window", () => {
  const at = (hoursAgo: number, now: number): string =>
    new Date(now - hoursAgo * 3_600_000).toISOString();
  const DAY = 24 * 3_600_000;

  it("counts an attempt inside the window and drops one outside it", () => {
    const now = Date.parse("2026-09-22T12:00:00.000Z");
    const window = spendWindow(
      [
        { startedAt: at(1, now), costUsd: 0.5 },
        { startedAt: at(23, now), costUsd: 0.25 },
        { startedAt: at(25, now), costUsd: 9.99 },
      ],
      DAY,
      now,
    );
    expect(window.totalUsd).toBeCloseTo(0.75, 6);
    expect(window.jobs).toBe(2);
    expect(window.oldestCountedAt).toBe(at(23, now));
  });

  it("counts a finished job from when it stopped spending", () => {
    const now = Date.parse("2026-09-22T12:00:00.000Z");
    // `cost_usd` is every attempt summed and `started_at` is set before the
    // first one, so attributing the aggregate to it expires a third attempt's
    // spend up to three quarters of an hour early — and the cap lets another
    // paid job through in the gap. Caught by Greptile on the phase 7 PR.
    const window = spendWindow(
      [{ startedAt: at(24.5, now), finishedAt: at(23.9, now), costUsd: 1 }],
      DAY,
      now,
    );
    expect(window.totalUsd).toBe(1);
    expect(window.oldestCountedAt).toBe(at(23.9, now));
  });

  it("counts a running job from its start, because it has not stopped", () => {
    const now = Date.parse("2026-09-22T12:00:00.000Z");
    const window = spendWindow(
      [{ startedAt: at(1, now), finishedAt: null, costUsd: 1 }],
      DAY,
      now,
    );
    expect(window.oldestCountedAt).toBe(at(1, now));
  });

  it("holds an attempt that started exactly 24 hours ago, and drops it a millisecond later", () => {
    const now = Date.parse("2026-09-22T12:00:00.000Z");
    const edge = new Date(now - DAY).toISOString();
    expect(spendWindow([{ startedAt: edge, costUsd: 1 }], DAY, now).totalUsd).toBe(1);
    // One millisecond on, the same attempt is outside. The boundary is `>=`
    // the floor, which is the reading that never counts an attempt twice
    // across two adjacent windows.
    expect(spendWindow([{ startedAt: edge, costUsd: 1 }], DAY, now + 1).totalUsd).toBe(0);
  });

  it("says when the oldest counted job ages out", () => {
    const now = Date.parse("2026-09-22T12:00:00.000Z");
    const window = spendWindow([{ startedAt: at(20, now), costUsd: 1 }], DAY, now);
    // Four hours from now: 24 hours after it started. The only honest answer to
    // "when can I try again", and a 429 without it is a dead end.
    expect(window.oldestAgesOutAt).toBe(new Date(now + 4 * 3_600_000).toISOString());
  });

  it("ignores a job whose cost could not be priced at all", () => {
    // Null is the shape unpriceable usage takes, and it is skipped here for the
    // same reason a queued job is: there is no figure to add. The protection
    // against that becoming a free pass is upstream, in the meter keeping a
    // priceable model.
    const now = Date.now();
    const window = spendWindow(
      [{ startedAt: new Date(now).toISOString(), costUsd: null }],
      DAY,
      now,
    );
    expect(window.totalUsd).toBe(0);
  });

  it("ignores a job that never started and one that recorded no cost", () => {
    const now = Date.now();
    const window = spendWindow(
      [
        { startedAt: null, costUsd: null },
        { startedAt: new Date(now).toISOString(), costUsd: null },
        { startedAt: null, costUsd: 5 },
        { startedAt: "not a date", costUsd: 5 },
      ],
      DAY,
      now,
    );
    expect(window.totalUsd).toBe(0);
    expect(window.jobs).toBe(0);
    expect(window.oldestAgesOutAt).toBeNull();
  });

  it("counts the estimated figures alongside the exact ones", () => {
    // The whole phase in one assertion. A cap that summed only the clean
    // finishes would be a cap anybody could walk past by pressing Cancel.
    const now = Date.now();
    const window = spendWindow(
      [
        { startedAt: new Date(now - 3_600_000).toISOString(), costUsd: EXACT_USD },
        { startedAt: new Date(now - 1_800_000).toISOString(), costUsd: ESTIMATED_USD },
      ],
      DAY,
      now,
    );
    expect(window.totalUsd).toBeCloseTo(EXACT_USD + ESTIMATED_USD, 6);
    expect(window.jobs).toBe(2);
  });
});

describe("a model the rate table cannot price (#207 review)", () => {
  const assistant = (model: string) =>
    JSON.stringify({ type: "assistant", message: { id: "m1", model, usage: { input_tokens: 1000, output_tokens: 1000 } } });

  it("is priced as its family, or at the dearest rate, never at none, so the cap still counts it", () => {
    expect(priceableAs("claude-opus-9")).toBe("claude-opus-5");
    expect(priceableAs("claude-fable-7[1m]")).toBe("claude-fable-5-1");
    expect(priceableAs("claude-mystery-9")).toBe("claude-fable-5");
    expect(priceableAs("sonnet")).toBe("claude-sonnet-5");
    const meter = new JobCostMeter("claude-mystery-9");
    meter.observe(assistant("claude-mystery-9"));
    const reading = meter.read();
    expect(reading.usd).not.toBeNull();
    expect(reading.usd).toBeGreaterThan(0);
    expect(reading).toMatchObject({ source: "stream", model: "claude-mystery-9", pricedAs: "claude-fable-5" });
  });
});
