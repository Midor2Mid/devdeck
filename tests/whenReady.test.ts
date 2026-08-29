import { describe, it, expect, beforeAll, vi } from "vitest"
import { useStore } from "../src/renderer/src/store"
import { leaf } from "../src/renderer/src/layout"
import type { WorkItem } from "../src/preload/index"

const workItem = (key: string, title: string): WorkItem => ({
    provider: "jira",
    key,
    title,
    type: "Task",
    status: "To Do",
    url: "",
    description: ""
})

const TERM = "t-ready"

let ptyData: (e: { id: string; data: string }) => void = () => undefined
let inputs: { id: string; data: string }[] = []
let bufferReply = ""

/** Only the namespaces this path touches, as in tests/paneHold.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            pty: {
                onData: (fn: (e: { id: string; data: string }) => void): (() => void) => {
                    ptyData = fn
                    return (): void => undefined
                },
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (id: string, data: string): void => {
                    inputs.push({ id, data })
                },
                buffer: async (): Promise<{ buffer: string; exitCode: number | undefined }> => ({
                    buffer: bufferReply,
                    exitCode: undefined
                })
            },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                })
            },
            workspace: {
                load: async () => ({ ok: false as const, reason: "missing" as const }),
                save: (): void => undefined
            },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

function seed(): void {
    useStore.setState({
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
        activity: []
    })
    inputs = []
    bufferReply = ""
}

// M8: five call sites slept a hard-coded 2800ms and then typed blind, and
// `writePty` drops a write to a session that is not live yet SILENTLY - so a
// slow CLI boot lost the prompt with no trace. Readiness was always observable
// (`onPtyData` sees the first byte) and never observed.
describe("whenReady", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    it("resolves once the session speaks and then settles", async () => {
        vi.useFakeTimers()
        try {
            seed()
            let settled: boolean | undefined
            void useStore
                .getState()
                .whenReady(TERM, { settleMs: 300, timeoutMs: 2800 })
                .then((r) => (settled = r))

            await vi.advanceTimersByTimeAsync(100)
            expect(settled).toBeUndefined()
            ptyData({ id: TERM, data: "claude>" })
            // The byte alone is not readiness: the settle is what says the CLI
            // has finished painting its prompt.
            await vi.advanceTimersByTimeAsync(200)
            expect(settled).toBeUndefined()
            await vi.advanceTimersByTimeAsync(150)
            expect(settled).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })

    it("restarts the settle while output is still arriving", async () => {
        vi.useFakeTimers()
        try {
            seed()
            let settled: boolean | undefined
            void useStore
                .getState()
                .whenReady(TERM, { settleMs: 300, timeoutMs: 2800 })
                .then((r) => (settled = r))
            for (let i = 0; i < 5; i++) {
                ptyData({ id: TERM, data: "." })
                await vi.advanceTimersByTimeAsync(200)
            }
            expect(settled).toBeUndefined()
            await vi.advanceTimersByTimeAsync(350)
            expect(settled).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })

    it("reports failure when nothing is ever printed", async () => {
        vi.useFakeTimers()
        try {
            seed()
            let settled: boolean | undefined
            void useStore
                .getState()
                .whenReady(TERM, { settleMs: 300, timeoutMs: 2800 })
                .then((r) => (settled = r))
            await vi.advanceTimersByTimeAsync(2900)
            expect(settled).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })

    it("does not report failure for output that arrived before anyone was waiting", async () => {
        // A re-attach, or a spawn that beat the subscription. The deadline asks
        // main once rather than reporting a false negative.
        vi.useFakeTimers()
        try {
            seed()
            bufferReply = "already printed this"
            let settled: boolean | undefined
            void useStore
                .getState()
                .whenReady(TERM, { settleMs: 300, timeoutMs: 2800 })
                .then((r) => (settled = r))
            await vi.advanceTimersByTimeAsync(2900)
            expect(settled).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })

    it("stays true for a CLI that never stops printing", async () => {
        // Streaming continuously is ready, not absent — the deadline must not
        // turn a talkative session into a reported failure.
        vi.useFakeTimers()
        try {
            seed()
            let settled: boolean | undefined
            void useStore
                .getState()
                .whenReady(TERM, { settleMs: 300, timeoutMs: 1000 })
                .then((r) => (settled = r))
            for (let i = 0; i < 12; i++) {
                ptyData({ id: TERM, data: "x" })
                await vi.advanceTimersByTimeAsync(100)
            }
            expect(settled).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })

    it("wakes each waiting session on its own bytes, not on another's", async () => {
        vi.useFakeTimers()
        try {
            seed()
            let a: boolean | undefined
            let b: boolean | undefined
            void useStore.getState().whenReady("t-a", { settleMs: 300, timeoutMs: 2800 }).then((r) => (a = r))
            void useStore.getState().whenReady("t-b", { settleMs: 300, timeoutMs: 2800 }).then((r) => (b = r))
            ptyData({ id: "t-a", data: "hi" })
            await vi.advanceTimersByTimeAsync(400)
            expect(a).toBe(true)
            expect(b).toBeUndefined()
            await vi.advanceTimersByTimeAsync(2500)
            expect(b).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })
})

// The reason this exists: the prompt used to be typed at t=2800 whether or not
// anything was listening, and nothing recorded that it might have been lost.
describe("a prompt sent to a session that never spoke", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
    })

    it("is still sent, and the activity feed says it may not have landed", async () => {
        // Both halves in one test on purpose: they are one behaviour, and reading
        // the feed left behind by a previous test would pass for the wrong reason.
        vi.useFakeTimers()
        try {
            seed()
            const done = useStore
                .getState()
                .startWork(workItem("ABC-1", "do the thing"))
            await vi.advanceTimersByTimeAsync(3200)
            await done
            // Never silently dropped - losing the work is worse than a quiet CLI.
            expect(inputs.some((i) => i.data.includes("ABC-1"))).toBe(true)
            // ...but the warning is the part that did not exist before.
            expect(
                useStore.getState().activity.some((a) => /printed nothing/i.test(a.label))
            ).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })

    it("stays quiet when the session does speak", async () => {
        vi.useFakeTimers()
        try {
            seed()
            const done = useStore
                .getState()
                .startWork(workItem("ABC-2", "the quick one"))
            // One byte from whichever session startWork just spawned.
            await vi.advanceTimersByTimeAsync(50)
            const termId = Object.keys(useStore.getState().termAgents).find((id) => id !== TERM)
            if (termId) ptyData({ id: termId, data: "claude>" })
            await vi.advanceTimersByTimeAsync(3200)
            await done
            expect(inputs.some((i) => i.data.includes("ABC-2"))).toBe(true)
            expect(
                useStore.getState().activity.some((a) => /printed nothing/i.test(a.label))
            ).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })
})
