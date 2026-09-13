#!/usr/bin/env bash
# Bring every submodule listed in .gitmodules up to its tracked branch's
# remote tip. Never commits: it leaves the working tree with the new
# pointer(s) so the caller can review and commit deliberately.
set -euo pipefail

CHECK_ONLY=0

usage() {
  cat <<'EOF'
Usage: scripts/update-gitmodules.sh [--check] [--help]

Update every submodule in .gitmodules to the tip of its tracked branch.

  --check   Fetch and report what would change, without touching any
            submodule checkout or local git config. Exits 1 if anything
            is behind.
  --help    Show this help and exit.

With no flags, submodules that are behind and have no modified tracked
files or unpushed local commits are checked out to the new tip. Dirty
or diverged submodules are left alone and reported as skipped; the
script exits 1 if that happens. Nothing is ever committed; review the
pointer changes and commit them yourself.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

root="$(git rev-parse --show-toplevel)"
gitmodules="$root/.gitmodules"

# Short SHA, or the tag name when the commit has an exact tag, matching
# what a human would want to see in a one-line pointer summary. Tag
# lookup needs a local repo; an uninitialised submodule under --check
# has none, so it falls back to a plain short SHA.
ref_for_commit() {
  local path="$1" commit="$2" tag
  if [[ -n "$path" ]]; then
    tag="$(git -C "$path" describe --tags --exact-match "$commit" 2>/dev/null || true)"
    if [[ -n "$tag" ]]; then
      printf '%s' "$tag"
      return
    fi
  fi
  printf '%s' "${commit:0:7}"
}

exit_code=0
any_moved=0

while IFS= read -r line; do
  key="${line%% *}"
  path="${line#* }"
  name="${key#submodule.}"
  name="${name%.path}"
  url="$(git config --file "$gitmodules" --get "submodule.$name.url")"

  initialized=1
  [[ -e "$root/$path/.git" ]] || initialized=0

  # --check promises to touch nothing, including local git config, so it
  # must not run "submodule update --init". A plain run does need the
  # submodule present to fetch and compare, so it initialises first and
  # treats the commit it lands on as "current".
  if [[ "$initialized" -eq 0 && "$CHECK_ONLY" -eq 0 ]]; then
    git submodule update --init "$path" >/dev/null
    initialized=1
  fi

  branch="$(git config --file "$gitmodules" --get "submodule.$name.branch" 2>/dev/null || true)"
  # "." is git's own syntax for "track whatever branch the superproject
  # is on", not a literal branch named ".".
  if [[ "$branch" == "." ]]; then
    branch="$(git -C "$root" symbolic-ref --short HEAD 2>/dev/null || true)"
  fi
  if [[ -z "$branch" ]]; then
    # No pinned branch, so fall back to the remote's default branch, and
    # only to "main" if even that cannot be determined.
    if [[ "$initialized" -eq 1 ]]; then
      git -C "$root/$path" remote set-head origin --auto >/dev/null 2>&1 || true
      branch="$(git -C "$root/$path" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
    else
      branch="$(git ls-remote --symref "$url" HEAD 2>/dev/null | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2 }')"
    fi
    branch="${branch:-main}"
  fi

  if [[ "$initialized" -eq 1 ]]; then
    git -C "$root/$path" fetch --quiet origin
    current="$(git -C "$root/$path" rev-parse HEAD)"
    target="$(git -C "$root/$path" rev-parse "origin/$branch")"
    current_ref="$(ref_for_commit "$root/$path" "$current")"
  else
    # Uninitialised under --check: read the pinned commit straight out of
    # the superproject's tree and the remote tip via ls-remote, so no
    # submodule checkout or git config is ever touched.
    current="$(git -C "$root" rev-parse "HEAD:$path")"
    target="$(git ls-remote "$url" "refs/heads/$branch" | cut -f1)"
    current_ref="$(ref_for_commit "" "$current")"
  fi

  if [[ "$current" == "$target" ]]; then
    echo "$name $current_ref (no change)"
    continue
  fi

  target_ref="$(ref_for_commit "$root/$path" "$target")"

  if [[ "$CHECK_ONLY" -eq 1 ]]; then
    echo "$name $current_ref -> $target_ref (available)"
    exit_code=1
    continue
  fi

  # Untracked files (build output, caches, a scratch state/ dir) are
  # normal inside a submodule and must not block a pointer bump; only
  # modified tracked files mean the submodule has real local work.
  dirty="$(git -C "$root/$path" status --porcelain --untracked-files=no)"
  if [[ -n "$dirty" ]]; then
    echo "$name $current_ref (dirty, skipped)"
    exit_code=1
    continue
  fi

  # A clean submodule can still hold a commit that never reached the
  # remote branch (diverged, or ahead of it); only fast-forward, never
  # abandon local history the caller never asked to throw away.
  if ! git -C "$root/$path" merge-base --is-ancestor "$current" "$target"; then
    echo "$name $current_ref (diverged, skipped)"
    exit_code=1
    continue
  fi

  if ! git -C "$root/$path" checkout --quiet --detach "$target" 2>/dev/null; then
    echo "$name $current_ref (checkout failed, skipped)"
    exit_code=1
    continue
  fi
  echo "$name $current_ref -> $target_ref"
  any_moved=1
done < <(git config --file "$gitmodules" --get-regexp 'submodule\..*\.path')

if [[ "$CHECK_ONLY" -eq 0 && "$any_moved" -eq 1 ]]; then
  echo "pointer(s) updated in the working tree; review, then: git add <paths> && git commit"
fi

exit "$exit_code"
