import { describe, expect, it } from "vitest";

import { resourceLink } from "./resource-link";

describe("resourceLink", () => {
  it("calls a /library/ link Library and keeps it in the same tab", () => {
    expect(resourceLink("/library/manimkc%3Aout%2Fcomputer-architecture%2Fweek3.mp4")).toEqual({
      where: "Library",
      href: "/library/manimkc%3Aout%2Fcomputer-architecture%2Fweek3.mp4",
      internal: true,
    });
  });

  it("calls any other site-relative link This site", () => {
    expect(resourceLink("/courses/cs4223")).toEqual({ where: "This site", href: "/courses/cs4223", internal: true });
    expect(resourceLink("/")).toEqual({ where: "This site", href: "/", internal: true });
  });

  it("keeps the host of an absolute http(s) link, minus www.", () => {
    expect(resourceLink("https://arxiv.org/abs/1706.03762")).toEqual({
      where: "arxiv.org",
      href: "https://arxiv.org/abs/1706.03762",
      internal: false,
    });
    expect(resourceLink("http://www.example.com/a")).toEqual({
      where: "example.com",
      href: "http://www.example.com/a",
      internal: false,
    });
  });

  it("gives no link to anything that is neither http(s) nor a path on this site", () => {
    for (const url of ["not a url", "mailto:a@b.co", "javascript:alert(1)", "data:text/html,<b>x</b>", " JavaScript:alert(1)"]) {
      expect(resourceLink(url), url).toEqual({ where: url, href: null, internal: false });
    }
  });

  it("never calls a link to another site internal, protocol-relative or with a backslash", () => {
    expect(resourceLink("//cdn.example.com/x")).toEqual({ where: "//cdn.example.com/x", href: null, internal: false });
    expect(resourceLink("/\\example.com/path")).toEqual({ where: "/\\example.com/path", href: null, internal: false });
  });

  it("reads the URL as a browser will, which drops tabs and line breaks", () => {
    // A browser resolves "/\t/evil.example" to "//evil.example": another site.
    for (const url of ["/\t/evil.example", "/\n/evil.example", "/\r\\evil.example", " //evil.example"]) {
      expect(resourceLink(url).internal, JSON.stringify(url)).toBe(false);
    }
    expect(resourceLink("java\tscript:alert(1)").href).toBeNull();
    expect(resourceLink(" https://arxiv.org/abs/1 \n")).toMatchObject({ href: "https://arxiv.org/abs/1", internal: false });
  });
});
