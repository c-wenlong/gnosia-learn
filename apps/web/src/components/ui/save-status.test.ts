// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { statusProps, useSaveStatus, type SaveStatus } from "./save-status";

/**
 * A save's status line: what each state says, and that only the newest of
 * several saves in flight gets to say anything.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

describe("statusProps", () => {
  it("says nothing while idle, or with no status at all", () => {
    expect(statusProps({ kind: "idle" })).toEqual({ text: null, tone: "muted" });
    expect(statusProps(undefined)).toEqual({ text: null, tone: "muted" });
  });

  it("says Saving… and Saved by default, in the muted and ok tones", () => {
    expect(statusProps({ kind: "saving" })).toEqual({ text: "Saving…", tone: "muted" });
    expect(statusProps({ kind: "saved" })).toEqual({ text: "Saved", tone: "ok" });
  });

  it("takes the caller's words, and a status's own text over them", () => {
    const words = { saving: "Resetting…", saved: "Progress reset." };
    expect(statusProps({ kind: "saving" }, words).text).toBe("Resetting…");
    expect(statusProps({ kind: "saved" }, words).text).toBe("Progress reset.");
    expect(statusProps({ kind: "saved", text: "Key saved." }, words).text).toBe("Key saved.");
  });

  it("says why an error happened, in the danger tone", () => {
    expect(statusProps({ kind: "error", message: "Not saved: the server did not answer." })).toEqual({
      text: "Not saved: the server did not answer.",
      tone: "danger",
    });
  });
});

/** A promise and the hands that settle it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function probe() {
  const held: { api: ReturnType<typeof useSaveStatus> | null } = { api: null };
  function Probe() {
    held.api = useSaveStatus();
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Probe)));
  mounted.push(() => act(() => root.unmount()));
  return {
    status: (): SaveStatus => held.api!.status,
    track: (save: Promise<string | null>) => act(() => held.api!.track(save)),
    settle: async (fn: () => void) => {
      await act(async () => {
        fn();
        await Promise.resolve();
      });
    },
  };
}

describe("useSaveStatus", () => {
  it("is idle, then saving, then saved", async () => {
    const save = probe();
    expect(save.status()).toEqual({ kind: "idle" });
    const one = deferred<string | null>();
    save.track(one.promise);
    expect(save.status()).toEqual({ kind: "saving" });
    await save.settle(() => one.resolve(null));
    expect(save.status()).toEqual({ kind: "saved" });
  });

  it("reports the message a failed save resolves to", async () => {
    const save = probe();
    const one = deferred<string | null>();
    save.track(one.promise);
    await save.settle(() => one.resolve("Not saved: the database did not answer."));
    expect(save.status()).toEqual({ kind: "error", message: "Not saved: the database did not answer." });
  });

  it("reports a save that rejects as failed rather than saving forever", async () => {
    const save = probe();
    const one = deferred<string | null>();
    save.track(one.promise);
    await save.settle(() => one.reject(new Error("boom")));
    expect(save.status().kind).toBe("error");
  });

  it("lets only the newest save report: an older one landing late changes nothing", async () => {
    const save = probe();
    const older = deferred<string | null>();
    const newer = deferred<string | null>();
    save.track(older.promise);
    save.track(newer.promise);
    // The older save fails after the newer one started: the row still waits on the newer.
    await save.settle(() => older.resolve("Not saved."));
    expect(save.status()).toEqual({ kind: "saving" });
    await save.settle(() => newer.resolve(null));
    expect(save.status()).toEqual({ kind: "saved" });
    // And an older success after a newer failure does not print Saved over it.
    const third = deferred<string | null>();
    const fourth = deferred<string | null>();
    save.track(third.promise);
    save.track(fourth.promise);
    await save.settle(() => fourth.resolve("Not saved."));
    await save.settle(() => third.resolve(null));
    expect(save.status()).toEqual({ kind: "error", message: "Not saved." });
  });
});

/**
 * One mapper from a save's state to `LiveStatus`'s words and tone. The
 * Provider keys card still has its own (`textOf` and `tone`), and adopts
 * `SaveStatus` in its own change.
 *
 * Only files that draw a status line (`LiveStatus`, or a `FormRow`'s
 * `status`) are read, and a mapper is a state's `kind` tied to a tone, as a
 * ternary or as a `case` returning one, whatever the states are called.
 */
describe("status mappers", () => {
  it("leaves no second hand-written mapper to LiveStatus's tones", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const allowed = new Set(["components/ui/save-status.ts", "components/settings/Providers.tsx", "components/settings/ModelSelection.tsx"]);
    const drawsStatus = /\bLiveStatus\b|\bFormRow\b/;
    const mapper = /\.kind\b[^;]*?"(?:ok|danger)"|case "\w+":\s*return \{[^}]*\btone:/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const text = readFileSync(path, "utf8");
          if (!drawsStatus.test(text) || !mapper.test(text)) continue;
          const at = relative(src, path);
          if (!allowed.has(at)) offenders.push(at);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
