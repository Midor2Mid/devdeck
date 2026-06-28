import { useEffect, useRef, useState, type CSSProperties } from "react"

/**
 * Lightweight tooltip layer. Any element with a `data-tip="…"` attribute shows
 * a styled tooltip after a short hover (hidden by default). Optional
 * `data-tip-pos="right|top|bottom"` (default bottom). Rendered fixed-position at
 * the document root so it never clips against the rail, panes, or overflow.
 */
type Pos = "right" | "top" | "bottom"
interface TipState {
    text: string
    pos: Pos
    rect: { left: number; right: number; top: number; bottom: number; width: number; height: number }
}

export function TooltipLayer(): JSX.Element | null {
    const [tip, setTip] = useState<TipState | null>(null)
    const elRef = useRef<Element | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useEffect(() => {
        const show = (el: Element): void => {
            const text = el.getAttribute("data-tip")
            if (!text) return
            const pos = (el.getAttribute("data-tip-pos") as Pos) || "bottom"
            const r = el.getBoundingClientRect()
            setTip({
                text,
                pos,
                rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
            })
        }
        const onOver = (e: MouseEvent): void => {
            const el = (e.target as Element)?.closest?.("[data-tip]")
            if (!el || el === elRef.current) return
            elRef.current = el
            clearTimeout(timer.current)
            timer.current = setTimeout(() => show(el), 420)
        }
        const onOut = (e: MouseEvent): void => {
            const el = (e.target as Element)?.closest?.("[data-tip]")
            if (!el) return
            const to = e.relatedTarget as Node | null
            if (to && el.contains(to)) return
            if (el === elRef.current) {
                elRef.current = null
                clearTimeout(timer.current)
                setTip(null)
            }
        }
        const hide = (): void => {
            clearTimeout(timer.current)
            elRef.current = null
            setTip(null)
        }
        document.addEventListener("mouseover", onOver)
        document.addEventListener("mouseout", onOut)
        window.addEventListener("scroll", hide, true)
        window.addEventListener("mousedown", hide, true)
        window.addEventListener("keydown", hide, true)
        return () => {
            document.removeEventListener("mouseover", onOver)
            document.removeEventListener("mouseout", onOut)
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
        <div className={"tip tip-" + pos} style={style} role="tooltip">
            {tip.text}
        </div>
    )
}
