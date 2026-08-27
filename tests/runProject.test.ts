import { describe, it, expect, afterEach } from "vitest"
import { detectRun, pickStartupProject } from "../src/renderer/src/runProject"

/** Stub the slice of window.api that detectRun reads. */
function stubFs(files: Record<string, string>): void {
    const names = Object.keys(files).map((name) => ({ name }))
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            fs: {
                readDir: async () => names,
                // `fs.read` returns content plus the mtime it was read at, so the
                // editor can refuse a write onto a file that moved. The stub has to
                // match, or it is testing a boundary the app no longer has.
                read: async (p: string) => {
                    const hit = Object.entries(files).find(([n]) => p.endsWith(n))
                    if (!hit) throw new Error("ENOENT")
                    return { content: hit[1], mtimeMs: 1 }
                },
                allFiles: async () => Object.keys(files)
            }
        }
    }
}

describe("pickStartupProject", () => {
    it("returns undefined when there are no projects", () => {
        expect(pickStartupProject([])).toBeUndefined()
    })

    it("picks the web/api project over libraries and tests (fabrikam layout)", () => {
        const csprojs = [
            "Contoso.OrdersApi.Service/Contoso.OrdersApi.Service.csproj",
            "Fabrikam.WebApi/Fabrikam.WebApi.csproj",
            "Fabrikam.WebApi.Core/Fabrikam.WebApi.Core.csproj",
            "Fabrikam.WebApi.Infrastructure/Fabrikam.WebApi.Infrastructure.csproj",
            "PortalCrmService/Contoso.CRM.Services.Test/Contoso.CRM.Services.Test.csproj"
        ]
        expect(pickStartupProject(csprojs)).toBe("Fabrikam.WebApi/Fabrikam.WebApi.csproj")
    })

    it("prefers a shallower project on ties", () => {
        expect(
            pickStartupProject(["src/deep/nested/App.Web.csproj", "App.Web.csproj"])
        ).toBe("App.Web.csproj")
    })

    it("falls back to a lone project even if it looks like a library/test", () => {
        expect(pickStartupProject(["tests/Only.Tests.csproj"])).toBe("tests/Only.Tests.csproj")
        expect(pickStartupProject(["Some.Core.csproj"])).toBe("Some.Core.csproj")
    })

    it("skips test projects when a non-test one exists", () => {
        expect(
            pickStartupProject(["Foo.Tests/Foo.Tests.csproj", "Foo.Api/Foo.Api.csproj"])
        ).toBe("Foo.Api/Foo.Api.csproj")
    })
})

describe("detectRun", () => {
    afterEach(() => {
        delete (globalThis as unknown as { window?: unknown }).window
    })

    it("prefers the dev script when package.json parses", async () => {
        stubFs({ "package.json": JSON.stringify({ scripts: { dev: "vite" } }) })
        expect(await detectRun("/p")).toEqual({ command: "npm run dev", type: "node" })
    })

    it("falls back to npm start when there is no dev script", async () => {
        stubFs({ "package.json": JSON.stringify({ scripts: { build: "tsc" } }) })
        expect(await detectRun("/p")).toEqual({ command: "npm start", type: "node" })
    })

    // A trailing comma mid-edit used to disable Run entirely and report "no
    // runnable project type detected", which pointed at the wrong problem.
    it("still offers npm start when package.json won't parse", async () => {
        stubFs({ "package.json": '{ "scripts": { "dev": "vite" }, }' })
        expect(await detectRun("/p")).toEqual({ command: "npm start", type: "node" })
    })

    it("prefers a real .NET signal over an unparseable package.json", async () => {
        stubFs({ "package.json": "{ broken", "App.sln": "" })
        expect((await detectRun("/p"))?.type).toBe("dotnet")
    })

    it("returns null when nothing is runnable", async () => {
        stubFs({ "README.md": "# hi" })
        expect(await detectRun("/p")).toBeNull()
    })
})
