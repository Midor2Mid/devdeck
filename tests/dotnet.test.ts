import { describe, it, expect } from "vitest"
import { parseDotnet } from "../src/main/dotnet"

describe("parseDotnet", () => {
    it("parses an error with line+col and strips the trailing [project]", () => {
        const { diagnostics } = parseDotnet(
            "  Foo.cs(12,20): error CS0103: The name 'x' does not exist [C:\\proj\\A.csproj]"
        )
        expect(diagnostics).toEqual([
            {
                file: "Foo.cs",
                line: 12,
                col: 20,
                severity: "error",
                code: "CS0103",
                message: "The name 'x' does not exist"
            }
        ])
    })

    it("parses a warning without a column", () => {
        const { diagnostics } = parseDotnet("Bar.cs(5): warning CS0168: unused variable")
        expect(diagnostics[0]).toEqual({
            file: "Bar.cs",
            line: 5,
            col: 0,
            severity: "warning",
            code: "CS0168",
            message: "unused variable"
        })
    })

    it("dedupes diagnostics MSBuild repeats per target", () => {
        const line = "Foo.cs(1,1): error CS1: boom [A.csproj]"
        const { diagnostics } = parseDotnet(line + "\n" + line + "\n" + line)
        expect(diagnostics).toHaveLength(1)
    })

    it("captures the build summary", () => {
        expect(parseDotnet("stuff\nBuild FAILED.\n    1 Error(s)").summary).toBe("Build FAILED.")
        expect(parseDotnet("Build succeeded.").summary).toBe("Build succeeded.")
    })

    it("captures the test summary", () => {
        const s = parseDotnet("Passed!  - Failed:     0, Passed:     5, Total:     5").summary
        expect(s.startsWith("Passed!")).toBe(true)
    })

    it("returns empty for output with no diagnostics", () => {
        expect(parseDotnet("Restoring...\nnothing here").diagnostics).toEqual([])
    })
})
