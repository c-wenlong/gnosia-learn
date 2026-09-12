# Security Policy

## Supported Versions

self-learn is not versioned or released. It is continuously deployed to Vercel
from `main`, so the only things that get fixes are the `main` branch and the
current production deploy. There is no older line to back-port to.

## Reporting a Vulnerability

If you discover a security issue, please **do not** open a public GitHub issue
describing it. Use GitHub's
[private vulnerability reporting](https://github.com/c-wenlong/self-learn/security/advisories/new)
instead.

Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

This is a personal project with one maintainer, so there is no response
target to promise. Reports are acknowledged as soon as I see them.

## Scope notes

- **Provider API keys.** `.env.example` names three: `NVIDIA_API_KEY`,
  `GEMINI_API_KEY` and `OPENROUTER_API_KEY`. They are read server-side only
  and must never be committed. `.gitignore` covers `.env*` apart from
  `.env.example`, which holds empty placeholders and no values.
- **The agent routes proxy to third parties.** `POST /api/agent/chat` and
  `POST /api/agent/summarize` forward the conversation to whichever provider
  answers first, using the server's own key. Anything a learner types into a
  session leaves the deployment. The routes are unauthenticated, so a public
  deploy is also a public way to spend those keys.
- **`learn/` is personal study data.** Concept notes, session logs and the
  event log in `learn/state/` record what a real person got right and wrong.
  It is committed on purpose, which means anyone who can read the repo can
  read the study history.
- **Learner progress stays in the browser.** Checkboxes, notes and recaps live
  in localStorage under `self-learn:v1` and are never sent to a server, except
  that a recap is included in the request body when the agent needs it as
  context for a session.
