import { describe, it, expect } from "vitest"
import { parseCurl } from "../src/renderer/src/curl"

describe("parseCurl", () => {
    it("returns null for non-curl input", () => {
        expect(parseCurl("not a curl command")).toBeNull()
    })

    it("parses a bare GET url", () => {
        const r = parseCurl("curl https://api.example.com/users")
        expect(r).toMatchObject({ method: "GET", url: "https://api.example.com/users" })
    })

    it("parses method, headers and body; infers POST from -d", () => {
        const r = parseCurl(
            `curl -X POST 'https://api.example.com/login' -H "Content-Type: application/json" -d '{"u":"a"}'`
        )!
        expect(r.method).toBe("POST")
        expect(r.url).toBe("https://api.example.com/login")
        expect(r.headers["Content-Type"]).toBe("application/json")
        expect(r.body).toBe('{"u":"a"}')
    })

    it("infers POST when only -d is given", () => {
        const r = parseCurl("curl https://x.io -d a=1")!
        expect(r.method).toBe("POST")
    })

    it("turns -u into a Basic auth header", () => {
        const r = parseCurl("curl -u admin:secret --url https://x.io/p")!
        expect(r.url).toBe("https://x.io/p")
        expect(r.headers["Authorization"]).toBe("Basic " + btoa("admin:secret"))
    })

    it("handles backslash line continuations", () => {
        const r = parseCurl("curl https://x.io \\\n  -H 'A: 1'")!
        expect(r.headers["A"]).toBe("1")
    })
})
