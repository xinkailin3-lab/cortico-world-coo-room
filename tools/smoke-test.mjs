/**
 * v1.1.2 冒烟测试：验证 Cortico v6 契约、真实 2 人户型、5 扇实体门、16 个大型家具碰撞箱、
 * A* 跨房间避障寻路、深深动作库（Unicode 中文路径反代 + MIME 补齐）、路径遍历/畸形编码防护与 WebSocket Origin 校验。
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { CooRoomWorld, definition } from '../index.js';
import { findPath, ROOMS, DOORS, FURNITURE_COLLIDERS } from '../lib/floorplan.js';

function rawHttpGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function testWsUpgrade(port, originHeader) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      const key = crypto.randomBytes(16).toString('base64');
      const lines = [
        'GET /ws HTTP/1.1',
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
      ];
      if (originHeader !== null) lines.push(`Origin: ${originHeader}`);
      lines.push('', '');
      sock.write(lines.join('\r\n'));
    });
    let data = '';
    sock.setTimeout(3000, () => {
      sock.destroy();
      reject(new Error('WS upgrade timeout'));
    });
    sock.on('data', (chunk) => {
      data += chunk.toString('utf8');
      const headEnd = data.indexOf('\r\n\r\n');
      if (headEnd >= 0) {
        const statusLine = data.slice(0, data.indexOf('\r\n'));
        sock.destroy();
        resolve(statusLine);
      }
    });
    sock.on('end', () => {
      if (data) {
        const firstLine = data.split('\r\n')[0];
        resolve(firstLine);
      }
    });
    sock.on('error', reject);
  });
}

// 启动模拟 Coopanion desktop-pet 服务端（还原深深动作库中文路径与 application/octet-stream 响应头）
const mockIndexJs = 'export default [{ id: "eat-dumplings", clip: "额外动作拓展/eat/eat-dumplings", word: "eat-dumplings", anim: true }];\n';
const mockWebpBytes = Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00', 'latin1');

const mockPetServer = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
  if (reqUrl.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ skin: { figure: 'shenshen-actions', scheme: 'teal' }, theme: 'light' }));
    return;
  }
  if (reqUrl.pathname === '/api/figures') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify([
        {
          id: 'shenshen-actions',
          base: '/packs/shenshen-actions/',
          entry: 'figure.js',
          export: 'createActionBody',
          name: { zh: '深深 · 动作库' },
          vocab: [{ id: 'look-around' }],
        },
      ])
    );
    return;
  }
  if (reqUrl.pathname.startsWith('/packs/shenshen-actions/')) {
    const rel = decodeURIComponent(reqUrl.pathname.slice('/packs/shenshen-actions/'.length));
    if (rel === '额外动作拓展/index.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(mockIndexJs);
      return;
    }
    if (rel === '额外动作拓展/eat/eat-dumplings/anim.webp') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(mockWebpBytes);
      return;
    }
  }
  res.writeHead(404);
  res.end('Not Found');
});

await new Promise((resolve) => mockPetServer.listen(0, '127.0.0.1', resolve));
const mockPetPort = mockPetServer.address().port;

const pushedEvents = [];
const world = new CooRoomWorld({
  cfg: { port: 17895, petPort: mockPetPort, timeMode: 'custom', customHour: 16.5 },
});
const url = await world.start({
  log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {}, emit: () => {}, child() { return this; } },
  pushEvent: async (evt, opts) => {
    pushedEvents.push({ evt, opts });
    return { cursor: pushedEvents.length, origin: 'external', ...evt };
  },
});

try {
  assert.equal(definition.id, 'coo-room');
  assert.equal(definition.defaults().enabled, false, 'defaults().enabled 应为 false');

  const port = Number(new URL(url).port);

  const health = await (await fetch(`${url}/api/health`)).json();
  assert.equal(health.ok, true, '健康检查应返回 ok: true');

  const state = await (await fetch(`${url}/api/room-state`)).json();
  assert.equal(state.worldId, 'coo-room');
  assert.equal(state.version, '1.1.2', '快照版本应为 1.1.2');
  assert.equal(Object.keys(state.rooms).length, 6, '应包含 6 个功能区');
  assert.equal(Object.keys(state.doors).length, 5, '应包含 5 扇实体可开关门');
  assert.ok(state.objects.door_bathroom, '卫生间必须有独立磨砂门');
  assert.equal(state.colliders.length, FURNITURE_COLLIDERS.length, '碰撞箱数据应完整下发');

  // 1. 验证桌宠桥接器能同步模拟的深深形象包
  const syncedSnap = await world.petBridge.syncOnce();
  assert.equal(syncedSnap.connected, true);
  assert.equal(syncedSnap.figureId, 'shenshen-actions');
  assert.equal(syncedSnap.figureName, '深深 · 动作库');

  // 2. 验证反代中文路径不会触发 ERR_UNESCAPED_CHARACTERS 崩溃，且无 ACAO 头
  const shenshenIndexRes = await fetch(
    `${url}/pet-proxy/packs/shenshen-actions/%E9%A2%9D%E5%A4%96%E5%8A%A8%E4%BD%9C%E6%8B%93%E5%B1%95/index.js`
  );
  assert.equal(shenshenIndexRes.status, 200, '反代深深中文路径 index.js 应返回 200');
  assert.equal(shenshenIndexRes.headers.get('access-control-allow-origin'), null, '不得返回 ACAO 头');
  assert.equal(await shenshenIndexRes.text(), mockIndexJs);

  // 3. 验证反代 anim.webp 正确补齐 image/webp MIME，且无 ACAO 头
  const shenshenWebpRes = await fetch(
    `${url}/pet-proxy/packs/shenshen-actions/%E9%A2%9D%E5%A4%96%E5%8A%A8%E4%BD%9C%E6%8B%93%E5%B1%95/eat/eat-dumplings/anim.webp`
  );
  assert.equal(shenshenWebpRes.status, 200, '反代深深 anim.webp 应返回 200');
  assert.equal(shenshenWebpRes.headers.get('content-type'), 'image/webp', 'anim.webp 应修正为 image/webp');
  assert.equal(shenshenWebpRes.headers.get('access-control-allow-origin'), null, '不得返回 ACAO 头');
  assert.deepEqual(Buffer.from(await shenshenWebpRes.arrayBuffer()), mockWebpBytes);

  // 4. 验证不存在的中文路径资源返回 404 而不是崩服
  const missingRes = await fetch(
    `${url}/pet-proxy/packs/shenshen-actions/%E9%A2%9D%E5%A4%96%E5%8A%A8%E4%BD%9C%E6%8B%93%E5%B1%95/missing.js`
  );
  assert.equal(missingRes.status, 404);

  // 5. 验证畸形百分比编码返回 400 而不抛出 URIError 崩服
  const badUriStatic = await rawHttpGet(port, '/%E0%A4%A');
  assert.equal(badUriStatic.status, 400, '静态畸形编码应返回 400');
  const badUriProxy = await rawHttpGet(port, '/pet-proxy/%E0%A4%A');
  assert.equal(badUriProxy.status, 400, '反代畸形编码应返回 400');

  // 6. 验证路径穿越与白名单外路径均被 403 拦截
  const travEncoded = await rawHttpGet(port, '/pet-proxy/packs/shenshen-actions/%2e%2e/%2e%2e/api/skin');
  assert.equal(travEncoded.status, 403, '编码目录穿越应返回 403');
  const travRaw = await rawHttpGet(port, '/pet-proxy/packs/shenshen-actions/../../api/skin');
  assert.equal(travRaw.status, 403, '原始目录穿越应返回 403');
  const nonAllowlist = await rawHttpGet(port, '/pet-proxy/api/skin');
  assert.equal(nonAllowlist.status, 403, '非白名单反代路径应返回 403');

  // 7. 验证 WebSocket Origin 严格校验（v1.1.1 安全策略）
  const wsNoOrigin = await testWsUpgrade(port, null);
  assert.ok(wsNoOrigin.includes('403'), `缺失 Origin 应返回 403，实际: ${wsNoOrigin}`);
  const wsEvilOrigin = await testWsUpgrade(port, 'https://evil.example');
  assert.ok(wsEvilOrigin.includes('403'), `跨站 Origin 应返回 403，实际: ${wsEvilOrigin}`);
  const wsValidOrigin = await testWsUpgrade(port, `http://127.0.0.1:${port}`);
  assert.ok(wsValidOrigin.includes('101'), `同源 Origin 应返回 101，实际: ${wsValidOrigin}`);

  // 8. 异常请求过后服务依然健康
  const healthAfter = await (await fetch(`${url}/api/health`)).json();
  assert.equal(healthAfter.ok, true);

  // 验证 Cortico v6 工具契约（tags 与 handler）
  const tools = world.tools();
  assert.equal(tools.length, 5, '应注册 5 个工具');
  for (const tool of tools) {
    assert.ok(Array.isArray(tool.tags) && tool.tags.length > 0, `工具 ${tool.name} 缺少非空 tags`);
    assert.equal(typeof tool.handler, 'function', `工具 ${tool.name} 缺少 handler`);
  }

  // 验证 WebUI 契约（panels、invoke、promptDocs、links）
  const ui = world.webUi('zh');
  assert.equal(typeof ui.invoke, 'function', 'webUi() 应提供顶层 invoke');
  const invokedStatus = await ui.invoke('room', 'status', []);
  assert.equal(invokedStatus.url, url, 'webUi().invoke("room", "status") 应返回实时服务 URL');
  assert.ok(ui.promptDocs?.some((d) => d.role === 'envPrompt'), 'webUi().promptDocs 应注册 envPrompt');
  assert.ok(ui.links?.some((l) => l.href === url), 'webUi().links 应包含实时打开链接');

  // 测试从客厅跨过过道、穿过卫生间门进入卫生间，以及从客厅进入书房的 A* 路径
  const toBath = findPath(ROOMS.living_room.center, ROOMS.bathroom.center);
  const toStudy = findPath(ROOMS.living_room.center, ROOMS.study.center);
  assert.ok(toBath.length > 4, '客厅到卫生间应有完整过程路径点');
  assert.ok(toStudy.length > 4, '客厅到书房应有完整过程路径点');

  // 测试开关卫生间门工具（通过 Cortico v6 handler）
  const interactTool = tools.find((t) => t.name === 'room_interact');
  const openRes = await interactTool.handler({ objectId: 'door_bathroom', action: 'open' }, { role: 'main' });
  assert.ok(openRes.includes('卫生间磨砂门'), `开门回执异常: ${openRes}`);
  assert.equal(world.objects.door_bathroom.state, 'open');

  // 测试事件推送走 host.pushEvent
  world.handleClientMessage({ type: 'user_chat', text: '测试打招呼' });
  assert.equal(pushedEvents.length, 1, 'user_chat 应触发 host.pushEvent');
  assert.equal(pushedEvents[0].evt.type, 'coo-room.chat');
  assert.equal(pushedEvents[0].opts.trigger, 'preempt');

  console.log('ALL v1.1.2 SMOKE TESTS PASSED:', {
    worldId: state.worldId,
    version: state.version,
    rooms: Object.keys(state.rooms).length,
    doors: Object.keys(DOORS).length,
    colliders: state.colliders.length,
    objects: Object.keys(state.objects).length,
    pathToBathroom: toBath.length,
    pathToStudy: toStudy.length,
    pushedEvents: pushedEvents.length,
    shenshenProxyOk: true,
    wsOriginProtected: true,
  });
} finally {
  await world.stop();
  await new Promise((resolve) => mockPetServer.close(resolve));
}
