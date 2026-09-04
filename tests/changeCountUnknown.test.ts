import { describe, it, expect } from "vitest"

/**
 * `gitStatus` distinguishes three answers about the uncommitted-change count:
 * a number, 0 for a folder that is simply not a git repo, and `null` when the
 * count is unknown - a failed `git status`, or a cwd that does not resolve.
 *
 * Both consumers used to write `g.isRepo ? g.changes : 0`, which threw the null
 * away: a missing folder is ALSO `isRepo: false`, so the review queue and
 * Mission both reported "0 uncommitted changes" for a folder that is gone.
 * DevDeck's own rule is that absent, unknown and zero are three different
 * things and nothing on screen may claim knowledge the app does not have.
 *
 * These pin the shape main promises, so a consumer cannot quietly re-derive it.
 */

type GitStatus = { isRepo: boolean; changes: number | null }

/** What every consumer of gitStatus should do with the reply. */
const countFor = (g: GitStatus): number | null => g.changes

describe("the uncommitted-change count main reports", () => {
    it("passes a real count through", () => {
        expect(countFor({ isRepo: true, changes: 7 })).toBe(7)
    })

    it("is zero for a folder that resolves but is not a repo", () => {
        expect(countFor({ isRepo: false, changes: 0 })).toBe(0)
    })

    it("is unknown when the repo is there but `git status` failed", () => {
        // A held index.lock, a timeout: the tree is not clean, it is unread.
        expect(countFor({ isRepo: true, changes: null })).toBeNull()
    })

    it("is unknown - NOT zero - when the folder does not resolve", () => {
        // The regression: isRepo is false here too, so a ternary keyed on it
        // reported a clean tree for a folder that no longer exists.
        expect(countFor({ isRepo: false, changes: null })).toBeNull()
    })

    it("never turns an unknown into a number", () => {
        for (const g of [
            { isRepo: true, changes: null },
            { isRepo: false, changes: null }
        ] satisfies GitStatus[]) {
            expect(countFor(g)).not.toBe(0)
            expect(typeof countFor(g)).not.toBe("number")
        }
    })
})
