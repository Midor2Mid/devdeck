#!/bin/sh
# Printed into every fresh session by the SessionStart hook in .claude/settings.json.
#
# Split of responsibility, deliberate:
#   - mechanical facts (branch, HEAD, dirty, pushed, tag) are DERIVED here, so they can
#     never be stale. Nothing hand-typed is trusted for these.
#   - HANDOFF.md carries only intent/judgement, which no script can infer.
# The checks at the bottom exist because a hand-written handoff once claimed a branch was
# unpushed 40 minutes after it had been merged and released as 0.9.1.

root="${CLAUDE_PROJECT_DIR:-.}"
handoff="$root/.superpowers/HANDOFF.md"

g() { git -C "$root" "$@" 2>/dev/null; }

printf '=== RESUME · live position (derived from git, always true) ===\n'

branch=$(g rev-parse --abbrev-ref HEAD)
if [ -z "$branch" ]; then
    printf 'not a git repo — nothing to derive\n'
    exit 0
fi

printf 'branch   : %s\n' "$branch"
printf 'HEAD     : %s\n' "$(g log -1 --format='%h %s (%ar)')"

dirty=$(g status --porcelain | grep -c .)
if [ "${dirty:-0}" -eq 0 ]; then
    printf 'tree     : clean\n'
else
    printf 'tree     : %s file(s) uncommitted\n' "$dirty"
    g status --porcelain | head -8 | sed 's/^/           /'
fi

upstream=$(g rev-parse --abbrev-ref --symbolic-full-name '@{u}')
if [ -n "$upstream" ]; then
    printf 'remote   : %s ahead / %s behind %s\n' \
        "$(g rev-list --count "$upstream..HEAD")" \
        "$(g rev-list --count "HEAD..$upstream")" "$upstream"
else
    printf 'remote   : NO UPSTREAM — this branch has never been pushed\n'
fi

tag=$(g describe --tags --abbrev=0)
if [ -n "$tag" ]; then
    printf 'last tag : %s (%s commits since)\n' "$tag" "$(g rev-list --count "$tag..HEAD")"
fi

printf '\n'

if [ ! -f "$handoff" ]; then
    printf 'No .superpowers/HANDOFF.md — no recorded intent. Ask what to work on.\n'
    exit 0
fi

# ---- staleness: does the prose still match the world? ----
warned=0
note() {
    if [ "$warned" -eq 0 ]; then
        printf '!!! HANDOFF.md may be STALE — verify these before trusting it:\n'
        warned=1
    fi
    printf '  - %s\n' "$1"
}

commit_epoch=$(g log -1 --format=%ct)
file_epoch=$(stat -c %Y "$handoff" 2>/dev/null || stat -f %m "$handoff" 2>/dev/null)
if [ -n "$commit_epoch" ] && [ -n "$file_epoch" ] && [ "$file_epoch" -lt "$commit_epoch" ]; then
    note "written $(( (commit_epoch - file_epoch) / 60 )) min BEFORE the newest commit ($(g log -1 --format=%h)) — its position claims predate real work"
fi

# Branch names it still talks about. A merged branch mentioned in passing ("X was merged")
# is fine; one mentioned as LIVE WORK is the stale case that bit us. Hence the per-line test:
# one acknowledgement elsewhere in the file must not silence a stale sentence here.
# Only conventional branch prefixes are scanned — otherwise every file path
# (tests/atomic.test.ts, .claude/resume.sh) matches word/word and the signal drowns.
live='next|continue|keep|still|resume|pending|todo|unpushed|not pushed|no PR|decide'
ack='merged|settled|released|shipped|landed|abandoned|closed'
pat='`(feat|fix|chore|docs|refactor|perf|release|hotfix|spike|audit)/[A-Za-z0-9._/-]+`'

for b in $(grep -oE "$pat" "$handoff" | tr -d '`' | grep -vE '\.[a-z]{2,4}$' | sort -u); do
    [ "$b" = "$branch" ] && continue
    if ! g rev-parse --verify --quiet "$b" >/dev/null; then
        grep -F -- "$b" "$handoff" | grep -qiE "$ack" ||
            note "mentions \`$b\`, which is not a branch here (renamed, deleted, or never created)"
        continue
    fi
    if ! g merge-base --is-ancestor "$b" HEAD; then
        note "mentions \`$b\`; you are on $branch"
        continue
    fi
    bad=$(grep -nF -- "$b" "$handoff" | grep -iE "$live" | grep -viE "$ack" | head -1)
    if [ -n "$bad" ]; then
        note "treats \`$b\` as live work, but it is already MERGED into $branch — line ${bad%%:*}"
    fi
done

[ "$warned" -eq 1 ] && printf '\n'

printf '=== HANDOFF · recorded intent (hand-written, read before planning) ===\n'
cat "$handoff"
