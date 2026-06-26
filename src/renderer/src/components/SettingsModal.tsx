import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { useSettings, DEFAULT_ACCENT, type ShellKind } from "../settings"
import type { ServerStatus } from "../../../preload/index"

type Section =
    | "appearance"
    | "terminal"
    | "editor"
    | "claude"
    | "remote"
    | "shortcuts"
    | "about"

const SECTIONS: { key: Section; label: string }[] = [
    { key: "appearance", label: "Appearance" },
    { key: "terminal", label: "Terminal" },
    { key: "editor", label: "Editor" },
    { key: "claude", label: "Claude" },
    { key: "remote", label: "Remote (Mobile)" },
    { key: "shortcuts", label: "Shortcuts" },
    { key: "about", label: "About" }
]

function RemoteSection(): JSX.Element {
    const remote = useSettings((s) => s.remote)
    const setRemote = useSettings((s) => s.setRemote)
    const regenerateToken = useSettings((s) => s.regenerateToken)
    const [status, setStatus] = useState<ServerStatus | null>(null)
    const [qr, setQr] = useState<string>("")

    const host = status?.tailscale[0] ?? status?.lan[0] ?? ""
    const url = host ? `http://${host}:${remote.port}/?token=${remote.token}` : ""

    useEffect(() => {
        let on = true
        const tick = (): void => {
            window.api.server.status().then((s) => on && setStatus(s))
        }
        tick()
        const iv = setInterval(tick, 2000)
        return () => {
            on = false
            clearInterval(iv)
        }
    }, [])

    useEffect(() => {
        if (url) QRCode.toDataURL(url, { margin: 1, width: 190 }).then(setQr)
        else setQr("")
    }, [url])

    return (
        <div className="settings-section">
            <h3>Remote access (mobile)</h3>
            <div className="setting-row">
                <label>Enable</label>
                <input
                    type="checkbox"
                    className="checkbox"
                    checked={remote.enabled}
                    onChange={(e) => setRemote({ enabled: e.target.checked })}
                />
            </div>
            <div className="setting-row">
                <label>Port</label>
                <input
                    type="number"
                    value={remote.port}
                    onChange={(e) => setRemote({ port: Number(e.target.value) })}
                />
            </div>
            <div className="setting-row">
                <label>Access token</label>
                <div className="accent-controls">
                    <code className="token">{remote.token || "(generated when enabled)"}</code>
                    <button onClick={regenerateToken}>Regenerate</button>
                </div>
            </div>

            {remote.enabled && (
                <div className="remote-connect">
                    <div className="remote-status">
                        Server: {status?.running ? "running" : "stopped"}
                        {status?.tailscale.length ? " · Tailscale detected" : ""}
                    </div>
                    {url ? (
                        <div className="remote-url-block">
                            {qr && <img className="qr" src={qr} alt="connect QR" />}
                            <div>
                                <div className="muted small">Open on your phone:</div>
                                <code className="token url">{url}</code>
                                {status && status.tailscale.length === 0 && (
                                    <div className="settings-hint">
                                        No Tailscale address found — this URL is LAN-only (same
                                        Wi-Fi). Install Tailscale on this PC and your phone to
                                        reach it from anywhere.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="muted small">Detecting network address…</div>
                    )}
                </div>
            )}

            <p className="settings-hint">
                ⚠ A remote terminal can run commands on this machine. Keep the token private,
                prefer Tailscale (never expose the port publicly), and turn this off when not
                needed.
            </p>
        </div>
    )
}

const ACCENT_PRESETS = ["#b8895c", "#8c9a68", "#7fa0a0", "#a98ba5", "#c4855d", "#9a8c98"]

const SHELLS: { value: ShellKind; label: string }[] = [
    { value: "powershell", label: "PowerShell" },
    { value: "cmd", label: "Command Prompt" },
    { value: "gitbash", label: "Git Bash" },
    { value: "wsl", label: "WSL" },
    { value: "custom", label: "Custom…" }
]

const SHORTCUTS: [string, string][] = [
    ["Ctrl+Shift+T", "New shell tab"],
    ["Ctrl+Shift+Enter", "New Claude session"],
    ["Ctrl+Shift+W", "Close focused pane"],
    ["Ctrl+Shift+\\", "Split right"],
    ["Ctrl+Shift+-", "Split down"],
    ["Ctrl+Shift+] / [", "Next / previous tab"],
    ["Ctrl+Shift+F", "Find in terminal"],
    ["Ctrl+S", "Save file (editor)"],
    ["Ctrl+Enter", "Run query (database)"]
]

export function SettingsModal(): JSX.Element {
    const s = useSettings()
    const [section, setSection] = useState<Section>("appearance")

    return (
        <div className="modal-backdrop" onMouseDown={s.closeSettings}>
            <div
                className="modal settings-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="settings-nav">
                    <div className="settings-nav-title">Settings</div>
                    {SECTIONS.map((sec) => (
                        <div
                            key={sec.key}
                            className={"settings-nav-item" + (section === sec.key ? " active" : "")}
                            onClick={() => setSection(sec.key)}
                        >
                            {sec.label}
                        </div>
                    ))}
                </div>

                <div className="settings-content">
                    <button className="settings-close" title="Close" onClick={s.closeSettings}>
                        ×
                    </button>

                    {section === "appearance" && (
                        <div className="settings-section">
                            <h3>Appearance</h3>
                            <div className="setting-row">
                                <label>Accent color</label>
                                <div className="accent-controls">
                                    <input
                                        type="color"
                                        value={s.appearance.accent}
                                        onChange={(e) =>
                                            s.setAppearance({ accent: e.target.value })
                                        }
                                    />
                                    <div className="swatches">
                                        {ACCENT_PRESETS.map((c) => (
                                            <span
                                                key={c}
                                                className="swatch"
                                                style={{ background: c }}
                                                onClick={() => s.setAppearance({ accent: c })}
                                            />
                                        ))}
                                    </div>
                                    <button onClick={() => s.setAppearance({ accent: DEFAULT_ACCENT })}>
                                        Reset
                                    </button>
                                </div>
                            </div>
                            <p className="settings-hint">
                                Theme: Sumi &amp; Kinari (wabi-sabi dark). A light "washi paper"
                                theme is on the roadmap.
                            </p>
                        </div>
                    )}

                    {section === "terminal" && (
                        <div className="settings-section">
                            <h3>Terminal</h3>
                            <div className="setting-row">
                                <label>Default shell</label>
                                <select
                                    value={s.terminal.shell}
                                    onChange={(e) =>
                                        s.setTerminal({ shell: e.target.value as ShellKind })
                                    }
                                >
                                    {SHELLS.map((sh) => (
                                        <option key={sh.value} value={sh.value}>
                                            {sh.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {(s.terminal.shell === "custom" || s.terminal.shell === "gitbash") && (
                                <div className="setting-row">
                                    <label>Shell path</label>
                                    <input
                                        value={s.terminal.customShellPath}
                                        placeholder="C:\\path\\to\\shell.exe"
                                        onChange={(e) =>
                                            s.setTerminal({ customShellPath: e.target.value })
                                        }
                                    />
                                </div>
                            )}
                            <div className="setting-row">
                                <label>Font family</label>
                                <input
                                    value={s.terminal.fontFamily}
                                    onChange={(e) =>
                                        s.setTerminal({ fontFamily: e.target.value })
                                    }
                                />
                            </div>
                            <div className="setting-row">
                                <label>Font size</label>
                                <input
                                    type="number"
                                    min={8}
                                    max={28}
                                    value={s.terminal.fontSize}
                                    onChange={(e) =>
                                        s.setTerminal({ fontSize: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <p className="settings-hint">
                                Shell changes apply to newly opened terminals.
                            </p>
                        </div>
                    )}

                    {section === "editor" && (
                        <div className="settings-section">
                            <h3>Editor</h3>
                            <div className="setting-row">
                                <label>Font size</label>
                                <input
                                    type="number"
                                    min={8}
                                    max={28}
                                    value={s.editor.fontSize}
                                    onChange={(e) =>
                                        s.setEditor({ fontSize: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <div className="setting-row">
                                <label>Tab size</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={8}
                                    value={s.editor.tabSize}
                                    onChange={(e) =>
                                        s.setEditor({ tabSize: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <div className="setting-row">
                                <label>Word wrap</label>
                                <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={s.editor.wordWrap}
                                    onChange={(e) => s.setEditor({ wordWrap: e.target.checked })}
                                />
                            </div>
                            <div className="setting-row">
                                <label>Minimap</label>
                                <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={s.editor.minimap}
                                    onChange={(e) => s.setEditor({ minimap: e.target.checked })}
                                />
                            </div>
                        </div>
                    )}

                    {section === "claude" && (
                        <div className="settings-section">
                            <h3>Claude</h3>
                            <div className="setting-row">
                                <label>Command</label>
                                <input
                                    value={s.claude.command}
                                    onChange={(e) => s.setClaude({ command: e.target.value })}
                                />
                            </div>
                            <div className="setting-row">
                                <label>Resume args</label>
                                <input
                                    value={s.claude.continueArgs}
                                    onChange={(e) =>
                                        s.setClaude({ continueArgs: e.target.value })
                                    }
                                />
                            </div>
                            <div className="setting-row">
                                <label>Idle → attention (ms)</label>
                                <input
                                    type="number"
                                    min={300}
                                    max={5000}
                                    step={100}
                                    value={s.claude.attentionIdleMs}
                                    onChange={(e) =>
                                        s.setClaude({ attentionIdleMs: Number(e.target.value) })
                                    }
                                />
                            </div>
                            <p className="settings-hint">
                                "Command" is what the <b>+ Claude</b> button runs; resume runs
                                "command + resume args". Idle time controls how quickly a quiet
                                session is marked idle.
                            </p>
                        </div>
                    )}

                    {section === "remote" && <RemoteSection />}

                    {section === "shortcuts" && (
                        <div className="settings-section">
                            <h3>Keyboard shortcuts</h3>
                            <table className="shortcuts-table">
                                <tbody>
                                    {SHORTCUTS.map(([k, v]) => (
                                        <tr key={k}>
                                            <td>
                                                <kbd>{k}</kbd>
                                            </td>
                                            <td>{v}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {section === "about" && (
                        <div className="settings-section">
                            <h3>DevDeck</h3>
                            <p className="settings-hint">
                                A command deck for terminal-first, Claude-driven development —
                                multiple terminals, fast project switching, editor, API client,
                                and database in one window.
                            </p>
                            <p className="muted small">Version 0.1.0 · Electron + React</p>
                            <p className="muted small">
                                Sections like Git accounts, SSH, MCP and Remote access are on the
                                roadmap.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
