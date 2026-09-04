import { describe, it, expect } from "vitest"
import { manifestFiles, manifestPath, manifestSha512, patchManifest, artifactNames } from "../scripts/update-manifest.mjs"

// A real latest.yml, as electron-builder 26 writes it for an nsis + portable
// Windows build. The sha512 is repeated on purpose: electron-updater reads the
// top-level pair, and the entry under `files:` is what a multi-arch release
// would key off. Both have to move together or the manifest contradicts itself.
const REAL = `version: 0.12.0
files:
  - url: DevDeck-Setup-0.12.0.exe
    sha512: 542pzoUKUIxFLwFXsbBJrvn3Tf0ANN56fjWW0xZ0SI86CIVRBXU7MiY0mR6Hb45mPyph0MV55w+tPw08jMh6Nw==
    size: 114789008
path: DevDeck-Setup-0.12.0.exe
sha512: 542pzoUKUIxFLwFXsbBJrvn3Tf0ANN56fjWW0xZ0SI86CIVRBXU7MiY0mR6Hb45mPyph0MV55w+tPw08jMh6Nw==
releaseDate: '2026-09-03T08:27:55.861Z'
`

describe("reading the manifest", () => {
    it("reads the single file entry", () => {
        expect(manifestFiles(REAL)).toEqual([
            {
                url: "DevDeck-Setup-0.12.0.exe",
                sha512: "542pzoUKUIxFLwFXsbBJrvn3Tf0ANN56fjWW0xZ0SI86CIVRBXU7MiY0mR6Hb45mPyph0MV55w+tPw08jMh6Nw==",
                size: 114789008,
                blockMapSize: null
            }
        ])
    })

    it("reads the top-level path and sha512", () => {
        expect(manifestPath(REAL)).toBe("DevDeck-Setup-0.12.0.exe")
        expect(manifestSha512(REAL)).toBe(manifestFiles(REAL)[0].sha512)
    })

    // `path:` and `releaseDate:` are not indented, so they are outside the list.
    // A parser that kept consuming would fold them into the last entry.
    it("stops at the end of the files block", () => {
        expect(manifestFiles(REAL)).toHaveLength(1)
    })

    it("survives CRLF", () => {
        expect(manifestFiles(REAL.replace(/\n/g, "\r\n"))[0].size).toBe(114789008)
        expect(manifestPath(REAL.replace(/\n/g, "\r\n"))).toBe("DevDeck-Setup-0.12.0.exe")
    })
})

describe("patchManifest", () => {
    const next = { url: "DevDeck-Setup-0.12.0.exe", sha512: "NEWHASH+with/base64==", size: 114790000 }

    it("moves both copies of the sha512 and the size", () => {
        const out = patchManifest(REAL, next)
        expect(manifestSha512(out)).toBe(next.sha512)
        expect(manifestFiles(out)[0]).toMatchObject({ sha512: next.sha512, size: next.size })
        expect(out).not.toContain("542pzoUKUIx")
        expect(out).not.toContain("114789008")
    })

    it("leaves everything else alone", () => {
        const out = patchManifest(REAL, next)
        expect(out).toContain("version: 0.12.0")
        expect(out).toContain("path: DevDeck-Setup-0.12.0.exe")
        expect(out).toContain("releaseDate: '2026-09-03T08:27:55.861Z'")
    })

    it("keeps CRLF line endings when the input had them", () => {
        const out = patchManifest(REAL.replace(/\n/g, "\r\n"), next)
        expect(out.includes("\r\n")).toBe(true)
    })

    // The failure this whole script exists to prevent is a manifest that
    // describes bytes nobody has. Refusing is always better than guessing.
    it("refuses a manifest naming a different artifact", () => {
        expect(() => patchManifest(REAL, { ...next, url: "DevDeck-Setup-0.13.0.exe" })).toThrow(/manifest names/)
    })

    it("refuses a manifest with more than one file entry", () => {
        const two = REAL.replace(
            "path: DevDeck-Setup-0.12.0.exe",
            "  - url: DevDeck-Setup-0.12.0-arm64.exe\n    sha512: other==\n    size: 1\npath: DevDeck-Setup-0.12.0.exe"
        )
        expect(manifestFiles(two)).toHaveLength(2)
        expect(() => patchManifest(two, next)).toThrow(/exactly 1 entry/)
    })

    // nsis-web and AppImage append the blockmap to the artifact itself and
    // record its length here. Re-signing changes that length, and no amount of
    // editing a number fixes it - the blockmap has to be re-appended.
    it("refuses a manifest carrying an embedded blockMapSize", () => {
        const embedded = REAL.replace("    size: 114789008", "    size: 114789008\n    blockMapSize: 121158")
        expect(() => patchManifest(embedded, next)).toThrow(/blockMapSize/)
    })

    it("refuses when the top-level path disagrees with the entry", () => {
        const skewed = REAL.replace("path: DevDeck-Setup-0.12.0.exe", "path: DevDeck Setup 0.12.0.exe")
        expect(() => patchManifest(skewed, next)).toThrow(/top-level path/)
    })
})

describe("artifactNames", () => {
    it("derives all four names the way electron-builder's artifactName templates do", () => {
        expect(artifactNames({ version: "1.2.3", build: { productName: "DevDeck" } })).toEqual({
            installer: "DevDeck-Setup-1.2.3.exe",
            blockmap: "DevDeck-Setup-1.2.3.exe.blockmap",
            portable: "DevDeck-Portable-1.2.3.exe",
            manifest: "latest.yml"
        })
    })

    it("falls back to the package name when productName is unset", () => {
        expect(artifactNames({ version: "1.2.3", name: "thing" }).installer).toBe("thing-Setup-1.2.3.exe")
    })
})

describe("the blockmap builder this depends on", () => {
    // --rewrite reuses electron-builder's OWN blockmap implementation rather
    // than reimplementing content-defined chunking, which is the only way the
    // regenerated file can be byte-identical to the one the build produced.
    // That means a deep import into a devDependency's internals, so this test
    // exists to fail loudly on the day a builder bump moves it, instead of
    // letting a release ship a blockmap for bytes nobody has.
    it("is still exported from the path --rewrite imports", async () => {
        const mod = await import("app-builder-lib/out/targets/blockmap/blockmap.js")
        expect(typeof mod.buildBlockMap).toBe("function")
    })
})
