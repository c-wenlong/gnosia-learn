import { describe, expect, it } from "vitest";

import { buttonClasses, cardClasses, chipClasses, cx, inputClasses } from "./classes";

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

  it("keeps the ghost padding tight and adds width and extra classes on request", () => {
    expect(buttonClasses({ variant: "ghost" })).toContain("px-2");
    expect(buttonClasses({ block: true, className: "mt-4" })).toMatch(/w-full mt-4$/);
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

  it("pads a card 20px, or 14 when tight", () => {
    expect(cardClasses()).toContain("p-5");
    expect(cardClasses({ tight: true })).toContain("p-3.5");
  });
});
