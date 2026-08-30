import { describe, it, expect, beforeEach, vi } from "vitest"

interface Fake {
    onDataCb?: (d: string) => void
    onExitCb?: (e: { exitCode: number }) => void
}
let fakes: Fake[] = []

vi.mock("@lydell/node-pty", () => ({
    spawn: (): unknown => {
        const f: Fake = {}
        fakes.push(f)
        return {
            onData: (cb: (d: string) => void): void => {
                f.onDataCb = cb
            },
            onExit: (cb: (e: { exitCode: number }) => void): void => {
                f.onExitCb = cb
            },
            write: (): void => undefined,
            resize: (): void => undefined,
            kill: (): void => undefined
        }
    }
}))

const pty = await import("../src/main/pty")

const ID = "t-tail"
const feed = (s: string): void => fakes[fakes.length - 1].onDataCb?.(s)
const exit = (code: number): void => fakes[fakes.length - 1].onExitCb?.({ exitCode: code })

describe("main keeps a readable tail per session", () => {
    beforeEach(() => {
        fakes = []
        pty.killAll()
        pty.createPty({ id: ID })
    })

    it("strips control noise across chunk boundaries", () => {
        feed("\x1b[32mDo you want to proceed?\x1b[0m\r\n")
        feed("❯ 1. Yes\r\n  2. No (esc)\r\n")
        expect(pty.getTail(ID, 3)).toBe("Do you want to proceed?\n❯ 1. Yes\n2. No (esc)")
    })

    it("strips an escape sequence split across two chunks", () => {
        feed("\x1b[3")
        feed("2mok\x1b[0m\r\n")
        expect(pty.getTail(ID, 1)).toBe("ok")
    })

    it("resets the tail on a restart over a corpse, instead of blending it with the dead process's text", () => {
        feed("old process output\r\n")
        exit(1) // process dies; the buffer (and, before the fix, the tail) survives as a corpse
        pty.createPty({ id: ID }) // restart over the corpse - a fresh live entry
        feed("new line\r\n")
        expect(pty.getTail(ID, 16)).toBe("new line")
    })

    it("returns an empty string for a session it has never seen", () => {
        expect(pty.getTail("nope", 16)).toBe("")
    })

    it("digests exactly the string getTail returns", () => {
        feed("hello\r\n")
        const a = pty.tailDigest(ID, 16)
        expect(a).toMatch(/^[0-9a-f]{64}$/)
        feed("world\r\n")
        expect(pty.tailDigest(ID, 16)).not.toBe(a)
    })

    it("does not grow without bound", () => {
        for (let i = 0; i < 500; i++) feed("line " + i + "\r\n")
        expect(pty.getTail(ID, 16).split("\n").length).toBe(16)
    })
})
