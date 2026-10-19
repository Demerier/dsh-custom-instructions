/**
 * 本地契约测试：模拟 DSH 0.2.x 的 ctx.webServer.register 契约，真跑 HTTP 往返。
 *
 * 不依赖 DSH 本体。为了让 host 模块能在无 DSH 环境下加载，测试会在临时目录里
 * 生成一个最小的 @deepseek-ai/dsh-home-paths 替身包，再用 node 的 ESM loader
 * 把它映射给 import 语句。
 */
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = await mkdtemp(join(tmpdir(), 'dci-test-'))
const home = join(root, 'dsh-home')
const stubRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh-home-paths')

await mkdir(home, { recursive: true })
await mkdir(stubRoot, { recursive: true })
await writeFile(join(stubRoot, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh-home-paths',
  version: '0.2.1-rc.2',
  type: 'module',
  main: 'index.js',
  exports: { '.': './index.js' },
}))
await writeFile(join(stubRoot, 'index.js'),
  `import { join as pjoin } from 'node:path'\n` +
  `export function dshHomePath(...parts) { return pjoin(${JSON.stringify(home)}, ...parts) }\n`)

// 用自定义 resolve hook 把裸说明符映射到替身包。
const hookUrl = pathToFileURL(join(root, 'hook.mjs')).href
await writeFile(join(root, 'hook.mjs'),
  `const stub = ${JSON.stringify(pathToFileURL(join(stubRoot, 'index.js')).href)}\n` +
  `export async function resolve(specifier, context, next) {\n` +
  `  if (specifier === '@deepseek-ai/dsh-home-paths') return { url: stub, shortCircuit: true }\n` +
  `  return next(specifier, context)\n` +
  `}\n`)
const { register } = await import('node:module')
register(hookUrl)

const mod = await import('../lib/index.js')

const routes = []
const server = createServer((req, res) => {
  const route = routes.find((r) => r.kind === 'prefix' && req.url.startsWith(r.path))
  if (!route) { res.writeHead(404); res.end('not found'); return }
  route.handler(req, res)
})

const ctx = {
  effect: (fn) => fn(),
  webServer: { register: (route) => { routes.push(route); return () => {} } },
}

mod.apply(ctx)
if (routes.length !== 1) throw new Error(`期望注册 1 条路由，实际 ${routes.length}`)
if (routes[0].kind !== 'prefix' || routes[0].path !== '/custom-instructions') {
  throw new Error(`路由契约不符: ${routes[0].kind} ${routes[0].path}`)
}
console.log('✓ 路由注册成功: prefix /custom-instructions')

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/custom-instructions`

let res = await fetch(base)
let json = await res.json()
if (res.status !== 200 || json.ok !== true || json.content !== '') {
  throw new Error(`首次读取失败: ${res.status} ${JSON.stringify(json)}`)
}
console.log('✓ 文件不存在时 GET 返回空内容')

const body = '# 全局指令\n- 始终使用中文回答。\n- 推理每步不超过 10 个词。\n'
res = await fetch(base, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ content: body }),
})
json = await res.json()
if (res.status !== 200 || json.ok !== true) throw new Error(`保存失败: ${res.status} ${JSON.stringify(json)}`)
const onDisk = await readFile(join(home, 'AGENTS.md'), 'utf8')
if (onDisk !== body) throw new Error('落盘内容与提交内容不一致')
console.log('✓ 保存成功并落盘（父目录自动创建），UTF-8 字节数:', json.bytes)

res = await fetch(base)
json = await res.json()
if (json.content !== body) throw new Error('回读内容不一致')
console.log('✓ 回读内容一致')

res = await fetch(base, { method: 'DELETE' })
if (res.status !== 405) throw new Error(`期望 405，实际 ${res.status}`)
console.log('✓ DELETE 返回 405')

// 同源校验：伪造跨站 Origin 的写请求必须被拒（CSRF 防护）
res = await fetch(base, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
  body: JSON.stringify({ content: '被篡改的内容' }),
})
if (res.status !== 403) throw new Error(`跨站写请求期望 403，实际 ${res.status}`)
const afterAttack = await readFile(join(home, 'AGENTS.md'), 'utf8')
if (afterAttack !== body) throw new Error('跨站请求竟然改动了文件')
console.log('✓ 跨站 POST 被 403 拒绝且文件未被改动')

res = await fetch(base, { headers: { origin: 'https://evil.example' } })
if (res.status !== 403) throw new Error(`跨站读请求期望 403，实际 ${res.status}`)
console.log('✓ 跨站 GET 被 403 拒绝')

// 同源请求必须放行
const sameOrigin = new URL(base).origin
res = await fetch(base, { headers: { origin: sameOrigin } })
if (res.status !== 200) throw new Error(`同源 GET 期望 200，实际 ${res.status}`)
console.log('✓ 同源请求正常放行')

res = await fetch(base, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ content: 'x'.repeat(1024 * 1024 + 10) }),
})
if (res.status !== 413) throw new Error(`期望 413，实际 ${res.status}`)
console.log('✓ 超限内容返回 413')

res = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' })
json = await res.json()
if (res.status !== 200 || json.ok !== true) throw new Error(`坏 JSON 处理异常: ${res.status}`)
if ((await readFile(join(home, 'AGENTS.md'), 'utf8')) !== '') throw new Error('坏 JSON 应写入空内容')
console.log('✓ 坏 JSON 按空内容处理')

server.close()
await rm(root, { recursive: true, force: true })
console.log('\n全部 10 项契约测试通过')
