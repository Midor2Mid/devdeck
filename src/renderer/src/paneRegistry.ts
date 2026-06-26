import type { Terminal } from "@xterm/xterm"
import type { SearchAddon } from "@xterm/addon-search"

// Lets non-pane UI (e.g. the find bar) reach a mounted pane's terminal/search.
// Each TerminalPane registers itself by termId on mount and removes on unmount.
export interface PaneHandle {
    term: Terminal
    search: SearchAddon
}

export const paneRegistry = new Map<string, PaneHandle>()
