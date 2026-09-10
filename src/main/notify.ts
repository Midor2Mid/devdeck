import { app, Notification } from "electron"

/**
 * Desktop notifications, raised from MAIN.
 *
 * WHY THIS MODULE EXISTS. The renderer cannot do this, and for eleven months it
 * looked like it could. `applySecurity()` installs
 * `session.setPermissionCheckHandler(() => false)`, and `notifications` is one
 * of the permissions that handler is asked about. Measured on 2026-09-10
 * against the real `file://` renderer (`docs/superpowers/brainstorm/
 * 2026-09-10-security.md`, F9): `Notification.permission` reads `denied`,
 * `Notification.requestPermission()` resolves `denied` with no prompt, and
 * `new Notification(...)` **does not throw** — it returns an object. Chromium's
 * answer to a denied notification is to construct it and drop it silently, so
 * the `try/catch` the old renderer path leaned on was the one signal that can
 * never fire here. The Desktop-notifications toggle had therefore never
 * delivered anything, and had never said so, on the surface a user reaches for
 * when they stop watching the deck.
 *
 * Electron's own `Notification` runs in this process, outside the renderer
 * permission model that handler configures, so the fix needs no exemption — and
 * an exemption is explicitly the wrong fix, because it would re-open the surface
 * the handler exists to close.
 *
 * WHAT THIS MODULE KNOWS, AND WHAT IT DOES NOT. `Notification.isSupported()` is
 * Electron's own availability answer for this OS, and on Windows an error while
 * creating or showing a toast arrives as the notification's `failed` event with
 * a reason. Both are recorded here and both are readable from the renderer, so
 * the settings toggle can stop claiming a delivery nobody made. Neither says the
 * user SAW anything: Focus Assist, Do Not Disturb, quiet hours and a full Action
 * Center are invisible to this process, so nothing here claims otherwise.
 */

/**
 * The Windows Application User Model ID.
 *
 * Windows attributes a toast to an installed Start Menu shortcut carrying this
 * id — that is Electron's own documented requirement for notifications on
 * Windows, not an inference. The NSIS installer writes the shortcut's id from
 * `build.appId` in package.json, so this string and that one must be the same.
 * `tests/notify.test.ts` asserts they are: a silent mismatch delivers nothing
 * and reports nothing, which is the exact failure this module exists to end.
 */
export const APP_USER_MODEL_ID = "com.devdeck.app"

/** Longest body we hand the OS. A toast is one short sentence, not a log. */
const BODY_MAX = 200

export interface NotifyState {
    /**
     * Electron's own answer for this OS. `false` means nothing can be
     * delivered here at all, and the settings toggle has to say so rather than
     * read `on` over a channel that discards everything.
     */
    supported: boolean
    /**
     * Why the last attempt failed, or `null`. Windows raises `failed` when it
     * cannot create or show the toast; that event is the signal the renderer
     * path never had. Cleared by a notification that actually shows.
     */
    error: string | null
}

let lastError: string | null = null
let activate: ((termId: string) => void) | null = null

/**
 * Set the app id before any window or notification exists.
 *
 * Called from `app.whenReady()`. Separate from module load so nothing here runs
 * during an import in a test process, where `app` is a mock.
 */
export function applyAppUserModelId(): void {
    app.setAppUserModelId(APP_USER_MODEL_ID)
}

/**
 * Where a click on a toast goes. One callback, registered by `index.ts`, which
 * raises the window and forwards the session id to the renderer — the point of
 * the notification is not "something happened" but "THIS agent needs you", so
 * clicking it has to land on that session.
 */
export function onNotifyActivate(cb: (termId: string) => void): void {
    activate = cb
}

export function notifyState(): NotifyState {
    return { supported: Notification.isSupported(), error: lastError }
}

/**
 * Show one attention notification, and report the state afterwards.
 *
 * `input` crosses IPC, so every field is checked here rather than trusted: the
 * body is collapsed to one line and bounded, because an unbounded multi-line
 * string handed to a fixed-size OS surface is the one way this call can be
 * something other than a short sentence.
 *
 * The body is composed by the CALLER, deliberately. The renderer already builds
 * that sentence for the in-app inbox entry raised by the same bell, and a toast
 * that composed its own would be a second construction of "who wants you" —
 * two statements of one fact, drifting the moment either is edited.
 *
 * A payload with nothing to show latches no error: that is our bug, not
 * something the user's machine did, and reporting it as an OS refusal in
 * Settings would be a new lie in place of the old one.
 */
export function showAttention(input: unknown): NotifyState {
    const p = (input ?? {}) as { termId?: unknown; body?: unknown }
    const termId = typeof p.termId === "string" ? p.termId : ""
    const body =
        typeof p.body === "string" ? p.body.replace(/\s+/g, " ").trim().slice(0, BODY_MAX) : ""
    if (!termId || !body) return notifyState()
    if (!Notification.isSupported()) return notifyState()
    const n = new Notification({ title: "DevDeck", body })
    n.on("click", () => activate?.(termId))
    // Windows only, and the reason this path can be honest at all.
    n.on("failed", (_e: unknown, error: string) => {
        lastError = error && error.trim() ? error.trim() : "the OS refused it"
    })
    // A toast that actually showed retires a stale refusal — otherwise one
    // failure would keep Settings warning about a channel that works again.
    n.on("show", () => {
        lastError = null
    })
    n.show()
    return notifyState()
}

/**
 * Drop the latched failure and the click callback.
 *
 * For tests: this module's state outlives a test, so a case that left an error
 * behind would make the next one pass for the wrong reason.
 */
export function resetNotify(): void {
    lastError = null
    activate = null
}
