import type { DevDeckApi } from "../../preload/index"

declare global {
    interface Window {
        api: DevDeckApi
    }
}

export {}
