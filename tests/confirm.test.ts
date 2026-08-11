import { describe, it, expect } from "vitest"
import { useConfirm } from "../src/renderer/src/confirm"

describe("useConfirm", () => {
    it("resolves an answered request with the answer", async () => {
        const p = useConfirm.getState().ask({ message: "go?" })
        useConfirm.getState().answer(true)
        await expect(p).resolves.toBe(true)
    })

    it("cancels a displaced request instead of dropping it", async () => {
        // A dropped resolver leaves its awaiter suspended forever; a caller that
        // took a lock before awaiting would then never release it.
        const first = useConfirm.getState().ask({ message: "first" })
        useConfirm.getState().ask({ message: "second" })
        await expect(first).resolves.toBe(false)
    })

    it("still answers the request that displaced it", async () => {
        useConfirm.getState().ask({ message: "first" })
        const second = useConfirm.getState().ask({ message: "second" })
        useConfirm.getState().answer(true)
        await expect(second).resolves.toBe(true)
    })
})
