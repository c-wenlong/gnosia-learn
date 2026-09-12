# Deployment

Production is deployed by Vercel's Git integration. The Vercel project is
connected to the GitHub repo, so every push to the default branch builds and
promotes a production deployment, and every pull request gets a preview
deployment with its own URL. There is no deploy workflow in `.github/` and
nothing to trigger by hand.

- **Production alias:** https://self-learn-one.vercel.app
- **Project:** `kaichen/self-learn`, linked to `https://github.com/c-wenlong/self-learn`

## How a deploy happens

1. A commit lands on `main` (normally a squash-merge from a pull request).
2. Vercel's GitHub app sees the push and starts a build with the project's
   Production environment variables.
3. On success the deployment is promoted to the production alias. A failed
   build leaves the previous deployment serving.

Pull requests get the same treatment against the Preview environment, which is
where the "Vercel: Deployment has completed" check on each PR comes from.

To see what is live and what produced it:

```bash
vercel ls self-learn --prod            # recent production deployments
vercel inspect <deployment-url>        # target, aliases, build output
```

A deployment made by the integration reports `source: git` and carries the
commit SHA and branch in its metadata. If production ever stops updating after
a merge, check the project's **Settings → Git** on vercel.com first: the repo
connection is the whole pipeline.

## Secrets and environment variables

| Name | Purpose | Where it is needed |
| --- | --- | --- |
| `NVIDIA_API_KEY` | Provider 1 of the tutoring chat cascade | Vercel |
| `GEMINI_API_KEY` | Provider 2 | Vercel |
| `OPENROUTER_API_KEY` | Provider 3 | Vercel |
| `CODECOV_TOKEN` | Codecov **upload** token, from the repo's Configuration page on app.codecov.io | GitHub Actions only (optional) |

The three provider keys go in the Vercel project's **Settings → Environment
Variables** (Production, and Preview if you want previews to run live chat),
because the serverless routes read them at request time. CI does not need
them: `npm run build` runs without keys, and the tutoring chat degrades to the
copy-the-prompt fallbacks when none are set.

`CODECOV_TOKEN` is the only GitHub Actions secret the repo uses, and CI skips
the coverage upload when it is absent:

```bash
gh secret set CODECOV_TOKEN --body "$CODECOV_TOKEN"
```

Codecov has two tokens and they are not interchangeable. The upload token above
is a secret: CI uses it to send `coverage/lcov.info` and nothing else may see
it. The **graph token** that appears in the README badge URL
(`badge.svg?token=…`) is a different, read-only value that only unlocks badge
and graph SVGs for a private repo. Codecov generates it for exactly this
purpose, so it is fine in a public file. Both come from **Configuration** on
the repo's Codecov page: the upload token under General, the graph token under
Badges & Graphs.

`NEXT_PUBLIC_SITE_URL` is optional in production: Vercel supplies the
deployment domain, and the app falls back to `http://localhost:3000` locally.
Set it only if you want social preview images to resolve against a specific
canonical origin.

## Deploying from the command line

For a one-off deploy from the local tree, without going through `main`:

```bash
# one-time: log in and link the project
vercel login
vercel link

# production deploy from the local tree
vercel --prod
```

`vercel link` writes `.vercel/project.json`, which is where the org and project
ids come from. That directory is gitignored and should stay that way.
