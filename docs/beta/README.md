# The private beta — ROADMAP step 9

**State on 2026-09-04: nobody has been contacted. These are materials, not a
report.** Every file here was written before the first user existed, on purpose:
the criteria have to be fixed in advance or they will be adjusted afterwards to
fit whatever happened.

The milestone is **5–10 real external users**, recruited one at a time, every
install watched, every first session recorded verbatim. Not a launch. Not
revenue. Not installs.

## The files

| File | Use it when |
|---|---|
| `01-who-to-approach.md` | Deciding whether a specific person is a candidate. Four archetypes, where each is found, and the disqualifiers. |
| `02-recruiting-message.md` | Sending anything to anybody. DM line, longer post, consent line, the follow-ups, the day-14 silence probe. **Nothing here is sent until the author has approved the exact text.** |
| `03-install-watch-protocol.md` | The 40 minutes you sit with someone. What to say, what you may never say, when to stop helping, how to ask for a pasted diagnostics record. |
| `04-session-record-template.md` | During and immediately after a session. Copy the template per user; the filled copy goes into `NOTES.md`. |
| `05-validation-criteria.md` | Before user 1, and again after user 5. Success, failure, and the kill criteria. |
| `06-shell-mismatch-watch.md` | Every session, and every pasted diagnostics record. The one known gap that shows *wrong* information. |

## Where evidence lives

`NOTES.md` → **"Beta — external users (step 9)"**. Verbatim quotes go there, next
to the author's own quotes from 2026-06-26, because that is the file this project
has always used for user words and a second ledger would divide the evidence.

A session that is not written into `NOTES.md` did not happen. A quote that is not
in quotation marks with a date is not evidence.

## Three prerequisites that are not app source

Checked against the tree on 2026-09-04. None of these is a code change; all three
must be true before the first message is sent.

1. **A build cut from current `main`.** As of this writing the newest artifacts
   on disk are the `v0.13.0` build (`docs/beta/07-the-build.md`), which already
   carries the folder-moved crash fix but predates the D1 deletions that
   followed it (Database, API and Work panels gone, the deck down to four
   keys) and the desktop-notification fix. Per `ROADMAP.md`'s 0.14.0 ruling,
   the version to hand a beta user is **0.14.0**, not 0.13.0. Cut a signed
   build from `main`, run `npm run verify:packaged` against it, and install it
   once from the installer on this machine before it goes to anyone.
2. **A delivery path.** `github.com/Midor2Mid/devdeck` is now **public**, but
   there is still no *published* release — the one tag that has been built,
   `v0.13.0`, sits on GitHub only as a draft, invisible to anyone following the
   README's Releases link. Until a real release is published, the build is
   **hand-delivered as a file** — and the install instructions you send with it
   must say so instead of linking Releases. Send both installers (Setup and
   Portable) and the SHA-256 of each.
3. **A reply address.** The repo being public means a beta user *can* open an
   issue, but the diagnostics record is clipboard-only by design regardless —
   **nothing is transmitted, so a stranger's failure reaches you only if you
   ask them to paste it.** Decide the one channel (email, DM, or a filed issue)
   before you invite anyone, and put it in the message.

## Cadence — one at a time, and it has teeth

Invite user *n+1* only when user *n*'s session record is written into `NOTES.md`
**and** any stop-the-line defect from it is fixed (`05-validation-criteria.md`,
"Stop the line"). Two users stopping at the same place is one finding recorded
twice and a candidate spent for nothing.

## What is not tested in a first session

Say so in the record rather than leaving a gap that later reads as a pass.

- **The phone approve/deny card.** Roadmap step 7 is open: it has never rendered
  on physical hardware. Do not demo it, do not ask anyone to turn Remote on, and
  do not count "nobody tried the phone" as evidence about the phone.
- **Anything past the first five minutes.** Tasks, pipelines, the API and database
  panels, themes. If a user goes there on their own, that is a finding; steering
  them there is not.
