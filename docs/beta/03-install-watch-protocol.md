# The install-watching protocol

The first five minutes decide whether there is a sixth. This file is what the
author *does* during them.

**The governing rule: the struggle is the finding.** A user coached past a defect
produces a pleasant call and no evidence. Every minute you stay quiet is data you
cannot buy back later.

---

## Before the call

- [ ] A build cut from current `main`, installed once from its own installer on
      this machine, `npm run verify:packaged` green against it. Never hand out a
      build you have only ever run from `out/`.
- [ ] Both installers sent, with SHA-256s (`02-recruiting-message.md`, §4).
- [ ] The session record open and pre-filled: `04-session-record-template.md`
      copied, intake answers pasted in, user id assigned (`U1`…), date set.
- [ ] A clock you can read without looking away. Every checkpoint below is a
      timestamp; "a while" is not a finding.
- [ ] Recording permission confirmed out loud at the start of the call, again,
      even though the invitation covered it.
- [ ] **DevDeck closed on your own machine, and not shared.** You cannot demo
      what is not on screen. Do not share your screen at any point.
- [ ] Their answer to intake Q3 (shell) noted, because it decides whether
      `06-shell-mismatch-watch.md` is live for this session.
- [ ] `06-shell-mismatch-watch.md` open in a second window.

## Opening — say this, then stop talking

> "Screen share whenever you're ready. From here I'm going to be quiet and take
> notes. If you can, say what you're doing and what you expect — 'I'm looking for
> X', 'I thought that would do Y'. If you get stuck I'll probably leave you stuck
> for a minute; that's the part I need. Ask me anything, and don't be surprised if
> I answer with another question."

Then start the clock and **do not speak until a checkpoint or the 90-second rule
fires.**

---

## Checkpoints — timestamp each one, verbatim where they speak

Record the time even when nothing goes wrong. A checkpoint reached in 8 seconds
is as much a finding as one reached in four minutes.

| # | Checkpoint | Record |
|---|---|---|
| 1 | Installer downloaded / located | which of the two files they chose, and why if they say |
| 2 | **SmartScreen appears** | the exact wording they read out; how long they pause; whether they click More info unaided; whether they ask you if it's safe; whether they check the SHA-256 you sent |
| 3 | Any antivirus or policy prompt | product name, exact text, whether it blocked or warned |
| 4 | DevDeck window visible | seconds from double-click; whether they thought it had failed to start |
| 5 | **First-run screen read** | what they read first, what they read aloud, what they ignored; whether they notice the line reporting what was found on their PATH, and what they say it means |
| 6 | Folder dialog opened | did they use the accent button, the app menu, `Ctrl+O`, drag-and-drop, or hunt; **did the dialog open behind the window** (the app looks frozen when it does — say nothing) |
| 7 | Project opened | seconds from dialog to a project on screen; which view they land on; the first thing they click after it |
| 8 | **First shell running** | how they got there; whether they waited on a blank pane and what they said while waiting |
| 9 | **First agent session running** | which agent, how they launched it, and whether the badge on that card said anything about PATH — if it did, go to `06-shell-mismatch-watch.md` |
| 10 | Anything they did that you did not expect | verbatim, in order. This column is the most valuable one in the table |

Also record, at the end, the two negative lists — they are evidence and they are
the easiest thing to forget:

- **Never found**: controls or views they looked for and did not locate.
- **Never touched**: what they never went near. A view nobody opens in five
  minutes is a finding about that view.

---

## The 90-second rule

When they stall — no clicks, or repeated clicks on the wrong thing:

1. **Say nothing for 90 seconds.** Watch the cursor. Write down where it goes;
   hunting is data about the interface.
2. Then **one** question, from this list only:
   - "What are you trying to do right now?"
   - "What were you expecting that to do?"
   - "What are you looking for?"
3. Still stuck 90 seconds later, ask the most important question in this file:
   - **"What would you do if I weren't here?"**

   Their answer is the real-world outcome of this defect. If it is "I'd close it"
   or "I'd google it" or "I'd give up" — **write it down verbatim and then let
   the session end there if that is what they'd do.** A session that ends at
   minute four because the product defeated them is a complete result, not a
   failed session.
4. Only if the relationship costs more than the datum — they are visibly
   frustrated, or you have burned five minutes on one stop — give the **smallest
   possible unblock**: name the region, never the control ("it's somewhere along
   the bottom"), never the click.
5. **Stamp the record.** Write `COACHED at mm:ss — I said: "<exact words>"`.
   Everything after that timestamp is a weaker class of evidence and the record
   must say so.

### The exceptions — when you interrupt immediately

In descending order. Nothing outside this list justifies breaking silence.

1. **Their data or machine is at risk.** They are about to run a
   permission-bypassing agent preset against a real repo, dispatch a task in a
   way they have misread, or turn on Remote access. Stop them, explain, record
   that you did, and record what they thought the control did — that
   misunderstanding is a first-class finding.
2. **They are about to spend money.** An agent about to burn tokens on a task
   they did not intend.
3. **They have asked you the same direct question three times.** Answer it, then
   record the question verbatim: three asks is a documentation defect.
4. **A crash or a hang.** Not a reason to coach — a reason to switch to the
   diagnostics ask below.

---

## What you may never say

Not softened, not "just this once".

- "Try clicking…" / "It's at the bottom right" / "That button does…"
- "Did you like…" / "Was that helpful?" / "Do you find that clear?"
- "That's a known bug" / "That's supposed to say…" / "Ignore that"
- "Most people…" / "Everyone gets stuck there"
- "Actually…" — the whole sentence is a correction of a user who was reporting
  their experience accurately.
- "You can also…" — every one of these is a feature demo wearing a helpful hat.
- Anything naming a feature they have not found yet.

And the hardest one: **do not explain a defect while they are inside it.** If
they hit the shell-mismatch false negative, or a wrong label, or an empty
popover, the only permitted response is a question: "What does that tell you?"
Tell them the truth after the closing questions, not before.

**Yes/no questions are leading questions.** "Was the launcher clear?" gets you
"yeah, fine". "What did that card tell you?" gets you a sentence you can quote.

---

## When something breaks — the diagnostics ask

Nothing is transmitted from DevDeck. No endpoint, no telemetry, no log upload.
**A stranger's failure reaches you only if you ask them to paste it**, and this
is the entire channel.

If the app crashed, a panel latched broken, or a pane died unexpectedly, ask —
during the session if the app still runs, otherwise right after they relaunch:

> "There's a button in Settings → About called *Copy diagnostics*. It puts a text
> record on your clipboard — versions, your shell, your agent commands and
> whether each was found on your PATH, and the recent app log. File paths and
> command lines are in it; API keys and tokens are stripped out. Nothing is sent
> anywhere, it just copies. Could you press it and paste it to me at [channel]?
> Read it first if you like — if there's a line you'd rather not send, delete it
> and send the rest."

Notes on the ask:

- **A crash closes the app.** The dialog says so and points at the button *after
  a relaunch*: the crash is written to disk, so the record built next session
  contains it. Ask them to reopen DevDeck, then copy.
- **If the button refuses**, that is itself a finding: it refuses only when the
  crash log exists and cannot be read. Record the refusal wording verbatim.
- **Never ask them to send `settings.json`, a screenshot of a terminal with real
  paths, or a project folder.** The record is the sanctioned channel because it
  is the one that has been redacted on purpose.
- **Paste it into the session record whole**, in a fenced block, and note whether
  they removed lines. Then read these fields first:
  - `Shell / configured` and `Shell / resolved` — the shell pair
  - `Agent commands / PATH read` — `no` means every state below it is
    `unchecked`, not `missing`
  - each agent line's `found` / `not on PATH` / `unchecked` / `no command set`
  - `Terminal exits / last non-zero`
  - `Errors (n distinct)` and the `Incomplete` block, which declares what the
    record itself dropped

## Closing

Ask the four questions in `02-recruiting-message.md` §6, in that order, then stop
asking anything. Confirm the attribution they chose. Confirm what, if anything,
they want cut.

## Within one hour of the call — not tomorrow

1. Finish the session record while you can still hear them. Quotes decay into
   paraphrase within hours, and a paraphrase in the quotes section is a fabricated
   quote.
2. Paste the filled record into `NOTES.md` under **"Beta — external users
   (step 9)"** and update the funnel row for that user.
3. Rule on **stop the line** (`05-validation-criteria.md`): does anything in this
   session block inviting the next person?
4. Write the single question for the next session at the bottom of the record.

**Do not fix anything tonight.** One session is one observation; the next user is
the cheapest way to find out whether it was the interface or the person. The
exception is a stop-the-line defect, which is exactly what that rule is for.
