import { describe, expect, it } from "vitest";

import { vocabularyBanner, vocabularyTopics } from "./studio-vocabulary";

/**
 * D13's banner and the runner's topic list, as the studio screens read them.
 * The pages only render what these return, so the wording is pinned here.
 */

const at = (iso: string) => `at ${iso}`;

describe("the stale banner", () => {
  it("says nothing when the topic list is current", () => {
    expect(vocabularyBanner({ stale: false, readAt: "2026-09-28T01:00:00.000Z" }, at)).toBeNull();
  });

  it("says nothing for a runner that does not report the field", () => {
    expect(vocabularyBanner(undefined, at)).toBeNull();
    expect(vocabularyBanner({ stale: "yes" }, at)).toBeNull();
  });

  it("says stale since the copy's time, as a warning, when the catalog could not be read", () => {
    const banner = vocabularyBanner(
      { stale: true, readAt: "2026-09-28T01:00:00.000Z", error: "catalog topic ls exited 3" },
      at,
    );
    expect(banner?.tone).toBe("warn");
    expect(banner?.text).toContain("stale since at 2026-09-28T01:00:00.000Z");
    expect(banner?.text).toContain("catalog topic ls exited 3");
  });

  it("says briefs cannot be checked, loudly, when there is no copy at all", () => {
    const banner = vocabularyBanner({ stale: true, readAt: null, error: "ECONNREFUSED" }, at);
    expect(banner?.tone).toBe("danger");
    expect(banner?.text).toContain("no saved copy");
    expect(banner?.text).toContain("briefs cannot be checked");
    expect(banner?.text).not.toContain("stale since");
  });

  it("leaves out an empty reason rather than printing empty brackets", () => {
    const banner = vocabularyBanner({ stale: true, readAt: "2026-09-28T01:00:00.000Z", error: " " }, at);
    expect(banner?.text).not.toContain("()");
  });

  it("formats the time for a person by default, and keeps a string it cannot parse", () => {
    expect(vocabularyBanner({ stale: true, readAt: "not a time" })?.text).toContain("stale since not a time");
  });
});

describe("the runner's topic list", () => {
  it("becomes the TopicEntry the chip and picker helpers take", () => {
    const topics = vocabularyTopics({
      topics: [
        {
          slug: "tcp-congestion-control",
          title: "TCP congestion control",
          domain: "networking",
          summary: null,
          aliases: ["congestion control"],
          relations: [],
          maps: { manimkc: [], courses: [], concepts: ["slow-start"] },
        },
      ],
      readAt: "2026-09-28T01:00:00.000Z",
      stale: false,
    });
    expect(topics).toEqual([
      {
        slug: "tcp-congestion-control",
        title: "TCP congestion control",
        domain: "networking",
        summary: null,
        aliases: ["congestion control"],
        relations: [],
        maps: { manimkc: [], courses: [], concepts: ["slow-start"] },
      },
    ]);
  });

  it("drops an entry with no slug or title, and fills what a thin one leaves out", () => {
    const topics = vocabularyTopics({ topics: [{ slug: "x" }, { slug: "y", title: "Y" }, null] });
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ slug: "y", domain: "", maps: { concepts: [] } });
  });

  it("is empty for anything that is not a topic list, so the chips fall back to slugs", () => {
    expect(vocabularyTopics(null)).toEqual([]);
    expect(vocabularyTopics({ error: "no copy" })).toEqual([]);
  });
});
