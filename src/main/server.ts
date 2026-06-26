import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http"
import { WebSocketServer, WebSocket } from "ws"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { networkInterfaces } from "os"
import { ptyEvents, getBuffer, writePty, resizePty } from "./pty"

export interface RemoteSession {
    termId: string
    projectId: string
    projectName: string
    tabName: string
    kind: "shell" | "claude"
    status: "working" | "idle" | "attention"
}

export interface ServerConfig {
    port: number
    token: string
}

export interface ServerDeps {
    getSessions: () => RemoteSession[]
    requestNewSession: (projectId: string, kind: "shell" | "claude") => void
}

interface Client extends WebSocket {
    attached?: Set<string>
}

let httpServer: Server | null = null
let wss: WebSocketServer | null = null
let clients = new Set<Client>()
let onData: ((d: { id: string; data: string }) => void) | null = null
let onExit: ((d: { id: string; exitCode: number }) => void) | null = null

function xtermAsset(file: "xterm.js" | "xterm.css"): string {
    // Resolve @xterm/xterm from node_modules at runtime (it is externalized).
    const main = require.resolve("@xterm/xterm") // .../lib/xterm.js
    const pkgDir = dirname(dirname(main))
    const path = file === "xterm.js" ? join(pkgDir, "lib", "xterm.js") : join(pkgDir, "css", "xterm.css")
    return readFileSync(path, "utf8")
}

/** LAN + Tailscale (100.64.0.0/10) IPv4 addresses for building connect URLs. */
export function localAddresses(): { tailscale: string[]; lan: string[] } {
    const tailscale: string[] = []
    const lan: string[] = []
    const ifaces = networkInterfaces()
    for (const list of Object.values(ifaces)) {
        for (const ni of list ?? []) {
            if (ni.family !== "IPv4" || ni.internal) continue
            const first = Number(ni.address.split(".")[0])
            const second = Number(ni.address.split(".")[1])
            if (first === 100 && second >= 64 && second <= 127) tailscale.push(ni.address)
            else lan.push(ni.address)
        }
    }
    return { tailscale, lan }
}

function send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

export function broadcastSessions(deps: ServerDeps): void {
    const sessions = deps.getSessions()
    for (const c of clients) send(c, { t: "sessions", sessions })
}

export function isRunning(): boolean {
    return httpServer !== null
}

export function start(config: ServerConfig, deps: ServerDeps): void {
    stop()

    httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "/", "http://localhost")
        // Static library assets are harmless; everything else requires the token.
        if (url.pathname === "/xterm.js") {
            res.writeHead(200, { "Content-Type": "text/javascript" })
            res.end(xtermAsset("xterm.js"))
            return
        }
        if (url.pathname === "/xterm.css") {
            res.writeHead(200, { "Content-Type": "text/css" })
            res.end(xtermAsset("xterm.css"))
            return
        }
        if (url.searchParams.get("token") !== config.token) {
            res.writeHead(401, { "Content-Type": "text/plain" })
            res.end("Unauthorized")
            return
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(CLIENT_HTML)
    })

    wss = new WebSocketServer({
        server: httpServer,
        path: "/ws",
        verifyClient: (info, cb) => {
            const url = new URL(info.req.url ?? "/", "http://localhost")
            cb(url.searchParams.get("token") === config.token, 1008, "Unauthorized")
        }
    })

    wss.on("connection", (ws: Client) => {
        ws.attached = new Set()
        clients.add(ws)
        send(ws, { t: "sessions", sessions: deps.getSessions() })

        ws.on("message", (raw) => {
            let msg: Record<string, unknown>
            try {
                msg = JSON.parse(raw.toString())
            } catch {
                return
            }
            const id = typeof msg.id === "string" ? msg.id : ""
            switch (msg.t) {
                case "attach":
                    ws.attached?.add(id)
                    send(ws, { t: "data", id, data: getBuffer(id) })
                    break
                case "detach":
                    ws.attached?.delete(id)
                    break
                case "input":
                    if (typeof msg.data === "string") writePty(id, msg.data)
                    break
                case "resize":
                    resizePty(id, Number(msg.cols), Number(msg.rows))
                    break
                case "new":
                    if (typeof msg.projectId === "string")
                        deps.requestNewSession(
                            msg.projectId,
                            msg.kind === "claude" ? "claude" : "shell"
                        )
                    break
                case "list":
                    send(ws, { t: "sessions", sessions: deps.getSessions() })
                    break
            }
        })
        ws.on("close", () => clients.delete(ws))
        ws.on("error", () => clients.delete(ws))
    })

    onData = ({ id, data }) => {
        for (const c of clients) if (c.attached?.has(id)) send(c, { t: "data", id, data })
    }
    onExit = ({ id }) => {
        for (const c of clients) if (c.attached?.has(id)) send(c, { t: "exit", id })
    }
    ptyEvents.on("data", onData)
    ptyEvents.on("exit", onExit)

    httpServer.on("error", (err) => console.error("[server] error:", err.message))
    httpServer.listen(config.port, "0.0.0.0")
    console.log(`[server] DevDeck remote listening on :${config.port}`)
}

export function stop(): void {
    if (onData) ptyEvents.off("data", onData)
    if (onExit) ptyEvents.off("exit", onExit)
    onData = onExit = null
    for (const c of clients) {
        try {
            c.close()
        } catch {
            /* ignore */
        }
    }
    clients = new Set()
    wss?.close()
    wss = null
    httpServer?.close()
    httpServer = null
}

// ----- self-contained mobile web client -----
const CLIENT_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#181725" />
<title>DevDeck Remote</title>
<link rel="stylesheet" href="/xterm.css" />
<style>
  :root{--bg:#1b1a18;--bg2:#211f1c;--bg3:#141312;--bd:#322e28;--tx:#e4ddcf;--mu:#8f8678;--ac:#b8895c;--moss:#8c9a68;--clay:#c4855d;}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--tx);font-family:system-ui,sans-serif;font-size:15px}
  #app{display:flex;flex-direction:column;height:100vh}
  header{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg2);border-bottom:1px solid var(--bd)}
  header .brand{font-weight:600;letter-spacing:1px;color:var(--ac)}
  header button{background:transparent;border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:6px 12px;font-size:15px}
  #status{margin-left:auto;font-size:12px;color:var(--mu)}
  #list{flex:1;overflow:auto;padding:10px}
  .proj{font-size:11px;letter-spacing:1px;color:var(--mu);margin:14px 6px 6px}
  .sess{display:flex;align-items:center;gap:10px;padding:14px;border:1px solid var(--bd);border-radius:10px;margin-bottom:8px;background:var(--bg2)}
  .dot{width:9px;height:9px;border-radius:50%;flex:none}
  .dot.shell{background:var(--moss)} .dot.claude{background:var(--clay)}
  .dot.attention{background:var(--ac);box-shadow:0 0 0 3px rgba(184,137,92,.25)}
  .dot.idle{opacity:.4} .dot.working{animation:p 1.2s infinite}
  @keyframes p{0%,100%{opacity:.4}50%{opacity:1}}
  .sess .meta{flex:1} .sess .st{font-size:11px;color:var(--mu)}
  .new{color:var(--clay);border-color:var(--clay)!important}
  #term-view{flex:1;display:none;flex-direction:column;min-height:0}
  #term{flex:1;min-height:0;background:var(--bg3);padding:6px}
  #bar{display:flex;gap:6px;padding:8px;background:var(--bg2);border-top:1px solid var(--bd)}
  #bar input{flex:1;background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px;font-size:15px}
  #bar button,.keys button{background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px 12px}
  .keys{display:flex;gap:6px;padding:0 8px 8px;background:var(--bg2);overflow-x:auto}
  .keys button{flex:none;font-size:13px;color:var(--mu)}
  .empty{color:var(--mu);text-align:center;padding:40px 20px;line-height:1.6}
</style>
</head>
<body>
<div id="app">
  <header>
    <button id="back" style="display:none">‹</button>
    <span class="brand" id="title">DevDeck</span>
    <span id="status">connecting…</span>
  </header>
  <div id="list"></div>
  <div id="term-view">
    <div id="term"></div>
    <div class="keys">
      <button data-k="\\r">⏎</button>
      <button data-k="\\u0003">⌃C</button>
      <button data-k="\\u001b">esc</button>
      <button data-k="\\t">⇥</button>
      <button data-k="\\u001b[A">↑</button>
      <button data-k="\\u001b[B">↓</button>
      <button data-k="\\u001b[D">←</button>
      <button data-k="\\u001b[C">→</button>
    </div>
    <div id="bar">
      <input id="inp" placeholder="type, then Send (adds Enter)" autocapitalize="off" autocomplete="off" autocorrect="off" />
      <button id="send">Send</button>
    </div>
  </div>
</div>
<script src="/xterm.js"></script>
<script>
  var token = new URLSearchParams(location.search).get('token') || '';
  var statusEl = document.getElementById('status');
  var listEl = document.getElementById('list');
  var termView = document.getElementById('term-view');
  var titleEl = document.getElementById('title');
  var backBtn = document.getElementById('back');
  var ws, term, attachedId = null, sessions = [];

  function connect(){
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host + '/ws?token=' + encodeURIComponent(token));
    ws.onopen = function(){ statusEl.textContent = 'connected'; };
    ws.onclose = function(){ statusEl.textContent = 'disconnected — retrying'; setTimeout(connect, 1500); };
    ws.onmessage = function(e){
      var m = JSON.parse(e.data);
      if(m.t === 'sessions'){ sessions = m.sessions; if(!attachedId) renderList(); }
      else if(m.t === 'data' && m.id === attachedId && term){ term.write(m.data); }
      else if(m.t === 'exit' && m.id === attachedId && term){ term.write('\\r\\n\\x1b[90m[process exited]\\x1b[0m\\r\\n'); }
    };
  }
  function sendMsg(o){ if(ws && ws.readyState===1) ws.send(JSON.stringify(o)); }

  function renderList(){
    termView.style.display='none'; listEl.style.display='block'; backBtn.style.display='none';
    titleEl.textContent='DevDeck'; attachedId=null;
    var byProj={}; sessions.forEach(function(s){ (byProj[s.projectId]=byProj[s.projectId]||{name:s.projectName,items:[]}).items.push(s); });
    var html='';
    var keys=Object.keys(byProj);
    if(!keys.length){ listEl.innerHTML='<div class="empty">No sessions running.<br>Open a terminal or Claude session on your desktop.</div>'; return; }
    keys.forEach(function(pid){
      var p=byProj[pid];
      html+='<div class="proj">'+esc(p.name).toUpperCase()+'</div>';
      p.items.forEach(function(s){
        html+='<div class="sess" data-id="'+s.termId+'"><span class="dot '+s.kind+' '+s.status+'"></span>'+
          '<div class="meta"><div>'+esc(s.tabName)+'</div><div class="st">'+s.kind+' · '+s.status+'</div></div></div>';
      });
      html+='<div class="sess new" data-new="'+pid+'"><span class="dot claude"></span><div class="meta">+ New Claude session</div></div>';
    });
    listEl.innerHTML=html;
    [].forEach.call(listEl.querySelectorAll('.sess[data-id]'),function(el){ el.onclick=function(){ openTerm(el.getAttribute('data-id')); }; });
    [].forEach.call(listEl.querySelectorAll('.sess[data-new]'),function(el){ el.onclick=function(){ sendMsg({t:'new',projectId:el.getAttribute('data-new'),kind:'claude'}); }; });
  }

  function fit(){
    if(!term) return;
    var probe=document.createElement('span'); probe.style.cssText='visibility:hidden;position:absolute;font-family:monospace;font-size:13px;white-space:pre';
    probe.textContent='WWWWWWWWWW'; document.body.appendChild(probe);
    var cw=probe.getBoundingClientRect().width/10; document.body.removeChild(probe);
    var box=document.getElementById('term').getBoundingClientRect();
    var cols=Math.max(20,Math.floor((box.width-12)/cw)), rows=Math.max(8,Math.floor((box.height-12)/18));
    term.resize(cols,rows); sendMsg({t:'resize',id:attachedId,cols:cols,rows:rows});
  }

  function openTerm(id){
    var s=sessions.filter(function(x){return x.termId===id;})[0];
    listEl.style.display='none'; termView.style.display='flex'; backBtn.style.display='block';
    titleEl.textContent = s ? s.tabName : 'terminal';
    document.getElementById('term').innerHTML='';
    term = new Terminal({fontFamily:'monospace',fontSize:13,cursorBlink:true,
      theme:{background:'#141312',foreground:'#e4ddcf',cursor:'#b8895c'}});
    term.open(document.getElementById('term'));
    term.onData(function(d){ sendMsg({t:'input',id:id,data:d}); });
    attachedId=id; sendMsg({t:'attach',id:id});
    setTimeout(fit,60);
  }

  backBtn.onclick=function(){ if(attachedId) sendMsg({t:'detach',id:attachedId}); renderList(); };
  document.getElementById('send').onclick=function(){ var i=document.getElementById('inp'); if(attachedId){ sendMsg({t:'input',id:attachedId,data:i.value+'\\r'}); i.value=''; } };
  document.getElementById('inp').addEventListener('keydown',function(e){ if(e.key==='Enter'){ document.getElementById('send').click(); }});
  [].forEach.call(document.querySelectorAll('.keys button'),function(b){ b.onclick=function(){ if(attachedId) sendMsg({t:'input',id:attachedId,data:b.getAttribute('data-k')}); }; });
  window.addEventListener('resize',function(){ if(attachedId) fit(); });
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
  connect();
</script>
</body>
</html>`
