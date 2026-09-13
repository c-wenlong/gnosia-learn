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
            submodule checkout. Exits 1 if anything is behind.
  --help    Show this help and exit.

With no flags, submodules that are behind and have no modified tracked
files are checked out to the new tip. Dirty submodules are left alone
and reported as "(dirty, skipped)"; the script exits 1 if that happens.
Nothing is ever committed; review the pointer changes and commit them
yourself.
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
# what a human would want to see in a one-line pointer summary.
ref_for_commit() {
  local path="$1" commit="$2" tag
  tag="$(git -C "$path" describe --tags --exact-match "$commit" 2>/dev/null || true)"
  if [[ -n "$tag" ]]; then
    printf '%s' "$tag"
  else
    git -C "$path" rev-parse --short=7 "$commit"
  fi
}

exit_code=0
any_moved=0

while IFS= read -r line; do
  key="${line%% *}"
  path="${line#* }"
  name="${key#submodule.}"
  name="${name%.path}"

  # An uninitialised submodule has nothing to fetch or compare yet; bring
  # it in first (non-recursive, this script only manages this repo's own
  # two submodules) and treat the commit it lands on as "current".
  if [[ ! -e "$root/$path/.git" ]]; then
    git submodule update --init "$path" >/dev/null
  fi

  git -C "$root/$path" fetch --quiet origin

  branch="$(git config --file "$gitmodules" --get "submodule.$name.branch" 2>/dev/null || true)"
  if [[ -z "$branch" ]]; then
    # .gitmodules does not pin a branch, so fall back to whatever the
    # remote considers its default branch, and only to "main" if even
    # that cannot be determined (e.g. no network for the HEAD lookup).
    git -C "$root/$path" remote set-head origin --auto >/dev/null 2>&1 || true
    branch="$(git -C "$root/$path" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
    branch="${branch:-main}"
  fi

  current="$(git -C "$root/$path" rev-parse HEAD)"
  target="$(git -C "$root/$path" rev-parse "origin/$branch")"
  current_ref="$(ref_for_commit "$root/$path" "$current")"

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

  git -C "$root/$path" checkout --quiet --detach "$target"
  echo "$name $current_ref -> $target_ref"
  any_moved=1
done < <(git config --file "$gitmodules" --get-regexp 'submodule\..*\.path')

if [[ "$CHECK_ONLY" -eq 0 && "$any_moved" -eq 1 ]]; then
  echo "pointer(s) updated in the working tree; review, then: git add <paths> && git commit"
fi

exit "$exit_code"
