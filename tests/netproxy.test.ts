import { describe, it, expect, beforeEach } from "vitest"
import { applyProxy } from "../src/main/netproxy"

const KEYS = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS"
]

describe("netproxy.applyProxy", () => {
    beforeEach(() => {
        for (const k of KEYS) delete process.env[k]
    })

    it("sets upper+lower proxy vars when enabled", () => {
        applyProxy({
            enabled: true,
            url: "http://proxy.corp:8080",
            noProxy: "localhost,.internal",
            caPath: "C:/ca.pem"
        })
        expect(process.env.HTTP_PROXY).toBe("http://proxy.corp:8080")
        expect(process.env.HTTPS_PROXY).toBe("http://proxy.corp:8080")
        expect(process.env.http_proxy).toBe("http://proxy.corp:8080")
        expect(process.env.https_proxy).toBe("http://proxy.corp:8080")
        expect(process.env.NO_PROXY).toBe("localhost,.internal")
        expect(process.env.no_proxy).toBe("localhost,.internal")
        expect(process.env.NODE_EXTRA_CA_CERTS).toBe("C:/ca.pem")
    })

    it("clears the proxy vars when disabled", () => {
        applyProxy({ enabled: true, url: "http://p:1", noProxy: "x", caPath: "y" })
        applyProxy({ enabled: false, url: "", noProxy: "", caPath: "" })
        for (const k of KEYS) expect(process.env[k]).toBeUndefined()
    })

    it("treats an enabled-but-empty url as off", () => {
        applyProxy({ enabled: true, url: "   ", noProxy: "", caPath: "" })
        expect(process.env.HTTP_PROXY).toBeUndefined()
    })

    it("omits NO_PROXY / CA when not provided", () => {
        applyProxy({ enabled: true, url: "http://p:1", noProxy: "", caPath: "" })
        expect(process.env.HTTP_PROXY).toBe("http://p:1")
        expect(process.env.NO_PROXY).toBeUndefined()
        expect(process.env.NODE_EXTRA_CA_CERTS).toBeUndefined()
    })

    it("trims surrounding whitespace on the url", () => {
        applyProxy({ enabled: true, url: "  http://p:2  ", noProxy: "", caPath: "" })
        expect(process.env.HTTPS_PROXY).toBe("http://p:2")
    })
})
