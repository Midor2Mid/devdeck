# Security policy

This file is written to the same standard as `PRODUCT.md`'s Validation section:
it says what is true on 2026-09-10, not what would be reassuring. Where a
guard has never been watched to hold, it says so.

## What this project is, before anything else

**DevDeck is a Windows-only desktop application maintained by one person, and
no external user has ever run it.** Not one install off the author's machine,
not one recorded first session. A private beta of 5–10 people is being prepared;
until those installs exist, every statement below about how this behaves on
somebody else's machine is derived from code and from tests, not from
observation.

That has three consequences you should price in before you rely on anything
here:

- **There is no SLA, and none will be offered.** A single maintainer cannot
  promise a response window and keep it, and a promise that cannot be kept is
  worse than no promise. What is offered instead: reports are read, and a report
  that lands with a reproduction gets acted on before a report that does not.
- **Pull requests are by invitation.** Not hostility — a maintainer who cannot
  review a change properly should not merge it. Open a report or an issue first.
- **Only Windows is supported.** macOS and Linux are not planned
  (`PRODUCT.md`). A finding that only reproduces on another platform is
  interesting and is not a vulnerability in a shipped product.

## Reporting a vulnerability

**Use GitHub private vulnerability reporting** — the **Report a vulnerability**
button under this repository's Security tab. It was enabled on 2026-09-10 and
is the only private channel that exists.

**There is deliberately no reply address.** That is not an oversight to be
corrected in the reply; it is the policy:

- This project runs no inbox, no forwarding address and no server. Standing up
  one — and staffing it — is engineering that was explicitly refused for the
  pre-beta, and an address published here that nobody watches would be worse
  than the absence of one.
- Diagnostics are **clipboard-only by design**: nothing in the app posts
  anywhere. There is no telemetry channel for a report to travel down and there
  is not going to be one.

So private vulnerability reporting is not a preference over a mailbox. It is
the mechanism, and it works because the thread it creates *is* the reply
address — for both sides, with no address disclosed by either.

If it is unavailable to you for any reason, a public issue is the fallback, and
please weigh what that means: this repository is public and a filed issue is a
live disclosure. Prefer a report that describes the *shape* of the problem
("the remote HTTP relay's address guard can be bypassed by an encoding it does
not enumerate") over one that carries a working exploit.

### Do not paste diagnostics into a public report

The app's diagnostics record is designed to be copied to the clipboard and
handed to someone. **It is not anonymous, and the copy in the app says so.**

What the redactor (`src/main/redact.ts`) removes: PEM blocks, and the token
shapes their issuers make recognisable — `sk-ant-`, `sk-`/`sk-proj-`, Stripe's
`sk_`/`rk_` live and test keys, `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`,
`github_pat_`, `npm_`, `AKIA`/`ASIA`, `AIza`, the `xox?-` Slack family, JWTs,
userinfo in a URL, and `Bearer`/`Basic`/`Token` headers — plus values behind a
variable *name* that says what it holds.
Since 2026-09-10 it also folds the owner segment of a home directory, so
`C:\Users\<your name>\AppData\...` becomes
`C:\Users\[redacted:user]\AppData\...`.

**What it deliberately keeps, and what that means for you.** The rest of every
path survives, because a path is the answer to most of the questions the record
exists to answer. So the record still contains: the directories of the projects
you have open, your configured shell and its arguments, every agent command
line, and the tails of installation paths. On a work machine those routinely
name an employer, a client or an unreleased product. Read the record before you
paste it — that is a sentence about your own identifiers, not the author's, and
nothing in this repository can check it for you.

Redaction here is a mechanism, not a guarantee. It removes the credential
shapes it knows about. It is not a sanitiser and is never described as one.

## What ships, and what ships switched off

The default install is a local, single-machine app. Nothing listens and nothing
leaves the machine.

| Surface | Default | Where |
|---|---|---|
| Phone pairing / remote HTTP server | **`enabled: false`** | `src/renderer/src/settings.ts` |
| — its bind, when switched on | `tailscale` — refuses to start if there is no tailnet, rather than widening to `0.0.0.0` | `chooseBind`, `src/main/guards.ts` |
| — its TLS | `false` | same block |
| Local MCP server (`127.0.0.1:8787`) | **`enabled: false`**, bearer token required when on | same block |
| Upstream proxy | `enabled: false` | same block |
| Telemetry, accounts, crash upload | do not exist | — |

This matters to your threat model more than any individual guard: **on a default
install there is no network-reachable surface at all.** The remote server is an
opt-in a user turns on deliberately, and asking for the private bind and not
getting it is a refusal to start, not a fallback to every interface.

If you do turn it on, know two things the code knows:

- **The bind is decided once, in `start()`, and nothing re-examines it.** Start
  the server at home, close the lid, open it somewhere else, and it is still
  listening with a live pairing token on a network nobody chose. Every guard is
  behaving exactly as designed; the exposure is a different network. This is a
  missing control, it is recorded as one, and it is not fixed.
- **Pairing is the trust boundary.** A paired device can write bytes to a
  terminal, which is a shell. The per-message checks past that point are
  addressing hygiene, not a second boundary, and the code says so where it
  matters. Treat a pairing token as equivalent to a shell on that machine.

## What has been attacked, and how

Guards worth your time, and the tests that hold them: `tests/http-ssrf.test.ts`,
`tests/server-guards.test.ts`, `tests/guards.test.ts`,
`tests/files-guard.test.ts`. Every finding in this project's history was closed
with a failing test first, and none of them was closed by widening the guard to
make a test pass.

Two that are worth knowing about because they show the class of mistake this
codebase actually makes:

- `[::ffff:7f00:1]` reached loopback through an SSRF guard that had already been
  reviewed. The fix that followed was not "add that spelling" — one instance of
  a class is not the class — but to judge every IPv4-in-IPv6 embedding
  (`::ffff:/96`, `::/96`, IPv4-translated, NAT64's well-known `64:ff9b::/96`,
  6to4, Teredo) as the IPv4 address it carries. A **network-specific** NAT64
  prefix is still not enumerable and is documented as such in `guards.ts`.
- A path guard once answered with a `TypeError` from `path.resolve` instead of a
  decision. An exception is not a refusal. Every guard is expected to have a
  defined answer when its input is unreadable, absent or malformed, and that
  answer is refusal.

## What is NOT proven

The section that makes the rest of this file worth reading.

- **The phone. Any of it.** The pairing flow has never been walked on a phone
  and the decision card has never rendered on real hardware. Every claim about
  the remote surface — including the reassuring ones above — is derived from the
  code and from tests that mock the socket. It has never been attacked from a
  foreign network.
- **The SQL read-only question is retired rather than answered.** `db.ts`, the
  Database panel and all four bundled drivers (`pg`, `mysql2`, `mssql`,
  `node-sqlite3-wasm`) were deleted, and `devdeck_db_query`,
  `devdeck_db_tables` and `devdeck_db_connections` now answer with the reason
  they were withdrawn. So: the Postgres `WITH x AS (DELETE …) SELECT` bypass of
  the read-only transaction **was never demonstrated** — it needed a live
  Postgres and was never watched to fail — and only sqlite was ever proven
  end-to-end. Deleting the drivers does not turn that into a proof; it retires
  the surface, and with it `mssql`'s `trustServerCertificate: true` and the
  "SSL" checkbox that delivered encryption without authentication. DevDeck
  cannot run SQL any more. The honest summary is that the question no longer
  has anywhere to be asked, not that the answer turned out to be reassuring.
  The one thing that must not come back is a string-shaped SQL check:
  `isReadOnlySql` was deleted and `guards.ts` carries a note saying why.
- **`safeStorage` unavailable.** Pairing tokens, API keys and the git PAT fall
  back to base64 when Electron reports encryption unavailable — an encoding, not
  encryption. It has never happened on the author's machine, it is not
  simulated, and there is no UI that tells a user it happened to them.
- **Behaviour behind a mandatory corporate proxy.** Terminals inherit the proxy
  environment; the HTTP paths in the main process use `undici`'s `fetch`, which
  does not read those variables. Expect the remote relay to fail with a bare
  error on a managed LAN. Reported by reading the code, not by trying it.
- **A machine that is not the author's.** Exit-code handling for an antivirus
  that kills the shell, a policy-blocked PowerShell, HiDPI rendering — all of it
  is reasoned. The first-ever CI run failed three times for reasons that could
  not occur on the author's machine, which is the correct prior for everything
  in this paragraph.

## Dependencies

Production dependencies are **five** packages (`@lydell/node-pty`,
`@xterm/xterm`, `electron-updater`, `selfsigned`, `ws`) — down from nine on
2026-09-09 when the database drivers were deleted.

`.github/workflows/check.yml` runs `scripts/audit-gate.mjs` on every push:
a **gate** over production dependencies at `high` and above, and a
never-failing **report** over everything down to `low`. The gate fails only on
an advisory with a published fix, because an advisory with no fix cannot be
cleared by anybody and blocking on it would change nothing about the risk.
Advisories held rather than fixed are recorded in `.github/audit-allow.json`
with a reason and an expiry date, and the gate fails again on that date. Read
`scripts/lib/audit-decide.mjs` for the full argument.

## Out of scope

- Anything reachable only by the person running the app typing into their own
  settings fields. The user is not the attacker in this model.
- An agent running in a terminal pane doing something destructive with the shell
  it was deliberately given. What *is* in scope is what an agent can reach
  **through** the app that a shell alone would not give it.
- Findings that require an already-compromised machine, or physical access.
- Missing hardening on a surface that ships switched off, unless switching it on
  is what exposes the flaw — in which case say so, because that is in scope.
