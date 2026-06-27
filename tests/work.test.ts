import { describe, it, expect } from "vitest"
import { normalizeJira, normalizeAzure, htmlToText, adfToText } from "../src/main/work"

describe("htmlToText", () => {
    it("converts breaks and lists to text", () => {
        expect(htmlToText("<p>Hello<br>world</p><ul><li>a</li><li>b</li></ul>")).toBe(
            "Hello\nworld\n• a\n• b"
        )
    })
    it("decodes entities", () => {
        expect(htmlToText("a &amp; b &lt;c&gt;")).toBe("a & b <c>")
    })
})

describe("adfToText", () => {
    it("flattens an ADF document to text", () => {
        const adf = {
            type: "doc",
            content: [
                { type: "paragraph", content: [{ type: "text", text: "Repro steps:" }] },
                { type: "paragraph", content: [{ type: "text", text: "Click login" }] }
            ]
        }
        expect(adfToText(adf).trim()).toBe("Repro steps:\nClick login")
    })
})

describe("normalizeJira", () => {
    it("maps fields and builds the browse URL", () => {
        const issue = {
            key: "PROJ-12",
            fields: {
                summary: "Fix login",
                status: { name: "In Progress" },
                issuetype: { name: "Bug" },
                description: "Plain text desc"
            }
        }
        const wi = normalizeJira(issue, "https://co.atlassian.net")
        expect(wi).toMatchObject({
            provider: "jira",
            key: "PROJ-12",
            title: "Fix login",
            type: "Bug",
            status: "In Progress",
            url: "https://co.atlassian.net/browse/PROJ-12",
            description: "Plain text desc"
        })
    })
    it("handles missing fields", () => {
        const wi = normalizeJira({ key: "X-1", fields: {} }, "https://h")
        expect(wi.title).toBe("(no summary)")
        expect(wi.type).toBe("Issue")
    })
})

describe("normalizeAzure", () => {
    it("maps System.* fields and builds the edit URL", () => {
        const item = {
            id: 4821,
            fields: {
                "System.Title": "Add export",
                "System.State": "Active",
                "System.WorkItemType": "User Story",
                "System.Description": "<p>Do the thing</p>"
            }
        }
        const wi = normalizeAzure(item, "https://dev.azure.com/org", "My Project")
        expect(wi).toMatchObject({
            provider: "azure",
            key: "4821",
            title: "Add export",
            type: "User Story",
            status: "Active",
            description: "Do the thing"
        })
        expect(wi.url).toBe("https://dev.azure.com/org/My%20Project/_workitems/edit/4821")
    })
})
