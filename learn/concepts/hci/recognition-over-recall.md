---
id: recognition-over-recall
title: Recognition over recall
summary: Recognising an option you are shown is far easier than recalling it unaided, so interfaces should show choices and needed information instead of relying on memory.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:31:00.106Z
---

# Recognition over recall

Recognising something you are shown is much easier than recalling it unaided. Interfaces exploit this by putting options, recent items and needed information on screen, so users choose instead of remembering. The principle rests on the small capacity of working memory.

## Why it matters

Every item a user must hold in mind competes for that small capacity, and every forgotten command or code becomes an error or a trip to the help pages. Designs that show what is available are faster to learn and produce fewer mistakes, especially for occasional users.

## The idea

Working memory is the store we use to hold information while working with it. George Miller's 1956 paper gave the famous figure of "seven plus or minus two" items, and it is still widely quoted. Later work, notably Nelson Cowan's 2001 review, suggests the limit is closer to about four chunks once rehearsal and grouping are controlled for. The exact number is still debated; that the limit is small is not.

Recall means producing an item with no cue, such as typing a command name from memory. Recognition means matching a cue against memory, such as spotting the command in a menu. Recognition succeeds far more often because the cue does part of the work.

Interfaces apply this through:

- menus and toolbars instead of typed commands
- recent files, search history and autocomplete
- keeping needed information visible across steps, such as an order summary during checkout
- icons with text labels, since a bare icon's meaning must be recalled

Chunking helps when some recall is unavoidable: a 16-digit card number shown as four groups of four is easier to check than an unbroken string. The principle also appears as "recognition rather than recall" in Jakob Nielsen's widely used usability heuristics.

CS2111 (Human-Centred Computing) places this under its Foundations of HCI module.

## Worked example

An internal ticketing tool asks support agents to type a product code, such as PRD-4471, to file a ticket. New agents keep a sticky note of codes, and wrong codes are common. The redesign replaces the text box with a searchable dropdown showing product names beside codes, with the five most recent products pinned at the top. Agents now recognise "Payroll export" instead of recalling a code. Experienced agents can still type into the search box, so nothing is lost for them.

## Failure modes

- **Hidden options.** Features reachable only by typed command or gesture. Notice it when users ask for features that already exist.
- **Memory carried across screens.** A later step asks for a value shown only on an earlier screen.
- **Unlabelled icons.** Tooltips help only after the user guesses where to hover.
- **Clutter.** Showing everything at once slows scanning. Show the likely options and make the rest searchable.
- **Misusing Miller's number.** Capping menus at seven items. Visible menu items are recognised, not held in memory, so the figure does not apply.

## Checks

```check
q: Why is capping a navigation menu at seven items 'because of Miller's seven plus or minus two' a misuse of the research?
a: Visible menu items are recognised, not held in working memory, so a memory limit does not cap them. Later research also suggests working memory holds closer to about four chunks, so seven is not a reliable budget anyway.
why: Catches applying a working memory limit to information that stays on screen.
```

```check
q: Step 3 of a form asks users to re-enter a reference number that was shown only on step 1. Which principle does this break, and what is a fix?
a: Recognition over recall: users must carry the number in memory across screens. Carry the value forward automatically, or keep it visible on later steps.
why: Catches thinking the principle only concerns menus and commands, not any information users must remember.
```

```check
q: Using a command line and a menu as examples, what is the difference between recall and recognition?
a: Recall is producing an item with no cue, like typing a command name from memory. Recognition is identifying an item when shown it, like picking the command from a menu, which is easier because the cue does part of the work.
why: Catches treating the two as the same memory act at different speeds.
```
