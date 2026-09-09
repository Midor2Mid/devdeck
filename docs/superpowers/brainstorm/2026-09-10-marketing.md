# Marketing brainstorm — the words, post-D1

`marketing`, 2026-09-10. Scope: what is true about DevDeck to a stranger, and
whether to say it yet. Read against `docs/superpowers/brainstorm/2026-09-08-product-direction.md`,
`docs/superpowers/plans/2026-09-08-beta-execution.md`, `PRODUCT.md`, `README.md`,
`ROADMAP.md`, `site/index.html`, `CHANGELOG.md`, `docs/beta/02-recruiting-message.md`.

---

## 1. The one true sentence, and the paragraph

**Sentence:** DevDeck is a Windows desktop app that puts every terminal and
agent-CLI session across your projects into one deck, and tells you which one
is waiting on you.

**Paragraph:** Pick a project and every terminal and Claude/Codex/Gemini
session you run for it lives in one deck, alongside every other project's.
Switch projects with one keystroke instead of re-`cd`-ing across four terminal
tabs. When an agent finishes or needs an answer, DevDeck flags it — so running
three or four sessions in parallel doesn't mean clicking each tab to find out
which one needs you. A read-and-diff editor sits next to the terminal for
checking what an agent wrote; it is not an IDE and does not try to be one.
DevDeck is Windows-only, on purpose, because it drives a real Windows shell.

Neither sentence claims a suite. Neither mentions the API client or the
database panel — both are pre-registered for deletion (**D1**) on the evidence
that nobody, including the author, has ever used them, and a headline should
not be written for a feature already on notice.

---

## 2. The repointing, drafted

**`README.md:3`** (replaces the "command deck... editor, an API client, and a
database client" tagline):

> A Windows desktop cockpit for driving Claude Code, Codex, or Gemini across
> more than one project at once — one deck that shows every terminal and agent
> session you have running, and which of them is waiting on you.

**`PRODUCT.md:3`** (replaces the same tagline; drops "For me... first" per the
sitting `product-director` already asked for, since the Validation section
below it already says this is n=1 in the author's own, harder words):

> A command deck for terminal-first, AI-CLI-driven development: multiple
> terminals and agent sessions (Claude, Codex, Gemini) across projects, and one
> screen that answers which of them needs you.

**`ROADMAP.md:3`** (replaces "The vision is all-in-one."):

> DevDeck is a terminal-first cockpit: a project is the unit of context, and
> one row answers which agent is waiting on you. Everything else — the editor,
> the verification tools — is built to serve that row, not to compete with it.
> Default to removing.

**`site/index.html` hero `<p class="lede">`** (replaces "everything —
terminals, agent sessions, the editor, the API client, the database panel —
snaps to it"):

> DevDeck is a terminal-first workspace for developers who spend the day
> driving Claude Code (or Codex, or Gemini) across more than one project. Pick
> a project and every terminal and agent session snaps to it, side by side,
> labeled, running even when you switch away. One deck shows every project's
> agents at once, and which one is waiting on you.

All four say the same thing at a different length. None promises an editor,
an API client, or a database as a reason to install.

---

## 3. What the draft release should say

A stranger who double-clicks an unsigned or self-signed installer with no
warning first is a candidate DevDeck loses to a security prompt it never
explained. The published notes (item 3 of the handoff) should open with this,
not bury it in a linked page:

> **This build is not yet trusted by Windows.** Running the installer will
> very likely show "Windows protected your PC" — that's Microsoft Defender
> SmartScreen, and it fires because this file is new and self-signed, not
> because anything in it was flagged. Click **More info**, then **Run anyway**.
> The signature itself is real (Authenticode, self-signed), just not one
> Windows trusts by default yet — a free certificate from the SignPath
> Foundation, for exactly this situation, is filed [/ in progress — state
> whichever is true the day this publishes]. Verify before you run anything:
> SHA-256 `<hash>`, sent to you separately from wherever you got this link.

Two rules for whoever finalizes this: state the SignPath filing's actual
status in plain past/present tense on publish day — don't reuse "the plan is"
language once a real filing exists or doesn't; and don't publish the CI job's
unsigned assets under this text, because "the signature is real" would then be
false. Step 11 already says this; the note text must match whichever binary is
actually attached.

---

## 4. Should anything be said publicly yet

**No — and the repo being public already is not the same question as this
one.** Flipping the repo public was a precondition for the SignPath filing and
for a stranger being able to open an issue; it was never a decision to
announce anything, and nothing here reverses it. Fixing README/PRODUCT/ROADMAP/
site copy so it stops lying about the repo's own visibility is not "saying
something publicly" either — it's removing a false statement, which is owed
regardless of audience size. Deploying `site/index.html` to Pages (step 5) is
the same kind of act: a truthful page that only a visitor who already found
the repo will ever land on, not a page announcing itself anywhere.

What stays off, unconditionally, until the trigger fires: any post to HN,
Reddit, Product Hunt, a socials account, or a "launch" of any kind; any
listing submission; enabling Discussions; any sentence implying other users
exist ("a few people are already using it") before any do. The only speech act
that should happen now is the one already designed for it — `field`'s
one-at-a-time, individually-addressed recruiting message, sent to a named
person who fits the three-fact gate, not broadcast anywhere.

**What changes this ruling:** the trigger `product-director` already named —
five recorded sessions with S1–S4 met at their stated bars. Before that, a
public launch spends the only first impression this product gets on a build
no stranger has ever finished a session with.

---

## 5. What the roadmap is missing, and the most dishonest sentence found

**Missing:** the roadmap has no second wave for the words. Steps 10–12 fix
today's copy once; nothing schedules a re-pass after D1 actually executes (the
Database/API/Work panels deleted, Tasks demoted) or after the milestone
verdict lands — win or lose. If D1 fires, "What works today" in `README.md`
still lists a Database and API panel that no longer exist, on the same day
they're cut, unless someone remembers to touch it. Put a line item next to D1
itself: *copy update is part of the deletion's definition of done, not a
follow-up.* Separately: nothing addresses a candidate who is mid-beta the week
D1 fires — the recruiting message promises the app they saw in session one;
if it changes under them before day-7 follow-up, that's a disclosure owed to
that specific user, not just a changelog line.

**The most dishonest sentence currently published:** `site/index.html:158` —
the hero tag reading **"Self-signed today · SignPath applied for."** This is
not stale, it is self-contradicting *within the same document*: `:246` of the
same file says the filing "has **not** been applied for yet." A stranger who
reads only the tags at the top — which is what tags are for — is told the
opposite of what the page says ninety lines later. It is the single sentence
on the loudest, most-skimmed part of the homepage, and it currently states an
action that has not happened as though it had.
