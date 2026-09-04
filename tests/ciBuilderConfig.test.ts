import { describe, it, expect } from "vitest"
import { ciConfig } from "../scripts/ci-builder-config.mjs"

// The committed configuration, as package.json carries it.
const BUILD = {
    appId: "com.devdeck.app",
    productName: "DevDeck",
    directories: { output: "release", buildResources: "build" },
    win: {
        target: ["nsis", "portable"],
        icon: "build/icon.png",
        signtoolOptions: { publisherName: "DevDeck Dev", certificateSubjectName: "DevDeck Dev" }
    },
    publish: [{ provider: "github", owner: "Midor2Mid", repo: "devdeck" }]
}

describe("ciConfig", () => {
    it("switches signing off with a real boolean", () => {
        // Not a string. `-c.win.signExecutable=false` on the command line would
        // hand electron-builder the STRING "false" (it coerces dot-notation
        // values only under extraMetadata/mac/nsis/nsisWeb), and winPackager
        // tests `=== false`. That override reads as applied and does nothing,
        // which is the reason this config is generated at all.
        expect(ciConfig(BUILD).win.signExecutable).toBe(false)
    })

    it("drops the certificate-subject lookup, which has nothing to find on a runner", () => {
        expect(ciConfig(BUILD).win.signtoolOptions).not.toHaveProperty("certificateSubjectName")
    })

    // publisherName is written into the packaged app's resources/app-update.yml,
    // and electron-updater refuses an update whose Authenticode publisher does
    // not equal it. An unsigned build must therefore claim no publisher: an
    // explicit null is what app-builder-lib reads as "there is none", and it
    // also stops it hunting for a certificate to read the name off.
    it("claims no publisher when the artifacts will not be signed", () => {
        expect(ciConfig(BUILD).win.signtoolOptions.publisherName).toBeNull()
        expect(ciConfig(BUILD, "").win.signtoolOptions.publisherName).toBeNull()
    })

    it("claims the granted certificate's CN when there is one", () => {
        expect(ciConfig(BUILD, "Open Source Developer, Someone").win.signtoolOptions.publisherName).toBe(
            "Open Source Developer, Someone"
        )
    })

    // Without a publish provider electron-builder writes no latest.yml at all,
    // and a release without that manifest breaks auto-update for every existing
    // install. Nothing in the CI overrides may touch it.
    it("keeps the publish provider, the targets and the icon", () => {
        const c = ciConfig(BUILD)
        expect(c.publish).toEqual(BUILD.publish)
        expect(c.win.target).toEqual(["nsis", "portable"])
        expect(c.win.icon).toBe("build/icon.png")
        expect(c.directories).toEqual(BUILD.directories)
        expect(c.appId).toBe("com.devdeck.app")
        expect(c.productName).toBe("DevDeck")
    })

    it("does not mutate the configuration it was handed", () => {
        const before = JSON.stringify(BUILD)
        ciConfig(BUILD, "Someone")
        expect(JSON.stringify(BUILD)).toBe(before)
    })

    it("survives a build config with no win block at all", () => {
        expect(ciConfig({}).win).toEqual({ signExecutable: false, signtoolOptions: { publisherName: null } })
    })
})
