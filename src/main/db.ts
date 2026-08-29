import { app, safeStorage } from "electron"
import { join, resolve } from "path"
import { existsSync, readFileSync } from "fs"
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
        // SQLite: the `database` field holds the .db file path. `fileMustExist`
        // because opening a path that isn't there used to CREATE an empty
        // database and report a healthy connection to it - a typo in the path
        // looked like a working connection with no tables in it.
        try {
            live = {
                kind: "sqlite",
                sqlite: new SqliteDatabase(profile.database, { fileMustExist: true })
            }
        } catch (err) {
            throw sqliteOpenError(err, profile.database)
        }
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

// ---------- which SQLite files may be opened ----------
//
// A SQLite "connection" is a file path the renderer hands over, and opening
// one is a file read. Every other path-taking channel is confined to the open
// projects; this one was not, so it was the way around that confinement.
//
// Confining it to project roots alone would have removed a real capability -
// a database in D:\data is a perfectly ordinary thing to point DevDeck at. So
// the boundary is *who chose the path*: inside a project, or picked by the
// user through the file dialog, which is a decision a renderer cannot forge.
//
// The approvals are persisted (a saved connection must survive a restart) and
// written only by the main process, so nothing in the renderer can add to
// them without a dialog the user actually sees. On first run the list is
// seeded from the SQLite profiles that already exist: those were chosen by
// the user before this boundary existed, and silently breaking them would be
// a bug report, not a security win.
function approvalsFile(): string {
    return join(app.getPath("userData"), "approved-db-files.json")
}
function normPath(p: string): string {
    const r = resolve(p)
    return process.platform === "win32" ? r.toLowerCase() : r
}
let approvedFiles: Set<string> | null = null

function persistApprovals(set: Set<string>): void {
    try {
        atomicWrite(approvalsFile(), JSON.stringify([...set], null, 2))
    } catch (err) {
        // Not fatal: the connection still works this session, it just has to
        // be re-picked next time. Saying so beats pretending it persisted.
        console.error("[db] failed to save approved database files:", err)
    }
}

function loadApprovals(): Set<string> {
    if (approvedFiles) return approvedFiles
    try {
        const raw = JSON.parse(readFileSync(approvalsFile(), "utf8")) as unknown
        if (!Array.isArray(raw)) throw new Error("not a list")
        approvedFiles = new Set(raw.filter((x): x is string => typeof x === "string").map(normPath))
        return approvedFiles
    } catch {
        // No file yet (or an unreadable one): seed from what the user already
        // had. An unreadable file seeds the same way rather than emptying the
        // list, because the profiles are the better record of the user's own
        // past decisions either way.
        const seeded = new Set(
            load()
                .profiles.filter((p) => p.kind === "sqlite" && p.database)
                .map((p) => normPath(p.database))
        )
        approvedFiles = seeded
        if (seeded.size) persistApprovals(seeded)
        return seeded
    }
}

/** Record that the user picked this file in a dialog. Main-process callers only. */
export function approveDbFile(path: string): void {
    if (!path) return
    const set = loadApprovals()
    const key = normPath(path)
    if (set.has(key)) return
    set.add(key)
    persistApprovals(set)
}

/** Has the user personally chosen this file (or one recorded before the boundary existed)? */
export function isApprovedDbFile(path: string): boolean {
    return !!path && loadApprovals().has(normPath(path))
}

/** TEST-ONLY: drop the cached approvals so the next call re-reads from disk. */
export function __resetApprovalsForTest(): void {
    approvedFiles = null
}

// ---------- test / query / tables ----------
/**
 * What a failed open says when the file simply isn't there.
 *
 * The driver's own words are `Could not open the database "<path>"` (SQLite's
 * underneath it are "unable to open database file"), both of which read like a
 * permissions problem and say nothing about the one thing the user can fix.
 * Since `fileMustExist` deliberately removed the old behaviour of *creating*
 * the file, the message has to carry that decision - otherwise the capability
 * disappears and the error blames the disk.
 *
 * `existsSync` is the actual gate, not the wording: a real permissions or
 * corruption failure on a file that IS there keeps the driver's own message,
 * because rewriting that one would be the same lie in the other direction.
 */
function sqliteOpenError(err: unknown, file: string): Error {
    const msg = err instanceof Error ? err.message : String(err)
    const failedToOpen = /could not open the database|unable to open database file/i.test(msg)
    if (failedToOpen && !existsSync(file)) {
        return new Error(
            `No database file at ${file}. DevDeck opens existing SQLite files - create it first, ` +
                `then point a connection at it.`
        )
    }
    return err instanceof Error ? err : new Error(msg)
}

export async function testConnection(input: ConnInput): Promise<QueryResult> {
    const start = Date.now()
    try {
        if (input.kind === "sqlite") {
            // Same `fileMustExist` as getPool: "Connected in 2 ms" to a
            // database that did not exist until Test was pressed is the most
            // confident wrong answer this panel can give.
            let db: SqliteDatabase
            try {
                db = new SqliteDatabase(input.database, { fileMustExist: true })
            } catch (err) {
                throw sqliteOpenError(err, input.database)
            }
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

/**
 * How many rows node-postgres fetches per portal execution on a read-only
 * query. The value is a paging detail; passing it AT ALL is the point - see
 * the comment in runReadOnly.
 */
const PG_PAGE_ROWS = 500

/** One `pg` result. */
type PgResult = {
    fields?: { name: string }[]
    rows?: unknown[]
    rowCount?: number | null
    command?: string
}

export interface QueryOptions {
    /**
     * Run where the *driver* cannot write, rather than where a regex thinks
     * the statement won't. Set by the two callers that are not the user
     * sitting in front of the DB panel: the phone (`server.ts`) and an agent
     * over MCP (`mcptools.ts`).
     */
    readOnly?: boolean
}

/**
 * What SQL Server gets told, and why it is a refusal rather than a promise.
 *
 * `BEGIN READ ONLY` (pg) and `START TRANSACTION READ ONLY` (mysql) are
 * enforced inside the server; T-SQL has no equivalent. Keeping the old regex
 * for this one kind would mean holding a guarantee the driver cannot hold -
 * and `mcptools.ts` states that guarantee to the agent in writing. Refusing
 * the capability is the honest half of the trade.
 */
const MSSQL_REFUSAL =
    "Refused: SQL Server has no read-only transaction, so a remote or agent query " +
    "cannot be prevented from writing. Run it yourself in the DevDeck DB panel."

function shapeRows(rows: Record<string, unknown>[], start: number): QueryResult {
    return {
        ok: true,
        columns: rows[0] ? Object.keys(rows[0]) : [],
        rows,
        rowCount: rows.length,
        timeMs: Date.now() - start
    }
}

/**
 * The read-only path, kept whole and separate from the desktop one.
 *
 * This replaces `isReadOnlySql` - a regex on the first word, which the code
 * called "the whole security model for this tool" while it let through both
 * `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x` (starts with
 * "with") and `SELECT 1; DROP TABLE t` (pg's simple-query protocol runs every
 * statement in one call). Neither is clever; both are one line in a chat
 * window. What replaces it is per-driver, because "read-only" is a capability
 * each driver either has or does not:
 *
 *  - postgres: a `BEGIN READ ONLY` transaction, rolled back afterwards. Both
 *    bypasses above fail *inside the server*, which is the only place that
 *    can actually judge a statement.
 *  - mysql: `START TRANSACTION READ ONLY`, same reasoning. (`multipleStatements`
 *    is already off, so a single statement is all that can arrive.)
 *  - sqlite: its own connection opened `readOnly`, so the file itself is
 *    unwritable for the duration - `fileMustExist` too, since a read-only
 *    query against a database that does not exist is a mistake worth naming.
 *  - sqlserver: refused. See MSSQL_REFUSAL.
 *
 * The trade this makes: a query that relied on session state (a temp table, a
 * `SET`) now runs in its own transaction and may behave differently. That is
 * the cost of enforcing the promise where it can be enforced.
 */
async function runReadOnly(profileId: string, sql: string, start: number): Promise<QueryResult> {
    try {
        const profile = load().profiles.find((p) => p.id === profileId)
        if (!profile) throw new Error("Connection not found")

        if (profile.kind === "sqlserver") {
            return { ok: false, error: MSSQL_REFUSAL, timeMs: Date.now() - start }
        }

        if (profile.kind === "sqlite") {
            // A second handle rather than the pooled one: the pooled handle is
            // the desktop's, and it is writable.
            let ro: SqliteDatabase
            try {
                ro = new SqliteDatabase(profile.database, { readOnly: true, fileMustExist: true })
            } catch (err) {
                throw sqliteOpenError(err, profile.database)
            }
            try {
                return shapeRows(ro.all(sql) as Record<string, unknown>[], start)
            } finally {
                ro.close()
            }
        }

        const live = getPool(profileId)
        if (live.kind === "postgres" && live.pg) {
            const client = await live.pg.connect()
            try {
                await client.query("BEGIN READ ONLY")
                // `rows` is what forces node-postgres onto the EXTENDED query
                // protocol (`Query.requiresPreparation()` returns true for a
                // truthy `rows`), and that is the load-bearing part, not a
                // paging preference.
                //
                // On the simple protocol a single call may carry several
                // statements, and Postgres honours transaction-control
                // commands inside it - so `COMMIT; DELETE FROM users;` ends
                // the READ ONLY transaction with its first statement and runs
                // the delete in autocommit, where nothing is read-only. The
                // extended protocol refuses more than one statement outright,
                // which closes that and `SELECT 1; DROP TABLE t` with it.
                //
                // Session-level settings (SET SESSION CHARACTERISTICS,
                // default_transaction_read_only) do NOT close it: they are
                // themselves SQL, so a second statement can turn them off
                // again. Only "one statement per call" is airtight.
                //
                // The cast is because pg's *types* don't describe `rows` on a
                // query config even though the driver reads it - see
                // node_modules/pg/lib/query.js's requiresPreparation().
                const query = client.query as (cfg: unknown) => Promise<unknown>
                const res = (await query({ text: sql, rows: PG_PAGE_ROWS })) as PgResult
                return {
                    ok: true,
                    columns: res?.fields?.map((f) => f.name) ?? [],
                    rows: (res?.rows ?? []) as Record<string, unknown>[],
                    rowCount: res?.rowCount ?? res?.rows?.length ?? 0,
                    command: res?.command,
                    timeMs: Date.now() - start
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                // Postgres's own words for this are "cannot insert multiple
                // commands into a prepared statement", which tells a user
                // nothing about what they did.
                if (/multiple commands/i.test(msg)) {
                    throw new Error(
                        "Read-only queries run one statement at a time - split this into separate queries."
                    )
                }
                throw err
            } finally {
                await client.query("ROLLBACK").catch(() => undefined)
                // Truthy argument = discard this connection instead of
                // returning it to the pool. The desktop panel shares that
                // pool, and a connection that ran someone else's SQL should
                // not carry whatever session state it left behind back into
                // the user's own session.
                client.release(true)
            }
        }

        if (live.kind === "mysql" && live.my) {
            const conn = await live.my.getConnection()
            try {
                // mysql2 leaves `multipleStatements` off (see buildMyConfig),
                // so one statement per call is already the protocol's rule
                // here - this transaction is what makes that one statement
                // unable to write.
                await conn.query("START TRANSACTION READ ONLY")
                const [result, fields] = await conn.query(sql)
                if (!Array.isArray(result)) throw new Error("Read-only query returned no rows")
                const rows = result as Record<string, unknown>[]
                return {
                    ok: true,
                    columns: fields
                        ? (fields as mysql.FieldPacket[]).map((f) => f.name)
                        : rows[0]
                          ? Object.keys(rows[0])
                          : [],
                    rows,
                    rowCount: rows.length,
                    timeMs: Date.now() - start
                }
            } finally {
                await conn.query("ROLLBACK").catch(() => undefined)
                // Same reasoning as pg's release(true): don't hand a
                // connection carrying someone else's session state back.
                conn.destroy()
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

export async function runQuery(
    profileId: string,
    sql: string,
    opts: QueryOptions = {}
): Promise<QueryResult> {
    const start = Date.now()
    if (opts.readOnly) return runReadOnly(profileId, sql, start)
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
                // Lead with the effect. Reusing the row counter for `changes` put a
                // green "0 rows" directly above a metadata row you could see.
                command: `${res.changes} changed`,
                rowCount: 1,
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
