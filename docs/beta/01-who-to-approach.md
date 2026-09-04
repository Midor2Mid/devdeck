# Who to approach

DevDeck is Windows-only, terminal-first, and built around driving Claude Code /
Codex / Gemini across more than one project. That is not a market segment; it is
a **situation a person is already in**. Recruit for the situation.

## The gate — three facts, all three required

Before anyone is a candidate you must be able to write these three sentences
about them **from something they said or published**, not from a guess:

1. **They develop on Windows**, in a real Windows shell — PowerShell, Command
   Prompt, or Git Bash on Windows. (WSL-only is a special case: see archetype D.)
2. **They drive an agent CLI most days** — `claude`, `codex` or `gemini` — from a
   terminal, not only from an IDE extension or a chat window.
3. **They work across more than one repo**, and switching between them is part of
   their day.

If you cannot say **what they use today**, they are not a candidate yet. "A
developer who might like this" is not a candidate; it is an intention.

A fourth fact decides whether they can install anything at all, and it is asked
in the intake rather than assumed: **whose machine is it?** A locked-down
corporate laptop may refuse a self-signed installer outright — which is a
finding, not a failure (see "The install-policy datum" below).

## The archetypes

Five who fit beat fifty who are curious. One slot each for A, B and C at
minimum; D gets exactly one or two slots, deliberately.

---

### A — The Windows enterprise developer who adopted Claude Code

**Their day.** Visual Studio or Rider on a company Windows laptop. An API repo, a
web repo, a jobs/worker repo, maybe a shared library — four checkouts, one
feature. They run `claude` in a Windows Terminal tab beside the IDE and have
started letting it do the mechanical work.

**Why DevDeck is worth their time.** They are the archetype who genuinely
re-`cd`s all day and loses track of which of three terminals is waiting on them.

**Where they are actually found.** The author's own professional network first —
current and former colleagues, and developers on client teams — because these are
people who can be watched *in person*, which is the highest-fidelity observation
available and the easiest consent to obtain. Beyond that: .NET / Azure user
groups and meetups, `r/dotnet` threads where someone mentions using an agent CLI,
and Windows-tagged issues on the agent CLIs' own trackers.

**The risk to price in.** Their repos are client repos. DevDeck reads git state,
can list a project's MCP config, and the diagnostics record includes file paths
and command lines (secrets redacted). Say that before they install
(`02-recruiting-message.md` covers it) and never ask for a diagnostics paste
without repeating that they may delete lines from it first.

**Disqualified variant.** A colleague who would install it to be polite. A favour
produces a session and no evidence. If you cannot name which of *their own*
problems it solves, do not invite them.

---

### B — The independent / freelance multi-repo developer on Windows

**Their day.** Three to eight client or product repos on their own machine, no IT
department, switching contexts several times a day. They installed an agent CLI
the week it shipped and use it constantly. Nobody can stop them installing
anything.

**Why DevDeck is worth their time.** They own the whole problem — the project
switching, the parallel sessions, the "which of these is blocked" question — and
they can act on an opinion immediately.

**Where they are actually found.** The searchable signal is a **public complaint
about a Windows-specific agent-CLI problem**: issues and discussions on
`anthropics/claude-code`, `openai/codex` and `google-gemini/gemini-cli` filed by
someone clearly on Windows; the Claude developer Discord; `r/ClaudeAI` and
`r/ChatGPTCoding` threads where the poster says they are on Windows.

**How to approach.** Reply where they already complained, about the thing they
complained about, once. Do not broadcast into a channel that did not ask.

---

### C — The multi-agent power user

**Their day.** Two to four agent sessions running at once, on purpose. They
already have homegrown scripts, a worktree-per-agent habit, or an envy of `tmux`
they voice out loud. They lose answers because an agent asked a question in a tab
they were not looking at.

**Why DevDeck is worth their time.** They are the **only** archetype for whom
DevDeck's central claim is testable in a first session: that the live agent
population is visible from every view, and that one surface answers "who needs
me". Everyone else tests a terminal with tabs.

**Where they are actually found.** Threads about running parallel agents, git
worktrees per agent, and agent supervision — in the CLIs' own trackers, in the
Claude developer Discord, and in the issue trackers of competing agent cockpits,
where people file requests like "I lose track of which agent is waiting".

**Recruit at least one, and watch for the opposite result.** If a power user says
the deck tells them nothing they did not already know, that is the most expensive
finding available and it must be recorded verbatim, not softened.

---

### D — The Windows developer who lives in WSL or Git Bash — one or two slots, knowingly

**Their day.** Windows hardware, but the shell is `bash`: WSL, or Git Bash for
everything. Their agent CLI may be installed only inside that environment.

**Why they are here on purpose.** They are the live test of two things nothing on
the author's machine can test:

- **The shell-mismatch false negative.** DevDeck hydrates PATH from PowerShell,
  so an agent installed only in their shell reads `not on PATH` while launching
  perfectly. See `06-shell-mismatch-watch.md`; this archetype is how it fires.
- **The Windows-shell premise itself.** DevDeck spawns a real Windows shell by
  design. If a WSL-first developer cannot get value from it, that is a fact about
  the product's scope, not a bug to fix in a hurry.

**Expect friction, and do not warn them.** Telling them in advance what the badge
will say destroys the only observation this slot exists to produce.

**Cap it.** One, at most two of the five. More than that and you have recruited a
beta for a shell DevDeck does not target.

---

## Disqualifiers — say no out loud

- **No agent CLI in their daily habit.** They will evaluate a terminal emulator
  with tabs, and their opinion will be about a product DevDeck is not.
- **macOS or Linux.** Not "later" — the 5–10 are recruited on Windows or not
  recruited (`ROADMAP.md`).
- **One repo, one project.** The core claim cannot fire.
- **Wants to contribute rather than use it.** One maintainer, PRs by invitation.
  A contributor is not a user; they will report on the code, not on their first
  five minutes.
- **Anyone who has already seen the app.** Once someone has watched a demo or a
  screenshot walkthrough, their first five minutes are spent. That includes
  anyone the author has talked DevDeck through in detail.
- **The author.** Not a user. Never counted.

## Intake — six questions, asked before the build is sent

Ask these in the invitation thread, not during the session. They pre-screen, and
three of them are variables the session record needs. **None of them mentions a
DevDeck feature**, so none of them primes an answer.

1. What are you building at the moment, and how many repos does it involve?
2. Which agent CLI do you use, and roughly how often?
3. What shell do you type in — PowerShell, Command Prompt, Git Bash, WSL?
4. Windows 10 or 11, and is it your own machine or a work-managed one?
5. Can you install software on it yourself?
6. When you switch from one project to another, what do you actually do?

Record all six answers in the session record **before** the install, verbatim
where they are interesting. Question 3 decides whether this user is a
shell-mismatch case. Question 6 is the only question that tests the premise in
`PRODUCT.md`, and it is asked before they have any idea what the app does — after
which it can never be asked honestly again.

## The install-policy datum

If a candidate says their machine will not let them install a self-signed app,
**that is a recorded result, not a lost candidate**. Write it into `NOTES.md`
with their words. Three of those and the case for roadmap steps 4 and 6 (a real
certificate, signed in CI) is made out of evidence instead of anticipation —
which is worth more than the fifth watched session.
