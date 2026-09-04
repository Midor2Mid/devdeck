import { describe, it, expect, vi, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"

// Same seam as tests/viewByProject.test.ts: drive the real store through a
// stubbed `window.api`. What is under test is the one thing deleting a layout
// can break that no type and no build catches - a workspace.json written by an
// older build that still names it. 0.12.0 wrote `canvas`; reading it back
// unchanged matched no branch in TerminalView and the stage rendered nothing.

const PROJECTS = [{ id: "p1", path: "C:/a", name: "a" }]

function stubApi(workspace: unknown): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (): void => undefined
            },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: PROJECTS,
                    activeId: "p1"
                }),
                setActive: async (): Promise<void> => undefined
            },
            workspace: { load: async () => workspace, save: (): void => undefined },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

describe("reading a terminal layout this build no longer has", () => {
    beforeEach(() => {
        vi.useRealTimers()
        useStore.setState({ termLayout: "tabs", persistBlocked: null })
    })

    it("opens a workspace that names canvas on Grid", async () => {
        stubApi({ ok: true, data: { termLayout: "canvas" } })

        await useStore.getState().init()

        // Grid, not the `tabs` default: Grid is the layout Canvas did the job of,
        // so a user who arranged panes side by side stays side by side.
        expect(useStore.getState().termLayout).toBe("grid")
    })

    it("keeps a layout this build does still have", async () => {
        stubApi({ ok: true, data: { termLayout: "overview" } })

        await useStore.getState().init()

        expect(useStore.getState().termLayout).toBe("overview")
    })

    it("falls back to tabs for an absent or unrecognisable value", async () => {
        stubApi({ ok: true, data: {} })
        await useStore.getState().init()
        expect(useStore.getState().termLayout).toBe("tabs")

        useStore.setState({ termLayout: "grid", persistBlocked: null })
        stubApi({ ok: true, data: { termLayout: 7 } })
        await useStore.getState().init()
        expect(useStore.getState().termLayout).toBe("tabs")
    })
})
