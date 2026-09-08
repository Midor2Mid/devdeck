# Design review — the seven must-fix fixes, and where the implementer disagreed with me (2026-09-09)

`design-reviewer`, static review of `must-fix.diff` (34 files, 4,477 lines) against
`DESIGN.md` (as the diff leaves it), `themes.ts`, `styles.css`, my own
2026-09-08 prescription, and the qa walkthrough. No app was launched — this is
tokens, cascade, copy and tests, cited to `file:line`. Visual claims are
explicitly routed to the `qa` pass at the end, not asserted here.

---

## Per-issue verdict

**1. Working/waiting collision — fixed, honest, on-system.**
`.tab-dot.claude:not(.status-waiting):not(.status-attention):not(.status-not-running)`
(`styles.css:1687`) is not merely a specificity trick — the `:not()` chain
means this rule *structurally does not match* a waiting/attention/dead dot, so
there is no tie to win by source order at all. `.tab-dot.status-waiting`
(`styles.css:1163`, hollow ring) is the only rule left touching those dots.
Promoting the hollow-vs-filled idiom out from behind `prefers-reduced-motion`
is exactly what I asked for. **On-system, zero new tokens.**

**2. Seven silent view keys — fixed, honest.** `ViewKeys.tsx:90-113` and
`App.tsx:427-152` both now answer a refused click/chord with a toast naming
the reason and offering `Open folder…`, deduped via a ref so holding the chord
doesn't stack toasts. `Tooltip.tsx:113-129` no longer blind-dismisses on
`mousedown` — it special-cases `[data-tip][aria-disabled="true"]` and
re-shows the tip instead, which is the actual mechanism I flagged (the tip
and the click were structurally exclusive in time). This closes finding 2 and
my own finding A in the same pass, correctly.

**3. Badge collision past four keys — fixed, and better-argued than my own
prescription.** See departure 3 below.

**4. Approve gives no confirmation — fixed, honest, and appropriately
modest.** `answered.ts` is a genuinely well-built module: `sentLabel`/`sentTip`
never say "approved" or "accepted" (pinned by a test at
`tests/answered.test.ts:59-71` — `expect(label).not.toMatch(/approved|accepted|denied|done/i)`),
only "sent … waiting for its next output." `respondApproval` keeps the pty
send unconditional and first (`store.ts:2317-2318`), and the confirmation is
a side effect, not a gate. One module reused by both Mission and Overview
closes the exact defect where one click read as confirmed on one screen and
live on the other.

**5. Dead sessions read QUIET — fixed, and generalized further than asked.**
`deckKeyStatus`/`useKeyStatus` (`deck.ts`, `keyStatus.ts`) is a single
derivation reused at every site that used to disagree, and the diff goes
further than the prescription by also fixing the composer (dead sessions were
sendable), the usage panel ("running now" counted corpses), and the palette
(dead sessions floated to the top wearing a stale `attention`). All of this is
now pinned by tests keyed off one anti-drift assertion
(`deckKeyStatus(...) === hasProcess(...)`), which is the right shape — one
predicate, many call sites, tested for agreement rather than duplicated.

**6. `!` erased by a glance — fixed, honest.** The `|| visible` clause is gone
(`store.ts:960` era); an `unseenBell` check replaces it, and `ack` no longer
rewrites `agentStatus` (`store.ts:1913-1918`). `tests/visibilityGate.test.ts`
pins the asymmetry directly: a bell survives the agent's own next line whether
or not you're watching, and only clears once you've acted (`ack` or
`respondApproval`), and a fresh bell is news again because `seen` is cleared
on the next attention transition. This is the correct fix, not a patch.

**7. False `N conflicts` — fixed, and the copy is now honestly hedged.**
`ownership.ts` keys by working tree (not project name) and filters to paths
absent from each session's launch baseline (`agentSignals.baselineOf`). The
tooltip at `MissionControl.tsx:664-667` says "DevDeck can't tell which session
wrote them — only that nobody inherited them," which is the right epistemic
ceiling for what git can actually tell you. Good copy discipline.

All seven: fixed, and none required a new colour or shape token — consistent
with my original prediction that this list was cascade reorders and wiring,
not new design surface. **DESIGN.md's two new table rows and the "Deck key
status dot" section describe what the code above actually does** — I checked
each cell against the CSS and found no drift, with one exception noted below.

---

## The five departures

**1. Scope, don't reorder — implementer is right, unambiguously.** A reorder
only wins a tie; it's one future `Ctrl+F` append away from breaking again
silently. `:not()` scoping raises the base rule's specificity *and* makes it
not match at all for the states in question, so there's no tie to depend on
source order for. Strictly better, no downside I can find.

**2. Hollow-ring promotion collided with `key-seen`, and the fix is coherent
but has a real gap.** No idiom now means two things: hollow-vs-filled is
claimed entirely by waiting-vs-working; acknowledgement moved to the *key*
(`.deck-key.key-waiting.key-seen`, `styles.css:2145-2148`) and is expressed
**only as an animation toggle** — the dot's background/box-shadow are
identical whether `seen` or not (`styles.css:2150-2154` sets `animation: none`
and nothing else). That is a real regression against the very principle this
diff used to justify promoting the ring in the first place ("form that
survives a still frame"): at the breathing keyframe's 0%/100% point, a seen
and an unseen waiting dot render pixel-identical. Under
`prefers-reduced-motion`, seen vs unseen *is* statically distinguishable
(the key's box-shadow ring present vs `none`, `styles.css:2183-2185` vs
`2145-2148`) — so the guarantee is inverted: the less common path (reduced
motion) is the one with a still-frame marker, the default path is not. This
doesn't rise to "wrong" — live, breathing-vs-static is a legitimate
perceptual channel, and DESIGN.md's own working/waiting distinction already
leans on it elsewhere — but it is worth being honest that the acknowledgement
axis, post-fix, is weaker under a still frame than the state axis it was
modeled on. Route to qa (below).

**3. Rejecting the launch-order numeral was right; the trailing-digit/initials
scheme is a good, better-argued replacement.** The numeral's own flaw is real
and was under-weighted in my prescription: strip position is not stable
identity. `shortSessionLabel` (`deck.ts:1612-1631`) takes the trailing digits
of a generated name first (`claude 2` → `2`), falling back to initials, and
explicitly refuses to invent distinctness names don't have (two sessions
genuinely named the same thing get the same tail — tested at
`tests/deck.test.ts:2726-2732`). The one honest caveat, which the code itself
states rather than hides: initials can collide (`"auth refactor"` and
`"api routes"` both read `AR`) — no worse than the badge collision it
replaces, and it degrades to the status quo rather than lying. Endorsed.

**4. The flat `--muted` bar for `not-running` is the right form, and the
collapse of exited/held into one deck form is the right call.** Both round
forms are spent (filled = alive, hollow = your move); a flatline is the only
shape left that can't be mistaken for either at 6px, and it costs no new
token (`--muted`, already themed). Verified it survives the two places that
size dots differently: `.tab-dot.status-not-running` (`0,2,0`) beats the base
`.tab-dot` (`0,1,0`) regardless of source order, and `.ov-grp-mini .tab-dot`
(`0,2,0`) is correctly out-ranked by the new
`.ov-grp-mini .tab-dot.status-not-running` (`0,3,0`, `styles.css:2404`) —
without that second rule the 7px mini-strip dot would have swallowed the bar
back into a square. The collapse (exited vs restored both read one bar) is
honest because Mission still has room to say which in words (`EXITED n` vs
`NOT RUNNING`) and the dot never claimed to.

**5. Exempting a stall from the seen axis is correct, and for the reason
given.** `seen` is granted against a specific transition and cleared on the
next one (`setStatus`); a stall has no transition to be granted against, so
dimming it on `seen` would risk silencing a stuck agent forever rather than
for one nag cycle. `wantsYou`'s new ordering checks `isStalled` **before**
the `seen` short-circuit (`tileState.ts:2543-2544`), which is what makes the
exemption real rather than aspirational — worth double-checking in review
since it would have been easy to write the stall check after the seen gate
and have the exemption do nothing.

---

## New inconsistency introduced by this diff

**The Mission tile's own chip and its own dot now disagree about whether
`waiting` spends the accent, inside one tile.** DESIGN.md's pre-existing chip
table keeps `WAITING` at tone `neutral` — "`--text`, no color spend" — with
`tileState.ts`'s own comment explaining why: "a live question is what the
accent is saved for." The new Deck key status dot section puts the identical
state's dot at "hollow `--accent` ring" — and `MissionControl.tsx` renders
both on the same tile (`className={"tab-dot claude status-" + keyStatus}`
next to the neutral chip). This isn't newly introduced by the diff's logic —
the dot was already speced to be accent before the `.tab-dot.claude` bug
masked it — but the diff is what makes it *render*, and it's the diff that
writes both philosophies down in `DESIGN.md` side by side without
reconciling them. It's a real, citable contradiction now that both are true
statements in the same file.

**Accent budget:** five simultaneously-waiting sessions now paint five
breathing accent rings on the deck (previously five identical clay dots, per
the bug). Each ring marks a genuinely actionable session ("your move" on
*that* one), so this reads as within the spirit of "the accent marks
something actionable" rather than decoration — but it is a literal reading of
"never more than one accent on screen" being tested for the first time now
that the bug is fixed. Not a blocker; flag it as the thing to actually look
at, since only a screen can tell you whether five rings read as calm or busy.

---

## Checked and clean

Tokens (no hardcoded hex/off-scale spacing/one-off radius introduced), icons
(no new emoji — `○ ? ! ✓ ✕` are typographic, matching the shipped exception),
motion (`--dur`/`--ease` idioms, reduced-motion block still covers every
state), specificity for every new/touched selector I could find a
`[data-style=...]` or base-rule counterpart for, the render-loop trap (
`useKeyStatus` returns a memoized callback off a stable `paneHold` slice, not
a fresh array/object — checked `keyStatus.ts:29-33` directly), and copy
truth-conditions across singular/plural/zero (`ov-approve-sent`,
`composer-target-dead`, the conflicts tooltip's singular/plural `file(s)`).
`npm run typecheck`/`npm test` were not run by me — that's for qa/CI, not a
static diff read.

## Would block the beta on

Nothing in this diff. All seven fixes are honest and on-system; the one real
gap (departure 2's still-frame regression) is a legibility softening on an
axis (acknowledgement) that is explicitly a "dims the nag" convenience, not a
safety-critical state — worth fixing opportunistically, not worth holding the
beta for.

## Single weakest thing in the diff

The acknowledgement axis for `waiting` now has no still-frame form at all —
seen and unseen render identically outside `prefers-reduced-motion`, which
quietly gives up the "must survive a still frame" bar this same diff insisted
on one section earlier for working-vs-waiting.

## Route to qa (visual pass only)

1. **Slate, Modern Pro:** open 5+ Claude sessions, get several to `waiting`
   simultaneously — check whether five breathing accent rings on the deck
   read as calm or as accent-noise (the budget question above).
2. **Slate or Washi, either style:** put one `waiting` session through
   `Ctrl+Shift+J` (acknowledges it) and screenshot it beside a still-`waiting`
   unacknowledged sibling at at least two different points in the breathing
   cycle — confirm whether they're ever indistinguishable in a still frame
   (departure 2).
3. **Washi, Bauhaus or any high-contrast style:** a compressed strip of 5+
   `CLAUDE`-badged keys — check the `deck-key-ord` trailing tail (`1`, `2`,
   initials) is actually legible against the badge pill at 12px, not just
   present.
4. **Any theme:** trigger `not-running` (restore a workspace or let a session
   exit) and check the flat 2px bar reads as "dead," not as a rendering glitch
   or a disabled scrollbar thumb, at deck scale and in the Overview collapsed
   mini-strip.
5. **Slate, Modern Pro:** trigger the `Ctrl+2` gate-toast and the view-key
   click-toast back to back — confirm the dedup (one toast, not a stack) and
   that Approve's transient "Sent …" text doesn't visually collide with the
   toast if both fire near-simultaneously (answering a prompt while a gate
   toast is still up).
