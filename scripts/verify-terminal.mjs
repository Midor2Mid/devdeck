/**
 * Drives the real DevDeck renderer and checks the terminal chords that no unit
 * test can reach: focus actually moving, no escape bytes reaching the shell, and
 * the zoom filling the stage rather than the window.
 *
 * Runs against an ISOLATED --user-data-dir seeded with one project and one tab of
 * two shells, so it never touches the real project list or workspace.
 *
 * Usage:  npm run build && npm run verify:terminal      (VERBOSE=1 to see app logs)
 *
 * Deliberately NOT part of `npm test`: it needs a build, spawns a real Electron
 * window, and takes ~20s. It is the gate to run when the terminal chords, the
 * zoom, or the undo path change - the four things a vitest run cannot see.
 */
import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { targets, connect } from "./cdp.mjs"

const WORKTREE = resolve(dirname(fileURLToPath(import.meta.url)), "..")
if (!existsSync(join(WORKTREE, "out", "main", "index.js"))) {
    console.error("no build found - run `npm run build` first (this drives the built app, not dev mode)")
    process.exit(2)
}
const PORT = 9223
const A = "verify-pane-a"
const B = "verify-pane-b"

const userData = mkdtempSync(join(tmpdir(), "devdeck-verify-"))
writeFileSync(
    join(userData, "projects.json"),
    JSON.stringify({
        projects: [{ id: "vp", name: "verify", path: WORKTREE, addedAt: Date.now() }],
        activeId: "vp"
    })
)
writeFileSync(
    join(userData, "workspace.json"),
    JSON.stringify({
        termAgents: { [A]: "shell", [B]: "shell" },
        termInit: {},
        termCwd: {},
        termNames: { [A]: "left", [B]: "right" },
        // cmd, not the app's default of powershell: this environment cannot spawn
        // powershell.exe at all (exit 3221226505), so the default left both panes
        // blank while every check still passed. The shell only has to be a shell.
        termShells: { [A]: "cmd", [B]: "cmd" },
        tabsByProject: {
            vp: [
                {
                    id: "vt",
                    name: "split",
                    root: {
                        kind: "split",
                        dir: "row",
                        children: [
                            { kind: "leaf", termId: A },
                            { kind: "leaf", termId: B }
                        ]
                    }
                }
            ]
        },
        activeTabByProject: { vp: "vt" },
        activePaneByProject: { vp: A },
        composerDrafts: {},
        view: "terminal",
        termLayout: "tabs",
        canvasPos: {},
        canvasLinks: [],
        boardTasks: []
    })
)

const results = []
const check = (name, pass, detail = "") => {
    results.push({ name, pass, detail })
    console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail ? " - " + detail : ""}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const electron = join(WORKTREE, "node_modules", "electron", "dist", "electron.exe")
const app = spawn(
    electron,
    [join(WORKTREE, "out", "main", "index.js"), `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`],
    { cwd: WORKTREE, stdio: ["ignore", "pipe", "pipe"] }
)
app.stdout.on("data", (d) => process.env.VERBOSE && console.log("[app]", String(d).trim()))
app.stderr.on("data", (d) => process.env.VERBOSE && console.log("[app!]", String(d).trim()))

let cdp
try {
    const list = await targets(PORT)
    const page = list.find((t) => t.type === "page" && t.url.includes("index.html")) || list.find((t) => t.type === "page")
    if (!page) throw new Error("no page target: " + JSON.stringify(list.map((t) => [t.type, t.url])))
    cdp = await connect(page.webSocketDebuggerUrl)
    await cdp.send("Runtime.enable")
    await cdp.send("Page.enable")

    // Wait for both seeded panes to mount and their ptys to print a prompt.
    let mounted = 0
    for (let i = 0; i < 60; i++) {
        mounted = await cdp.eval("return document.querySelectorAll('[data-term-id]').length")
        if (mounted >= 2) break
        await sleep(500)
    }
    check("two seeded panes mounted", mounted === 2, `found ${mounted}`)
    if (mounted !== 2) throw new Error("cannot continue without the seeded layout")
    await sleep(2500) // let both shells settle and print a prompt

    const focused = () => cdp.eval("return document.querySelector('.term-pane.focused')?.dataset.termId ?? null")
    const order = await cdp.eval(
        "return [...document.querySelectorAll('[data-term-id]')].map(e => e.dataset.termId)"
    )

    // 1. Alt+2 jumps by position.
    await cdp.key("Digit2", "2", { alt: true })
    await sleep(400)
    const afterAlt2 = await focused()
    check("Alt+2 focuses the second session", afterAlt2 === order[1], `focused=${afterAlt2} expected=${order[1]}`)

    // 2. Alt+1 goes back.
    await cdp.key("Digit1", "1", { alt: true })
    await sleep(400)
    const afterAlt1 = await focused()
    check("Alt+1 focuses the first session", afterAlt1 === order[0], `focused=${afterAlt1}`)

    // 3. Alt+Right / Alt+Left move between panes.
    await cdp.key("ArrowRight", "ArrowRight", { alt: true })
    await sleep(400)
    const right = await focused()
    check("Alt+Right moves focus to the right pane", right === order[1], `focused=${right}`)
    await cdp.key("ArrowLeft", "ArrowLeft", { alt: true })
    await sleep(400)
    const left = await focused()
    check("Alt+Left moves focus back", left === order[0], `focused=${left}`)

    // 4. A shell is actually RUNNING and printing. This must come BEFORE the
    //    negative assertion below, because a blank screen satisfies that one
    //    perfectly. Not hypothetical: on 2026-08-24 this harness reported 14/14
    //    with both terminals empty, because the app's default shell (powershell)
    //    cannot spawn in this environment. A negative assertion with no positive
    //    one beside it proves nothing at all.
    let screen = ""
    for (let i = 0; i < 20; i++) {
        screen = await cdp.eval(
            "return [...document.querySelectorAll('.xterm-rows')].map(r => r.innerText).join('\\n')"
        )
        if (screen.trim().length) break
        await sleep(1000)
    }
    check(
        "a real shell is running and printing",
        screen.trim().length > 0,
        screen.replace(/\s+/g, " ").trim().slice(0, 50) || "TERMINALS ARE BLANK: no pty output at all"
    )

    // 5. And it did not receive the arrow's escape sequence. xterm renders
    //    unprintable input as visible text, so junk would show up here.
    const junk = /\[1;3[A-D]|\^\[/.test(screen)
    check("no escape sequence reached the shell", !junk, junk ? "found escape text on screen" : "")

    // 5. Zoom fills the stage, not the window (the tab bar stays visible).
    await cdp.key("KeyZ", "Z", { ctrl: true, shift: true })
    await sleep(500)
    const zoom = await cdp.eval(`
        const z = document.querySelector('.pane-zoomed')
        const stage = document.querySelector('.stage-body')
        const bar = document.querySelector('.term-tabbar')
        if (!z || !stage || !bar) return { missing: { z: !!z, stage: !!stage, bar: !!bar } }
        const zr = z.getBoundingClientRect(), sr = stage.getBoundingClientRect(), br = bar.getBoundingClientRect()
        const near = (a, b) => Math.abs(a - b) < 2
        return {
            fillsStage: near(zr.top, sr.top) && near(zr.left, sr.left) && near(zr.width, sr.width) && near(zr.height, sr.height),
            coversTabBar: zr.top < br.bottom - 2,
            zoomRect: { t: Math.round(zr.top), l: Math.round(zr.left), w: Math.round(zr.width), h: Math.round(zr.height) },
            stageRect: { t: Math.round(sr.top), l: Math.round(sr.left), w: Math.round(sr.width), h: Math.round(sr.height) }
        }
    `)
    check("Ctrl+Shift+Z fills the stage", zoom.fillsStage === true, JSON.stringify(zoom))
    check("zoom does not cover the tab bar", zoom.coversTabBar === false)

    // 6. Unzoom restores the split.
    await cdp.key("KeyZ", "Z", { ctrl: true, shift: true })
    await sleep(500)
    const stillZoomed = await cdp.eval("return !!document.querySelector('.pane-zoomed')")
    const bothWide = await cdp.eval(`
        const r = [...document.querySelectorAll('[data-term-id]')].map(e => e.getBoundingClientRect().width)
        return r.length === 2 && r.every(w => w > 50)
    `)
    check("Ctrl+Shift+Z again restores the split", stillZoomed === false && bothWide === true)

    // 7. Holding Alt reveals the tab jump numbers.
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers: 1, code: "AltLeft", key: "Alt", windowsVirtualKeyCode: 18 })
    await sleep(300)
    const badges = await cdp.eval("return document.querySelectorAll('.tab-index').length")
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 0, code: "AltLeft", key: "Alt", windowsVirtualKeyCode: 18 })
    await sleep(300)
    const afterRelease = await cdp.eval("return document.querySelectorAll('.tab-index').length")
    check("holding Alt reveals tab numbers", badges >= 1, `badges=${badges}`)
    check("releasing Alt hides them again", afterRelease === 0, `badges=${afterRelease}`)

    // 8. Close the focused pane, then Undo it.
    await cdp.key("KeyW", "W", { ctrl: true, shift: true })
    await sleep(600)
    const afterClose = await cdp.eval("return document.querySelectorAll('[data-term-id]').length")
    const toast = await cdp.eval(
        "return [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')"
    )
    check("Ctrl+Shift+W closes the pane", afterClose === 1, `panes=${afterClose}`)
    check("closing offers Undo", /Undo/.test(toast), toast)

    await cdp.eval("document.querySelector('.toast-action')?.click(); return null")
    await sleep(1200)
    const afterUndo = await cdp.eval("return document.querySelectorAll('[data-term-id]').length")
    check("Undo brings the session back", afterUndo === 2, `panes=${afterUndo}`)

    const errors = await cdp.eval(`
        return (window.__verifyErrors || []).slice(0, 5)
    `)
    if (errors && errors.length) check("no renderer errors", false, JSON.stringify(errors))
} catch (err) {
    check("harness completed", false, String(err && err.message ? err.message : err))
} finally {
    cdp?.close()
    app.kill()
    await sleep(500)
    try {
        rmSync(userData, { recursive: true, force: true })
    } catch {
        /* the app may still hold a handle; a temp dir left behind is harmless */
    }
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
