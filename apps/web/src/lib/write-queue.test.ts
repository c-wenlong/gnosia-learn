import { describe, expect, it } from "vitest";

import { createWriteQueue } from "@/lib/write-queue";

/** A promise plus the handles to settle it later. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createWriteQueue", () => {
  it("runs one task at a time per key, in order", async () => {
    const queue = createWriteQueue<string>();
    const first = deferred<string>();
    const started: string[] = [];
    const settled: string[] = [];

    queue.run(
      "note:a",
      () => {
        started.push("first");
        return first.promise;
      },
      (r) => settled.push(r),
    );
    queue.run(
      "note:a",
      () => {
        started.push("second");
        return Promise.resolve("second");
      },
      (r) => settled.push(r),
    );

    await flush();
    // The second has not started: the first is still in flight.
    expect(started).toEqual(["first"]);

    first.resolve("first");
    await flush();
    expect(started).toEqual(["first", "second"]);
    // And only the last task on the key reports, so a slow earlier request
    // cannot overwrite the outcome of the one that superseded it.
    expect(settled).toEqual(["second"]);
  });

  it("keeps different keys concurrent", async () => {
    const queue = createWriteQueue<string>();
    const blocked = deferred<string>();
    const started: string[] = [];

    queue.run("note:a", () => {
      started.push("a");
      return blocked.promise;
    }, () => {});
    queue.run("note:b", () => {
      started.push("b");
      return Promise.resolve("b");
    }, () => {});

    await flush();
    expect(started).toEqual(["a", "b"]);
    blocked.resolve("a");
    await flush();
  });

  it("does not strand the queue when a task rejects", async () => {
    const queue = createWriteQueue<string>();
    const settled: string[] = [];

    queue.run("note:a", () => Promise.reject(new Error("offline")), () => settled.push("first"));
    await flush();

    queue.run("note:a", () => Promise.resolve("after"), (r) => settled.push(r));
    await flush();

    expect(settled).toEqual(["after"]);
    expect(queue.pending).toBe(0);
  });
});

describe("createWriteQueue as a barrier", () => {
  it("waits for every named key, then holds all of them", async () => {
    const queue = createWriteQueue<string>();
    const blocked = deferred<string>();
    const order: string[] = [];

    queue.run("progress:a", () => {
      order.push("note-a-start");
      return blocked.promise;
    }, () => {});
    queue.run(["progress:a", "progress:b"], () => {
      order.push("reset-start");
      return Promise.resolve("reset");
    }, () => {});
    queue.run("progress:b", () => {
      order.push("after-b-start");
      return Promise.resolve("b");
    }, () => {});

    await flush();
    // The reset has not started, because `progress:a` is still in flight — and
    // neither has the later write on `progress:b`, because the reset now holds
    // that key too.
    expect(order).toEqual(["note-a-start"]);

    blocked.resolve("a");
    await flush();
    expect(order).toEqual(["note-a-start", "reset-start", "after-b-start"]);
  });

  it("reports a barrier once, not once per key", async () => {
    const queue = createWriteQueue<string>();
    const settled: string[] = [];

    queue.run(["x", "y", "z"], () => Promise.resolve("done"), (r) => settled.push(r));
    await flush();

    expect(settled).toEqual(["done"]);
    expect(queue.pending).toBe(0);
  });
});
