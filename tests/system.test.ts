import { describe, it, expect } from "vitest"
import { parseDockerPs, parseNetstat } from "../src/main/system"

describe("parseDockerPs", () => {
    it("parses name/status/ports tab-separated lines", () => {
        const out = parseDockerPs("web\tUp 2 hours\t0.0.0.0:8080->80/tcp\ndb\tUp 5 min\t")
        expect(out).toEqual([
            { name: "web", status: "Up 2 hours", ports: "0.0.0.0:8080->80/tcp" },
            { name: "db", status: "Up 5 min", ports: "" }
        ])
    })
    it("skips blank lines", () => {
        expect(parseDockerPs("\n\n")).toEqual([])
    })
})

describe("parseNetstat", () => {
    const sample = [
        "  TCP    0.0.0.0:8080     0.0.0.0:0      LISTENING       1234",
        "  TCP    0.0.0.0:135      0.0.0.0:0      LISTENING       900",
        "  TCP    [::]:8080        [::]:0         LISTENING       1234",
        "  TCP    127.0.0.1:5432   0.0.0.0:0      LISTENING       5678",
        "  TCP    0.0.0.0:9000     1.2.3.4:55     ESTABLISHED     999"
    ].join("\n")

    it("keeps LISTENING TCP ports, deduped by port, excludes non-listening", () => {
        expect(parseNetstat(sample)).toEqual([
            { port: 8080, pid: 1234 },
            { port: 135, pid: 900 },
            { port: 5432, pid: 5678 }
        ])
    })
})
