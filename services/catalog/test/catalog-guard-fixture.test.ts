import { homedir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { connect } from "../src/db";

/**
 * Run only by catalog-isolation.test.ts, in a vitest of its own whose shell
 * names a sentinel catalog in `CATALOG_GUARD_SENTINEL` and a sentinel home in
 * `HOME`. Both are forbidden there, and each test here tries to open one the
 * way a careless suite would. Skipped in an ordinary run, where the forbidden
 * files are the owner's real ones and a missing guard would write to them.
 */
const sentinel = process.env.CATALOG_GUARD_SENTINEL;

describe.runIf(process.env.CATALOG_GUARD_FIXTURE === "1" && sentinel !== undefined)("opening a forbidden catalog", () => {
  it("is refused at the open when the url names it", () => {
    expect(() => connect({ url: sentinel })).toThrow(/a catalog it did not make/);
  });

  it("is refused at the open when the variables are gone and the default applies", () => {
    const saved = { url: process.env.DATABASE_URL, home: process.env.GNOSIA_HOME };
    delete process.env.DATABASE_URL;
    delete process.env.GNOSIA_HOME;
    try {
      // `HOME` is the sentinel home, so this is `<sentinel home>/.gnosia/catalog.db`.
      expect(path.join(homedir(), ".gnosia", "catalog.db").startsWith(process.env.HOME ?? "\0")).toBe(true);
      expect(() => connect()).toThrow(/a catalog it did not make/);
    } finally {
      if (saved.url !== undefined) process.env.DATABASE_URL = saved.url;
      if (saved.home !== undefined) process.env.GNOSIA_HOME = saved.home;
    }
  });
});
