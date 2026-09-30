import { describe, expect, it } from "vitest";

import { resourceLink } from "./resource-link";

describe("resourceLink", () => {
  it("calls a /library/ link Library and keeps it in the same tab", () => {
    expect(resourceLink("/library/manimkc%3Aout%2Fcomputer-architecture%2Fweek3.mp4")).toEqual({
      where: "Library",
      internal: true,
    });
  });

  it("calls any other site-relative link This site", () => {
    expect(resourceLink("/courses/cs4223")).toEqual({ where: "This site", internal: true });
    expect(resourceLink("/")).toEqual({ where: "This site", internal: true });
  });

  it("keeps the host of an absolute http(s) link, minus www.", () => {
    expect(resourceLink("https://arxiv.org/abs/1706.03762")).toEqual({ where: "arxiv.org", internal: false });
    expect(resourceLink("http://www.example.com/a")).toEqual({ where: "example.com", internal: false });
  });

  it("falls back to the raw text when the link does not parse, and never calls it internal", () => {
    expect(resourceLink("not a url")).toEqual({ where: "not a url", internal: false });
    expect(resourceLink("//cdn.example.com/x")).toEqual({ where: "//cdn.example.com/x", internal: false });
    expect(resourceLink("mailto:a@b.co")).toEqual({ where: "mailto:a@b.co", internal: false });
  });
});
