import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Thread } from "@/lib/home-core";

import { ThreadsCard } from "./ThreadsCard";

/**
 * Home's "Pick up where you left off" calls each row what the sidebar calls
 * it (`recentGlyph`): a conversation is a "Conversation", a course page with
 * no module open a "Course".
 */

const thread = (patch: Partial<Thread> & Pick<Thread, "key" | "kind" | "title">): Thread => ({
  detail: null,
  href: "/x",
  at: "2026-10-30T10:00:00.000Z",
  day: "Today",
  ...patch,
});

describe("ThreadsCard", () => {
  it("names each row's kind as the sidebar does", () => {
    const html = renderToStaticMarkup(
      createElement(ThreadsCard, {
        reachable: true,
        threads: [
          thread({ key: "draft:d1", kind: "draft", title: "TCP vs UDP", draftId: "d1" }),
          thread({ key: "module:cs3230/m2", kind: "module", title: "Divide and conquer" }),
        ],
      }),
    );
    expect(html).toContain('<span class="sr-only">Conversation: </span>TCP vs UDP');
    expect(html).toContain('<span class="sr-only">Course module: </span>Divide and conquer');
    expect(html).not.toContain("Studio draft");
  });

  it("says the list could not be read, and offers no way onward", () => {
    const html = renderToStaticMarkup(createElement(ThreadsCard, { reachable: false, threads: [] }));
    expect(html).toContain("What you were doing could not be read.");
    expect(html).not.toContain("Nothing to go back to yet");
    expect(html).not.toContain('href="/courses"');
  });

  it("says there is nothing yet when the list is simply empty, and points at the courses", () => {
    const html = renderToStaticMarkup(createElement(ThreadsCard, { reachable: true, threads: [] }));
    expect(html).toContain("Nothing to go back to yet");
    expect(html).toContain('href="/courses"');
  });

  it("shows a concept's mastery in place of a detail, and a video's progress beside it", () => {
    const html = renderToStaticMarkup(
      createElement(ThreadsCard, {
        reachable: true,
        threads: [
          thread({ key: "concept:c1", kind: "concept", title: "Bayes", bucket: "learning", pL: 0.42 }),
          thread({ key: "video:v1", kind: "video", title: "The video", detail: "2:17 of 11:36", percent: 40 }),
        ],
      }),
    );
    expect(html).toContain("Learning · p(L) 0.42");
    expect(html).toContain("2:17 of 11:36");
    expect(html).toContain('aria-label="40% watched"');
  });
});
