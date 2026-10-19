/**
 * dsh-custom-instructions — host face.
 *
 * 通用设置“自定义指令”面板的服务端：
 *   GET  /custom-instructions         读取 $DSH_HOME/AGENTS.md 内容
 *   POST /custom-instructions         以 JSON body { content } 整体写回
 *
 * 文件路径来自 @deepseek-ai/dsh-home-paths，与 dsh-agent-instructions 读取的
 * 用户全局文件一致：面板改的就是所有会话（不限模型）都会注入的全局指令。
 *
 * 兼容性：DSH 0.1.x 与 0.2.x。0.2.x 下 ctx.webServer 仍是同一服务，
 * register({ kind, path, handler }) 签名未变（见 @deepseek-ai/dsh-host-webserver）。
 *
 * 设计取舍：
 *   - 路径是常量，不接受任何客户端输入参与拼接，不存在目录穿越面。
 *   - body 设上限，避免超大粘贴把宿主内存打满。
 *   - 首次使用时 AGENTS.md 与其父目录都可能不存在，写入前先建目录。
 */

import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const name = 'dsh-custom-instructions'

/** 服务要求：webServer 提供读写端点。 */
export const inject = ['webServer']

/** 用户全局指令文件：$DSH_HOME/AGENTS.md（与 dsh-agent-instructions 一致）。 */
const FILE_PATH = dshHomePath('AGENTS.md')

/** 单次保存的正文上限：1 MiB。全局指令是给人写规则的，超过这个量级必然是误操作。 */
const MAX_BODY_BYTES = 1024 * 1024

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

async function readInstructions() {
  try {
    const info = await stat(FILE_PATH)
    if (!info.isFile()) return ''
    return await readFile(FILE_PATH, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return ''
    throw error
  }
}

/**
 * 读取请求体，超过上限立即中断。
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<{ text: string, tooLarge: boolean }>}
 */
async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) return { text: '', tooLarge: true }
    chunks.push(chunk)
  }
  return { text: Buffer.concat(chunks).toString('utf8'), tooLarge: false }
}

function sendJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

/**
 * 同源校验，用于拦住跨站写请求（CSRF）。
 *
 * 背景：这个端点是裸 HTTP 路由，不在 DSH 0.2.x 的 `/api` 浏览器信任围栏之后。
 * 浏览器发起跨站 `POST` 时一定带 `Origin`，而 `fetch` 的同源请求也带 —— 所以
 * 「有 Origin 且 host 与本站不一致」就是明确的跨站信号，直接拒绝。
 * 无 `Origin` 的请求（curl、本机脚本、SSR）放行：它们不构成浏览器侧的 CSRF。
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean} true 表示允许
 */
function isSameOrigin(req) {
  const origin = req.headers.origin
  if (origin === undefined || origin === '') return true
  const host = req.headers.host
  if (host === undefined || host === '') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/custom-instructions',
    handler: async (req, res) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        // 读操作同样校验：跨站读取全局指令内容属于信息泄露。
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' })
          return
        }
        try {
          const content = await readInstructions()
          sendJson(res, 200, { ok: true, path: FILE_PATH, content })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
        return
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' })
          return
        }
        try {
          const { text, tooLarge } = await readBody(req)
          if (tooLarge) {
            sendJson(res, 413, { ok: false, error: `内容超过 ${MAX_BODY_BYTES} 字节上限` })
            return
          }
          let content = ''
          try {
            const parsed = JSON.parse(text)
            content = parsed && typeof parsed.content === 'string' ? parsed.content : ''
          } catch { /* 空或非 JSON body 按空内容处理 */ }

          // 首次使用（AGENTS.md 与其父目录都可能不存在）时先建好父目录。
          await mkdir(dirname(FILE_PATH), { recursive: true })
          await writeFile(FILE_PATH, content, 'utf8')
          sendJson(res, 200, { ok: true, path: FILE_PATH, bytes: Buffer.byteLength(content, 'utf8') })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
        return
      }

      res.writeHead(405, { allow: 'GET, HEAD, POST, PUT' })
      res.end()
    },
  }), 'dsh-custom-instructions: web routes')
}
