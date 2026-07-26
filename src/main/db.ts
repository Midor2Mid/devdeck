import { app, safeStorage } from "electron"
import { join } from "path"
import { readFileSync } from "fs"
import { atomicWrite } from "./atomic"
import { randomUUID } from "crypto"
import { Pool as PgPool, Client as PgClient } from "pg"
import mysql from "mysql2/promise"
import { Database as SqliteDatabase } from "node-sqlite3-wasm"
import sql from "mssql"

export type DbKind = "postgres" | "mysql" | "sqlite" | "sqlserver"

/** Connection profile as seen by the renderer - never includes the password. */
export interface ConnProfile {
    id: string
    projectId: string
    name: string
    kind: DbKind
    host: string
    port: number
    database: string
    user: string
    ssl?: boolean
}

/** What we persist to disk: profile + the encrypted password. */
interface StoredProfile extends ConnProfile {
    passwordEnc?: string
}

/** Input from the renderer when creating/editing (password optional on edit). */
export interface ConnInput extends Omit<ConnProfile, "id"> {
    id?: string
    password?: string
}

export interface QueryResult {
    ok: boolean
    columns?: string[]
    rows?: Record<string, unknown>[]
    rowCount?: number
    command?: string
    timeMs: number
    error?: string
}

interface Store {
    profiles: StoredProfile[]
}

// ---------- persistence ----------
function storeFile(): string {
    return join(app.getPath("userData"), "connections.json")
}
function load(): Store {
    try {
        return JSON.parse(readFileSync(storeFile(), "utf8")) as Store
    } catch {
        return { profiles: [] }
    }
}
function save(store: Store): void {
    try {
        atomicWrite(storeFile(), JSON.stringify(store, null, 2))
    } catch (err) {
        console.error("[db] failed to save connections:", err)
    }
}

// ---------- password encryption (DPAPI via safeStorage, base64 fallback) ----------
function encryptPassword(pw: string): string {
    if (!pw) return ""
    try {
        if (safeStorage.isEncryptionAvailable()) {
            return "enc:" + safeStorage.encryptString(pw).toString("base64")
        }
    } catch {
        /* fall through */
    }
    return "b64:" + Buffer.from(pw, "utf8").toString("base64")
}
function decryptPassword(enc?: string): string {
    if (!enc) return ""
    try {
        if (enc.startsWith("enc:")) {
            return safeStorage.decryptString(Buffer.from(enc.slice(4), "base64"))
        }
        if (enc.startsWith("b64:")) {
            return Buffer.from(enc.slice(4), "base64").toString("utf8")
        }
    } catch (err) {
        console.error("[db] failed to decrypt password:", err)
    }
    return ""
}

function publicProfile(p: StoredProfile): ConnProfile {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { passwordEnc, ...rest } = p
    return rest
}

// ---------- CRUD ----------
export function listConnections(projectId: string): ConnProfile[] {
    return load()
        .profiles.filter((p) => p.projectId === projectId)
        .map(publicProfile)
}

export function allConnections(): ConnProfile[] {
    return load().profiles.map(publicProfile)
}

export function saveConnection(input: ConnInput): ConnProfile[] {
    const store = load()
    if (input.id) {
        const existing = store.profiles.find((p) => p.id === input.id)
        if (existing) {
            Object.assign(existing, {
                name: input.name,
                kind: input.kind,
                host: input.host,
                port: input.port,
                database: input.database,
                user: input.user,
                ssl: input.ssl
            })
            // Only replace the stored password when a new one was supplied.
            if (input.password) existing.passwordEnc = encryptPassword(input.password)
            closePool(input.id) // force a fresh pool with new settings
        }
    } else {
        store.profiles.push({
            id: randomUUID(),
            projectId: input.projectId,
            name: input.name,
            kind: input.kind,
            host: input.host,
            port: input.port,
            database: input.database,
            user: input.user,
            ssl: input.ssl,
            passwordEnc: encryptPassword(input.password ?? "")
        })
    }
    save(store)
    return listConnections(input.projectId)
}

export function removeConnection(id: string): void {
    const store = load()
    store.profiles = store.profiles.filter((p) => p.id !== id)
    save(store)
    closePool(id)
}

// ---------- live pools ----------
interface LivePool {
    kind: DbKind
    pg?: PgPool
    my?: mysql.Pool
    sqlite?: SqliteDatabase
    ms?: sql.ConnectionPool
    /** SQL Server pools connect asynchronously - await this before querying. */
    msReady?: Promise<sql.ConnectionPool>
}
const pools = new Map<string, LivePool>()

function buildPgConfig(p: StoredProfile): Record<string, unknown> {
    return {
        host: p.host,
        port: p.port,
        user: p.user,
        password: decryptPassword(p.passwordEnc),
        database: p.database,
        ssl: p.ssl ? { rejectUnauthorized: false } : undefined,
        max: 4,
        connectionTimeoutMillis: 8000
    }
}
function buildMyConfig(p: StoredProfile): mysql.PoolOptions {
    return {
        host: p.host,
        port: p.port,
        user: p.user,
        password: decryptPassword(p.passwordEnc),
        database: p.database,
        ssl: p.ssl ? { rejectUnauthorized: false } : undefined,
        connectionLimit: 4,
        connectTimeout: 8000
    }
}

function buildMssqlConfig(p: StoredProfile): sql.config {
    return {
        server: p.host,
        port: p.port,
        user: p.user,
        password: decryptPassword(p.passwordEnc),
        database: p.database,
        connectionTimeout: 8000,
        pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
        // ssl toggle maps to TLS; trust self-signed dev certs so localhost works.
        options: { encrypt: !!p.ssl, trustServerCertificate: true }
    }
}

function getPool(profileId: string): LivePool {
    const existing = pools.get(profileId)
    if (existing) return existing
    const profile = load().profiles.find((p) => p.id === profileId)
    if (!profile) throw new Error("Connection not found")
    let live: LivePool
    if (profile.kind === "postgres") {
        live = { kind: "postgres", pg: new PgPool(buildPgConfig(profile)) }
    } else if (profile.kind === "mysql") {
        live = { kind: "mysql", my: mysql.createPool(buildMyConfig(profile)) }
    } else if (profile.kind === "sqlserver") {
        const ms = new sql.ConnectionPool(buildMssqlConfig(profile))
        ms.on("error", (e) => console.error("[db] mssql pool error:", e.message))
        const msReady = ms.connect()
        msReady.catch(() => undefined) // surfaced on the first query's await; avoid an unhandled rejection
        live = { kind: "sqlserver", ms, msReady }
    } else {
        // SQLite: the `database` field holds the .db file path.
        live = { kind: "sqlite", sqlite: new SqliteDatabase(profile.database) }
    }
    // A pool-level error (e.g. server dropped) shouldn't crash the app.
    live.pg?.on("error", (e) => console.error("[db] pg pool error:", e.message))
    pools.set(profileId, live)
    return live
}

function closePool(profileId: string): void {
    const live = pools.get(profileId)
    if (!live) return
    live.pg?.end().catch(() => undefined)
    live.my?.end().catch(() => undefined)
    live.ms?.close().catch(() => undefined)
    try {
        live.sqlite?.close()
    } catch {
        /* ignore */
    }
    pools.delete(profileId)
}

export function disconnect(profileId: string): void {
    closePool(profileId)
}

export function closeAll(): void {
    for (const id of [...pools.keys()]) closePool(id)
}

// ---------- test / query / tables ----------
export async function testConnection(input: ConnInput): Promise<QueryResult> {
    const start = Date.now()
    try {
        if (input.kind === "sqlite") {
            const db = new SqliteDatabase(input.database)
            try {
                db.all("SELECT 1")
            } finally {
                db.close()
            }
            return { ok: true, timeMs: Date.now() - start }
        }
        if (input.kind === "sqlserver") {
            const pool = await new sql.ConnectionPool({
                server: input.host,
                port: input.port,
                user: input.user,
                password: input.password,
                database: input.database,
                connectionTimeout: 8000,
                options: { encrypt: !!input.ssl, trustServerCertificate: true }
            }).connect()
            try {
                await pool.request().query("SELECT 1")
            } finally {
                await pool.close()
            }
            return { ok: true, timeMs: Date.now() - start }
        }
        if (input.kind === "postgres") {
            const client = new PgClient({
                host: input.host,
                port: input.port,
                user: input.user,
                password: input.password,
                database: input.database,
                ssl: input.ssl ? { rejectUnauthorized: false } : undefined,
                connectionTimeoutMillis: 8000
            })
            await client.connect()
            await client.query("SELECT 1")
            await client.end()
        } else {
            const conn = await mysql.createConnection({
                host: input.host,
                port: input.port,
                user: input.user,
                password: input.password,
                database: input.database,
                ssl: input.ssl ? { rejectUnauthorized: false } : undefined,
                connectTimeout: 8000
            })
            await conn.query("SELECT 1")
            await conn.end()
        }
        return { ok: true, timeMs: Date.now() - start }
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            timeMs: Date.now() - start
        }
    }
}

export async function runQuery(profileId: string, sql: string): Promise<QueryResult> {
    const start = Date.now()
    try {
        const live = getPool(profileId)
        if (live.kind === "sqlite" && live.sqlite) {
            const isReturning = /^\s*(select|pragma|with|explain)/i.test(sql)
            if (isReturning) {
                const rows = live.sqlite.all(sql) as Record<string, unknown>[]
                return {
                    ok: true,
                    columns: rows[0] ? Object.keys(rows[0]) : [],
                    rows,
                    rowCount: rows.length,
                    timeMs: Date.now() - start
                }
            }
            // run() executes only the FIRST statement, so a pasted script
            // (CREATE…; INSERT…;) silently dropped everything after it. exec()
            // runs the whole script but reports no counts, so only reach for it
            // when there really is more than one statement. A stray ';' inside a
            // string literal can misroute a single statement here - harmless, it
            // still executes correctly, we just report it as a script.
            if (/;/.test(sql.replace(/;\s*$/, ""))) {
                live.sqlite.exec(sql)
                return {
                    ok: true,
                    columns: ["result"],
                    rows: [{ result: "script executed" }],
                    rowCount: 0,
                    timeMs: Date.now() - start
                }
            }
            const res = live.sqlite.run(sql)
            return {
                ok: true,
                columns: ["changes", "lastInsertRowid"],
                rows: [{ changes: res.changes, lastInsertRowid: Number(res.lastInsertRowid) }],
                rowCount: res.changes,
                timeMs: Date.now() - start
            }
        }
        if (live.kind === "postgres" && live.pg) {
            const res = await live.pg.query(sql)
            return {
                ok: true,
                columns: res.fields.map((f) => f.name),
                rows: res.rows as Record<string, unknown>[],
                rowCount: res.rowCount ?? res.rows.length,
                command: res.command,
                timeMs: Date.now() - start
            }
        }
        if (live.kind === "sqlserver" && live.ms) {
            await live.msReady
            const res = await live.ms.request().query(sql)
            const rows = (res.recordset ?? []) as unknown as Record<string, unknown>[]
            const columns = res.recordset?.columns
                ? Object.keys(res.recordset.columns)
                : rows[0]
                  ? Object.keys(rows[0])
                  : []
            const affected = Array.isArray(res.rowsAffected)
                ? res.rowsAffected.reduce((a, b) => a + b, 0)
                : 0
            return {
                ok: true,
                columns,
                rows,
                rowCount: res.recordset ? rows.length : affected,
                timeMs: Date.now() - start
            }
        }
        if (live.my) {
            const [result, fields] = await live.my.query(sql)
            if (Array.isArray(result)) {
                const rows = result as Record<string, unknown>[]
                const columns = fields
                    ? (fields as mysql.FieldPacket[]).map((f) => f.name)
                    : rows[0]
                      ? Object.keys(rows[0])
                      : []
                return { ok: true, columns, rows, rowCount: rows.length, timeMs: Date.now() - start }
            }
            const header = result as mysql.ResultSetHeader
            return {
                ok: true,
                columns: ["affectedRows", "insertId"],
                rows: [{ affectedRows: header.affectedRows, insertId: header.insertId }],
                rowCount: header.affectedRows,
                timeMs: Date.now() - start
            }
        }
        throw new Error("No active pool")
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            timeMs: Date.now() - start
        }
    }
}

export async function listTables(profileId: string): Promise<string[]> {
    const live = getPool(profileId)
    if (live.kind === "postgres" && live.pg) {
        const res = await live.pg.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        )
        return res.rows.map((r) => String((r as { table_name: string }).table_name))
    }
    if (live.kind === "sqlserver" && live.ms) {
        await live.msReady
        const res = await live.ms
            .request()
            .query(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
            )
        return (res.recordset ?? []).map((r) => String((r as { TABLE_NAME: string }).TABLE_NAME))
    }
    if (live.my) {
        const [rows] = await live.my.query("SHOW TABLES")
        return (rows as Record<string, unknown>[]).map((r) => String(Object.values(r)[0]))
    }
    if (live.sqlite) {
        const rows = live.sqlite.all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ) as { name: string }[]
        return rows.map((r) => String(r.name))
    }
    return []
}
