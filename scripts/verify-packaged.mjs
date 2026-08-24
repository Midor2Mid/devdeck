#!/usr/bin/env node
/**
 * verify-packaged.mjs - does the thing we SHIP actually run?
 *
 * `verify:terminal` drives the dev build (`electron out/main/index.js`). That is a
 * different claim from "the packaged app works": the artifact runs its code out of
 * an asar, with native modules unpacked beside it, under whatever Electron
 * electron-builder put in the bundle. The riskiest part of the Electron 33 -> 43
 * bump was exactly that - `@lydell/node-pty` ships per-ABI prebuilds - and a dev
 * build passing says nothing about the packaged one.
 *
 * Usage:
 *   npm run verify:packaged                        # release/win-unpacked/<productName>.exe
 *   node scripts/verify-packaged.mjs <path-to-exe>  # or point it somewhere else
 *
 * SKIPS (exit 0) when there is no packaged build, so this can sit in a chain
 * without demanding a 25s package step. Build one with `npm run package:dir`.
 *
 * Exit: 0 = passed or skipped - 1 = a check failed - 2 = usage error.
 * Zero dependencies: the CDP client is scripts/cdp.mjs.
 */
import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { targets, connect } from "./cdp.mjs"

/** electron-builder names the exe after productName, not the package name. */
export function defaultExe(root, pkg) {
    const product = pkg?.build?.productName ?? pkg?.productName ?? pkg?.name ?? "app"
    return join(root, "release", "win-unpacked", `${product}.exe`)
}

/** The Electron major this repo currently declares, or null if it declares none. */
export function expectedElectronMajor(pkg) {
    const range = pkg?.devDependencies?.electron ?? pkg?.dependencies?.electron
    const m = /(\d+)\./.exec(String(range ?? ""))
    return m ? m[1] : null
}

/**
 * Whether the running Electron is the one this repo expects: true, false, or null
 * for "cannot say". Null rather than true when there is nothing to compare, so an
 * unanswerable question is never reported as a pass. An artifact packaged BEFORE a
 * toolchain bump opens happily and passes every other check while being the old
 * binary, which is the case this exists for.
 */
export function matchesExpectedElectron(running, expected) {
    if (!expected || !running || running === "unknown") return null
    return String(running).split(".")[0] === String(expected)
}

const A = "pkg-pane-a"
const B = "pkg-pane-b"
const PORT = 9224
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** An isolated userData dir holding one project and one tab of two shells. */
function seedUserData(projectPath) {
    const dir = mkdtempSync(join(tmpdir(), "devdeck-pkg-"))
    writeFileSync(
        join(dir, "projects.json"),
        JSON.stringify({
            projects: [{ id: "vp", name: "verify", path: projectPath, addedAt: Date.now() }],
            activeId: "vp"
        })
    )
    writeFileSync(
        join(dir, "workspace.json"),
        JSON.stringify({
            termAgents: { [A]: "shell", [B]: "shell" },
            termInit: {},
            termCwd: {},
            termNames: { [A]: "left", [B]: "right" },
            // cmd, not the app default of powershell: an environment that cannot
            // spawn powershell leaves the panes blank, and a blank pane must fail
            // the shell check below rather than quietly satisfy it.
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
    return dir
}

async function main(argv) {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
    const exe = argv[0] ? resolve(argv[0]) : defaultExe(root, pkg)

    if (!existsSync(exe)) {
        console.log(`SKIPPED: no packaged build at ${exe}`)
        console.log("Build one with `npm run package:dir`, then run this again.")
        return 0
    }

    const results = []
    const check = (name, pass, detail = "") => {
        results.push({ name, pass })
        console.log(`${pass ? "  ok  " : "  FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
    }

    // Before launching anything: the native module has to be in the bundle at all.
    // A packaging step that silently drops it produces an app that opens fine and
    // has dead terminals.
    const unpacked = join(dirname(exe), "resources", "app.asar.unpacked", "node_modules", "@lydell")
    check("the pty native module was unpacked beside the asar", existsSync(unpacked), unpacked)

    const userData = seedUserData(root)
    const app = spawn(exe, [`--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`], {
        stdio: ["ignore", "pipe", "pipe"]
    })
    const appLog = []
    app.stdout.on("data", (d) => appLog.push(`[out] ${String(d).trim()}`))
    app.stderr.on("data", (d) => appLog.push(`[err] ${String(d).trim()}`))

    let cdp
    try {
        const list = await targets(PORT)
        const page = list.find((t) => t.type === "page")
        if (!page) throw new Error(`no page target: ${JSON.stringify(list.map((t) => t.type))}`)
        cdp = await connect(page.webSocketDebuggerUrl)
        await cdp.send("Runtime.enable")

        let panes = 0
        for (let i = 0; i < 60; i++) {
            panes = await cdp.eval("return document.querySelectorAll('[data-term-id]').length")
            if (panes >= 2) break
            await sleep(500)
        }
        check("the packaged app opens and mounts its panes", panes === 2, `panes=${panes}`)
        if (panes !== 2) throw new Error("cannot continue without the seeded layout")

        // The claim worth making: a pty spawned from inside the shipped bundle.
        let screen = ""
        for (let i = 0; i < 20; i++) {
            screen = await cdp.eval(
                "return [...document.querySelectorAll('.xterm-rows')].map(r => r.innerText).join('\\n')"
            )
            if (screen.trim().length) break
            await sleep(1000)
        }
        check(
            "a real shell is running inside it",
            screen.trim().length > 0,
            screen.replace(/\s+/g, " ").trim().slice(0, 50) || "TERMINALS ARE BLANK: no pty output at all"
        )

        const running = await cdp.eval(
            "return navigator.userAgent.match(/Electron\\/([0-9.]+)/)?.[1] ?? 'unknown'"
        )
        const expected = expectedElectronMajor(pkg)
        const fresh = matchesExpectedElectron(running, expected)
        if (fresh === null) {
            console.log(`  skip  Electron version not compared (running ${running}, expected ${expected ?? "unknown"})`)
        } else {
            check("built from the toolchain this repo declares", fresh, `Electron ${running}, expected ${expected}.x`)
        }
    } catch (err) {
        check("harness completed", false, String(err?.message ?? err))
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
    if (failed.length && appLog.length) {
        console.log("\n--- the app's own output ---")
        for (const line of appLog.slice(0, 20)) console.log(line)
    }
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    return failed.length ? 1 : 0
}

if (resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url))) {
    process.exit(await main(process.argv.slice(2)))
}
