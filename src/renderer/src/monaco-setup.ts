/*
 * Monaco bootstrap for an offline Electron app:
 *  - bundle the language web workers locally via Vite `?worker` (no CDN),
 *  - point @monaco-editor/react at this local monaco instance,
 *  - define the wabi-sabi "Sumi & Kinari" editor theme.
 * Importing this module once (from EditorPanel) runs all of the above.
 */
import * as monaco from "monaco-editor"
import { loader } from "@monaco-editor/react"
import { THEMES } from "./themes"
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
            { token: "function", foreground: hex(v["--accent-soft"]) },
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
