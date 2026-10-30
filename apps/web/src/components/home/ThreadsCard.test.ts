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
});
