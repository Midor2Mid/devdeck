import { describe, it, expect, vi, afterEach } from "vitest"
import { useSettings } from "../src/renderer/src/settings"

/**
 * The owner's D1 ruling was "orphan the keys, do not prune user data": a user
 * who upgrades past a deleted panel and then downgrades gets their data back.
 * `writeNow` destructured a fixed whitelist off the store and saved exactly it,
 * so ANY key on disk that the running build no longer models was dropped on the
 * next save - a prune by omission, invisible to the typecheck and to every
 * existing spec. These tests are the ones that had to fail before a single
 * store slice was deleted.
 */
describe("a settings.json carrying keys this build does not model", () => {
    function stubEnv(raw: unknown, save: (d: unknown) => void): void {
        const g = globalThis as unknown as { window: unknown; document: unknown }
        g.document = {
            documentElement: { style: { setProperty: (): void => undefined }, dataset: {} }
        }
        g.window = {
            api: {
                settings: { load: async (): Promise<unknown> => raw, save },
                server: {
                    stop: async (): Promise<void> => undefined,
                    start: async (): Promise<{ ok: boolean }> => ({ ok: true })
                },
                mcpsrv: {
                    start: async (): Promise<void> => undefined,
                    stop: async (): Promise<void> => undefined
                },
                triggers: { apply: (): void => undefined },
                netproxy: { apply: (): void => undefined }
            }
        }
    }

    afterEach(() => {
        const g = globalThis as unknown as { window?: unknown; document?: unknown }
        delete g.window
        delete g.document
    })

    it("preserves an unknown key through a load -> save round-trip", async () => {
        const save = vi.fn()
        // `connections` is exactly the shape D1 deletes: real user data whose
        // panel is gone, which must survive an upgrade-then-downgrade.
        stubEnv({ connections: [{ id: "c1", kind: "pg", host: "db.local" }] }, save)

        await useSettings.getState().load()
        useSettings.getState().setDefaultAgentId("claude")
        useSettings.getState().flush()

        expect(save).toHaveBeenCalled()
        const saved = save.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(saved.connections).toEqual([{ id: "c1", kind: "pg", host: "db.local" }])
    })

    it("lets a modelled key win over the retained copy", async () => {
        const save = vi.fn()
        stubEnv({ defaultAgentId: "codex", orphan: 1 }, save)

        await useSettings.getState().load()
        useSettings.getState().setDefaultAgentId("claude")
        useSettings.getState().flush()

        const saved = save.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(saved.defaultAgentId).toBe("claude")
        expect(saved.orphan).toBe(1)
    })

    it("does not invent keys on a fresh install", async () => {
        const save = vi.fn()
        stubEnv(null, save)

        await useSettings.getState().load()
        useSettings.getState().flush()

        const saved = save.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(Object.keys(saved)).not.toContain("connections")
    })
})

/**
 * "Reset all settings" is the one place a prune is honest - the user asked for
 * it. A separate describe block because it needs its own load, and the store is
 * a module singleton.
 */
describe("resetAll", () => {
    afterEach(() => {
        const g = globalThis as unknown as { window?: unknown; document?: unknown }
        delete g.window
        delete g.document
    })

    it("drops the retained keys too", async () => {
        const save = vi.fn()
        const g = globalThis as unknown as { window: unknown; document: unknown }
        g.document = {
            documentElement: { style: { setProperty: (): void => undefined }, dataset: {} }
        }
        g.window = {
            api: {
                settings: {
                    load: async (): Promise<unknown> => ({ connections: [{ id: "c1" }] }),
                    save
                },
                server: {
                    stop: async (): Promise<void> => undefined,
                    start: async (): Promise<{ ok: boolean }> => ({ ok: true })
                },
                mcpsrv: {
                    start: async (): Promise<void> => undefined,
                    stop: async (): Promise<void> => undefined
                },
                triggers: { apply: (): void => undefined },
                netproxy: { apply: (): void => undefined }
            }
        }

        await useSettings.getState().load()
        useSettings.getState().resetAll()
        useSettings.getState().flush()

        const saved = save.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect(saved.connections).toBeUndefined()
    })
})
