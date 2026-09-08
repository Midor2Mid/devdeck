# The build to hand over

**0.13.0, built from `main` at `12d25ef` on 2026-09-07.**

`docs/beta/03-install-watch-protocol.md` needs a build a stranger can run, and
until now `release/` held only 0.12.0 — which predates the crash fix
(`4e5a44f`), the workspace guard, the whole UI/UX overhaul, and four fixes to
the honesty of the attention counters. Handing someone 0.12.0 would have been
watching them meet defects that were already fixed.

## What to send

| file | bytes | SHA-256 |
|---|---|---|
| `DevDeck-Setup-0.13.0.exe` | 114,780,760 | `8A8580CE7A1F9D6B3FD4BA14E46E3690063EB99F0E724F0004F2CD5407CAF101` |
| `DevDeck-Portable-0.13.0.exe` | 114,525,752 | `016BC4EB5ED83BB6F7EA3CC428360728E593D791417D6BFFC637C37181D9A5C8` |

Send the SHA-256 **in a different message from the file**, and ask them to check
it before running. Not security theatre: it is the only way either of you can
tell a corrupted 114 MB download from a broken app, and a first session that
begins with a mangled installer will read as "this software is broken".

Portable is usually the better first ask — no install, no uninstall, and one
fewer thing to undo if they hate it.

## What is verified, and what is not

**Verified.**
- `npm run typecheck` zero; **1,641 specs pass**.
- Authenticode: both binaries `Valid`, subject `CN=DevDeck Dev`.
- `node scripts/update-manifest.mjs --check`: `latest.yml` names the installer,
  and its sha512 and size match the file on disk — so auto-update will accept
  this release when it is eventually published.
- `npm run verify:packaged`: 4/4 — the pty native module is unpacked beside the
  asar, the packaged app opens and mounts its panes, a real shell runs inside
  it, and it was built on Electron 43.4.1 as this repo declares.

**Not verified, and say so if asked.**
- **SmartScreen will warn.** The certificate is self-signed and trusted only on
  the machine that made it. This is the single most likely reason someone
  abandons the install, and it is pre-registered as kill criterion **K4**: if 3
  of 5 refuse to install at all, stop recruiting immediately, because then the
  certificate is the only work that matters.
- **The phone approve/deny card has never rendered on real hardware.** Do not
  demo it (see `docs/beta/README.md`). ROADMAP step 7 exists to settle it.
- **Nobody has installed this build but its author.** Every observation in the
  protocol is therefore a first.

## Reproducing it

    git checkout 12d25ef
    npm ci
    npm run package

Signing needs the local cert (`npm run cert:make`, once). If signing fails with
PowerShell exiting 127, that is Avast's Behavior Shield — add `powershell.exe`
to Avast's **Allowed apps**, not its scan exceptions.
