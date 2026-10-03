import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_ENV, studioEnabled, studioOrigin } from "./studio";

/**
 * D11's gate, and the test that makes it a structural property.
 *
 * The decision is that the studio routes exist in `apps/web` and that
 * production — where `STUDIO_ENABLED` is unset — serves 404 for every one of
 * them, so the deployed site stays the course encyclopedia and no headless
 * browser or agent runner reaches that build. The whole of that rests on one
 * call being at the top of each route, which is precisely the kind of thing a
 * new file forgets.
 *
 * So the test does not check the two routes that exist today. It walks the
 * directory and requires the call in every entry point it finds, which means
 * adding `apps/web/src/app/(app)/studio/jobs/page.tsx` without the gate turns this
 * red rather than quietly shipping an ungated surface.
 */

const STUDIO_DIR = path.resolve(import.meta.dirname, "..", "app", "(app)", "studio");

/**
 * The filenames Next will invoke on its own.
 *
 * `actions.ts` is in the list and is not a route: a server action compiles to a
 * POST endpoint with a stable id, so an ungated one is a way into the runner on
 * a deployment that has no studio. That is the same hole with a different door.
 */
const ENTRY_POINTS = new Set([
  "page.tsx",
  "page.ts",
  "layout.tsx",
  "route.ts",
  "route.tsx",
  "default.tsx",
  "template.tsx",
  "actions.ts",
]);

function entryPointsUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...entryPointsUnder(full));
    else if (ENTRY_POINTS.has(entry.name)) found.push(full);
  }
  return found;
}

describe("every entry point under app/studio", () => {
  const files = entryPointsUnder(STUDIO_DIR);

  it("finds the routes at all, so a broken walk cannot pass by finding nothing", () => {
    // Three today: the grid, the canvas, the proxy — plus the actions file.
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.map((file) => path.relative(STUDIO_DIR, file)).sort()).toContain("page.tsx");
  });

  it.each(files.map((file) => [path.relative(STUDIO_DIR, file), file]))(
    "%s calls requireStudio()",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/\brequireStudio\(\)/);
      expect(source).toMatch(/from "@\/lib\/studio"/);
    },
  );
});

/**
 * One call somewhere in a file is not enough for `actions.ts`.
 *
 * A route file has one entry point; an actions file has as many as it has
 * exports, each compiled to its own callable POST endpoint with its own stable
 * id. A whole-file check passes the moment *any* function in it mentions the
 * gate, so a new action added beside three gated ones would ship ungated and
 * the suite would stay green. Caught in review on the phase 2 PR.
 *
 * So this reads each exported function's own body. That is also why the gate is
 * spelled out in each action rather than hoisted into the shared helper they
 * all call: a gate reached only through a helper cannot be checked per endpoint,
 * and "every endpoint is gated" is the property worth having.
 */
function exportedBodies(source: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];
  const signature = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g;
  for (const match of source.matchAll(signature)) {
    const open = source.indexOf("{", match.index + match[0].length - 1);
    if (open === -1) continue;
    let depth = 0;
    for (let at = open; at < source.length; at += 1) {
      if (source[at] === "{") depth += 1;
      else if (source[at] === "}") {
        depth -= 1;
        if (depth === 0) {
          found.push({ name: match[1] ?? "", body: source.slice(open, at + 1) });
          break;
        }
      }
    }
  }
  return found;
}

describe("every exported server action", () => {
  const file = path.join(STUDIO_DIR, "actions.ts");
  // Every exported function of a "use server" file is an endpoint, whether a
  // `<form action=…>` posts FormData to it or a component calls it with an
  // object (the tutor's hand-off does), so none is filtered out. Such a file
  // can export only async functions, which is what the parser finds.
  const actions = exportedBodies(readFileSync(file, "utf8"));

  it("finds the actions, so a parser that breaks cannot pass by finding none", () => {
    expect(actions.map((fn) => fn.name).sort()).toEqual([
      "commitDiagram",
      "exportSvg",
      "inspectDiagram",
      "loadStudioSettings",
      "openConceptConversation",
      "restartMirror",
      "saveStudioAgent",
      "verifySvg",
    ]);
  });

  it.each(actions.map((fn) => [fn.name, fn.body]))("%s calls requireStudio() itself", (_name, body) => {
    expect(body).toMatch(/\brequireStudio\(\)/);
  });
});

describe("the gate itself", () => {
  it("is off when the variable is absent, which is what production looks like", () => {
    expect(studioEnabled({})).toBe(false);
  });

  it.each(["", "0", "false", "off", "no", " FALSE ", "Off"])(
    "treats %j as set-but-no rather than as enabled",
    (value) => {
      expect(studioEnabled({ [STUDIO_ENV]: value })).toBe(false);
    },
  );

  it.each(["1", "true", "yes", "please"])("treats %j as on", (value) => {
    expect(studioEnabled({ [STUDIO_ENV]: value })).toBe(true);
  });
});

describe("where the runner is", () => {
  it("defaults to the port the service binds", () => {
    expect(studioOrigin({})).toBe("http://127.0.0.1:7250");
  });

  it("follows STUDIO_PORT, so a moved runner is not configured twice", () => {
    expect(studioOrigin({ STUDIO_PORT: "7300" })).toBe("http://127.0.0.1:7300");
  });

  it("ignores a port that is not one, rather than building a broken URL", () => {
    expect(studioOrigin({ STUDIO_PORT: "banana" })).toBe("http://127.0.0.1:7250");
    expect(studioOrigin({ STUDIO_PORT: "80" })).toBe("http://127.0.0.1:7250");
  });
});
