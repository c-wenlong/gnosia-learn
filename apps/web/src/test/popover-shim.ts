/**
 * A stand-in for the Popover API under jsdom, which has none.
 *
 * jsdom's own stylesheet hides every `[popover]` that is not `:popover-open`,
 * and it has no `showPopover` to make one open, so a kit `Popover` (a manual
 * popover, `apps/web/src/components/ui/Popover.tsx`) is `display: none` for
 * the whole of a test. That did no harm until jsdom 30.1.2, which stopped
 * focusing an element that is not being rendered: the menu's first item
 * refused focus and it stayed on the body, failing the Popover, Menu and
 * AppSidebar suites. Real browsers have the API, so nothing in the product is
 * wrong; this only gives jsdom enough of it.
 *
 * What it does, installed only where `showPopover` is missing: `showPopover`,
 * `hidePopover` and `togglePopover` (with `force`, as a boolean or as
 * `{ force }`) set or clear a `data-popover-open` attribute, and one injected
 * rule shows an element that carries it. The rule is `!important` because
 * jsdom does not rank its own stylesheet below the page's: it weighs both by
 * specificity, and its `:not(:popover-open)` selector outweighs a plain one
 * (measured on jsdom 30.1.3). An attribute rather than a class or an inline style, since React owns
 * the panel's `className` and `style` and would put them back. Calling one on
 * an element with no `popover` attribute throws, as a browser does. The kit
 * listens for no `toggle` or `beforetoggle` event and queries no
 * `:popover-open`, so neither is imitated.
 */

const OPEN = "data-popover-open";
const RULE_ID = "jsdom-popover-shim";

// The few DOM members the shim touches, spelled out: the root tsconfig, which
// checks vitest.setup.ts and so this file, has no DOM lib.
interface Box {
  ownerDocument: Page;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}
interface Page {
  head: { append(node: unknown): void } | null;
  documentElement: { append(node: unknown): void };
  getElementById(id: string): unknown;
  createElement(tag: "style"): { id: string; textContent: string | null };
}

function showRule(doc: Page) {
  if (doc.getElementById(RULE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = RULE_ID;
  style.textContent = `[popover][${OPEN}] { display: block !important; }`;
  (doc.head ?? doc.documentElement).append(style);
}

function popoverOf(el: Box, method: string) {
  if (!el.hasAttribute("popover")) {
    throw new DOMException(`${method}: the element has no popover attribute`, "NotSupportedError");
  }
}

function setOpen(el: Box, open: boolean) {
  if (open) {
    showRule(el.ownerDocument);
    el.setAttribute(OPEN, "");
  } else {
    el.removeAttribute(OPEN);
  }
}

export function installPopoverShim() {
  const element = (globalThis as unknown as { HTMLElement?: { prototype: Record<string, unknown> } }).HTMLElement;
  if (element === undefined || typeof element.prototype.showPopover === "function") return;
  const proto = element.prototype;
  proto.showPopover = function showPopover(this: Box) {
    popoverOf(this, "showPopover");
    setOpen(this, true);
  };
  proto.hidePopover = function hidePopover(this: Box) {
    popoverOf(this, "hidePopover");
    setOpen(this, false);
  };
  proto.togglePopover = function togglePopover(this: Box, options?: boolean | { force?: boolean }) {
    popoverOf(this, "togglePopover");
    const force = typeof options === "boolean" ? options : options?.force;
    const open = force ?? !this.hasAttribute(OPEN);
    setOpen(this, open);
    return open;
  };
}
