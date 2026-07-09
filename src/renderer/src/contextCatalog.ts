// Curated "root memory" files that CLI coding agents load automatically from a
// project root. DevDeck surfaces which exist and creates missing ones from a
// seeded starter. Root-only by design (no nested-tree scan); this array is the
// single place to add more (e.g. ".cursorrules") later.

export interface ContextFile {
    name: string
    agent: string
    description: string
}

export interface ContextEntry extends ContextFile {
    exists: boolean
}

export const CONTEXT_FILES: ContextFile[] = [
    { name: "CLAUDE.md", agent: "Claude Code", description: "Project guidance for Claude Code" },
    { name: "AGENTS.md", agent: "Codex / general", description: "Guidance for Codex & general agents" },
    { name: "GEMINI.md", agent: "Gemini CLI", description: "Project guidance for the Gemini CLI" }
]

/**
 * The seeded starter written when creating a missing context file. `name` is
 * accepted so per-file templates can diverge later; today all files share this
 * markdown scaffold.
 */
export function template(name: string, projectName: string): string {
    const proj = projectName || "this project"
    return `# ${proj}

<!-- Guidance for AI agents working in this repo. Read before making changes. -->

## Conventions

## Architecture

## Gotchas
`
}

/**
 * Map the catalog to entries, marking each present when its exact (case-
 * sensitive) name appears in the project root's directory listing. Unknown
 * root files are ignored; always returns one entry per catalog file.
 */
export function mergeContext(rootEntryNames: string[]): ContextEntry[] {
    const present = new Set(rootEntryNames)
    return CONTEXT_FILES.map((f) => ({ ...f, exists: present.has(f.name) }))
}
