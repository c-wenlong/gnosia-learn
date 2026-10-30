import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
}));

const { VerbNotice } = await import("./StudioChrome");

/**
 * A verb's banner: the studio's own headline, and whatever the URL carried
 * only as a quote of the runner, the detail included (R2-1-06 and the
 * Greptile review of #595).
 */
describe("VerbNotice", () => {
  const draw = (report: { ok: boolean; headline: string; said: string | null; detail: string | null }) =>
    renderToStaticMarkup(createElement(VerbNotice, { report, clearHref: "/studio" }));

  it("quotes a detail from the URL even with no message beside it", () => {
    const html = draw({ ok: false, headline: "Export did not finish.", said: null, detail: "Your session expired" });
    expect(html).toContain("Export did not finish.");
    expect(html).toContain("The runner said: “Your session expired”");
  });

  it("quotes the message and the detail together, and nothing when there is neither", () => {
    expect(draw({ ok: false, headline: "Verify did not pass.", said: "verify exited 1", detail: "x.svg does not exist" })).toContain(
      "The runner said: “verify exited 1 · x.svg does not exist”",
    );
    expect(draw({ ok: true, headline: "Committed.", said: null, detail: null })).not.toContain("The runner said");
  });
});
