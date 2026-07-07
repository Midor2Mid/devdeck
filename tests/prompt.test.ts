import { describe, it, expect } from "vitest"
import { prompt, usePrompt } from "../src/renderer/src/prompt"

describe("prompt store", () => {
    it("resolves the entered string on answer, and null on cancel", async () => {
        // Submit path: answer(value) resolves the pending promise with the value.
        const p1 = prompt({ title: "New group", placeholder: "Group name" })
        expect(usePrompt.getState().current?.title).toBe("New group")
        usePrompt.getState().answer("work")
        await expect(p1).resolves.toBe("work")
        expect(usePrompt.getState().current).toBeNull()

        // Cancel path: answer(null) resolves null and clears the request.
        const p2 = prompt({ title: "New group", initialValue: "old" })
        expect(usePrompt.getState().current?.initialValue).toBe("old")
        usePrompt.getState().answer(null)
        await expect(p2).resolves.toBeNull()
        expect(usePrompt.getState().current).toBeNull()
    })
})
