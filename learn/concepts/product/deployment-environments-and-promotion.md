---
id: deployment-environments-and-promotion
title: Deployment environments and promotion
summary: Run local, preview and production environments, promote one build forward with per-environment config, roll back by redeploying, and treat migrations as the hard part.
requires: []
tags: [product]
sources: []
created: 2026-09-28T15:33:47.954Z
---

# Deployment environments and promotion

Most products run in at least three environments: local (a developer's machine), preview or staging (a shared copy that behaves like production), and production (what users hit). Promotion means taking one build that passed its checks and moving that same build forward, with only its configuration changing. Configuration comes from environment variables, and secrets never live in the repository.

## Why it matters

If you rebuild for production, the thing you tested is not quite the thing you shipped. Under deadline pressure, the safest release is one you can undo in a minute, and the part that resists undoing is the database.

## The idea

**Build once, configure per environment.** The build reads settings such as `DATABASE_URL` at runtime, an approach the Twelve-Factor App guidelines popularised. Real values sit in the host's secret store or a gitignored `.env.local`; the repo holds only an example file listing the names. One catch: some frameworks bake certain variables in at build time (Next.js does this for names prefixed `NEXT_PUBLIC_`), so those cannot differ without a rebuild.

**Preview deploys per branch.** Platforms such as Vercel and Netlify can build every pull request at its own URL, so reviewers click through the change. Point previews at a test database, never production.

**Rollback by redeploying an earlier build.** Old builds are kept, so rolling back is quick: nothing is rebuilt.

**Migrations do not roll back easily.** Rolling back code does not undo a schema change. The usual defence is expand then contract: add the new column first so old and new code both work, move the code over, and remove the old column in a later release.

CS3216 (Software Product Engineering for Digital Markets) places this under its Full-Stack Product Engineering module.

## Worked example

An app stores a profile field in column `bio` and the team wants to rename it `about`. The quick version is one release: a migration renames the column and the code reads `about`. An hour later they find a bug and roll back. The previous build still queries `bio`, which no longer exists, so every profile page breaks.

Expand then contract splits it. Release 1 adds `about`, copies the data, writes both columns and reads `about`. Release 2, days later, drops `bio`. At every step the previous build still runs against the current schema, so rollback stays safe.

## Failure modes

- **Rebuilding per environment.** A bug appears only in production with no code change.
- **Secret in the repo.** Deleting it in the next commit leaves it in git history. Rotate the key.
- **Preview on the production database.** A test run edits or deletes real data.
- **Destructive migration shipped with the code.** Rollback fails because the old build expects a column that is gone.
- **Config drift.** A variable set in staging is missing in production. Check required variables at startup and fail fast.

## Checks

```check
q: A release includes a migration that drops a column. You find a bug and roll back to the previous build. What is likely to happen?
a: The previous build still reads the dropped column, so its queries fail; rolling back code does not undo the schema change. Split destructive changes so the old build works against the new schema: add first, remove in a later release.
why: Catches the assumption that a rollback restores the whole system, database included.
```

```check
q: Why promote the build you tested in staging instead of rebuilding production from the same commit?
a: A rebuild can differ (dependency resolution, build environment, build-time variables), so what ships is not exactly what you tested. Promoting the same artefact means only runtime configuration changes.
why: Catches the belief that the same commit always produces the same build.
```

```check
q: An API key was committed by mistake and removed in the very next commit. Is the key now safe?
a: No. It remains in git history for anyone with the repo, so treat it as leaked and rotate it with the provider.
why: Catches the belief that deleting a file removes it from version control.
```
