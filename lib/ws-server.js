/**
 * 零外部依赖的本地 HTTP + RFC 6455 WebSocket 服务器。
 * 负责托管二次元 3D 公寓前端、提供 /pet-proxy 同源代理、并与浏览器实时同步房间状态与互动事件。
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function attachWsDecoder(socket, onMessage, onClose) {
  let buf = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const first = buf[0];
      const second = buf[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLen = second & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buf.length < 4) return;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buf.length < 10) return;
        payloadLen = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + payloadLen) return;

      const mask = masked ? buf.subarray(offset, offset + 4) : null;
      const dataStart = offset + maskLen;
      const payload = Buffer.from(buf.subarray(dataStart, dataStart + payloadLen));
      buf = buf.subarray(dataStart + payloadLen);

      if (mask) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i & 3];
        }
      }

      if (opcode === 0x8) {
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        // Pong
        const pong = Buffer.alloc(2 + payload.length);
        pong[0] = 0x8a;
        pong[1] = payload.length;
        payload.copy(pong, 2);
        socket.write(pong);
        continue;
      }
      if (opcode === 0x1) {
        try {
          onMessage(JSON.parse(payload.toString('utf8')));
        } catch {
          // 忽略非 JSON 消息
        }
      }
    }
  });

  socket.on('close', onClose);
  socket.on('error', onClose);
}

export class RoomHttpWsServer {
  constructor({ webDir, petBridge, getSnapshot, onClientMessage }) {
    this.webDir = path.resolve(webDir);
    this.petBridge = petBridge;
    this.getSnapshot = getSnapshot;
    this.onClientMessage = onClientMessage;
    this.server = null;
    this.port = null;
    this.clients = new Set();
  }

  get url() {
    return this.port ? `http://127.0.0.1:${this.port}` : null;
  }

  async start(preferredPort = 7890) {
    if (this.server) return this.url;

    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.server.on('upgrade', (req, socket) => this.handleUpgrade(req, socket));

    for (let p = preferredPort; p < preferredPort + 20; p++) {
      try {
        await new Promise((resolve, reject) => {
          const onErr = (err) => {
            this.server.off('listening', onListen);
            reject(err);
          };
          const onListen = () => {
            this.server.off('error', onErr);
            resolve();
          };
          this.server.once('error', onErr);
          this.server.once('listening', onListen);
          this.server.listen(p, '127.0.0.1');
        });
        this.port = p;
        return this.url;
      } catch (err) {
        if (err?.code !== 'EADDRINUSE') throw err;
      }
    }
    throw new Error('无法找到可用本地端口启动 3D 公寓服务');
  }

  async stop() {
    for (const sock of this.clients) {
      try {
        sock.destroy();
      } catch {}
    }
    this.clients.clear();
    if (!this.server) return;
    this.server.closeIdleConnections?.();
    this.server.closeAllConnections?.();
    await new Promise((resolve) => this.server.close(() => resolve()));
    this.server = null;
    this.port = null;
  }

  broadcast(message) {
    if (this.clients.size === 0) return;
    const frame = encodeWsFrame(JSON.stringify(message));
    for (const sock of this.clients) {
      if (!sock.destroyed && sock.writable) {
        sock.write(frame);
      }
    }
  }

  handleUpgrade(req, socket) {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (reqUrl.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    this.clients.add(socket);
    // 连接后立刻推送全量初始化快照
    socket.write(encodeWsFrame(JSON.stringify({ type: 'init', state: this.getSnapshot() })));

    attachWsDecoder(
      socket,
      (msg) => this.onClientMessage?.(msg, socket),
      () => this.clients.delete(socket)
    );
  }

  handleHttp(req, res) {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(reqUrl.pathname);

    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, port: this.port, clients: this.clients.size }));
      return;
    }

    if (pathname === '/api/room-state') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(this.getSnapshot()));
      return;
    }

    if (pathname.startsWith('/pet-proxy/')) {
      const targetPath = pathname.slice('/pet-proxy'.length) + (reqUrl.search || '');
      this.petBridge.proxyRequest(req, res, targetPath);
      return;
    }

    // 静态文件托管（防目录穿越）
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const fullPath = path.resolve(this.webDir, rel);
    if (!fullPath.startsWith(this.webDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(fullPath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(fullPath).pipe(res);
    });
  }
}
