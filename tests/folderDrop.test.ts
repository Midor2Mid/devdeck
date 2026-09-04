import { describe, it, expect } from "vitest"
import { classifyDrop } from "../src/renderer/src/folderDrop"

describe("classifyDrop", () => {
    it("opens a dropped folder", () => {
        expect(classifyDrop([{ path: "C:/code/app", isDirectory: true }])).toEqual({
            kind: "open",
            paths: ["C:/code/app"]
        })
    })

    it("says a file is a file rather than doing nothing", () => {
        expect(classifyDrop([{ path: "C:/code/app/README.md", isDirectory: false }])).toEqual({
            kind: "file"
        })
    })

    it("sends an unclassifiable item to main instead of calling it a file", () => {
        // Chromium gave us no entry. That is not evidence of a file, and main
        // stats the path anyway - so this must not take the "file" branch.
        expect(classifyDrop([{ path: "C:/code/app", isDirectory: null }])).toEqual({
            kind: "open",
            paths: ["C:/code/app"]
        })
    })

    it("ignores an item with no resolvable path", () => {
        expect(classifyDrop([{ path: "", isDirectory: null }])).toEqual({ kind: "nothing" })
    })

    it("says nothing about the file half of a mixed drop that opened something", () => {
        const v = classifyDrop([
            { path: "C:/code/app/README.md", isDirectory: false },
            { path: "C:/code/app", isDirectory: true }
        ])
        expect(v).toEqual({ kind: "open", paths: ["C:/code/app"] })
    })

    it("opens every folder in a multi-folder drop", () => {
        expect(
            classifyDrop([
                { path: "C:/a", isDirectory: true },
                { path: "C:/b", isDirectory: true }
            ])
        ).toEqual({ kind: "open", paths: ["C:/a", "C:/b"] })
    })

    it("is nothing for an empty drop", () => {
        expect(classifyDrop([])).toEqual({ kind: "nothing" })
    })

    it("still names a file we could not get a path for", () => {
        // The entry told us it was a file; only the path resolution failed. The
        // honest answer is still "that was a file", not silence.
        expect(classifyDrop([{ path: "", isDirectory: false }])).toEqual({ kind: "file" })
    })
})
