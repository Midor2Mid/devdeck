import { describe, it, expect } from "vitest"
import { isBlockedRemoteUrl, isReadOnlySql } from "../src/main/guards"

describe("isBlockedRemoteUrl (SSRF guard)", () => {
    it("blocks loopback / localhost", () => {
        expect(isBlockedRemoteUrl("http://localhost:3000")).toBe(true)
        expect(isBlockedRemoteUrl("http://127.0.0.1/x")).toBe(true)
        expect(isBlockedRemoteUrl("http://[::1]/")).toBe(true)
    })
    it("blocks private + link-local + metadata ranges", () => {
        expect(isBlockedRemoteUrl("http://10.0.0.5")).toBe(true)
        expect(isBlockedRemoteUrl("http://192.168.1.9")).toBe(true)
        expect(isBlockedRemoteUrl("http://172.16.0.1")).toBe(true)
        expect(isBlockedRemoteUrl("http://169.254.169.254/latest/meta-data/")).toBe(true)
    })
    it("blocks non-http schemes and junk", () => {
        expect(isBlockedRemoteUrl("file:///etc/passwd")).toBe(true)
        expect(isBlockedRemoteUrl("not a url")).toBe(true)
    })
    it("allows normal public URLs", () => {
        expect(isBlockedRemoteUrl("https://api.github.com/repos")).toBe(false)
        expect(isBlockedRemoteUrl("http://example.com:8080/x")).toBe(false)
    })
})

describe("isReadOnlySql (remote read-only)", () => {
    it("allows data-returning statements", () => {
        expect(isReadOnlySql("SELECT * FROM t")).toBe(true)
        expect(isReadOnlySql("  with x as (select 1) select * from x")).toBe(true)
        expect(isReadOnlySql("SHOW TABLES")).toBe(true)
        expect(isReadOnlySql("explain analyze select 1")).toBe(true)
    })
    it("rejects mutating statements", () => {
        expect(isReadOnlySql("DELETE FROM t")).toBe(false)
        expect(isReadOnlySql("drop table t")).toBe(false)
        expect(isReadOnlySql("UPDATE t SET a=1")).toBe(false)
        expect(isReadOnlySql("insert into t values (1)")).toBe(false)
    })
})
