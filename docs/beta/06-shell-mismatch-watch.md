# The watch: the shell-mismatch false negative

`ROADMAP.md` step 9 names this specifically, and the first-contact ruling of
2026-09-03 assigned it to this seat by name ("Condition 2 — `field` watches for
the shell-mismatch false negative"). It is the **one accepted gap that shows
wrong information rather than no information**, which makes it the single most
likely thing to make a first user distrust the app.

## The mechanism, verified in the tree on 2026-09-04

- `src/main/shellPath.ts` hydrates PATH by spawning **the platform default
  shell** — `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`,
  deliberately without `-NoProfile`, so a PowerShell profile's PATH edits are
  captured. The module's own header explains why reading `process.env.PATH`
  would be worse.
- It does **not** hydrate the user's configured pane shell. `backend-dev`
  refused to spawn a renderer-supplied executable, which is the right refusal.
- So for a user whose panes run **Git Bash, WSL, or a custom shell**, with an
  agent CLI installed only in that environment, the probe answers `missing` for
  a command their terminal runs perfectly.
- **The marker does not gate** (`probeView.ts#canLaunch`): the card still
  launches, and the agent starts. The failure is therefore a **misleading label
  on a working feature** — the shape a user reports as "your app is wrong"
  without being able to say why.

## What it looks like on screen

The exact strings, so you can quote them in the record without paraphrasing:

- Launcher card, right-aligned pill: **`NOT ON PATH`** (dashed / qualified).
- Its tooltip: *"DevDeck looked for `<token>` on your PATH and didn't find it. A
  shell alias or function is invisible to that check — if it runs in your
  terminal, it will run here."*
- Settings → Agents row mark: **`not on PATH`** with the same tooltip.
- First-run screen, when nothing resolves: *"None were found on your PATH. A
  shell alias or function still works — but if a …"*

**Note the copy names the wrong cause for this exact user.** A Git Bash user's
`claude` is usually a real binary on a PATH that PowerShell never sees, not "an
alias or function". So the sentence intended to soften the false negative will
read as irrelevant to the one person it was written for. Watch for that: if they
read the tooltip aloud and it does not resolve their confusion, quote both their
words and the tooltip's.

## Distinguish it from the other two states — before writing anything down

| On screen | Means | Not this bug |
|---|---|---|
| `NOT ON PATH` | the PATH walk ran and did not find the command | ← **this is the watch** |
| `UNCHECKED` | the hydration itself failed (e.g. antivirus killed the spawned PowerShell), so nothing was verified | a different, honest state |
| no mark at all | the check has not finished, or the preset has no command | not a claim at all |

If the diagnostics record says `Agent commands / PATH read: no`, **every state
below it is `unchecked`** and this watch did not fire. Recording an `unchecked`
as a false negative would put a fabricated finding into the evidence.

## How to catch it — three channels

### 1. Pre-screen (before the session)

Intake question 3 — "what shell do you type in?" — decides it. `gitbash`, `wsl`
or `custom` ⇒ **the watch is live for this session**; write that in section 0 of
the record. `powershell` or `cmd` ⇒ the watch is not live, and a `found` result
from that user is **not** evidence about this gap.

Archetype D exists to make this fire (`01-who-to-approach.md`).

**Do not warn them.** Telling a user in advance what the badge will say destroys
the only observation available.

### 2. Live tells (during the session)

Any of these means the watch has fired — stop, note the clock, and let it play out:

- The launcher card shows `NOT ON PATH` for an agent they told you at intake they
  use daily.
- They read the badge aloud, or hover it, or hesitate over the card.
- They say some version of *"it says it can't find claude but claude works"* —
  capture the sentence exactly.
- They launch it anyway and the agent's banner appears in the pane. **The
  contradiction on screen is the finding**: DevDeck said no and the agent
  started.
- Or the damaging outcome: **they do not launch it**, because the badge told them
  it was not installed. Record what they did instead — that is the real cost of
  this gap and the thing no amount of code reading could have told you.

**Say nothing.** The only permitted response is a question: *"What does that tell
you?"* — then, if they are still on it, *"What would you do if I weren't here?"*
Tell them the truth after the closing questions, and record their reaction.

### 3. The diagnostics fingerprint (after the session)

Nothing is transmitted, so this only exists if you asked them to paste it
(`03-install-watch-protocol.md`). In the pasted record, this combination is the
fingerprint:

```
Shell
  configured: gitbash            <- or wsl / custom
  resolved:   ...bash.exe ...
Agent commands
  PATH read:  yes                <- if this says "no", it is NOT this bug
  Claude — claude — not on PATH  <- a command the user says they run daily
```

`configured` is what the user chose in Settings → Terminal; `resolved` is what
main actually handed to node-pty. A non-PowerShell shell pair plus `PATH read:
yes` plus a `not on PATH` line for a CLI they use every day is the false
negative, in writing, from their machine.

## What to record

In the session record's defect ledger, class **wrong-info**, with:

1. The exact string on screen (`NOT ON PATH`) and where.
2. Their verbatim sentence about it.
3. **What they did next** — launched anyway / did not launch / went to Settings /
   went looking for an install command / gave up on agents entirely.
4. Whether they still believed the app afterwards, in their words.
5. The shell pair from the diagnostics paste, if there is one.

## The decision rule — pre-committed, so it cannot be argued about later

| Observation | Action |
|---|---|
| One user sees it, notices, launches anyway, and is unbothered | **Record only.** The accepted gap stays accepted; the record is what makes it an evidenced decision instead of a guess. |
| One user **does not launch** an agent because of it, or says the app is broken / untrustworthy | **Stop the line (L2).** Fix before the next invitation. |
| Two users see it, in any form | **Stop the line.** Two is confirmation; a third is waste. |
| Any user hits it and the *tooltip* fails to explain it | Record it as a **copy** defect distinct from the probe defect. The copy fix ("a PATH other than this shell's") is much cheaper than the probe fix and may be the whole answer. |

## The fix, if it is ever needed — named in advance so it is not invented under pressure

Hydrate **per shell kind, against a whitelist in main** — the same enumeration
`settings.ts#ShellKind` already carries (`powershell | cmd | gitbash | wsl |
custom`), resolved in main, never by spawning a renderer-supplied executable.
That refusal is the reason the gap exists and it is not up for reconsideration.

The cheaper intermediate, if the copy turns out to be the whole problem: change
the qualified tooltip to name the real cause — a command on a PATH that this
shell does not have — instead of only "an alias or function".

Either way it is a `backend-dev` change with `technical-director` on the seam,
and it does not start until a user's words are in `NOTES.md` asking for it.
