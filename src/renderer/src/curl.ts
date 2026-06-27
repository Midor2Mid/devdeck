// Parse a `curl` command into request parts for the API client.

export interface ParsedCurl {
    method: string
    url: string
    headers: Record<string, string>
    body: string
}

/** Tokenize a shell-ish command respecting single/double quotes and line continuations. */
function tokenize(input: string): string[] {
    const s = input.replace(/\\\r?\n/g, " ") // join backslash-newline continuations
    const tokens: string[] = []
    let i = 0
    while (i < s.length) {
        const ch = s[i]
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            i++
            continue
        }
        let tok = ""
        while (i < s.length && !/\s/.test(s[i])) {
            const c = s[i]
            if (c === '"' || c === "'") {
                const quote = c
                i++
                while (i < s.length && s[i] !== quote) {
                    if (s[i] === "\\" && quote === '"' && i + 1 < s.length) {
                        tok += s[i + 1]
                        i += 2
                    } else {
                        tok += s[i]
                        i++
                    }
                }
                i++ // closing quote
            } else {
                tok += c
                i++
            }
        }
        tokens.push(tok)
    }
    return tokens
}

export function parseCurl(input: string): ParsedCurl | null {
    const text = input.trim()
    if (!/^curl\b/.test(text)) return null
    const tokens = tokenize(text).slice(1) // drop leading "curl"

    const result: ParsedCurl = { method: "", url: "", headers: {}, body: "" }
    let i = 0
    const next = (): string => tokens[++i] ?? ""

    while (i < tokens.length) {
        const t = tokens[i]
        if (t === "-X" || t === "--request") {
            result.method = next().toUpperCase()
        } else if (t === "-H" || t === "--header") {
            const h = next()
            const idx = h.indexOf(":")
            if (idx > -1) result.headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim()
        } else if (
            t === "-d" ||
            t === "--data" ||
            t === "--data-raw" ||
            t === "--data-binary" ||
            t === "--data-ascii"
        ) {
            result.body = next()
        } else if (t === "-u" || t === "--user") {
            const cred = next()
            result.headers["Authorization"] = "Basic " + btoa(cred)
        } else if (t === "--url") {
            result.url = next()
        } else if (t === "-b" || t === "--cookie") {
            result.headers["Cookie"] = next()
        } else if (t === "-A" || t === "--user-agent") {
            result.headers["User-Agent"] = next()
        } else if (t.startsWith("-")) {
            // Flags we ignore that take no value (e.g. -L, --compressed, -k, -s).
            // Heuristic: skip a value for known value-taking long options.
        } else if (!result.url && /^https?:\/\//i.test(t)) {
            result.url = t
        } else if (!result.url) {
            result.url = t // bare host without scheme
        }
        i++
    }

    if (!result.method) result.method = result.body ? "POST" : "GET"
    if (!result.url) return null
    return result
}
