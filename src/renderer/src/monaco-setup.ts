/*
 * Monaco bootstrap for an offline Electron app:
 *  - bundle the language web workers locally via Vite `?worker` (no CDN),
 *  - point @monaco-editor/react at this local monaco instance,
 *  - define the wabi-sabi "Sumi & Kinari" editor theme.
 * Importing this module once (from EditorPanel) runs all of the above.
 */
import * as monaco from "monaco-editor"
import { loader } from "@monaco-editor/react"
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

monaco.editor.defineTheme("devdeck", {
    base: "vs-dark",
    inherit: true,
    rules: [
        { token: "", foreground: "e4ddcf", background: "141312" },
        { token: "comment", foreground: "6f6857", fontStyle: "italic" },
        { token: "string", foreground: "8c9a68" },
        { token: "keyword", foreground: "b8895c" },
        { token: "number", foreground: "c4a35d" },
        { token: "type", foreground: "7fa0a0" },
        { token: "type.identifier", foreground: "7fa0a0" },
        { token: "delimiter", foreground: "8f8678" },
        { token: "operator", foreground: "b8895c" },
        { token: "variable", foreground: "e4ddcf" },
        { token: "function", foreground: "caa07a" },
        { token: "tag", foreground: "b8895c" },
        { token: "attribute.name", foreground: "c4a35d" }
    ],
    colors: {
        "editor.background": "#141312",
        "editor.foreground": "#e4ddcf",
        "editorLineNumber.foreground": "#3f3a33",
        "editorLineNumber.activeForeground": "#8f8678",
        "editorCursor.foreground": "#b8895c",
        "editor.selectionBackground": "#3a352e",
        "editor.lineHighlightBackground": "#1b1a18",
        "editorWidget.background": "#1f1d1a",
        "editorWidget.border": "#322e28",
        "editorSuggestWidget.background": "#1f1d1a",
        "editorSuggestWidget.selectedBackground": "#2a2723",
        "editorIndentGuide.background1": "#252220",
        "editorGutter.background": "#141312",
        "scrollbarSlider.background": "#2e2a2540",
        "scrollbarSlider.hoverBackground": "#3a352e80",
        "minimap.background": "#141312"
    }
})

loader.config({ monaco })

export { monaco }
