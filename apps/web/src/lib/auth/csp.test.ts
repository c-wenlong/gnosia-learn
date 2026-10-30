import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

import { BASE_HEADERS, contentSecurityPolicy, makeNonce, PAGE_SOURCE } from "./csp";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values] as [string, string[]];
    }),
  );
}

describe("contentSecurityPolicy", () => {
  it("runs scripts by nonce alone when it has one, with no inline or eval escape in production", () => {
    const policy = directives(contentSecurityPolicy({ nonce: "abc", dev: false }));
    expect(policy.get("script-src")).toEqual(["'nonce-abc'", "'strict-dynamic'"]);
  });

  it("falls back to self and inline scripts with no nonce", () => {
    const policy = directives(contentSecurityPolicy({ nonce: null, dev: false }));
    expect(policy.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("adds eval and a websocket only in development", () => {
    const dev = directives(contentSecurityPolicy({ nonce: "n", dev: true }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toContain("ws:");
    const prod = directives(contentSecurityPolicy({ nonce: "n", dev: false }));
    expect(prod.get("connect-src")).toEqual(["'self'"]);
  });

  it("names no outside host an image, a fetch or a form can reach", () => {
    for (const nonce of ["n", null]) {
      const policy = directives(contentSecurityPolicy({ nonce, dev: false }));
      for (const name of ["default-src", "img-src", "media-src", "connect-src", "font-src", "form-action", "base-uri", "object-src"]) {
        for (const value of policy.get(name) ?? []) {
          expect(["'self'", "data:", "blob:"], `${name} ${value}`).toContain(value);
        }
      }
      expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
      expect(policy.get("frame-src")).toEqual(["'self'", "http://127.0.0.1:*", "http://localhost:*"]);
    }
  });

  it("makes a different nonce each time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => makeNonce()));
    expect(seen.size).toBe(50);
  });
});

describe("next.config headers", () => {
  it("turns X-Powered-By off and sends the base headers everywhere and the page policy on pages", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = (await nextConfig.headers?.()) ?? [];
    const everywhere = rules.find((rule) => rule.source === "/:path*");
    expect(everywhere?.headers).toEqual(BASE_HEADERS);
    const pages = rules.find((rule) => rule.source === PAGE_SOURCE);
    expect(pages?.headers.find((header) => header.key === "X-Frame-Options")?.value).toBe("DENY");
    expect(pages?.headers.find((header) => header.key === "Content-Security-Policy")?.value).toContain("frame-ancestors 'none'");
    // The page rule comes last, so its X-Frame-Options wins over the base one.
    expect(rules.indexOf(pages!)).toBeGreaterThan(rules.indexOf(everywhere!));
  });

  it("keeps the API trees and Next's output out of the page rule", () => {
    const pattern = new RegExp(`^${PAGE_SOURCE}$`);
    for (const page of ["/", "/home", "/learn/x.png", "/studio/d/a", "/sign-in"]) expect(pattern.test(page), page).toBe(true);
    for (const other of ["/api/assets/x/file", "/studio/api/diagrams/a/svg", "/_next/static/a.js"]) {
      expect(pattern.test(other), other).toBe(false);
    }
  });
});
