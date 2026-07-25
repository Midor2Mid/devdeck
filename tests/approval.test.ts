import { describe, it, expect } from "vitest"
import { detectApproval } from "../src/renderer/src/approval"

describe("detectApproval", () => {
    it("classifies a Claude Code permission menu (Esc = deny)", () => {
        const tail = [
            "Bash command",
            "  rm -rf build",
            "",
            "Do you want to proceed?",
            "❯ 1. Yes",
            "  2. Yes, and don't ask again for rm commands in this project",
            "  3. No, and tell Claude what to do differently (esc)"
        ].join("\n")
        const r = detectApproval(tail)
        expect(r).toEqual({
            kind: "menu",
            question: "Do you want to proceed?",
            approve: "1",
            deny: "\x1b"
        })
    })

    it("classifies a menu without an (esc) marker by selecting the No option", () => {
        const tail = ["Allow running this command?", "1. Yes", "2. No"].join("\n")
        expect(detectApproval(tail)).toEqual({
            kind: "menu",
            question: "Allow running this command?",
            approve: "1",
            deny: "2"
        })
    })

    it("classifies a simple y/n prompt", () => {
        expect(detectApproval("Overwrite existing file? (y/n)")).toEqual({
            kind: "yesno",
            question: "Overwrite existing file? (y/n)",
            approve: "y\r",
            deny: "n\r"
        })
    })

    it("ignores a numbered list in prose (no yes/no options, no question/esc)", () => {
        const tail = ["Here is the plan:", "1. Refactor the parser", "2. Add tests", "Starting now."].join(
            "\n"
        )
        expect(detectApproval(tail)).toBeNull()
    })

    it("ignores a prompt the agent has already scrolled past (not live)", () => {
        const tail = [
            "Do you want to proceed?",
            "❯ 1. Yes",
            "2. No (esc)",
            "Running command…",
            "output 1",
            "output 2",
            "output 3"
        ].join("\n")
        expect(detectApproval(tail)).toBeNull()
    })

    it("returns null for empty output", () => {
        expect(detectApproval("")).toBeNull()
        expect(detectApproval("\n\n  \n")).toBeNull()
    })
})
