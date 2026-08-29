import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { existsSync, rmSync } from "fs"
import { join } from "path"

// Same temp-userData + no-DPAPI mock as the other main-process suites.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join: pj } = require("path")
    return { dir: mkdtempSync(pj(tmpdir(), "db-approve-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

const db = await import("../src/main/db")

const approvals = join(h.dir, "approved-db-files.json")
const connections = join(h.dir, "connections.json")
const WIN = process.platform === "win32"

const clean = (): void => {
    for (const f of [approvals, connections]) rmSync(f, { force: true })
    db.__resetApprovalsForTest()
}

beforeEach(clean)
afterAll(() => {
    rmSync(h.dir, { recursive: true, force: true })
})

describe("which SQLite files DevDeck will open (remedy 14)", () => {
    const outside = WIN ? "D:\data\customers.db" : "/data/customers.db"

    it("does not approve a path nobody chose", () => {
        expect(db.isApprovedDbFile(outside)).toBe(false)
        expect(db.isApprovedDbFile("")).toBe(false)
    })

    it("approves a file the user picked in the dialog", () => {
        db.approveDbFile(outside)
        expect(db.isApprovedDbFile(outside)).toBe(true)
    })

    it("remembers the approval across a restart", () => {
        // A saved connection has to keep working tomorrow; an approval that
        // lived only in memory would fail on the next launch.
        db.approveDbFile(outside)
        expect(existsSync(approvals)).toBe(true)
        db.__resetApprovalsForTest()
        expect(db.isApprovedDbFile(outside)).toBe(true)
    })

    it("treats the same file spelled differently as the same file", () => {
        // Otherwise the approval is a string match and a trivially different
        // spelling of the very file the user picked would be refused.
        db.approveDbFile(WIN ? "D:/data/../data/Customers.DB" : "/data/../data/customers.db")
        const spelled = WIN ? "D:\\DATA\\customers.db" : "/data/customers.db"
        expect(db.isApprovedDbFile(spelled)).toBe(true)
    })

    it("seeds from connections the user already had, so an upgrade breaks nothing", () => {
        // These paths were chosen before this boundary existed. Refusing them
        // on first launch after an update would be a worse bug than the one
        // the boundary fixes.
        db.saveConnection({
            projectId: "p1",
            name: "legacy",
            kind: "sqlite",
            host: "",
            port: 0,
            database: outside,
            user: ""
        })
        rmSync(approvals, { force: true })
        db.__resetApprovalsForTest()
        expect(db.isApprovedDbFile(outside)).toBe(true)
    })

    it("seeds only SQLite profiles - a database NAME is not a file path", () => {
        db.saveConnection({
            projectId: "p1",
            name: "pg",
            kind: "postgres",
            host: "localhost",
            port: 5432,
            database: "app_production",
            user: "me"
        })
        rmSync(approvals, { force: true })
        db.__resetApprovalsForTest()
        expect(db.isApprovedDbFile("app_production")).toBe(false)
    })
})
