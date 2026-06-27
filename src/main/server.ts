import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http"
import { WebSocketServer, WebSocket } from "ws"
import { app } from "electron"
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname, basename } from "path"
import { networkInterfaces } from "os"
import { ptyEvents, getBuffer, writePty, resizePty } from "./pty"
import { httpSend } from "./http"
import { allConnections, runQuery, listTables } from "./db"

export interface RemoteSession {
    termId: string
    projectId: string
    projectName: string
    projectPath: string
    tabName: string
    badge: string
    isAgent: boolean
    status: "working" | "idle" | "attention"
}

export interface ServerConfig {
    port: number
    token: string
}

export interface ServerDeps {
    getSessions: () => RemoteSession[]
    requestNewSession: (projectId: string) => void
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
                    if (typeof msg.projectId === "string") deps.requestNewSession(msg.projectId)
                    break
                case "list":
                    send(ws, { t: "sessions", sessions: deps.getSessions() })
                    break
                case "http":
                    httpSend(msg.req as Parameters<typeof httpSend>[0]).then((res) =>
                        send(ws, { t: "http:res", res })
                    )
                    break
                case "db:conns":
                    send(ws, { t: "db:conns", conns: allConnections() })
                    break
                case "db:tables":
                    listTables(id)
                        .then((tables) => send(ws, { t: "db:tables", profileId: id, tables }))
                        .catch((e) =>
                            send(ws, {
                                t: "db:tables",
                                profileId: id,
                                tables: [],
                                error: String(e?.message ?? e)
                            })
                        )
                    break
                case "db:query":
                    runQuery(id, String(msg.sql)).then((res) => send(ws, { t: "db:res", res }))
                    break
                case "upload": {
                    // Save a base64 file from the phone, then type its path into the session.
                    try {
                        const sess = deps.getSessions().find((s) => s.termId === id)
                        const projectPath = sess?.projectPath || app.getPath("temp")
                        const dir = join(projectPath, ".devdeck", "uploads")
                        mkdirSync(dir, { recursive: true })
                        const safe = basename(String(msg.name || "file")).replace(/[^\w.\-]/g, "_")
                        const dest = join(dir, Date.now() + "-" + safe)
                        writeFileSync(dest, Buffer.from(String(msg.data || ""), "base64"))
                        writePty(id, dest + " ")
                        send(ws, { t: "upload:done", path: dest })
                    } catch (e) {
                        send(ws, { t: "upload:done", error: String((e as Error)?.message ?? e) })
                    }
                    break
                }
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
  .dot.shell{background:var(--moss)} .dot.agent{background:var(--clay)}
  .dot.attention{background:var(--ac);box-shadow:0 0 0 3px rgba(184,137,92,.25)}
  .dot.idle{opacity:.4} .dot.working{animation:p 1.2s infinite}
  @keyframes p{0%,100%{opacity:.4}50%{opacity:1}}
  .sess .meta{flex:1} .sess .st{font-size:11px;color:var(--mu)}
  .badge{font-size:9px;letter-spacing:1px;color:var(--clay);border:1px solid var(--bd);border-radius:5px;padding:2px 6px}
  .new{color:var(--clay);border-color:var(--clay)!important}
  #term-view{flex:1;display:none;flex-direction:column;min-height:0}
  #term{flex:1;min-height:0;background:var(--bg3);padding:6px}
  #bar{display:flex;gap:6px;padding:8px;background:var(--bg2);border-top:1px solid var(--bd)}
  #bar input{flex:1;background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px;font-size:15px}
  #bar button,.keys button{background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px 12px}
  .keys{display:flex;gap:6px;padding:0 8px 8px;background:var(--bg2);overflow-x:auto}
  .keys button{flex:none;font-size:13px;color:var(--mu)}
  .empty{color:var(--mu);text-align:center;padding:40px 20px;line-height:1.6}
  nav#nav{display:flex;gap:4px;margin-left:8px}
  nav#nav button{padding:5px 10px;font-size:13px;color:var(--mu);border-color:transparent}
  nav#nav button.active{color:var(--tx);border-color:var(--bd)}
  #http-view,#db-view{flex:1;display:none;flex-direction:column;min-height:0;overflow:auto;padding:12px;gap:8px}
  #http-view .row{display:flex;gap:6px;margin-bottom:8px}
  select,textarea,input.f{background:var(--bg3);border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:10px;font-size:15px;font-family:inherit}
  input.f,textarea{width:100%}
  textarea{min-height:70px;font-family:monospace;font-size:13px}
  .send-btn{background:var(--ac);color:#14110d;border:none;border-radius:8px;padding:10px 16px;font-weight:600}
  .lbl{font-size:11px;color:var(--mu);margin:8px 0 4px}
  .res{margin-top:10px;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:10px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;overflow:auto}
  .gridtbl{border-collapse:collapse;font-size:12px;font-family:monospace;width:max-content;min-width:100%}
  .gridtbl th,.gridtbl td{border:1px solid var(--bd);padding:4px 8px;text-align:left;white-space:nowrap}
  .gridtbl th{color:var(--ac)}
  .tbl-item{padding:8px 6px;border-bottom:1px solid var(--bd);color:var(--mu);font-size:13px}
</style>
</head>
<body>
<div id="app">
  <header>
    <button id="back" style="display:none">‹</button>
    <span class="brand" id="title">DevDeck</span>
    <nav id="nav">
      <button data-v="list" class="active">Sessions</button>
      <button data-v="http">HTTP</button>
      <button data-v="db">DB</button>
    </nav>
    <span id="status">connecting…</span>
  </header>
  <div id="list"></div>
  <div id="http-view">
    <div class="row">
      <select id="h-method"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
      <input class="f" id="h-url" placeholder="https://api.example.com" />
    </div>
    <div class="lbl">Headers (one per line, Key: Value)</div>
    <textarea id="h-headers"></textarea>
    <div class="lbl">Body</div>
    <textarea id="h-body"></textarea>
    <button class="send-btn" id="h-send">Send</button>
    <div class="res" id="h-res" style="display:none"></div>
  </div>
  <div id="db-view">
    <div class="row">
      <select id="d-conn"><option value="">Select connection…</option></select>
    </div>
    <div id="d-tables"></div>
    <div class="lbl">SQL</div>
    <textarea id="d-sql">SELECT 1;</textarea>
    <button class="send-btn" id="d-run">Run</button>
    <div class="res" id="d-res" style="display:none"></div>
  </div>
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
      <input type="file" id="file" style="display:none" />
      <button id="attach" title="Attach a screenshot or file">📎</button>
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
  var httpView=document.getElementById('http-view'), dbView=document.getElementById('db-view');
  var ws, term, attachedId = null, sessions = [];

  function showView(v){
    listEl.style.display = v==='list'?'block':'none';
    termView.style.display = v==='term'?'flex':'none';
    httpView.style.display = v==='http'?'flex':'none';
    dbView.style.display = v==='db'?'flex':'none';
    document.getElementById('nav').style.display = v==='term'?'none':'flex';
    backBtn.style.display = v==='term'?'block':'none';
    [].forEach.call(document.querySelectorAll('#nav button'),function(b){ b.classList.toggle('active', b.getAttribute('data-v')===v); });
    if(v!=='term') attachedId=null;
    if(v==='list') titleEl.textContent='DevDeck';
    if(v==='http') titleEl.textContent='HTTP';
    if(v==='db'){ titleEl.textContent='Database'; sendMsg({t:'db:conns'}); }
  }
  [].forEach.call(document.querySelectorAll('#nav button'),function(b){ b.onclick=function(){ showView(b.getAttribute('data-v')); }; });

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
      else if(m.t === 'upload:done'){ statusEl.textContent = m.error ? ('upload failed: '+m.error) : ('attached → path inserted'); setTimeout(function(){statusEl.textContent='connected';},2500); }
      else if(m.t === 'http:res'){ renderResult(document.getElementById('h-res'), m.res); }
      else if(m.t === 'db:res'){ renderResult(document.getElementById('d-res'), m.res); }
      else if(m.t === 'db:conns'){ var sel=document.getElementById('d-conn'); var cur=sel.value; sel.innerHTML='<option value="">Select connection…</option>'+m.conns.map(function(c){return '<option value="'+c.id+'">'+esc(c.name)+' ('+c.kind+')</option>';}).join(''); sel.value=cur; }
      else if(m.t === 'db:tables'){ var dt=document.getElementById('d-tables'); dt.innerHTML=(m.tables||[]).map(function(t){return '<div class="tbl-item" data-t="'+esc(t)+'">'+esc(t)+'</div>';}).join(''); [].forEach.call(dt.querySelectorAll('.tbl-item'),function(el){ el.onclick=function(){ document.getElementById('d-sql').value='SELECT * FROM '+el.getAttribute('data-t')+' LIMIT 100;'; }; }); }
    };
  }
  function sendMsg(o){ if(ws && ws.readyState===1) ws.send(JSON.stringify(o)); }

  function renderResult(el, res){
    el.style.display='block';
    if(!res){ el.textContent='(no response)'; return; }
    if(res.ok===false){ el.textContent='Error: '+(res.error||'failed'); return; }
    if(res.columns){
      var cols=res.columns, rows=res.rows||[];
      el.innerHTML='<div style="margin-bottom:6px;color:#8c9a68">'+(res.rowCount!=null?res.rowCount:rows.length)+' rows · '+res.timeMs+' ms</div><div style="overflow:auto"><table class="gridtbl"><thead><tr>'+cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+cols.map(function(c){var v=row[c];return '<td>'+esc(v==null?'NULL':(typeof v==='object'?JSON.stringify(v):String(v)))+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
    } else {
      el.textContent=(res.status?res.status+' '+(res.statusText||''):'')+' · '+res.timeMs+' ms\\n\\n'+(res.body||'');
    }
  }

  document.getElementById('h-send').onclick=function(){
    var headers={}; document.getElementById('h-headers').value.split('\\n').forEach(function(l){ var i=l.indexOf(':'); if(i>0) headers[l.slice(0,i).trim()]=l.slice(i+1).trim(); });
    var req={ method:document.getElementById('h-method').value, url:document.getElementById('h-url').value.trim(), headers:headers, body:document.getElementById('h-body').value||undefined };
    if(!req.url) return; var r=document.getElementById('h-res'); r.style.display='block'; r.textContent='Sending…'; sendMsg({t:'http',req:req});
  };
  document.getElementById('d-conn').onchange=function(){ var pid=this.value; if(pid) sendMsg({t:'db:tables',id:pid}); else document.getElementById('d-tables').innerHTML=''; };
  document.getElementById('d-run').onclick=function(){
    var pid=document.getElementById('d-conn').value, sql=document.getElementById('d-sql').value;
    if(!pid||!sql.trim()) return; var r=document.getElementById('d-res'); r.style.display='block'; r.textContent='Running…'; sendMsg({t:'db:query',id:pid,sql:sql});
  };

  function renderList(){
    var byProj={}; sessions.forEach(function(s){ (byProj[s.projectId]=byProj[s.projectId]||{name:s.projectName,items:[]}).items.push(s); });
    var html='';
    var keys=Object.keys(byProj);
    if(!keys.length){ listEl.innerHTML='<div class="empty">No sessions running.<br>Open a terminal or Claude session on your desktop.</div>'; return; }
    keys.forEach(function(pid){
      var p=byProj[pid];
      html+='<div class="proj">'+esc(p.name).toUpperCase()+'</div>';
      p.items.forEach(function(s){
        var kindClass = s.isAgent ? 'agent' : 'shell';
        var label = s.isAgent ? (s.badge||'AGENT') : 'shell';
        html+='<div class="sess" data-id="'+s.termId+'"><span class="dot '+kindClass+' '+s.status+'"></span>'+
          '<div class="meta"><div>'+esc(s.tabName)+'</div><div class="st">'+esc(label)+' · '+s.status+'</div></div>'+
          (s.isAgent?'<span class="badge">'+esc(s.badge||'')+'</span>':'')+'</div>';
      });
      html+='<div class="sess new" data-new="'+pid+'"><span class="dot agent"></span><div class="meta">+ New agent session</div></div>';
    });
    listEl.innerHTML=html;
    [].forEach.call(listEl.querySelectorAll('.sess[data-id]'),function(el){ el.onclick=function(){ openTerm(el.getAttribute('data-id')); }; });
    [].forEach.call(listEl.querySelectorAll('.sess[data-new]'),function(el){ el.onclick=function(){ sendMsg({t:'new',projectId:el.getAttribute('data-new')}); }; });
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
    showView('term');
    titleEl.textContent = s ? s.tabName : 'terminal';
    document.getElementById('term').innerHTML='';
    term = new Terminal({fontFamily:'monospace',fontSize:13,cursorBlink:true,
      theme:{background:'#141312',foreground:'#e4ddcf',cursor:'#b8895c'}});
    term.open(document.getElementById('term'));
    term.onData(function(d){ sendMsg({t:'input',id:id,data:d}); });
    attachedId=id; sendMsg({t:'attach',id:id});
    setTimeout(fit,60);
  }

  backBtn.onclick=function(){ if(attachedId) sendMsg({t:'detach',id:attachedId}); showView('list'); };
  document.getElementById('send').onclick=function(){ var i=document.getElementById('inp'); if(attachedId){ sendMsg({t:'input',id:attachedId,data:i.value+'\\r'}); i.value=''; } };
  document.getElementById('attach').onclick=function(){ if(attachedId) document.getElementById('file').click(); };
  document.getElementById('file').onchange=function(e){
    var f=e.target.files[0]; if(!f||!attachedId) return;
    var r=new FileReader();
    r.onload=function(){ var b64=String(r.result).split(',')[1]||''; sendMsg({t:'upload',id:attachedId,name:f.name,data:b64}); statusEl.textContent='uploading '+f.name+'…'; };
    r.readAsDataURL(f); e.target.value='';
  };
  document.getElementById('inp').addEventListener('keydown',function(e){ if(e.key==='Enter'){ document.getElementById('send').click(); }});
  [].forEach.call(document.querySelectorAll('.keys button'),function(b){ b.onclick=function(){ if(attachedId) sendMsg({t:'input',id:attachedId,data:b.getAttribute('data-k')}); }; });
  window.addEventListener('resize',function(){ if(attachedId) fit(); });
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
  connect();
</script>
</body>
</html>`
