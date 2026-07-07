import { describe, it, expect } from "vitest"
import { THEMES } from "../src/renderer/src/themes"

const REQUIRED_ELEV = ["--elev-1", "--elev-2", "--elev-3"]

describe("theme elevation tokens", () => {
    for (const theme of Object.values(THEMES)) {
        it(`${theme.id} defines every elevation token`, () => {
            for (const key of REQUIRED_ELEV) {
                expect(theme.vars[key], `${theme.id} missing ${key}`).toBeTruthy()
            }
        })
    }
})
