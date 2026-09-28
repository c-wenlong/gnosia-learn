---
id: keyboard-accessibility
title: Keyboard accessibility
summary: Every function must work from a keyboard alone, with logical focus order, a visible focus indicator and no keyboard trap; many assistive inputs depend on this.
requires: []
assumes: [wcag-pour-principles]
tags: [hci]
sources: []
created: 2026-09-28T15:32:27.556Z
---

# Keyboard accessibility

Keyboard accessibility means every function of an interface can be reached and used with a keyboard alone. Focus should move in a sensible order, show clearly where it is, and never get stuck. It is a baseline because many other ways of controlling a computer travel through the same focus and keyboard pathway.

## Why it matters

Plenty of people do not use a mouse. Screen reader users navigate by keyboard. People with tremor, paralysis or repetitive strain injury may use a keyboard, a switch device or voice control, and many such tools act on the same focus and keyboard events. Power users prefer keys for speed. A mouse-only control shuts out all of them.

WCAG files this under Operable: 2.1.1 Keyboard, 2.1.2 No Keyboard Trap and 2.4.3 Focus Order at level A, and 2.4.7 Focus Visible at AA.

## The idea

Four properties to check:

1. **Everything operable.** Tab and Shift+Tab move between controls. Enter activates links and buttons; Space activates buttons and toggles checkboxes. Arrow keys move within grouped widgets such as radio groups, tabs and menus.
2. **Logical focus order.** Focus follows reading order and meaning, usually the DOM order. Positive `tabindex` values that force a custom order tend to make things worse.
3. **Visible focus.** An outline or highlight shows the focused element. Removing the browser's outline with `outline: none` and giving nothing back leaves users lost.
4. **No trap.** The user can always move focus away with standard keys. A modal dialog should hold focus inside while open, but Escape or a close button must release it and return focus to where the user was.

Skip links help too: a "Skip to main content" link as the first focusable item lets users bypass a long menu on every page.

CS2111 (Human-Centred Computing) places this under its Accessibility and Inclusive Design module.

## Worked example

Test a news article page with the mouse unplugged.

Press Tab: nothing visible happens, because the stylesheet removes focus outlines. Fix: a strong `:focus-visible` style.

It takes about 40 presses to get past the navigation to the article. Fix: a skip link.

A "Subscribe" pop-up appears. Tab keeps cycling through the page behind it, and the close icon is a div that ignores Enter. Fix: move focus into the dialog when it opens, make close a real button, close on Escape, and return focus to what opened it.

After the fixes, reading, subscribing and dismissing all work from the keyboard alone.

## Failure modes

- **Mouse-only handlers.** Hover menus and clickable divs. Notice: something clickable is never reached by Tab.
- **Invisible focus.** Outlines removed for looks. Notice: tabbing produces no visible change.
- **Jumbled order.** CSS rearranges the layout visually, so focus jumps around the screen in DOM order.
- **Keyboard trap.** Embedded widgets such as video players, rich text editors or third-party frames swallow Tab. Notice: you cannot leave without a mouse.

## Prerequisites

- [[wcag-pour-principles]] (background)

## Checks

```check
q: A modal dialog keeps focus inside itself while it is open. Is that a keyboard trap under WCAG?
a: No, as long as the user can leave with standard keys, such as Escape or a reachable close button. Containing focus in an open modal is good practice; a trap is when there is no keyboard way out.
why: Catches confusing deliberate focus management with a keyboard trap.
```

```check
q: Every control on a site can be reached with Tab, yet sighted keyboard users still get lost. What is the likely missing property?
a: Visible focus: the focus indicator has been removed or is too faint, so users cannot see which element is focused (WCAG 2.4.7).
why: Catches treating reachability as the whole of keyboard accessibility.
```

```check
q: Why does keyboard support matter for a person with a motor impairment who never types on a physical keyboard?
a: Many switch devices and other alternative inputs work by sending keyboard-like input or moving the same focus, so a mouse-only control is out of their reach too.
why: Catches the idea that keyboard support only serves people using a physical keyboard.
```
