// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Callout } from "./Callout";
import { calloutClasses, STATUS_TEXT } from "./classes";
import { ErrorText } from "./ErrorText";
import { ErrorTip } from "./ErrorTip";
import { FormRow } from "./FormRow";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLElement;

function draw(element: ReturnType<typeof createElement>): HTMLElement {
  if (root === null) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root!.render(element));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

const tokens = (element: Element | null) => (element?.getAttribute("class") ?? "").split(" ");

describe("ErrorText", () => {
  it("is an alert line at the status line's size, in danger by default", () => {
    const line = draw(createElement(ErrorText, { id: "e1" }, "The save failed.")).querySelector("p")!;
    expect(line.getAttribute("role")).toBe("alert");
    expect(line.id).toBe("e1");
    expect(line.textContent).toBe("The save failed.");
    expect(tokens(line)).toEqual(expect.arrayContaining([...STATUS_TEXT.split(" "), "text-danger", "animate-fade-in"]));
    expect(tokens(line)).not.toContain("font-medium");
  });

  it("takes the warn tone for a nudge, and the caller's spacing", () => {
    const line = draw(createElement(ErrorText, { tone: "warn", className: "px-2" }, "Write your answer first.")).querySelector("p")!;
    expect(tokens(line)).toEqual(expect.arrayContaining(["text-warn-text", "px-2"]));
    expect(tokens(line)).not.toContain("text-danger");
  });

  it("draws nothing when there is nothing to say", () => {
    for (const empty of [null, undefined, false, ""]) {
      expect(draw(createElement(ErrorText, null, empty)).innerHTML).toBe("");
    }
  });

  it("is a new alert when the caller's key changes, so the same spot is announced again", () => {
    const first = draw(createElement(ErrorText, { key: "a" }, "Offline")).querySelector("p")!;
    const again = draw(createElement(ErrorText, { key: "b" }, "Offline")).querySelector("p")!;
    expect(again).not.toBe(first);
    expect(first.isConnected).toBe(false);
    const kept = draw(createElement(ErrorText, { key: "b" }, "Offline")).querySelector("p")!;
    expect(kept).toBe(again);
  });

  it("is FormRow's error line, named by the control's aria-describedby", () => {
    const out = draw(
      createElement(FormRow, {
        label: "Name",
        error: "A name is required.",
        children: (field: { id: string; describedBy: string | undefined; invalid: boolean }) =>
          createElement("input", { id: field.id, "aria-describedby": field.describedBy, "aria-invalid": field.invalid }),
      } as ComponentProps<typeof FormRow>),
    );
    const input = out.querySelector("input")!;
    const line = out.querySelector('[role="alert"]')!;
    expect(input.getAttribute("aria-describedby")).toBe(line.id);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(tokens(line)).toEqual(expect.arrayContaining(STATUS_TEXT.split(" ")));
  });
});

describe("ErrorTip", () => {
  it("floats under the button by default, as an alert on a surface card", () => {
    const tip = draw(createElement(ErrorTip, null, "Could not open it.")).querySelector("span")!;
    expect(tip.getAttribute("role")).toBe("alert");
    expect(tip.textContent).toBe("Could not open it.");
    expect(tokens(tip)).toEqual(expect.arrayContaining(["absolute", "right-0", "top-full", "mt-1", "max-w-44", "bg-surface", "text-danger"]));
    expect(tokens(tip)).not.toContain("bottom-full");
  });

  it("floats above when asked", () => {
    const tip = draw(createElement(ErrorTip, { place: "above" } as ComponentProps<typeof ErrorTip>, "Cancel was refused.")).querySelector("span")!;
    expect(tokens(tip)).toEqual(expect.arrayContaining(["bottom-full", "mb-1"]));
    expect(tokens(tip)).not.toContain("top-full");
  });
});

describe("Callout's dense and actionsAt", () => {
  it("draws the small box with a 1px ring when dense, and the full one otherwise", () => {
    const dense = calloutClasses({ tone: "danger", dense: true, bordered: true }).split(" ");
    expect(dense).toEqual(expect.arrayContaining(["rounded-md", "p-2", "text-[12px]", "border", "border-danger/45", "bg-danger/8"]));
    expect(dense).not.toContain("border-2");
    expect(dense).not.toContain("rounded-xl");
    const full = calloutClasses({ tone: "danger", bordered: true }).split(" ");
    expect(full).toEqual(expect.arrayContaining(["rounded-xl", "px-4", "py-3", "border-2"]));
  });

  it("puts the actions at the end of the words' line with actionsAt end", () => {
    const out = draw(
      createElement(
        Callout,
        { role: "alert", actionsAt: "end", actions: createElement("button", { type: "button" }, "Try again") },
        "The tutor could not answer.",
      ),
    );
    const box = out.firstElementChild!;
    expect(box.getAttribute("role")).toBe("alert");
    expect(tokens(box)).toEqual(expect.arrayContaining(["flex-row", "flex-wrap", "items-center"]));
    const words = [...box.children].find((child) => child.textContent === "The tutor could not answer.")!;
    expect(tokens(words)).toContain("flex-1");
    const actions = box.querySelector("button")!.parentElement!;
    expect(tokens(actions)).not.toContain("pt-1");
    expect(words.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the actions under the words by default", () => {
    const out = draw(createElement(Callout, { actions: createElement("button", { type: "button" }, "Retry") }, "Failed."));
    const box = out.firstElementChild!;
    expect(tokens(box)).toContain("flex-col");
    expect(tokens(box.querySelector("button")!.parentElement)).toContain("pt-1");
  });

  it("draws a dense title at the box's own size", () => {
    const out = draw(createElement(Callout, { tone: "danger", dense: true, title: "exit 1: the agent failed" }, "Nothing landed."));
    const title = out.querySelector("p")!;
    expect(title.textContent).toBe("exit 1: the agent failed");
    expect(tokens(title)).not.toContain("text-[14px]");
    expect(tokens(title)).toContain("font-semibold");
  });
});
