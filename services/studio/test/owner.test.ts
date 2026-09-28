import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LOCAL_LEARNER_ID, STUDIO_OWNER_HEADER } from "@self-learn/schema/shared";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { ownerRefusal } from "../src/api";
import { studioOwner } from "../src/config";
import { cachePath } from "../src/content-cache";

/**
 * The studio and owners (phase 4 of docs/CONTENT-MIGRATION.md).
 *
 * The review of phase 4 found the studio listing, opening and serving another
 * owner's diagrams in both directions: every `catalog diagram` call read the
 * whole database. Two things close it, and each is pinned here:
 *
 * 1. Every diagram, job and session verb the runner spawns names the owner it
 *    serves (`--owner`), so the catalog reads and writes only what that owner
 *    may. The check reads `src/catalog.ts` rather than trusting a list, so a
 *    verb added later without it fails here.
 * 2. The API answers only that owner: a request the web app names as another
 *    owner's is refused before any route runs.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(HERE, "..", "src", "catalog.ts");

/** The literal argument lists handed to `catalog(...)` in each exported function. */
function catalogCalls(): { fn: string; args: string }[] {
  const source = ts.createSourceFile(CATALOG, readFileSync(CATALOG, "utf8"), ts.ScriptTarget.Latest, true);
  const calls: { fn: string; args: string }[] = [];
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name === undefined) continue;
    const exported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!exported) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "catalog") {
        const [first] = node.arguments;
        if (first !== undefined) calls.push({ fn: statement.name!.text, args: first.getText(source) });
      }
      ts.forEachChild(node, visit);
    };
    visit(statement);
  }
  return calls;
}

describe("the runner's catalog calls", () => {
  it("name the owner on every diagram, job and session verb", () => {
    const owning = catalogCalls().filter((call) => /^\[\s*"(diagram|job|session)"/.test(call.args));
    expect(owning.map((call) => call.fn).sort()).toEqual(
      [
        "diagramCheckout",
        "diagramCommit",
        "diagramList",
        "diagramPut",
        "diagramShow",
        "jobAccept",
        "jobClaim",
        "jobDiscard",
        "jobEnqueue",
        "jobFinish",
        "jobShow",
        "sessionEnd",
        "sessionStart",
      ].sort(),
    );
    for (const call of owning) {
      expect(call.args, `${call.fn} leaves the owner to the CLI's default`).toContain("...owned()");
    }
  });
});

describe("the owner the runner serves", () => {
  const request = (headers: Record<string, string | string[]>) => ({ headers }) as unknown as IncomingMessage;

  it("is local unless STUDIO_OWNER names another", () => {
    expect(studioOwner({})).toBe(LOCAL_LEARNER_ID);
    expect(studioOwner({ STUDIO_OWNER: "  " })).toBe(LOCAL_LEARNER_ID);
    expect(studioOwner({ STUDIO_OWNER: "someone" })).toBe("someone");
  });

  it("answers a program with no owner header, and the web app naming this owner", () => {
    expect(ownerRefusal(request({}), "local")).toBeNull();
    expect(ownerRefusal(request({ [STUDIO_OWNER_HEADER]: "local" }), "local")).toBeNull();
    expect(ownerRefusal(request({ [STUDIO_OWNER_HEADER]: " someone " }), "someone")).toBeNull();
  });

  it("refuses another owner, or a header naming two, without naming either", () => {
    for (const named of ["other", "", ["local", "other"], ["local", "local"]]) {
      const refusal = ownerRefusal(request({ [STUDIO_OWNER_HEADER]: named }), "local");
      expect(refusal).not.toBeNull();
      expect(refusal).not.toMatch(/\blocal\b|\bother\b/);
    }
  });
});

describe("the cached diagram list", () => {
  it("is one file per owner, and no name leaves the cache directory", () => {
    expect(path.basename(cachePath("diagrams.local"))).toBe("diagrams.local.json");
    expect(path.basename(cachePath("diagrams.some-one_2"))).toBe("diagrams.some-one_2.json");
    for (const name of ["diagrams.", "diagrams./x", "diagrams...", "diagrams.a.b", "../diagrams", "diagrams.a/b"]) {
      expect(() => cachePath(name)).toThrow();
    }
  });
});
