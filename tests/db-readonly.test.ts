import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { Database } from "node-sqlite3-wasm"

// db.ts needs Electron's userData dir (its connection store) and safeStorage;
// same mock as tests/devices.test.ts. The SQLite driver is real, in-process,
// and writes to a real file - which is the point: the read-only guarantee is
// the driver's, so a test that stubbed the driver would be testing nothing.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdtempSync: mk } = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tmpdir: td } = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join: pj } = require("path")
    return { dir: mk(pj(td(), "db-ro-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir },
    safeStorage: { isEncryptionAvailable: () => false }
}))

import type { DbKind } from "../src/main/db"
const db = await import("../src/main/db")

const work = mkdtempSync(join(tmpdir(), "db-ro-files-"))
const dbFile = join(work, "app.db")
let sqliteId = ""
let missingId = ""
let mssqlId = ""

const profile = (name: string, kind: DbKind, database: string): string => {
    const before = new Set(db.listConnections("p1").map((c) => c.id))
    db.saveConnection({
        projectId: "p1",
        name,
        kind,
        host: "localhost",
        port: 0,
        database,
        user: ""
    })
    return db.listConnections("p1").find((c) => !before.has(c.id))!.id
}

beforeAll(() => {
    const seed = new Database(dbFile)
    seed.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)")
    seed.exec("INSERT INTO t (id, v) VALUES (1, 'one'), (2, 'two')")
    seed.close()

    sqliteId = profile("app", "sqlite", dbFile)
    missingId = profile("gone", "sqlite", join(work, "not-here.db"))
    mssqlId = profile("legacy", "sqlserver", "master")
})

afterAll(() => {
    db.closeAll()
    rmSync(work, { recursive: true, force: true })
    rmSync(h.dir, { recursive: true, force: true })
})

/** Read the file back through a fresh handle - not through anything under test. */
const rows = (): unknown[] => {
    const probe = new Database(dbFile, { readOnly: true })
    try {
        return probe.all("SELECT id, v FROM t ORDER BY id")
    } finally {
        probe.close()
    }
}

describe("runQuery { readOnly } - the driver enforces it, not a regex", () => {
    it("still returns rows for an ordinary read", async () => {
        const res = await db.runQuery(sqliteId, "SELECT id, v FROM t ORDER BY id", { readOnly: true })
        expect(res.ok).toBe(true)
        expect(res.rows).toEqual([
            { id: 1, v: "one" },
            { id: 2, v: "two" }
        ])
        expect(res.columns).toEqual(["id", "v"])
    })

    it("refuses a DELETE, and the rows are still there afterwards", async () => {
        const res = await db.runQuery(sqliteId, "DELETE FROM t", { readOnly: true })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/readonly|read-only/i)
        expect(rows()).toHaveLength(2)
    })

    it("refuses a DROP", async () => {
        const res = await db.runQuery(sqliteId, "DROP TABLE t", { readOnly: true })
        expect(res.ok).toBe(false)
        expect(rows()).toHaveLength(2)
    })

    it("does not execute a second statement smuggled after a SELECT", async () => {
        // The old regex passed this whole string because it starts with SELECT.
        const res = await db.runQuery(sqliteId, "SELECT 1; DROP TABLE t", { readOnly: true })
        expect(res.ok).toBe(true)
        expect(rows()).toHaveLength(2)
    })

    it("does not run a write hidden behind a leading WITH", async () => {
        // SQLite has no DML-in-CTE, so this is a syntax error rather than a
        // silent write - either way the table survives. The Postgres form of
        // this (WITH x AS (DELETE ... RETURNING *) SELECT * FROM x) needs a
        // live server and is not faked here; the BEGIN READ ONLY transaction
        // in runReadOnly is what refuses it there.
        const res = await db.runQuery(
            sqliteId,
            "WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x",
            { readOnly: true }
        )
        expect(res.ok).toBe(false)
        expect(rows()).toHaveLength(2)
    })

    it("says the database is missing instead of connecting to one it just created", async () => {
        // fileMustExist: the old path happily opened a brand-new empty file and
        // reported "Connected in 2 ms" against a database that did not exist
        // until the moment it was asked about.
        const res = await db.runQuery(missingId, "SELECT 1", { readOnly: true })
        expect(res.ok).toBe(false)
        // And it says so in words the user can act on. SQLite's own message is
        // "unable to open database file", which reads like a permissions
        // problem and hides the fact that DevDeck no longer creates the file.
        expect(res.error).toMatch(/No database file at/)
        expect(res.error).toMatch(/create it first/)
    })

    it("gives the same clear answer on the desktop path", async () => {
        const res = await db.runQuery(missingId, "SELECT 1")
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/No database file at/)
    })

    it("does not rewrite an error that is not about a missing file", async () => {
        // The rewrite is keyed on the file actually being absent, so a real
        // permissions or corruption failure keeps the driver's own words.
        const res = await db.runQuery(sqliteId, "SELECT * FROM no_such_table", { readOnly: true })
        expect(res.ok).toBe(false)
        expect(res.error).not.toMatch(/No database file at/)
    })

    it("refuses SQL Server outright rather than promising something T-SQL cannot do", async () => {
        const res = await db.runQuery(mssqlId, "SELECT 1", { readOnly: true })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/SQL Server has no read-only transaction/)
        // Refused without a connection attempt: a network timeout would take
        // seconds, and this is decided from the profile alone.
        expect(res.timeMs).toBeLessThan(1000)
    })

    it("leaves the desktop path writable - this is a remote/agent restriction", async () => {
        const res = await db.runQuery(sqliteId, "INSERT INTO t (id, v) VALUES (3, 'three')")
        expect(res.ok).toBe(true)
        expect(rows()).toHaveLength(3)
        await db.runQuery(sqliteId, "DELETE FROM t WHERE id = 3")
    })
})
