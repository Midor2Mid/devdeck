import type { DevDeckApi } from "../../preload/index"

declare global {
    interface Window {
        api: DevDeckApi
    }
    // Electron <webview> tag (enabled via webviewTag in the main window).
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        interface IntrinsicElements {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            webview: any
        }
    }
}

export {}
