# The recruiting message

**Nothing in this file is sent until the author has approved the exact text.**
Placeholders in `[square brackets]` must be filled or removed before sending —
a message with a bracket left in it says the sender did not read it.

## Rules for every message here

- **One channel.** Decide it before the first send and put it in the message.
  The repo is private, so the user cannot open an issue; diagnostics is
  clipboard-only, so nothing reaches you unless they paste it to you.
- **No walkthrough, no video, no click-by-click.** One screenshot is acceptable —
  they are agreeing to install something and deserve to see it. A tour spends the
  first five minutes before the session starts.
- **Every honest disclosure stays in.** Windows-only, self-signed, SmartScreen
  will warn, one maintainer, the session is watched and recorded, the build
  arrives as a file rather than a download link. If a sentence feels like it
  costs a candidate, that is the sentence that makes the next twenty minutes
  worth anything.
- **No claim about other users.** There are none. Never "a few people are already
  using it".
- **Reply where they already were.** One reply, in the thread they were in. No
  broadcast into a channel that did not ask, no cold mass DM.

---

## 1. The DM line

For a person, in a thread, where the context is already about Windows and agent
CLIs. One line, one ask.

> I built a Windows app for driving claude/codex/gemini across several projects
> in one window, and nobody outside my machine has ever run it. Would you be up
> for installing it while I watch and say nothing for half an hour?

Variant when the thread was a specific complaint:

> You mentioned [their exact problem]. I built a Windows thing for that and have
> never watched anyone else install it — would you be up for being the first, on
> a call, while I keep quiet and take notes?

---

## 2. The longer version, for a post or a first reply

Use verbatim. It is deliberately unexciting.

> **Looking for 5 Windows developers who use an agent CLI daily**
>
> I've been building DevDeck: a Windows desktop app where a project is the unit
> of context. Terminals, agent sessions (Claude Code / Codex / Gemini), an
> editor, an API client and a database panel, all snapped to whichever folder
> you're in, so switching projects doesn't mean re-`cd`-ing four tools. It also
> shows every running agent across every project and which one is waiting on you.
>
> I have used it every day for months. **Nobody else has ever opened it.** That
> is the problem I'm trying to fix, and it's the only reason I'm posting.
>
> What I'm asking for: install it while I watch — a call with screen share, about
> 30–40 minutes — and let me write down what you do and what you say, word for
> word. I will not demo it, and I will not talk you through it. If you get stuck,
> that's the finding.
>
> Things you should know before you say yes:
>
> - **Windows only.** On purpose — it drives a real Windows shell and a real pty.
>   No macOS, no Linux, not planned.
> - **You need an agent CLI already installed** (`claude`, `codex` or `gemini`).
>   DevDeck doesn't install them; it runs the one you already have.
> - **The installer is signed with my own certificate**, so Windows will show
>   "Windows protected your PC" and you'll have to click More info → Run anyway.
>   A certificate that clears that warning has been applied for and not granted.
>   If that's a no for you, it's a fair no — tell me and that's useful too.
> - **It isn't public yet**, so I'd send you the installer as a file, with its
>   SHA-256, rather than a download link.
> - **One maintainer. Early.** Expect rough edges; the point of this is to find
>   out which ones matter.
> - **Nothing is transmitted.** No account, no telemetry, no endpoint. If
>   something breaks there's a *Copy diagnostics* button that puts a redacted
>   record on your clipboard — and it only reaches me if you choose to paste it.
> - **You are not committing to keep using it.** If you never open it again, I'd
>   rather know that than not.
>
> If you're in: reply or DM me at [channel].

---

## 3. The invitation, once they've said yes

Sent before anything is delivered. Carries the intake questions and the consent
line.

> Thanks — genuinely. Before I send you anything, six questions, because I want
> to know your setup before you see the app rather than after:
>
> 1. What are you building at the moment, and how many repos does it involve?
> 2. Which agent CLI do you use, and roughly how often?
> 3. What shell do you type in — PowerShell, Command Prompt, Git Bash, WSL?
> 4. Windows 10 or 11, and is it your own machine or a work-managed one?
> 5. Can you install software on it yourself?
> 6. When you switch from one project to another, what do you actually do?
>
> **How the session runs.** You share your screen, download the installer, and go.
> I'll be quiet — that's not rudeness, it's the method. Think out loud if you can:
> "I'm looking for X", "I expected that to do Y". If you're stuck I'll leave you
> stuck for a bit, because where people get stuck is the whole point. Ask me
> anything you like; I may answer "what would you do if I weren't here?" and that
> is me doing my job, not dodging.
>
> **What I record and what I do with it.** I write down what you clicked and what
> you said, in your words, into the project's notes file — which is in the repo
> and will be public when the repo goes public. Tell me now which you'd prefer:
> your name, your first name only, initials, or "a Windows developer". You can
> change your mind at any point, including after the session, and I'll delete
> anything you ask me to delete. Nothing goes anywhere else, and I won't quote
> you in anything promotional.
>
> One ask: **don't explore it before the call.** The first five minutes only
> happen once and they're the thing I'm short of.

---

## 4. Delivery — sent with the file

> Two files: `DevDeck-Setup-[version].exe` installs it, `DevDeck-Portable-[version].exe`
> runs without installing anything (use that one if you'd rather not install).
>
> SHA-256:
> `[hash]  DevDeck-Setup-[version].exe`
> `[hash]  DevDeck-Portable-[version].exe`
>
> Verify with: `Get-FileHash .\DevDeck-Setup-[version].exe`
>
> Windows will say "Windows protected your PC" — that's SmartScreen reacting to
> my self-signed certificate, not to the file's contents. More info → Run anyway.
> Don't open it yet if you can help it; save it for the call.

---

## 5. The pre-session note, the day before

> Still on for [time]? Nothing to prepare. Have the installer to hand, and one
> real project you'd actually work in — a scratch folder tests a different app
> than the one I need tested. If you'd rather not screen-share a client repo,
> pick whichever of your own repos is closest to real work.

---

## 6. Closing the session

Asked out loud, at the end, in this order, and nowhere else in the session. Ask
them, then be quiet.

1. "What did you think this was for, when you first saw it?"
2. "If you never opened it again, what would the reason be?"
3. "What would have to be true for this to replace what you use now?"
4. "Anything in my notes you want me to cut?"

Then, and only then, you may answer the questions you deflected during the
session — including telling them about any defect they hit. Record their reaction
to being told; it is often sharper than anything they said while struggling.

---

## 7. Day 7 — the one follow-up

One message. It must make "no" easy to say, because "no" is the finding.

> Have you opened DevDeck again since we talked? Either answer is useful — if you
> haven't, I'd like to know what it was competing with that day.

Do not nudge, do not remind, do not suggest a feature to come back for. A user
who needs a reminder to open a tool has answered the question.

## 8. Day 14 — the silence probe

Only if day 7 went unanswered. Then stop.

> Last one from me — did DevDeck get uninstalled, or is it just sitting there? No
> wrong answer, and no reply needed if you'd rather not.

Whatever comes back — including nothing — is recorded in `NOTES.md` as the
outcome. **Silence is a result and gets written down as one**, in the funnel
table, as `silent` or `gone`.

## 9. Declining, and being declined

If they say no, or their machine blocks the install:

> Completely fair, and the "no" is data too — thanks for telling me. Mind if I
> ask what the blocker was, in a sentence? That goes in the notes as a reason,
> not as a lost user.

If **you** decide they are not a candidate after the intake answers (wrong shell,
one repo, no agent CLI), do not run the session out of politeness:

> Thanks for the detail — going to hold off for now, because what I need first is
> people already running an agent CLI across several repos on Windows, and I'd
> waste your half hour otherwise. I'll come back to you when there's something
> worth your time.
