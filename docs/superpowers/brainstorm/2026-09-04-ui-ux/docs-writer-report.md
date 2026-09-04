# DevDeck UI/UX brainstorm — the documentation test

Written by walking the first five minutes in the real, built app on a
never-been-used profile. Everything below that says "I saw" was seen in a
screenshot or a DOM dump from that run. Everything I could not reach is called
out as such in the last section.

Build: `npx electron-vite build` (exit 0). Harness: `.claude/skills/run-app/cdp.js`,
`withApp(fn, { debugPort: 9433…9441, userDataDir: <scratchpad>/udata-docs })`.
Window 1386×863. Theme Slate + Modern Pro (the default). Screenshots in
`<scratchpad>/shots/`.

---

## 1. The walk, as it actually happened

### Step 1 — launch, empty profile (`shots/01-first-run.png`)

One centered object on a void: **DevDeck**, a one-line lede, an amber **Open a
project folder** button, the CLI prerequisite line, `Found on your PATH: claude,
codex, gemini.`, and `Ctrl+K reopens this list later.`

This screen is the best-written thing in the product. It is also the only screen
in the product that explains itself.

Below it, a bottom bar carrying **thirteen unlabeled glyphs** in one undifferentiated
row: 8 view keys, then 5 tool icons. On this screen I confirmed by DOM dump that
all eight view keys have:

- `disabled = true`
- `data-tip = null`
- `aria-label = null`
- their `.deck-view-name` span at `display: none`

The only words available are on the *group* (`data-tip="Add a project to use the
views."`), which requires hovering an area the user has no reason to hover. A
stranger's first screen contains thirteen controls that cannot be named, and
eight of them cannot even be hovered into naming themselves.

The deck's own "add a project" affordance is `.deck-empty` — 12px, `--faint`,
transparent, no border: it reads as a caption, not a button. I would have to
write "click the grey words at the bottom left", which is why I wouldn't write it
at all.

### Step 2 — open a project (`shots/02-after-open-project.png`)

I clicked **Open a project folder** and the renderer stayed alive for 25s with no
change and no error, which is what a modal native folder dialog looks like from
CDP. I could not dismiss it (see §5), so I completed the step by calling the same
IPC the dialog resolves into — `window.api.projects.addPath("D:/…/devdeck")` — and
reloading, which is the exact store mutation `addProject()` performs.

The app lands on **Mission**. Its three sections:

| Shown | Content on a first project |
|---|---|
| `AGENTS` · `0 running` | "No agent sessions running. Start one from the deck (+) or the command palette." |
| `REVIEW QUEUE` · `uncommitted changes awaiting review` | "No uncommitted changes across your projects." |
| `SYSTEM` · `containers & listening ports` | **18 port chips** — `:1433 :1434 :3306 :4322 :5040 :5432 :5939 :6378 :6379 :7030 :7680 :8053 :9433 :9930 :15100 :15101 :27036 +7 more` |

So the first thing a stranger sees after opening their project is eighteen port
numbers belonging to their whole machine. Two empty states and one wall of
unexplained numbers. The instruction I would have to publish is: *"The row of
numbers is every process listening on your PC, not your project. Ignore it."*
That instruction should not need to exist.

The Mission empty state also says **"Start one from the deck (+)"** — pointing at
a control that is a bare `+` with a hover-only tip, on a strip labelled `DEVDECK`
in 11px uppercase.

### Step 3 — open a terminal (`shots/11-terminal-empty.png`, `12-terminal-open.png`)

I clicked the third view key. Its label is hidden; its tooltip
(`Terminal (Ctrl+3)`) only exists now that a project is open.

The Terminal empty state is good and clear: **Launch a command**, "No terminals
yet in devdeck. Pick a startup command, or open a plain shell.", then
`+ New terminal` / `Settings`, then grouped cards under **AI AGENTS**, **DEV
SERVERS**, **BUILD & TEST** — Claude, Claude Opus, Claude YOLO (accent-outlined,
with the sharpest tooltip in the app), Codex, Gemini, Dev server, Build, Test.
Each card prints its command in mono. Nothing here needs documenting.

But the toolbar above it *simultaneously* offers `+ Terminal`, `+ Claude`, a
chevron, and `↻ Resume`. Two competing surfaces for the same four actions, ~200px
apart. My instruction has to name both, or pick one and leave a reader wondering
what the other is.

`+ New terminal` worked. **The pane was black and empty at t+4s** with a green dot
on the tab claiming it was running; at t+15s (next launch) the prompt
`PS D:\Personal\Personal Projects\Products\devdeck>` was there. So: a new pane is
a featureless black rectangle for several seconds and says nothing about it.

### Step 4 — start an agent (`shots/21-agent-started.png`, `25-fresh-agent-40s.png`)

`+ Claude` created a `claude 2` tab, a deck-strip entry `claude 2 CLAUDE`, and —
after the pane sat black for ~12s on the first attempt — Claude Code's banner:

```
PS D:\…\devdeck> claude
 ▐▛███▛█   Claude Code v2.1.259
▝▜██████▀  Opus 5 (1M context) · Claude Team
```

Verified twice. The core path works.

### Step 5 — relaunch (`shots/22-agent-45s.png`, `26-restored-agent.png`)

The restored shell came back with a live prompt. The restored agent pane showed a
centered card: **"Resume this agent session?" / "Restored from your last run — its
conversation isn't live yet." / [Resume] [Start fresh] / `claude --continue`**.

This is the best-designed state in the app: it says what happened, what the
options are, and what command each will run. Every other ambiguous state in
DevDeck should be measured against this card. I initially recorded this pane as
"blank forever" because I was reading `.xterm-rows` and not looking; the
screenshot corrected me, and the correction is the point — the card is doing work
no prose needed to do.

---

## 2. Ranked: instructions the UI should have made unnecessary

Highest value first. Each one is a sentence I would have to publish today, and
the UI change that deletes it.

**1. "Switch to Terminal — the third view key in the deck along the bottom of the
window, or `Ctrl+3`."**
`.deck-view-name { display: none }` hides seven of the eight labels at all times.
*Delete it by:* printing all eight labels above 1180px. The row already reserves
the space (the active key prints its label, so the bar jitters on every switch).
Cost measured: 8 labels ≈ 430px on a 1386px bar that currently has ~700px of dead
space between the tools and the status items.

**2. "Nothing in the bottom bar works until you add a project — hover the middle
of the row to find out why."**
On first run all eight keys are `disabled` with `data-tip=null` and
`aria-label=null`. The one explanatory sentence hangs off the *container*.
*Delete it by:* keeping the labels visible while disabled (a greyed word explains
itself; a greyed glyph does not), and moving "Add a project to use the views."
onto each key.

**3. "The eighteen numbers on Mission are every port open on your PC, not your
project."**
`SYSTEM` / `containers & listening ports` is the caption; the chips are the
loudest object on a stranger's first project screen.
*Delete it by:* renaming the section **Ports in use on this PC**, and collapsing
it by default when the two sections above it are empty — on a first run the
screen should be about the project, not the machine.

**4. "To add another project, press `Ctrl+K` or click the faint grey text at the
bottom left."**
`.deck-empty` is a borderless, transparent, 12px `--faint` button.
*Delete it by:* making it a real button — `+ Add a project folder` — with the
same shape as `.deck-add`.

**5. "To start an agent in a project without leaving the view you're in, click the
small `+` at the right of that project's strip."**
Mission's own empty state already has to say "from the deck (+)".
*Delete it by:* labelling it `+ Agent` while the strip has no sessions.

**6. "The pane will be black for a few seconds. That is the shell starting."**
Measured: 4s with no prompt on a fresh shell, ~12s on the first agent.
*Delete it by:* writing one dim line into the pane at spawn — `Starting
powershell…` / `Starting claude…` — the way the exit notice already writes one at
death. The mechanism exists (`writeExitNotice`); it just has no counterpart at
birth.

**7. "Open Settings from the fourth icon from the right in the bottom bar."**
Five unlabeled tool icons, hover-only tips.
*Delete it by:* labelling `Settings` at least; it is the destination of eleven
different sentences in the README ("Settings → Agents", "→ Git", "→ SSH", "→ MCP",
"→ Remote", "→ Appearance", "→ Terminal", "→ Shortcuts", "→ About", "→ Snippets",
"→ Pipelines"). One label retires eleven navigation instructions.

**8. "The ▷ in the top left runs your project; the ▷ in the bottom right opens
scripts and saved commands."**
Two identical play triangles, ~1300px apart, meaning different things. I cannot
write this sentence without it sounding like a joke.
*Delete it by:* giving the tool-cluster one a different mark (a list/terminal
glyph) or a label.

**9. "Splits, layout, zoom and find are the six icons at the right of the terminal
toolbar."**
`Layout: Tabs — click for Grid`, `Split right`, `Split down`, `Zoom this pane`,
`Find in terminal`, `More`. All hover-only.
*Delete it by:* leaving them icon-only — this is a per-pane toolbar a user meets
after they are already working — but the README should stop enumerating them and
point at `F1` instead.

**10. "Leave the `worktree` box alone unless you know what a git worktree is."**
On the Tasks board the checkbox is labelled with the single word `worktree` and
is `useState(true)` — **checked by default**, no tooltip. A stranger's first
dispatched task silently gets its own checkout.
*Delete it by:* relabelling and defaulting to off (see §3).

**11. "Two different places start a terminal: the empty-state cards and the
toolbar buttons."**
*Delete it by:* the toolbar's `+ Terminal` / `+ Claude` / `↻ Resume` should not
render while the empty-state launcher is on screen. They are the same actions
twice.

**12. "The `▾` next to `+ Claude` holds the other agents; `↻ Resume` continues the
last conversation."**
The README currently describes `+` and `▾` and never mentions `↻ Resume`, which
is a labelled, accent-outlined button sitting right there. The docs are behind
the UI here, not ahead of it — but the three-control cluster still needs a
sentence, which a single split-button would not.

---

## 3. Icon-only vs icon + label — the counted verdict

I wrote out every instruction needed to take a stranger from launch to a running
agent and then to the rest of the deck's controls. **22 instructions. 14 of them
exist for no reason other than to name a control the UI declined to label.**

The 14 (each names a control by position or by glyph, never by its printed name):

1. the third view key → Terminal
2. the sliders icon, bottom right → Settings
3. the bar-chart icon → AI usage
4. the open-book icon → Agent context files
5. the `▷` in the tool cluster → Scripts & saved commands
6. the `···` → Work / Activity / Standup / Release / shortcuts
7. the `▷` beside the ensō → Run project
8. the `+` on a project strip → start an agent here
9. the window-frame icon → Layout
10. the left-split icon → Split right
11. the bottom-split icon → Split down
12. the diagonal-arrows icon → Zoom pane
13. the magnifier → Find in terminal
14. the person icon in the status bar → Git identity

The 8 that did not need it — *Open a project folder*, *+ New terminal*, the eight
launch cards, *+ Terminal*, *+ Claude*, *↻ Resume*, *Resume / Start fresh*,
*Search or run…* — are all **labelled controls**. Every instruction I could delete
was deleted by a word already printed on the button.

Split by phase, the number is sharper:

- **Core path (launch → project → terminal → agent): 2 of 9** instructions are
  pure naming. The empty states carry the user, and they carry them well.
- **Everything after the core path: 12 of 13** instructions are pure naming.

**Verdict: icon + label for the eight view keys, unconditionally above 1180px.**
They are the app's primary navigation, there are eight of them (past any
reasonable icon-memory budget), several are near-synonymous as glyphs (`send` for
API, `globe` for Network, `appWindow` for Browser, `database` for Database), and
the current design *already prints one label* — so the argument that labels cost
space is undercut by the layout's own behaviour. Print all eight, drop the
`.deck-view.on` label special-case, and keep the accent underline as the state
mark: state stays in form, and the row stops resizing on every switch.

**Icon-only survives for the 5-item tool cluster and the terminal toolbar**, on
two conditions: (a) every one of them gets `aria-label` as well as `data-tip` —
today the terminal toolbar has `data-tip` only, so a screen reader and a stuck
reader are in the same position; and (b) the two `▷` glyphs stop colliding.

And one rule that costs nothing: **a disabled control must still be readable.**
Chromium dispatches no mouse events from a disabled button, so DevDeck's
first-run deck is thirteen glyphs with no way to learn any of their names. That
is the single worst moment in the product, and it is the first one.

---

## 4. Copy — the worst offenders, with rewrites

Ordered by how early a stranger meets them.

**1. First run — "Ctrl+K reopens this list later."**
There is no list on this screen. There is one button. `Ctrl+K` opens the project
switcher, which on a fresh install is empty and says "No projects yet. Add a
folder to start."
→ **"Ctrl+K opens the project switcher — add or change folders from there."**

**2. Mission — `SYSTEM` / "containers & listening ports"**
Names an internal grouping, then explains it in 11px on the opposite side of the
screen.
→ Heading **"Ports in use on this PC"**, caption **"every process listening right
now, not only devdeck"**. Collapse by default until the user expands it once.

**3. Mission — `REVIEW QUEUE` / "uncommitted changes awaiting review"**
"Review queue" is a concept DevDeck invented; the caption is the actual meaning.
→ Heading **"Uncommitted changes"**, caption **"across every project you've
added"**. Two words, no invention.

**4. Tasks — the `worktree` checkbox, checked by default**
A bare noun, no tooltip, defaulting to on, and it changes where an agent's edits
land.
→ Label **"Give the agent its own worktree"**, tip **"Creates a separate checkout
of this repo so the agent's edits don't touch the files you're editing."**, and
default **off** — a first-time user should not have a git worktree created by a
button they thought said "Add".

**5. Topbar — "No runnable project type detected"** (disabled `▷`)
Names DevDeck's detector, tells the reader nothing about their folder.
→ **"No start command found — DevDeck looks for a package.json, a .sln/.csproj,
or a go.mod in this folder."** (verified against `runProject.ts`.)

**6. Tool cluster — "Agent context files"**
Only means something if you already know DevDeck calls them that.
→ **"CLAUDE.md and other agent instructions in this project"**.

**7. Tool cluster — "AI usage"**
→ **"Token use and cost"** — the panel is a priced ledger; say the noun the user
came for.

**8. Status bar — "Release board — promote Dev → UAT → PROD"** on an unlabeled
icon, sitting beside "Git identity: not set — click to switch account" *with the
same CSS class* (`sb-item sb-identity`). Two unrelated features, one class, two
anonymous glyphs.
→ Keep the tip, fix the class, and label the git identity one with the account
name when set — "not set" is exactly the state that needs a word on screen.

**9. Deck — "Add or open a project"** styled as a caption.
→ **"+ Add a project folder"** as a real button.

**10. Terminal empty state — "Launch a command"**
The screen's job is "start a terminal or an agent here"; "command" is the
implementation.
→ **"Start something in devdeck"** over the existing (good) subline.

**11. Settings → About — the product sentence**
> "A command deck for terminal-first, **Claude-driven** development — multiple
> terminals, fast project switching, editor, API client, database, and remote
> access in one window."

This is the only place in the shipped app that describes the product, and it says
Claude-driven while the app ships Codex and Gemini presets and the first-run
screen names all three. See §5.
→ Use the README's sentence verbatim: **"A command deck for terminal-first,
AI-CLI-driven development — multiple terminals, agent sessions (Claude, Codex,
Gemini), fast project switching, an editor, an API client, a database client, and
network debugging in one window."**

**The copy that should be the house standard.** Three pieces of writing in this
app are better than anything I would produce for them, and the rest should be
rewritten to match their shape — *what happened, then what to do*:

- `termExit.ts` on a fast-fail exit: names the exit code, names Avast, names the
  fix, names the two shells that are unaffected.
- The resume card: "Restored from your last run — its conversation isn't live
  yet", two buttons, and the literal command printed underneath.
- Settings → About → Copy diagnostics: says exactly what is copied, that keys are
  removed, and that nothing is transmitted.

---

## 5. Contradictions between the app and the README / homepage

Checked against `README.md` and `site/index.html` as they stand today.

1. **Settings → About says "Claude-driven"**; README's first line and the homepage
   both say Claude *or* Codex *or* Gemini. The in-app description is the one a
   user reads after installing, and it is the narrower claim.
2. **README: "Settings (⚙ in the deck's tool cluster, bottom right)"** — the icon
   is not a gear. It is a three-slider mixer glyph (`Icon name="settings"`).
   Anyone hunting for ⚙ will not find it.
3. **README: "split any terminal right (⇆) or down (⇅)"** — neither arrow appears
   in the UI; the controls are two panel-split line icons with `data-tip="Split
   right (Ctrl+Shift+\)"` / `"Split down (Ctrl+Shift+-)"`.
4. **README: "`+` for the primary agent, `▾` menu for the rest (with resume)"** —
   the toolbar is `+ Claude` (a labelled accent button), a chevron, and a
   *separate*, equally prominent `↻ Resume` button the README never mentions.
5. **README: "If a card reads not found on your PATH"** — no card reads that. The
   badge reads `NOT ON PATH`; the sentence "Not found on your PATH. A shell alias
   or function still works, so this still runs." is in the tooltip.
6. **README step 2 lists what the empty Terminal view shows** but omits the
   `Settings` button beside `+ New terminal` and the three group headings
   (**AI AGENTS**, **DEV SERVERS**, **BUILD & TEST**) that are the largest
   structural elements on that screen.
7. **README's shortcut table is correct** — I diffed all ten rows against
   `src/renderer/src/shortcuts.ts`, which is the single source both `F1` and
   Settings → Shortcuts read from. No drift. (`Ctrl+Shift+Z` zoom, `Ctrl+Tab`
   next session, `Alt+1…9`, `Alt+arrows`, `Ctrl+Shift+J`, `Ctrl+Shift+B`,
   `Ctrl+Shift+R` are in the app and not in the README table — correctly, since
   the table is explicitly a subset pointing at F1.)
8. **README "The first five minutes" is otherwise accurate.** The first-run
   screen, the probe sentence, the landing on Mission, the empty Terminal view
   and the agent cards are all exactly as described. The rewrite done today
   holds up; the drift it fixed was real and is gone.

---

## 6. What I ran

| Step | How | Result |
|---|---|---|
| Build | `npx electron-vite build` | exit 0 |
| First run, virgin profile | `withApp(..., { debugPort: 9433, userDataDir: <scratchpad>/udata-docs })`, dir deleted first | `01-first-run.png` + full DOM dump |
| View-key state on first run | `document.querySelectorAll('.deck-view')` → label / tip / aria / disabled / computed `display` | 8× `{shown:"", tip:null, aria:null, off:true, display:"none"}` |
| Click **Open a project folder** | `.click()` on the button, held 25s | renderer alive, no DOM change — consistent with a modal native dialog; **not** dismissible over CDP |
| Open a project | `window.api.projects.addPath("D:/…/devdeck")` + `location.reload()` | `["devdeck@D:/…/devdeck"]`, `02-after-open-project.png` |
| Mission content | DOM dump of every visible node with text/tip/aria | 18 port chips, 2 empty states |
| View keys with a project | same dump | labels still hidden on 7 of 8; tips now present |
| Terminal view | click view key #3 | `11-terminal-empty.png`, full empty-state copy |
| New shell | click `+ New terminal` | tab `shell 1`; pane empty at t+4s; `PS D:\…\devdeck>` present on a later launch |
| New agent | click `.term-launch-new` (`+ Claude`) | tab `claude 2`, deck strip `claude 2 CLAUDE`; blank ~12s, then Claude Code v2.1.259 banner |
| Fresh agent timing | poll `.xterm-rows` every 5s for 40s | banner by t+5s on the second attempt |
| Relaunch / restore | new `withApp` on the same `userDataDir` | shell restored with a live prompt; agent restored behind the **Resume this agent session?** card (`22`, `26`) |
| Settings | click `.deck-tool[data-tip="Settings"]` | 15 section names captured; Appearance + About read in full |
| Command palette | click `.cmd-pill` | full command list captured |
| Deck `+` | click `.deck-add` | `.launch-opts` popover: AGENT / Claude / Claude Opus / Claude YOLO / Codex / Gemini / Enter / Launch Claude |
| Tool cluster **More** | click | `.ctx-menu`: Work / Activity / Standup / Release / Keyboard shortcuts (F1) |
| Tasks board | click view key #2 | `30-tasks.png`; `worktree` checkbox confirmed `useState(true)` in `TaskBoard.tsx:226` |
| Shortcut reference | read `src/renderer/src/shortcuts.ts` | diffed against the README table |
| Run detection | read `src/renderer/src/runProject.ts` | `.sln`/`.csproj` → dotnet, `package.json` → `npm run dev`/`npm start`, `go.mod` → `go run .` |

## 7. What I could not document

- **The native folder-picker itself.** `dialog.showOpenDialog` opens an OS window
  outside the renderer; `Page.captureScreenshot` cannot see it and CDP cannot
  click it. I verified the button fires, that the renderer survives the wait, and
  that the store transition the dialog resolves into produces the state described
  in §1 — but I did not see the dialog. A human should confirm its title, its
  start directory, and what happens on Cancel. **Cancel is worth checking:**
  `addProjectByPath` returns the unchanged store silently when the path is not a
  directory (`projects.ts:116-123`), so there is a path through this code that
  fails without a word.
- **`F1` and `Ctrl+K` via synthetic keys.** `Input.dispatchKeyEvent` did not
  trigger either handler in my run (the click-through from the **More** menu did
  not open the modal either — `contextMenu` items appear to need a real
  mousedown). I read the modal and its content out of `ShortcutsModal.tsx` and
  `shortcuts.ts` instead and diffed the README against them, but **I have not
  seen the F1 overlay render**, and the README points at it as the source of
  truth. Someone should press F1 once, with their hands.
- **The `not on PATH` state.** All three CLIs are installed on this machine, so
  every card was healthy and the "None were found on your PATH" branch of the
  first-run probe never rendered. The copy is in `NoProjects.tsx` and
  `CommandLauncher.tsx` and reads well, but nobody has watched it on a machine
  without the CLIs — which is precisely the machine a new user has.
- **The crash card.** I did not induce a crash, so `ErrorBoundary`'s copy and its
  *Copy diagnostics* button are unverified in situ.
- **Themes and styles other than Slate + Modern Pro.** Every judgement above is
  from the default skin. The label/no-label decision in §3 has to survive twelve
  styles, including `[data-style="crt"]`, which already carries its own
  `.deck-view-name` rule.
- **Windows below 1180px.** The media query collapses the view keys to icon-only
  there by design; I ran at 1386px and did not test the narrow layout, which is
  where any "always show labels" change will actually be decided.
