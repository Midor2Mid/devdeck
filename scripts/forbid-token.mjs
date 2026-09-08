#!/usr/bin/env node
/**
 * Print the SHA-256 of an identifier so it can be added to
 * `tests/publishedIdentifiers.test.ts` without the plaintext ever entering the
 * repository — which is the mistake that caused both of the leaks that test
 * exists to catch.
 *
 * Reads from stdin rather than argv so the token does not land in shell history
 * or in a process list other users on the machine can read.
 *
 *   node scripts/forbid-token.mjs
 *   <type the identifier, press Enter, then Ctrl+Z / Ctrl+D>
 *
 * One identifier per line. Tokens are lowercased to match the test's
 * tokeniser, which lowercases the whole corpus before matching.
 */
import { createHash } from "node:crypto"
import { createInterface } from "node:readline"

const rl = createInterface({ input: process.stdin, terminal: false })
const hashes = []
for await (const line of rl) {
    const token = line.trim().toLowerCase()
    if (token) hashes.push(createHash("sha256").update(token, "utf8").digest("hex"))
}

if (hashes.length === 0) {
    console.error("no token on stdin; give one identifier per line")
    process.exit(1)
}

console.log(hashes.map((h) => `    "${h}",`).join("\n"))
console.error("\nPaste into FORBIDDEN_TOKEN_SHA256. Do not commit the plaintext.")
