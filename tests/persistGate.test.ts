import { describe, it, expect, vi, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { leaf } from "../src/renderer/src/layout"

// Same seam as tests/paneHold.test.ts: drive the real store through a stubbed
// `window.api`. What is under test is the one thing that used to be missing -
// that nothing is written to disk until init() has actually read what is there.

type WsLoad = () => Promise<unknown>

function stubApi(load: WsLoad, save: (d: unknown) => void): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (): (() => void) => (): void => undefined,
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (): void => undefined
            },
            // Desktop notifications are main's now (src/main/notify.ts); the
            // renderer only subscribes to a click on one. `init()` throws without
            // it, and these stubs are untyped casts, so nothing else would notice.
            notify: {
                state: async (): Promise<{ supported: boolean; error: string | null }> => ({
                    supported: true,
                    error: null
                }),
                attention: async (): Promise<{ supported: boolean; error: string | null }> => ({
                    supported: true,
                    error: null
                }),
                onActivate: (): (() => void) => (): void => undefined
            },
            // CLI-declared attention signals (src/shared/attention.ts). Subscribed
            // unconditionally in init(), like onData, so a stub without it throws.
            attention: { onDeclared: (): (() => void) => (): void => undefined },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                })
            },
            workspace: { load, save },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

describe("the workspace persistence gate", () => {
    beforeEach(() => {
        vi.useRealTimers()
        useStore.setState({ persistBlocked: null })
    })

    it("writes nothing while the initial load is still in flight", async () => {
        const save = vi.fn()
        // A load that never resolves - the window between mount and init().
        stubApi(() => new Promise<never>(() => undefined), save)

        useStore.getState().setTermLayout("grid")
        useStore.getState().flush()

        expect(save).not.toHaveBeenCalled()
    })

    it("writes nothing for the rest of the session when the store is unreadable", async () => {
        const save = vi.fn()
        stubApi(async () => ({ ok: false, reason: "unreadable" }), save)

        await useStore.getState().init()

        // The user is told, in state that lasts as long as the condition does.
        expect(useStore.getState().persistBlocked?.file).toBe("workspace.json")

        useStore.getState().setTermLayout("grid")
        useStore.getState().flush() // what beforeunload calls
        expect(save).not.toHaveBeenCalled()
    })

    it("persists normally on a fresh install", async () => {
        const save = vi.fn()
        stubApi(async () => ({ ok: false, reason: "missing" }), save)

        await useStore.getState().init()
        expect(useStore.getState().persistBlocked).toBeNull()

        useStore.getState().setTermLayout("grid")
        useStore.getState().flush()
        expect(save).toHaveBeenCalled()
    })

    it("drops a tab with an unreadable layout instead of losing the whole workspace", async () => {
        const save = vi.fn()
        stubApi(
            async () => ({
                ok: true,
                data: {
                    termLayout: "grid",
                    tabsByProject: {
                        p1: [
                            { id: "bad", name: "from an older schema" }, // no `root`
                            { id: "good", name: "fine", root: leaf("t1") }
                        ]
                    }
                }
            }),
            save
        )

        // Used to reject on the collectLeaves walk, leaving the store on its
        // module-load defaults for beforeunload to write out.
        await expect(useStore.getState().init()).resolves.toBeUndefined()

        const tabs = useStore.getState().tabsByProject.p1
        expect(tabs.map((t) => t.id)).toEqual(["good"])
        // The rest of the workspace survived, and saving is allowed again.
        expect(useStore.getState().termLayout).toBe("grid")
        useStore.getState().flush()
        expect(save).toHaveBeenCalled()
    })
})
