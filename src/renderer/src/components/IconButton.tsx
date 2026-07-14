/** An icon-only button that is accessible: the visual tooltip text (data-tip)
 *  is ALSO exposed as the accessible name (aria-label). Use for all icon-only buttons. */
export function IconButton({
    tip,
    tipPos,
    className = "",
    onClick,
    disabled,
    children
}: {
    tip: string
    tipPos?: "top" | "bottom" | "right" | "left"
    className?: string
    onClick?: (e: React.MouseEvent) => void
    disabled?: boolean
    children: React.ReactNode
}): JSX.Element {
    return (
        <button
            className={className}
            aria-label={tip}
            data-tip={tip}
            data-tip-pos={tipPos}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    )
}
