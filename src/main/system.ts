import { execFile } from "child_process"
import type { DockerContainer, ListenPort, SystemInfo } from "../preload/index"

/** Parse `docker ps --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"`. */
export function parseDockerPs(stdout: string): DockerContainer[] {
    const out: DockerContainer[] = []
    for (const raw of stdout.split("\n")) {
        const line = raw.trim()
        if (!line) continue
        const [name, status = "", ports = ""] = line.split("\t")
        if (name) out.push({ name, status, ports })
    }
    return out
}

/** Parse `netstat -ano -p TCP`: LISTENING ports (port + pid), deduped by port. */
export function parseNetstat(stdout: string): ListenPort[] {
    const seen = new Set<number>()
    const out: ListenPort[] = []
    for (const raw of stdout.split("\n")) {
        const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i.exec(raw)
        if (!m) continue
        const port = Number(m[1])
        if (seen.has(port)) continue
        seen.add(port)
        out.push({ port, pid: Number(m[2]) })
    }
    return out
}

function dockerInfo(): Promise<{ dockerAvailable: boolean; docker: DockerContainer[] }> {
    return new Promise((resolve) => {
        execFile(
            "docker",
            ["ps", "--format", "{{.Names}}\t{{.Status}}\t{{.Ports}}"],
            { timeout: 4000, windowsHide: true },
            (err, stdout) => {
                if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
                    resolve({ dockerAvailable: false, docker: [] })
                    return
                }
                resolve({ dockerAvailable: true, docker: parseDockerPs(stdout || "") })
            }
        )
    })
}

function portsInfo(): Promise<ListenPort[]> {
    return new Promise((resolve) => {
        execFile(
            "netstat",
            ["-ano", "-p", "TCP"],
            { timeout: 4000, windowsHide: true, maxBuffer: 4_000_000 },
            (_err, stdout) => {
                // Non-system (user/dev) ports only, capped for a calm strip.
                resolve(parseNetstat(stdout || "").filter((p) => p.port >= 1024).slice(0, 24))
            }
        )
    })
}

/** Ambient system state for the Mission Control strip: Docker + listening ports. */
export async function info(): Promise<SystemInfo> {
    const [docker, ports] = await Promise.all([dockerInfo(), portsInfo()])
    return { ...docker, ports }
}
