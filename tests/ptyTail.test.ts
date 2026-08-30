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
