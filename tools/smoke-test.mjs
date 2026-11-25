/**
 * v1.1.0 冒烟测试：验证 Cortico v6 契约、真实 2 人户型、5 扇实体门、16 个大型家具碰撞箱、A* 跨房间避障寻路与门交互。
 */

import assert from 'node:assert/strict';
import { CooRoomWorld, definition } from '../index.js';
import { findPath, ROOMS, DOORS, FURNITURE_COLLIDERS } from '../lib/floorplan.js';

const pushedEvents = [];
const world = new CooRoomWorld({ cfg: { port: 17895, timeMode: 'custom', customHour: 16.5 } });
const url = await world.start({
  log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {}, emit: () => {}, child() { return this; } },
  pushEvent: async (evt, opts) => {
    pushedEvents.push({ evt, opts });
    return { cursor: pushedEvents.length, origin: 'external', ...evt };
  },
});

try {
  assert.equal(definition.defaults().enabled, false, 'defaults().enabled 应为 false');

  const health = await (await fetch(`${url}/api/health`)).json();
  assert.equal(health.ok, true, '健康检查应返回 ok: true');

  const state = await (await fetch(`${url}/api/room-state`)).json();
  assert.equal(Object.keys(state.rooms).length, 6, '应包含 6 个功能区');
  assert.equal(Object.keys(state.doors).length, 5, '应包含 5 扇实体可开关门');
  assert.ok(state.objects.door_bathroom, '卫生间必须有独立磨砂门');
  assert.equal(state.colliders.length, FURNITURE_COLLIDERS.length, '碰撞箱数据应完整下发');

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

  console.log('ALL v1.1.0 SMOKE TESTS PASSED:', {
    version: state.version,
    rooms: Object.keys(state.rooms).length,
    doors: Object.keys(DOORS).length,
    colliders: state.colliders.length,
    objects: Object.keys(state.objects).length,
    pathToBathroom: toBath.length,
    pathToStudy: toStudy.length,
    pushedEvents: pushedEvents.length,
  });
} finally {
  await world.stop();
}
