---
id: screen-readers-and-semantic-markup
title: Screen readers and semantic markup
summary: Screen readers read the browser's accessibility tree (role, name, state); native HTML supplies these for free, and ARIA should only fill gaps no native element covers.
requires: []
assumes: [wcag-pour-principles]
tags: [hci]
sources: []
created: 2026-09-28T15:32:23.864Z
---

# Screen readers and semantic markup

A screen reader does not read pixels. It reads the accessibility tree, a structure the browser builds from the DOM that gives each element a role (what it is), a name (what it is called) and a state (such as checked or expanded). Native HTML elements supply these properties for free; ARIA attributes can fill gaps, but only where no native element fits.

## Why it matters

Blind and low-vision users rely on screen readers such as NVDA or JAWS on Windows and VoiceOver on Apple devices. A control that looks perfect but has the wrong role or no name is, for them, missing or broken.

Markup also carries structure. Screen reader users often jump by headings, landmarks (such as main and nav) and lists of links rather than listening top to bottom.

## The idea

For each element, the screen reader announces roughly its name, role and state. A native `<button>Save</button>` becomes "Save, button". A labelled `<input type="checkbox">` becomes something like "Subscribe, checkbox, not checked".

Native elements also bring behaviour: a `<button>` sits in the tab order and activates with Enter and Space. A `<div>` does neither.

ARIA (Accessible Rich Internet Applications, a W3C specification) sets roles, names and states through attributes such as `role="tab"`, `aria-expanded="true"` and `aria-label="Close"`. Two points matter:

1. The first rule of ARIA use: if a native HTML element already has the meaning and behaviour you need, use it, and reach for ARIA only when none exists.
2. ARIA changes what is announced, not how the element behaves. `role="button"` makes a div sound like a button; it does not make it focusable or keyboard operable.

This is the mechanism behind WCAG's Robust principle, in particular 4.1.2 Name, Role, Value.

CS2111 (Human-Centred Computing) places this under its Accessibility and Inclusive Design module.

## Worked example

A shopping cart's remove control is `<div class="btn" onclick="remove()">X</div>`.

It works with a mouse. A screen reader user tabbing through never lands on it, because a div is not focusable, and reading the page they may hear just "X", with no role.

Patching it with ARIA needs four pieces: `role="button"`, `tabindex="0"`, a key handler for Enter and Space, and a name such as `aria-label="Remove blue mug"`.

The native fix is one element: `<button type="button" aria-label="Remove blue mug">Remove</button>`. Role, focus and keyboard activation come built in, and the name says which item goes.

## Failure modes

- **Div soup.** Clickable divs and spans with no role. Notice it by tabbing through: controls you can click but never reach.
- **ARIA without behaviour.** A role added with no keyboard handling or state updates, so the announcement promises something the element does not do.
- **Missing or vague names.** Icon-only buttons with no label, or ten links all called "Read more".
- **Stale state.** A menu opens visually but keeps `aria-expanded="false"`.
- **Headings chosen for looks.** An `<h4>` used because it is small breaks heading navigation.

## Prerequisites

- [[wcag-pour-principles]] (background)

## Checks

```check
q: A developer adds role="button" to a clickable div and says it is now accessible. What is still missing?
a: ARIA only changes what is announced. The div still needs to be focusable (tabindex="0") and to respond to Enter and Space, which a native button provides automatically.
why: Catches the belief that ARIA roles add behaviour as well as meaning.
```

```check
q: Where does a screen reader get the name, role and state it announces for a checkbox?
a: From the accessibility tree, which the browser builds from the DOM and native semantics (and any ARIA), not from what is drawn on screen.
why: Catches the idea that screen readers interpret the visual rendering.
```

```check
q: Two versions of an 'Email me updates' control both announce correctly: a native checkbox with a label, and a div with ARIA and script. Why is the native one still preferred?
a: The browser provides its focus, keyboard behaviour and state handling, so there is less to forget or break as the code changes. This is the first rule of ARIA use.
why: Catches treating native HTML and ARIA as equal options when the guidance is to prefer native elements.
```
