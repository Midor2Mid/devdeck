/*
 * Monaco bootstrap for an offline Electron app:
 *  - bundle the language web workers locally via Vite `?worker` (no CDN),
 *  - point @monaco-editor/react at this local monaco instance,
 *  - define the wabi-sabi "Sumi & Kinari" editor theme.
 * Importing this module once (from EditorPanel) runs all of the above.
 */
// editor.api, NOT "monaco-editor": the package entry is editor.main.js, which
// imports all 83 basic languages and all 4 services - about 98MB of a 178MB
// app.asar, most of it grammars this app can never open. editor.api is the same
// editor with the same features and no languages at all; each one below is opted
// into deliberately. Keep the list in step with monacoLanguages.ts, which
// tests/monacoLanguages.test.ts enforces in both directions.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api"

// The four rich services: completions, diagnostics, formatting, each with a worker
// wired up below. typescript also serves javascript; css also serves scss and less;
// html also serves handlebars and razor.
import "monaco-editor/esm/vs/language/typescript/monaco.contribution"
import "monaco-editor/esm/vs/language/json/monaco.contribution"
import "monaco-editor/esm/vs/language/css/monaco.contribution"
import "monaco-editor/esm/vs/language/html/monaco.contribution"

// Basic languages: tokenizer and colours, no worker. cpp's contribution registers
// plain c as well, which is why there is no separate c import.
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution"
import "monaco-editor/esm/vs/basic-languages/python/python.contribution"
import "monaco-editor/esm/vs/basic-languages/go/go.contribution"
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution"
import "monaco-editor/esm/vs/basic-languages/java/java.contribution"
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution"
import "monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution"
import "monaco-editor/esm/vs/basic-languages/php/php.contribution"
import "monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution"
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution"
import "monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution"
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution"
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution"
import "monaco-editor/esm/vs/basic-languages/sql/sql.contribution"
import "monaco-editor/esm/vs/basic-languages/ini/ini.contribution"
import "monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution"

import { loader } from "@monaco-editor/react"
import { THEMES, deriveAccentVars } from "./themes"
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

const globalSelf = globalThis as typeof globalThis & { MonacoEnvironment?: monaco.Environment }

globalSelf.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
        switch (label) {
            case "json":
                return new JsonWorker()
            case "css":
            case "scss":
            case "less":
                return new CssWorker()
            case "html":
            case "handlebars":
            case "razor":
                return new HtmlWorker()
            case "typescript":
            case "javascript":
                return new TsWorker()
            default:
                return new EditorWorker()
        }
    }
}

// Define a Monaco theme per app theme, derived from its palette + xterm colors.
const hex = (c: string): string => c.replace("#", "")
for (const t of Object.values(THEMES)) {
    const v = t.vars
    const x = t.xterm
    // `--accent-soft` is derived, not declared - the palette used to carry a
    // literal that applyTheme overwrote, and reading it here painted Monaco a
    // colour the app itself never showed. Derived from the theme's OWN accent:
    // Monaco themes are defined once at import, so a user-picked accent does
    // not reach them (the keyword token has always had the same limitation).
    const accentSoft = deriveAccentVars(t.accent, v["--bg"])["--accent-soft"]
    monaco.editor.defineTheme(t.monacoId, {
        base: t.mode === "light" ? "vs" : "vs-dark",
        inherit: true,
        rules: [
            { token: "", foreground: hex(v["--text"]), background: hex(x.background) },
            { token: "comment", foreground: hex(v["--faint"]), fontStyle: "italic" },
            { token: "string", foreground: hex(x.green) },
            { token: "keyword", foreground: hex(v["--accent"]) },
            { token: "number", foreground: hex(x.yellow) },
            { token: "type", foreground: hex(x.cyan) },
            { token: "type.identifier", foreground: hex(x.cyan) },
            { token: "delimiter", foreground: hex(v["--muted"]) },
            { token: "operator", foreground: hex(v["--accent"]) },
            { token: "variable", foreground: hex(v["--text"]) },
            { token: "function", foreground: hex(accentSoft) },
            { token: "tag", foreground: hex(v["--accent"]) },
            { token: "attribute.name", foreground: hex(x.yellow) }
        ],
        colors: {
            "editor.background": x.background,
            "editor.foreground": v["--text"],
            "editorLineNumber.foreground": v["--faint"],
            "editorLineNumber.activeForeground": v["--muted"],
            "editorCursor.foreground": v["--accent"],
            "editor.selectionBackground": x.selectionBackground,
            "editor.lineHighlightBackground": v["--bg"],
            "editorWidget.background": v["--bg-2"],
            "editorWidget.border": v["--border"],
            "editorSuggestWidget.background": v["--bg-2"],
            "editorSuggestWidget.selectedBackground": v["--border-soft"],
            "editorIndentGuide.background1": v["--border-soft"],
            "editorGutter.background": x.background,
            "minimap.background": x.background
        }
    })
}

loader.config({ monaco })

export { monaco }
