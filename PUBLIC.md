# Going public

Everything required to flip this repository from private to public. The
change is to this repository's visibility in Settings, not a copy into a new
one. Dated 2026-10-20; the tree-side preparation is #476.

## State of the tree (done, in #476)

| Item | State |
| --- | --- |
| `roadmap/*.pdf` (roadmap.sh exports, no redistribution licence) | Deleted from the tree. Nothing linked to them. Still in history — see below. |
| `docs/design/reference/*` symlinks | Untracked and gitignored. Each was an absolute `/Users/<user>` path into the private design-systems library; the linker now reads `DESIGN_SYSTEMS_HOME`. Targets still in history. |
| Submodules | manimkc, remotionkc, revideokc are private; tldrawkc and blenderkc (#477) are public, and the others may follow. README and CONTRIBUTING say plain `git clone`, never `--recursive`; the app, tests and seed import need none of them. CI never fetched them. |
| Secrets in code | `gitleaks detect --log-opts="--all"` over all 860 commits: 26 hits, every one a synthetic test fixture (`0123…`, `test-key-`, `gw-key-`, `nvapi-` dummies) or `b.key = v.mp4_blob_key`, a variable name. Zero real secrets. |
| Secrets to fork PRs | No `pull_request_target` anywhere. `pull_request` runs never receive secrets, so fork pull requests cannot read `CODECOV_TOKEN` or `VERCEL_TOKEN`. |
| Personal data | No NRIC, addresses, phone numbers, private IPs or real hostnames in tree or history. `kaichen` survives in the LICENSE copyright line, the Vercel project name in docs/DEPLOYMENT.md and three test fixtures using it as a sample database user; accepted. |
| Cortex AI work content | One `domain: internal` topic entry (`toolbox-permissions-model`) was added in #29 and removed in #159. It exists only in history now; the video it pointed at lives in private manimkc. |
| Course material | Only course codes and the NUS SoC shortlist, both public facts. The lecture decks and tutorial solutions live inside private `tools/manimkc` and never enter a public clone. |
| LICENSE | MIT, present since early. |
| CI minutes | The workflow was already PR-only with concurrency cancel and no push trigger; #476 adds `paths-ignore` for documentation, design assets, agent config and submodule pointer bumps. On a public repo the question is moot anyway: Actions on standard runners is free. |

## Still in history

Deleting files in a commit does not remove them from history; a public
clone can fetch every old commit. Decide whether each of these is
acceptable to leave visible, or scrub all of them in one pass.

| Still fetchable | Where |
| --- | --- |
| The six `roadmap/*.pdf` blobs | `bfe35ab` and every descendant |
| `/Users/owner/...` absolute paths | 9 symlink targets plus the old `DEFAULT_HOME` in `link-design-systems.py` (10 lines total, mostly `f825568`) |
| The `domain: internal` entry | `content/topics.yaml` in `4977262` |
| `122634467+c-wenlong@users.noreply.github.com` | author of 844 of 860 commits |

The scrub, run on a fresh mirror clone, never the working copy:

```bash
git clone --mirror https://github.com/c-wenlong/self-learn self-learn-scrub.git
cd self-learn-scrub.git

git filter-repo --invert-paths --path roadmap/

cat > replacements.txt <<'EOF'
/Users/owner==>/Users/owner
domain: internal==>domain: internal
internal/toolbox-permissions==>internal/toolbox-permissions
EOF
git filter-repo --replace-text replacements.txt

git filter-repo \
  --email-callback 'return email.replace(b"122634467+c-wenlong@users.noreply.github.com", b"122634467+c-wenlong@users.noreply.github.com")' \
  --name-callback 'return name.replace(b"kai chen", b"c-wenlong")'

git push --force --mirror
```

Costs: every commit's SHA changes, so every checkout and every open pull
request goes stale; each machine re-clones. GitHub also keeps `refs/pull/*`
heads fetchable, so old pull request diffs retain the old blobs until
garbage collection; if the PDFs must be unrecoverable, ask GitHub support
to drop the stale pull refs after the force-push. The submodule pointers
are commits in *other* repositories and are untouched by this.

## The flip, in order

1. Merge #476. The scrub above rewrites main too, so it is easier to land
   the prep first and let filter-repo carry it through history.
2. Scrub, or deliberately keep history. Either way the tree is already
   safe; this step only decides what the past says.
3. Settings → Danger Zone → Change repository visibility → Public.
4. Post-flip checks:
   - Open a trivial PR and confirm `Lint, test, and build` runs to green
     on free minutes. The account's private-minutes billing block does not
     apply to a public repository.
   - Turn on a branch ruleset for `main` requiring that check and
     conversation resolution; both are free on public repositories.
   - Confirm secret scanning and push protection are on (free for public
     repos, Settings → Code security).
   - Secret scanning is only as good as its rules; rerun
     `gitleaks detect --log-opts="--all"` once on the public history to be
     sure nothing survived the scrub that gitleaks would flag.

## What stays private after the flip

- `tools/manimkc`, `tools/remotionkc`, `tools/revideokc` and the
  `gnosia-audio` dependency remain private repositories at the time of
  writing; outsiders see those `tools/` directories empty, and this is
  documented in the README. `tools/tldrawkc` and `tools/blenderkc` are
  already public.
- The design-systems library and the `docs/design/reference/` links.
- `docs/HOMESERVER.md` describes the owner's Tailscale-plus-Ubuntu setup.
  It names no hostname, IP or credential; the detail it gives away is that
  such a server exists. Accepted, but noted here so the choice is made.

## If a secret is ever found after flipping

Rotate it first, scrub second. A secret in a public repo is compromised on
push regardless of what history says; the fix is at the provider, then
`git filter-repo` for the record.
