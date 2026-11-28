import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { Pet2DFigureRenderer } from './figure-renderer.js';

// ============================================================
// 1. 卡通着色、描边与程序化地板贴图
// ============================================================
function createToonGradient() {
  const data = new Uint8Array([95, 155, 225, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const TOON_GRADIENT = createToonGradient();
const OUTLINE_MAT = new THREE.LineBasicMaterial({ color: 0x3b2c43, transparent: true, opacity: 0.55 });

function toonMat(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: TOON_GRADIENT, ...extra });
}

function addBox(parent, w, h, d, color, x, y, z, { outline = true, shadow = true, mat = null } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat || toonMat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  if (outline) {
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), OUTLINE_MAT));
  }
  parent.add(mesh);
  return mesh;
}

function addCyl(parent, rt, rb, h, segs, color, x, y, z, { outline = false, shadow = true, mat = null } = {}) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, segs);
  const mesh = new THREE.Mesh(geo, mat || toonMat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  if (outline) {
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), OUTLINE_MAT));
  }
  parent.add(mesh);
  return mesh;
}

function makeFloorTexture(baseHex, lineHex, style = 'wood') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 2;
  if (style === 'wood') {
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
      const offset = (y / 32) % 2 === 0 ? 64 : 160;
      ctx.beginPath();
      ctx.moveTo(offset, y);
      ctx.lineTo(offset, y + 32);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoomBadgeTexture(title, sub, colorHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 84;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255, 252, 248, 0.92)';
  ctx.strokeStyle = '#3b2c43';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 68, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = colorHex;
  ctx.beginPath();
  ctx.arc(34, 42, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34293a';
  ctx.font = 'bold 23px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText(title, 54, 41);
  ctx.fillStyle = '#7b6b85';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(sub, 54, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================
// 2. 场景、渲染器、360° 可旋转上帝视角与昼夜光照
// ============================================================
const params = new URLSearchParams(location.search);
if (params.get('clean') === '1') document.body.classList.add('clean-shot');

const rootEl = document.getElementById('scene-root');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcce7ff);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 160);
camera.position.set(-10.8, 12.0, 12.8);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
rootEl.appendChild(renderer.domElement);

let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  contextLost = true;
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false;
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = true;
controls.minDistance = 6.0;
controls.maxDistance = 28.0;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = Math.PI * 0.46;
controls.target.set(0, 0.5, -0.5);
controls.update();

const hemiLight = new THREE.HemisphereLight(0xfff5ea, 0x8d88a8, 0.85);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff1dc, 1.35);
sunLight.position.set(11, 16, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 2;
sunLight.shadow.camera.far = 45;
sunLight.shadow.camera.left = -10;
sunLight.shadow.camera.right = 10;
sunLight.shadow.camera.top = 10;
sunLight.shadow.camera.bottom = -10;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

const starGeo = new THREE.BufferGeometry();
const starPts = [];
for (let i = 0; i < 260; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * Math.PI * 0.45;
  const r = 55;
  starPts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) + 8, r * Math.sin(phi) * Math.sin(theta));
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
const starMat = new THREE.PointsMaterial({ color: 0xfff8d6, size: 0.45, transparent: true, opacity: 0 });
scene.add(new THREE.Points(starGeo, starMat));

const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 20), new THREE.MeshBasicMaterial({ color: 0xffe48f }));
const moonOrb = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 20), new THREE.MeshBasicMaterial({ color: 0xe6f0ff }));
scene.add(sunOrb, moonOrb);

// ============================================================
// 3. 真实 2 人户型建筑主体（动静分离 6 功能区 + 5 扇实体门）
// ============================================================
const apartment = new THREE.Group();
scene.add(apartment);

const WALL_H = 2.75;
const WALL_T = 0.16;
const FLOOR_CLICK_MESHES = [];
const INTERACTIVE_MESHES = [];
const OBJECT_HANDLERS = new Map();
const ROOM_LIGHTS = [];

function registerInteractive(objectId, label, group, onUpdate) {
  group.traverse((child) => {
    if (child.isMesh) {
      child.userData.objectId = objectId;
      child.userData.label = label;
      INTERACTIVE_MESHES.push(child);
    }
  });
  OBJECT_HANDLERS.set(objectId, onUpdate);
}

// 展览底座
addBox(apartment, 13.0, 0.45, 11.8, 0x4b3c53, 0, -0.26, -0.85);
addBox(apartment, 12.6, 0.12, 11.4, 0xf6efe6, 0, -0.02, -0.85, { outline: false });

// 6 个功能区地板（与 lib/floorplan.js 100% 精确对齐）
const floorSpecs = [
  { id: 'living_room', w: 7.0, d: 5.9, x: -2.5, z: -1.55, c1: '#f4e3cb', c2: '#e1caa8', style: 'wood' },
  { id: 'bedroom', w: 5.0, d: 4.5, x: 3.5, z: -2.25, c1: '#f7e5da', c2: '#e5ccbe', style: 'wood' },
  { id: 'study', w: 5.0, d: 4.5, x: 3.5, z: 2.25, c1: '#e6edf7', c2: '#cfd9ea', style: 'wood' },
  { id: 'kitchen', w: 4.0, d: 3.1, x: -4.0, z: 2.95, c1: '#eef5f0', c2: '#d2e2d7', style: 'tile' },
  { id: 'bathroom', w: 3.0, d: 3.1, x: -0.5, z: 2.95, c1: '#dff2f7', c2: '#bedde6', style: 'tile' },
  { id: 'balcony', w: 7.0, d: 1.8, x: -2.5, z: -5.4, c1: '#e4d8c5', c2: '#cbbba2', style: 'wood' },
];

for (const f of floorSpecs) {
  const mat = new THREE.MeshToonMaterial({
    map: makeFloorTexture(f.c1, f.c2, f.style),
    gradientMap: TOON_GRADIENT,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(f.w, 0.08, f.d), mat);
  mesh.position.set(f.x, 0.04, f.z);
  mesh.receiveShadow = true;
  mesh.userData = { isFloor: true, roomId: f.id };
  apartment.add(mesh);
  FLOOR_CLICK_MESHES.push(mesh);
}

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xbce8ff,
  transparent: true,
  opacity: 0.38,
  roughness: 0.1,
});
const frostedGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0xe6f8ff,
  transparent: true,
  opacity: 0.72,
  roughness: 0.45,
});

function addWallSeg(group, x0, z0, x1, z1, h = WALL_H, color = 0xfff8f0) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.05) return null;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rotY = -Math.atan2(z1 - z0, x1 - x0);
  const geo = new THREE.BoxGeometry(len, h, WALL_T);
  const mesh = new THREE.Mesh(geo, toonMat(color));
  mesh.position.set(cx, h / 2 + 0.08, cz);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), OUTLINE_MAT));
  group.add(mesh);
  return mesh;
}

// 内部隔墙（精确对齐 lib/floorplan.js 的 WALL_SEGMENTS，所有 5 处门洞均配实体门）
const innerWalls = new THREE.Group();
apartment.add(innerWalls);

const innerWallList = [
  [1.0, -4.5, 1.0, -1.675], [1.0, -0.525, 1.0, 0.145], [1.0, 1.295, 1.0, 4.5], // 东静区隔墙（留主卧门、书房门）
  [1.0, 0.0, 6.0, 0.0],                                                        // 主卧-书房完整私密隔墙
  [-6.0, 1.4, -4.2, 1.4], [-2.6, 1.4, -2.0, 1.4],                              // 客厅-厨房隔墙（留厨房推拉门）
  [-2.0, 1.4, -2.0, 4.5],                                                      // 厨房-卫生间隔墙
  [-2.0, 1.4, -1.0, 1.4], [0.1, 1.4, 1.0, 1.4],                                // 过道-卫生间隔墙（留卫生间磨砂门）
  [-6.0, -4.5, -3.5, -4.5], [-1.7, -4.5, 1.0, -4.5],                           // 客厅-阳台隔墙（留阳台落地推拉门）
];
for (const [x0, z0, x1, z1] of innerWallList) {
  addWallSeg(innerWalls, x0, z0, x1, z1, WALL_H * 0.9, 0xfff7ee);
}

// 5 扇实体门上方的门楣（Door Header），让门框结构真实完整
addBox(innerWalls, 0.18, 0.36, 1.15, 0xf2e4d5, 1.0, 2.38, -1.1);   // 主卧门楣
addBox(innerWalls, 0.18, 0.36, 1.15, 0xf2e4d5, 1.0, 2.38, 0.72);   // 书房门楣
addBox(innerWalls, 1.1, 0.36, 0.18, 0xe8f3f7, -0.45, 2.38, 1.4);   // 卫生间门楣
addBox(innerWalls, 1.6, 0.36, 0.18, 0xebf2ed, -3.4, 2.38, 1.4);    // 厨房推拉门楣
addBox(innerWalls, 1.8, 0.36, 0.18, 0xf2e8dc, -2.6, 2.38, -4.5);   // 阳台推拉门楣

// 阳台玻璃护栏
addBox(apartment, 7.0, 0.95, 0.07, 0xbce8ff, -2.5, 0.56, -6.28, { outline: true, shadow: false, mat: glassMat });
addBox(apartment, 0.07, 0.95, 1.8, 0xbce8ff, -5.98, 0.56, -5.4, { outline: true, shadow: false, mat: glassMat });
addBox(apartment, 0.07, 0.95, 1.8, 0xbce8ff, 0.98, 0.56, -5.4, { outline: true, shadow: false, mat: glassMat });
addBox(apartment, 7.06, 0.08, 0.12, 0xd8a679, -2.5, 1.06, -6.28);

// 4 面动态隐墙外围墙
const outerWallGroups = {
  north: new THREE.Group(),
  south: new THREE.Group(),
  west: new THREE.Group(),
  east: new THREE.Group(),
};
Object.values(outerWallGroups).forEach((g) => apartment.add(g));

// 主卧北外墙（带采光大窗）
addWallSeg(outerWallGroups.north, 1.0, -4.5, 2.3, -4.5, WALL_H, 0xfff5eb);
addWallSeg(outerWallGroups.north, 5.1, -4.5, 6.0, -4.5, WALL_H, 0xfff5eb);
addBox(outerWallGroups.north, 2.8, 0.78, WALL_T, 0xfff5eb, 3.7, 0.47, -4.5);
addBox(outerWallGroups.north, 2.8, 0.45, WALL_T, 0xfff5eb, 3.7, WALL_H - 0.14, -4.5);
addBox(outerWallGroups.north, 2.75, 1.5, 0.05, 0xc7edff, 3.7, 1.62, -4.5, { outline: false, shadow: false, mat: glassMat });

addWallSeg(outerWallGroups.south, -6.0, 4.5, 6.0, 4.5, WALL_H, 0xfff5eb);
addWallSeg(outerWallGroups.west, -6.0, -4.5, -6.0, 4.5, WALL_H, 0xfff5eb);
addWallSeg(outerWallGroups.east, 6.0, -4.5, 6.0, 4.5, WALL_H, 0xfff5eb);

const ceilingMesh = addBox(apartment, 12.16, 0.12, 9.16, 0xfffaf4, 0, WALL_H + 0.14, 0, { outline: false, shadow: false });
ceilingMesh.visible = false;

// 房间悬浮标签（上帝视角可见）
const roomBadgeGroup = new THREE.Group();
apartment.add(roomBadgeGroup);
const badgeMeta = [
  ['客厅餐厅', 'LIVING & HALL', '#ff8ab4', -2.6, -1.6],
  ['主卧', 'MASTER BEDROOM', '#a89bff', 3.6, -2.2],
  ['书房工作区', 'DUAL STUDY', '#6bbfff', 3.6, 2.3],
  ['厨房', 'KITCHEN', '#6fd99b', -4.0, 3.0],
  ['干湿分离卫生间', 'BATHROOM', '#5fd4e0', -0.5, 3.0],
  ['景观阳台', 'BALCONY', '#8ed977', -2.5, -5.4],
];
for (const [zh, en, col, bx, bz] of badgeMeta) {
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makeRoomBadgeTexture(zh, en, col), transparent: true, depthTest: false })
  );
  sp.position.set(bx, 3.08, bz);
  sp.scale.set(2.05, 0.68, 1);
  sp.renderOrder = 20;
  roomBadgeGroup.add(sp);
}

// ============================================================
// 4. 5 扇实体可开关门（带平滑开关动画与防夹人安全区）
// ============================================================
const DOOR_RIGS = new Map();

function buildHingeDoor({ id, label, hingeX, hingeZ, width, axis, swingSign, color, frostedWindow = false }) {
  const pivot = new THREE.Group();
  pivot.position.set(hingeX, 0.08, hingeZ);
  apartment.add(pivot);

  const panelH = 2.12;
  const panelT = 0.07;
  const wX = axis === 'x' ? width - 0.04 : panelT;
  const wZ = axis === 'z' ? width - 0.04 : panelT;
  const offX = axis === 'x' ? (width - 0.04) / 2 : 0;
  const offZ = axis === 'z' ? (width - 0.04) / 2 : 0;

  addBox(pivot, wX, panelH, wZ, color, offX, panelH / 2, offZ);
  if (frostedWindow) {
    // 卫生间门上半部磨砂玻璃视窗
    const gwX = axis === 'x' ? width * 0.56 : panelT + 0.015;
    const gwZ = axis === 'z' ? width * 0.56 : panelT + 0.015;
    addBox(pivot, gwX, 0.85, gwZ, 0xe6f8ff, offX, 1.42, offZ, { outline: true, shadow: false, mat: frostedGlassMat });
  }
  // 门把手（双侧）
  const hPosX = axis === 'x' ? width * 0.82 : 0;
  const hPosZ = axis === 'z' ? width * 0.82 : 0;
  addCyl(pivot, 0.035, 0.035, 0.14, 10, 0xf2c66d, hPosX, 1.0, hPosZ);

  const rig = {
    id,
    type: 'hinge',
    pivot,
    swingSign,
    targetOpen: 1,
    progress: 1,
    centerX: axis === 'x' ? hingeX + width / 2 : hingeX,
    centerZ: axis === 'z' ? hingeZ + width / 2 : hingeZ,
    width,
    axis,
  };
  DOOR_RIGS.set(id, rig);
  registerInteractive(id, `${label}（点击或按 E 开关）`, pivot, (st) => {
    rig.targetOpen = st === 'open' ? 1 : 0;
  });
}

function buildSlideDoor({ id, label, x, z, width, slideDist, frameColor }) {
  const group = new THREE.Group();
  group.position.set(x, 0.08, z);
  apartment.add(group);

  const panelH = 2.12;
  const leaf = new THREE.Group();
  group.add(leaf);
  addBox(leaf, width - 0.06, panelH, 0.06, 0xcbeeff, 0, panelH / 2, 0, { outline: true, shadow: false, mat: glassMat });
  addBox(leaf, width - 0.04, 0.08, 0.08, frameColor, 0, 0.05, 0);
  addBox(leaf, width - 0.04, 0.08, 0.08, frameColor, 0, panelH - 0.04, 0);
  addBox(leaf, 0.08, panelH, 0.08, frameColor, -(width - 0.12) / 2, panelH / 2, 0);
  addBox(leaf, 0.08, panelH, 0.08, frameColor, (width - 0.12) / 2, panelH / 2, 0);
  // 推拉竖把手
  addBox(leaf, 0.04, 0.36, 0.12, 0xf2c66d, -width * 0.36, 1.08, 0);

  const rig = {
    id,
    type: 'slide',
    leaf,
    slideDist,
    targetOpen: 1,
    progress: 1,
    centerX: x,
    centerZ: z,
    width,
    axis: 'x',
  };
  DOOR_RIGS.set(id, rig);
  registerInteractive(id, `${label}（点击或按 E 推拉）`, group, (st) => {
    rig.targetOpen = st === 'open' ? 1 : 0;
  });
}

// 装配 5 扇实体门
buildHingeDoor({ id: 'door_bedroom', label: '主卧实木门', hingeX: 1.0, hingeZ: -1.675, width: 1.15, axis: 'z', swingSign: 1, color: 0xe7c39d });
buildHingeDoor({ id: 'door_study', label: '书房实木门', hingeX: 1.0, hingeZ: 0.145, width: 1.15, axis: 'z', swingSign: 1, color: 0xd9e4f2 });
buildHingeDoor({ id: 'door_bathroom', label: '卫生间磨砂门', hingeX: -1.0, hingeZ: 1.4, width: 1.1, axis: 'x', swingSign: -1, color: 0xdff2f7, frostedWindow: true });
buildSlideDoor({ id: 'door_kitchen', label: '厨房玻璃推拉门', x: -3.4, z: 1.4, width: 1.6, slideDist: 1.35, frameColor: 0x5c6b66 });
buildSlideDoor({ id: 'door_balcony', label: '阳台落地推拉门', x: -2.6, z: -4.5, width: 1.8, slideDist: 1.45, frameColor: 0x594a5e });

// ============================================================
// 5. 19 件真实定位的二次元家具与环境灯光（与碰撞箱完全一致）
// ============================================================
// 客厅：L型奶油沙发（靠中东侧，面向西墙电视）
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.96, 0.42, 2.4, 0xfff1e2, -1.88, 0.29, -1.7);
  addBox(g, 0.22, 0.66, 2.4, 0xf7e1cc, -1.46, 0.68, -1.7);
  addBox(g, 0.22, 0.36, 0.44, 0xff9ec2, -1.68, 0.68, -2.25);
  addBox(g, 0.22, 0.36, 0.44, 0x8fd1ff, -1.68, 0.68, -1.15);
  addBox(apartment, 2.6, 0.03, 2.9, 0xfde2ea, -3.2, 0.095, -1.7, { outline: false });
  addBox(apartment, 0.72, 0.36, 1.22, 0xdba979, -3.55, 0.26, -1.7);
  registerInteractive('sofa', 'L型奶油沙发（坐下/起身）', g, () => {});
}

// 客厅电视（贴西墙）
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.48, 0.48, 2.15, 0xe8c39e, -5.55, 0.32, -1.6);
  addBox(g, 0.08, 1.0, 1.72, 0x322b3d, -5.62, 1.12, -1.6);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x84d2ff });
  addBox(g, 0.03, 0.88, 1.6, 0x84d2ff, -5.56, 1.12, -1.6, { outline: false, shadow: false, mat: screenMat });
  const tvLight = new THREE.PointLight(0x7ccbff, 0.55, 4.5);
  tvLight.position.set(-5.0, 1.15, -1.6);
  apartment.add(tvLight);
  registerInteractive('tv', '客厅电视（开关动画节目）', g, (st) => {
    const on = st === 'on';
    screenMat.color.setHex(on ? 0x84d2ff : 0x262130);
    tvLight.intensity = on ? 0.6 : 0;
  });
}

// 客厅落地灯
{
  const g = new THREE.Group();
  apartment.add(g);
  addCyl(g, 0.22, 0.26, 0.06, 16, 0xd4a373, -5.3, 0.11, -3.7);
  addCyl(g, 0.04, 0.04, 1.65, 10, 0x5c4b5c, -5.3, 0.94, -3.7);
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  addCyl(g, 0.18, 0.32, 0.36, 16, 0xffe9a8, -5.3, 1.78, -3.7, { outline: true, mat: shadeMat });
  const light = new THREE.PointLight(0xffd28a, 1.3, 7.5);
  light.position.set(-5.1, 1.7, -3.5);
  apartment.add(light);
  ROOM_LIGHTS.push({ light, isOn: () => currentObjects.living_lamp?.state === 'on', max: 1.5 });
  registerInteractive('living_lamp', '客厅落地灯（开关灯光）', g, (st) => {
    shadeMat.color.setHex(st === 'on' ? 0xffe9a8 : 0xbdb5ab);
  });
}

// 双人餐桌（靠近厨房门口）
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 1.32, 0.08, 0.86, 0xe4b88c, -4.55, 0.78, 0.25);
  for (const [lx, lz] of [[-5.12, -0.1], [-3.98, -0.1], [-5.12, 0.6], [-3.98, 0.6]]) {
    addBox(g, 0.08, 0.72, 0.08, 0xc79667, lx, 0.42, lz, { outline: false });
  }
  addBox(g, 0.4, 0.45, 0.4, 0xffc6d9, -4.55, 0.31, -0.38);
  addBox(g, 0.4, 0.45, 0.4, 0xb8e0ff, -4.55, 0.31, 0.86);
  const teaSet = addCyl(g, 0.16, 0.14, 0.14, 12, 0xff94b8, -4.55, 0.89, 0.25);
  teaSet.visible = false;
  registerInteractive('dining_table', '双人餐桌（摆下午茶/收拾）', g, (st) => {
    teaSet.visible = st === 'tea';
  });
}

// 客厅空调
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.24, 0.32, 1.15, 0xfafcff, -5.82, 2.2, -3.0);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x57e39c });
  addBox(g, 0.04, 0.05, 0.18, 0x57e39c, -5.69, 2.16, -2.62, { outline: false, shadow: false, mat: ledMat });
  registerInteractive('ac_unit', '客厅空调（开关微风）', g, (st) => {
    ledMat.color.setHex(st === 'on' ? 0x57e39c : 0x6b6b78);
  });
}

// 主卧：双人软床
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 2.2, 0.42, 2.05, 0xe8c39e, 3.9, 0.29, -2.85);
  addBox(g, 2.08, 0.28, 1.92, 0xffffff, 3.9, 0.56, -2.85);
  addBox(g, 2.12, 0.26, 1.32, 0xffc4db, 3.9, 0.62, -2.52);
  addBox(g, 0.7, 0.18, 0.4, 0xd8c8ff, 3.4, 0.76, -3.5);
  addBox(g, 0.7, 0.18, 0.4, 0xbce3ff, 4.4, 0.76, -3.5);
  addBox(g, 2.22, 1.05, 0.16, 0xd9ad82, 3.9, 0.62, -3.86);
  addBox(apartment, 2.7, 0.03, 2.4, 0xefe5ff, 3.9, 0.095, -2.65, { outline: false });
  registerInteractive('bed', '双人软床（小憩/起身）', g, () => {});
}

// 主卧床头灯
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.54, 0.52, 0.52, 0xe3b88c, 5.34, 0.34, -3.55);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdf9e });
  addCyl(g, 0.14, 0.2, 0.28, 14, 0xffdf9e, 5.34, 0.78, -3.55, { outline: true, mat: bulbMat });
  const light = new THREE.PointLight(0xffcb80, 1.2, 6.8);
  light.position.set(5.2, 1.05, -3.4);
  apartment.add(light);
  ROOM_LIGHTS.push({ light, isOn: () => currentObjects.bedroom_lamp?.state === 'on', max: 1.4 });
  registerInteractive('bedroom_lamp', '主卧床头暖灯（开关灯光）', g, (st) => {
    bulbMat.color.setHex(st === 'on' ? 0xffdf9e : 0xbdb5ab);
  });
}

// 主卧窗帘
{
  const g = new THREE.Group();
  apartment.add(g);
  const leftC = addBox(g, 0.45, 1.8, 0.12, 0xcab8ff, 2.52, 1.62, -4.34);
  const rightC = addBox(g, 0.45, 1.8, 0.12, 0xcab8ff, 4.88, 1.62, -4.34);
  registerInteractive('bedroom_curtain', '主卧窗帘（拉开/合上）', g, (st) => {
    const closed = st === 'closed';
    leftC.scale.x = closed ? 3.05 : 1.0;
    leftC.position.x = closed ? 3.02 : 2.52;
    rightC.scale.x = closed ? 3.05 : 1.0;
    rightC.position.x = closed ? 4.38 : 4.88;
  });
}

// 主卧衣柜
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 1.12, 2.1, 0.62, 0xf2dfcb, 1.75, 1.13, -3.95);
  const door = addBox(g, 0.52, 1.96, 0.06, 0xe8ccb0, 2.0, 1.13, -3.62);
  registerInteractive('wardrobe', '主卧衣柜（打开/关上）', g, (st) => {
    door.rotation.y = st === 'open' ? -0.9 : 0;
    door.position.x = st === 'open' ? 2.2 : 2.0;
    door.position.z = st === 'open' ? -3.44 : -3.62;
  });
}

// 书房：双人电脑桌
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 2.42, 0.1, 0.85, 0xe8edf5, 3.8, 0.78, 3.85);
  addBox(g, 0.12, 0.7, 0.78, 0xc6d3e6, 2.66, 0.43, 3.85);
  addBox(g, 0.12, 0.7, 0.78, 0xc6d3e6, 4.94, 0.43, 3.85);
  const mon1Mat = new THREE.MeshBasicMaterial({ color: 0x7fd4ff });
  const mon2Mat = new THREE.MeshBasicMaterial({ color: 0xffb3d9 });
  addBox(g, 0.76, 0.48, 0.06, 0x322b3d, 3.3, 1.16, 4.05);
  addBox(g, 0.7, 0.42, 0.02, 0x7fd4ff, 3.3, 1.16, 4.01, { outline: false, shadow: false, mat: mon1Mat });
  addBox(g, 0.76, 0.48, 0.06, 0x322b3d, 4.25, 1.16, 4.05);
  addBox(g, 0.7, 0.42, 0.02, 0xffb3d9, 4.25, 1.16, 4.01, { outline: false, shadow: false, mat: mon2Mat });
  addBox(g, 0.5, 0.52, 0.5, 0x7ec8ff, 3.3, 0.36, 3.12);
  addBox(g, 0.5, 0.52, 0.5, 0xffa6c9, 4.25, 0.36, 3.12);
  registerInteractive('pc_desk', '双人电脑桌（唤醒/休眠）', g, (st) => {
    const on = st === 'on';
    mon1Mat.color.setHex(on ? 0x7fd4ff : 0x262130);
    mon2Mat.color.setHex(on ? 0xffb3d9 : 0x262130);
  });
}

// 书房台灯
{
  const g = new THREE.Group();
  apartment.add(g);
  addCyl(g, 0.12, 0.15, 0.06, 12, 0x5c6882, 4.88, 0.86, 3.85);
  addCyl(g, 0.03, 0.03, 0.55, 8, 0x5c6882, 4.88, 1.15, 3.85);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xe6f3ff });
  addBox(g, 0.34, 0.07, 0.14, 0xe6f3ff, 4.74, 1.42, 3.85, { mat: headMat });
  const light = new THREE.PointLight(0xd9ecff, 1.1, 6.2);
  light.position.set(4.65, 1.35, 3.65);
  apartment.add(light);
  ROOM_LIGHTS.push({ light, isOn: () => currentObjects.study_lamp?.state === 'on', max: 1.35 });
  registerInteractive('study_lamp', '书房护眼台灯（开关灯光）', g, (st) => {
    headMat.color.setHex(st === 'on' ? 0xe6f3ff : 0x9aa3b2);
  });
}

// 黑胶音响
let vinylDisc = null;
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.72, 0.68, 0.52, 0xd9a87c, 1.75, 0.42, 3.9);
  vinylDisc = addCyl(g, 0.22, 0.22, 0.03, 18, 0x2d2436, 1.75, 0.79, 3.9);
  addCyl(g, 0.07, 0.07, 0.04, 12, 0xff7aa8, 1.75, 0.8, 3.9);
  registerInteractive('music_player', '黑胶音响（播放/暂停音乐）', g, () => {});
}

// 漫画书架
{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.44, 2.05, 1.85, 0xe3be96, 5.62, 1.1, 1.65);
  const bookColors = [0xff8eb4, 0x7cc8ff, 0xffe07d, 0x90e0a8, 0xc3a6ff];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 6; i++) {
      addBox(g, 0.28, 0.34, 0.22, bookColors[(row + i) % bookColors.length], 5.54, 0.44 + row * 0.45, 0.9 + i * 0.28, { outline: false });
    }
  }
  registerInteractive('bookshelf', '漫画书架（翻看漫画）', g, () => {});
}

// 厨房：料理台 & 咖啡机 & 冰箱 & 吊灯
let coffeeSteam = null;
{
  addBox(apartment, 2.6, 0.86, 0.68, 0xf7fbf9, -3.5, 0.51, 4.02);
  addBox(apartment, 2.64, 0.08, 0.72, 0xddebe3, -3.5, 0.96, 4.02);
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.44, 0.42, 0.36, 0xff8a9d, -3.2, 1.21, 4.0);
  addCyl(g, 0.08, 0.06, 0.14, 12, 0xffffff, -3.2, 1.08, 3.82);
  coffeeSteam = addCyl(g, 0.05, 0.12, 0.45, 10, 0xffffff, -3.2, 1.52, 3.82, {
    outline: false,
    shadow: false,
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
  });
  coffeeSteam.visible = false;
  registerInteractive('coffee_maker', '意式咖啡机（煮拿铁/端走咖啡）', g, (st) => {
    coffeeSteam.visible = st === 'brewing';
  });
}

{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.88, 1.92, 0.74, 0xe8f6f2, -5.4, 1.04, 3.9);
  const door = addBox(g, 0.42, 1.82, 0.06, 0xdbf0eb, -5.18, 1.04, 3.51);
  registerInteractive('fridge', '双开门冰箱（打开拿饮料/关门）', g, (st) => {
    door.rotation.y = st === 'open' ? -0.95 : 0;
    door.position.x = st === 'open' ? -4.98 : -5.18;
    door.position.z = st === 'open' ? 3.34 : 3.51;
  });
}

{
  const g = new THREE.Group();
  apartment.add(g);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  addCyl(g, 0.14, 0.28, 0.22, 14, 0xfff3c4, -3.9, 2.35, 2.9, { outline: true, mat: bulbMat });
  const light = new THREE.PointLight(0xfff0c7, 1.1, 6.2);
  light.position.set(-3.9, 2.2, 2.9);
  apartment.add(light);
  ROOM_LIGHTS.push({ light, isOn: () => currentObjects.kitchen_lamp?.state === 'on', max: 1.3 });
  registerInteractive('kitchen_lamp', '厨房吊灯（开关灯光）', g, (st) => {
    bulbMat.color.setHex(st === 'on' ? 0xfff3c4 : 0xbfc5c2);
  });
}

// 卫生间：洗手台 + 环形补光镜 + 玻璃淋浴房
{
  addBox(apartment, 1.05, 0.8, 0.52, 0xf2fbfe, -0.2, 0.48, 4.12);
  addBox(apartment, 0.92, 1.95, 1.05, 0xbcecff, -1.42, 1.05, 3.8, { outline: true, shadow: false, mat: glassMat });
  const g = new THREE.Group();
  apartment.add(g);
  const mirrorMat = new THREE.MeshBasicMaterial({ color: 0xbfefff });
  addCyl(g, 0.38, 0.38, 0.06, 20, 0xbfefff, -0.2, 1.48, 4.34, { outline: true, mat: mirrorMat });
  g.children[0].rotation.x = Math.PI / 2;
  const light = new THREE.PointLight(0xd9f7ff, 0, 5.2);
  light.position.set(-0.2, 1.48, 3.8);
  apartment.add(light);
  ROOM_LIGHTS.push({ light, isOn: () => currentObjects.bathroom_mirror?.state === 'on', max: 1.2 });
  registerInteractive('bathroom_mirror', '浴室补光镜灯（开关镜灯）', g, (st) => {
    mirrorMat.color.setHex(st === 'on' ? 0xffffff : 0x9ec5d4);
  });
}

// 阳台：绿植角 + 藤编躺椅
let plantSparkle = null;
{
  const g = new THREE.Group();
  apartment.add(g);
  for (const [px, pz, r] of [[-5.3, -5.6, 0.34], [-4.7, -5.5, 0.28], [-5.0, -5.1, 0.24]]) {
    addCyl(g, 0.16, 0.13, 0.28, 12, 0xdc936d, px, 0.22, pz);
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), toonMat(0x70cf86));
    bush.position.set(px, 0.56, pz);
    bush.castShadow = true;
    bush.add(new THREE.LineSegments(new THREE.EdgesGeometry(bush.geometry, 25), OUTLINE_MAT));
    g.add(bush);
  }
  plantSparkle = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: 0x7ce8ff }));
  plantSparkle.position.set(-5.0, 1.05, -5.4);
  plantSparkle.visible = false;
  g.add(plantSparkle);
  registerInteractive('balcony_plants', '阳台绿植角（浇水）', g, (st) => {
    plantSparkle.visible = st === 'watered';
  });
}

{
  const g = new THREE.Group();
  apartment.add(g);
  addBox(g, 0.85, 0.34, 1.25, 0xe8c496, -0.6, 0.25, -5.45);
  addBox(g, 0.85, 0.45, 0.18, 0xffc6d9, -0.6, 0.54, -4.92);
  addCyl(apartment, 0.28, 0.26, 0.44, 14, 0xf7e9d7, -1.5, 0.3, -5.5);
  registerInteractive('balcony_chair', '阳台藤编躺椅（吹风看风景）', g, () => {});
}

// ============================================================
// 6. 2D 桌宠 3D Billboard（Y 轴朝向摄像头旋转）
// ============================================================
const figureRenderer = new Pet2DFigureRenderer(document.getElementById('offscreen-figure-stage'));
const petTexture = new THREE.CanvasTexture(figureRenderer.outputCanvas);
petTexture.colorSpace = THREE.SRGBColorSpace;

const petGroup = new THREE.Group();
petGroup.position.set(-2.8, 0.08, -1.6);
apartment.add(petGroup);

const petShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.42, 24),
  new THREE.MeshBasicMaterial({ color: 0x3b2c43, transparent: true, opacity: 0.22, depthWrite: false })
);
petShadow.rotation.x = -Math.PI / 2;
petShadow.position.y = 0.015;
petGroup.add(petShadow);

const petPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1.28, 1.28),
  new THREE.MeshBasicMaterial({ map: petTexture, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide })
);
petPlane.position.y = 0.64;
petPlane.userData = { isPet: true, label: '桌宠（点击戳一戳 / 拖动摸摸头）' };
petGroup.add(petPlane);

// ============================================================
// 7. 碰撞系统（墙体 + 家具 AABB + 关门阻挡 + 防卡门保护）
// ============================================================
let currentRooms = {};
let currentObjects = {};
let wallSegments = [];
let furnitureColliders = [];
let viewMode = 'god';
let timeMode = params.get('hour') ? 'custom' : 'system';
let customHour = params.get('hour') ? Number(params.get('hour')) : 16.5;
let petWaypoints = [];
let petRun = false;
let petDoorWaitUntil = 0;
let bubbleTimer = null;

const indoorPlayer = {
  pos: new THREE.Vector3(-0.6, 1.55, -0.2),
  yaw: 0.55,
  pitch: -0.06,
  waypoints: [],
  doorWaitUntil: 0,
  keys: new Set(),
  dragging: false,
  lastX: 0,
  lastY: 0,
};

function pushCircleOutOfAABB(pos, r, minX, maxX, minZ, maxZ) {
  const cx = Math.max(minX, Math.min(pos.x, maxX));
  const cz = Math.max(minZ, Math.min(pos.z, maxZ));
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const distSq = dx * dx + dz * dz;
  if (distSq >= r * r) return;

  if (distSq > 1e-6) {
    const dist = Math.sqrt(distSq);
    const push = r - dist;
    pos.x += (dx / dist) * push;
    pos.z += (dz / dist) * push;
  } else {
    // 若圆心意外进入矩形内部，沿最短轴平滑推出，避免卡死
    const dLeft = Math.abs(pos.x - minX);
    const dRight = Math.abs(maxX - pos.x);
    const dTop = Math.abs(pos.z - minZ);
    const dBot = Math.abs(maxZ - pos.z);
    const m = Math.min(dLeft, dRight, dTop, dBot);
    if (m === dLeft) pos.x = minX - r;
    else if (m === dRight) pos.x = maxX + r;
    else if (m === dTop) pos.z = minZ - r;
    else pos.z = maxZ + r;
  }
}

function pushCircleOutOfSegment(pos, r, seg) {
  const halfT = 0.09;
  const minX = Math.min(seg.x0, seg.x1) - halfT;
  const maxX = Math.max(seg.x0, seg.x1) + halfT;
  const minZ = Math.min(seg.z0, seg.z1) - halfT;
  const maxZ = Math.max(seg.z0, seg.z1) + halfT;
  pushCircleOutOfAABB(pos, r, minX, maxX, minZ, maxZ);
}

/**
 * 玩家滑动碰撞解算（带防卡门保护）：
 * - 门只要打开进度 >= 0.35，门碰撞完全取消，保证顺畅通过绝不夹人；
 * - 门关闭时才形成门洞阻挡，点击或按 E 打开即可通行。
 */
function resolvePlayerCollision(pos, radius = 0.28) {
  // 外围边界（允许在阳台范围内向北延伸至 -6.0）
  pos.x = Math.max(-5.7, Math.min(5.7, pos.x));
  const maxNorth = pos.x <= 0.72 ? -5.98 : -4.22;
  pos.z = Math.max(maxNorth, Math.min(4.2, pos.z));

  for (let pass = 0; pass < 2; pass++) {
    for (const seg of wallSegments) {
      pushCircleOutOfSegment(pos, radius, seg);
    }
    for (const box of furnitureColliders) {
      pushCircleOutOfAABB(pos, radius, box.minX, box.maxX, box.minZ, box.maxZ);
    }
    for (const rig of DOOR_RIGS.values()) {
      // 仅在门真正处于关闭状态时生效；开着或正在打开时绝不阻挡
      if (rig.progress < 0.35) {
        const halfW = rig.width / 2;
        if (rig.axis === 'x') {
          pushCircleOutOfAABB(pos, radius, rig.centerX - halfW, rig.centerX + halfW, rig.centerZ - 0.1, rig.centerZ + 0.1);
        } else {
          pushCircleOutOfAABB(pos, radius, rig.centerX - 0.1, rig.centerX + 0.1, rig.centerZ - halfW, rig.centerZ + halfW);
        }
      }
    }
  }
}

/**
 * 防卡门安全检查：当玩家或桌宠正站在门洞安全区内（< 0.78m），禁止把门关上夹人。
 */
function isAnyoneInDoorway(rig) {
  const dPet = Math.hypot(petGroup.position.x - rig.centerX, petGroup.position.z - rig.centerZ);
  const dUser =
    viewMode === 'indoor'
      ? Math.hypot(indoorPlayer.pos.x - rig.centerX, indoorPlayer.pos.z - rig.centerZ)
      : Infinity;
  return dPet < 0.75 || dUser < 0.78;
}

function findClosedDoorAhead(fromPos, toPos, threshold = 0.92) {
  for (const rig of DOOR_RIGS.values()) {
    if (rig.progress >= 0.65) continue;
    const dFrom = Math.hypot(fromPos.x - rig.centerX, fromPos.z - rig.centerZ);
    const dMid = Math.hypot((fromPos.x + toPos.x) * 0.5 - rig.centerX, (fromPos.z + toPos.z) * 0.5 - rig.centerZ);
    if (dFrom < threshold || dMid < threshold * 0.85) return rig;
  }
  return null;
}

// ============================================================
// 8. WebSocket 同步与交互事件
// ============================================================
let ws = null;
function sendWs(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function addFeed(text) {
  const feed = document.getElementById('event-feed');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = 'item';
  div.textContent = text;
  feed.prepend(div);
  while (feed.children.length > 18) feed.lastChild.remove();
}

function showBubble(text, ms = 5500) {
  const el = document.getElementById('pet-bubble');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => (el.style.display = 'none'), ms);
}

function applyObjectStates() {
  for (const [id, obj] of Object.entries(currentObjects)) {
    const fn = OBJECT_HANDLERS.get(id);
    if (fn) fn(obj.state);
  }
}

function renderRoomButtons(petRoomId) {
  const grid = document.getElementById('room-grid');
  const badge = document.getElementById('pet-room-badge');
  if (!grid) return;
  if (badge && currentRooms[petRoomId]) badge.textContent = currentRooms[petRoomId].name;
  grid.innerHTML = '';
  for (const room of Object.values(currentRooms)) {
    const btn = document.createElement('button');
    btn.className = `room-chip ${room.id === petRoomId ? 'pet-here' : ''}`;
    btn.textContent = room.id === petRoomId ? `● ${room.name}` : room.name;
    btn.onclick = () => {
      sendWs({ type: 'user_call_pet', room: room.id, run: false });
      addFeed(`呼叫桌宠前往【${room.name}】`);
    };
    grid.appendChild(btn);
  }
}

function updateSyncBanner(figure) {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!dot || !label) return;
  if (figure?.connected) {
    dot.classList.add('synced');
    label.textContent = `已同步 Coopanion 当前模型：${figure.figureName}`;
  } else {
    dot.classList.remove('synced');
    label.textContent = '离线二次元形象演示（启动 Coopanion 后自动同步当前模型）';
  }
}

function tryToggleDoorOrObject(id, actor = 'user') {
  const rig = DOOR_RIGS.get(id);
  if (rig && currentObjects[id]?.state === 'open' && isAnyoneInDoorway(rig)) {
    addFeed(`防卡门保护：门口有人或桌宠，${currentObjects[id].name}保持开启`);
    return;
  }
  sendWs({ type: 'interact_object', objectId: id, action: 'toggle', actor });
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => addFeed('已连接到本地 3D 公寓服务（真实户型）');
  ws.onclose = () => setTimeout(connectWs, 2500);

  ws.onmessage = async (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    if (msg.type === 'init' && msg.state) {
      const st = msg.state;
      currentRooms = st.rooms || {};
      currentObjects = st.objects || {};
      wallSegments = st.walls || [];
      furnitureColliders = st.colliders || [];
      applyObjectStates();
      // 初始化门进度直接与状态一致
      for (const rig of DOOR_RIGS.values()) {
        rig.progress = rig.targetOpen;
      }
      if (st.pet) {
        petGroup.position.set(st.pet.x, 0.08, st.pet.z);
        renderRoomButtons(st.pet.room);
      }
      if (st.time && !params.get('hour')) {
        timeMode = st.time.mode || 'system';
        customHour = st.time.hour ?? 16.5;
        syncTimeButtons();
      }
      if (st.figure) {
        updateSyncBanner(st.figure);
        await figureRenderer.syncNativeFigure(st.figure);
      }
    } else if (msg.type === 'figure_sync' && msg.figure) {
      updateSyncBanner(msg.figure);
      await figureRenderer.syncNativeFigure(msg.figure);
      addFeed(`模型同步更新：${msg.figure.figureName}`);
    } else if (msg.type === 'pet_move') {
      petWaypoints = Array.isArray(msg.waypoints) ? msg.waypoints.slice() : [];
      petRun = Boolean(msg.run);
    } else if (msg.type === 'user_path') {
      indoorPlayer.waypoints = Array.isArray(msg.waypoints) ? msg.waypoints.slice() : [];
    } else if (msg.type === 'pet_act') {
      figureRenderer.triggerAction(msg.action, msg.durationSec || 4);
    } else if (msg.type === 'pet_say') {
      showBubble(msg.text);
      figureRenderer.triggerAction(msg.mood === 'shy' ? 'shy' : 'happy', 3.5);
      addFeed(`Coo：${msg.text}`);
    } else if (msg.type === 'object_update' && msg.object) {
      currentObjects[msg.object.id] = msg.object;
      applyObjectStates();
      addFeed(`${msg.actor === 'pet' ? 'Coo ' : '你'}${msg.description}`);
    } else if (msg.type === 'time_update' && msg.time) {
      timeMode = msg.time.mode;
      customHour = msg.time.hour;
      syncTimeButtons();
    }
  };
}
connectWs();

// ============================================================
// 9. 昼夜光照与双视角控制
// ============================================================
function getEffectiveHour() {
  if (timeMode === 'system') {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  }
  return customHour;
}

function formatHourText(h) {
  const n = ((h % 24) + 24) % 24;
  const hh = String(Math.floor(n)).padStart(2, '0');
  const mm = String(Math.floor((n - Math.floor(n)) * 60)).padStart(2, '0');
  let p = '深夜';
  if (n >= 5 && n < 9) p = '清晨';
  else if (n >= 9 && n < 12) p = '上午';
  else if (n >= 12 && n < 14) p = '中午';
  else if (n >= 14 && n < 17.5) p = '午后';
  else if (n >= 17.5 && n < 20) p = '黄昏';
  else if (n >= 20 && n < 23) p = '夜晚';
  return `${hh}:${mm}（${p}）`;
}

function updateLightingByHour(hour) {
  const angle = ((hour - 6) / 24) * Math.PI * 2;
  const sunY = Math.sin(angle);
  const sunX = Math.cos(angle);
  const daylight = Math.max(0, Math.min(1, (sunY + 0.15) / 0.85));
  const dusk = Math.max(0, 1 - Math.abs(sunY - 0.08) * 3.5);

  scene.background = new THREE.Color(0x1b2240)
    .lerp(new THREE.Color(0xbce3ff), daylight)
    .lerp(new THREE.Color(0xffb48a), dusk * 0.65);

  sunLight.position.set(sunX * 18, Math.max(4, sunY * 18), 9);
  sunLight.color.setHex(dusk > 0.35 ? 0xffb982 : daylight > 0.25 ? 0xfff4e0 : 0x7a9cff);
  sunLight.intensity = daylight > 0.1 ? 0.6 + daylight * 0.95 : 0.32;
  hemiLight.intensity = 0.35 + daylight * 0.55;
  hemiLight.color.setHex(daylight > 0.2 ? 0xfff6eb : 0x6f84c4);

  sunOrb.position.set(sunX * 36, sunY * 30, -24);
  sunOrb.visible = sunY > -0.15;
  moonOrb.position.set(-sunX * 36, -sunY * 30, -24);
  moonOrb.visible = sunY <= 0.05;
  starMat.opacity = Math.max(0, 0.9 - daylight * 1.4);

  const lampBoost = 0.45 + (1 - daylight) * 0.95;
  for (const rl of ROOM_LIGHTS) rl.light.intensity = rl.isOn() ? rl.max * lampBoost : 0;

  const labelEl = document.getElementById('time-label');
  if (labelEl) labelEl.textContent = formatHourText(hour);
  const sliderEl = document.getElementById('time-slider');
  if (sliderEl && timeMode === 'system') sliderEl.value = hour.toFixed(2);
}

function syncTimeButtons() {
  document.getElementById('btn-time-system')?.classList.toggle('active', timeMode === 'system');
  document.getElementById('btn-time-custom')?.classList.toggle('active', timeMode === 'custom');
  const slider = document.getElementById('time-slider');
  if (slider && timeMode === 'custom') slider.value = customHour.toFixed(2);
}

function setViewMode(mode) {
  viewMode = mode === 'indoor' ? 'indoor' : 'god';
  document.getElementById('btn-view-god')?.classList.toggle('active', viewMode === 'god');
  document.getElementById('btn-view-indoor')?.classList.toggle('active', viewMode === 'indoor');

  const isIndoor = viewMode === 'indoor';
  controls.enabled = !isIndoor;
  ceilingMesh.visible = isIndoor;
  roomBadgeGroup.visible = !isIndoor;

  if (isIndoor) {
    Object.values(outerWallGroups).forEach((g) => (g.visible = true));
    // 站到过道中央偏客厅的安全空位，面向桌宠
    indoorPlayer.pos.set(-0.6, 1.55, -0.35);
    resolvePlayerCollision(indoorPlayer.pos, 0.28);
    indoorPlayer.yaw = Math.atan2(
      indoorPlayer.pos.x - petGroup.position.x,
      indoorPlayer.pos.z - petGroup.position.z
    );
    indoorPlayer.pitch = -0.12;
    indoorPlayer.waypoints = [];
  } else {
    camera.position.set(-10.8, 12.0, 12.8);
    controls.target.set(0, 0.5, -0.5);
    controls.update();
  }
  sendWs({ type: 'view_mode', viewMode });
}

function updateDynamicCutawayWalls() {
  if (viewMode === 'indoor') return;
  const cx = camera.position.x;
  const cz = camera.position.z;
  outerWallGroups.south.visible = cz < 2.2;
  outerWallGroups.north.visible = cz > -2.2;
  outerWallGroups.west.visible = cx > -2.5;
  outerWallGroups.east.visible = cx < 2.5;
}

// ============================================================
// 10. 鼠标与键盘交互（含按 E 快捷开关最近的门）
// ============================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = document.getElementById('hover-tooltip');
let downPos = { x: 0, y: 0 };
let patAccum = 0;

function updatePointer(ev) {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
}

renderer.domElement.addEventListener('pointerdown', (ev) => {
  downPos = { x: ev.clientX, y: ev.clientY };
  if (viewMode === 'indoor' && ev.button === 0) {
    indoorPlayer.dragging = true;
    indoorPlayer.lastX = ev.clientX;
    indoorPlayer.lastY = ev.clientY;
  }
});

renderer.domElement.addEventListener('pointermove', (ev) => {
  if (viewMode === 'indoor' && indoorPlayer.dragging) {
    const dx = ev.clientX - indoorPlayer.lastX;
    const dy = ev.clientY - indoorPlayer.lastY;
    indoorPlayer.lastX = ev.clientX;
    indoorPlayer.lastY = ev.clientY;
    indoorPlayer.yaw -= dx * 0.0045;
    indoorPlayer.pitch = Math.max(-0.85, Math.min(0.75, indoorPlayer.pitch - dy * 0.004));
    return;
  }

  updatePointer(ev);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([petPlane, ...INTERACTIVE_MESHES], false);
  if (hits.length > 0) {
    const hitObj = hits[0].object;
    renderer.domElement.style.cursor = 'pointer';
    tooltip.textContent = hitObj.userData.label || '';
    tooltip.style.left = `${ev.clientX + 14}px`;
    tooltip.style.top = `${ev.clientY - 10}px`;
    tooltip.style.display = 'block';

    if (hitObj.userData.isPet) {
      patAccum += Math.hypot(ev.movementX, ev.movementY);
      if (patAccum > 160) {
        patAccum = 0;
        figureRenderer.triggerAction('happy', 3.5);
        sendWs({ type: 'pet_touch', kind: 'pet' });
      }
    }
  } else {
    renderer.domElement.style.cursor = viewMode === 'indoor' ? 'grab' : 'default';
    tooltip.style.display = 'none';
    patAccum = 0;
  }
});

renderer.domElement.addEventListener('pointerup', (ev) => {
  indoorPlayer.dragging = false;
  if (Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y) > 6) return;

  updatePointer(ev);
  raycaster.setFromCamera(pointer, camera);

  if (raycaster.intersectObject(petPlane, false).length > 0) {
    figureRenderer.triggerAction('shy', 3.5);
    sendWs({ type: 'pet_touch', kind: 'poke' });
    addFeed('你戳了戳桌宠~');
    return;
  }

  const furnHits = raycaster.intersectObjects(INTERACTIVE_MESHES, false);
  if (furnHits.length > 0) {
    tryToggleDoorOrObject(furnHits[0].object.userData.objectId, 'user');
    return;
  }

  // 室内视角点击地板 → 向后端请求真实 A* 路径，按过程一步步走过去
  if (viewMode === 'indoor') {
    const floorHits = raycaster.intersectObjects(FLOOR_CLICK_MESHES, false);
    if (floorHits.length > 0) {
      const pt = floorHits[0].point;
      sendWs({ type: 'user_request_path', x: pt.x, z: pt.z });
    }
  }
});

window.addEventListener('keydown', (ev) => {
  if (document.activeElement?.tagName === 'INPUT') return;
  indoorPlayer.keys.add(ev.code);
  // 按 E 键快捷开关身边最近的一扇门
  if (ev.code === 'KeyE' && viewMode === 'indoor') {
    let best = null;
    let bestDist = 2.0;
    for (const rig of DOOR_RIGS.values()) {
      const d = Math.hypot(indoorPlayer.pos.x - rig.centerX, indoorPlayer.pos.z - rig.centerZ);
      if (d < bestDist) {
        bestDist = d;
        best = rig;
      }
    }
    if (best) tryToggleDoorOrObject(best.id, 'user');
  }
});
window.addEventListener('keyup', (ev) => indoorPlayer.keys.delete(ev.code));

// UI 按钮
document.getElementById('btn-view-god').onclick = () => setViewMode('god');
document.getElementById('btn-view-indoor').onclick = () => setViewMode('indoor');
document.getElementById('btn-reset-cam').onclick = () => setViewMode('god');
document.getElementById('btn-time-system').onclick = () => {
  timeMode = 'system';
  syncTimeButtons();
  sendWs({ type: 'set_time', mode: 'system' });
};
document.getElementById('btn-time-custom').onclick = () => {
  timeMode = 'custom';
  syncTimeButtons();
  sendWs({ type: 'set_time', mode: 'custom', hour: customHour, speed: 0 });
};
document.getElementById('time-slider').oninput = (e) => {
  timeMode = 'custom';
  customHour = Number(e.target.value);
  syncTimeButtons();
  sendWs({ type: 'set_time', mode: 'custom', hour: customHour, speed: 0 });
};
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.onclick = () => {
    timeMode = 'custom';
    customHour = Number(btn.dataset.hour);
    syncTimeButtons();
    sendWs({ type: 'set_time', mode: 'custom', hour: customHour, speed: 0 });
  };
});
document.querySelectorAll('.mini-btn').forEach((btn) => {
  btn.onclick = () => {
    const act = btn.dataset.act;
    if (act === 'pat') {
      figureRenderer.triggerAction('happy', 3.5);
      sendWs({ type: 'pet_touch', kind: 'pet' });
      addFeed('你温柔地摸了摸桌宠的头');
    } else if (act === 'poke') {
      figureRenderer.triggerAction('shy', 3.5);
      sendWs({ type: 'pet_touch', kind: 'poke' });
      addFeed('你戳了一下桌宠');
    } else {
      figureRenderer.triggerAction(act, 4.5);
    }
  };
});
document.getElementById('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addFeed(`你：${text}`);
  sendWs({ type: 'user_chat', text });
};

const hintEl = document.getElementById('hint-pill');
if (hintEl) {
  hintEl.textContent =
    '上帝视角：左键 360° 旋转、滚轮缩放；室内视角：WASD 或点击地板按真实路径行走，点击房门或按 E 开关门（可开着不关，带碰撞与防卡门保护）。';
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// 11. 主循环：门平滑动画 + 桌宠真实移动开门过程 + 玩家碰撞移动
// ============================================================
const clock = new THREE.Clock();
let lastPetSyncAt = 0;
let lastUserSyncAt = 0;

function detectLocalRoom(x, z) {
  for (const r of Object.values(currentRooms)) {
    const b = r.bounds;
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return r.id;
  }
  return 'living_room';
}

function stepDoors(dt) {
  for (const rig of DOOR_RIGS.values()) {
    // 若正在尝试关门但有人/桌宠站在门口，防夹自动保持打开
    if (rig.targetOpen === 0 && rig.progress > 0.35 && isAnyoneInDoorway(rig)) {
      rig.targetOpen = 1;
    }
    const diff = rig.targetOpen - rig.progress;
    if (Math.abs(diff) > 0.004) {
      rig.progress += Math.sign(diff) * Math.min(Math.abs(diff), dt * 2.2);
    } else {
      rig.progress = rig.targetOpen;
    }

    if (rig.type === 'hinge') {
      rig.pivot.rotation.y = rig.progress * (Math.PI * 0.48) * rig.swingSign;
    } else {
      rig.leaf.position.x = rig.progress * rig.slideDist;
    }
  }
}

function stepPetMovement(dt) {
  if (petWaypoints.length === 0) {
    figureRenderer.setMovement(false, figureRenderer.facing);
    return;
  }
  const now = performance.now();
  if (now < petDoorWaitUntil) {
    figureRenderer.setMovement(false, figureRenderer.facing);
    return;
  }

  const target = petWaypoints[0];
  // 检查前方是否有还没打开的门 → 停顿开门再通过
  const closedDoor = findClosedDoorAhead(petGroup.position, target, 0.95);
  if (closedDoor) {
    if (currentObjects[closedDoor.id]?.state !== 'open') {
      figureRenderer.triggerAction('wave', 1.2);
      sendWs({ type: 'interact_object', objectId: closedDoor.id, action: 'open', actor: 'pet' });
      petDoorWaitUntil = now + 520;
    }
    figureRenderer.setMovement(false, figureRenderer.facing);
    return;
  }

  const dx = target.x - petGroup.position.x;
  const dz = target.z - petGroup.position.z;
  const dist = Math.hypot(dx, dz);
  const speed = petRun ? 2.9 : 1.55;

  if (dist < 0.08) {
    petGroup.position.x = target.x;
    petGroup.position.z = target.z;
    petWaypoints.shift();
    if (petWaypoints.length === 0) {
      figureRenderer.setMovement(false, figureRenderer.facing);
      renderRoomButtons(detectLocalRoom(petGroup.position.x, petGroup.position.z));
      sendWs({ type: 'pet_position_sync', x: petGroup.position.x, z: petGroup.position.z, moving: false });
    }
  } else {
    const step = Math.min(dist, speed * dt);
    petGroup.position.x += (dx / dist) * step;
    petGroup.position.z += (dz / dist) * step;
    figureRenderer.setMovement(true, dx >= 0 ? 1 : -1, petRun);
    if (now - lastPetSyncAt > 280) {
      lastPetSyncAt = now;
      renderRoomButtons(detectLocalRoom(petGroup.position.x, petGroup.position.z));
      sendWs({ type: 'pet_position_sync', x: petGroup.position.x, z: petGroup.position.z, moving: true });
    }
  }
}

function stepIndoorPlayer(dt) {
  if (viewMode !== 'indoor') return;
  const now = performance.now();
  const speed = 2.8 * dt;
  const fwd = new THREE.Vector3(-Math.sin(indoorPlayer.yaw), 0, -Math.cos(indoorPlayer.yaw));
  const right = new THREE.Vector3(Math.cos(indoorPlayer.yaw), 0, -Math.sin(indoorPlayer.yaw));
  let moved = false;

  if (indoorPlayer.keys.has('KeyW') || indoorPlayer.keys.has('ArrowUp')) {
    indoorPlayer.pos.addScaledVector(fwd, speed);
    indoorPlayer.waypoints = [];
    moved = true;
  }
  if (indoorPlayer.keys.has('KeyS') || indoorPlayer.keys.has('ArrowDown')) {
    indoorPlayer.pos.addScaledVector(fwd, -speed);
    indoorPlayer.waypoints = [];
    moved = true;
  }
  if (indoorPlayer.keys.has('KeyA') || indoorPlayer.keys.has('ArrowLeft')) {
    indoorPlayer.pos.addScaledVector(right, -speed);
    indoorPlayer.waypoints = [];
    moved = true;
  }
  if (indoorPlayer.keys.has('KeyD') || indoorPlayer.keys.has('ArrowRight')) {
    indoorPlayer.pos.addScaledVector(right, speed);
    indoorPlayer.waypoints = [];
    moved = true;
  }

  // 点击地板后的真实过程移动（遇关着的门会先自动推开再通过）
  if (!moved && indoorPlayer.waypoints.length > 0 && now >= indoorPlayer.doorWaitUntil) {
    const wp = indoorPlayer.waypoints[0];
    const closedDoor = findClosedDoorAhead(indoorPlayer.pos, wp, 0.95);
    if (closedDoor) {
      if (currentObjects[closedDoor.id]?.state !== 'open') {
        sendWs({ type: 'interact_object', objectId: closedDoor.id, action: 'open', actor: 'user' });
        indoorPlayer.doorWaitUntil = now + 480;
      }
    } else {
      const dx = wp.x - indoorPlayer.pos.x;
      const dz = wp.z - indoorPlayer.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) {
        indoorPlayer.waypoints.shift();
      } else {
        const s = Math.min(d, 2.35 * dt);
        indoorPlayer.pos.x += (dx / d) * s;
        indoorPlayer.pos.z += (dz / d) * s;
        moved = true;
      }
    }
  }

  resolvePlayerCollision(indoorPlayer.pos, 0.28);

  camera.position.copy(indoorPlayer.pos);
  const lookDir = new THREE.Vector3(
    -Math.sin(indoorPlayer.yaw) * Math.cos(indoorPlayer.pitch),
    Math.sin(indoorPlayer.pitch),
    -Math.cos(indoorPlayer.yaw) * Math.cos(indoorPlayer.pitch)
  );
  camera.lookAt(indoorPlayer.pos.clone().add(lookDir));

  if (moved && now - lastUserSyncAt > 300) {
    lastUserSyncAt = now;
    sendWs({ type: 'user_move', x: indoorPlayer.pos.x, z: indoorPlayer.pos.z, viewMode: 'indoor' });
  }
}

function updateBubbleScreenPos() {
  const el = document.getElementById('pet-bubble');
  if (!el || el.style.display === 'none') return;
  const worldPos = petGroup.position.clone().add(new THREE.Vector3(0, 1.48, 0));
  worldPos.project(camera);
  el.style.left = `${(worldPos.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-worldPos.y * 0.5 + 0.5) * window.innerHeight}px`;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  stepDoors(dt);

  if (viewMode === 'god') {
    controls.update();
    updateDynamicCutawayWalls();
  } else {
    stepIndoorPlayer(dt);
  }

  stepPetMovement(dt);

  try {
    figureRenderer.step(dt);
    petTexture.needsUpdate = true;
  } catch (err) {
    console.warn('[coo-room] 角色渲染步进异常:', err?.message || err);
  }
  petPlane.rotation.y = Math.atan2(
    camera.position.x - petGroup.position.x,
    camera.position.z - petGroup.position.z
  );

  if (vinylDisc && currentObjects.music_player?.state === 'playing') vinylDisc.rotation.y += dt * 2.2;
  if (coffeeSteam && coffeeSteam.visible) coffeeSteam.position.y = 1.48 + Math.sin(clock.elapsedTime * 3.5) * 0.08;
  if (plantSparkle && plantSparkle.visible) {
    plantSparkle.rotation.y += dt * 2.5;
    plantSparkle.position.y = 1.05 + Math.sin(clock.elapsedTime * 4) * 0.06;
  }

  updateLightingByHour(getEffectiveHour());
  updateBubbleScreenPos();
  if (!contextLost) {
    renderer.render(scene, camera);
  }
}

window.addEventListener('pagehide', () => {
  figureRenderer.disposeNative();
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.close();
    } catch {}
  }
});

animate();
