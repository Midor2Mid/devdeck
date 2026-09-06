# The interface is not neutral about thinking

**Designer, round 1.** Surface under judgement: the **desktop renderer** at the
real window (1386×863 CSS px, Slate + Modern Pro, and Washi + Wabi-sabi for the
light case). The phone client (`CLIENT_HTML` in `src/main/server.ts`) has its own
hard-coded palette and is a separate surface; I am not designing it here, and
where a finding also lands on the phone I say so.

Everything below was measured in the built app over CDP against scratch
`userDataDir`s, using three mock agent presets whose scripts print a real
Claude-Code-shaped permission prompt and then block. Scripts, scenarios and raw
output are in the scratchpad; the five screenshots are in `./shots/`.

---

## 0. The claim, and the concession that comes first

`product-director` is right about one thing and I will not argue it: **"serving
creativity" as a feature category is a solvent.** A notes pane, a scratch
canvas, a graph of how ideas relate, an "inspiration" surface — every one of
those wins the *useful* argument, none of them touches an agent, and
`E3:409-411`'s rule kills all of them correctly. If the outcome of this dispute
is a new pane, I have lost and PD has won.

But PD's test is a test **about surfaces**. It asks whether a *pane* has an edge
to an agent. The things that decide whether a supervising developer can hold an
idea are not panes. They are:

- a boolean expression in `store.ts:674`,
- a predicate in `tileState.ts:275`,
- a 6000 in `settings.ts:466`,
- a 1000 in `decisions.ts:179`,
- and the sixty characters of copy on a chip.

Not one of those adds a surface. Every one of them lives **inside** a surface
that already passes PD's test. Refusing the topic therefore does not leave the
question unasked — the app answers it on every render. It leaves the answer
**unowned**, decided by whichever line was written last.

And that is not a hypothetical. The proof is in §3: DevDeck has an interruption
policy, it wrote its own governing principle down in a doc comment, and it
violates that principle in the single most important case, reproducibly, today,
in a surface PD's kill list explicitly protects. Nobody caught it because no seat
was looking at the question.

**One more concession, because PD will make it in round 2 and it is fair:**
`product-director`'s own report already legislates in this space. Fixed point 5
("`wantsYou` in `tileState.ts` is the only computation of 'who needs me'. No
second badge, ever again"), fixed point 3 (attention carries form, accent only in
addition), fixed point 6 (nothing transmitted, no "help us improve" prompt) —
those are three interruption-policy rulings in a document that says the topic is
out of scope. The topic is already inside the scope. The only live question is
whether it is *owned*.

---

## 1. What DevDeck's interruption policy currently IS

Nobody wrote this down as a policy. Here it is, reconstructed from the code, in
the order the app applies it.

### 1.1 The two tiers

| Tier | Raised by | Channels it spends |
| --- | --- | --- |
| **Loud — `attention`** | A real BEL byte in the pty stream (`hasBell`, `missionTail.ts:128`), OSC-terminator-aware so a title-set is not mistaken for a bell | status → `attention`; a toast (`pushNotification`); an Activity row; an OS desktop notification and a 660 Hz beep, both opt-in (`store.ts:743-758`); a `!` glyph on the deck key (`AgentKey.tsx:71`); an accent chip `● NEEDS YOU` / `◆ ASKING` on the Mission tile |
| **Soft — `waiting`** | Nothing arrived for `DEFAULT_IDLE_MS = 6000` (`settings.ts:466`, `store.ts:931-944`) | status → `waiting`; a `key-waiting` class on the deck key; a **neutral** (non-accent) `◇ WAITING` chip; an optional beep that is **off by default** (`notifications.waitingSound`) |

The tiering is deliberate and it is documented in the code that implements it.
`tileState.ts:227-241`, on why the soft tier does not get the accent:

> *"NOT accent-toned: a live question is what the accent is saved for, and an
> accent on every agent that finished its turn is a light that never goes off."*

### 1.2 The suppression rules

Three separate rules decide whether an interruption is *delivered*:

1. **Visibility gates the notification, never the classification** (`store.ts:912-928`).
   A bell on a pane you are looking at still sets `attention`; it just does not
   toast, beep or log. The comment says why, and it is the best paragraph in the
   codebase on this subject: the identical bytes from the identical agent used to
   produce a notification when you were in your browser and *no state change at
   all* when you were on the pane, *"so no user could reproduce, confirm, or
   falsify a DevDeck attention claim."*
2. **Window focus counts as looking** (`store.ts:702-709`). `isVisible` returns
   false if `document.hasFocus()` is false, so alt-tabbing away does not silently
   downgrade an agent that finishes while you are gone.
3. **The acknowledgement axis** (`store.ts:314-326`, `store.ts:674`). `seen` is a
   runtime-only map, deliberately never persisted (*"a relaunch that lights
   everything up again is the honest reset"*), and deliberately **not** a field
   on `TileStateInput` — it is a third *argument* to `wantsYou` so that a
   visibility-derived fact structurally cannot reach the classifier.

### 1.3 The one count

`wantsYou` (`tileState.ts:275-291`) is the single predicate behind every
"who needs me" number in the frame. The deck bar's flag (`DeckStatus.tsx:110-120`)
and Mission's header (`MissionControl.tsx:280`) both call it. Both call sites
carry a comment explaining that two numbers for one question, 200 px apart,
disagreeing by construction, is a defect this app already paid to remove once
(the Inbox drawer, −180 lines).

### 1.4 The answer surface

`main/decisions.ts` mints a `PendingDecision` only for a session already flagged
`attention`/`waiting`, binds it to `tailHash` — a digest of the exact 16 lines
the classifier read — and refuses to re-mint an id it already spent. The
Mission tile and the phone read main's answer rather than classifying
independently, so one prompt cannot be described two ways. Refresh runs on
`REFRESH_MS = 1000` (`decisions.ts:179`) because main cannot wait for a renderer
status push: *"a pane already in attention takes no status transition when the
agent asks its NEXT question."*

**That is the policy.** Two tiers separated by what raised them; three
suppression rules; one count; one answer surface with a screen-binding. It is
more thought-through than anything a competitor ships, and most of it is right.

---

## 2. The strongest thing it already gets right

**The soft tier does not spend the accent, and the app knows why.**

This is the load-bearing decision in the whole interruption policy, and it is
correct. An agent finishing a turn is the *most common* event in a four-agent
session. Making it accent-coloured would mean the accent is on somewhere at all
times, at which point it stops meaning anything, and the one state that genuinely
blocks the developer — a live permission prompt — loses its only distinguishing
channel. DevDeck instead gives `waiting` a neutral tone, a distinct glyph (`◇`
versus `●`), a relative time (`WAITING 13s`), an optional-and-off-by-default
beep, and no desktop notification at all.

Two corollaries are equally right and equally rare:

- **`isVisible` includes `document.hasFocus()`.** Most apps treat "the tab is
  open" as "the user is present." DevDeck does not, and the comment names the
  failure it prevents.
- **Visibility gates notification, never classification.** This is the rule that
  makes DevDeck's attention claims *falsifiable*. An app whose state depends on
  whether you were watching cannot be debugged, and cannot be trusted, and the
  code says exactly that.

The runner-up, and it is close: **the "Start this agent?" card**
(`shots/05-start-this-agent-card.png`). On relaunch a restored agent pane says
what happened, what it will do, and prints the literal command underneath:

> *"Restored from your last run. This agent has no resume command, so it starts a
> new conversation."*

That is the app declining to pretend a dead rectangle is a live session. Hold
that sentence in mind for §3.2, where the same session is described two other
ways on two other surfaces.

---

## 3. The worst thing it gets wrong

### 3.1 Watching an agent fall silent is treated as having answered its question

**Reproduced in isolation, same build, same agent, same prompt, one variable.**
The only difference between these two runs is whether the developer's eyes were
on that pane at the second the 6-second idle timer fired.

Scenario: an agent prints a Claude-Code-shaped permission prompt
(`Do you want to make this edit to server.ts?` + numbered options + `(esc)`) and
then blocks. Two launches, identical in every other respect.

| | Mission tile | Deck bar flag | Mission header | Deck key classes |
| --- | --- | --- | --- | --- |
| **Looked away** before 6 s | `● NEEDS YOU` + Approve/Deny | **`⚑ 1`** | `3 running · 1 need attention` | `deck-key key-waiting` |
| **Stayed on the pane** through 6 s | `● NEEDS YOU` + Approve/Deny | **absent** | `3 running` | `deck-key key-waiting key-seen` |

`shots/01-looked-away-flag-1.png` and `shots/02-stayed-flag-absent.png`.

The mechanism, exactly:

```
store.ts:674     const seenNow = status === "waiting" && isVisible(termId)
tileState.ts:289 if (i.status === "waiting") return !seen
tileState.ts:168 if (i.prompt) { ... chip: "NEEDS YOU", tone: "attention" ... }
missionTail.ts:453  promptFor gate accepts status "attention" OR "waiting"
```

The agent went quiet **because it was blocked on a question**. DevDeck read the
silence, classified it as `waiting`, noticed you were co-present with the pane at
that instant, and granted an acknowledgement — for the *silence*. Then the
prompt detector found a *question* inside that same silence, promoted the tile to
the accent tier, and rendered two live answer buttons. Nothing revoked the
acknowledgement.

**The app violates its own stated principle.** `wantsYou`'s own doc comment,
`tileState.ts:283-285`:

> *"Blocked on a question. Looking at it does not answer it, so `seen` buys
> nothing here — only the two states you can genuinely leave alone are
> acknowledgeable."*

That is exactly right, and it is implemented only for `status === "attention"` —
the bell path. For a prompt detected on a `waiting` session, looking *does* count
as answering. The principle is stated in the file and contradicted four lines
below it.

**This is not a rare path.** `promptFor` and `refreshDecision` both explicitly
accept `waiting`, and that clause exists precisely because prompts arrive without
bells. QA's own audit caught the real CLI doing it: the actual `claude` binary
sat on *"Quick safety check … Yes, I trust this folder"* while
*"DevDeck's strip shows the session as live … nothing in DevDeck's chrome
distinguishes 'running' from 'waiting for you'"* (`qa-report.md:171-176`).

### 3.2 What that costs, stated as a claim about attention

An interface that decides when to interrupt you is making a claim about your
attention, and this one is dishonest in a specific way: **it treats co-presence
as consent.** Sitting in front of a pane while it goes quiet is not a decision.
It is frequently the opposite — it is the moment you looked up, saw nothing
happening, and turned to something else. DevDeck banks that as "handled" and then
never counts the question that arrived one poll later.

The scaled version is worse. `shots/03-two-needs-you-zero-count.png`: five agent
sessions, **two tiles reading `● NEEDS YOU` with live Approve/Deny buttons**, the
Mission header reading `5 running` with the `· N need attention` clause absent
entirely, and the deck bar carrying no flag. Three numbers for one question —
and the two that were unified under "one count per question" both say zero while
the thing they are counting is rendered twice in the accent, 300 px above them.

The fixed point held: the two *counters* agree. What diverged is the counter and
the **tile**. `wantsYou` reads raw facts; `resolveTileState` reads raw facts plus
`prompt`. The one input that means "blocked on you" is visible to the classifier
and invisible to the count.

### 3.3 The deck key has no form marker for this state at all

DESIGN.md's rule is that state lives in form as well as colour. For "blocked on
you", the deck key's form marker is the bare `!` glyph — and
`AgentKey.tsx:71` renders it only for `session.status === "attention"`.

In both runs above, `.claude-attn` count was **0**. A session with a parsed
permission prompt and two live answer buttons on its tile carries, on the deck,
either `key-waiting` (a soft state) or `key-waiting key-seen` (a soft state the
app has stopped counting). There is no form channel at all for "this one is
blocked", and at five sessions the keys compress to bare badges
(`shots/03`, `shots/04`) — `BUSY QUIET ASK ASK ASK` — four identical pills, none
of which says which one is stuck.

"The agent population is visible everywhere" is a fixed point and I am not
contesting it. But **visible as what?** At five sessions it is visible as a row
of identical badges, and the one fact you would cross the room for is not among
them.

### 3.4 The count is honest about a question and dishonest about a process

`shots/04-washi-six-running-none-running.png`, Washi + Wabi-sabi: the header
reads **`6 running`**. Five of those six have no process — they are restored
tabs, and clicking any of them shows the honest "Start this agent?" card from
§2. Their tiles read `– QUIET`, whose documented meaning in `tileState.ts:246`
is *"the resting state of an agent that finished and handed back to you."*

So the same session is described three ways: the pane says *"restored, not
started"*, the tile says *"finished and went quiet"*, and the header counts it as
*"running"*. That is the app's own three-states rule — absent ≠ unknown ≠ zero —
failing at the level of "does this thing exist". The single most honest card in
the product is one click behind two surfaces that contradict it.

I want to be careful here: `alive` means *"is this session on the grid"* and it
is used correctly by `isStalled`. The defect is the **word**. `running` is a
claim about a process, and the header does not have a process to claim.

---

## 4. The other moments DevDeck already owns

Briefly, because §3 is the crux and these are corroborating rather than
independent.

**Waiting for a spawn.** I measured 1010 ms from launch click to the first
`.xterm-rows` line for a trivially cheap mock. The audits measured **4 s (shell)
and 12 s (agent)** to first byte with a real CLI, during which the pane is an
unlabelled black rectangle (`designer-report.md:#17`,
`qa-report.md:148-176`, `docs-writer-report.md:88-96`). One second is fine. Twelve
seconds of a black rectangle is not a latency problem; it is a **state
problem** — absent, loading and hung are rendered identically, which is the same
three-states failure as §3.4, and the spec already orders a fix.

**Coming back after twenty minutes.** DevDeck's entire memory of what an agent
did is a **4000-character ring per session** (`missionTail.ts:298-302`),
module-level, dying at quit. The tile shows a **2-line clamp** at 11.5 px
(`styles.css:651-657`); expanding shows the **last 8 lines**
(`getFullTail`, `MissionControl.tsx:426`). Everything else is xterm scrollback in
that pane, which is also gone at quit.

I am *not* calling that a defect. Recording sessions was tried and deleted
(RecordingsModal, 270 lines, no agent edge) and the deletion was right. The
point is narrower and it is about the honest case: after twenty minutes, the
app's summary of what an agent did is two clamped lines of raw terminal output
and a chip. That is enough to answer *"is it stuck?"* and it is not enough to
answer *"should I have let it do that?"* — which is the question a supervisor
actually returns with.

**Deciding whether a diff is right.** This one is genuinely well served —
`Uncommitted changes` with per-project `Diff` / `Lenses`, and `IN-FLIGHT CHANGES`
naming which sessions are touching the same file, with the conflict count in
words (`shots/03`, `shots/04`). It is the clearest thing on the Mission screen
and I have no complaint about it.

**The approve/deny card.** Correct by construction. Bound to a digest of the
exact screen, refuses to re-mint a spent id, gated identically in main and
renderer. One honest gap, already written down in `main/index.ts:753-762`: the
desktop tile's Approve *"writes straight to the pty without consuming or
re-checking the digest"*, so it can be up to `REFRESH_MS = 1000` stale. The phone
re-checks; the desk does not. Noted, not litigated.

**Tooltips.** `HOVER_DELAY_MS = 420` (`Tooltip.tsx:23`), measured at a 430.6 ms
mean with a 5 ms spread across five controls (`qa-report.md:328-346`). That is a
well-chosen number and I raise it only because it is the one latency in the app
that was measured before it was defended.

---

## 5. The thing with no home

The question: when a supervising developer thinks *"that's the third time it did
that"* or *"we should not have let it touch the schema"*, where does it go?

**The honest inventory.** DevDeck already has three text fields, and every one of
them is a *send* field:

| Field | Destination | Lifetime |
| --- | --- | --- |
| Work composer (`composerDrafts`, `store.ts:114`) | an agent | **persisted** to `workspace.json` |
| Mission tile reply box (`drafts`, `MissionControl.tsx:100`) | an agent | in-session (`useState`, but Mission stays mounted under `display:none`, so it survives a view switch) |
| Task card title (`BoardTask.title`, `board.ts:7`) | an agent, verbatim, on dispatch | **persisted** |

There is no field whose destination is **you, later**. The nearest thing is the
Activity drawer, and it cannot hold a sentence — it holds four event kinds
(`start`/`attention`/`close`/`pipeline`), it is `activity: []` at boot
(`store.ts:1162`, never persisted), its timestamps are computed once per render
with no tick, and it is reachable only from the `⋯` overflow.

**Now the honest part, because "capture your thoughts" features are abandoned
constantly.** They are abandoned for a structural reason, not a design one: the
*write* cost is paid now, by a person mid-task, and the *read* benefit is paid at
an unspecified later time that never arrives — because nothing ever puts the note
back in front of you at the moment it would have mattered. A note with no anchor
is a note with no reader. Every abandoned notes feature in every dev tool fails
that way, and a DevDeck notes pane would fail identically. **PD should kill a
notes pane and I would help.**

What is *not* the same shape, and what I am flagging rather than designing: the
observations above are not free-floating thoughts. Each one is **about an object
DevDeck already renders, already owns, and already re-renders at the exact moment
the thought would be useful.** "That's the third time it did that" is about a
session. "We should not have let it touch the schema" is about a decision the app
minted, bound to a `tailHash`, and can identify again. The anchor problem — the
one that kills notes features — is the one problem this app has already solved,
for a different reason, in `main/decisions.ts`.

Whether that is worth building is a round-2 question and it is PD's to rule on.
Round 1's claim is only this: **it is not the same idea as a notes pane, and it
should not be killed by the argument that kills notes panes.** If PD's answer is
"still no", that is a legitimate answer and I will take it — as long as it is an
answer, and not a refusal to look.

---

## 6. What I would delete

Subtraction is the product's method and I am not exempt from it.

**1. The `seen`-on-visibility clause.** `store.ts:674` —
`const seenNow = status === "waiting" && isVisible(termId)`. Delete the clause;
`ack()` (`store.ts:687`) already marks a session seen when you *navigate* to it,
which is an act. Co-presence is not an act. This is one boolean expression and it
is the highest-value deletion in this document: it is what produces §3.1, it is
what zeroes the count in §3.2, and removing it makes the code do what its own
comment already says it does.

*What it costs:* an agent that finishes a turn while you sit watching it stays in
the count until you click it. That is correct — you have not dealt with it, you
have watched it.

**2. The Activity drawer.** `ActivityPanel.tsx` in full, plus `activity`,
`activityOpen`, `clearActivity`, `pushActivity` in `store.ts`. It is the fifth
attention list in an app whose worst documented problem was eleven surfaces
answering one question; the app already deleted the fourth (the Inbox drawer,
−180 lines, *"nothing replaces it, because nothing needs to"*). It is unpersisted,
so it is empty exactly when you would want it — after a relaunch. Its glyphs
(`▸ ⚑ × ⇥`) are decorative Unicode the design rubric bans. It answers nothing
Mission does not answer better. And it is the surface someone will point at in
round 2 as "we already have somewhere for that", which it is not.

**3. The Mission tile trace sparkline.** DESIGN.md spends five sentences on this
one element explaining that it measures output volume rather than progress, that
a spinner repainting with `\r\n` scores the same as real work, that a bare-`\r`
repaint reads as silent, and that you should *"read it for pace, not for
progress."* An encoding whose own documentation is a legend is an encoding that
did not survive on its own — the rubric's rule is prefer a word. The tile already
carries the word and the number (`WAITING 13s`, `QUIET 4m`), and the chip is a
better answer to "is it moving" than a 60-bucket path in `--muted`. This is the
contestable one of the four and I flag it as such: it is the only channel that
distinguishes "quiet for 8 seconds" from "quiet for 8 seconds after two minutes of
solid output". I still think the chip's relative time carries that.

**4. The word `running` in Mission's header.** `MissionControl.tsx:332`. It
counts sessions on the grid, not processes, and §3.4 shows it reading `6 running`
with zero live processes. Delete the word; the number is fine.

**What I would NOT delete, under pressure:** the soft `waiting` tier itself.
Someone in round 2 will propose collapsing to one tier on the grounds that two
tiers is complexity. Two tiers is the reason the accent still means something,
and §2 is the argument.

---

## 7. What I deliberately did not design, and why

- **Any new pane, drawer, panel or overlay.** Round 1 is the argument; and PD's
  surface test is right.
- **The phone client.** Separate palette, separate constraints, and the two
  findings that reach it (the digest re-check, the decision refresh clock) are
  already handled correctly there — better than at the desk.
- **A fix for the deck key's missing "blocked" form marker (§3.3).** I know what
  it needs — a form channel that reads off the same fact the tile reads, not off
  `status` — but specifying the glyph before the count is fixed would be
  designing the symptom. The count is upstream.
- **The spawn state (§4).** Already specified in
  `docs/superpowers/specs/2026-09-04-ui-ux-overhaul-design.md`; re-designing it
  here would be duplicate work with a second set of tokens.
- **Anything about reconstructing a session beyond stating the 4000-character
  limit.** Recording was tried and deleted and the deletion was right. If
  reconstruction comes back it has to come back as something other than a
  recorder, and that is not a round-1 argument.

---

## 8. What would falsify me

Stated up front so round 2 can aim at it:

1. **If §3.1 is deliberate** — if someone can show that treating co-presence as
   acknowledgement was a decision rather than an interaction between two rules
   written at different times — then my strong claim ("the app violates its own
   principle") collapses to a disagreement about defaults, and PD's "this is
   ergonomics, not thinking" reading wins.
2. **If the `waiting`-with-a-prompt path is rare in practice** — if the CLIs
   users actually run always ring a bell before blocking — then §3.1 is a real
   bug with a small blast radius, and does not carry the weight I am putting on
   it. I could not test this: my harness's PowerShell mocks reached both the
   bell and no-bell paths inconsistently across runs, so I report the mechanism,
   which is deterministic, and not a frequency, which I did not establish. The
   real-CLI observation at `qa-report.md:171-176` is the only field evidence and
   it is one observation.
3. **If the round-2 answer to §5 is a pane**, I have lost the argument I said I
   would lose, and PD should say so.

What would *not* falsify me: "no user has complained." Nobody complains about a
count that reads zero. That is the entire failure mode.
