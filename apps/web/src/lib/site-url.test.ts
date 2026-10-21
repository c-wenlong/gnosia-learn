import { afterEach, describe, expect, it, vi } from "vitest";

import { LOCAL_SITE_URL, resolveSiteUrl } from "@/lib/site-url";

/**
 * One resolver, so the social card and the OpenRouter attribution header can
 * never disagree about where this deployment lives. They did: a second parse
 * in `providers.ts` returned an unparseable value unchanged while this one
 * fell back to localhost.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveSiteUrl", () => {
  it("takes the configured origin", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.test" }).toString()).toBe(
      "https://example.test/",
    );
  });

  it("assumes https for a bare domain", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "example.test" }).origin).toBe(
      "https://example.test",
    );
  });

  it("falls back to the Vercel production domain", () => {
    expect(
      resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "gnosia.vercel.app" }).origin,
    ).toBe("https://gnosia.vercel.app");
  });

  it("treats an empty string as unset, which once crashed a build", () => {
    // `??` does not fall through on "", and `new URL("")` throws. The variable
    // is `||`-chained and trimmed for exactly this.
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "" }).toString()).toBe(`${LOCAL_SITE_URL}/`);
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "   " }).toString()).toBe(
      `${LOCAL_SITE_URL}/`,
    );
    expect(resolveSiteUrl({}).toString()).toBe(`${LOCAL_SITE_URL}/`);
  });

  it("falls back to localhost on an unparseable value, and says so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://" }).toString()).toBe(
      `${LOCAL_SITE_URL}/`,
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it("prefers the explicit variable over the Vercel one", () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://canonical.test",
        VERCEL_PROJECT_PRODUCTION_URL: "preview.vercel.app",
      }).origin,
    ).toBe("https://canonical.test");
  });
});
