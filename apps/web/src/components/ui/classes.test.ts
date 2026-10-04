import { describe, expect, it } from "vitest";

import {
  badgeClasses,
  buttonClasses,
  cardClasses,
  chipClasses,
  cx,
  FOCUS,
  iconButtonClasses,
  inputClasses,
  linkClasses,
  textareaClasses,
} from "./classes";

/** The hover and press tokens of a class string, each of which must be scoped to an enabled control. */
const reactive = (c: string) => c.split(" ").filter((t) => /(^|:)(hover|active):/.test(t));

describe("cx", () => {
  it("drops falsy parts", () => {
    expect(cx("a", false, null, undefined, "", "b")).toBe("a b");
  });
});

describe("buttonClasses", () => {
  it("gives the 3D variants a lip that the press removes", () => {
    for (const variant of ["primary", "ok", "warn", "accent"] as const) {
      const c = buttonClasses({ variant });
      expect(c).toMatch(/shadow-\[0_4px_0_var\(--[a-z-]+\)\]/);
      expect(c).toContain("active:shadow-none");
      expect(c).toContain("mb-1");
    }
  });

  it("gives secondary a 2px border and no lip", () => {
    const c = buttonClasses({ variant: "secondary" });
    expect(c).toContain("border-2");
    expect(c).not.toContain("shadow-[");
    expect(c).toContain("px-[22px]");
  });

  it("sizes md at 44px and sm at 36px", () => {
    expect(buttonClasses()).toContain("h-11");
    expect(buttonClasses({ size: "sm" })).toContain("h-9");
    expect(buttonClasses({ size: "sm", variant: "secondary" })).toContain("px-[18px]");
  });

  it("dims a disabled button without taking its pointer events", () => {
    // pointer-events-none hid a disabled button's title and its hover from everyone.
    for (const variant of ["primary", "secondary", "ghost", "ok", "warn", "accent", "brand"] as const) {
      const c = buttonClasses({ variant });
      expect(c).toContain("disabled:opacity-50");
      expect(c).toContain("disabled:cursor-not-allowed");
      expect(c).not.toContain("pointer-events-none");
      expect(c).not.toContain("aria-disabled:");
      // So hover and press are scoped to an enabled button, or a disabled one would still react.
      for (const token of c.split(" ").filter((t) => /(^|:)(hover|active):/.test(t))) {
        expect(token).toMatch(/^not-disabled:/);
      }
    }
  });

  it("stands still for a reader who asked for less motion", () => {
    expect(buttonClasses()).toContain("motion-reduce:transition-none");
  });

  it("keeps the ghost padding tight and adds width and extra classes on request", () => {
    expect(buttonClasses({ variant: "ghost" })).toContain("px-2");
    expect(buttonClasses({ block: true, className: "mt-4" })).toMatch(/w-full mt-4$/);
  });
});

describe("buttonClasses at xs", () => {
  it("is 28px at 12px, a pill like the others", () => {
    const c = buttonClasses({ size: "xs" });
    expect(c).toContain("h-7");
    expect(c).toContain("text-[12px]");
    expect(c).toContain("rounded-full");
    expect(c).not.toContain("h-11");
  });

  it("draws the 3D faces flat, with no lip and no room kept for one", () => {
    for (const variant of ["primary", "ok", "warn", "accent", "brand"] as const) {
      const c = buttonClasses({ variant, size: "xs" });
      expect(c).not.toContain("shadow-[");
      expect(c).not.toContain("mb-1");
      expect(c).not.toContain("translate-y-1");
      expect(c).toContain("not-disabled:active:opacity-80");
    }
    // The face is the same one the larger sizes put over their lip.
    expect(buttonClasses({ size: "xs" })).toContain("bg-btn-face");
    expect(buttonClasses({ variant: "warn", size: "xs" })).toContain("bg-warn");
  });

  it("gives secondary a 1px outline at xs and 2px above it", () => {
    const xs = buttonClasses({ variant: "secondary", size: "xs" }).split(" ");
    expect(xs).toContain("border");
    expect(xs).not.toContain("border-2");
    expect(buttonClasses({ variant: "secondary", size: "sm" }).split(" ")).toContain("border-2");
  });

  it("keeps the kit's focus ring and disabled state at every size and variant", () => {
    for (const size of ["md", "sm", "xs"] as const) {
      for (const variant of ["primary", "secondary", "ghost", "ok", "warn", "accent", "brand", "overlay"] as const) {
        const c = buttonClasses({ variant, size });
        expect(c).toContain(FOCUS);
        expect(c).toContain("disabled:opacity-50");
        for (const token of reactive(c)) expect(token).toMatch(/^not-disabled:/);
      }
    }
  });

  it("lays the overlay face over a picture: translucent, blurred, edged, no shadow", () => {
    const c = buttonClasses({ variant: "overlay", size: "xs" });
    expect(c).toContain("bg-surface/90");
    expect(c).toContain("backdrop-blur-sm");
    expect(c.split(" ")).toContain("border");
    expect(c.split(" ").filter((token) => /^shadow/.test(token))).toEqual([]);
  });
});

describe("badgeClasses", () => {
  it("is a 24px pill of 12px words that may shrink", () => {
    const c = badgeClasses();
    expect(c).toContain("h-6");
    expect(c).toContain("rounded-full");
    expect(c).toContain("text-[12px]");
    expect(c).toContain("min-w-0");
    expect(c).toContain("overflow-hidden");
  });

  it("is never a control: no focus ring, no hover", () => {
    for (const tone of ["muted", "accent", "warn", "danger", "ok"] as const) {
      const c = badgeClasses({ tone });
      expect(c).not.toContain("focus-visible:");
      expect(c).not.toContain("hover:");
    }
  });

  it("takes each tone's text role, never a legacy alias", () => {
    expect(badgeClasses()).toContain("text-text2");
    expect(badgeClasses({ tone: "accent" })).toContain("text-accent-text");
    expect(badgeClasses({ tone: "warn" })).toContain("text-warn-text");
    expect(badgeClasses({ tone: "danger" })).toContain("text-danger");
    expect(badgeClasses({ tone: "ok" })).toContain("text-ok-text");
    for (const tone of ["muted", "accent", "warn", "danger", "ok"] as const) {
      expect(badgeClasses({ tone })).not.toContain("var(--");
    }
  });
});

describe("chipClasses", () => {
  it("fills an active chip with the accent", () => {
    expect(chipClasses({ active: true })).toContain("bg-accent");
    expect(chipClasses()).toContain("border-border");
  });

  it("gives a static chip no hover or focus ring", () => {
    const c = chipClasses({ interactive: false });
    expect(c).not.toContain("hover:");
    expect(c).not.toContain("focus-visible");
  });

  it("has a small size", () => {
    expect(chipClasses({ size: "sm" })).toContain("h-7");
  });

  it("dims a disabled chip, and scopes its hover to an enabled one", () => {
    for (const tone of ["accent", "tint", "overlay"] as const) {
      for (const dashed of [false, true]) {
        const c = chipClasses({ tone, dashed });
        expect(c).toContain("disabled:opacity-50");
        expect(c).toContain("disabled:cursor-not-allowed");
        for (const token of reactive(c)) expect(token).toMatch(/^not-disabled:/);
      }
    }
  });

  it("draws a dashed chip with secondary ink, and never two inks at once", () => {
    const c = chipClasses({ size: "sm", dashed: true }).split(" ");
    expect(c).toEqual(expect.arrayContaining(["border-dashed", "text-text2", "not-disabled:hover:text-text"]));
    expect(c).not.toContain("text-text");
  });

  it("tints a selected tint chip rather than filling it", () => {
    const on = chipClasses({ tone: "tint", active: true }).split(" ");
    expect(on).toEqual(expect.arrayContaining(["bg-tint", "text-accent-text", "border-accent"]));
    expect(on).not.toContain("bg-accent");
    expect(chipClasses({ tone: "tint" }).split(" ")).toContain("text-text2");
  });

  it("lays an overlay chip translucent over a picture", () => {
    const c = chipClasses({ tone: "overlay" }).split(" ");
    expect(c).toEqual(expect.arrayContaining(["bg-surface/90", "backdrop-blur-sm"]));
  });
});

describe("iconButtonClasses", () => {
  it("sizes the box from 24 to 40px, 36 by default", () => {
    expect(iconButtonClasses()).toContain("size-9");
    const sides = { xs: "size-6", sm: "size-7", md: "size-8", lg: "size-9", xl: "size-10" } as const;
    for (const [size, box] of Object.entries(sides)) {
      expect(iconButtonClasses({ size: size as keyof typeof sides }).split(" ")).toContain(box);
    }
  });

  it("rounds it, or squares it at radius 8", () => {
    expect(iconButtonClasses()).toContain("rounded-full");
    expect(iconButtonClasses({ shape: "square" })).toContain("rounded-lg");
  });

  it("rings it 2px out, or on its edge when inset", () => {
    expect(iconButtonClasses()).toContain("focus-visible:outline-offset-2");
    expect(iconButtonClasses({ inset: true })).toContain("focus-visible:outline-offset-0");
    expect(iconButtonClasses({ tone: "onDark" })).toContain("focus-visible:outline-white");
  });

  it("reaches a 44px target under a finger only when asked", () => {
    expect(iconButtonClasses()).not.toContain("pointer-coarse:");
    const md = iconButtonClasses({ size: "md", touch: true });
    expect(md).toContain("relative");
    // 32px plus 6px each side.
    expect(md).toContain("pointer-coarse:after:-inset-1.5");
    expect(iconButtonClasses({ size: "lg", touch: true })).toContain("pointer-coarse:after:-inset-1");
  });

  it("scopes every tone's hover to an enabled button and says what disabled looks like", () => {
    for (const tone of ["neutral", "muted", "solid", "onDark"] as const) {
      const c = iconButtonClasses({ tone });
      expect(c).toContain("disabled:cursor-not-allowed");
      expect(c).toMatch(/disabled:(opacity-50|bg-surface2)/);
      for (const token of reactive(c)) expect(token).toMatch(/^not-disabled:/);
    }
  });
});

describe("linkClasses", () => {
  it("always carries the kit's focus ring", () => {
    for (const tone of ["accent", "muted", "danger", "inherit"] as const) {
      expect(linkClasses({ tone })).toContain(FOCUS);
    }
  });

  it("is accent and medium at the surrounding size by default", () => {
    const c = linkClasses().split(" ");
    expect(c).toEqual(expect.arrayContaining(["text-accent-text", "font-medium", "not-disabled:hover:underline"]));
    expect(c.some((t) => t.startsWith("text-["))).toBe(false);
    expect(linkClasses({ size: "xs" })).toContain("text-[12px]");
    expect(linkClasses({ size: "sm" })).toContain("text-[13px]");
    expect(linkClasses({ size: "md" })).toContain("text-[14px]");
  });

  it("underlines an inherit link always, since its colour cannot mark it", () => {
    const c = linkClasses({ tone: "inherit" }).split(" ");
    expect(c).toContain("underline");
    expect(c.some((t) => /^text-(accent|text|danger)/.test(t))).toBe(false);
  });

  it("shows the progress cursor while pending and the not-allowed one when disabled", () => {
    expect(linkClasses({ pending: true })).toContain("disabled:cursor-progress");
    expect(linkClasses({ pending: true })).not.toContain("disabled:cursor-not-allowed");
    expect(linkClasses()).toContain("disabled:cursor-not-allowed");
  });
});

describe("inputClasses and cardClasses", () => {
  it("dims a disabled input with the not-allowed cursor", () => {
    expect(inputClasses()).toContain("disabled:opacity-50");
    expect(inputClasses()).toContain("disabled:cursor-not-allowed");
  });

  it("rounds an input to 8px or a pill", () => {
    expect(inputClasses()).toContain("rounded-lg");
    expect(inputClasses({ pill: true })).toContain("rounded-full");
  });

  it("gives the chip size a chip's height, border and text", () => {
    const chip = inputClasses({ pill: true, size: "chip" }).split(" ");
    expect(chip).toEqual(expect.arrayContaining(["h-[34px]", "border", "rounded-full"]));
    expect(chip).not.toContain("border-2");
    expect(chip).not.toContain("h-11");
    expect(inputClasses().split(" ")).toContain("border-2");
  });

  it("gives each smaller size its height and a 1px border, and an inline field its words' width", () => {
    expect(inputClasses({ size: "compact" }).split(" ")).toEqual(expect.arrayContaining(["h-8", "border", "rounded-lg"]));
    const inline = inputClasses({ size: "inline" }).split(" ");
    expect(inline).toEqual(expect.arrayContaining(["h-7", "border", "rounded-full", "[field-sizing:content]"]));
    expect(inline).not.toContain("w-full");
    expect(inputClasses({ size: "lg" }).split(" ")).toEqual(expect.arrayContaining(["h-12", "border-2"]));
  });

  it("gives a textarea the field's face with no single-line height", () => {
    const area = textareaClasses().split(" ");
    expect(area).toEqual(expect.arrayContaining(["border-2", "rounded-lg", "min-h-20", "resize-y", "focus:border-accent"]));
    expect(area).not.toContain("h-11");
  });

  it("pads a card 20px, or 14 when tight", () => {
    expect(cardClasses()).toContain("p-5");
    expect(cardClasses({ tight: true })).toContain("p-3.5");
  });
});
