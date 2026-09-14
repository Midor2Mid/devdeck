# Session lifecycle — the restart prompt, and the `/clear` tax

Investigation, 2026-09-15. Two frictions the owner named: a running Claude Code
session that prints **"Update installed · Restart to apply"**, and the manual
`/clear` run to hold token cost down. Propose only — nothing here was built, and
no tracked file outside this one was touched.

A `product-reviewer` market scan runs in parallel and writes its own document.

---

## Verdict, first

**Queue behind the beta.** None of the options below makes a stranger's first
session *wrong* if absent, which is the roadmap's own second test, and each is a
fifth wave of pre-beta engineering under a new name. K6 fires **2026-09-22**;
five recorded sessions are due **2026-10-06**.

One exception is defensible and it is the smallest thing here: **O1**, roughly
fifteen lines, no new surface, no new signal, no new deck form — and it carries a
**live false-positive fix** that is the actual argument for it. It is still
*after* steps 10, 11 and 13, not instead of them. If that ordering is not kept,
the honest answer is **none before the beta**.

Two options — **O4** and **O5** — are **refused outright**, not deferred.

---

## 1. What the CLI emits — ESTABLISHED, and not from memory

The official docs do **not** carry the string. `code.claude.com/docs/en/setup.md`
says only that an update takes effect "the next time you start Claude Code", and
is silent on text, stream and timing. So the string was taken from the **shipped
binary on this machine** — `C:\Users\Admin\.local\bin\claude.exe`, native
installer, 209 MB PE32+, version `1.2.3`, mtime 2026-09-09 — by `grep -a` over
its bundled JS. An observation, not a recollection:

```
r(n,{color:"success",wrap:"truncate",children:["\u2713 Update installed",dt," \xB7 Restart to apply"]})
```

The exact text is **`✓ Update installed <version> · Restart to apply`**.

**And that is exactly why a detector must not read it.** It is not a line on
stdout. It is an **Ink component** — a React node rendered into the TUI frame,
inside an alternate screen, `wrap:"truncate"`, repainted every frame and
truncated to the pane's width. A narrow DevDeck pane receives
`✓ Update installed 1.2.4 · Restart to a…`. A resize repaints it. So the string
is undocumented, version-specific, *width*-specific, and arrives interleaved with
cursor-positioning escapes. Matching it is the shell-mismatch false negative
rebuilt with more moving parts.

Neighbouring strings confirm the feature's shape rather than a message's:
`"Press Enter to restart Claude Code."`, `"Claude Code will restart to apply."`,
`qt==="relaunching"`, `"Restarting Claude Code to apply the new model"`.

**Could not establish:** whether it repeats, and the exact lifecycle instant it
first paints. **Established:** it is suppressible (`DISABLE_AUTOUPDATER=1`); it
applies to the native and npm installs only (Homebrew/WinGet/apt/dnf do not
auto-update); and **the session keeps working** — the restart is advisory for the
running turn, mandatory only for the new version to take effect.

---

## 2. Is there a structural signal? — Partly, and §2a is now closed

### 2a. No hook fires for it. Exhaustively, not merely "undocumented".

The complete `notification_type` union is a literal array in the binary:

```
["permission_prompt","idle_prompt","auth_success","elicitation_dialog",
 "agent_needs_input","agent_completed","elicitation_url_dialog",
 "worker_permission_prompt","push_notification","computer_use_enter",
 "computer_use_exit","quota_auto_resume_fired","quota_auto_resume_stale",
 "quota_auto_resume_disabled"]
```

**No update, restart or version member.** Not "the docs are silent" — absent from
the shipped enumeration. The hook event set (`SessionStart`, `SessionEnd`,
`UserPromptSubmit`, `Stop`, `StopFailure`, `PreToolUse`, `PostToolUse`,
`Notification`, `PreCompact`, `SubagentStart/Stop`) carries nothing either. The
statusline JSON carries `version` but no update-pending field — and a statusline
command is a *child of the CLI*, so DevDeck could not read one without writing
into the user's own settings and then parsing its own child's output.

**So Q1's argument does not extend to this fact.** Q1 beats the screen-scrape for
attention because the CLI genuinely *declares* attention. It declares nothing
here. "Just add it to the hook wiring" is a string match wearing a hook's
clothes.

### 2b. There IS an on-disk signal, and it has no prose in it

The native installer does not patch in place. It renames the running binary aside
and moves the new one over it — `${e}.old.${Date.now()}` in the bundle, and on
this machine:

```
claude.exe                        Sep  9 09:53
claude.exe.old.1788488277992      Sep  3 06:40
```

So: a pane whose agent launched *before* the mtime of the executable it resolved
is running a retired binary. DevDeck already owns both halves —

- `src/main/which.ts` already resolves a command's first token to a real file on a
  **login-shell** PATH, async, under a deadline, with a UNC/device-namespace guard
  (26.6 s of frozen main process for one unreachable UNC address is why). It is
  the exact capability, already hardened — the "use what the API gives you instead
  of inspecting text" shape this codebase insists on.
- `markLaunched(termId)` stamps a launch instant on **every** agent launch path
  (`src/renderer/src/store.ts:998`), and `tests/signalSites.test.ts` mutation-verifies
  that no launch path skips it.

What it proves is narrower than the CLI's own sentence, and the copy must say the
narrower thing: *the file this session launched from has been replaced.* Not "an
update is installed" (a manual `claude update` produces it too), and not "restart
required". Narrower and true beats matching and brittle.

### 2c. `/clear` already arrives at DevDeck — and is thrown away

`SessionStart`'s payload, from the binary:

```
hook_event_name:"SessionStart", source:n, agent_type:d, model:p, session_title:o, ...
```

with `source` from `["startup","resume","clear","compact","fork"]`.

DevDeck **already wires `SessionStart`** (`docs/attention-hooks.md`, shipped in
`b7e2d69`) and already accepts it on the token-guarded, pane-matched `POST /hook`
route. But `HOOK_EVENT_STATES.SessionStart` is `null`
(`src/shared/attention.ts:119`), so `parseHook` returns `{kind:"ignored"}` and
`source` is never read (`src/shared/attention.ts:240`). **A `/clear` is reaching
DevDeck today, correlated to the right pane, and being discarded.** Cheapest fact
on this page.

---

## 3. What DevDeck sees today

- **Screen classification** — `src/renderer/src/store.ts:1390` `onPtyData`: BEL →
  `attention` (:1487, and replayed chunks can never ring), output → `working`
  (:1573), `DEFAULT_IDLE_MS = 6000` silence → `waiting` (:1584). A separate
  wall-clock stall at `STALL_MS = 120_000` (`missionTail.ts:149`).
- **One derivation** — `wantKind(i, now, seen)` in
  `src/renderer/src/tileState.ts:408`, returning
  `WantKind = "attention" | "stalled" | "waiting"` (:331), ranked
  `{attention:0, stalled:1, waiting:2}` (:369). **Its first test is `hasProcess`.**
  `signalSites.test.ts` pins `wantKind(` to exactly one caller (store.ts) and
  mutation-checks that the call site passes real facts, not folded constants.
- **Declared axis** — held only for `attention`/`waiting`; a declared `working`
  holds nothing, so a half-wired hook falls back to the screen rather than
  sticking. Provenance is a *verb* ("says it needs you"), never a mark.
- **Real token cost, already** — `src/main/usage.ts` (note: there is **no**
  `src/renderer/src/usage.ts`) parses `~/.claude/projects/<encoded>/*.jsonl`
  directly, dedupes streamed content-block rows on `message.id`+`requestId` (a
  1.9x inflation, since fixed), and prices per **model id**.

**But the granularity is the load-bearing limit.** `costInWindow(projectPath,
from, to)` is per **project directory + time window, not per pty session** —
its own comment says *"Claude Code names transcripts by project, not by pty"*.
`runRecorder.ts` therefore marks records `exclusive: false` when another session
overlapped that directory.

**And the fix for that is already delivered and unread.** The hook carries
`transcript_path` all the way to `DeclaredSignal.transcriptPath`
(`src/main/attention.ts:218`) — and **nothing in the codebase reads it.** That is
the single largest piece of unexploited plumbing already in the tree.

---

## 4. What a restart costs today — much less than assumed

This reorders the whole proposal. **DevDeck already has a complete
restart-recovery path**, built deliberately:

- `paneHold: Record<string, "resume" | "restart">` (`store.ts:230`). A process
  that exits is **not** spawned over — the corpse and its output stay.
- `src/renderer/src/components/TerminalPane.tsx:569` renders the dead bar: *"This
  process exited. Its output is above."* with **Resume** / **Start fresh**.
- **Resume runs `claude --continue`** — `settings.ts:182` ships
  `resumeArgs: "--continue"` on the `claude` and `claude-opus` presets, and
  `canResumeAgent` (`TerminalPane.tsx:147`) gates the two-button form on it so the
  buttons are never two words for one command.
- `releaseHold` (`store.ts:3390`) re-logs usage correctly across the gap: it
  closes the dead run's event *before* opening the new one, so the dead interval
  is not billed twice.
- `deckKeyStatus` **derives** `not-running` rather than storing it (`deck.ts:42`),
  so a held pane cannot paint as a resting live agent.
- On restart: cwd, launch command (`termInit`, persisted per termId), shell, model
  env, decrypted API key, project env and the three `DEVDECK_*` hook variables are
  **all re-supplied automatically**.

**So a restart costs: notice it, one click.** What is genuinely lost is narrower
than it feels: the pty's 256 KB replay buffer (deleted by `killPty`), and any
unsent keystrokes. The conversation itself comes back via `--continue`.

Two honest gaps: `claude-yolo` and `gemini` ship `resumeArgs: ""`, so those panes
get a cold **Restart** and a new conversation; and the dead bar is only reachable
while the pane is **mounted** — there is no restart affordance in Mission
Control, the palette, or a shortcut.

**The missing piece is only the *noticing*.** Everything after it is built.

---

## 5. Options, ranked and costed

### O1 — Read `source` off the `SessionStart` already arriving. **~15 lines, ½ day.**
Add `source` to `ParsedHook`, keep the result `{kind:"ignored"}` (it declares no
state and must not), and emit one activity-feed row for `clear` / `compact`:
*"context cleared"*. No new signal, no `WantKind`, no deck form, no panel, nothing
derived twice. It cannot lie: unwired hook → the row never appears, which is the
declared axis's own degrade-to-silence rule.
**Buys:** the `/clear` and auto-compact moments become visible in the record the
user already reads, beside the costs `usage.ts` already computes. That is the only
honest thing DevDeck can say about context churn without a context-fill number it
does not have and is forbidden to surface (`ROADMAP.md:408`).
**Rides along for free — and is the real argument:** `NOTIFICATION_STATES`
(`shared/attention.ts:137`) is missing four shipped members.
`worker_permission_prompt` and `computer_use_enter` are genuinely attention;
**`push_notification` and `computer_use_exit` are not, and today they fall through
to the event default and paint a false `attention`.** That is a live
false-positive in the worst class this product has, and it is a four-line map
edit with a test.

### O2 — The mtime detector, surfaced *only inside the pane*. **2–3 days.**
`which.ts` + `markLaunched`, compared on a cheap timer in main. When the resolved
executable's mtime is newer than the pane's launch instant, the pane shows a quiet
line in the dead bar's slot — no accent — reading *"The `claude` on disk has
changed since this session started. Restart picks it up."* with **Restart** /
**Resume**, the buttons that already exist. It stays **out of `wantKind`** (O4).
**Cost is real, not trivial:** "which executable did this pane resolve" must
survive a shell alias, a `.cmd` wrapper, a pane launched before the probe existed,
and a non-native install — and must go **silent** rather than guess in every one
of those.

### O3 — Documentation only. **1 hour.**
A paragraph in `docs/attention-hooks.md`: the CLI auto-updates, the restart is
advisory, **Resume** runs `--continue` so the conversation comes back, and
`DISABLE_AUTOUPDATER=1` stops the prompt entirely for anyone who would rather pick
their own moment. Costs nothing and is true today.

### O4 — A fourth `WantKind` ("update"). **REFUSED.**
It is the right *seam* — going through `wantKind` is what the single-derivation
rule demands — and it is still wrong. A session wanting a restart **has a process,
is not blocked, and is asking for nothing**; it is working fine. Putting it in the
count that the deck bar, the taskbar badge and `Ctrl+Shift+J` all read makes
"which agent needs me" start returning sessions that do not need you — diluting
the one claim the product has left, from inside the very derivation built to stop
eleven surfaces disagreeing. `WantKind` is for **blocked**. This is **stale**.
Different fact; it belongs on that ladder no more than `not-running` belonged in
`AgentStatus`.

### O5 — Reading the pane's bytes for "Restart to apply". **REFUSED.**
See §1: truncated by pane width, undocumented, version-specific, interleaved with
escapes — and trivially forged by any `cat` of a log containing the phrase.
Refused in advance, in the same register as the ACP transport.

### Not proposed at all
**Any pty write that restarts the agent for the user** — an auto-restart, or
sending `Enter` to the CLI's own restart prompt. A pty write must come from a
token the app recorded and be spendable once; a supervisor typing into a live
agent because it inferred a prompt was on screen is the exact inversion of that.
The user clicks Restart.

**A context-fill percentage.** No per-pane context number exists outside the
statusline (a child of the CLI) and the transcript internals the docs explicitly
call unstable. `ROADMAP.md:408` puts **context fill** off the path behind *three
users installed*, and nothing found here changes that.

**Wiring `transcriptPath` into `usage.ts` for per-session cost.** Genuinely the
best idea in the tree and it is the *same* forbidden square — cost surfacing,
trigger: three users installed. Recorded here so the next reader finds it, and
left alone.

---

## 6. The one I would do first

**O1, and only after steps 10, 11 and 13.**

It is not a feature. It is fifteen lines that stop discarding a correlated event
DevDeck already receives on a route it already ships, plus a four-line correction
to a map that can currently paint a **false attention**. That correction is the
argument: a false attention claim is the worst defect class this product has, and
one is sitting in `NOTIFICATION_STATES` right now, found only because this
investigation read the binary's own enumeration.

**O3** rides along in the same hour, being a paragraph and true.

**O2 waits for a recorded session to ask for it.** It is a good detector —
structural, silent when unsure, no prose anywhere in it — and it is still two to
three days of main-process work on a pane surface, for a friction §4 measured at
*one click*. That trade cannot be justified seven days before K6. If a beta user's
record shows them stranded on a stale binary or losing work to a restart, it goes
to the top with evidence behind it, which is worth more than shipping it now on
the author's own annoyance.

If steps 10, 11 and 13 are not done first, the answer is **none before the beta**.
