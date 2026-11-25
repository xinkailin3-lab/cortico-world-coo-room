/**
 * 独立启动脚本：无需安装进 Coopanion 也能直接预览和试玩 3D 二次元套间。
 * 若本机同时运行着最新版 Coopanion，会自动通过 127.0.0.1:7797 同步当前选中的 2D 模型！
 *
 * 用法：node standalone.js
 */

import { CooRoomWorld } from './index.js';

const port = Number(process.env.COO_ROOM_PORT) || 7890;
const petPort = Number(process.env.COO_PET_PORT) || 7797;

const world = new CooRoomWorld({
  cfg: { port, petPort, timeMode: 'system' },
});

const url = await world.start({
  log: (_level, msg) => console.log(msg),
  emit: (evt) => {
    console.log(`[事件 → Coo] (${evt.type}) ${evt.text}`);
    // 独立演示模式下，收到聊天或互动时自动给出可爱回应，方便脱离 API Key 也能完整体验交互
    if (evt.type === 'coo-room.chat') {
      setTimeout(() => {
        world.server.broadcast({
          type: 'pet_say',
          text: '收到啦！我现在就在房间里陪你，试试点点家具或叫我去别的房间吧~',
          mood: 'happy',
        });
      }, 450);
    } else if (evt.type === 'coo-room.touch') {
      setTimeout(() => {
        world.server.broadcast({
          type: 'pet_say',
          text: '欸嘿~ 痒痒的！',
          mood: 'shy',
        });
      }, 250);
    }
  },
});

console.log('=======================================================');
console.log(` 二次元 3D 两人套间已运行：${url}`);
console.log(' 按 Ctrl+C 停止服务');
console.log('=======================================================');

process.on('SIGINT', async () => {
  await world.stop();
  process.exit(0);
});
