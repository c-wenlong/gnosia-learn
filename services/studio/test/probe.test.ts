import { describe, expect, it } from "vitest";

import { Probe } from "../src/probe";

/**
 * The probe `/api/health` reads through. What it owes a caller is timing, so
 * each test controls when the check answers and what the clock says.
 */

/** A check that answers only when told to, counting how often it was started. */
function gated<T>() {
  const pending: ((value: T) => void)[] = [];
  const check = () =>
    new Promise<T>((resolve) => {
      pending.push(resolve);
    });
  return {
    check,
    get started() {
      return pending.length;
    },
    answer(value: T, index = pending.length - 1) {
      pending[index]?.(value);
    },
  };
}

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a read", () => {
  it("waits for the first answer, because there is nothing yet to report", async () => {
    const gate = gated<string>();
    const probe = new Probe(gate.check, 1_000);
    const read = probe.read();
    await tick();
    expect(gate.started).toBe(1);
    gate.answer("first");
    expect((await read).value).toBe("first");
  });

  it("answers at once with the last answer while a slow refresh runs, and has the new one next time", async () => {
    const gate = gated<string>();
    const time = clock();
    const probe = new Probe(gate.check, 1_000, { now: time.now });
    const first = probe.read();
    await tick();
    gate.answer("old");
    await first;

    time.advance(5_000);
    // The refresh this starts never answers during the read: the read must not care.
    const started = performance.now();
    const stale = await probe.read();
    expect(performance.now() - started).toBeLessThan(200);
    expect(stale).toMatchObject({ value: "old", stale: true, refreshing: true, ageMs: 5_000 });
    await tick();
    expect(gate.started).toBe(2);

    // A second read while it is still running starts no third check.
    await probe.read();
    await tick();
    expect(gate.started).toBe(2);

    gate.answer("new");
    await tick();
    expect(await probe.read()).toMatchObject({ value: "new", stale: false, refreshing: false, ageMs: 0 });
  });

  it("does not refresh an answer younger than its lifetime", async () => {
    const gate = gated<number>();
    const time = clock();
    const probe = new Probe(gate.check, 1_000, { now: time.now });
    const first = probe.read();
    await tick();
    gate.answer(1);
    await first;
    time.advance(999);
    expect(await probe.read()).toMatchObject({ value: 1, stale: false, refreshing: false });
    await tick();
    expect(gate.started).toBe(1);
  });

  it("stamps an answer when it came, so a check slower than its lifetime still caches", async () => {
    const time = clock();
    const probe = new Probe(async () => {
      time.advance(5_000);
      return "slow";
    }, 1_000, { now: time.now });
    const read = await probe.read();
    expect(read).toMatchObject({ value: "slow", stale: false, ageMs: 0 });
    expect(read.checkedAt).toBe(new Date(time.now()).toISOString());
  });

  it("keeps the last answer when a background refresh throws, and tries again next time", async () => {
    const time = clock();
    let calls = 0;
    const probe = new Probe(async () => {
      calls += 1;
      if (calls === 2) throw new Error("the check fell over");
      return calls;
    }, 1_000, { now: time.now });
    expect((await probe.read()).value).toBe(1);
    time.advance(2_000);
    expect((await probe.read()).value).toBe(1);
    await tick();
    expect((await probe.read()).value).toBe(1);
    await tick();
    expect((await probe.read()).value).toBe(3);
  });
});

describe("a gate", () => {
  it("waits for a new answer when the last one is too old, where a read would not", async () => {
    const gate = gated<string>();
    const time = clock();
    const probe = new Probe(gate.check, 1_000, { now: time.now });
    const first = probe.fresh();
    await tick();
    gate.answer("passing");
    expect(await first).toBe("passing");

    time.advance(1_000);
    let settled = false;
    const fresh = probe.fresh().then((value) => {
      settled = true;
      return value;
    });
    await tick();
    expect(settled).toBe(false);
    gate.answer("failing");
    expect(await fresh).toBe("failing");
  });

  it("shares a check already running for a read", async () => {
    const gate = gated<string>();
    const probe = new Probe(gate.check, 1_000);
    const both = Promise.all([probe.read(), probe.fresh()]);
    await tick();
    expect(gate.started).toBe(1);
    gate.answer("one");
    const [read, fresh] = await both;
    expect(read.value).toBe("one");
    expect(fresh).toBe("one");
  });
});

describe("an answer the check had cached itself", () => {
  it("is as old as the check says, not as old as the probe's copy (Greptile on #218)", async () => {
    const time = clock();
    // The canvas doctor hands back an answer it got 20 s ago, within its own TTL.
    const answeredAt = time.now() - 20_000;
    const probe = new Probe(async () => ({ verdict: "pass", at: answeredAt }), 30_000, {
      now: time.now,
      answeredAt: (value) => value.at,
    });
    const read = await probe.read();
    expect(read).toMatchObject({ ageMs: 20_000, stale: false });
    expect(read.checkedAt).toBe(new Date(answeredAt).toISOString());
    // 10 s later it is 30 s old, and the probe says so and refreshes.
    time.advance(10_000);
    expect(await probe.read()).toMatchObject({ ageMs: 30_000, stale: true });
  });
});

describe("forget", () => {
  it("does not let a read that was waiting store the answer from before it (Greptile on #218)", async () => {
    const gate = gated<string>();
    const probe = new Probe(gate.check, 60_000);
    // A health call is waiting on the very first check when a settings write lands.
    const waiting = probe.read();
    await tick();
    probe.forget();
    gate.answer("read before the write", 0);
    await tick();
    // It waits on a check started after the write instead.
    expect(gate.started).toBe(2);
    gate.answer("after the write", 1);
    expect((await waiting).value).toBe("after the write");
    expect((await probe.read()).value).toBe("after the write");
  });


  it("makes the next read wait, and a check started before it cannot store what it read", async () => {
    const gate = gated<string>();
    const probe = new Probe(gate.check, 60_000);
    const first = probe.read();
    await tick();
    gate.answer("before the write", 0);
    await first;

    // A refresh from before the write is still running when the write lands.
    const racing = probe.refresh();
    probe.forget();
    const after = probe.read();
    await tick();
    expect(gate.started).toBe(3);
    gate.answer("read before the write", 1);
    await racing;
    gate.answer("after the write", 2);
    expect((await after).value).toBe("after the write");
    expect((await probe.read()).value).toBe("after the write");
  });
});
