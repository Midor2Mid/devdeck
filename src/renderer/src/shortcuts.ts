// The one list of keyboard shortcuts. Two surfaces show it — the F1 overlay
// (ShortcutsModal) and Settings → Shortcuts — and before this module they were
// two hand-maintained arrays that had drifted apart: Settings still said "New
// Claude session" and listed ten of the twenty-five bindings, while the overlay
// still called Ctrl+Shift+J "Agents inbox" after that drawer was deleted. A
// reference that contradicts itself is worse than no reference, and README now
// points at F1 as the current one, so both must read from here.
//
// Keep in sync with the real handlers: App.tsx (global + Alt panes), the map in
// TerminalView.tsx (Terminal), EditorPanel.tsx and DbPanel.tsx (Monaco commands).

export type ShortcutGroup = { title: string; items: [keys: string, desc: string][] }

/**
 * The grouped shortcut reference.
 *
 * @param viewNames Deck view names in deck order (`DECK_VIEWS.map(v => v.name)`),
 *   passed in rather than imported so this module stays free of React and the
 *   store, and so the Ctrl+1…N row can never claim a range the deck doesn't have.
 */
export function shortcutGroups(viewNames: string[]): ShortcutGroup[] {
    const views: [string, string][] =
        viewNames.length > 0
            ? [
                  [
                      `Ctrl + 1 … ${viewNames.length}`,
                      `Switch view (${viewNames[0]} … ${viewNames[viewNames.length - 1]})`
                  ]
              ]
            : []
    return [
        {
            title: "Global",
            items: [
                ["Ctrl + K", "Switch project (then 1-9 to pick)"],
                ["Ctrl + Shift + K", "Recent project - hold and tap to walk back"],
                ["Ctrl + Shift + P", "Command palette"],
                ...views,
                ["Ctrl + Tab", "Next session (shells included)"],
                ["Ctrl + Shift + Tab", "Previous session"],
                // Not the Inbox drawer, which no longer exists: this jumps to the
                // agent that has been waiting on you longest.
                ["Ctrl + Shift + J", "Jump to the agent waiting on you longest"],
                // Lives in App.tsx, not TerminalView, so it works from any view -
                // it switches to Terminal on the way.
                ["Ctrl + Shift + I", "Prompt composer (switches to Terminal)"],
                ["Ctrl + Shift + F", "Search across projects (outside the Terminal view)"],
                ["Ctrl + Shift + R", "Review changes"],
                ["F1", "This shortcuts list"]
            ]
        },
        {
            title: "Terminal",
            items: [
                ["Ctrl + Shift + T", "New shell terminal"],
                // Whichever agent is first in Settings → Agents, which is not
                // necessarily Claude.
                ["Ctrl + Shift + Enter", "New session with your primary agent"],
                ["Ctrl + Shift + W", "Close active pane"],
                ["Ctrl + Shift + \\", "Split right"],
                ["Ctrl + Shift + -", "Split down"],
                ["Ctrl + Shift + ]", "Next tab"],
                ["Ctrl + Shift + [", "Previous tab"],
                ["Ctrl + Shift + F", "Find in terminal"],
                ["Ctrl + Shift + Z", "Zoom the focused pane, and back"],
                ["Alt + 1 … 9", "Jump to a session in this project (9 = the last)"],
                ["Alt + arrows", "Move focus to the pane in that direction"]
            ]
        },
        {
            title: "Editor",
            items: [["Ctrl + S", "Save file"]]
        },
        {
            title: "Database",
            items: [["Ctrl + Enter", "Run query"]]
        }
    ]
}
