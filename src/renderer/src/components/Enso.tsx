import type { JSX } from "react"

/**
 * The DevDeck brand mark: a single-stroke ensō (zen circle), quietly open and
 * round-capped so it reads as a calm brush-ring, not a loading spinner. Uses
 * currentColor, so the caller controls the hue (clay accent for the brand).
 */
export function Enso({
    size = 22,
    strokeWidth = 2,
    className
}: {
    size?: number
    strokeWidth?: number
    className?: string
}): JSX.Element {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray="48 60"
                transform="rotate(120 12 12)"
            />
        </svg>
    )
}
