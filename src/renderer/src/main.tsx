import ReactDOM from "react-dom/client"
import "allotment/dist/style.css"
import "@xterm/xterm/css/xterm.css"
import "./styles.css"
import { App } from "./App"

// NOTE: intentionally no React.StrictMode — its dev-only double-invoke of
// effects would create/kill each pty twice and make terminals flaky.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />)
