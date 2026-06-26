import { useState } from "react"
import { useSettings, DEFAULT_ACCENT, type ShellKind } from "../settings"

type Section = "appearance" | "terminal" | "editor" | "claude" | "shortcuts" | "about"

const SECTIONS: { key: Section; label: string }[] = [
    { key: "appearance", label: "Appearance" },
    { key: "terminal", label: "Terminal" },
    { key: "editor", label: "Editor" },
    { key: "claude", label: "Claude" },
    { key: "shortcuts", label: "Shortcuts" },
    { key: "about", label: "About" }
]

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
