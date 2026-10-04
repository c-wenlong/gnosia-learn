// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readCookie, writeCookie } from "./client-cookie";

/** The preference cookies' browser side: one way to write them, one to read them back. */

afterEach(() => {
  for (const name of ["a", "b", "gnosia-sidebar"]) document.cookie = `${name}=; Path=/; Max-Age=0`;
  vi.restoreAllMocks();
});

describe("writeCookie", () => {
  it("writes a site-wide, Lax cookie for the time given", () => {
    const set = vi.spyOn(document, "cookie", "set");
    writeCookie("a", "on", 60);
    expect(set).toHaveBeenCalledWith("a=on; Path=/; Max-Age=60; SameSite=Lax");
  });

  it("adds Secure on an https page", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({ protocol: "https:" } as Location);
    const set = vi.spyOn(document, "cookie", "set");
    writeCookie("a", "on", 60);
    expect(set).toHaveBeenCalledWith("a=on; Path=/; Max-Age=60; SameSite=Lax; Secure");
  });

  it("is read back by readCookie", () => {
    writeCookie("a", "collapsed", 60);
    writeCookie("b", "open", 60);
    expect(readCookie("a")).toBe("collapsed");
    expect(readCookie("b")).toBe("open");
  });
});

describe("readCookie", () => {
  it("finds a cookie by its whole name, with or without a space after the separator", () => {
    expect(readCookie("theme", "theme-fade=1; theme=dark")).toBe("dark");
    expect(readCookie("theme", "x=1;theme=gnosia")).toBe("gnosia");
  });

  it("is undefined for a cookie that is not there, and empty for one set to nothing", () => {
    expect(readCookie("theme", "other=1")).toBeUndefined();
    expect(readCookie("theme", "")).toBeUndefined();
    expect(readCookie("theme", "theme=")).toBe("");
  });

  it("reads the browser's cookies when given none", () => {
    document.cookie = "gnosia-sidebar=open; Path=/";
    expect(readCookie("gnosia-sidebar")).toBe("open");
  });
});

describe("one place writes a cookie from the browser", () => {
  it("leaves no other module setting document.cookie", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const rel = relative(src, path);
          if (rel !== join("lib", "client-cookie.ts") && /document\.cookie\s*=(?!=)/.test(readFileSync(path, "utf8"))) offenders.push(rel);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
