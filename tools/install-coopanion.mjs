/**
 * 一键将 cortico-world-coo-room 安装到本机 Coopanion 扩展目录。
 * 用法：node tools/install-coopanion.mjs [可选:Coopanion数据目录路径]
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_NAME = 'cortico-world-coo-room';
const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function detectDataDir() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const locFile = path.join(localApp, 'Coopanion', 'data-location.json');
    if (fs.existsSync(locFile)) {
      try {
        const info = JSON.parse(fs.readFileSync(locFile, 'utf8'));
        if (typeof info?.data === 'string' && fs.existsSync(info.data)) return info.data;
      } catch {}
    }
    const candidate = path.join(localApp, 'Programs', 'Coopanion', 'data');
    if (fs.existsSync(candidate)) return candidate;
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Coopanion');
  } else {
    return path.join(os.homedir(), '.config', 'Coopanion');
  }
  return null;
}

const dataDir = detectDataDir();
if (!dataDir || !fs.existsSync(dataDir)) {
  console.error('未自动检测到 Coopanion 的 data 目录。');
  console.error('请手动传入路径，例如：');
  console.error('  node tools/install-coopanion.mjs "C:\\Users\\你的用户名\\AppData\\Local\\Programs\\Coopanion\\data"');
  process.exit(1);
}

const extDir = path.join(dataDir, 'extensions');
const vendorTarget = path.join(extDir, 'vendor', PKG_NAME);
const nmTarget = path.join(extDir, 'node_modules', PKG_NAME);
const extPkgPath = path.join(extDir, 'package.json');

fs.mkdirSync(path.dirname(vendorTarget), { recursive: true });
fs.mkdirSync(path.dirname(nmTarget), { recursive: true });

fs.rmSync(vendorTarget, { recursive: true, force: true });
fs.cpSync(SRC_DIR, vendorTarget, { recursive: true });

if (fs.existsSync(nmTarget)) fs.rmSync(nmTarget, { recursive: true, force: true });
try {
  fs.symlinkSync(vendorTarget, nmTarget, process.platform === 'win32' ? 'junction' : 'dir');
} catch {
  fs.cpSync(vendorTarget, nmTarget, { recursive: true });
}

let extPkg = { name: 'coopanion-extensions', private: true, dependencies: {} };
if (fs.existsSync(extPkgPath)) {
  fs.copyFileSync(extPkgPath, `${extPkgPath}.bak-coo-room`);
  extPkg = JSON.parse(fs.readFileSync(extPkgPath, 'utf8'));
  extPkg.dependencies = extPkg.dependencies || {};
}
extPkg.dependencies[PKG_NAME] = `link:vendor/${PKG_NAME}`;
fs.writeFileSync(extPkgPath, JSON.stringify(extPkg, null, 2) + '\n', 'utf8');

console.log(`安装完成！已写入：${vendorTarget}`);
console.log('接下来请重启 Coopanion，并在「World 扩展 → 我的 World」中启用「二次元3D公寓」。');
console.log('启用后打开 http://127.0.0.1:7890 即可进入 3D 两人套间。');
