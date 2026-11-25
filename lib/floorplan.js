/**
 * 真实 2 人完整多房间套间（v1.1.0 动静分离真实户型）：
 * - 中央客厅+餐厅+过道（living_room）作为枢纽，所有 5 个独立功能区均从客厅/过道经由实体门进出，绝无穿房间尴尬动线；
 * - 5 扇实体可开关门（主卧木门、书房木门、卫生间磨砂门、厨房玻璃推拉门、阳台双扇推拉门）；
 * - 完整的墙体线段 + 大型家具 AABB 碰撞箱，供 A* 寻路与室内第一人称防卡门碰撞解算共用。
 */

export const ROOMS = {
  living_room: {
    id: 'living_room',
    name: '客厅餐厅与过道',
    enName: 'Living & Hallway',
    bounds: { x0: -6.0, x1: 1.0, z0: -4.5, z1: 1.4 },
    center: { x: -2.4, z: -1.4 },
    floorColor: '#f4e3cb',
    accentColor: '#ff8ab4',
    description: '中央客餐厅与内过道枢纽，连着南侧厨房与卫生间、东侧主卧与书房、北侧景观阳台。',
  },
  bedroom: {
    id: 'bedroom',
    name: '主卧',
    enName: 'Master Bedroom',
    bounds: { x0: 1.0, x1: 6.0, z0: -4.5, z1: 0.0 },
    center: { x: 2.6, z: -1.6 },
    floorColor: '#f7e5da',
    accentColor: '#a89bff',
    description: '独立双人主卧，通过主卧木门进出，带双人软床、床头灯、大衣柜和带窗帘的采光大窗。',
  },
  study: {
    id: 'study',
    name: '书房工作区',
    enName: 'Dual Study',
    bounds: { x0: 1.0, x1: 6.0, z0: 0.0, z1: 4.5 },
    center: { x: 2.8, z: 2.0 },
    floorColor: '#e6edf7',
    accentColor: '#6bbfff',
    description: '独立双人书房，通过书房木门从过道进出，配双屏电脑桌、两把工学椅、漫画书架与黑胶音响。',
  },
  kitchen: {
    id: 'kitchen',
    name: '厨房',
    enName: 'Kitchen',
    bounds: { x0: -6.0, x1: -2.0, z0: 1.4, z1: 4.5 },
    center: { x: -3.8, z: 2.8 },
    floorColor: '#eef5f0',
    accentColor: '#6fd99b',
    description: '独立明厨，配玻璃推拉门（可常开或关上隔油烟），内有双开门冰箱、料理台、电磁炉与咖啡机。',
  },
  bathroom: {
    id: 'bathroom',
    name: '干湿分离卫生间',
    enName: 'Bathroom',
    bounds: { x0: -2.0, x1: 1.0, z0: 1.4, z1: 4.5 },
    center: { x: -0.4, z: 2.8 },
    floorColor: '#dff2f7',
    accentColor: '#5fd4e0',
    description: '独立干湿分离卫生间，装有磨砂玻璃实木门，内有环形补光镜洗手台、马桶和玻璃淋浴房。',
  },
  balcony: {
    id: 'balcony',
    name: '景观阳台',
    enName: 'Balcony',
    bounds: { x0: -6.0, x1: 1.0, z0: -6.3, z1: -4.5 },
    center: { x: -2.5, z: -5.4 },
    floorColor: '#e4d8c5',
    accentColor: '#8ed977',
    description: '通过落地玻璃推拉门与客厅相连的景观阳台，有玻璃护栏、绿植角和藤编躺椅。',
  },
};

/**
 * 5 扇实体可开关门定义（几何中心、朝向、门洞净宽、开合方式）：
 * - type: 'hinge'（平开旋转门）| 'slide'（左右推拉玻璃门）
 * - axis: 'z'（门板沿 Z 轴方向，位于竖墙上）| 'x'（门板沿 X 轴方向，位于横墙上）
 */
export const DOORS = {
  door_bedroom: {
    id: 'door_bedroom',
    name: '主卧门',
    room: 'bedroom',
    connects: ['living_room', 'bedroom'],
    type: 'hinge',
    axis: 'z',
    x: 1.0,
    z: -1.1,
    width: 1.15,
    hingeZ: -1.675,
    swingDir: 1, // 向主卧内侧平滑打开
    defaultState: 'open',
  },
  door_study: {
    id: 'door_study',
    name: '书房门',
    room: 'study',
    connects: ['living_room', 'study'],
    type: 'hinge',
    axis: 'z',
    x: 1.0,
    z: 0.72,
    width: 1.15,
    hingeZ: 0.145,
    swingDir: 1, // 向书房内侧平滑打开
    defaultState: 'open',
  },
  door_bathroom: {
    id: 'door_bathroom',
    name: '卫生间磨砂门',
    room: 'bathroom',
    connects: ['living_room', 'bathroom'],
    type: 'hinge',
    axis: 'x',
    x: -0.45,
    z: 1.4,
    width: 1.1,
    hingeX: -1.0,
    swingDir: 1, // 向卫生间内侧打开
    defaultState: 'closed',
  },
  door_kitchen: {
    id: 'door_kitchen',
    name: '厨房玻璃推拉门',
    room: 'kitchen',
    connects: ['living_room', 'kitchen'],
    type: 'slide',
    axis: 'x',
    x: -3.4,
    z: 1.4,
    width: 1.6,
    slideDist: 1.35,
    defaultState: 'open',
  },
  door_balcony: {
    id: 'door_balcony',
    name: '阳台落地推拉门',
    room: 'balcony',
    connects: ['living_room', 'balcony'],
    type: 'slide',
    axis: 'x',
    x: -2.6,
    z: -4.5,
    width: 1.8,
    slideDist: 1.45,
    defaultState: 'open',
  },
};

export const INITIAL_OBJECTS = {
  // --- 5 扇实体可开关门 ---
  door_bedroom: {
    id: 'door_bedroom',
    name: '主卧门',
    room: 'bedroom',
    kind: 'door',
    x: 1.0,
    z: -1.1,
    standPos: { x: 0.25, z: -1.1 },
    state: 'open',
    states: ['closed', 'open'],
    verb: { open: '推开了主卧门', closed: '轻轻带上了主卧门' },
  },
  door_study: {
    id: 'door_study',
    name: '书房门',
    room: 'study',
    kind: 'door',
    x: 1.0,
    z: 0.72,
    standPos: { x: 0.25, z: 0.72 },
    state: 'open',
    states: ['closed', 'open'],
    verb: { open: '推开了书房门', closed: '关上了书房门' },
  },
  door_bathroom: {
    id: 'door_bathroom',
    name: '卫生间磨砂门',
    room: 'bathroom',
    kind: 'door',
    x: -0.45,
    z: 1.4,
    standPos: { x: -0.45, z: 0.65 },
    state: 'closed',
    states: ['closed', 'open'],
    verb: { open: '打开了卫生间磨砂门', closed: '关上了卫生间磨砂门' },
  },
  door_kitchen: {
    id: 'door_kitchen',
    name: '厨房玻璃推拉门',
    room: 'kitchen',
    kind: 'door',
    x: -3.4,
    z: 1.4,
    standPos: { x: -3.4, z: 0.65 },
    state: 'open',
    states: ['closed', 'open'],
    verb: { open: '拉开了厨房玻璃推拉门', closed: '拉上了厨房推拉门挡住油烟' },
  },
  door_balcony: {
    id: 'door_balcony',
    name: '阳台落地推拉门',
    room: 'balcony',
    kind: 'door',
    x: -2.6,
    z: -4.5,
    standPos: { x: -2.6, z: -3.75 },
    state: 'open',
    states: ['closed', 'open'],
    verb: { open: '拉开了阳台落地推拉门，微风吹了进来', closed: '关上了阳台落地推拉门' },
  },

  // --- 客厅餐厅 ---
  living_lamp: {
    id: 'living_lamp',
    name: '客厅落地灯',
    room: 'living_room',
    kind: 'light',
    x: -5.3,
    z: -3.7,
    standPos: { x: -4.5, z: -3.3 },
    state: 'on',
    states: ['off', 'on'],
    verb: { on: '打开了客厅落地灯', off: '关掉了客厅落地灯' },
  },
  tv: {
    id: 'tv',
    name: '客厅电视',
    room: 'living_room',
    kind: 'screen',
    x: -5.45,
    z: -1.6,
    standPos: { x: -4.2, z: -1.6 },
    state: 'on',
    states: ['off', 'on'],
    verb: { on: '打开了客厅电视，正在放动画番剧', off: '关掉了客厅电视' },
  },
  sofa: {
    id: 'sofa',
    name: 'L型奶油沙发',
    room: 'living_room',
    kind: 'seat',
    x: -1.9,
    z: -1.7,
    standPos: { x: -2.9, z: -1.7 },
    state: 'idle',
    states: ['idle', 'occupied'],
    verb: { occupied: '舒服地窝进了客厅沙发', idle: '从客厅沙发站了起来' },
  },
  dining_table: {
    id: 'dining_table',
    name: '双人餐桌',
    room: 'living_room',
    kind: 'seat',
    x: -4.5,
    z: 0.25,
    standPos: { x: -3.4, z: 0.25 },
    state: 'idle',
    states: ['idle', 'tea'],
    verb: { tea: '在餐桌上摆好了下午茶点心', idle: '收拾好了餐桌' },
  },
  ac_unit: {
    id: 'ac_unit',
    name: '客厅空调',
    room: 'living_room',
    kind: 'appliance',
    x: -5.85,
    z: -3.0,
    standPos: { x: -4.8, z: -3.0 },
    state: 'on',
    states: ['off', 'on'],
    verb: { on: '打开了空调（25°C 舒适微风）', off: '关掉了客厅空调' },
  },

  // --- 主卧 ---
  bedroom_lamp: {
    id: 'bedroom_lamp',
    name: '主卧床头暖灯',
    room: 'bedroom',
    kind: 'light',
    x: 5.3,
    z: -3.55,
    standPos: { x: 4.3, z: -1.2 },
    state: 'on',
    states: ['off', 'on'],
    verb: { on: '点亮了主卧床头暖灯', off: '关掉了主卧床头灯' },
  },
  bed: {
    id: 'bed',
    name: '双人软床',
    room: 'bedroom',
    kind: 'bed',
    x: 3.85,
    z: -2.85,
    standPos: { x: 2.35, z: -2.3 },
    state: 'idle',
    states: ['idle', 'sleeping'],
    verb: { sleeping: '钻进主卧软床准备小憩', idle: '从床上坐了起来' },
  },
  bedroom_curtain: {
    id: 'bedroom_curtain',
    name: '主卧窗帘',
    room: 'bedroom',
    kind: 'curtain',
    x: 3.7,
    z: -4.34,
    standPos: { x: 2.35, z: -3.3 },
    state: 'open',
    states: ['open', 'closed'],
    verb: { open: '拉开了主卧窗帘，阳光洒了进来', closed: '拉上了主卧窗帘' },
  },
  wardrobe: {
    id: 'wardrobe',
    name: '主卧衣柜',
    room: 'bedroom',
    kind: 'storage',
    x: 1.75,
    z: -3.95,
    standPos: { x: 2.0, z: -2.95 },
    state: 'closed',
    states: ['closed', 'open'],
    verb: { open: '打开衣柜挑了挑今天的穿搭', closed: '关上了衣柜门' },
  },

  // --- 书房工作区 ---
  study_lamp: {
    id: 'study_lamp',
    name: '书房护眼台灯',
    room: 'study',
    kind: 'light',
    x: 4.9,
    z: 3.85,
    standPos: { x: 4.2, z: 2.55 },
    state: 'on',
    states: ['off', 'on'],
    verb: { on: '打开了书房护眼台灯', off: '关掉了书房台灯' },
  },
  pc_desk: {
    id: 'pc_desk',
    name: '双人电脑桌',
    room: 'study',
    kind: 'screen',
    x: 3.75,
    z: 3.85,
    standPos: { x: 3.6, z: 2.55 },
    state: 'on',
    states: ['off', 'on'],
    verb: { on: '唤醒了书房双屏电脑', off: '让书房电脑进入休眠' },
  },
  music_player: {
    id: 'music_player',
    name: '黑胶音响',
    room: 'study',
    kind: 'music',
    x: 1.75,
    z: 3.9,
    standPos: { x: 2.0, z: 2.85 },
    state: 'playing',
    states: ['paused', 'playing'],
    verb: { playing: '播放了轻快的 Lo-Fi 动漫背景音乐', paused: '暂停了黑胶音响' },
  },
  bookshelf: {
    id: 'bookshelf',
    name: '漫画书架',
    room: 'study',
    kind: 'storage',
    x: 5.58,
    z: 1.65,
    standPos: { x: 4.55, z: 1.65 },
    state: 'idle',
    states: ['idle', 'reading'],
    verb: { reading: '从书架抽出一本漫画翻看', idle: '把漫画放回了书架' },
  },

  // --- 厨房 ---
  kitchen_lamp: {
    id: 'kitchen_lamp',
    name: '厨房吊灯',
    room: 'kitchen',
    kind: 'light',
    x: -3.9,
    z: 2.9,
    standPos: { x: -3.7, z: 2.7 },
    state: 'on',
    states: ['off', 'on'],
    verb: { on: '打开了厨房吊灯', off: '关掉了厨房吊灯' },
  },
  fridge: {
    id: 'fridge',
    name: '双开门冰箱',
    room: 'kitchen',
    kind: 'appliance',
    x: -5.4,
    z: 3.85,
    standPos: { x: -4.5, z: 2.9 },
    state: 'closed',
    states: ['closed', 'open'],
    verb: { open: '打开冰箱拿了一瓶冰镇气泡水', closed: '关上了冰箱门' },
  },
  coffee_maker: {
    id: 'coffee_maker',
    name: '意式咖啡机',
    room: 'kitchen',
    kind: 'appliance',
    x: -3.2,
    z: 4.02,
    standPos: { x: -3.2, z: 3.05 },
    state: 'idle',
    states: ['idle', 'brewing'],
    verb: { brewing: '启动了咖啡机，满屋飘起拿铁香气', idle: '端走了刚煮好的咖啡' },
  },

  // --- 卫生间 ---
  bathroom_mirror: {
    id: 'bathroom_mirror',
    name: '浴室补光镜灯',
    room: 'bathroom',
    kind: 'light',
    x: -0.2,
    z: 4.2,
    standPos: { x: -0.2, z: 3.1 },
    state: 'off',
    states: ['off', 'on'],
    verb: { on: '点亮了卫生间环形补光镜灯', off: '关掉了卫生间镜灯' },
  },

  // --- 景观阳台 ---
  balcony_plants: {
    id: 'balcony_plants',
    name: '阳台绿植角',
    room: 'balcony',
    kind: 'plant',
    x: -5.0,
    z: -5.5,
    standPos: { x: -4.1, z: -5.3 },
    state: 'dry',
    states: ['dry', 'watered'],
    verb: { watered: '给阳台的小盆栽们浇了水，叶片亮晶晶的', dry: '检查了阳台绿植的湿度' },
  },
  balcony_chair: {
    id: 'balcony_chair',
    name: '阳台藤编躺椅',
    room: 'balcony',
    kind: 'seat',
    x: -0.6,
    z: -5.4,
    standPos: { x: -1.5, z: -5.3 },
    state: 'idle',
    states: ['idle', 'relaxing'],
    verb: { relaxing: '在阳台躺椅上吹着微风看风景', idle: '从阳台躺椅起身了' },
  },
};

/**
 * 内部隔墙线段（精确预留 5 扇门的门洞位置，与 3D 渲染与碰撞系统 100% 同步）
 */
export const WALL_SEGMENTS = [
  // 1) 客厅/过道 与 主卧/书房 纵向分界墙 (x = 1.0, z ∈ [-4.5, 4.5])
  //    预留主卧门洞 z ∈ [-1.675, -0.525] 与 书房门洞 z ∈ [0.145, 1.295]
  { x0: 1.0, z0: -4.5, x1: 1.0, z1: -1.675 },
  { x0: 1.0, z0: -0.525, x1: 1.0, z1: 0.145 },
  { x0: 1.0, z0: 1.295, x1: 1.0, z1: 4.5 },

  // 2) 主卧 与 书房 完整隔墙 (z = 0.0, x ∈ [1.0, 6.0])，完全隔音私密
  { x0: 1.0, z0: 0.0, x1: 6.0, z1: 0.0 },

  // 3) 客厅 与 厨房 横向隔墙 (z = 1.4, x ∈ [-6.0, -2.0])，预留厨房推拉门洞 x ∈ [-4.2, -2.6]
  { x0: -6.0, z0: 1.4, x1: -4.2, z1: 1.4 },
  { x0: -2.6, z0: 1.4, x1: -2.0, z1: 1.4 },

  // 4) 厨房 与 卫生间 完整隔墙 (x = -2.0, z ∈ [1.4, 4.5])
  { x0: -2.0, z0: 1.4, x1: -2.0, z1: 4.5 },

  // 5) 客厅/过道 与 卫生间 横向隔墙 (z = 1.4, x ∈ [-2.0, 1.0])，预留卫生间门洞 x ∈ [-1.0, 0.1]
  { x0: -2.0, z0: 1.4, x1: -1.0, z1: 1.4 },
  { x0: 0.1, z0: 1.4, x1: 1.0, z1: 1.4 },

  // 6) 客厅 与 阳台 横向玻璃隔墙 (z = -4.5, x ∈ [-6.0, 1.0])，预留阳台落地推拉门洞 x ∈ [-3.5, -1.7]
  { x0: -6.0, z0: -4.5, x1: -3.5, z1: -4.5 },
  { x0: -1.7, z0: -4.5, x1: 1.0, z1: -4.5 },
];

/**
 * 大型家具大致碰撞箱（AABB: { id, minX, maxX, minZ, maxZ }），
 * 留出充裕走道空间，保证人物和桌宠既不会穿家具，也不会被窄缝卡住。
 */
export const FURNITURE_COLLIDERS = [
  // 客厅：电视柜、茶几、L型沙发、餐桌
  { id: 'tv_console', minX: -5.85, maxX: -5.1, minZ: -2.75, maxZ: -0.45 },
  { id: 'coffee_table', minX: -3.95, maxX: -3.15, minZ: -2.35, maxZ: -1.05 },
  { id: 'sofa_main', minX: -2.4, maxX: -1.35, minZ: -2.95, maxZ: -0.45 },
  { id: 'dining_table', minX: -5.25, maxX: -3.85, minZ: -0.25, maxZ: 0.75 },
  // 主卧：双人床、床头柜、衣柜
  { id: 'bed', minX: 2.75, maxX: 5.05, minZ: -3.9, maxZ: -1.75 },
  { id: 'nightstand', minX: 5.05, maxX: 5.65, minZ: -3.9, maxZ: -3.2 },
  { id: 'wardrobe', minX: 1.15, maxX: 2.35, minZ: -4.35, maxZ: -3.58 },
  // 书房：双人电脑桌、漫画书架、黑胶柜
  { id: 'pc_desk', minX: 2.55, maxX: 5.05, minZ: 3.35, maxZ: 4.35 },
  { id: 'bookshelf', minX: 5.25, maxX: 5.9, minZ: 0.7, maxZ: 2.6 },
  { id: 'music_player', minX: 1.35, maxX: 2.15, minZ: 3.55, maxZ: 4.25 },
  // 厨房：冰箱、料理台
  { id: 'fridge', minX: -5.88, maxX: -4.92, minZ: 3.45, maxZ: 4.35 },
  { id: 'kitchen_counter', minX: -4.85, maxX: -2.15, minZ: 3.62, maxZ: 4.38 },
  // 卫生间：玻璃淋浴房、洗手台
  { id: 'shower_box', minX: -1.9, maxX: -0.95, minZ: 3.25, maxZ: 4.35 },
  { id: 'vanity', minX: -0.75, maxX: 0.35, minZ: 3.82, maxZ: 4.38 },
  // 阳台：躺椅、大盆栽角
  { id: 'balcony_chair', minX: -1.1, maxX: -0.1, minZ: -6.05, maxZ: -4.85 },
  { id: 'balcony_plants', minX: -5.65, maxX: -4.45, minZ: -6.05, maxZ: -4.95 },
];

export function detectRoom(x, z) {
  for (const room of Object.values(ROOMS)) {
    const b = room.bounds;
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
      return room.id;
    }
  }
  return 'living_room';
}

function pointToSegmentDist(px, pz, s) {
  const dx = s.x1 - s.x0;
  const dz = s.z1 - s.z0;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - s.x0, pz - s.z0);
  const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (pz - s.z0) * dz) / lenSq));
  return Math.hypot(px - (s.x0 + t * dx), pz - (s.z0 + t * dz));
}

export function isWalkable(x, z, pad = 0.24) {
  const inMain = x >= -5.72 && x <= 5.72 && z >= -4.22 && z <= 4.22;
  const inBalcony = x >= -5.72 && x <= 0.72 && z >= -6.02 && z <= -4.22;
  if (!inMain && !inBalcony) return false;

  for (const seg of WALL_SEGMENTS) {
    if (pointToSegmentDist(x, z, seg) < pad + 0.04) return false;
  }
  for (const box of FURNITURE_COLLIDERS) {
    if (x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad) {
      return false;
    }
  }
  return true;
}

/**
 * 轻量 A* 网格寻路（0.3m 分辨率）：自动绕开所有墙体与大型家具碰撞箱，并规划穿过门洞的真实路径。
 */
export function findPath(start, goal) {
  const step = 0.3;
  const minX = -6.0;
  const minZ = -6.3;
  const cols = Math.ceil(12.2 / step);
  const rows = Math.ceil(11.0 / step);

  const toCell = (p) => ({
    c: Math.max(0, Math.min(cols - 1, Math.round((p.x - minX) / step))),
    r: Math.max(0, Math.min(rows - 1, Math.round((p.z - minZ) / step))),
  });
  const toWorld = (c, r) => ({
    x: Number((minX + c * step).toFixed(2)),
    z: Number((minZ + r * step).toFixed(2)),
  });

  const s = toCell(start);
  const g = toCell(goal);
  const key = (c, r) => `${c},${r}`;

  const open = new Map([[key(s.c, s.r), { c: s.c, r: s.r, g: 0, f: Math.hypot(g.c - s.c, g.r - s.r) }]]);
  const cameFrom = new Map();
  const closed = new Set();
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
  ];

  let best = { c: s.c, r: s.r, dist: Math.hypot(g.c - s.c, g.r - s.r) };
  let iter = 0;

  while (open.size > 0 && iter++ < 2800) {
    let cur = null;
    for (const node of open.values()) {
      if (!cur || node.f < cur.f) cur = node;
    }
    const ck = key(cur.c, cur.r);
    if (cur.c === g.c && cur.r === g.r) {
      best = cur;
      break;
    }
    open.delete(ck);
    closed.add(ck);

    const dGoal = Math.hypot(g.c - cur.c, g.r - cur.r);
    if (dGoal < best.dist) best = { c: cur.c, r: cur.r, dist: dGoal };

    for (const [dc, dr, cost] of dirs) {
      const nc = cur.c + dc;
      const nr = cur.r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;
      const wp = toWorld(nc, nr);
      if (!(nc === g.c && nr === g.r) && !isWalkable(wp.x, wp.z, 0.2)) continue;
      const ng = cur.g + cost;
      const prev = open.get(nk);
      if (!prev || ng < prev.g) {
        cameFrom.set(nk, ck);
        open.set(nk, { c: nc, r: nr, g: ng, f: ng + Math.hypot(g.c - nc, g.r - nr) });
      }
    }
  }

  const raw = [];
  let k = key(best.c, best.r);
  while (k) {
    const [c, r] = k.split(',').map(Number);
    raw.push(toWorld(c, r));
    k = cameFrom.get(k);
  }
  raw.reverse();
  if (raw.length === 0) return [goal];
  raw[raw.length - 1] = { x: Number(goal.x.toFixed(2)), z: Number(goal.z.toFixed(2)) };
  return raw;
}
