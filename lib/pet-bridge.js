/**
 * Coopanion 本机桌宠服务桥接器（零依赖）：
 * - 自动扫描 127.0.0.1:7797–7805，发现运行中的 Coopanion 桌宠服务；
 * - 无 Origin 头部请求 /api/state 与 /api/figures，实时同步当前选用的 2D 模型（内置 Coo、大肥鱼或导入形象包）；
 * - 提供同源反代 /pet-proxy/web/*、/pet-proxy/packs/*、/pet-proxy/api/*，供 3D 网页在离屏画布中直接原样渲染当前模型。
 */

import http from 'node:http';

const DEFAULT_PORTS = [7797, 7798, 7799, 7800, 7801, 7802, 7803, 7804, 7805];

function httpGetJson(host, port, path, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: host, port, path, method: 'GET', timeout: timeoutMs },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

export class CoopanionPetBridge {
  constructor({ host = '127.0.0.1', preferredPort = 7797, onChange = null } = {}) {
    this.host = host;
    this.preferredPort = preferredPort;
    this.onChange = onChange;
    this.activePort = null;
    this.connected = false;
    this.timer = null;
    this.snapshot = {
      connected: false,
      petPort: null,
      figureId: 'coo',
      figureName: 'Coo（离线演示形象）',
      scheme: '',
      skin: null,
      theme: 'light',
      figureMeta: null,
      vocab: ['wave', 'happy', 'shy', 'sit', 'sleep', 'jump', 'think'],
      updatedAt: Date.now(),
    };
  }

  start(pollIntervalMs = 3000) {
    if (this.timer) return;
    void this.syncOnce();
    this.timer = setInterval(() => {
      void this.syncOnce();
    }, pollIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async discoverPort() {
    const candidates = [
      ...(this.activePort ? [this.activePort] : []),
      this.preferredPort,
      ...DEFAULT_PORTS.filter((p) => p !== this.preferredPort && p !== this.activePort),
    ];
    for (const port of candidates) {
      try {
        const state = await httpGetJson(this.host, port, '/api/state', 600);
        if (state && typeof state === 'object') {
          return { port, state };
        }
      } catch {
        // 端口未监听或非桌宠服务，继续扫描下一个
      }
    }
    return null;
  }

  async syncOnce() {
    const found = await this.discoverPort();
    if (!found) {
      const wasConnected = this.connected;
      this.connected = false;
      this.activePort = null;
      if (wasConnected) {
        this.snapshot = {
          ...this.snapshot,
          connected: false,
          petPort: null,
          updatedAt: Date.now(),
        };
        this.onChange?.(this.snapshot);
      }
      return this.snapshot;
    }

    const { port, state } = found;
    this.activePort = port;
    this.connected = true;

    let figuresData = null;
    try {
      figuresData = await httpGetJson(this.host, port, '/api/figures', 1000);
    } catch {
      figuresData = null;
    }

    const skin = state.skin ?? state.prefs?.skin ?? {};
    const figureId = skin.figure || 'coo';
    const scheme = skin.scheme || '';
    const theme = state.theme || state.prefs?.theme || 'light';

    const figureList = Array.isArray(figuresData)
      ? figuresData
      : Array.isArray(figuresData?.figures)
        ? figuresData.figures
        : [];
    const figureMeta = figureList.find((f) => f?.id === figureId) ?? null;

    const vocab = Array.isArray(figureMeta?.vocab)
      ? figureMeta.vocab.map((v) => (typeof v === 'string' ? v : v?.id)).filter(Boolean)
      : this.snapshot.vocab;

    const figureName =
      figureMeta?.name?.zh ||
      figureMeta?.name?.en ||
      (typeof figureMeta?.name === 'string' ? figureMeta.name : null) ||
      (figureId === 'whale' ? 'DeepSeek 大肥鱼' : figureId === 'coo' ? 'Coo' : figureId);

    const prevKey = JSON.stringify([
      this.snapshot.connected,
      this.snapshot.petPort,
      this.snapshot.figureId,
      this.snapshot.scheme,
      this.snapshot.theme,
      this.snapshot.skin,
    ]);

    this.snapshot = {
      connected: true,
      petPort: port,
      figureId,
      figureName,
      scheme,
      skin,
      theme,
      figureMeta,
      vocab,
      updatedAt: Date.now(),
    };

    const nextKey = JSON.stringify([
      this.snapshot.connected,
      this.snapshot.petPort,
      this.snapshot.figureId,
      this.snapshot.scheme,
      this.snapshot.theme,
      this.snapshot.skin,
    ]);

    if (prevKey !== nextKey) {
      this.onChange?.(this.snapshot);
    }
    return this.snapshot;
  }

  /**
   * 将 /pet-proxy/<targetPath> 透明代理到 Coopanion 本机桌宠服务（去除 Origin 头，保证同源离屏渲染可用）。
   */
  proxyRequest(req, res, targetPath) {
    if (!this.activePort) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Coopanion 桌宠服务未连接（请先启动 Coopanion）' }));
      return;
    }

    // 安全白名单：只允许代理形象渲染必需的只读资源路径
    const allowed =
      targetPath === '/api/state' ||
      targetPath === '/api/figures' ||
      targetPath.startsWith('/web/') ||
      targetPath.startsWith('/packs/');

    if (!allowed || req.method !== 'GET') {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '禁止访问该代理路径' }));
      return;
    }

    const upstream = http.request(
      {
        hostname: this.host,
        port: this.activePort,
        path: targetPath,
        method: 'GET',
        headers: {
          Accept: req.headers.accept || '*/*',
        },
        timeout: 5000,
      },
      (upRes) => {
        const headers = { ...upRes.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['access-control-allow-origin'];
        headers['cache-control'] = 'no-cache';
        res.writeHead(upRes.statusCode || 200, headers);
        upRes.pipe(res);
      }
    );

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `代理失败: ${err.message}` }));
      }
    });
    upstream.end();
  }
}
