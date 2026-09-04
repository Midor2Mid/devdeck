import { describe, it, expect } from "vitest"
import type { ProjectStore } from "../src/preload/index"

/**
 * `projects.json` present-but-unreadable used to be invisible.
 *
 * main latches `unreadable` and then refuses to save over a store it could not
 * read, so every mutator is a silent no-op for the session — and the list comes
 * back empty, which renders as a fresh install. The reason no renderer code
 * read the flag is that `ProjectStore` in the preload did not declare it: the
 * value arrived over IPC and the type said it did not exist. These pin both
 * halves — the field, and the three-way distinction it exists to preserve.
 */

/** What the renderer should conclude from a store reply. */
type Verdict = "fresh-install" | "unreadable" | "has-projects"

const verdictFor = (s: ProjectStore): Verdict => {
    if (s.unreadable) return "unreadable"
    return s.projects.length === 0 ? "fresh-install" : "has-projects"
}

describe("an unreadable projects.json", () => {
    it("is declared on the type the renderer actually receives", () => {
        // A compile-time guarantee as much as a runtime one: if `unreadable`
        // leaves ProjectStore again, this file stops typechecking.
        const s: ProjectStore = { projects: [], activeId: null, unreadable: true }
        expect(s.unreadable).toBe(true)
    })

    it("is not the same thing as a fresh install", () => {
        // The whole defect: both arrive as zero projects.
        expect(verdictFor({ projects: [], activeId: null, unreadable: true })).toBe("unreadable")
        expect(verdictFor({ projects: [], activeId: null })).toBe("fresh-install")
    })

    it("wins over the project list, because the list is not trustworthy", () => {
        // If main could not read the file, whatever it returned is not evidence
        // about what the user has.
        expect(
            verdictFor({
                projects: [{ id: "a", name: "a", path: "C:/a", addedAt: 0 }],
                activeId: "a",
                unreadable: true
            } as ProjectStore)
        ).toBe("unreadable")
    })

    it("treats a readable empty store as a fresh install, which is safe to write", () => {
        expect(verdictFor({ projects: [], activeId: null, unreadable: false })).toBe("fresh-install")
    })
})
