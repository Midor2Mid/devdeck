import { describe, it, expect, vi, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// atomic.ts sits under fifteen main modules and had no test at all: the one
// property it exists for was asserted nowhere.
//
// `fs` is mocked with a passthrough factory rather than spied: its ESM namespace
// is not configurable, so vi.spyOn(fs, "renameSync") throws. Each hook below is
// null unless a test sets it, so every other call reaches the real fs.
const h = vi.hoisted(() => ({
    onRename: null as null | ((from: string, to: string) => void),
    onFsync: null as null | ((fd: number) => void)
}))

vi.mock("fs", async (importOriginal) => {
    const real = await importOriginal<typeof import("fs")>()
    return {
        ...real,
        default: real,
        renameSync: (from: string, to: string): void =>
            h.onRename ? h.onRename(from, to) : real.renameSync(from, to),
        fsyncSync: (fd: number): void => (h.onFsync ? h.onFsync(fd) : real.fsyncSync(fd))
    }
})

import { atomicWrite } from "../src/main/atomic"

function tempDir(): string {
    return mkdtempSync(join(tmpdir(), "atomic-"))
}

afterEach(() => {
    h.onRename = null
    h.onFsync = null
})

describe("atomicWrite", () => {
    it("replaces the target's contents and leaves nothing behind", () => {
        const dir = tempDir()
        const f = join(dir, "store.json")
        writeFileSync(f, "old", "utf8")
        atomicWrite(f, "new")
        expect(readFileSync(f, "utf8")).toBe("new")
        expect(readdirSync(dir)).toEqual(["store.json"])
    })

    it("leaves the original intact, and no debris, when the rename fails", () => {
        const dir = tempDir()
        const f = join(dir, "store.json")
        writeFileSync(f, "the user's real data", "utf8")

        h.onRename = () => {
            throw new Error("EPERM: locked by a virus scanner")
        }

        expect(() => atomicWrite(f, "replacement")).toThrow("EPERM")
        expect(readFileSync(f, "utf8")).toBe("the user's real data")
        // A fixed `<file>.tmp` used to be left sitting beside the store.
        expect(readdirSync(dir)).toEqual(["store.json"])
    })

    it("flushes the temp file before renaming it into place", () => {
        const dir = tempDir()
        const f = join(dir, "store.json")
        const order: string[] = []
        h.onFsync = () => order.push("fsync")
        h.onRename = () => order.push("rename")

        atomicWrite(f, "data")

        // The fsync is what makes the doc comment true against a machine crash.
        // The crash itself is not assertable in-process, so this pins the order:
        // a rename that reaches disk before its data is the zero-length store.
        expect(order.indexOf("fsync")).toBeGreaterThanOrEqual(0)
        expect(order.indexOf("fsync")).toBeLessThan(order.indexOf("rename"))
    })

    it("uses a temp name no other writer can collide with", () => {
        const dir = tempDir()
        const f = join(dir, "store.json")
        const seen: string[] = []
        h.onRename = (from) => {
            seen.push(from)
        }

        atomicWrite(f, "a")
        atomicWrite(f, "b")

        expect(seen).toHaveLength(2)
        expect(seen[0]).not.toBe(seen[1])
        // Not the old fixed name, which two instances would both have claimed.
        expect(seen[0]).not.toBe(f + ".tmp")
        expect(seen[0]).toContain("." + process.pid + ".")
    })

    it("round-trips a Buffer byte-identically", () => {
        const dir = tempDir()
        const f = join(dir, "shot.png")
        // A PNG header: bytes that would not survive a utf8 round-trip.
        const payload = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00])
        atomicWrite(f, payload)
        expect(readFileSync(f).equals(payload)).toBe(true)
    })
})
