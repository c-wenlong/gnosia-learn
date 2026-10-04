// @vitest-environment jsdom
import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { NEAR_FOOT_PX, useFollowFoot } from "./use-follow-foot";

/**
 * A thread or a log that keeps its foot in view as it grows: a jump on
 * opening, a glide after that (a jump for a reader who asked for less
 * motion), and, for a polled log, staying put while the reader has scrolled
 * up to read.
 *
 * jsdom lays nothing out, so the box's geometry is a stand-in: `height` is
 * the content's, `VIEW` the box's own, and `scrollTop` is clamped to the
 * range a browser allows.
 */

const VIEW = 200;
let height = 1000;
const tops = new WeakMap<Element, number>();
/** A jump lands at once; a smooth scroll has not moved yet when the call returns. */
const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  if (options.behavior !== "smooth") this.scrollTop = options.top ?? 0;
});

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const proto = HTMLDivElement.prototype;
  Object.defineProperty(proto, "scrollHeight", { configurable: true, get: () => height });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => VIEW });
  Object.defineProperty(proto, "scrollTop", {
    configurable: true,
    get(this: Element) {
      return tops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      tops.set(this, Math.max(0, Math.min(value, height - VIEW)));
    },
  });
  Object.defineProperty(proto, "scrollTo", { configurable: true, writable: true, value: scrollTo });
});

beforeEach(() => {
  height = 1000;
  scrollTo.mockClear();
  delete document.documentElement.dataset.motion;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

type Options = { glide?: boolean; onlyNearFoot?: boolean };

function Log({ trigger, options }: { trigger: unknown; options?: Options }) {
  const box = useRef<HTMLDivElement>(null);
  useFollowFoot(box, trigger, options);
  return createElement("div", { ref: box });
}

function mount(options?: Options) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let trigger = 0;
  act(() => root.render(createElement(Log, { trigger, options })));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const box = host.firstElementChild as HTMLDivElement;
  return {
    box,
    /** The content grows by `by` pixels and the trigger changes, as a poll's new lines do. */
    grow: (by: number) => {
      height += by;
      trigger += 1;
      act(() => root.render(createElement(Log, { trigger, options })));
    },
    /** The reader scrolls to `top`. */
    scroll: (top: number) => {
      box.scrollTop = top;
      act(() => {
        box.dispatchEvent(new Event("scroll"));
      });
    },
  };
}

const foot = () => height - VIEW;

describe("useFollowFoot", () => {
  it("jumps to the foot on opening, and follows each change", () => {
    const log = mount();
    expect(log.box.scrollTop).toBe(foot());
    expect(scrollTo).not.toHaveBeenCalled();
    log.grow(300);
    expect(log.box.scrollTop).toBe(foot());
  });

  it("without onlyNearFoot follows even a reader who scrolled up, as a thread does", () => {
    const log = mount();
    log.scroll(100);
    log.grow(300);
    expect(log.box.scrollTop).toBe(foot());
  });

  it("glides after the first jump", () => {
    const log = mount({ glide: true });
    expect(scrollTo).not.toHaveBeenCalled();
    log.grow(300);
    expect(scrollTo).toHaveBeenCalledWith({ top: height, behavior: "smooth" });
  });

  it("jumps instead of gliding under reduced motion", () => {
    document.documentElement.dataset.motion = "reduce";
    const log = mount({ glide: true });
    log.grow(300);
    expect(scrollTo).toHaveBeenCalledWith({ top: height, behavior: "auto" });
  });

  describe("onlyNearFoot", () => {
    it("follows a reader at the foot, though the new lines are between them and it", () => {
      const log = mount({ onlyNearFoot: true });
      log.grow(300);
      expect(log.box.scrollTop).toBe(foot());
      log.grow(300);
      expect(log.box.scrollTop).toBe(foot());
    });

    it("leaves a reader who scrolled up where they are, poll after poll", () => {
      const log = mount({ onlyNearFoot: true });
      log.scroll(300);
      log.grow(300);
      expect(log.box.scrollTop).toBe(300);
      log.grow(0);
      expect(log.box.scrollTop).toBe(300);
    });

    it("follows again once the reader is back near the foot", () => {
      const log = mount({ onlyNearFoot: true });
      log.scroll(300);
      log.grow(300);
      log.scroll(foot() - NEAR_FOOT_PX);
      log.grow(300);
      expect(log.box.scrollTop).toBe(foot());
    });

    it("still counts a reader just short of the foot as at it", () => {
      const log = mount({ onlyNearFoot: true });
      log.scroll(foot() - NEAR_FOOT_PX + 5);
      log.grow(300);
      expect(log.box.scrollTop).toBe(foot());
    });

    it("keeps following while the box moves down towards the foot, as a glide does", () => {
      const log = mount({ glide: true, onlyNearFoot: true });
      log.grow(600);
      // The glide is on its way: scrolled down, but not yet near the foot.
      log.scroll(log.box.scrollTop + 100);
      log.scroll(log.box.scrollTop + 100);
      expect(foot() - log.box.scrollTop).toBeGreaterThan(NEAR_FOOT_PX);
      log.grow(100);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: height, behavior: "smooth" });
    });
  });
});
