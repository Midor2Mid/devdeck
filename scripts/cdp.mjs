/**
 * Minimal Chrome DevTools Protocol client - no dependencies.
 *
 * Exists because devdeck has no puppeteer/ws and the chords under test only
 * exist as real keyboard events in a real renderer. Enough of RFC 6455 to talk
 * to one CDP target: client-masked text frames out, unfragmented frames in
 * (CDP replies are small JSON, and this only ever has one request in flight).
 */
import { createConnection } from "node:net"
import { createHash, randomBytes } from "node:crypto"
import { get } from "node:http"

const httpJson = (url) =>
    new Promise((resolve, reject) => {
        get(url, (res) => {
            let body = ""
            res.on("data", (c) => (body += c))
            res.on("end", () => {
                try {
                    resolve(JSON.parse(body))
                } catch (e) {
                    reject(new Error(`bad JSON from ${url}: ${body.slice(0, 200)}`))
                }
            })
        }).on("error", reject)
    })

/** Every debuggable target, retrying while the app boots. */
export async function targets(port = 9222, tries = 40) {
    for (let i = 0; i < tries; i++) {
        try {
            return await httpJson(`http://127.0.0.1:${port}/json/list`)
        } catch {
            await new Promise((r) => setTimeout(r, 500))
        }
    }
    throw new Error(`no CDP endpoint on ${port} after ${tries} tries`)
}

function frame(payload) {
    const data = Buffer.from(payload, "utf8")
    const mask = randomBytes(4)
    const masked = Buffer.alloc(data.length)
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4]
    let header
    if (data.length < 126) {
        header = Buffer.from([0x81, 0x80 | data.length])
    } else if (data.length < 65536) {
        header = Buffer.alloc(4)
        header[0] = 0x81
        header[1] = 0xfe
        header.writeUInt16BE(data.length, 2)
    } else {
        header = Buffer.alloc(10)
        header[0] = 0x81
        header[1] = 0xff
        header.writeBigUInt64BE(BigInt(data.length), 2)
    }
    return Buffer.concat([header, mask, masked])
}

/** Pull whole text frames out of a growing buffer. Server frames are unmasked. */
function drain(buf, onText) {
    let off = 0
    for (;;) {
        if (buf.length - off < 2) break
        const b1 = buf[off + 1]
        let len = b1 & 0x7f
        let headLen = 2
        if (len === 126) {
            if (buf.length - off < 4) break
            len = buf.readUInt16BE(off + 2)
            headLen = 4
        } else if (len === 127) {
            if (buf.length - off < 10) break
            len = Number(buf.readBigUInt64BE(off + 2))
            headLen = 10
        }
        if (buf.length - off < headLen + len) break
        const opcode = buf[off] & 0x0f
        const payload = buf.subarray(off + headLen, off + headLen + len)
        if (opcode === 0x1) onText(payload.toString("utf8"))
        off += headLen + len
    }
    return buf.subarray(off)
}

export async function connect(wsUrl) {
    const u = new URL(wsUrl)
    const key = randomBytes(16).toString("base64")
    const sock = createConnection({ host: u.hostname, port: Number(u.port) })
    await new Promise((res, rej) => {
        sock.once("connect", res)
        sock.once("error", rej)
    })
    sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
            `Host: ${u.host}\r\n` +
            "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
            `Sec-WebSocket-Key: ${key}\r\n` +
            "Sec-WebSocket-Version: 13\r\n\r\n"
    )

    const expect = createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64")

    let buf = Buffer.alloc(0)
    let upgraded = false
    const pending = new Map()
    const events = []
    let id = 0

    await new Promise((res, rej) => {
        const onData = (chunk) => {
            buf = Buffer.concat([buf, chunk])
            if (!upgraded) {
                const end = buf.indexOf("\r\n\r\n")
                if (end < 0) return
                const head = buf.subarray(0, end).toString()
                if (!head.includes(expect)) {
                    rej(new Error("websocket handshake rejected:\n" + head))
                    return
                }
                buf = buf.subarray(end + 4)
                upgraded = true
                res()
            }
            buf = drain(buf, (text) => {
                const msg = JSON.parse(text)
                if (msg.id && pending.has(msg.id)) {
                    const { resolve, reject } = pending.get(msg.id)
                    pending.delete(msg.id)
                    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
                } else if (msg.method) {
                    events.push(msg)
                }
            })
        }
        sock.on("data", onData)
        sock.once("error", rej)
    })

    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const mid = ++id
            pending.set(mid, { resolve, reject })
            sock.write(frame(JSON.stringify({ id: mid, method, params })))
            setTimeout(() => {
                if (pending.delete(mid)) reject(new Error(`${method} timed out`))
            }, 20000)
        })

    return {
        send,
        events,
        close: () => sock.destroy(),
        /**
         * Evaluate in the page and return the value (JSON round-tripped).
         * `Runtime.evaluate` by design: this is a verification harness driving a
         * renderer it launched itself, and every expression is written here in
         * this repo. No caller input reaches it.
         */
        async eval(expr) {
            const r = await send("Runtime.evaluate", {
                expression: `JSON.stringify((() => { ${expr} })())`,
                awaitPromise: true,
                returnByValue: true
            })
            if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + expr)
            return r.result.value === undefined ? undefined : JSON.parse(r.result.value)
        },
        /** A real keystroke: rawKeyDown + keyUp with the modifier bitmask CDP wants. */
        async key(code, key, { alt = false, ctrl = false, shift = false, text } = {}) {
            const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0)
            const base = { modifiers, code, key, windowsVirtualKeyCode: vk(code, key) }
            await send("Input.dispatchKeyEvent", {
                type: text ? "keyDown" : "rawKeyDown",
                ...base,
                ...(text ? { text } : {})
            })
            await send("Input.dispatchKeyEvent", { type: "keyUp", ...base })
        }
    }
}

/** Windows virtual key codes for the keys this harness sends. */
function vk(code, key) {
    if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5)
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3)
    return { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Tab: 9, Escape: 27 }[code] ?? 0
}
