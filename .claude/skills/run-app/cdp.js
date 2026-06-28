// Reusable harness to launch the built DevDeck Electron app and drive its
// renderer over the Chrome DevTools Protocol. Windows-native (no xvfb).
//
// Usage (see SKILL.md for the full recipe):
//   const { withApp, sleep } = require("./cdp")
//   withApp(async (cdp) => {
//       await cdp.click(".rail-btn[data-tip^='Network']")
//       await cdp.click(".net-toggle")
//       await sleep(800)
//       console.log(await cdp.evalu("window.api.proxy.status()", true))
//       await cdp.screenshot("C:/path/to/shot.png")
//   })
const { spawn, execFileSync } = require("child_process")
const http = require("http")
const fs = require("fs")
const path = require("path")

// repo root = <repo>/.claude/skills/run-app/ -> ../../..
const PROJ = path.resolve(__dirname, "../../..")
// The bundled deps must be required by absolute path (this file runs from .claude).
const WebSocket = require(path.join(PROJ, "node_modules/ws"))
const electronPath = require(path.join(PROJ, "node_modules/electron"))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// GET JSON with a hard timeout so a stalled CDP endpoint can't hang the run.
function getJson(url, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let b = ""
            res.on("data", (d) => (b += d))
            res.on("end", () => {
                try {
                    resolve(JSON.parse(b))
                } catch (e) {
                    reject(e)
                }
            })
        })
        req.on("error", reject)
        req.setTimeout(timeoutMs, () => req.destroy(new Error("getJson timeout")))
    })
}

class CDP {
    constructor(ws) {
        this.ws = ws
        this.id = 0
        this.pending = new Map()
        ws.on("message", (raw) => {
            let m
            try {
                m = JSON.parse(raw)
            } catch {
                return
            }
            if (m.id && this.pending.has(m.id)) {
                this.pending.get(m.id)(m)
                this.pending.delete(m.id)
            }
        })
    }
    // Every command rejects after timeoutMs so one stuck call can't wedge the run.
    send(method, params = {}, timeoutMs = 15000) {
        const id = ++this.id
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`))
            }, timeoutMs)
            this.pending.set(id, (m) => {
                clearTimeout(timer)
                resolve(m)
            })
            try {
                this.ws.send(JSON.stringify({ id, method, params }))
            } catch (e) {
                clearTimeout(timer)
                this.pending.delete(id)
                reject(e)
            }
        })
    }
    // Evaluate JS in the renderer. Set awaitPromise for `window.api.*` calls.
    async evalu(expression, awaitPromise = false) {
        const r = await this.send("Runtime.evaluate", {
            expression,
            awaitPromise,
            returnByValue: true
        })
        if (r.result && r.result.exceptionDetails) {
            throw new Error(JSON.stringify(r.result.exceptionDetails))
        }
        return r.result && r.result.result ? r.result.result.value : undefined
    }
    // Click the first element matching a CSS selector; returns whether it existed.
    click(selector) {
        return this.evalu(
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.click(); return !!el; })()`
        )
    }
    text(selector) {
        return this.evalu(
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent.trim() : null; })()`
        )
    }
    async screenshot(file) {
        const shot = await this.send("Page.captureScreenshot", { format: "png" })
        if (shot.result && shot.result.data) {
            fs.writeFileSync(file, Buffer.from(shot.result.data, "base64"))
            return file
        }
        throw new Error("captureScreenshot returned no data")
    }
}

// Force-kill the Electron process *tree*. On Windows `proc.kill()` only signals
// the launcher; Electron's GPU/renderer/utility children survive and keep Node's
// child handle open, so the run never exits. taskkill /T /F reaps the whole tree.
function killTree(proc) {
    if (proc.pid) {
        try {
            execFileSync("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore" })
            return
        } catch {
            /* fall through to a plain kill */
        }
    }
    try {
        proc.kill("SIGKILL")
    } catch {
        /* already gone */
    }
}

// Launch the built app, attach to the renderer, run `fn(cdp)`, then tear down
// hard so Node exits promptly. Requires a current build (`npx electron-vite build`).
async function withApp(fn, { debugPort = 9222 } = {}) {
    const proc = spawn(electronPath, [".", `--remote-debugging-port=${debugPort}`], {
        cwd: PROJ,
        env: process.env,
        stdio: "ignore"
    })
    proc.on("error", () => {}) // don't let a spawn error become unhandled
    let ws = null
    const cleanup = () => {
        if (ws) {
            try {
                ws.removeAllListeners()
                ws.terminate() // immediate close - don't wait on a handshake from a dying process
            } catch {
                /* ignore */
            }
            ws = null
        }
        killTree(proc)
        try {
            proc.unref()
        } catch {
            /* ignore */
        }
    }
    try {
        let page = null
        for (let i = 0; i < 40 && !page; i++) {
            await sleep(500)
            try {
                const list = await getJson(`http://127.0.0.1:${debugPort}/json/list`)
                page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl)
            } catch {
                /* renderer not up yet */
            }
        }
        if (!page) throw new Error("renderer target never appeared (is the app built?)")

        ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error("ws open timed out")), 10000)
            ws.once("open", () => {
                clearTimeout(t)
                resolve()
            })
            ws.once("error", (e) => {
                clearTimeout(t)
                reject(e)
            })
        })

        const cdp = new CDP(ws)
        await cdp.send("Runtime.enable")
        await cdp.send("Page.enable")
        await sleep(1500) // let React mount
        await fn(cdp)
    } finally {
        cleanup()
    }
}

module.exports = { withApp, sleep, PROJ, killTree }
