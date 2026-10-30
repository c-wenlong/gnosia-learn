// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ContactSheet, VideoJob } from "@/lib/studio-video-job";

import { SheetStrip } from "./VideoJobPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

/**
 * The contact-sheet viewer opens over the strip with Close focused. Closing it
 * unmounts that button, so focus goes back to the thumbnail of the scene it
 * was showing, not to the page (S1-18 of the web audit).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const sheet = (scene: string): ContactSheet => ({ scene, title: scene, url: `/api/jobs/j1/sheets/${scene}.png`, renderedAt: null, round: 1 });
const JOB = { jobId: "j1", state: "running", classes: ["Opening", "Middle"], brief: null } as unknown as VideoJob;

async function mount(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(SheetStrip, { job: JOB, sheets: [sheet("Opening"), sheet("Middle")], loaded: true, running: true, chapters: null }));
  });
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const thumb = (host: HTMLElement, index: number) => host.querySelectorAll<HTMLButtonElement>("ol button")[index]!;
const buttonNamed = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((button) => button.textContent === text)!;

describe("SheetStrip", () => {
  it("puts focus back on the thumbnail when Close is pressed", async () => {
    const host = await mount();
    await act(async () => thumb(host, 0).click());
    expect(document.activeElement?.textContent).toBe("Close");
    await act(async () => buttonNamed(host, "Close").click());
    expect(document.activeElement).toBe(thumb(host, 0));
  });

  it("puts focus on the scene it was showing after a step and Escape", async () => {
    const host = await mount();
    await act(async () => thumb(host, 0).click());
    await act(async () => buttonNamed(host, "Next").click());
    await act(async () => {
      host.querySelector("figure")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(host.querySelector("figure")).toBeNull();
    expect(document.activeElement).toBe(thumb(host, 1));
  });
});
