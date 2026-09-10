import { describe, it, expect, vi, beforeEach } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { leaf } from "../src/renderer/src/layout"

// Same seam as tests/persistGate.test.ts: drive the real store through a stubbed
// `window.api`. What is under test is that a project remembers the view it was
// last looking at - the defect being fixed is that `view` was global while
// `activeTabByProject` / `activePaneByProject` were per project, so switching
// projects left you in the *previous* project's view pointed at this project's
// data.

const PROJECTS = [
    { id: "p1", path: "C:/a", name: "a" },
    { id: "p2", path: "C:/b", name: "b" }
]

function stubApi(workspace: unknown, activeId: string | null = "p1"): void {
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
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: PROJECTS,
                    activeId
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

describe("a project remembers its view", () => {
    beforeEach(() => {
        vi.useRealTimers()
        useStore.setState({ viewByProject: {}, view: "mission", persistBlocked: null })
    })

    it("seeds the active project from the global view on the first launch after the upgrade", async () => {
        // A workspace written before `viewByProject` existed: it knows only that
        // the window was last on `api`.
        stubApi({ ok: true, data: { view: "api" } })

        await useStore.getState().init()

        expect(useStore.getState().view).toBe("api")
        expect(useStore.getState().viewByProject.p1).toBe("api")
    })

    it("records the view under the active project as you switch views", async () => {
        stubApi({ ok: true, data: {} })
        await useStore.getState().init()

        useStore.getState().setView("database")

        expect(useStore.getState().viewByProject.p1).toBe("database")
    })

    it("restores the view a project was last looking at", async () => {
        stubApi({ ok: true, data: { view: "mission", viewByProject: { p1: "editor", p2: "api" } } })
        await useStore.getState().init()

        await useStore.getState().setActiveProject("p2")
        expect(useStore.getState().view).toBe("api")

        await useStore.getState().setActiveProject("p1")
        expect(useStore.getState().view).toBe("editor")
    })

    // This assertion used to read `browser` - "the stage must not move under the
    // user". It was reversed deliberately: a project with no remembered place has
    // nothing for Browser (or Mission, or Editor) to show, and Terminal is the
    // one screen that says what this project can run. See resolveViewFor. The
    // cost is one moved stage per project, once; the case it fixes is the first
    // folder a stranger ever opens.
    it("lands on Terminal when arriving at a project it has never seen", async () => {
        stubApi({ ok: true, data: { view: "browser", viewByProject: { p1: "browser" } } })
        await useStore.getState().init()

        await useStore.getState().setActiveProject("p2")

        expect(useStore.getState().view).toBe("terminal")

        // And the project that DID have a remembered place still gets it back -
        // the change is scoped to first contact.
        await useStore.getState().setActiveProject("p1")
        expect(useStore.getState().view).toBe("browser")
    })

    it("drops a persisted view this build does not know", async () => {
        // workspace.json outlives the build that wrote it. A view name no
        // `.deck-view` matches would restore as a blank stage with nothing to
        // click, so it is discarded rather than trusted.
        stubApi({
            ok: true,
            data: { view: "mission", viewByProject: { p1: "mission", p2: "seance" } }
        })
        await useStore.getState().init()

        expect(useStore.getState().viewByProject.p2).toBeUndefined()

        // Dropped, so p2 is now a project with no recorded view - which lands on
        // Terminal. What matters here is that `seance` was not honoured and the
        // stage is not blank.
        await useStore.getState().setActiveProject("p2")
        expect(useStore.getState().view).toBe("terminal")
    })

    it("leaves a project remembering where it was when a jump changes project and view at once", async () => {
        stubApi({ ok: true, data: { view: "editor", viewByProject: { p1: "editor" } } })
        await useStore.getState().init()

        // jumpToTerm lands on p2's terminal; p1 must still remember `editor`.
        useStore.setState({
            tabsByProject: { p2: [{ id: "t", name: "t", root: leaf("x") }] } as never
        })
        useStore.getState().jumpToTerm("x")

        expect(useStore.getState().view).toBe("terminal")
        expect(useStore.getState().viewByProject.p2).toBe("terminal")
        expect(useStore.getState().viewByProject.p1).toBe("editor")
    })
})
