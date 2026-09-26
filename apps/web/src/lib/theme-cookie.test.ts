import { describe, expect, it } from "vitest";

import { asThemeMode, followTheme, SYSTEM_THEME_SCRIPT, THEME_LABELS, THEME_MODES, themeClass } from "./theme-cookie";

describe("asThemeMode", () => {
  it("accepts exactly the four modes", () => {
    for (const mode of THEME_MODES) expect(asThemeMode(mode)).toBe(mode);
    for (const bad of [undefined, null, "", "Dark", "chartreuse", 1, {}]) expect(asThemeMode(bad)).toBeNull();
  });

  it("has a label for every mode", () => {
    for (const mode of THEME_MODES) expect(THEME_LABELS[mode]).toBeTruthy();
  });
});

describe("themeClass", () => {
  it("resolves the three fixed modes regardless of the device", () => {
    for (const prefersDark of [false, true]) {
      expect(themeClass("light", prefersDark)).toBe("");
      expect(themeClass("gnosia", prefersDark)).toBe("gnosia");
      expect(themeClass("dark", prefersDark)).toBe("dark");
    }
  });

  it("lets the device decide under system", () => {
    expect(themeClass("system", false)).toBe("");
    expect(themeClass("system", true)).toBe("dark");
  });
});

describe("SYSTEM_THEME_SCRIPT", () => {
  const run = (theme: string, matches: boolean | undefined) => {
    const classList = new Set<string>();
    const document = { documentElement: { dataset: { theme }, classList: { add: (c: string) => classList.add(c) } } };
    const window = matches === undefined ? {} : { matchMedia: () => ({ matches }) };
    new Function("document", "window", SYSTEM_THEME_SCRIPT)(document, window);
    return [...classList];
  };

  it("adds dark only for a system mode on a dark device", () => {
    expect(run("system", true)).toEqual(["dark"]);
    expect(run("system", false)).toEqual([]);
    expect(run("light", true)).toEqual([]);
    expect(run("gnosia", true)).toEqual([]);
  });

  it("swallows a browser without matchMedia", () => {
    expect(() => run("system", undefined)).not.toThrow();
  });
});

describe("followTheme", () => {
  type Listener = () => void;
  function fakeBrowser(matches: boolean) {
    const classes = new Set<string>();
    const listeners = new Set<Listener>();
    const query = {
      get matches() {
        return matches;
      },
      addEventListener: (_: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    };
    const win = { matchMedia: () => query };
    const doc = {
      documentElement: {
        dataset: {} as Record<string, string>,
        classList: {
          toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
        },
      },
    };
    return {
      win,
      doc,
      classes,
      listeners,
      setDark(next: boolean) {
        matches = next;
        for (const fn of listeners) fn();
      },
    };
  }

  const withBrowser = async (b: ReturnType<typeof fakeBrowser>, run: () => void | Promise<void>) => {
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { document: g.document, window: g.window };
    g.document = b.doc;
    g.window = b.win;
    try {
      await run();
    } finally {
      g.document = saved.document;
      g.window = saved.window;
    }
  };

  it("follows the device under system, and stops on cleanup", async () => {
    const b = fakeBrowser(false);
    await withBrowser(b, () => {
      const stop = followTheme("system", b.win);
      expect([...b.classes]).toEqual([]);
      expect(b.doc.documentElement.dataset.theme).toBe("system");
      b.setDark(true);
      expect([...b.classes]).toEqual(["dark"]);
      b.setDark(false);
      expect([...b.classes]).toEqual([]);
      expect(b.listeners.size).toBe(1);
      stop();
      expect(b.listeners.size).toBe(0);
      b.setDark(true);
      expect([...b.classes]).toEqual([]);
    });
  });

  it("applies a fixed mode once and registers no listener", async () => {
    const b = fakeBrowser(true);
    await withBrowser(b, () => {
      for (const [mode, expected] of [
        ["light", []],
        ["gnosia", ["gnosia"]],
        ["dark", ["dark"]],
      ] as const) {
        const stop = followTheme(mode, b.win);
        expect([...b.classes]).toEqual([...expected]);
        expect(b.listeners.size).toBe(0);
        stop();
      }
    });
  });

  it("switching away from system drops the listener, so a later device change is ignored", async () => {
    const b = fakeBrowser(true);
    await withBrowser(b, () => {
      const stop = followTheme("system", b.win);
      expect([...b.classes]).toEqual(["dark"]);
      stop();
      followTheme("gnosia", b.win)();
      b.setDark(false);
      expect([...b.classes]).toEqual(["gnosia"]);
    });
  });
});
