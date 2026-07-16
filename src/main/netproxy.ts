// Corporate-proxy support. Applies an upstream proxy to the main process's env
// so every newly-spawned terminal and child process (npm / git / dotnet / gh)
// inherits it — createPty and child_process both spread `process.env` at spawn,
// and NODE_EXTRA_CA_CERTS lets those children trust a TLS-intercepting proxy's
// CA. This targets child processes (where the "npm breaks behind the proxy"
// pain actually lives); the main process's own TLS/fetch was fixed at startup.

export interface ProxyConfig {
    enabled: boolean
    url: string
    noProxy: string
    caPath: string
}

const KEYS = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS"
] as const

// Snapshot whatever the OS handed us at launch, once, so that *disabling* the
// in-app proxy restores the inherited environment instead of wiping a proxy the
// user had already configured system-wide.
const ORIGINAL: Record<string, string | undefined> = {}
let captured = false
function capture(): void {
    if (captured) return
    for (const k of KEYS) ORIGINAL[k] = process.env[k]
    captured = true
}

function restoreBaseline(): void {
    for (const k of KEYS) {
        if (ORIGINAL[k] === undefined) delete process.env[k]
        else process.env[k] = ORIGINAL[k]
    }
}

export function applyProxy(cfg: ProxyConfig | null | undefined): void {
    capture()
    restoreBaseline()
    if (!cfg?.enabled || !cfg.url?.trim()) return
    const url = cfg.url.trim()
    process.env.HTTP_PROXY = url
    process.env.HTTPS_PROXY = url
    process.env.http_proxy = url
    process.env.https_proxy = url
    const noProxy = cfg.noProxy?.trim()
    if (noProxy) {
        process.env.NO_PROXY = noProxy
        process.env.no_proxy = noProxy
    }
    const caPath = cfg.caPath?.trim()
    if (caPath) process.env.NODE_EXTRA_CA_CERTS = caPath
}
