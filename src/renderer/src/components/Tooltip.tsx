import { useEffect, useRef, useState, type CSSProperties } from "react"

/**
 * Lightweight tooltip layer. Any element with a `data-tip="…"` attribute shows
 * a styled tooltip after a short hover, or on keyboard focus (hidden by
 * default). Optional `data-tip-pos="right|top|bottom"` (default bottom).
 * Rendered fixed-position at the document root so it never clips against the
 * rail, panes, or overflow.
 *
 * "Warm" window: while a tip is visible — or within WARM_WINDOW_MS of the last
 * one hiding — a new tip shows immediately (no hover delay) and skips the
 * entrance animation (via `data-instant`), so scanning a toolbar isn't sluggish.
 */
type Pos = "right" | "top" | "bottom"
interface TipState {
    text: string
    pos: Pos
    /** Skip the entrance animation (shown inside the warm window). */
    instant: boolean
    rect: { left: number; right: number; top: number; bottom: number; width: number; height: number }
}

const HOVER_DELAY_MS = 420
const WARM_WINDOW_MS = 500

export function TooltipLayer(): JSX.Element | null {
    const [tip, setTip] = useState<TipState | null>(null)
    const elRef = useRef<Element | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const visibleRef = useRef(false)
    const hiddenAt = useRef(0)

    useEffect(() => {
        const show = (el: Element, instant: boolean): void => {
            const text = el.getAttribute("data-tip")
            if (!text) return
            const pos = (el.getAttribute("data-tip-pos") as Pos) || "bottom"
            const r = el.getBoundingClientRect()
            visibleRef.current = true
            setTip({
                text,
                pos,
                instant,
                rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
            })
        }
        const hideTip = (): void => {
            if (visibleRef.current) {
                visibleRef.current = false
                hiddenAt.current = Date.now()
            }
            setTip(null)
        }
        // Show a tip for `el`: instantly while warm (a tip is visible, or one
        // hid < WARM_WINDOW_MS ago), otherwise after the usual hover delay.
        const schedule = (el: Element): void => {
            clearTimeout(timer.current)
            if (visibleRef.current || Date.now() - hiddenAt.current < WARM_WINDOW_MS) {
                show(el, true)
            } else {
                timer.current = setTimeout(() => show(el, false), HOVER_DELAY_MS)
            }
        }
        // Shared enter/leave logic for both the hover (mouseover/mouseout) and
        // keyboard-focus (focusin/focusout) paths.
        const enter = (target: EventTarget | null): void => {
            const el = (target as Element)?.closest?.("[data-tip]")
            if (!el || el === elRef.current) return
            elRef.current = el
            schedule(el)
        }
        const leave = (target: EventTarget | null, related: EventTarget | null): void => {
            const el = (target as Element)?.closest?.("[data-tip]")
            if (!el) return
            const to = related as Node | null
            if (to && el.contains(to)) return
            if (el === elRef.current) {
                elRef.current = null
                clearTimeout(timer.current)
                hideTip()
            }
        }
        const onOver = (e: MouseEvent): void => enter(e.target)
        const onOut = (e: MouseEvent): void => leave(e.target, e.relatedTarget)
        // Focus path is keyboard-only: clicking a button also focuses it, and
        // without this gate the tip would flicker off (mousedown hides) then
        // instantly re-show via focusin inside the warm window. Mouse-click
        // focus does not match :focus-visible; keyboard Tab does.
        const onFocusIn = (e: FocusEvent): void => {
            const el = (e.target as Element)?.closest?.("[data-tip]")
            if (!el) return
            try {
                if ("matches" in el && !el.matches(":focus-visible")) return
            } catch {
                // Engine without :focus-visible support — fall through and show.
            }
            enter(el)
        }
        const onFocusOut = (e: FocusEvent): void => leave(e.target, e.relatedTarget)
        // Full dismiss (scroll / click / typing). Tabbing still shows the next
        // tip: keydown hides first, then the focus change fires focusin which
        // re-shows — inside the warm window, so it appears instantly.
        const hide = (): void => {
            clearTimeout(timer.current)
            elRef.current = null
            hideTip()
        }
        document.addEventListener("mouseover", onOver)
        document.addEventListener("mouseout", onOut)
        window.addEventListener("focusin", onFocusIn)
        window.addEventListener("focusout", onFocusOut)
        window.addEventListener("scroll", hide, true)
        window.addEventListener("mousedown", hide, true)
        window.addEventListener("keydown", hide, true)
        return () => {
            document.removeEventListener("mouseover", onOver)
            document.removeEventListener("mouseout", onOut)
            window.removeEventListener("focusin", onFocusIn)
            window.removeEventListener("focusout", onFocusOut)
            window.removeEventListener("scroll", hide, true)
            window.removeEventListener("mousedown", hide, true)
            window.removeEventListener("keydown", hide, true)
            clearTimeout(timer.current)
        }
    }, [])

    if (!tip) return null
    const m = 8
    const { rect, pos } = tip
    let style: CSSProperties
    if (pos === "right") {
        style = { left: rect.right + m, top: rect.top + rect.height / 2, transform: "translateY(-50%)" }
    } else if (pos === "top") {
        style = { left: rect.left + rect.width / 2, top: rect.top - m, transform: "translate(-50%,-100%)" }
    } else {
        style = { left: rect.left + rect.width / 2, top: rect.bottom + m, transform: "translateX(-50%)" }
    }
    return (
        <div
            className={"tip tip-" + pos}
            style={style}
            role="tooltip"
            data-instant={tip.instant || undefined}
        >
            {tip.text}
        </div>
    )
}
