# The phone approve/deny card — audit, and the ten minutes that settle it

**ROADMAP step 7.** Owner `qa`. Written 2026-09-04 against `7286fc5`.

The card has still never rendered on a physical phone, and nothing in this
document changes that. What it does is spend everything findable *without* one, so
the ten minutes with one are spent on the four things only a phone can answer.

Two labels are used throughout and never mixed:

- **EMULATED** — Chrome DevTools device emulation (`Emulation.setDeviceMetricsOverride`,
  `mobile: true`, `deviceScaleFactor: 3`, touch emulation on) driving the real
  `CLIENT_HTML` served over loopback, with the real `@xterm/xterm` assets. A
  headless Chromium at phone size is **not a phone**: no soft keyboard, no real
  touch, no Safari, no sunlight. "Rendered at 390×844" and "works on a phone" are
  different claims.
- **REAL APP** — the built Electron app, launched on a scratch `userDataDir`, with
  a real pty and main's real classifier. The remote server was **never started**,
  so nothing was bound on any interface and the token gate was not touched.

---

## 1. What was actually observed

### 1.1 The mint is real (REAL APP)

Method: launched the built app on a scratch profile, created a real `cmd.exe` pty,
printed a verbatim-shaped Claude Code permission prompt into it (pointer glyph,
three numbered options, `(esc)` marker), pushed a session snapshot flagging that
terminal as an agent in `attention` via `window.api.mobile.syncSessions`, then read
main's own answer back with `window.api.decisions.forTerm`. That is the same
`PendingDecision` `withDecisions` projects onto the wire.

| Property | Observed |
|---|---|
| Decision minted | `dec:qa-phone-1:3bfa4b66…f3204`, `kind: "menu"` |
| Answer tokens | `Approve → "1"`, `Deny → "\x1b"` — main's, not the client's |
| Idempotent while the screen holds | same id on a second push ✓ |
| Attention gate | status `working` → `null` ✓ |
| Re-arm after attention returns | same id (screen unchanged) ✓ |
| Screen moved on | **new id minted**, old id gone from `pending` |

The last row matters and is covered in §4.

### 1.2 The card itself (EMULATED, 390×844 / 375×667 / 360×800 / 320×568 / 844×390)

Fed the real minted decision, and separately a realistic 16-line Claude tail.

**In portrait the card is good.** Question at 15px/600 weight at **13.7:1**
contrast, the raw excerpt beneath it, and two 44px-min-height buttons at the
bottom of the column where a thumb is. `elementFromPoint` at the centre of each
button returns that button. Both buttons fully inside the viewport at every
portrait width tested, down to 320×568. `#decision` sits in the fixed flex column,
not in a scroll region, so **the card cannot be scrolled away** — scrolling the
terminal does not move it.

Everything below is a defect found in that same pass.

---

## 2. Confirmed defects

Ranked by damage × likelihood for one developer answering agents from a phone.

### D1 — In landscape the terminal painted over the question you are approving *(FIXED)*

**Confirmed by hit-test and by screenshot.** At 844×390 the `#term` box measured
**12px tall** against a `.xterm` canvas of **120px**. `#term` had no `overflow`
rule and nothing refits xterm when the card appears, so the canvas overflowed and
painted **114px of terminal output straight over the card's question and raw
excerpt** — while Approve and Deny stayed fully tappable.

`document.elementFromPoint` at the centre of the card's question returned
`div.xterm-screen`. That is the whole finding: **you could tap Approve on a prompt
you could not read.**

Fixed with `#term{overflow:hidden}` (`src/main/server.ts:816`) plus `flex:none` on
`#decision` and `.keys` so the answer is never what the flex column squeezes.
After: `elementFromPoint` returns `div.q` and `pre.tail`; the quick-keys row is
back to 45px from a squeezed 34px.

The cost is deliberate: with a card up in landscape the phone terminal is a 12px
sliver. Clipping the terminal is the lesser harm. The durable fix is to refit
xterm to its box — which cannot be done until D6 is decided.

### D2 — A tap that is never answered left the card permanently dead *(FIXED)*

**Confirmed.** With the server silent after a `{t:"choice"}`:

| | before | after |
|---|---|---|
| note, immediately | *(nothing at all)* | `Sending…` |
| buttons, immediately | disabled | disabled |
| note, after 11s | *(nothing at all)* | `Response unconfirmed - check the terminal before answering again.` |
| buttons, after 11s | **still disabled** | re-enabled |

And with the socket dropped mid-tap, then reconnected (`status: connected`, card
still on screen, prompt still pending):

| | before | after |
|---|---|---|
| note | *(nothing)* | `Connection dropped - the answer may not have arrived. Check the terminal.` |
| buttons | **still disabled** | re-enabled |

So on a flaky phone link the prompt became **unanswerable from the phone, with
nothing said**, until you navigated away and back. This is the single most likely
defect to bite in real use, because a phone link dropping is the normal case.

Re-enabling is safe, and it is main's once-only rule that makes it safe:
`consumeDecision` refuses a second spend of the same id (`Already answered.`) and
refuses one whose screen has moved (`moved-on`), so a second tap can never put a
second keystroke into the agent. What the note has to be honest about is that the
*first* tap's fate is unknown — and it now is.

Also fixed: a tap on a closed socket used to arm the disabled state over a message
`sendMsg` silently discarded. It now refuses with `Not connected - nothing was
sent. Check the terminal.`

### D3 — Deny silently changes from Esc to a digit at phone terminal widths *(NOT fixed — see D6)*

**Confirmed, in logic, by test** (`tests/mobileApproval.test.ts`).
`detectApproval` over the same prompt, hard-wrapped at decreasing column counts:

| cols | Approve | Deny |
|---|---|---|
| 156, 120, 100, 80, 60 | `1` | `\x1b` (Esc) |
| **46, 40, 34** | `1` | **`3`** |

At 46 columns the trailing `(esc)` wraps off the end of its option line,
`escMarker` goes false (`src/shared/approval.ts:62`), and the classifier falls
back to the numbered No option (`:71`). Esc rejects and returns. `3` selects "No,
and tell Claude what to do differently" — a different thing to do to a live agent.

**46 columns is not hypothetical.** `fit()` (`src/main/server.ts:1207`) measures
the phone's terminal box and sends `{t:"resize"}` to the host pty 60ms after you
open a session; at a 390px-wide phone that computes to roughly 46 cols × 17 rows.
The classifier fallback itself is deliberate and separately tested
(`tests/approval.test.ts`); what was never written down is that **a terminal width
can trigger it, and the phone is what narrows the terminal.**

This is why the protocol tests Deny specifically, and looks at what the agent
does — not just at whether the card went away.

### D4 — The header overflowed every portrait phone width *(FIXED)*

**Confirmed by measurement at four widths.** The header's content was a fixed
**431px** — brand + five nav tabs + status — against viewports of 320–390px.
Nothing shrank. Consequences: the whole page scrolled sideways, the `DB` tab was
off-screen at 320px, and `#status` — whose only job is to say
`disconnected - retrying` — had its right edge at **x=431 on a 390px screen**.

The one indicator that explains a tap that did nothing was never on screen.

Fixed at `src/main/server.ts:829`: the tabs scroll inside the header
(`flex:1; min-width:0; overflow-x:auto`), the brand and the status never move
(`flex:none`). After: page overflow `false` at 390, 375, 360 and 320; status right
edge 376 / 361 / 346 / 306.

### D5 — The raw excerpt opened at its oldest line, hiding the deny option *(FIXED)*

**Confirmed.** The excerpt is `lastLines(tail, 16)` in a box that fits about 12
lines (`scrollHeight 347` vs `clientHeight 252` at 390×844; 381 vs 169 at
320×568 — under half). It opened at `scrollTop: 0`, so the **oldest** line was on
screen and the option lines, including the `(esc)` line that Deny actually sends,
sat below the fold of an inner scroll box that looks like static text.

Fixed with `pinTail()` (`src/main/server.ts:1147`), called on render and again on
`resize` — a rotation re-lays-out the box without re-rendering the card, so a
`scrollTop` set against the old height sits mid-excerpt. After: `scrollTop 95/95`
in portrait, `179/178` after rotating to landscape, and the `(esc)` line is inside
the visible band.

### D6 — Opening a session on the phone resizes the host pty *(D3 half FIXED 2026-09-05; the rest stands)*

**Confirmed by code, consequences only observable on a phone.**
`fit()` sends `{t:"resize", cols, rows}` unconditionally 60ms after attach, and on
every `window.resize`. The pty is multi-client with one size, so:

1. The agent's terminal is resized from (say) 156×40 to ~46×17. Claude Code
   redraws its whole TUI at the new width.
2. That redraw changes the tail, which changes `tailHash`, which re-mints the
   decision under a **new id** — and the card the phone was already showing
   carries the **old** id. A tap in that window resolves to no owner and is
   refused (§4).
3. Deny's meaning changes, per D3.
4. **The desktop pane's pty is resized too.** The terminal you come back to at
   your desk is 46 columns wide.

The roadmap already predicted this mechanism, for a different cause: the
2026-08-31 decision refusing a split stage says halving `cols` makes the agent
"wrap its permission prompt, and `detectApproval`'s `(esc)` + tail-position rules
stop matching — Approve/Deny then vanishes from the tile, the Overview row **and**
the phone, silently." That argument was made about a half-width desktop pane. It
applies to the phone, at a quarter of the width, and nobody connected the two.

**Not fixed here, because every fix is a real tradeoff:**

| option | cost |
|---|---|
| Stop sending `{t:"resize"}` from the phone | the phone shows a 156-col terminal in a 46-col window: unreadable wrapping |
| Never send a resize that *shrinks* the pty | same, whenever the desktop pane is wider |
| Resize only when no decision is pending | does not help — the resize is what destroys the decision |
| Resize, then re-mint, then re-render | correct, and the largest change: the card has to survive its own id changing |

**Ruled 2026-09-05, and none of the four options above was taken.** All four
treat the *resize* as the defect. It is not: the resize is legitimate, and the
defect was that `escMarker` going false silently changed what Deny **does** —
the same button, two different acts, no signal.

The fix is in the classifier (`src/shared/approval.ts`): an option is not one
line, so each option is now re-joined with the lines it wrapped onto before the
`(esc)` marker is looked for. Deny sends Esc at 46, 40 and 34 columns, and a new
invariant test asserts the property that was actually violated — **Deny means the
same thing at all eight tested widths**, because whatever Deny means it must not
depend on how wide the terminal happens to be. The join is conservative: a
continuation is only a line between two options that matches no option itself and
is not a question, and every existing gate (`live`, YES/NO, question-or-marker)
still has to pass.

**What this does NOT fix, and what protocol step P4 is still for:** points 1, 2
and 4 of D6 stand — the phone still resizes the host pty, a redraw can still
re-mint the decision under a new id, and the desktop pane is still left at ~46
columns. And the open question is unchanged, because only a phone can answer it:
a naive hard-wrap now classifies correctly, but **a real TUI redraw is not a hard
wrap**. If Claude Code reflows into a shape this classifier does not match at all,
the card will not appear — which is a visibly absent card, not a wrong keystroke,
and that is the better failure of the two.

### D7 — `dvh` with no `vh` fallback, two rules under the comment explaining why *(FIXED)*

`#app` carries the documented `height:100vh; height:100dvh` pair. `#decision .tail`
carried only `max-height:30dvh`. A browser that does not know `dvh` (iOS Safari
before 15.4) drops the declaration outright.

**Confirmed by simulating it** (injecting `max-height:none`): the excerpt grows to
348px (383 at 320px wide) and the card to 447–482px. On a 320×568 phone the
quick-keys row is crushed from 45px to **8px**. The answer buttons stay in the
viewport and stay hittable, so the approve/deny action survives — this is a
degradation, not a break. Fixed anyway, at `src/main/server.ts:860`, because it is
two characters and the pattern was already written down.

### D8 — `theme-color` was from a palette the client no longer uses *(FIXED)*

`#181725` — an indigo, against a client whose surfaces are `#1b1a18`/`#211f1c`.
The phone's browser chrome tinted itself a colour from nowhere. Now `#211f1c`.

### D9 — Nothing parsed the phone client, ever *(FIXED, with a test)*

`CLIENT_HTML` is a template literal inside `src/main/server.ts`. `tsc` does not
parse it. `electron-vite` does not parse it. No test loaded it. **A syntax error in
the phone client would ship green and surface only on a phone, as a blank page.**

`tests/mobileApproval.test.ts` now extracts it and compiles the inline `<script>`
with `node:vm`'s `Script` (compile, no execute). Mutation-checked: introducing
`function pinTail({` fails the test; reverting passes it.

---

## 3. Judgement calls, with a recommendation each

Not fixed. Each changes something a person should decide.

**J1 — "NEEDS YOU" is below the fold once there are more than a few sessions.**
Confirmed: with 14 sessions the badge sat at `y=1223` on an 844px viewport, index
13 of 14. The list is grouped by project in insertion order with no attention-first
sort (`renderList`, `src/main/server.ts:1084`). The desktop has an attention-first
triage inbox; the phone does not. *Recommend: sort sessions carrying a `pending`
decision to the top of the list.* Small change, information-architecture decision.

**J2 — Pinch-zoom is disabled.** `maximum-scale=1, user-scalable=no`
(`:776`) — a WCAG 1.4.4 failure. It is presumably there to stop iOS auto-zooming
when you focus a 15px input. *Recommend: raise every text-entry control (including
the monospace textareas) to 16px and drop `maximum-scale`/`user-scalable`.* Left
alone because 16px monospace changes the Files and HTTP views' layout, which is
not this task's business.

**J3 — Tap targets outside the card.** The card's own buttons are correct (44px
minimum, and the only controls in the client that are). Measured everything else:
nav tabs **74×27 / 34×27**; quick keys **32–46 × 37** in portrait and **× 26** in
landscape; header buttons ~32px. `esc` — a denial keystroke — is a 46×26 target in
landscape. *Recommend: 44px minimum on the quick-keys row first, since that is the
row you use while answering.*

**J4 — The raw excerpt is the lowest-contrast, smallest text on the most important
card.** Measured contrasts (EMULATED, computed from `getComputedStyle`):

| element | ratio | size |
|---|---|---|
| card question | 13.73:1 | 15px/600 |
| card **raw excerpt** | **4.84:1** | **12px** |
| Approve button | 6.07:1 | 15px/600 |
| Deny button | 13.73:1 | 15px/600 |
| session status line | 4.58:1 | 11px |
| `#status` | 4.58:1 | 12px |
| badges (`CLAUDE`, `NEEDS YOU`) | 5.30:1 | **9px** |

**Nothing fails WCAG AA.** But the excerpt is the text you are meant to read before
approving a destructive command, and it is at the AA floor at 12px; the badges pass
on ratio and fail on size at 9px. *Recommend: lift the excerpt to `--tx` and 13px,
and the badges to 11px.* Sunlight-grade legibility is **not something emulation can
settle** — see protocol step 7.

**J5 — You cannot answer from the list.** The badge says NEEDS YOU; answering means
opening the session, which is what triggers D6. *Recommend: deciding D6 first — if
the resize goes away, answering from the list becomes the obvious best flow.*

**J6 — Cursor-addressing escapes glue two screen lines into one.** Observed on the
real mint: the question came back as `"⎿  Running…Do you want to proceed?"`, because
`cleanTail` strips `\x1b[12;1H` without leaving a line break (`src/shared/tail.ts`).
Real Claude Code uses cursor addressing constantly, so the card's headline can be a
concatenation of two screen lines. *Recommend: treat CSI cursor-movement sequences
as a newline rather than deleting them — but not casually: `cleanTail` feeds the
classifier's tail-position rules and every `tailHash`, so changing it changes which
prompts are detected and which decisions bind. That is a `technical-director` call.*

---

## 4. The refusal path, and which refusal you will actually see

This is the part most likely to be wrong on real hardware and hardest to notice, so
be precise about the mechanism.

A decision's id **is** its screen: `dec:<termId>:<sha256 of the exact 16 lines>`
(`src/main/decisions.ts`). Main re-derives every session's decision **once a
second** (`REFRESH_MS`, `:179`). `consumeDecision` (`:244`) checks, in order:
already spent → not in `pending` → not one of the offered tokens → the live digest
no longer matches (`moved-on`, `:250`).

Three refusals reach the phone as `CHOICE_REASONS` copy, verbatim:

| server outcome | what the phone shows |
|---|---|
| `unknown` | `That prompt is no longer on screen.` |
| `consumed` | `Already answered.` |
| `moved-on` | `The terminal moved on - check it before answering again.` |

**The one the code was written around is the rarer of the two.** When the screen
changes, the 1s refresh replaces `pending[termId]` with a *new* decision under a
new id, and the old id is gone from `pending` altogether. A tap carrying the old id
then resolves to no owner and comes back as **`unknown` — "That prompt is no longer
on screen."** `moved-on` only fires inside the ≤1s window between the screen
changing and the next refresh tick, i.e. it is a race, not the normal path. If the
new screen has no detectable prompt at all, `clearDecision` also drops the spent
record — so the same message.

Both messages render correctly and both re-enable the buttons for a retry
(EMULATED, at 390×844, 18px note block at `y=716`, inside the viewport).

**What follows for the protocol:** the message to expect when you answer a card
whose terminal has moved on is *"That prompt is no longer on screen."* If you see
*"The terminal moved on"* you have hit the narrow race, which is also correct. If
you see **neither**, and a keystroke reached the agent, that is the bug this whole
mechanism exists to prevent and it is a release blocker.

---

## 5. The physical-phone protocol — ten minutes

Do these in order. Each step names the failure it is checking for and what to do
when it fails. Steps 1–3 are setup; **6 and 7 are the ones only a phone can
answer**, so do not run out of time before them.

### Setup (about 3 minutes)

**S1 — Turn remote on, privately.**
Settings → **Remote access (mobile)**. Tick **Enable**. Under **Network** pick
**Tailscale / VPN** if you have a tailnet up — it is the only option that does not
expose a full terminal to everything on your Wi-Fi. If you pick **Local network**
you get a `0.0.0.0` bind: every interface on this machine, and the panel will warn
that the link is plain `http://`. Do that only on a network you trust.
*Fails if:* the panel shows a red `No tailnet address found. Start Tailscale, or
choose Local network.` → start Tailscale, or accept Local network knowingly.
*Watch for:* the `⚠ Tailscale came up after the server started` warning. If it
appears, press **Restart remote** — otherwise you are bound wide while the URL
shows a private address.

**S2 — Pair the phone.**
The panel shows a **QR** and the URL, `http(s)://<host>:<port>/?token=<pairing token>`.
Scan it. The page drops the `?token=` from the address bar on load and the device
token becomes an HttpOnly cookie, so the phone never holds the token in page script
and it does not linger in history.
*Fails if:* `Unauthorized` → the pairing token was regenerated since the QR was
drawn, or the device expired past **Device expiry**. Re-open the panel and re-scan.
*Fails if:* nothing loads at all → wrong interface. Check the **Server:** line
says what you expect.

**S3 — Get an agent to ask you something.**
On the desktop, start a Claude session in a real project and give it something that
needs permission — `delete the build directory`, or any `rm`. Leave the pane
**off-screen** (switch to another project or another view). That is the primary
case: main's 1s refresh exists because a pane you are not looking at takes no
status transition.
*Fails if:* the phone's session list shows the session but no **NEEDS YOU** badge →
the classifier did not match. Screenshot the desktop terminal and note its column
count; that is D3/D6 territory.

### The four things only a phone can settle (about 7 minutes)

**P1 — Does the card render, and is it readable? (2 min)**
Tap the session on the phone. Look for, in this order: the question headline; the
raw excerpt beneath it; two large buttons at the bottom.
- Is the excerpt showing the **option lines** (`1. Yes`, `(esc)`), or older
  scrollback? It should be scrolled to its newest end (D5).
- Is anything painted **over** the card? (D1 — fixed, but this is the confirmation.)
- **Now rotate to landscape.** The terminal should become a thin sliver above an
  intact, readable card. If terminal text is sitting on top of the question, D1 has
  regressed and it is a blocker.
- Take a photo of the card. It is the first real image of this feature.

**P2 — Does the soft keyboard bury the answer? (1 min)**
This is the `dvh` fix from 0.11.1 and it has never been tested, because a headless
Chromium has no soft keyboard. With the card up, tap the `type, then Send` input at
the bottom to raise the keyboard.
*Pass:* the layout does not shrink, and you can still scroll the column so both
buttons are reachable.
*Fail:* the buttons are under the keyboard and no amount of scrolling reaches them
→ `100dvh` is not doing its job on this browser. Note the phone, OS version and
browser; that decides whether a `visualViewport` handler is needed.

**P3 — Approve, and watch the agent. (1 min)**
Tap **✓ Approve**. Expected: `Sending…` briefly, then the card disappears and
`Answered ✓` appears. On the desktop, the agent proceeds.
*Fail:* the card goes away but the agent does not proceed → the keystroke did not
land. *Fail:* `Sending…` sticks for 10s and turns into `Response unconfirmed` →
the link is slow or the ack was lost; check the desktop before tapping again.

**P4 — Deny, and watch what the agent actually does. (1 min) — the important one**
Get a second prompt (ask the agent to do the same thing again). Tap **✕ Deny**.
*Pass:* the agent rejects and carries on — the same thing pressing Esc does at the
desk.
*Fail, and this is D3:* the agent instead opens a "tell Claude what to do
differently" text input and sits waiting for typed input. That means the phone's
own resize narrowed the terminal past 46 columns, `(esc)` wrapped off its line, and
Deny sent the digit `3` instead of Esc. **Report the desktop terminal's column
count before and after you opened the session on the phone** — that number is what
decides D6.

**P5 — The refusal path, deliberately. (1 min) — the second important one**
Do not wait to hit this by accident.
1. Get a prompt so the card is on the phone.
2. **Answer it at the desk instead** (press `1` in the desktop terminal), or type
   anything into that terminal so the screen moves on.
3. Now tap **✓ Approve** on the phone.

*Pass:* the card is refused, with **`That prompt is no longer on screen.`** (or, if
you are quick, `The terminal moved on - check it before answering again.` or
`Already answered.`) — and **nothing is typed into the agent.** Check the desktop
terminal: the agent must not have received a stray `1`.
*Fail, and this is the release blocker:* a digit reaches the agent and lands in
whatever it asked next. If that happens, stop and record the exact sequence — this
is the failure the whole mint/spend/`tailHash` design exists to prevent.
*Also fail:* the phone shows nothing at all after the tap. Every refusal is
supposed to say something; silence is how you get a second tap.

**P6 — The dropped link. (1 min)**
Turn the phone's Wi-Fi off (or walk out of range) with a card up, then tap
**✓ Approve**.
*Pass:* `Not connected - nothing was sent. Check the terminal.` — and the buttons
stay usable.
Then bring the network back and tap again.
*Pass:* it works, or it is refused with a reason. *Fail:* the buttons are greyed
out and nothing is said — D2 has regressed.

**P7 — Outdoors, thirty seconds.**
Take the phone into direct daylight with a card up. Can you read the **raw
excerpt** (12px, 4.84:1)? Can you read the `NEEDS YOU` badge (9px)? This is the
only way to answer J4; a monitor indoors cannot.

### Afterwards

**Turn remote off.** Settings → Remote access → untick **Enable**. If you paired a
phone you would rather not leave paired, revoke it in the device list on the same
panel — revoking closes its live socket, not just its row.

---

## 6. What this method could not see

Stated plainly, because an honest gap is worth more than a fabricated pass.

- **A soft keyboard.** The `dvh` fix from 0.11.1 is still unverified. Protocol P2.
- **Real touch.** Everything here is `elementFromPoint` and synthetic clicks. A
  44px target that measures 44px can still be hard to hit next to a screen edge.
- **Sunlight.** Contrast ratios are computed, not experienced. Protocol P7.
- **Real Safari and real Android WebView.** Emulation is Chromium in every case, so
  the `dvh` support question (D7) was *simulated* by dropping the declaration, not
  observed on a browser that lacks it.
- **A real TUI reflow.** D3's evidence is a hard wrap of the prompt text. Claude
  Code redraws with cursor addressing; whether the card survives a real reflow to
  46 columns is protocol P4's job.
- **The pty resize's effect on the agent (D6).** Only a phone attached to a real
  agent shows it.
- **Notification wake-up.** `new Notification(...)` on a `file://` renderer under
  `setPermissionCheckHandler(() => false)` is HANDOFF §4's open F9 and is untouched
  here. The phone client's own notification path additionally requires a secure
  context, which a self-signed cert does not provide.
- **The served page under a real bind.** The remote server was deliberately never
  started outside the test suite, so nothing was exposed. `tests/server-remote.test.ts`
  covers the serve-and-authenticate path (it starts a real server on `bind: "lan"`
  during the run); the loopback harness covered the client.

---

## 7. Regression coverage added

`tests/mobileApproval.test.ts` — 16 assertions in two halves:

- **The classifier at a phone's width.** Esc for Deny at 156/120/100/80/60 columns;
  the digit `3` at 46/40/34; the card still appears at 46. This is real logic, and
  it is the test that turns D3 from a claim into a fact.
- **The client HTML.** Extraction is valid (no `${` interpolation), the inline
  script **compiles** (`node:vm`, mutation-checked), and each fix above has a guard
  naming the observed failure it prevents: `#term{overflow:hidden}`, `flex:none` on
  the card and the keys, the header's `flex:1/min-width:0/overflow-x:auto`, the
  `30vh`/`30dvh` pair, the 44px buttons, the theme colour, `clearSubmit` on both the
  timeout and the close path, the closed-socket refusal, `Sending…`, and `pinTail`
  on render and on resize.

`tests/server-remote.test.ts` — one assertion updated. It looked for
`p.options[Number(b.getAttribute('data-i'))].send` as a single inline expression;
the tap handler now reads the option *before* re-rendering, because the re-render
detaches the very button whose `data-i` the old form read afterwards. The property
the test pins is unchanged and now asserted in two halves.

`npm run typecheck` zero. `npm test` 132 files, 1652 passed, 1 skipped.
