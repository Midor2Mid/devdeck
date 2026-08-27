import { describe, it, expect, vi, afterEach } from "vitest"
import { useSettings } from "../src/renderer/src/settings"

/**
 * A truthy non-array `usageLog` used to throw inside load(), one line before
 * `loaded = true`. The throw was swallowed (load() is fire-and-forget from App's
 * mount effect), so the gate never opened and EVERY save was silently dropped -
 * every launch, forever, with the only evidence a console.warn in a DevTools
 * console that is closed in a packaged build. Same mechanism as the workspace
 * loader, already shipping.
 */
describe("a settings.json with a damaged usageLog", () => {
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

    it("still loads, and still saves", async () => {
        const save = vi.fn()
        stubEnv({ usageLog: "nope" }, save)

        await expect(useSettings.getState().load()).resolves.toBeUndefined()

        useSettings.getState().flush()
        expect(save).toHaveBeenCalled()
    })

    it("keeps a real usageLog", async () => {
        const save = vi.fn()
        stubEnv({ usageLog: [{ startedAt: 1, endedAt: 2 }] }, save)
        await useSettings.getState().load()
        expect(useSettings.getState().usageLog).toEqual([{ startedAt: 1, endedAt: 2 }])
    })
})
