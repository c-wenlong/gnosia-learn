---
id: event-driven-ui
title: Event-driven user interfaces
summary: A graphical interface does not run top to bottom; it waits in an event loop, and the program is a set of handlers that react to input events by updating state and redrawing, which must return quickly or the interface freezes.
requires: []
tags: [hci]
sources: [https://www.nngroup.com/articles/ten-usability-heuristics/]
created: 2026-09-28T15:26:35.663Z
---

# Event-driven user interfaces

A graphical interface does not run top to bottom; it waits in an event loop, and
the program is a set of handlers that react to input events by updating state and
redrawing, which must return quickly or the interface freezes.

CS3249 recaps this as interaction models and GUI programming basics before
moving to conversational interfaces, which are event-driven too: each user turn
is an event.

## Why it matters

People new to interface code often write it like a script: ask for input, wait,
process, print. That model breaks as soon as there are two buttons, a timer and
a network request, any of which can happen in any order. The event-driven model
is how every GUI toolkit, the browser and most chat frameworks actually work, so
it decides how you structure the code, where bugs come from, and why a slow
handler makes an app feel broken.

## The idea

Three parts:

1. **Events.** Things that happen: a click, a key press, a resize, a timer
   firing, a network response arriving, a message from the user in a chat.
2. **The event loop.** The toolkit owns the main loop. It waits for the next
   event, finds the handlers registered for it, and calls them one at a time,
   usually on a single UI thread.
3. **Handlers and state.** Your code registers functions ("on click, do this").
   A handler updates the application's state, and the interface is redrawn from
   that state. Layout (how widgets are sized and placed in containers) is
   recomputed as part of that redraw.

Two consequences:

- **Control is inverted.** Your code does not decide what happens next; the user
  does, and your code responds. Any order of events must leave the state valid.
- **Handlers must be short.** While a handler runs, the loop cannot process
  other events or repaint. Slow work (a network call, a model inference) must run
  asynchronously, with a later event delivering its result.

## Worked example

A "Send" button in a chat app. A script-style handler calls the language model
and waits three seconds for a reply; for those three seconds the window cannot
repaint, scroll or accept typing. The event-driven version: on click, append the
user's message, show a "typing" indicator, start the request asynchronously and
return at once. When the response event arrives, a second handler removes the
indicator and appends the reply. If the user clicks Send twice, the state must
say a request is already in flight.

## Failure modes

- **Blocking the UI thread** with slow work, so the interface freezes.
- **Assuming an order of events** ("the response always arrives before the next
  click"), which produces race conditions.
- **State spread across widgets** instead of one source of truth, so the screen
  and the data disagree.
- **Forgetting feedback** while waiting, so users click again.

## Checks

```check
q: What is inverted about control flow in an event-driven interface compared with a script?
a: The toolkit's event loop decides what runs next, in response to whatever the user or the system does; your code only supplies handlers and cannot assume the order in which they will be called.
why: Checks the core mental shift from script to event-driven code.
```

```check
q: Why does a handler that waits synchronously for a slow network call freeze the whole interface?
a: The event loop runs handlers one at a time on the UI thread, so while the handler waits no other event is processed and nothing is repainted.
why: Links the loop's structure to a familiar symptom.
```

```check
q: How should a chat interface's Send handler deal with a model call that takes seconds?
a: Update state and show feedback (the message and a typing indicator), start the call asynchronously and return immediately; a later event carries the reply to another handler that updates the state again.
why: Applies the model to a conversational interface.
```
