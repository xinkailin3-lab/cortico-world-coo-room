/**
 * cortico-world-coo-room (v1.1.0) — Coopanion / Cortico 真实户型二次元 3D 两人套间 World 扩展
 *
 * v1.1.0 升级要点：
 * - 动静分离真实 2 人户型：中央客餐厅与过道枢纽，5 个独立房间各配可开关实体门（含卫生间磨砂门）；
 * - 真实移动过程：桌宠与玩家均按 A* 路径逐步平滑移动，不再瞬移，桌宠遇到关着的门会停顿开门再通过；
 * - 完整碰撞箱 + 防卡门安全区：前端实时同步壁障与门状态，确保绝不卡在门里。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOMS,
  DOORS,
  INITIAL_OBJECTS,
  WALL_SEGMENTS,
  FURNITURE_COLLIDERS,
  detectRoom,
  findPath,
} from './lib/floorplan.js';
import { CoopanionPetBridge } from './lib/pet-bridge.js';
import { RoomHttpWsServer } from './lib/ws-server.js';

const WORLD_ID = 'coo-room';
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(ROOT_DIR, 'web');
const ENV_PROMPT_FILE = path.join(ROOT_DIR, 'ENV_PROMPT.md');

function defaults() {
  return {
    enabled: false,
    port: 7890,
    petPort: 7797,
    timeMode: 'system',
    customHour: 16.5,
    timeSpeed: 0,
    wakeOnTouch: true,
    wakeOnEnv: true,
  };
}

const TOOL_SPECS = [
  {
    name: 'room_move_to',
    description: '在 3D 两人套间里走动或跑到指定房间或家具旁（自动绕开家具与墙体，遇关着的门会自动停顿推开）。',
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', description: '目标房间 ID：living_room / bedroom / study / kitchen / bathroom / balcony' },
        target: { type: 'string', description: '可选：家具或门 ID，如 sofa / bed / pc_desk / coffee_maker / door_bathroom' },
        run: { type: 'boolean', description: '是否小跑' },
      },
      required: ['room'],
    },
    tags: ['act'],
    summary: { zh: '在 3D 公寓跨房间走动（含自动开门）', en: 'Move across rooms with door opening' },
  },
  {
    name: 'room_interact',
    description: '操作 3D 公寓中的房门、灯光、电器、窗帘或家具。',
    parameters: {
      type: 'object',
      properties: {
        objectId: { type: 'string', description: '对象 ID（含 5 扇房门 door_* 与各类家具）' },
        action: { type: 'string', description: 'toggle / on / off / open / closed / use' },
      },
      required: ['objectId'],
    },
    tags: ['act'],
    summary: { zh: '开关房门与家具互动', en: 'Open/close doors and interact with furniture' },
  },
  {
    name: 'room_act',
    description: '在 3D 公寓中做出指定表情或动作。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '动作或表情词，如 wave / happy / shy / sit / sleep / jump / think' },
        durationSec: { type: 'number', description: '持续秒数' },
      },
      required: ['action'],
    },
    tags: ['act'],
    summary: { zh: '做表情与动作', en: 'Perform expression or motion' },
  },
  {
    name: 'room_say',
    description: '在 3D 公寓的桌宠头顶冒出对话气泡说话。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要说的话' },
        mood: { type: 'string', description: '情绪：normal / happy / shy / sleepy / excited / curious' },
      },
      required: ['text'],
    },
    tags: ['speak'],
    summary: { zh: '在 3D 气泡里说话', en: 'Speak in 3D bubble' },
  },
  {
    name: 'room_status',
    description: '查看 3D 公寓当前状态、时间、双方位置、房门开关状态与全部家具状态。',
    parameters: { type: 'object', properties: {} },
    tags: ['read', 'snapshot'],
    summary: { zh: '查询房间与房门状态', en: 'Inspect room and door status' },
  },
];

const EVENT_DESCRIBES = [
  {
    type: 'coo-room.touch',
    description: { zh: '伙伴在 3D 公寓中戳了你、摸了你的头或靠近互动。', en: 'The user poked, patted, or interacted closely with you in the 3D apartment.' },
    trigger: 'debounce',
  },
  {
    type: 'coo-room.env',
    description: { zh: '伙伴操作了房间中的房门、灯光、窗帘、电视、咖啡机、电脑等家具设备。', en: 'The user operated doors, lights, curtains, appliances, or furniture in the 3D apartment.' },
    trigger: 'debounce',
  },
  {
    type: 'coo-room.presence',
    description: { zh: '伙伴切换了视角、进入了某个房间或调整了房间时间。', en: 'The user switched view mode, entered another room, or adjusted room time.' },
    trigger: 'piggyback',
  },
  {
    type: 'coo-room.chat',
    description: { zh: '伙伴在 3D 公寓网页的聊天框里直接发来了消息。', en: 'The user sent a chat message from the 3D apartment web page.' },
    trigger: 'preempt',
  },
];

function formatHour(hourFloat) {
  const normalized = ((hourFloat % 24) + 24) % 24;
  const hh = Math.floor(normalized);
  const mm = Math.floor((normalized - hh) * 60);
  const pad = (n) => String(n).padStart(2, '0');
  let period = '深夜';
  if (normalized >= 5 && normalized < 9) period = '清晨';
  else if (normalized >= 9 && normalized < 12) period = '上午';
  else if (normalized >= 12 && normalized < 14) period = '中午';
  else if (normalized >= 14 && normalized < 17.5) period = '午后';
  else if (normalized >= 17.5 && normalized < 20) period = '黄昏';
  else if (normalized >= 20 && normalized < 23) period = '夜晚';
  return `${pad(hh)}:${pad(mm)}（${period}）`;
}

export class CooRoomWorld {
  constructor({ ctx = {}, cfg = null } = {}) {
    this.id = WORLD_ID;
    this.ctx = ctx;
    this.cfg = { ...defaults(), ...(cfg || {}) };
    this.host = null;

    this.objects = structuredClone(INITIAL_OBJECTS);
    this.pet = {
      x: -2.8,
      z: -1.6,
      room: 'living_room',
      facing: 1,
      action: 'idle',
      moving: false,
      path: [],
      bubble: null,
    };
    this.user = {
      viewMode: 'god',
      x: -1.2,
      z: -0.2,
      room: 'living_room',
      online: false,
    };
    this.time = {
      mode: this.cfg.timeMode || 'system',
      customHour: Number(this.cfg.customHour) || 16.5,
      speed: Number(this.cfg.timeSpeed) || 0,
      updatedAt: Date.now(),
    };

    this.touchCounter = 0;
    this.touchTimer = null;
    this.lastEnvEmitAt = 0;

    this.petBridge = new CoopanionPetBridge({
      preferredPort: Number(this.cfg.petPort) || 7797,
      onChange: (figureSnap) => {
        this.server?.broadcast({ type: 'figure_sync', figure: figureSnap });
      },
    });

    this.server = new RoomHttpWsServer({
      webDir: WEB_DIR,
      petBridge: this.petBridge,
      getSnapshot: () => this.getSnapshot(),
      onClientMessage: (msg) => this.handleClientMessage(msg),
    });
  }

  getCurrentHour() {
    if (this.time.mode === 'system') {
      const now = new Date();
      return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    }
    const elapsedHours = ((Date.now() - this.time.updatedAt) / 3600000) * (this.time.speed || 0);
    return (((this.time.customHour + elapsedHours) % 24) + 24) % 24;
  }

  getSnapshot() {
    const hour = this.getCurrentHour();
    return {
      worldId: this.id,
      version: '1.1.1',
      url: this.server.url,
      rooms: ROOMS,
      doors: DOORS,
      walls: WALL_SEGMENTS,
      colliders: FURNITURE_COLLIDERS,
      objects: this.objects,
      pet: this.pet,
      user: { ...this.user, online: this.server.clients.size > 0 },
      time: {
        mode: this.time.mode,
        hour: Number(hour.toFixed(3)),
        label: formatHour(hour),
        speed: this.time.speed,
      },
      figure: this.petBridge.snapshot,
    };
  }

  async start(host) {
    this.host = host || null;
    const url = await this.server.start(Number(this.cfg.port) || 7890);
    this.petBridge.start(3000);
    this.log('info', `[coo-room] 二次元 3D 公寓 v1.1.1 已启动：${url}`);
    return url;
  }

  async stop() {
    if (this.touchTimer) clearTimeout(this.touchTimer);
    this.touchTimer = null;
    this.petBridge.stop();
    await this.server.stop();
    this.host = null;
  }

  log(level, msg, data) {
    try {
      const logger = this.host?.log;
      if (logger && typeof logger[level] === 'function') {
        if (data !== undefined) logger[level](msg, data);
        else logger[level](msg);
      } else if (typeof logger === 'function') {
        logger(level, msg);
      } else {
        console.log(msg);
      }
    } catch {
      console.log(msg);
    }
  }

  emitEvent(type, text, delivery = 'debounce') {
    if (!this.host) return;
    const prefix = `[${formatHour(this.getCurrentHour())}]`;
    const fullText = `${prefix} ${text}`;
    if (typeof this.host.pushEvent === 'function') {
      const trigger = ['preempt', 'interrupt', 'flush', 'debounce', 'piggyback'].includes(delivery)
        ? delivery
        : 'debounce';
      Promise.resolve(
        this.host.pushEvent(
          {
            type,
            ts: new Date().toISOString(),
            source: this.id,
            text: fullText,
          },
          { trigger }
        )
      ).catch((err) => {
        this.log('warn', `[coo-room] 事件推送失败 (${type}): ${err?.message || err}`);
      });
      return;
    }
    if (typeof this.host.emit === 'function') {
      try {
        this.host.emit({
          type,
          source: this.id,
          text: fullText,
          delivery,
        });
      } catch {
        try {
          this.host.emit(type, fullText, { delivery });
        } catch {}
      }
    }
  }

  handleClientMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'pet_touch': {
        const kind = msg.kind || 'poke';
        this.touchCounter += 1;
        this.pet.action = kind === 'pet' ? 'happy' : 'shy';
        this.server.broadcast({
          type: 'pet_act',
          action: this.pet.action,
          durationSec: 3.5,
          source: 'user',
        });

        if (this.touchTimer) clearTimeout(this.touchTimer);
        this.touchTimer = setTimeout(() => {
          const count = this.touchCounter;
          this.touchCounter = 0;
          const roomName = ROOMS[this.pet.room]?.name || this.pet.room;
          const desc =
            kind === 'pet'
              ? `伙伴在${roomName}温柔地摸了摸你的头（${count}次）`
              : `伙伴在${roomName}戳了你 ${count} 下`;
          if (this.cfg.wakeOnTouch !== false) {
            this.emitEvent('coo-room.touch', desc, 'debounce');
          }
        }, 1200);
        break;
      }

      case 'interact_object': {
        const actor = msg.actor === 'pet' ? 'pet' : 'user';
        const result = this.interactObject(msg.objectId, msg.action || 'toggle', actor, false);
        if (result.ok && actor === 'user' && this.cfg.wakeOnEnv !== false) {
          const now = Date.now();
          if (now - this.lastEnvEmitAt > 1200) {
            this.lastEnvEmitAt = now;
            this.emitEvent('coo-room.env', `伙伴在${result.roomName}${result.description}`, 'debounce');
          }
        }
        break;
      }

      case 'user_move': {
        const x = Number(msg.x);
        const z = Number(msg.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const prevRoom = this.user.room;
        const nextRoom = detectRoom(x, z);
        this.user.x = Number(x.toFixed(2));
        this.user.z = Number(z.toFixed(2));
        this.user.room = nextRoom;
        if (msg.viewMode) this.user.viewMode = msg.viewMode;
        if (prevRoom !== nextRoom) {
          const roomName = ROOMS[nextRoom]?.name || nextRoom;
          this.emitEvent('coo-room.presence', `伙伴走进了${roomName}`, 'piggyback');
        }
        break;
      }

      case 'user_request_path': {
        // 玩家在室内视角点击地板时，后端计算真实 A* 避障路径，按过程走过去而不瞬移
        const goalX = Number(msg.x);
        const goalZ = Number(msg.z);
        if (!Number.isFinite(goalX) || !Number.isFinite(goalZ)) return;
        const waypoints = findPath({ x: this.user.x, z: this.user.z }, { x: goalX, z: goalZ });
        this.server.broadcast({ type: 'user_path', waypoints });
        break;
      }

      case 'view_mode': {
        const nextMode = msg.viewMode === 'indoor' ? 'indoor' : 'god';
        if (this.user.viewMode !== nextMode) {
          this.user.viewMode = nextMode;
          const roomName = ROOMS[this.user.room]?.name || '客厅餐厅与过道';
          const text =
            nextMode === 'indoor'
              ? `伙伴切换到了室内第一人称视角，正站在${roomName}`
              : '伙伴切换回了展览户型上帝视角，正在俯瞰整个家';
          this.emitEvent('coo-room.presence', text, 'piggyback');
        }
        break;
      }

      case 'set_time': {
        if (msg.mode === 'system') {
          this.time.mode = 'system';
          this.time.speed = 0;
        } else {
          this.time.mode = 'custom';
          this.time.customHour = ((Number(msg.hour) || 12) % 24 + 24) % 24;
          this.time.speed = Number(msg.speed) || 0;
        }
        this.time.updatedAt = Date.now();
        const hour = this.getCurrentHour();
        this.server.broadcast({
          type: 'time_update',
          time: { mode: this.time.mode, hour, label: formatHour(hour), speed: this.time.speed },
        });
        break;
      }

      case 'pet_position_sync': {
        const x = Number(msg.x);
        const z = Number(msg.z);
        if (Number.isFinite(x) && Number.isFinite(z)) {
          this.pet.x = Number(x.toFixed(2));
          this.pet.z = Number(z.toFixed(2));
          this.pet.room = detectRoom(this.pet.x, this.pet.z);
          this.pet.moving = Boolean(msg.moving);
        }
        break;
      }

      case 'user_call_pet': {
        const room = msg.room || this.user.room || 'living_room';
        const target = msg.target || null;
        this.movePetTo({ room, target, run: Boolean(msg.run) });
        break;
      }

      case 'user_chat': {
        const text = String(msg.text || '').trim().slice(0, 500);
        if (!text) return;
        const roomName = ROOMS[this.user.room]?.name || '房间';
        this.emitEvent('coo-room.chat', `[3D公寓·${roomName}] 伙伴说：${text}`, 'preempt');
        break;
      }

      default:
        break;
    }
  }

  movePetTo({ room, target = null, run = false }) {
    let destRoom = ROOMS[room] ? room : null;
    let goal = null;
    let label = '';

    if (target && this.objects[target]) {
      const obj = this.objects[target];
      destRoom = obj.room;
      goal = obj.standPos || { x: obj.x, z: obj.z };
      label = `${ROOMS[destRoom].name}的${obj.name}旁`;
    } else if (destRoom) {
      goal = ROOMS[destRoom].center;
      label = ROOMS[destRoom].name;
    } else {
      return { ok: false, error: `未知房间：${room}` };
    }

    const waypoints = findPath({ x: this.pet.x, z: this.pet.z }, goal);
    this.pet.path = waypoints;
    this.pet.moving = true;

    // 有前端在线时由前端按真实步速与开门过程实时上报坐标；无前端在线（如纯测试/后台）时直接落位
    if (this.server.clients.size === 0) {
      this.pet.x = goal.x;
      this.pet.z = goal.z;
      this.pet.room = destRoom;
      this.pet.moving = false;
    }

    this.server.broadcast({
      type: 'pet_move',
      waypoints,
      run: Boolean(run),
      targetRoom: destRoom,
      targetObject: target,
    });

    return { ok: true, room: destRoom, label, waypointsCount: waypoints.length };
  }

  interactObject(objectId, action = 'toggle', actor = 'pet', autoWalk = true) {
    const obj = this.objects[objectId];
    if (!obj) return { ok: false, error: `找不到家具/门：${objectId}` };

    const states = obj.states || ['off', 'on'];
    let nextState = obj.state;
    if (action === 'toggle' || action === 'use') {
      const idx = states.indexOf(obj.state);
      nextState = states[(idx + 1) % states.length];
    } else if (states.includes(action)) {
      nextState = action;
    } else {
      nextState = states[states.length - 1];
    }

    obj.state = nextState;
    const roomName = ROOMS[obj.room]?.name || obj.room;
    const description = obj.verb?.[nextState] || `操作了${obj.name}（当前状态：${nextState}）`;

    if (actor === 'pet' && autoWalk) {
      this.movePetTo({ room: obj.room, target: obj.id, run: false });
    }

    this.server.broadcast({
      type: 'object_update',
      object: obj,
      actor,
      description,
    });

    return { ok: true, object: obj, roomName, description };
  }

  envPromptFile() {
    return ENV_PROMPT_FILE;
  }

  envPromptVars() {
    const hour = this.getCurrentHour();
    const petRoom = ROOMS[this.pet.room]?.name || this.pet.room;
    const userRoom = ROOMS[this.user.room]?.name || this.user.room;
    const objLines = Object.values(this.objects)
      .map((o) => `- ${o.id}（${ROOMS[o.room].name}·${o.name}）：${o.state}`)
      .join('\n');

    return {
      'room.time': `${formatHour(hour)}（${this.time.mode === 'system' ? '同步系统时间' : '自定义时间'}）`,
      'room.pet': `位于【${petRoom}】（坐标 x=${this.pet.x}, z=${this.pet.z}），动作：${this.pet.action}，当前形象：${this.petBridge.snapshot.figureName}`,
      'room.user':
        this.server.clients.size > 0
          ? `在线，当前为【${this.user.viewMode === 'indoor' ? '室内第一人称视角' : '展览户型上帝视角'}】，位置在【${userRoom}】`
          : '3D 网页暂未打开',
      'room.objects': objLines,
    };
  }

  async executeTool(name, args) {
    switch (name) {
      case 'room_move_to': {
        const res = this.movePetTo({ room: args?.room, target: args?.target, run: args?.run });
        return res.ok ? `已开始沿路径前往${res.label}。` : `移动失败：${res.error}`;
      }
      case 'room_interact': {
        const res = this.interactObject(args?.objectId, args?.action || 'toggle', 'pet', true);
        return res.ok ? `你在${res.roomName}${res.description}。` : `操作失败：${res.error}`;
      }
      case 'room_act': {
        const action = String(args?.action || 'happy');
        const durationSec = Number(args?.durationSec) || 4;
        this.pet.action = action;
        this.server.broadcast({ type: 'pet_act', action, durationSec, source: 'bot' });
        return `已做出动作：${action}。`;
      }
      case 'room_say': {
        const text = String(args?.text || '').trim();
        const mood = String(args?.mood || 'normal');
        if (!text) return '内容为空。';
        this.pet.bubble = { text, mood, at: Date.now() };
        this.server.broadcast({ type: 'pet_say', text, mood });
        return `已在 3D 房间气泡里说出：「${text}」`;
      }
      case 'room_status': {
        const vars = this.envPromptVars();
        return `时间：${vars['room.time']}\n你：${vars['room.pet']}\n伙伴：${vars['room.user']}\n房门与家具状态：\n${vars['room.objects']}`;
      }
      default:
        return { text: `未知工具：${name}`, failed: true };
    }
  }

  tools() {
    return TOOL_SPECS.map(({ summary: _summary, ...decl }) => ({
      ...decl,
      handler: async (args) => this.executeTool(decl.name, args ?? {}),
    }));
  }

  webUi(language = 'zh') {
    const isEn = String(language).startsWith('en');
    const url = this.server.url;
    const figureSnap = this.petBridge.snapshot;
    return {
      label: isEn ? 'Anime 3D Apartment' : '二次元3D公寓',
      lamps: [
        {
          label: isEn ? '3D Room Server' : '3D 公寓服务',
          state: url ? 'online' : 'offline',
          hint: url ? url : isEn ? 'Not started' : '未启动',
        },
        {
          label: isEn ? '2D Figure Sync' : '2D 形象同步',
          state: figureSnap?.connected ? 'online' : url ? 'loading' : 'offline',
          hint: figureSnap?.connected
            ? `${figureSnap.figureName} (:${figureSnap.petPort})`
            : isEn
              ? 'Waiting for desktop-pet server'
              : '等待连接本机桌宠服务',
        },
      ],
      badges: url
        ? [
            { label: isEn ? 'Room' : '房间', value: ROOMS[this.pet.room]?.name || this.pet.room, tone: 'on' },
            { label: isEn ? 'Figure' : '形象', value: figureSnap?.figureName || 'Coo', tone: figureSnap?.connected ? 'on' : 'plain' },
          ]
        : [],
      links: url ? [{ label: isEn ? 'Open 3D Apartment' : '打开 3D 公寓', href: url }] : [],
      panels: [
        {
          id: 'room',
          title: isEn ? '3D Apartment' : '二次元3D公寓',
          description: isEn
            ? 'Inspect live 3D apartment status and open the local web scene.'
            : '查看 3D 两人套间实时状态并打开本地交互网页。',
        },
      ],
      invoke: async (panel, method) => {
        if (panel !== 'room') throw new Error(`未知面板：${panel}`);
        if (method === 'status') return this.getSnapshot();
        if (method === 'resyncFigure') return await this.petBridge.syncOnce();
        throw new Error(`未知面板方法：${method}`);
      },
      promptDocs: [
        {
          key: 'worlds.coo-room.envPrompt',
          title: isEn ? 'Anime 3D Apartment · Environment Prompt' : '二次元3D公寓 · 环境提示词',
          description: isEn
            ? 'Injects current room time, positions, door/furniture states, and natural interaction guidelines.'
            : '向模型提供 3D 公寓时间、双方位置、房门与家具状态及自然活动指引。',
          role: 'envPrompt',
          path: ENV_PROMPT_FILE,
          vars: [
            { name: 'room.time', description: isEn ? 'Current 3D apartment time and period' : '当前 3D 房间时间与时段' },
            { name: 'room.pet', description: isEn ? 'Companion room, coordinates, action, and figure' : '桌宠当前位置、坐标、动作与形象' },
            { name: 'room.user', description: isEn ? 'User web connection, camera mode, and room' : '伙伴在线状态、视角模式与所在房间' },
            { name: 'room.objects', description: isEn ? 'Current state list of all 5 doors and 19 furniture items' : '5 扇房门与 19 件家具的实时状态列表', multiline: true },
          ],
        },
      ],
    };
  }
}

export const definition = {
  id: WORLD_ID,
  label: '二次元3D公寓',
  defaults,
  describe: {
    tools: TOOL_SPECS.map(({ name, description, parameters, tags, summary }) => ({
      name,
      description,
      parameters,
      tags,
      summary,
    })),
    events: EVENT_DESCRIBES,
  },
  create: (ctx) => new CooRoomWorld({ ctx, cfg: ctx?.cfg ?? defaults() }),
};

export default definition;
