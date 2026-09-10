# Letting your agent tell DevDeck when it needs you

By default DevDeck works out which agent needs you by **reading the terminal** —
output means it is working, a few seconds of silence means it has handed back, a
bell means it is asking you something. That is a guess, and guesses about a
terminal are wrong in ways you will eventually notice: a redraw can look like a
resumed turn, an old bell in the scrollback can look like a new question.

If your agent CLI supports **hooks**, it can tell DevDeck exactly instead. This
page is how to wire that up. It takes one file and about a minute.

You do not have to do this. Without it, everything works as before.

---

## Before you start

Two things have to be true.

1. **DevDeck's local server is on.** Settings → MCP server → enable it. Note the
   **port** (8787 unless you changed it). This is the same loopback server the
   `devdeck_*` MCP tools already use — hooks ride it rather than opening
   anything new.
2. **You start the agent from inside a DevDeck pane.** DevDeck puts three
   variables into every terminal it starts:

   | Variable | What it holds | Which panes |
   | --- | --- | --- |
   | `DEVDECK_SESSION` | which pane this is | every pane |
   | `DEVDECK_HOOK_URL` | the full hook URL, for CLIs that need to `curl` it | every pane |
   | `DEVDECK_MCP_TOKEN` | the bearer token for the local server | **agent panes only** |

   The hook config below reads two of them.

   That last row matters: the token is only put into a pane DevDeck started for
   a configured **agent** (a deck key, the palette, a dispatched card), not into
   a plain shell pane. So wiring the hook and then typing `claude` into an
   ordinary terminal will not work — the post is refused for want of a token.
   Start the agent the way DevDeck starts agents. The scope is deliberate:
   widening it would put DevDeck's bearer token into the environment of every
   process you run in any terminal.

   An agent you started in a terminal *outside* DevDeck has none of the three,
   and DevDeck will fall back to matching on the directory — see [When DevDeck
   cannot tell which pane it was](#when-devdeck-cannot-tell-which-pane-it-was).

   Panes that were **already open** before you turned the server on do not have
   the variables either. Close and reopen them, or restart the pane.

---

## Claude Code

Claude Code supports `http` hooks, so nothing has to be installed and no script
has to be written: the CLI posts to DevDeck itself.

Put this in **`.claude/settings.local.json`** in the project you are working in.
That file is per-project and normally gitignored, which is what you want — the
port is specific to your machine.

If the file already exists, merge the `hooks` key into it rather than replacing
the file. If it already has a `hooks` key with these events in it, add the
DevDeck entry to the existing `hooks` array for each event; Claude Code runs
every entry, so yours and DevDeck's coexist.

```json
{
    "hooks": {
        "Notification": [
            {
                "hooks": [
                    {
                        "type": "http",
                        "url": "http://127.0.0.1:8787/hook",
                        "headers": {
                            "Authorization": "Bearer ${DEVDECK_MCP_TOKEN}",
                            "X-DevDeck-Session": "${DEVDECK_SESSION}"
                        },
                        "allowedEnvVars": ["DEVDECK_MCP_TOKEN", "DEVDECK_SESSION"],
                        "timeout": 5
                    }
                ]
            }
        ],
        "Stop": [
            {
                "hooks": [
                    {
                        "type": "http",
                        "url": "http://127.0.0.1:8787/hook",
                        "headers": {
                            "Authorization": "Bearer ${DEVDECK_MCP_TOKEN}",
                            "X-DevDeck-Session": "${DEVDECK_SESSION}"
                        },
                        "allowedEnvVars": ["DEVDECK_MCP_TOKEN", "DEVDECK_SESSION"],
                        "timeout": 5
                    }
                ]
            }
        ],
        "UserPromptSubmit": [
            {
                "hooks": [
                    {
                        "type": "http",
                        "url": "http://127.0.0.1:8787/hook",
                        "headers": {
                            "Authorization": "Bearer ${DEVDECK_MCP_TOKEN}",
                            "X-DevDeck-Session": "${DEVDECK_SESSION}"
                        },
                        "allowedEnvVars": ["DEVDECK_MCP_TOKEN", "DEVDECK_SESSION"],
                        "timeout": 5
                    }
                ]
            }
        ],
        "SessionStart": [
            {
                "hooks": [
                    {
                        "type": "http",
                        "url": "http://127.0.0.1:8787/hook",
                        "headers": {
                            "Authorization": "Bearer ${DEVDECK_MCP_TOKEN}",
                            "X-DevDeck-Session": "${DEVDECK_SESSION}"
                        },
                        "allowedEnvVars": ["DEVDECK_MCP_TOKEN", "DEVDECK_SESSION"],
                        "timeout": 5
                    }
                ]
            }
        ]
    }
}
```

**Change `8787` if your server is on a different port.** Nothing else in the
block needs editing.

### Why each part is there

- **`allowedEnvVars` is not optional.** Claude Code replaces an environment
  variable that is *not* in that list with an **empty string** rather than
  leaving it alone. Drop the list and you have sent a blank token (rejected) and
  a blank session id (unmatchable) — a hook that fires and does nothing.
- **The `url` is written out in full** rather than as `${DEVDECK_HOOK_URL}`.
  Variable substitution is documented for header *values*; it is not documented
  for the url, and a url that quietly became empty would be a hook that never
  fires at all.
- **`X-DevDeck-Session`** is what makes this exact. Without it DevDeck can only
  guess from the directory, and running several agents in one repo is the whole
  point of DevDeck.
- **`timeout: 5`** because the default is 600 seconds. DevDeck answers in
  microseconds over loopback, but a supervision feature must never be able to
  hold up the agent it is supervising.
- **`SessionStart` tells DevDeck nothing about your attention** and is included
  anyway: it is the first event of a run and it carries the session header, so
  it is what lets DevDeck keep track of the pane even if a later event arrives
  without one.

### Checking it worked

1. Reload the settings — start a fresh `claude` in a DevDeck pane.
2. Send it any prompt. The pane's tile should read **WORKING** immediately,
   rather than after its first output.
3. Let it finish. The tile should flip to **WAITING** the instant the turn ends,
   instead of a few seconds later.
4. Ask it to do something that needs permission. The pane should raise the loud
   signal with the agent's own wording.

If nothing changes, open DevDeck's **activity feed**. A hook that arrived and
could not be matched is logged there with the directory it reported — that
message means the wiring is right and the correlation is not, which is a
different problem with a different fix (below).

If the feed says nothing at all, the hook is not firing. Check, in order: the
server is on and on the port in the file; the JSON is valid; you restarted
`claude` after editing; `allowedEnvVars` is present. Claude Code also has
settings that can switch hooks off wholesale (`disableAllHooks`) or restrict
which URLs an `http` hook may reach (`allowedHttpHookUrls`) — if either is set
in a settings file above this one, it wins.

---

## What DevDeck does with each event

| Event | DevDeck reads it as |
| --- | --- |
| `Notification` — permission prompt, idle prompt, needs input | **it is asking you something** (loud) |
| `Notification` — agent completed | it has handed back (soft) |
| `Notification` — auth, quota, elicitation results | nothing; ignored |
| `Stop` | it has handed back (soft) |
| `UserPromptSubmit` | it is working |
| `SessionStart` | nothing; used to keep track of the pane |
| anything else | nothing; ignored |

`PreToolUse` and `PostToolUse` are deliberately **not** in the list even though
they would also be exact. They fire on every tool call, so a single turn would
post dozens of times, and a hook that fires before a tool is a hook whose
failure can hold up that tool. The four events above already cover every change
DevDeck shows you.

## A stated signal beats a guessed one

When your agent has stated where it is, DevDeck stops second-guessing it for
that session:

- A stated **question** or **hand-back** stands until *you* answer it (a reply,
  an approval, or just typing in the pane) or the agent states something new.
  Terminal output cannot undo it, a bell cannot make it louder, and re-entering
  the tab cannot age it.
- A stated **"working"** holds nothing, on purpose. It says a turn *started*, not
  how it ends. If you wire `UserPromptSubmit` and forget `Stop`, DevDeck falls
  back to reading the terminal rather than saying WORKING forever.

That last point is why the block above wires all four events. Wire fewer and
DevDeck fills the gaps with its own reading, which is exactly the behaviour you
had before.

## When DevDeck cannot tell which pane it was

DevDeck matches a hook to a pane in this order:

1. **The `X-DevDeck-Session` header** — exact, nothing is inferred.
2. **A session it has already matched exactly** — later events of the same run
   follow the first one, even without the header.
3. **The directory the CLI reported** — accepted *only* if exactly one running
   agent is in that directory.

If none of those resolves, DevDeck **attributes it to nothing** and logs it in
the activity feed with the directory. It does not pick one of two candidates.
Sending you to the wrong pane is worse than not sending you: you would arrive,
find nothing waiting, and have no reason to believe the next signal either.

The usual cause is two agents in one repo with no `X-DevDeck-Session` header —
add the header. The other cause is an agent started outside DevDeck, which has
no pane to be matched to at all.

## Codex and Gemini

Not yet documented here, and the reason is worth stating rather than glossing:

- **Codex CLI** has hooks (`~/.codex/hooks.json`, or `.codex/hooks.json` in the
  project) but no `http` type — they are commands that receive the payload on
  stdin, so reaching DevDeck needs a small wrapper that pipes stdin to
  `$DEVDECK_HOOK_URL`. Codex hooks are also reported to be unavailable on
  Windows, which is the platform DevDeck ships on, so nothing here has been run
  end to end and no worked example is given until it has.
- **Gemini CLI** has `Notification` and `AfterAgent` hooks, and separately emits
  OSC 9 notifications that DevDeck's existing terminal reading already sees.

Both can already reach the same endpoint today, whatever their event names are,
by posting DevDeck's own shape instead of the vendor's:

```
POST http://127.0.0.1:8787/hook
Authorization: Bearer <DEVDECK_MCP_TOKEN>
X-DevDeck-Session: <DEVDECK_SESSION>

{ "event": "gemini/AfterAgent", "state": "waiting" }
```

`state` is `attention`, `waiting` or `working`. `event` is any label you want to
see in the tooltip. Everything else — `cwd`, `session_id`, `transcript_path`,
`message` — is optional and treated exactly as it is for Claude Code.

## What this endpoint will not do

Worth being explicit, because a supervision feature that phones home would be
a different product:

- **Nothing leaves your machine.** The route only receives, on a listener bound
  to `127.0.0.1`, from connections that come from this machine. There is no
  telemetry in DevDeck, anonymous or otherwise, and no code path from a hook to
  an outbound request. That is enforced by a test that fails the build if one is
  ever added, not by a promise in a comment.
- **It never types into your agent.** A hook sets what DevDeck *shows*; it can
  never send a keystroke to a terminal. Anything DevDeck sends to an agent comes
  from you pressing something.
- **`transcript_path` is recorded, not opened.** DevDeck keeps the path your CLI
  reports so it can tell which transcript belongs to which pane. It does not read
  the file on the strength of a hook saying so.
- **It cannot answer a permission prompt for you.** Claude Code's
  `PermissionRequest` hook can return a decision, and DevDeck deliberately does
  not use it: that would mean holding an HTTP request open until a human taps
  something, which is a background daemon in disguise and would fail the moment
  the hook timed out.
- **The token is the boundary.** Anything on your machine holding
  `DEVDECK_MCP_TOKEN` can already call DevDeck's MCP tools; the session matching
  described above is addressing, not a second lock. What limits this route is
  that it has no dangerous capability to reach.
