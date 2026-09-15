import { describe, it, expect, vi } from "vitest"
import { join } from "path"
import { readFileSync, writeFileSync } from "fs"

/**
 * What survives of the Work backend: the Azure DevOps PR creation path, which
 * `pr:createAzure` still serves and the PR modal still calls. The work-item
 * fetchers, the config writer and the description flatteners were deleted with
 * the panel, and their specs went with them.
 *
 * The file-untouched spec below is the one that matters. D1's ruling is that a
 * removed panel orphans a user's credentials and never prunes them, and this
 * module is the last thing holding `work.json` open - a future edit that gives
 * it a write path would silently rewrite a file still holding a Jira token this
 * build cannot even read back.
 */

// Mock Electron: a temp userData dir, and force the base64 fallback (no DPAPI in
// the test runner) so a stored PAT is decryptable here.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join: pjoin } = require("path")
    return { dir: mkdtempSync(pjoin(tmpdir(), "azurepr-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

import { resolveProxy, createAzurePr } from "../src/main/azurepr"

const workJson = (): string => join(h.dir, "work.json")

describe("resolveProxy", () => {
    it("prefers an explicit proxy over env", () => {
        const prev = process.env.HTTPS_PROXY
        process.env.HTTPS_PROXY = "http://env:8080"
        expect(resolveProxy("http://explicit:3128")).toBe("http://explicit:3128")
        if (prev === undefined) delete process.env.HTTPS_PROXY
        else process.env.HTTPS_PROXY = prev
    })
    it("falls back to HTTPS_PROXY env when no explicit value", () => {
        const prev = process.env.HTTPS_PROXY
        process.env.HTTPS_PROXY = "http://env:8080"
        expect(resolveProxy("  ")).toBe("http://env:8080")
        if (prev === undefined) delete process.env.HTTPS_PROXY
        else process.env.HTTPS_PROXY = prev
    })
})

describe("createAzurePr with no PAT", () => {
    const opts = {
        orgUrl: "https://dev.azure.com/org",
        project: "Proj",
        repo: "repo",
        source: "feature/x",
        target: "main",
        title: "T",
        description: "D"
    }

    it("fails with a message that names the panel's removal, not a settings screen", async () => {
        writeFileSync(workJson(), JSON.stringify({ azure: { patEnc: "" }, proxy: "" }))
        const res = await createAzurePr(opts)
        expect(res.ok).toBe(false)
        expect(res.error).toContain("removed in 0.14.0")
        // The old copy said "add one in Work → ⚙", which no longer exists.
        expect(res.error).not.toContain("Work →")
    })

    it("leaves an existing work.json byte-for-byte alone", async () => {
        // A 0.13.x file: a Jira token this build can no longer read or set, and
        // an Azure half with no PAT. A downgrade has to find all of it.
        const before = JSON.stringify(
            {
                jira: { enabled: true, baseUrl: "https://co.atlassian.net", email: "a@b.c", tokenEnc: "b64:dG9rZW4=" },
                azure: { enabled: true, orgUrl: "https://dev.azure.com/org", patEnc: "", insecureTLS: false },
                proxy: "http://proxy.corp:8080"
            },
            null,
            2
        )
        writeFileSync(workJson(), before)
        await createAzurePr(opts)
        expect(readFileSync(workJson(), "utf8")).toBe(before)
    })

    it("does not create work.json when there is none", async () => {
        const { rmSync, existsSync } = await import("fs")
        rmSync(workJson(), { force: true })
        const res = await createAzurePr(opts)
        expect(res.ok).toBe(false)
        expect(existsSync(workJson())).toBe(false)
    })
})
