// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { recallHref, type RecallPick } from "@/lib/home-core";

import { RecallCard } from "./RecallCard";

/**
 * Worth a quick recall: each row links to its concept (docs/proposals/home-page.md,
 * part 4), the whole row and not just its title, and Start recall opens the first.
 */
const pick = (conceptId: string, title: string, lastSeen: string | null): RecallPick => ({ conceptId, title, bucket: "learning", lastSeen });

describe("RecallCard", () => {
  it("makes each whole row one link to its concept", () => {
    const picks = [pick("softmax", "Softmax", "3 days ago"), pick("dot-product", "Dot product", null)];
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(createElement(RecallCard, { picks })), "text/html");
    const rows = [...doc.querySelectorAll("li")];
    expect(rows).toHaveLength(2);
    for (const [i, li] of rows.entries()) {
      const links = li.querySelectorAll("a");
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute("href")).toBe(recallHref(picks[i]));
      // The dot, the title and the last-seen note are all inside the link.
      expect(li.firstElementChild).toBe(links[0]);
    }
    expect(rows[0].textContent).toContain("last seen 3 days ago");
    const start = [...doc.querySelectorAll("a")].find((a) => a.textContent === "Start recall");
    expect(start?.getAttribute("href")).toBe(recallHref(picks[0]));
  });
});
