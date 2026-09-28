---
id: direct-manipulation
title: Direct manipulation
summary: Acting on visible objects with physical actions and immediate, reversible feedback, instead of typing commands that describe the change.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:31:40.845Z
---

# Direct manipulation

Direct manipulation is an interaction style where you act on a visible representation of the thing you care about, instead of typing commands that describe what should happen to it. You drag a file into a folder or slide a volume control, and the result shows at once. Ben Shneiderman named and described the style in 1983, pointing to early spreadsheets, video games and screen editors as examples.

## Why it matters

Most graphical interfaces lean on this style, so it explains why they feel easy to pick up. When the object and the effect of your action are both on screen, you do not need to remember syntax, and you can see a mistake as soon as you make it.

It also explains where they struggle, and when a command line or script is the better choice.

## The idea

Shneiderman's description comes down to three properties:

1. **Continuous representation.** The objects of interest stay visible while you work on them.
2. **Physical actions instead of syntax.** You point, drag and press labelled buttons rather than typing commands.
3. **Rapid, incremental, reversible operations.** Each action is small, its effect is visible immediately, and it is easy to undo.

Together these let people learn by trying: nothing is hidden and nothing is permanent. This is why direct manipulation pairs naturally with [[recognition-over-recall]]: the options are on screen rather than in memory.

Compare a command line. Typing `mv report.pdf archive/` does the same job as dragging, but you must recall the command and path, and you see the outcome only if you check.

CS2111 (Human-Centred Computing) places this under its Designing Interactions module.

## Worked example

A photographer has 400 holiday photos to organise.

Choosing the ten best is a good fit for direct manipulation. She scrolls a grid of thumbnails, drags favourites into an album and drags one back out when she changes her mind. Every step is visible and reversible.

Renaming all 400 files to the pattern `2026-08-kyoto-001.jpg` is a poor fit. By hand that is 400 separate edits. A batch rename states the rule once and applies it to every file. Direct manipulation has no natural way to say "do this to all of them, following this rule".

## Failure modes

- **Abstraction is hard to express.** Rules, conditions and "every file matching X" have no object to grab. Watch for users repeating the same drag dozens of times.
- **Batch work is slow.** One command can replace dozens of manual actions, each a chance for error.
- **Precision suffers.** Dragging to an exact value is fiddly; a typed number is better.
- **Hidden gestures break the promise.** A swipe or long press with no visible cue is not continuous representation, and users will not find it.
- **Not everyone can drag.** Keyboard and screen reader users need an equivalent that does not depend on pointing.

## Checks

```check
q: A user must apply the same tag to every email from one sender over the past year. Why is a direct manipulation interface a weak fit, and what would suit better?
a: Direct manipulation acts on one visible object at a time, so a rule covering hundreds of items means hundreds of repeated actions. A filter or search-and-apply command, which states the rule once, suits better.
why: Catches the belief that direct manipulation is always easier, when it struggles with abstraction and batch operations.
```

```check
q: Name the three properties Shneiderman gave for direct manipulation, and say which one makes it safe for novices to explore.
a: Continuous representation of the objects, physical actions instead of typed syntax, and rapid incremental reversible operations with immediate visible feedback. Reversibility with visible feedback is what makes exploring safe.
why: Catches reducing direct manipulation to 'uses a mouse' and missing that reversibility and feedback do the work.
```

```check
q: An app hides its delete action behind an unmarked two-finger swipe. Which direct manipulation property does this break?
a: Continuous representation: the action and its object are not visible, so users cannot see what they can do. It has the physical gesture but none of the visibility.
why: Catches treating any gesture as direct manipulation even when nothing on screen shows it exists.
```
