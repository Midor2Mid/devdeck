import { describe, it, expect } from "vitest"
import { pickStartupProject } from "../src/renderer/src/runProject"

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
