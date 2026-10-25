# Security Policy

## Supported Versions

gnosia is not versioned or released. It is continuously deployed to Vercel
from `main`, so the only things that get fixes are the `main` branch and the
current production deploy. There is no older line to back-port to.

## Reporting a Vulnerability

If you discover a security issue, please **do not** open a public GitHub issue
describing it. Use GitHub's
[private vulnerability reporting](https://github.com/c-wenlong/gnosia-learn/security/advisories/new)
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
  session leaves the deployment.

  There is no user identity to authenticate: the app has no accounts, learner
  state has no account behind it, and the caller is a browser component, so any
  credential it carried would be readable in the JS bundle. What bounds the
  cost of an anonymous call instead lives in `src/lib/agent/guard.ts`: a
  same-origin check (403), payload ceilings counting both the messages and the
  learner note (413), and a per-IP fixed window (429). Read the comments there
  for what each one does not stop. The origin check is spoofable with a forged
  header and the limiter is per-instance and per-region, so the real per-IP
  bound is a Vercel WAF rate-limit rule on `/api/agent`, which is configured
  on the platform rather than in this repo.
- **The knowledge base is personal study data.** Concept notes and session logs
  record what a real person got right and wrong, and they are committed on
  purpose, which means anyone who can read the repo can read the study history.
  The event log, the mastery model and the schedule are not committed: they are
  rows in the learner's own Postgres, which also means they have no backup
  beyond that machine.
- **Learner progress is written by unauthenticated routes.** Checkboxes, notes
  and recaps go through `POST /api/learner/*`, which are bounded the same way
  the agent routes are and by the same helpers: same-origin (403), a bounded
  body (400), a per-IP window (429). There is no account to check, so on a
  deployment reachable by anyone those bounds are all that stands between a
  stranger and the learner's checkboxes. They are enough because the blast
  radius is a tick and a note on someone's study hub; they would not be enough
  for anything else, and adding authentication is what would change that.
  `preference` takes an allow-list of keys rather than any key, so the route is
  not an open jsonb store, and a stored resource URL must be `http(s)` so it
  cannot come back out as a `javascript:` href.
- **A recap leaves the deployment only when the agent needs it.** It is
  included in the request body as context for a session, and nowhere else.
