---
name: run-app
description: Launch and drive the DevDeck Electron app on Windows to verify a change in the real UI — opens the built app, attaches to the renderer over the DevTools Protocol, clicks/evaluates/screenshots, and looks at the result. Use when asked to run the app, try a feature, screenshot the UI, or confirm a change works in the real window (not just tests).
---

# Running DevDeck

DevDeck is an Electron + React desktop app that runs **natively on Windows**
(no xvfb, no Linux container). There is no Playwright in this repo. The verified
way to drive the GUI programmatically is to launch the built app with Chrome
remote-debugging enabled and talk to its renderer over the DevTools Protocol
using the bundled `ws`. The harness for this is `cdp.js` next to this file.

## 1. Build first (always)

The harness loads `out/` (it does **not** start the vite dev server), so a stale
build shows stale UI. Rebuild before every run after a source change:

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && npx electron-vite build
```

## 2. Write a scenario and run it

Write a small Node script (put it in the scratchpad, not the repo) that uses the
harness. `cdp.click(sel)`, `cdp.text(sel)`, `cdp.evalu(js, awaitPromise)`, and
`cdp.screenshot(file)` are the building blocks. Always finish by saving a PNG and
**Read-ing it** — a blank frame means the app failed to launch.

```js
// scratchpad/scenario.js
const { withApp, sleep } = require("D:/Personal/Personal Projects/Products/devdeck/.claude/skills/run-app/cdp")
const SHOT = "C:/Users/Admin/AppData/Local/Temp/claude/.../scratchpad/shot.png"

withApp(async (cdp) => {
    // Navigate the icon rail. Buttons carry a data-tip; match by prefix.
    await cdp.click(".rail-btn[data-tip^='Network']")
    await sleep(400)
    // Drive a real button.
    await cdp.click(".net-toggle")
    await sleep(800)
    // Call a preload API directly (await its promise).
    console.log(await cdp.evalu("window.api.proxy.status()", true))
    await cdp.screenshot(SHOT)
}).then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
```

Run it from the **project directory** (so child-process cwd is correct):

```bash
cd "D:/Personal/Personal Projects/Products/devdeck" && node "<scratchpad>/scenario.js"
```

## Generating traffic / external input

The renderer's own `window.api.http.send` uses the main process's native fetch —
it does **not** flow through the capture proxy. To exercise the Network panel,
start the proxy (UI or `window.api.proxy.start(8899)`) and make requests from the
Node side through it (`http.request({ host:'127.0.0.1', port:8899, path:'http://…' })`),
ideally against a throwaway local server so the run is offline + deterministic.

## Gotchas (learned the hard way)

- **Require bundled deps by absolute path.** A scratchpad script can't resolve
  `require("ws")`; the harness already requires `ws`/`electron` from the repo's
  `node_modules`. `require("electron")` returns the path to `electron.exe`.
- **React re-render race.** After `cdp.click()` that flips React state (e.g. an
  inspector tab), the DOM updates on the *next* render. Query it in a **separate**
  `evalu` after a short `sleep`, not in the same expression as the click.
- **Teardown is force-killed (handled).** `proc.kill()` alone does *not* reap
  Electron's GPU/renderer/utility children on Windows — they keep Node's child
  handle open and the run hangs until the outer timeout, leaving stray
  `electron.exe`. The harness now `taskkill /T /F`s the whole tree, `ws.terminate()`s
  (no close handshake with a dying process), and `unref()`s — so runs exit in ~3s.
  Still pass a **unique `debugPort`** if running concurrently.
- **Everything is timeout-guarded.** Each CDP `send()` rejects after 15s, `ws`
  open after 10s, and `getJson` after 4s — a stuck call fails the run instead of
  wedging it. Wrap your own long waits similarly.
- **Wait for the page target.** The renderer takes ~1–2s; the harness polls
  `/json/list` for a `type:"page"` target before attaching.

## Quick smoke (no scenario)

To just confirm the app boots, the harness alone proves the renderer target
appears; add `await cdp.screenshot(...)` and look at it.
