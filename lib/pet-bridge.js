/**
 * Coopanion 本机桌宠服务桥接器（零依赖）：
 * - 自动扫描 127.0.0.1:7797–7806，发现运行中的 Coopanion 桌宠服务；
 * - 无 Origin 头部请求 /api/state 与 /api/figures，实时同步当前选用的 2D 模型（内置 Coo、大肥鱼或导入形象包）；
 * - 提供同源反代 /pet-proxy/web/*、/pet-proxy/packs/*、/pet-proxy/api/*，供 3D 网页在离屏画布中直接原样渲染当前模型。
 */

import http from 'node:http';

const DEFAULT_PORTS = [7797, 7798, 7799, 7800, 7801, 7802, 7803, 7804, 7805, 7806];

const PROXY_IMAGE_MIMES = [
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.avif', 'image/avif'],
];

function httpGetJson(host, port, path, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = http.request(
        { hostname: host, port, path, method: 'GET', timeout: timeoutMs },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('error', reject);
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (err) {
              reject(err);
            }
          });
        }
      );
    } catch (err) {
      reject(err);
      return;
    }
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

function sanitizeProxyPath(rawTargetPath) {
  const raw = String(rawTargetPath || '');
  const qIndex = raw.indexOf('?');
  const rawPath = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const rawSearch = qIndex >= 0 ? raw.slice(qIndex) : '';

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return { ok: false, status: 400, error: '无效的代理路径编码' };
  }

  if (/[\x00-\x1f\x7f\\]/.test(decodedPath)) {
    return { ok: false, status: 403, error: '禁止访问该代理路径' };
  }

  const segments = decodedPath.split('/');
  if (segments.some((seg) => seg === '.' || seg === '..')) {
    return { ok: false, status: 403, error: '禁止访问该代理路径' };
  }

  const allowed =
    decodedPath === '/api/state' ||
    decodedPath === '/api/figures' ||
    decodedPath.startsWith('/web/') ||
    decodedPath.startsWith('/packs/');

  if (!allowed) {
    return { ok: false, status: 403, error: '禁止访问该代理路径' };
  }

  const encodedPath = segments.map((seg) => encodeURIComponent(seg)).join('/');
  let asciiPathAndSearch;
  try {
    const safeUrl = new URL(`http://127.0.0.1${encodedPath}${rawSearch}`);
    asciiPathAndSearch = safeUrl.pathname + safeUrl.search;
  } catch {
    return { ok: false, status: 400, error: '无效的代理查询参数' };
  }

  return {
    ok: true,
    decodedPath,
    upstreamPath: asciiPathAndSearch,
  };
}

function sendJsonError(res, status, error) {
  try {
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error }));
    } else if (!res.destroyed) {
      res.destroy();
    }
  } catch {}
}

export class CoopanionPetBridge {
  constructor({ host = '127.0.0.1', preferredPort = 7797, onChange = null } = {}) {
    this.host = host;
    this.preferredPort = preferredPort;
    this.onChange = onChange;
    this.activePort = null;
    this.connected = false;
    this.syncing = false;
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
        if (state && typeof state === 'object' && ('skin' in state || 'prefs' in state || 'theme' in state)) {
          return { port, state };
        }
      } catch {
        // 端口未监听或非桌宠服务，继续扫描下一个
      }
    }
    return null;
  }

  async syncOnce() {
    if (this.syncing) return this.snapshot;
    this.syncing = true;
    try {
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
        Array.isArray(this.snapshot.vocab) ? this.snapshot.vocab.length : 0,
        this.snapshot.figureMeta?.entry || '',
        this.snapshot.figureMeta?.export || '',
        this.snapshot.figureMeta?.version || '',
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
        Array.isArray(this.snapshot.vocab) ? this.snapshot.vocab.length : 0,
        this.snapshot.figureMeta?.entry || '',
        this.snapshot.figureMeta?.export || '',
        this.snapshot.figureMeta?.version || '',
      ]);

      if (prevKey !== nextKey) {
        this.onChange?.(this.snapshot);
      }
      return this.snapshot;
    } catch {
      return this.snapshot;
    } finally {
      this.syncing = false;
    }
  }

  /**
   * 将 /pet-proxy/<targetPath> 透明代理到 Coopanion 本机桌宠服务（去除 Origin 头，保证同源离屏渲染可用）。
   */
  proxyRequest(req, res, targetPath) {
    if (!this.activePort) {
      sendJsonError(res, 503, 'Coopanion 桌宠服务未连接（请先启动 Coopanion）');
      return;
    }

    if (req.method !== 'GET') {
      sendJsonError(res, 403, '禁止访问该代理路径');
      return;
    }

    const sanitized = sanitizeProxyPath(targetPath);
    if (!sanitized.ok) {
      sendJsonError(res, sanitized.status, sanitized.error);
      return;
    }

    const { decodedPath, upstreamPath } = sanitized;

    let upstream;
    try {
      upstream = http.request(
        {
          hostname: this.host,
          port: this.activePort,
          path: upstreamPath,
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

          const lowerPath = decodedPath.toLowerCase();
          const currentType = String(headers['content-type'] || '').toLowerCase();
          if (!currentType || currentType.startsWith('application/octet-stream')) {
            for (const [ext, mime] of PROXY_IMAGE_MIMES) {
              if (lowerPath.endsWith(ext)) {
                headers['content-type'] = mime;
                break;
              }
            }
          }

          headers['cache-control'] = 'no-cache';

          upRes.on('error', () => {
            if (!res.destroyed) res.destroy();
          });

          if (!res.headersSent && !res.destroyed) {
            res.writeHead(upRes.statusCode || 200, headers);
            upRes.pipe(res);
          } else {
            upRes.resume();
          }
        }
      );
    } catch (err) {
      sendJsonError(res, 502, `代理失败: ${err?.message || err}`);
      return;
    }

    upstream.on('timeout', () => {
      upstream.destroy(new Error('upstream timeout'));
    });

    upstream.on('error', (err) => {
      sendJsonError(res, 502, `代理失败: ${err?.message || err}`);
    });

    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy();
    });
    res.on('error', () => {
      upstream.destroy();
    });

    upstream.end();
  }
}
