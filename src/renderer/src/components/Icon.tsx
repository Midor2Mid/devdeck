import type { JSX } from "react"

/**
 * Inline line-icon set (Lucide-derived, MIT). One consistent 24-grid, 1.75
 * stroke, currentColor — replaces the Unicode glyphs that made the UI feel
 * dated. No icon font / CDN (works behind the corporate proxy, no dependency).
 */
export type IconName =
    | "terminal"
    | "folder"
    | "work"
    | "activity"
    | "list"
    | "settings"
    | "search"
    | "pencil"
    | "record"
    | "play"
    | "gitBranch"
    | "check"
    | "chevronDown"
    | "splitH"
    | "splitV"
    | "tabs"
    | "grid"
    | "canvas"
    | "layers"
    | "help"
    | "plus"
    | "user"
    | "release"
    | "flag"
    | "broadcast"

const P: Record<IconName, JSX.Element> = {
    terminal: (
        <>
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
        </>
    ),
    folder: <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />,
    work: (
        <>
            <rect x="8" y="2" width="8" height="4" rx="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <path d="M9 12h6" />
            <path d="M9 16h6" />
        </>
    ),
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    list: (
        <>
            <line x1="8" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="20" y2="12" />
            <line x1="8" y1="18" x2="20" y2="18" />
            <circle cx="4" cy="6" r="1" />
            <circle cx="4" cy="12" r="1" />
            <circle cx="4" cy="18" r="1" />
        </>
    ),
    settings: (
        <>
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="2" y1="14" x2="6" y2="14" />
            <line x1="10" y1="8" x2="14" y2="8" />
            <line x1="18" y1="16" x2="22" y2="16" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </>
    ),
    pencil: <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
    record: <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />,
    play: <polygon points="6 4 19 12 6 20 6 4" />,
    gitBranch: (
        <>
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
        </>
    ),
    check: <polyline points="20 6 9 17 4 12" />,
    chevronDown: <polyline points="6 9 12 15 18 9" />,
    splitH: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
        </>
    ),
    splitV: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="12" x2="21" y2="12" />
        </>
    ),
    tabs: (
        <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
        </>
    ),
    grid: (
        <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
    ),
    canvas: <path d="M12 3 21 12 12 21 3 12Z" />,
    layers: (
        <>
            <path d="M12 2 2 7l10 5 10-5-10-5Z" />
            <path d="m2 17 10 5 10-5" />
            <path d="m2 12 10 5 10-5" />
        </>
    ),
    help: (
        <>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </>
    ),
    plus: (
        <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </>
    ),
    user: (
        <>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </>
    ),
    release: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="m16 12-4-4-4 4" />
            <path d="M12 16V8" />
        </>
    ),
    flag: (
        <>
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
        </>
    ),
    broadcast: (
        <>
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
        </>
    )
}

export function Icon({
    name,
    size = 16,
    className,
    strokeWidth = 1.75
}: {
    name: IconName
    size?: number
    className?: string
    strokeWidth?: number
}): JSX.Element {
    return (
        <svg
            className={"ic" + (className ? " " + className : "")}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {P[name]}
        </svg>
    )
}
