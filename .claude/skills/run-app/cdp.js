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
const { spawn } = require("child_process")
const http = require("http")
const fs = require("fs")
const path = require("path")

// repo root = <repo>/.claude/skills/run-app/ -> ../../..
const PROJ = path.resolve(__dirname, "../../..")
// The bundled deps must be required by absolute path (this file runs from .claude).
const WebSocket = require(path.join(PROJ, "node_modules/ws"))
const electronPath = require(path.join(PROJ, "node_modules/electron"))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let b = ""
            res.on("data", (d) => (b += d))
            res.on("end", () => resolve(JSON.parse(b)))
        }).on("error", reject)
    })
}

class CDP {
    constructor(ws) {
        this.ws = ws
        this.id = 0
        this.pending = new Map()
        ws.on("message", (raw) => {
            const m = JSON.parse(raw)
            if (m.id && this.pending.has(m.id)) {
                this.pending.get(m.id)(m)
                this.pending.delete(m.id)
            }
        })
    }
    send(method, params = {}) {
        const id = ++this.id
        return new Promise((resolve) => {
            this.pending.set(id, resolve)
            this.ws.send(JSON.stringify({ id, method, params }))
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

// Launch the built app, attach to the renderer, run `fn(cdp)`, then clean up.
// Requires a current build: run `npx electron-vite build` first.
async function withApp(fn, { debugPort = 9222 } = {}) {
    const proc = spawn(electronPath, [".", `--remote-debugging-port=${debugPort}`], {
        cwd: PROJ,
        env: process.env,
        stdio: "ignore"
    })
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
        const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
        await new Promise((r) => ws.on("open", r))
        const cdp = new CDP(ws)
        await cdp.send("Runtime.enable")
        await cdp.send("Page.enable")
        await sleep(1500) // let React mount
        await fn(cdp)
        ws.close()
    } finally {
        proc.kill()
    }
}

module.exports = { withApp, sleep, PROJ }
