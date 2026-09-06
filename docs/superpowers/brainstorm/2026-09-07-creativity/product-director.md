# The null hypothesis — creativity is not DevDeck's business

`product-director`, 2026-09-07. Position paper for the creativity brainstorm.
Written to be rebutted in round 2, so every load-bearing claim carries a citation
you can check without asking me.

---

## Headline verdict

**Refuse the word. Keep the question. Ship nothing because of this brainstorm.**

The reframing is a good question — *agents do most of the typing, so what is left
of the developer's act, and does DevDeck serve it or interrupt it?* — and it has
an answer already, sitting in this repo, in code, with tests. DevDeck has a
complete and unusually precise theory of what the human is doing. It is not a
creativity theory. It is an **attention** theory, and its whole content is: *the
human is a scarce, interruptible, over-claimed resource; be honest about which of
N things actually wants them; never be the reason they are wrong.*

Everything true in a creativity thesis is already said by that theory, more
precisely. Everything a creativity thesis adds beyond it cannot be falsified by
the five sessions this milestone exists to produce. That combination — adds no
precision, adds no falsifiable content, adds enormous scope licence — is the
definition of a solvent, and I am ruling against it.

I am not ruling that the human's work has no shape. I am ruling that it has one,
that it is written down, and that **shopping for a second one three days after the
roadmap said the milestone is no longer blocked on engineering is how a product
loses six weeks.**

---

## The claim

DevDeck is for one developer on Windows supervising several coding agents that
write code faster than he can read it. What he does instead today is three agent
CLIs in three Windows Terminal tabs plus whatever tool answers *"did that actually
work"*. That makes the human a **judge of output he did not write**, and it makes
one thing unthinkable: any surface that competes for the attention it is supposed
to be protecting.

That is the same claim as `market/E3-ade-or-ide.md:18-33` and the same as my
2026-09-04 ruling. It has not moved, and nothing in the creativity framing moves
it.

---

## Where the evidence agrees

The theory of the human is not a memo. It is implemented, commented, and it has
already killed things.

**1. The count shrinks when you look at it, and looking never changes what
anything is.** `tileState.ts:275-290` — `wantsYou()` takes `seen` as a *third
argument* rather than a field on `TileStateInput`, and the comment at `:264-267`
says why in as many words: a field there "could be read by the classifier and
would put a visibility-derived fact back into what a session IS. As an argument to
this predicate alone, it structurally cannot." `store.ts:314-326` calls it an
"ACKNOWLEDGEMENT axis, not a state." `styles.css:1165-1172` sets the tripwire:
"if a second rule appears here that changes what a session IS, the acknowledgement
axis has become a state and the design is broken."

That is a theory of attention enforced at the type level. I know of no other
product in this category that has one.

**2. Three states, because there are three facts.** `tileState.ts:53-64` —
`changedCount: number | null | undefined`, where `null` is "we asked and could not
find out" and `undefined` is "nobody has asked yet." The comment records that `0`
used to absorb all three. `DESIGN.md:350-380` generalises it: `found / not on PATH
/ unchecked`, `N changes / none / ? changes`. 0.12.0 is almost entirely this.

**3. Signals derived from prose are refused, by policy, at the top of the file
that classifies them.** `tileState.ts:5-11`: "This app has repeatedly shipped
signals that lied (a terminal title read as a bell, a one-second pause read as
'finished', a stall check that never fired) and each cost more trust than the
signal was worth. Parsing tool output for test failures would be the next one, and
is cut."

**4. One count per question.** The Inbox drawer was deleted, −180 lines, because
it "carried its own 'N need you' count, divergent from the others, in an app whose
worst documented problem was **eleven surfaces answering that one question**"
(`CHANGELOG.md:587-591`). `tileState.ts:259-262` keeps the rule live: "two numbers
for one question, 200px apart, disagreeing by construction is a defect this app
has already fixed once."

**5. Attention has no colour of its own, on purpose.** `DESIGN.md:124-128` — the
accent *is* amber, so an attention amber would be indistinguishable from "this tab
is selected." State therefore carries **form**. An app that cannot spend colour on
urgency has to earn urgency, and that is a discipline, not a limitation.

**6. The approve/deny card shows the parsed question with the raw excerpt beneath
it.** The most distinctive thing in the product does not ask you to trust its
parse. It shows you its work.

Add those up. The human's role, as this codebase already understands it, is:
**decide under partial information, without being lied to, and without being asked
twice.** That is a real cognitive shape, seriously served, in code, today.

---

## Where the evidence disagrees — with the creativity thesis, not with me

I looked for the drift that would support a creativity reading. What I found is
the opposite: **the creativity frame retroactively un-kills every deletion this
product has ever made.** Every one, without strain:

| Deleted | The creativity justification that was available for it |
|---|---|
| **Canvas** layout (`b3d005a`, 2026-09-04) | A free-form spatial thinking surface; arrange your agents the way you hold the problem |
| **Terminal recording** (2026-09-04) | Replay what happened; insight comes from reviewing your own process |
| **StandupModal** (2026-09-04) | Narrate what you did — reflection is where the thinking consolidates |
| **ReleaseBoard** (2026-09-04) | See the whole shape of the work, not just the pane in front of you |
| **Network view** (`cf35bd5`) | Notice what actually happened, rather than what you assumed |
| **The Inbox drawer** (−180 lines) | A calm place to triage rather than reacting in the deck |
| **78 of 84 skins** (`cfd31d5`) | Environment shapes thought; let people tune the room they think in |
| **The agent bake-off** (−2111 lines, the first deletion in the product's history — `.superpowers/removal/race-report.md:135-141`) | Divergent exploration: run three takes, compare, choose |

The last row is the exhibit. **The bake-off *is* the creativity feature** —
parallel divergent attempts at one task, then comparison and selection. Textbook.
It was built. It never completed a race. Deleting it was this product's first act
of self-knowledge, and "creativity" is the exact word that resurrects it.

I wrote on 2026-09-04 that a surface "justifies itself by being useful rather than
by touching an agent — and useful is an argument every feature wins"
(`2026-09-04-ui-ux/product-director-report.md:246-247`). Creativity is strictly
worse than useful. "Useful" at least implies a task you could watch someone fail
at. "Creative" is a claim about a mental state that leaves no trace in a session
recording, so it cannot lose an argument. A frame that cannot lose is not a frame;
it is a permission slip.

And there is a specific, dated refusal that this brainstorm is on course to
violate. `ROADMAP.md:263-266`: the 84→6 skin cut "makes every future UI change
roughly an order of magnitude cheaper to verify. That saving is the *point*, not a
budget for a seventh skin. The first proposal to add a theme because 'we can
afford it now' is spending the only thing the cut bought. **Refused in advance.**"
The most likely concrete output of a creativity brainstorm is a mood/flow theme.
It is refused again, by name, here.

---

## The falsifiability test, which is the disqualifying one

`docs/beta/05-validation-criteria.md` was written on 2026-09-04, before any user
existed, precisely so results could not be rationalised afterwards. It contains
S1–S4, R1–R3, E1–E5, K1–K5 and four pre-registered predictions. **Not one of them
can register a creativity result**, and no creativity criterion could be added
that the same file would accept — it explicitly excludes self-report ("Users would
probably want…", "a reply saying 'this looks cool'") and it excludes any session
the author demoed, which is every session where a thinking-surface would be
explained rather than discovered.

So: state the creativity thesis's pre-registered prediction, in the form
`05-validation-criteria.md` demands, or it does not get an hour. "Three of five
report feeling less scattered" is not that form; it is a feeling collected by the
person who built the feature.

**Now the honest half, because I will be held to it in round 2.** The creativity
thesis does have exactly one legitimate, already-registered test, and I am the
seat that wrote it. Prediction 2, `05-validation-criteria.md`:

> **Three of the first five ask, unprompted, where a deleted surface went**
> (specifically the Network view or the Canvas layout). If so, the "feed or judge
> an agent" test that killed them is too narrow.

That is the creativity case, correctly specified, scheduled, and falsifiable. It
has not run, because nobody has been contacted. **The correct move for anyone
arguing the opposite position today is to wait for it, not to argue around it.**
If Canvas comes back because three strangers asked for it by shape, I will have
been wrong on evidence, which is the only way I want to be wrong.

---

## The steelman, taken seriously

The brief says I must engage this rather than dismiss it: *if supervision has a
real cognitive shape — attention, interruption cost, holding several threads,
deciding under partial information — then serving it is not scope creep, it is the
product finally naming what it does.*

**I concede the premise entirely.** The shape is real. That is the whole of my
own position: the shape is real, it is named `wantsYou`, the acknowledgement axis
and three-state honesty, and the product has spent three releases on it. The
disagreement is not about whether the human's work has a cognitive shape. It is
about whether **"creativity" is a better name for that shape than "attention."**
It is not. It is a looser name for the same thing, and the looseness is the entire
appeal.

Now the strongest version of the opposing case, which nobody else has stated yet
and which I will state for them:

> The attention theory is a theory of **responding**. Every state in
> `tileState.ts` is reactive: something happened, does it want you. The product
> answers *"which of N needs me"* extremely well and has literally nothing to say
> about *"am I pointed at the right thing at all"* — the moment a supervisor
> notices that all three agents are competently solving the wrong problem. That
> is the actual creative act left after the typing was delegated, and DevDeck is
> silent on it.

That is a real gap and I am not going to pretend otherwise. Here is why it is
still not work:

1. **It is not a UI gap.** The supervisor notices the wrong-problem moment by
   reading a diff, and DevDeck's answer to that is already ruled: the editor is
   "a reader and a diff surface" (`E3:309-313`). The noticing happens in the
   content, not in a chrome affordance around it.
2. **The obvious implementations were built and deleted.** An intent-capture
   pane, a decision journal, a "what am I trying to do" surface — that is
   StandupModal's shape, and ReleaseBoard's. Both shipped, both were never
   returned to, both are gone.
3. **Revealed preference says nobody asked.** `E3:74-86`: `NOTES.md` mentions
   agents, Mission or terminals **96 times** and contains not one recorded
   sentence asking for a reflection or planning surface. Every "moat" item was
   built in one sitting and never touched again — `work.ts`, four commits, all on
   one day, in a repo of 594 commits at the time. E3's verdict on that pattern:
   "It is not a moat that went cold through indiscipline. It is a checklist built
   so the checklist could be ticked." A creativity backlog would be the same
   checklist with better adjectives.
4. **The gap has an owner and it is not a pane.** The thing that catches "all
   three agents are wrong" is *reviewing output you did not write*, and the
   product's existing answer — diff surface, `→ Agent`, the raw excerpt under the
   parsed prompt — is the right answer. Making it better is legitimate work. It
   is legitimate as **review** work, on the existing theory, on the existing
   trigger. Calling it creativity work does not improve it; it just exempts it
   from the trigger.

**A good product theory generates deletions.** The attention theory killed the
second badge, the eleventh surface, the prose-parsed test signal, the persisted
acknowledgement map, and eight surfaces above. Ask the round-2 papers a single
question: *name one thing your creativity thesis forbids.* If the answer is a
feature nobody proposed, it forbids nothing.

---

## Does DevDeck serve the creative act, or interrupt it?

Direct answer, since the question deserves one: **it serves it negatively, and
that is the correct way to serve it.**

The largest risk this app poses to a supervisor's thinking is **false
interruption** — claiming something wants you when it does not, or staying quiet
when it does. Three lying signals removed. A second divergent badge deleted. A
count that shrinks when you have already looked. An acknowledgement that cannot
leak into classification. `.deck-key.key-waiting.key-seen` stops breathing rather
than changing hue. That is an app systematically removing itself from the
foreground of someone's attention.

There is nothing further to add here. There is something to *distribute*: the
single most attention-serving thing DevDeck can ship in the next six weeks is a
certificate, because a stranger who meets SmartScreen is interrupted before minute
one and never reaches the part we spent six months making calm.

---

## Unthinkable

The *not us* list this brainstorm makes necessary. Each with its kind of no and
its rightful owner.

- **A scratchpad, idea pane, decision journal, or "thinking space."** *(Not us —
  Obsidian, a text file, the repo's own `NOTES.md`.)* And a second reason that is
  stronger: content that lives in DevDeck must be backed up and eventually
  reachable from a second machine, which is a hosted service, which
  `PRODUCT.md:20` forbids.
- **Session replay / "how did I get here" history.** *(Not real.)* Terminal
  recording was built and deleted on 2026-09-04. Same feature, nicer word.
- **Canvas, revived as a spatial thinking surface.** *(Not real.)* "Two layouts
  is a choice; three is a hobby" (`ROADMAP.md:478-479`). Only prediction 2 may
  reopen this, and only from strangers' unprompted mouths.
- **A seventh skin — mood, flow, focus, ambience.** *(Not real.)* Refused in
  advance on 2026-09-04 and refused again here.
- **Generative or ambient anything** — soundscapes, focus timers, animation
  beyond the one attention breathe that already earns its place. *(Not us.)*
  `DESIGN.md`'s north star is calm; ambience is decoration arguing it is calm.
- **Prompt inspiration** — a template gallery, suggested next prompts, an agent
  that proposes what you should work on. *(Not us, and the worst of the set.)* It
  is the app deciding what the human should think about, in the one product whose
  entire discipline is not spending the human's attention without cause.
- **Divergent multi-agent exploration** — same prompt to three agents, compare
  results. *(Not real, with a receipt.)* −2111 lines, never completed a race.
- **"Serving developer creativity" as a stated product claim.** *(Not us —
  Notion, Figma, and every tool whose users are not being paid by the token.)*
  Adopting it commits us to defending it, and it is not defensible on five
  recorded sessions.

---

## The order

**It does not change.** `ROADMAP.md` → *The order, in wall-clock terms* stands
exactly as ordered on 2026-09-04. Restated so this document is executable rather
than decorative:

1. **Cut 0.13.0 locally** — version bump, rolled-up changelog, tag,
   `npm run package:signed`. `release-eng` + `marketing`. *Unblocks:* step 7 has a
   build; the beta has a version number. Do not publish.
2. **Step 7's human sitting** — the approve/deny card on a physical phone, plus
   the four CDP-blind observations. `qa`, a human at the keyboard. *Unblocks:* the
   beta's first impression. Blocked on nothing.
3. **Ask the owner to authorise step 4, with the price attached.** `product-director`
   carries the ask; the owner rules. *Unblocks:* everything remaining. This is a
   message, and it takes ten minutes.
4. **Step 4 in one sitting** — harvest, delete, recreate, push clean history, flip
   public, file with SignPath. `release-eng`.
5. **Deploy `site/index.html`.** `marketing`.
6. **Step 6** — CI + SignPath in the release path. `release-eng`.
7. **Publish 0.13.0** with blockmap and `latest.yml`. `release-eng`.
8. **Step 9** — recruit, one at a time. `field`.

**What this brainstorm adds to that list: nothing.** What it may *remove* is a
question, and that is a real deliverable — if round 2 does not produce a
pre-registered prediction, "should DevDeck serve creativity" is closed until
prediction 2 fires, and nobody re-opens it in October.

**Left off, and why:** every creativity candidate above; any further UI work
before step 9 (`ROADMAP.md:296-300`, already ruled); and any attempt to convert
this brainstorm into a spec. The milestone has enough product and no distribution.

**The trade, costed as I am required to cost it.** Taking my advice: you give up
the most interesting conversation available this month, and the roadmap gets no
new ideas in it. Ignoring it: an hour here becomes a spec, a spec becomes 25
tasks, and the two human acts that actually move the milestone — an authorisation
and a phone sitting — slip another fortnight, having slipped once already.
`ROADMAP.md:29-30` predicted this failure mode by name three days ago: *"Writing
more code will not make this milestone move, and any proposal to write more is a
way of not asking for the authorisation."* A creativity brainstorm is the most
flattering possible form of not asking.

---

## Under pressure

The three expansions the creativity frame makes available, and what accepting each
would silently commit us to.

**1. The thinking surface (scratchpad, journal, notes-on-the-work).** Commits
DevDeck to being a place where *content* lives rather than a place where sessions
are watched. Content demands durability, then backup, then reachability from the
phone client that already exists — and that is a hosted service with an account,
which `PRODUCT.md:20` refuses and which the "no daemon, dies with the window"
property (`E3:151-160`) refuses architecturally. This is the expansion that would
turn a local instrument into a service by accident.

**2. Divergent exploration (N agents, one task, compare).** Commits DevDeck to
being a *spend* surface. Three agents on one prompt is three times the tokens, and
the usage ledger currently has a confirmed data-loss bug that rewrites every
session the user did not hand-close to 0 ms (`ROADMAP.md`, *Behind those, in
order*). Shipping divergence on top of a ledger that lies about cost is how a beta
user gets a bill they cannot reconstruct. It also resurrects the bake-off, which
holds the record for the largest deletion in this repo.

**3. Adopting the frame itself, with no feature attached.** The subtlest and the
one I care about most. An unfalsifiable frame in a repo that has spent six months
building falsifiable ones permanently lowers the standard of every future
argument. Once "it helps the developer think" is an accepted move, the next
proposal cannot be refused on evidence, only on taste — and taste is exactly what
`docs/beta/` exists to stop being the deciding factor. **That is the strategic
decision being made by accident here, and it is being made in the format of a
brainstorm rather than a ruling.** It is the one I am actually killing.

---

## What would prove me wrong

Four observations, all producible by the beta as already specified, none requiring
a new criterion.

1. **Pre-registered prediction 2 fires.** Three of the first five ask, unprompted,
   where the Network view or Canvas went. Then the "feed or judge an agent" test
   is too narrow, the deletions cut something the human's work needed, and the
   creativity reading gets its hour on evidence I wrote down in advance.
2. **S4 passes with the wrong words.** Users *can* say what DevDeck is for, and
   three or more say it in terms of holding their own head straight across
   several repos rather than in terms of supervising agents or a project as the
   unit of context. That would mean the attention frame is the narrow one and the
   interface is already teaching a broader lesson than I think it is.
3. **R3's one sentence names a non-supervision reason.** The unprompted "I used
   DevDeck instead of X" arrives and the *because* is about thinking, orientation
   or focus rather than about which agent needed them. One such sentence outweighs
   this entire document, which is the point of the milestone.
4. **The hardest one, against me.** Prediction 1 holds *and* F3 fires: all five
   reach a running agent in under two minutes, and none of them comes back, and
   none names a missing feature. Then the app is usable and the *problem* is
   unproven — and "what is the human actually doing all day" is genuinely
   reopened, with the attention theory as the leading suspect rather than the
   settled answer. That is the scenario in which I would run this brainstorm
   myself, properly, with data.

Until one of those four is observed, the answer to *"what is left of the
developer's creative act, and does DevDeck serve it"* is: **deciding under partial
information without being lied to, and yes — it already does, and the remaining
work is getting it onto somebody else's machine.**
