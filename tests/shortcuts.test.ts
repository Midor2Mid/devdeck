import { describe, it, expect } from "vitest"
import { shortcutGroups } from "../src/renderer/src/shortcuts"

/**
 * The shortcut reference is shown in two places (the F1 overlay and Settings ->
 * Shortcuts), and before shortcuts.ts they were two hand-kept arrays that had
 * drifted: Settings listed 10 of the ~25 bindings and still called an agent
 * session a "Claude session", while the overlay still labelled Ctrl+Shift+J
 * "Agents inbox" after that drawer was deleted (App.tsx binds it to
 * jumpToPending). These lock the contract that made both possible.
 */

const DECK = ["Mission", "Tasks", "Terminal", "API", "Database", "Browser", "Network", "Editor"]

const find = (title: string, keys: string): string | undefined =>
    shortcutGroups(DECK)
        .find((g) => g.title === title)
        ?.items.find(([k]) => k === keys)?.[1]

describe("shortcutGroups", () => {
    it("never lists one chord twice inside a group", () => {
        // Across groups is legitimate - Ctrl+Shift+F is find-in-terminal inside
        // the Terminal view and global search everywhere else - but twice in one
        // group means one of the two rows is wrong.
        for (const g of shortcutGroups(DECK)) {
            const keys = g.items.map(([k]) => k)
            expect(new Set(keys).size, `duplicate chord in ${g.title}`).toBe(keys.length)
        }
    })

    it("has a description for every chord", () => {
        for (const g of shortcutGroups(DECK)) {
            for (const [keys, desc] of g.items) {
                expect(keys.trim()).not.toBe("")
                expect(desc.trim(), keys).not.toBe("")
            }
        }
    })

    it("derives the view-switch row from the deck it is given", () => {
        const row = find("Global", `Ctrl + 1 … ${DECK.length}`)
        expect(row).toBe("Switch view (Mission … Editor)")

        const three = shortcutGroups(["Mission", "Tasks", "Terminal"])
        expect(three[0].items.some(([k]) => k === "Ctrl + 1 … 3")).toBe(true)
        expect(three[0].items.some(([k]) => k === "Ctrl + 1 … 8")).toBe(false)
    })

    it("claims no view range when there are no views", () => {
        // Rather than "Ctrl + 1 … 0", which is a keystroke that does not exist.
        const groups = shortcutGroups([])
        expect(groups[0].items.some(([k]) => k.startsWith("Ctrl + 1"))).toBe(false)
    })

    it("does not describe Ctrl+Shift+J as an inbox", () => {
        // The drawer is gone; the chord jumps to the longest-waiting agent.
        expect(find("Global", "Ctrl + Shift + J")?.toLowerCase()).not.toContain("inbox")
    })

    it("does not promise a specific agent for Ctrl+Shift+Enter", () => {
        // It starts agents[0] from Settings -> Agents, which may be Codex or Gemini.
        expect(find("Terminal", "Ctrl + Shift + Enter")?.toLowerCase()).not.toContain("claude")
    })
})
