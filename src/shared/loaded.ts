/**
 * The result of reading a JSON store off disk.
 *
 * The point of this type is that "the file isn't there" and "the file is there
 * but I couldn't read it" are different facts, and every loader in this app used
 * to collapse both into an empty value. An empty value means "you have nothing
 * configured", so the next save wrote that emptiness over the user's real data —
 * a lock held by an antivirus scanner, a half-written file from an agent, or a
 * truncated write was enough to destroy a workspace. Making "unreadable"
 * representable is what lets a writer refuse.
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false; reason: "missing" | "unreadable" }
