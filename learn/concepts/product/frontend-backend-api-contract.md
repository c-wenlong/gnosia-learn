---
id: frontend-backend-api-contract
title: The frontend-backend API contract
summary: The written agreement on request and response shapes, status codes and errors that lets frontend and backend build in parallel, with the server still validating every request.
requires: []
tags: [product]
sources: []
created: 2026-09-28T15:33:43.997Z
---

# The frontend-backend API contract

An API contract is the agreed shape of every exchange between a client and a server: the paths, the fields and their types, the status codes, and the format of errors. Writing it down early lets the frontend and backend be built at the same time, each against the contract instead of against the other's half-finished code. The server still checks every request against it, because the client cannot be trusted to obey.

## Why it matters

The most common integration bug in a small team is two people holding different pictures of one endpoint: one sends `userId`, the other expects `user_id`. A written contract turns that argument into a diff you can review, and lets the frontend build against a mock while the backend is unfinished.

## The idea

A contract agrees four things:

| Part | Example decision |
| --- | --- |
| Request | `POST /orders` takes `{ itemId, quantity }`, quantity at least 1 |
| Response | `201` returns the created order with its `id` |
| Status codes | `400` bad input, `401` not signed in, `403` not allowed, `404` missing |
| Errors | Every error body has one shape, such as `{ code, message }` |

The written form can be an OpenAPI document (a language-neutral description that tools turn into docs, mocks and client code) or, in an all-TypeScript project, shared types imported by both sides.

Shared types exist only at compile time. At runtime the server must validate every incoming body at its boundary and reject anything that does not match, since a request can come from any tool, not just your frontend.

An old client (an app nobody updated, a tab left open) keeps sending the old shape. Safe changes are additive: a new optional field, a new endpoint. Removing or renaming a field, or making an optional field required, breaks old clients, so it needs a new version such as `/v2/...`.

CS3216 (Software Product Engineering for Digital Markets) places this under its Full-Stack Product Engineering module.

## Worked example

A study-group app agrees that `GET /groups/:id` returns `{ id, name, members: [{ id, displayName }] }`. The frontend is built against a mock returning exactly that. Later the backend developer wants avatars. Adding an optional `avatarUrl` is additive: the shipped page ignores it, and the next release uses it. Renaming `displayName` to `name` would blank every member list in the version users already have, so it waits for a version bump.

## Failure modes

- **Types mistaken for validation.** The server casts the body to its type and trusts it. You notice when malformed input reaches the database.
- **Contract kept in someone's head.** Each side guesses, and bugs appear only when the halves are joined.
- **One error shape per endpoint.** The frontend cannot show useful messages and grows special cases.
- **Silent breaking change.** A rename ships and error rates from older app versions spike.

## Checks

```check
q: Your frontend and backend share TypeScript types for a request body. Does the server still need to validate that body at runtime? Why?
a: Yes. Types are erased at compile time and only describe what your own frontend should send; any client can send any bytes, so the server must check the body against the schema and reject what does not match.
why: Catches the belief that shared static types protect the server at runtime.
```

```check
q: Which of these changes breaks an old client: adding an optional response field, renaming a response field, or adding a new endpoint?
a: Renaming a response field, because the old client still reads the old name and gets nothing. Adding an optional field or a new endpoint is additive, and old clients simply ignore it.
why: Catches treating every contract change as equally safe or equally risky.
```

```check
q: A signed-in user sends a well-formed request to edit a resource they are not allowed to edit. Should the server return 401 or 403?
a: 403. A 401 means the request is not authenticated at all; a 403 means the server knows who the user is and refuses the action anyway.
why: Catches the common mix-up between not signed in and not permitted.
```
