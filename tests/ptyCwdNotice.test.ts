import { describe, it, expect, vi } from "vitest"

// pty.ts pulls in the native binding at import time; the notice itself is pure,
// so the mock only has to exist.
vi.mock("@lydell/node-pty", () => ({ spawn: (): unknown => ({ on: () => undefined }) }))
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp/devdeck-test" } }))

const { cwdNotice } = await import("../src/main/pty")

describe("the corpse notice for a cwd DevDeck would not spawn into", () => {
    it("names the folder in both states", () => {
        expect(cwdNotice("D:/gone", "missing")).toContain("folder: D:/gone")
        expect(cwdNotice("//nas/share", "unchecked")).toContain("folder: //nas/share")
    })

    it("sends nobody to fix a shell that is fine", () => {
        // The missing-SHELL branch's copy points at Settings -> Terminal. That
        // is a wrong diagnosis here, and it is the misattribution this whole
        // seam exists to prevent.
        expect(cwdNotice("D:/gone", "missing")).not.toContain("Settings -> Terminal")
        expect(cwdNotice("//nas/share", "unchecked")).not.toContain("Settings -> Terminal")
    })

    it("says the folder is not there only when the OS said so", () => {
        expect(cwdNotice("D:/gone", "missing")).toContain("isn't there right now")
    })

    it("claims nothing about a folder it could not check", () => {
        // EACCES, an unmounted drive, a path the OS rejects: we could not look.
        // Saying "that folder isn't there" would attribute to the folder what
        // belongs to the attempt - and would contradict the UNCHECKED pill the
        // same project wears in the switcher.
        const notice = cwdNotice("//nas/share", "unchecked")
        expect(notice).not.toContain("isn't there")
        expect(notice).toContain("couldn't check that folder")
    })

    it("gives the two states different text", () => {
        expect(cwdNotice("D:/x", "missing")).not.toBe(cwdNotice("D:/x", "unchecked"))
    })
})
