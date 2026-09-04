# The first-session record — template

Copy everything below the rule into a session file, fill it during and
immediately after the call, then paste the filled copy into `NOTES.md` under
**"Beta — external users (step 9)"**.

**Three rules that make this evidence rather than a diary:**

1. **DID, SAID and I THINK are three different sections and never mix.** An
   interpretation in the quotes section is a fabricated quote.
2. **A quote is verbatim or it is absent.** If you cannot recall the words, write
   `(no quote — paraphrase only: …)` and label it. Never reconstruct.
3. **Blank beats plausible.** An unfilled field is honest. A field filled from
   memory a day later is not.

Fields marked **[required]** must be filled before the record is pasted into
`NOTES.md`; a record missing one of them is not a recorded session and does not
count toward the 5–10.

---

## U[n] — [attribution as they chose it] — [YYYY-MM-DD]

### 0. Who **[required]**

| | |
|---|---|
| **Archetype** | A / B / C / D (`01-who-to-approach.md`) |
| **What they do** | |
| **What they use today** | agent CLI + how often, shell, editor/IDE, terminal |
| **Repos in flight** | |
| **Machine** | Windows 10 / 11, own / work-managed, can install: yes / no |
| **Shell (intake Q3)** | powershell / cmd / gitbash / wsl / custom → **shell-mismatch watch live? yes / no** |
| **How they were reached** | the exact channel, and the thread if there was one |
| **Session** | in person / screen share · started HH:MM · duration |
| **Attribution they chose** | full name / first name / initials / anonymous |
| **Recording consent** | notes only / recorded · anything they asked to be cut |
| **Funnel state at the end** | invited / installed / used / silent / gone |

Intake answers, verbatim where interesting — **especially Q6 ("when you switch
from one project to another, what do you actually do?"), which is the only test
of `PRODUCT.md`'s premise and can only be asked once:**

> ""

### 1. What happened — observable only **[required]**

Times are mm:ss from the start of the call. Verbs and outcomes; no adjectives, no
motives. If you write "he seemed confused", it belongs in section 3.

| mm:ss | What they did | What happened |
|---|---|---|
| | | |

Checkpoint clocks (`03-install-watch-protocol.md`) — write `n/a` where a
checkpoint never happened, and why:

| Checkpoint | mm:ss | Note |
|---|---|---|
| Installer located | | which file, Setup or Portable |
| SmartScreen shown | | how long they paused; did they proceed unaided |
| AV / policy prompt | | product + exact text |
| Window visible | | |
| First-run screen read | | did they notice the PATH line; what did they say it meant |
| Folder dialog opened | | via which affordance; did it open behind the window |
| Project on screen | | which view they landed on |
| First shell running | | |
| First agent running | | which agent; PATH badge state on the card |
| Session ended | | who ended it, and why |

**Where they stopped.** Every stall over 30 seconds, in order:

| mm:ss | Where | How long | Ended by | Self-recovered? |
|---|---|---|---|---|
| | | | their own action / my one question / **COACHED** | yes / no |

`COACHED at mm:ss — I said: ""` — everything after this timestamp is weaker
evidence. **[required if it happened]**

**Never found** — things they hunted for and did not locate:

-

**Never touched** — what they went nowhere near in the whole session:

-

### 2. What they said — verbatim only **[required, at least one]**

Quotation marks, their words, with the clock. No paraphrase in this section. Mark
`[read aloud]` when they were reading the screen rather than talking to you.

- mm:ss — > ""
- mm:ss — > ""

Closing questions (`02-recruiting-message.md` §6):

- *What did you think this was for?* — > ""
- *If you never opened it again, what would the reason be?* — > ""
- *What would have to be true for this to replace what you use now?* — > ""
- *Anything to cut?* — > ""

After you told them the truth about anything you withheld during the session:

- > ""

### 3. Defect ledger — what a `product-reviewer` can act on

One row per defect. A row without a `where` is not actionable; a row without an
observation in section 1 is an opinion.

| id | Where (surface, and file if known) | What the user experienced | Class | Cost | Self-recovered | Stop the line? |
|---|---|---|---|---|---|---|
| U[n]-D1 | | | blocked / **wrong-info** / confused / slow / cosmetic | mm:ss lost, or "ended the session" | yes / no | yes / no |

- **blocked** — they could not proceed without help.
- **wrong-info** — the app stated something untrue (the most serious class, and
  the one `06-shell-mismatch-watch.md` exists for). Always quote the exact words
  on screen.
- **confused** — they proceeded, incorrectly or by luck.
- **slow** — they waited and said something about waiting.
- **cosmetic** — they mentioned it; it cost them nothing.

**Diagnostics record** — paste whole if they sent one, and say whether they
removed lines. If nothing broke, write `not asked — nothing broke`, which is
itself a result. **[required, one or the other]**

```
```

Read from the paste before interpreting anything: `Shell / configured` vs
`resolved`; `Agent commands / PATH read`; each agent's state; `last non-zero`
terminal exit; `Errors (n distinct)` and the `Incomplete` block.

### 4. What I think it means — **labelled as mine, kept short**

Interpretation. Argued from sections 1 and 2 only, and it must be possible to
disagree with it while accepting them.

-

Rewrite any sentence here that says "users". This is one person.

### 5. Against the criteria

Fill from `05-validation-criteria.md`. Do not re-word a criterion to fit the
session; if a criterion turned out to be badly framed, record that as an
amendment with today's date and leave the original standing.

| Criterion | Result | Evidence (section + mm:ss) |
|---|---|---|
| S1 installed unaided | pass / fail | |
| S2 running agent inside 5 min, uncoached | pass / fail | |
| S3 no unrecoverable stop | pass / fail | |
| S4 could say what it is for, unprompted | pass / fail | |
| Shell-mismatch fired | yes / no / n/a | |
| Stop the line | yes / no | |

### 6. Retention — filled in later, from the follow-ups

| | |
|---|---|
| Day 7 asked | date · reply verbatim: > "" · or **no reply** |
| Reopened unprompted? | yes / no / unknown |
| Days used in 14 | |
| Day 14 probe | date · reply verbatim: > "" · or **no reply → recorded as silent** |
| Final funnel state | used / silent / gone |

**A user who installed it and never opened it again is the strongest signal
available.** Write the silence down. It does not become "busy" because nobody
said otherwise.

### 7. The one question the next session should answer **[required]**

One sentence. Not a list. It is the question, not the fix.

-
