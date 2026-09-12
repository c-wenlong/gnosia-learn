# Deployment

> **What actually deploys production:** Vercel's Git integration, connected to
> the repo, which builds on every push to the default branch. The
> `.github/workflows/deploy.yml` workflow exists as a second path but currently
> fails, because the `VERCEL_TOKEN` secret in the repo is not valid. Until that
> token is replaced, treat this file as a runbook for the CLI and for repairing
> the workflow, not as a description of a working pipeline.

Live deployment:

- **Production alias:** https://self-learn-one.vercel.app
- **Project:** `kaichen/self-learn`, linked to `https://github.com/c-wenlong/self-learn`

## Secrets and environment variables

The same values are needed in two places, for two different reasons.

| Name | Purpose | Where it is needed |
| --- | --- | --- |
| `VERCEL_TOKEN` | Vercel access token, created at https://vercel.com/account/tokens | GitHub Actions only |
| `VERCEL_ORG_ID` | `team_…`, read from `.vercel/project.json` after `vercel link` | GitHub Actions only |
| `VERCEL_PROJECT_ID` | `prj_…`, from the same file | GitHub Actions only |
| `NVIDIA_API_KEY` | Provider 1 of the tutoring chat cascade | GitHub Actions and Vercel |
| `GEMINI_API_KEY` | Provider 2 | GitHub Actions and Vercel |
| `OPENROUTER_API_KEY` | Provider 3 | GitHub Actions and Vercel |

The three provider keys are needed in the Vercel project's **Settings →
Environment Variables** (Production, and Preview if you want previews to run
live chat) because the serverless routes read them at request time. They are
needed in GitHub Actions only for builds that the workflow produces itself.
`.vercel/` is gitignored and should stay that way; only the ids go into
secrets.

Setting them from the command line:

```bash
gh secret set VERCEL_TOKEN --body "$VERCEL_TOKEN"
gh secret set VERCEL_ORG_ID --body "team_…"
gh secret set VERCEL_PROJECT_ID --body "prj_…"
gh secret set NVIDIA_API_KEY --body "$NVIDIA_API_KEY"
gh secret set GEMINI_API_KEY --body "$GEMINI_API_KEY"
gh secret set OPENROUTER_API_KEY --body "$OPENROUTER_API_KEY"
```

`NEXT_PUBLIC_SITE_URL` is optional in production: Vercel supplies the
deployment domain, and the app falls back to `http://localhost:3000` locally.
Set it only if you want social preview images to resolve against a specific
canonical origin.

## Deploying from the command line

```bash
# one-time: log in and link the project
vercel login
vercel link

# production deploy from the local tree
vercel --prod
```

`vercel link` writes `.vercel/project.json`, which is where the org and project
ids come from. Do not commit that directory.

## The GitHub Actions workflow

`.github/workflows/deploy.yml` runs on pushes to `main`/`master` and on manual
`workflow_dispatch`. It checks the three Vercel secrets are present, runs the
same quality gates as CI, then:

```
vercel pull --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

Its secret presence check passes, so a failure here means the token itself was
rejected by Vercel. To repair it: create a fresh token at
https://vercel.com/account/tokens with access to the `kaichen` scope, run
`gh secret set VERCEL_TOKEN --body "<new token>"`, then re-run the workflow
with `gh workflow run deploy.yml`.

Because Vercel's Git integration already builds every push, this workflow is a
convenience rather than a requirement. Disabling it is a reasonable choice if
you would rather have one deploy path than two.
