---
id: handling-errors-at-boundaries
title: Handling errors at system boundaries
summary: Validate input where it enters, catch and translate failures where calls cross a boundary, log the detail, show users something actionable, and retry only transient idempotent work.
requires: []
tags: [product]
sources: []
created: 2026-09-28T15:33:51.921Z
---

# Handling errors at system boundaries

A boundary is any place where your code meets something it does not control: user input, the network, a third-party API, the database, an LLM call. Handle errors there. Validate what comes in; when a call out fails, catch the error, translate it into your own terms, log the detail, and show the user a message they can act on.

## Why it matters

Fast-built products get demoed on the happy path and fail at their boundaries. The worst case is a swallowed error: the user stares at a spinner or an empty list, and no log line tells the team anything went wrong.

## The idea

**Validate on entry.** Reject bad input where it arrives, with a clear reason, so later code can trust its data.

**Translate on crossing.** A raw database or provider error means nothing to users and can leak internals. Map it to your own error types, such as "payment declined", at the point of the call.

**Two audiences.** The user gets a short, actionable message. The log gets the detail: upstream status, ids, stack. A request id joins the two. Inside the system, fail loudly: an unexpected state should throw, not limp on.

**Timeouts on every outbound call.** Some HTTP clients wait very long, or forever, by default, so one hung dependency ties up your server.

**Retry only transient, idempotent failures.** Transient means likely to succeed next time: a timeout, `503`, `429`. Idempotent means repeating is harmless: a read, or a write carrying an idempotency key the provider honours. Use exponential backoff with random jitter and cap the attempts. A `400` will fail identically, so never retry it.

CS3216 (Software Product Engineering for Digital Markets) places this under its Full-Stack Product Engineering module.

## Worked example

A "summarise my notes" button calls an LLM API.

1. The server checks the notes' length; if too long, it returns `400` with "Notes are too long; the limit is 20,000 characters."
2. It calls the model with a 30 second timeout.
3. On a timeout, `429` or `503` it retries up to three times, waiting about 1, 2, then 4 seconds plus jitter. Summarising has no side effects, so this is safe.
4. On a provider `400` it does not retry.
5. It validates the model's JSON output, because model output is input too.
6. If all fails, it logs the request id, status and latency, and shows: "Couldn't summarise right now. Your notes are saved; try again in a minute."

## Failure modes

- **Swallowed error.** `catch (e) { return [] }` reports "no results" with confidence and logs nothing.
- **Retrying a non-idempotent call.** A timed-out charge or email is retried and happens twice.
- **No timeout.** Requests pile up behind one slow dependency until the app stalls.
- **Leaking internals.** A stack trace or SQL message reaches the user.
- **Retry storm.** Clients retry at once without backoff, prolonging an outage.

## Checks

```check
q: A call to a payment API to charge a card times out. Should your server automatically retry the charge?
a: Only if the charge is idempotent, for example sent with an idempotency key the provider honours. A timeout does not tell you whether the charge went through, so a blind retry can charge the customer twice.
why: Catches the belief that timeouts are always safe to retry.
```

```check
q: A third-party API returns 400 Bad Request. Should you retry with exponential backoff?
a: No. A 400 means the request itself is wrong and will fail the same way every time. Backoff retries are for transient failures such as timeouts, 429 and 503.
why: Catches failing to distinguish transient from permanent errors.
```

```check
q: What is wrong with a function that loads a user's orders and does `catch (e) { return [] }`?
a: It swallows the error: the user is told, falsely, that they have no orders, and nothing is logged, so the team never learns the database call is failing. It should log the error and surface an error state instead.
why: Catches the belief that returning a default value is graceful failure.
```
