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

function showRule(doc: Document) {
  if (doc.getElementById(RULE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = RULE_ID;
  style.textContent = `[popover][${OPEN}] { display: block !important; }`;
  (doc.head ?? doc.documentElement).append(style);
}

function popoverOf(el: HTMLElement, method: string) {
  if (!el.hasAttribute("popover")) {
    throw new DOMException(`${method}: the element has no popover attribute`, "NotSupportedError");
  }
}

export function installPopoverShim() {
  if (typeof HTMLElement === "undefined" || typeof HTMLElement.prototype.showPopover === "function") return;
  const proto = HTMLElement.prototype;
  proto.showPopover = function showPopover(this: HTMLElement) {
    popoverOf(this, "showPopover");
    showRule(this.ownerDocument);
    this.setAttribute(OPEN, "");
  };
  proto.hidePopover = function hidePopover(this: HTMLElement) {
    popoverOf(this, "hidePopover");
    this.removeAttribute(OPEN);
  };
  proto.togglePopover = function togglePopover(this: HTMLElement, options?: boolean | { force?: boolean }) {
    popoverOf(this, "togglePopover");
    const force = typeof options === "boolean" ? options : options?.force;
    const open = force ?? !this.hasAttribute(OPEN);
    if (open) this.showPopover();
    else this.hidePopover();
    return open;
  };
}
