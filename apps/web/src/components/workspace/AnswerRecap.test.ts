// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { AnswerRecap } from "./AnswerRecap";

/**
 * What a check card shows back once the learner has answered: one
 * description list, laid out stacked on the recall card and inline on the
 * choice card, with the confidence where each card has always put it.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

async function mount(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const recap = (props: ComponentProps<typeof AnswerRecap>) => mount(createElement(AnswerRecap, props));
const cells = (host: HTMLElement) => [...host.querySelectorAll("dl > div")].map((row) => [...row.children].map((c) => c.textContent));

describe("AnswerRecap", () => {
  it("stacks a recall answer under its label, with the confidence on the label and line breaks kept", async () => {
    const host = await recap({ layout: "stacked", answer: "First line\nsecond line", confidence: 70, thinking: "From the handshake" });
    expect(cells(host)).toEqual([
      ["Your answer · 70% sure", "First line\nsecond line"],
      ["Your reasoning", "From the handshake"],
    ]);
    const [answerRow] = host.querySelectorAll("dl > div");
    expect(answerRow.className).toContain("flex-col");
    expect(answerRow.querySelector("dd")?.className).toContain("whitespace-pre-wrap");
  });

  it("puts a choice answer beside its label, with the confidence after the option", async () => {
    const host = await recap({ layout: "inline", answer: "SYN and ACK", confidence: 30, thinking: null });
    expect(cells(host)).toEqual([["Your answer", "SYN and ACK · 30% sure"]]);
    const [answerRow] = host.querySelectorAll("dl > div");
    expect(answerRow.className).toContain("flex-wrap");
    expect(answerRow.querySelector("dd")?.className).not.toContain("whitespace-pre-wrap");
  });

  it("shows no confidence when there is none, and no reasoning row when none was given", async () => {
    const host = await recap({ layout: "inline", answer: "I don't know", confidence: null, thinking: null });
    expect(host.textContent).not.toContain("sure");
    expect(host.querySelectorAll("dt")).toHaveLength(1);
    expect(host.querySelectorAll("dl")).toHaveLength(1);
  });
});
