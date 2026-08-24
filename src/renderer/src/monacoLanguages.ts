/*
 * Which languages the editor understands, and which ones Monaco is actually asked
 * to load.
 *
 * Deliberately free of any `monaco-editor` import so it can be tested in a plain
 * node environment: `monaco-setup.ts` is browser-only, and the thing worth guarding
 * is the DATA - that nothing asks for a language we did not bundle.
 *
 * monaco-editor ships 83 basic languages plus 4 rich language services. Bundling all
 * of them costs about 98MB of a 178MB app.asar, most of it grammars this app can
 * never open (abap, postiats, freemarker2...). `monaco-setup.ts` imports only the
 * contributions listed here.
 */

/** File extension to Monaco language id. Anything absent opens as plaintext. */
export const LANG: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    h: "cpp",
    cpp: "cpp",
    cc: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    yml: "yaml",
    yaml: "yaml",
    xml: "xml",
    sql: "sql",
    toml: "ini",
    ini: "ini",
    dockerfile: "dockerfile"
}

export function langFor(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() ?? ""
    return LANG[ext] ?? "plaintext"
}

/**
 * Every language id the bundle can actually highlight, including the ones that
 * arrive as a side effect: the css service registers scss and less, the html
 * service registers handlebars and razor, the typescript service registers
 * javascript, and the cpp contribution registers plain c.
 *
 * Adding an entry to LANG without a matching contribution import in
 * monaco-setup.ts degrades that file type to plaintext with no error anywhere,
 * which is why tests/monacoLanguages.test.ts compares the two.
 */
export const BUNDLED_LANGUAGES: string[] = [
    // rich services (completions, diagnostics, formatting - each has a web worker)
    "typescript",
    "javascript",
    "json",
    "css",
    "scss",
    "less",
    "html",
    "handlebars",
    "razor",
    // basic languages (tokenizer and colours only)
    "markdown",
    "python",
    "go",
    "rust",
    "java",
    "c",
    "cpp",
    "csharp",
    "php",
    "ruby",
    "shell",
    "powershell",
    "yaml",
    "xml",
    "sql",
    "ini",
    "dockerfile"
]
