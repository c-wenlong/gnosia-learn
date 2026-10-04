import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Chip } from "./Chip";
import { IconButton, type IconButtonProps } from "./IconButton";
import { TextLink, type TextLinkProps } from "./TextLink";

// Children as an argument, as the lint rule wants; the props type requires them, hence the cast.
type ChipProps = ComponentProps<typeof Chip>;

const icon = (props: Omit<IconButtonProps, "children">) =>
  renderToStaticMarkup(createElement(IconButton, props as IconButtonProps, createElement("svg")));

const link = (props: Omit<TextLinkProps, "children">) =>
  renderToStaticMarkup(createElement(TextLink, props as TextLinkProps, "Back"));

describe("IconButton", () => {
  it("names itself and its tooltip with one label, as a plain button", () => {
    const html = icon({ label: "Close" });
    expect(html).toMatch(/^<button type="button" aria-label="Close" title="Close"/);
    expect(html).not.toContain("aria-pressed=");
  });

  it("lets the tooltip say more than the name", () => {
    const html = icon({ label: "Remove element 1", title: "A diagram needs at least one element" });
    expect(html).toContain('aria-label="Remove element 1"');
    expect(html).toContain('title="A diagram needs at least one element"');
    expect(html).not.toContain('title="Remove element 1"');
  });

  it("is a toggle when pressed is set, and submits when asked", () => {
    expect(icon({ label: "Subtitles", pressed: false })).toContain('aria-pressed="false"');
    expect(icon({ label: "Subtitles", pressed: true })).toContain('aria-pressed="true"');
    expect(icon({ label: "Send", type: "submit" })).toMatch(/^<button type="submit"/);
  });

  it("renders a link when given an href", () => {
    const html = icon({ label: "New chat", href: "/studio" });
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/studio"');
    expect(html).toContain('aria-label="New chat"');
  });

  it("passes other attributes through, a disabled state among them", () => {
    const html = icon({ label: "Close", disabled: true, "data-dialog-close": "" } as unknown as IconButtonProps);
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-dialog-close=""');
  });
});

describe("TextLink", () => {
  it("is an in-app link with an href, with no new tab", () => {
    const html = link({ href: "/learn/x" });
    expect(html).toMatch(/^<a [^>]*href="\/learn\/x"/);
    expect(html).not.toContain("target=");
  });

  it("opens an external one in a new tab without handing it the opener", () => {
    const html = link({ href: "/api/assets/a/file", external: true });
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("is a button without an href, disabled while pending", () => {
    expect(link({})).toMatch(/^<button type="button" class="/);
    const pending = link({ pending: true });
    expect(pending).toContain('disabled=""');
    expect(pending).toContain("disabled:cursor-progress");
    expect(link({ pending: false })).not.toContain('disabled=""');
  });
});

describe("Chip", () => {
  it("disables its toggle, and dims it", () => {
    const html = renderToStaticMarkup(createElement(Chip, { onClick: () => undefined, disabled: true } as ChipProps, "Add"));
    expect(html).toContain('disabled=""');
    expect(html).toContain("disabled:opacity-50");
  });

  it("draws a dashed chip", () => {
    const html = renderToStaticMarkup(createElement(Chip, { onClick: () => undefined, dashed: true } as ChipProps, "Add"));
    expect(html).toContain("border-dashed");
  });
});
