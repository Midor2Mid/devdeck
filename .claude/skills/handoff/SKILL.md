---
name: handoff
description: Close a session so the next one continues instead of restarting — refresh .superpowers/HANDOFF.md (intent only) and log what happened. Use when the user says "wrap up", "handoff", "I'm stopping", when a phase/branch finishes, or before context is compacted.
---

# Handing off

A fresh `claude` in this repo does **not** resume the conversation — only
`claude --continue` / `--resume` do that. A fresh session is re-briefed from files by the
SessionStart hook. This skill writes the half of that briefing no script can derive.

## The split — do not blur it

| Fact | Who writes it | Where |
|---|---|---|
| branch, HEAD, dirty tree, ahead/behind, last tag | `.claude/resume.sh`, derived at session start | nowhere on disk |
| where the work stands, what is next, what blocks it, decisions and their reasons | **you, now** | `.superpowers/HANDOFF.md` §1-3 |
| what happened, timestamped | `remember:remember` | `.remember/` |

**Never hand-type a mechanical fact into HANDOFF.md.** A handoff once claimed a branch was
unpushed 40 minutes after it had been merged and released; the derived half exists so that
class of lie is impossible. If you catch yourself typing a commit count, stop.

## Steps

1. **Run `sh .claude/resume.sh`.** Read its staleness warnings — each one names a sentence in
   HANDOFF.md that is now false. Those are your edits.
2. **Rewrite §1 "Where we are"** — what is actually done, in the same table/prose shape it
   already uses. Delete finished work rather than accumulating it; this file is position, not
   history. History goes to `.remember/`.
3. **Rewrite §2 "Next action"** — the single next thing, plus anything that gates it
   (unproven claims, pending experiments, open decisions). Say what a decision *was*, not
   that one is pending, once it is made.
4. **Touch §3 "Constraints" only when a constraint actually changed.** It is stable by design.
5. **Verify nothing mechanical crept in:** re-run `sh .claude/resume.sh` and confirm the
   `!!! HANDOFF.md may be STALE` block is gone. If a warning survives, the prose still
   contradicts git — fix the prose, not the script.
6. **Log the session** with `remember:remember` (history, timestamped) — separate from the above.
7. If the tree is dirty or the branch unpushed, **say so plainly** to the user and ask whether to
   commit/push. Do not commit on your own.

## Red flags

- Appending to §1 instead of replacing it → the file grows into a changelog and stops being readable.
- "Next: decide X" left in place after X was decided → the next session re-litigates it.
- Writing the handoff *after* the user has left → it was never written. Do it at the boundary.
