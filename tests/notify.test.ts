import { describe, it, expect, beforeEach, vi } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

/**
 * Desktop notifications, raised from main.
 *
 * The defect these cover is not a crash: the renderer's `new Notification(...)`
 * returned an object, threw nothing, and delivered nothing, for every build up
 * to 2026-09-10. So most of these tests are about the ABSENCE of a delivery and
 * the PRESENCE of a reason — a mock that quietly does nothing cannot show
 * either, so every construction and every `show()` is recorded here and
 * asserted against.
 */
const h = vi.hoisted(() => ({
    supported: true,
    appId: null as string | null,
    /** Every Notification the module constructed, in order. */
    constructed: [] as { title: string; body: string; shown: number }[],
    /** The live fakes, so a test can raise `failed` / `show` / `click` on one. */
    fakes: [] as { emit: (event: string, ...args: unknown[]) => void }[]
}))

vi.mock("electron", () => {
    class FakeNotification {
        private listeners = new Map<string, ((...args: unknown[]) => void)[]>()
        private record: { title: string; body: string; shown: number }
        constructor(opts: { title: string; body: string }) {
            this.record = { title: opts.title, body: opts.body, shown: 0 }
            h.constructed.push(this.record)
            h.fakes.push({
                emit: (event: string, ...args: unknown[]): void => {
                    for (const fn of this.listeners.get(event) ?? []) fn(...args)
                }
            })
        }
        on(event: string, fn: (...args: unknown[]) => void): this {
            const list = this.listeners.get(event) ?? []
            list.push(fn)
            this.listeners.set(event, list)
            return this
        }
        show(): void {
            this.record.shown++
            for (const fn of this.listeners.get("show") ?? []) fn()
        }
        static isSupported(): boolean {
            return h.supported
        }
    }
    return {
        app: {
            setAppUserModelId: (id: string): void => {
                h.appId = id
            }
        },
        Notification: FakeNotification
    }
})

import {
    APP_USER_MODEL_ID,
    applyAppUserModelId,
    notifyState,
    onNotifyActivate,
    resetNotify,
    showAttention
} from "../src/main/notify"

describe("notify (desktop notifications from main)", () => {
    beforeEach(() => {
        h.supported = true
        h.appId = null
        h.constructed.length = 0
        h.fakes.length = 0
        resetNotify()
    })

    /**
     * Windows attributes a toast to an installed shortcut carrying this id, and
     * the NSIS installer writes the shortcut's id from `build.appId`. A silent
     * mismatch between the two delivers nothing and reports nothing — the exact
     * failure this module exists to end — so the two strings are pinned to each
     * other here rather than left to be equal by luck.
     */
    it("uses the installer's own appId as the Application User Model ID", () => {
        const pkg = JSON.parse(
            readFileSync(join(__dirname, "..", "package.json"), "utf8")
        ) as { build?: { appId?: string } }
        expect(APP_USER_MODEL_ID).toBe(pkg.build?.appId)
        applyAppUserModelId()
        expect(h.appId).toBe(APP_USER_MODEL_ID)
    })

    it("shows one notification carrying the caller's own sentence", () => {
        const st = showAttention({ termId: "t1", body: "claude 1 - alpha app needs attention" })
        expect(h.constructed).toEqual([
            { title: "DevDeck", body: "claude 1 - alpha app needs attention", shown: 1 }
        ])
        expect(st).toEqual({ supported: true, error: null })
    })

    /**
     * The whole point of the move to main: when the capability is absent, say
     * so. The old renderer path constructed an object here and dropped it.
     */
    it("constructs nothing at all when the OS does not support notifications", () => {
        h.supported = false
        const st = showAttention({ termId: "t1", body: "claude 1 needs attention" })
        expect(h.constructed).toEqual([])
        expect(st.supported).toBe(false)
    })

    it("reports Windows refusing the toast, instead of swallowing it", () => {
        showAttention({ termId: "t1", body: "claude 1 needs attention" })
        h.fakes[0].emit("failed", {}, "Notification failed to show")
        expect(notifyState()).toEqual({ supported: true, error: "Notification failed to show" })
    })

    it("names the refusal even when the OS gives no reason", () => {
        showAttention({ termId: "t1", body: "claude 1 needs attention" })
        h.fakes[0].emit("failed", {}, "   ")
        expect(notifyState().error).toBe("the OS refused it")
    })

    /** A channel that works again must not keep warning about a past failure. */
    it("retires a latched failure once a notification actually shows", () => {
        showAttention({ termId: "t1", body: "first" })
        h.fakes[0].emit("failed", {}, "boom")
        expect(notifyState().error).toBe("boom")
        showAttention({ termId: "t1", body: "second" })
        expect(notifyState().error).toBeNull()
    })

    it("hands a click back with the session it was raised for", () => {
        const clicked: string[] = []
        onNotifyActivate((termId) => clicked.push(termId))
        showAttention({ termId: "t-42", body: "claude 1 needs attention" })
        h.fakes[0].emit("click", {})
        expect(clicked).toEqual(["t-42"])
    })

    /**
     * The payload crosses IPC, so it is checked rather than trusted. An
     * unusable one is OUR bug, not the machine's, so it latches no error:
     * reporting it in Settings as an OS refusal would put a new lie where the
     * old one was.
     */
    it("shows nothing for a payload with no session or no text, and latches no error", () => {
        for (const bad of [
            undefined,
            null,
            {},
            { termId: "t1" },
            { body: "needs attention" },
            { termId: "t1", body: "   " },
            { termId: 7, body: "needs attention" },
            { termId: "t1", body: { toString: () => "nope" } }
        ]) {
            expect(showAttention(bad)).toEqual({ supported: true, error: null })
        }
        expect(h.constructed).toEqual([])
    })

    it("collapses the body to one line and bounds its length", () => {
        showAttention({ termId: "t1", body: "  claude 1\nneeds\tattention  " })
        expect(h.constructed[0].body).toBe("claude 1 needs attention")
        showAttention({ termId: "t1", body: "x".repeat(5000) })
        expect(h.constructed[1].body.length).toBe(200)
    })
})
