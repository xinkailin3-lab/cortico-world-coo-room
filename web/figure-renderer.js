/**
 * 2D 桌宠渲染适配器（512×512 离屏画布 → Three.js CanvasTexture）：
 * 1. 当本机运行最新版 Coopanion 时，通过同源反代 /pet-proxy/ 直接加载当前选用的形象包
 *    （内置 Coo、DeepSeek 大肥鱼、深深与额外动作拓展，或任意 api: 2 自定义形象包）；
 * 2. 原生兼容三类渲染载体：
 *    - <canvas> / <foreignObject><canvas>（如 DeepSeek 大肥鱼、Live2D 形象包）；
 *    - <svg><image>（如 深深·动作库，支持 anim.webp WebCodecs 逐帧动画与 f_XXXX 序列帧）；
 *    - 纯矢量 <svg>（如内置 Coo 与配件皮肤）；
 * 3. 当未连接 Coopanion（独立预览）或外部包暂不可用时，无缝切换至内置二次元 2D 桌宠渲染器。
 */

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const MAX_ANIM_CACHE_ENTRIES = 4;
const MAX_ANIM_CACHE_BYTES = 24 * 1024 * 1024;
const DEFAULT_FRAME_MS = 1000 / 24;

function inferImageMime(url) {
  const clean = String(url || '').split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.avif')) return 'image/avif';
  return '';
}

function isAnimatedCandidateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('blob:') || url.startsWith('data:')) return false;
  const clean = url.split('?')[0].toLowerCase();
  if (/\/f_\d{4}\.webp$/i.test(clean)) return false;
  return clean.endsWith('.webp') || clean.endsWith('.gif');
}

class SvgImagePlayer {
  constructor() {
    this.gen = 0;
    this.currentHref = '';
    this.htmlImg = null;
    this.htmlReadyHref = '';
    this.lastDrawable = null;

    this.animCanvas = document.createElement('canvas');
    this.animCanvas.width = 640;
    this.animCanvas.height = 360;
    this.animCtx = this.animCanvas.getContext('2d');

    this.prevCanvas = document.createElement('canvas');
    this.prevCanvas.width = 640;
    this.prevCanvas.height = 360;
    this.prevCtx = this.prevCanvas.getContext('2d');

    this.decoder = null;
    this.frameCount = 0;
    this.frameIndex = 0;
    this.accumMs = 0;
    this.nextDurMs = DEFAULT_FRAME_MS;
    this.decoding = false;
    this.animHasFrame = false;

    this.bufferCache = new Map();
    this.bufferCacheBytes = 0;
  }

  snapshotLastDrawable() {
    if (this.animHasFrame && this.animCanvas.width > 0 && this.animCanvas.height > 0) {
      if (this.prevCanvas.width !== this.animCanvas.width || this.prevCanvas.height !== this.animCanvas.height) {
        this.prevCanvas.width = this.animCanvas.width;
        this.prevCanvas.height = this.animCanvas.height;
      }
      this.prevCtx.clearRect(0, 0, this.prevCanvas.width, this.prevCanvas.height);
      this.prevCtx.drawImage(this.animCanvas, 0, 0);
      this.lastDrawable = this.prevCanvas;
      return;
    }
    if (this.htmlImg && this.htmlImg.complete && this.htmlImg.naturalWidth > 0) {
      this.lastDrawable = this.htmlImg;
    }
  }

  closeDecoder() {
    if (this.decoder) {
      try {
        this.decoder.close();
      } catch {}
      this.decoder = null;
    }
    this.frameCount = 0;
    this.frameIndex = 0;
    this.accumMs = 0;
    this.nextDurMs = DEFAULT_FRAME_MS;
    this.decoding = false;
    this.animHasFrame = false;
  }

  getCachedBuffer(url) {
    if (!this.bufferCache.has(url)) return null;
    const buf = this.bufferCache.get(url);
    this.bufferCache.delete(url);
    this.bufferCache.set(url, buf);
    return buf;
  }

  putCachedBuffer(url, buf) {
    if (!buf || buf.byteLength === 0 || buf.byteLength > MAX_ANIM_CACHE_BYTES) return;
    if (this.bufferCache.has(url)) {
      const old = this.bufferCache.get(url);
      this.bufferCacheBytes -= old.byteLength;
      this.bufferCache.delete(url);
    }
    while (
      this.bufferCache.size >= MAX_ANIM_CACHE_ENTRIES ||
      this.bufferCacheBytes + buf.byteLength > MAX_ANIM_CACHE_BYTES
    ) {
      const oldestKey = this.bufferCache.keys().next().value;
      if (!oldestKey) break;
      const oldestBuf = this.bufferCache.get(oldestKey);
      this.bufferCacheBytes -= oldestBuf.byteLength;
      this.bufferCache.delete(oldestKey);
    }
    this.bufferCache.set(url, buf);
    this.bufferCacheBytes += buf.byteLength;
  }

  paintVideoFrame(result) {
    const img = result?.image;
    if (!img) return DEFAULT_FRAME_MS;
    try {
      const w = img.displayWidth || img.codedWidth || 640;
      const h = img.displayHeight || img.codedHeight || 360;
      if (this.animCanvas.width !== w || this.animCanvas.height !== h) {
        this.animCanvas.width = w;
        this.animCanvas.height = h;
      }
      this.animCtx.clearRect(0, 0, w, h);
      this.animCtx.drawImage(img, 0, 0, w, h);
      this.animHasFrame = true;
      const durUs = result.duration ?? img.duration;
      return Number.isFinite(durUs) && durUs > 0
        ? Math.min(500, Math.max(16, durUs / 1000))
        : DEFAULT_FRAME_MS;
    } finally {
      try {
        img.close();
      } catch {}
    }
  }

  async initAnimatedDecoder(href, myGen) {
    const mime = inferImageMime(href);
    if (!mime || typeof window.ImageDecoder !== 'function') return;
    try {
      if (typeof window.ImageDecoder.isTypeSupported === 'function') {
        const supported = await window.ImageDecoder.isTypeSupported(mime);
        if (!supported || myGen !== this.gen) return;
      }
      let buf = this.getCachedBuffer(href);
      if (!buf) {
        const res = await fetch(href);
        if (!res.ok || myGen !== this.gen) return;
        buf = await res.arrayBuffer();
        if (myGen !== this.gen) return;
        this.putCachedBuffer(href, buf);
      }
      const decoder = new window.ImageDecoder({
        data: buf.slice(0),
        type: mime,
      });
      await decoder.tracks.ready;
      if (myGen !== this.gen) {
        try {
          decoder.close();
        } catch {}
        return;
      }
      const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
      if (count <= 1) {
        try {
          decoder.close();
        } catch {}
        return;
      }
      const firstResult = await decoder.decode({ frameIndex: 0 });
      if (myGen !== this.gen) {
        try {
          firstResult?.image?.close();
        } catch {}
        try {
          decoder.close();
        } catch {}
        return;
      }
      this.decoder = decoder;
      this.frameCount = count;
      this.nextDurMs = this.paintVideoFrame(firstResult);
      this.frameIndex = count > 1 ? 1 : 0;
      this.accumMs = 0;
    } catch {
      // 回退到 HTMLImageElement 静态/序列帧路径
    }
  }

  async decodeNextFrame(myGen) {
    if (!this.decoder || this.decoding || this.frameCount <= 1) return;
    this.decoding = true;
    const idx = this.frameIndex;
    try {
      const result = await this.decoder.decode({ frameIndex: idx });
      if (myGen !== this.gen) {
        try {
          result?.image?.close();
        } catch {}
        return;
      }
      this.nextDurMs = this.paintVideoFrame(result);
      this.frameIndex = (idx + 1) % this.frameCount;
    } catch {
      if (myGen === this.gen) {
        this.closeDecoder();
      }
    } finally {
      if (myGen === this.gen) {
        this.decoding = false;
      }
    }
  }

  switchHref(href) {
    this.snapshotLastDrawable();
    this.gen += 1;
    const myGen = this.gen;
    this.currentHref = href;
    this.closeDecoder();
    this.htmlReadyHref = '';

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (myGen === this.gen) {
        this.htmlReadyHref = href;
      }
    };
    img.src = href;
    this.htmlImg = img;

    if (isAnimatedCandidateUrl(href)) {
      void this.initAnimatedDecoder(href, myGen);
    }
  }

  step(href, dt) {
    if (!href) return this.lastDrawable;
    if (href !== this.currentHref) {
      this.switchHref(href);
    }

    if (this.decoder && this.frameCount > 1) {
      this.accumMs += dt * 1000;
      if (this.accumMs >= this.nextDurMs && !this.decoding) {
        this.accumMs %= this.nextDurMs;
        void this.decodeNextFrame(this.gen);
      }
      if (this.animHasFrame) return this.animCanvas;
    }

    if (this.htmlImg && this.htmlReadyHref === href && this.htmlImg.complete && this.htmlImg.naturalWidth > 0) {
      return this.htmlImg;
    }
    return this.lastDrawable;
  }

  dispose() {
    this.gen += 1;
    this.currentHref = '';
    this.htmlImg = null;
    this.htmlReadyHref = '';
    this.lastDrawable = null;
    this.closeDecoder();
    this.bufferCache.clear();
    this.bufferCacheBytes = 0;
  }
}

class SvgVectorRasterizer {
  constructor() {
    this.gen = 0;
    this.lastMarkup = '';
    this.lastStartAt = 0;
    this.inFlight = false;
    this.lastImage = null;
  }

  buildSvgMarkup(svgEl, styleEls, centerShiftX) {
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '512');
    clone.setAttribute('height', '512');
    clone.setAttribute('viewBox', '0 0 512 512');
    clone.setAttribute('data-theme', 'light');

    const cssParts = [];
    for (const styleEl of styleEls) {
      const text = styleEl?.textContent || '';
      if (text) cssParts.push(text.replace(/html:root/g, 'svg'));
    }
    cssParts.push('svg{overflow:visible}');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const styleNode = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleNode.textContent = cssParts.join('\n');
    defs.appendChild(styleNode);

    if (Math.abs(centerShiftX) > 0.5) {
      const shiftGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      shiftGroup.setAttribute('transform', `translate(${centerShiftX.toFixed(1)} 0)`);
      while (clone.firstChild) {
        shiftGroup.appendChild(clone.firstChild);
      }
      clone.appendChild(defs);
      clone.appendChild(shiftGroup);
    } else {
      clone.insertBefore(defs, clone.firstChild);
    }

    return new XMLSerializer().serializeToString(clone);
  }

  step(svgEl, styleEls, centerShiftX, _dt) {
    const now = performance.now();
    const markup = this.buildSvgMarkup(svgEl, styleEls, centerShiftX);
    if (markup !== this.lastMarkup && !this.inFlight && now - this.lastStartAt >= 32) {
      this.lastMarkup = markup;
      this.lastStartAt = now;
      this.inFlight = true;
      const myGen = this.gen;
      const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        if (myGen === this.gen) {
          this.inFlight = false;
          this.lastImage = img;
        }
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        if (myGen === this.gen) {
          this.inFlight = false;
        }
      };
      img.src = url;
    }
    return this.lastImage;
  }

  dispose() {
    this.gen += 1;
    this.lastMarkup = '';
    this.lastStartAt = 0;
    this.inFlight = false;
    this.lastImage = null;
  }
}

export class Pet2DFigureRenderer {
  constructor(stageEl) {
    this.stageEl = stageEl;
    this.outputCanvas = document.createElement('canvas');
    this.outputCanvas.width = 512;
    this.outputCanvas.height = 512;
    this.ctx = this.outputCanvas.getContext('2d');

    this.nativeBody = null;
    this.nativeKey = '';
    this.nativeFigureId = '';
    this.nativeStyles = [];
    this.nativeWords = new Set();
    this.syncSeq = 0;

    this.mode = 'fallback'; // 'native' | 'fallback'
    this.facing = 1;
    this.moving = false;
    this.running = false;
    this.isNativeWalking = false;
    this.nativeWalkFacing = 1;
    this.nativeWalkRunning = false;
    this.walkSeq = 0;
    this.activeWalkId = 0;

    this.action = 'idle';
    this.actionUntil = 0;
    this.time = 0;
    this.particles = [];

    this.svgImgPlayer = new SvgImagePlayer();
    this.svgRasterizer = new SvgVectorRasterizer();
  }

  /**
   * 尝试同步并挂载 Coopanion 当前选中的原生 2D 模型
   */
  async syncNativeFigure(figureSnap) {
    const seq = ++this.syncSeq;

    if (!figureSnap?.connected) {
      this.disposeNative();
      return false;
    }

    const meta = figureSnap.figureMeta || null;
    const key = JSON.stringify([
      figureSnap.figureId || 'coo',
      figureSnap.scheme || '',
      figureSnap.skin || null,
      figureSnap.theme || 'light',
      meta?.entry || '',
      meta?.export || '',
      meta?.version || '',
      Array.isArray(figureSnap.vocab) ? figureSnap.vocab.length : 0,
    ]);
    if (key === this.nativeKey && this.nativeBody) return true;

    this.disposeNative();

    const addedStyles = [];
    let body = null;

    try {
      const kit = await import('/pet-proxy/web/kit/body.js');
      if (seq !== this.syncSeq) return false;

      const id = figureSnap.figureId || 'coo';

      let basePath = '/pet-proxy/web/coo/';
      if (typeof meta?.base === 'string' && meta.base.startsWith('/')) {
        const normalizedBase = meta.base.endsWith('/') ? meta.base : `${meta.base}/`;
        basePath = `/pet-proxy${normalizedBase}`;
      } else if (id === 'whale') {
        basePath = '/pet-proxy/web/whale/';
      } else if (id !== 'coo') {
        basePath = `/pet-proxy/packs/${encodeURIComponent(id)}/`;
      }

      const base = new URL(basePath, location.origin);
      const entryUrl = new URL(
        meta?.entry
          ? String(meta.entry).replace(/^\.?\//, '')
          : 'figure.js',
        base
      ).href;
      const exportName = meta?.export || 'default';

      let modelData = null;
      if (typeof meta?.model === 'string' && meta.model) {
        const modelRes = await fetch(new URL(meta.model.replace(/^\.?\//, ''), base));
        if (seq !== this.syncSeq) return false;
        if (modelRes.ok) modelData = await modelRes.json();
      } else if (meta?.model && typeof meta.model === 'object') {
        modelData = meta.model;
      }
      if (seq !== this.syncSeq) return false;

      let resolvedScheme = figureSnap.scheme || '';
      if (!resolvedScheme && meta) {
        if (Array.isArray(meta.presets) && meta.presets[0]?.id) {
          resolvedScheme = meta.presets[0].id;
        } else if (Array.isArray(meta.axes) && meta.axes.length > 0) {
          resolvedScheme = meta.axes.map((a) => a?.options?.[0]?.id || '').filter(Boolean).join('-');
        }
      }

      const mod = await import(entryUrl);
      if (seq !== this.syncSeq) return false;

      const factory = mod[exportName] || mod.default || Object.values(mod).find((v) => typeof v === 'function');
      if (typeof factory !== 'function') {
        throw new Error('形象包未导出有效的 factory 函数');
      }

      this.stageEl.innerHTML = '';
      const bounds = { W: 512, H: 512, floorY: 462, S: 1.38 };
      const host = {
        root: this.stageEl,
        bounds: () => bounds,
        emit: () => {},
        sound: () => {},
        start: {
          x: 256,
          facing: this.facing,
          enter: false,
          skin: figureSnap.skin || {},
        },
      };

      const loadImage = (url) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = String(url);
        });

      const asset = (rel) => new URL(String(rel).replace(/^\.?\//, ''), base);

      const stylesBefore = new Set(document.head.querySelectorAll('style'));
      body = await factory(base, {
        model: modelData ?? undefined,
        scheme: resolvedScheme,
        kit,
        loadImage,
        asset,
        host,
      });

      for (const el of document.head.querySelectorAll('style')) {
        if (!stylesBefore.has(el)) addedStyles.push(el);
      }

      if (seq !== this.syncSeq) {
        try {
          body?.dispose?.();
        } catch {}
        for (const el of addedStyles) el.remove();
        this.stageEl.innerHTML = '';
        return false;
      }

      if (!body || typeof body.step !== 'function') {
        throw new Error('形象包实例缺少 step()');
      }

      try {
        body.set?.({
          roam: 'off',
          still: false,
          theme: 'light',
          ...(figureSnap.skin ? { skin: figureSnap.skin } : {}),
        });
        body.place?.(256, this.facing);
      } catch {}

      const words = new Set();
      if (Array.isArray(body.words)) {
        for (const w of body.words) {
          if (typeof w === 'string' && w) words.add(w);
        }
      }
      if (Array.isArray(figureSnap.vocab)) {
        for (const w of figureSnap.vocab) {
          if (typeof w === 'string' && w) words.add(w);
        }
      }

      this.nativeBody = body;
      this.nativeKey = key;
      this.nativeFigureId = id;
      this.nativeStyles = addedStyles;
      this.nativeWords = words;
      this.isNativeWalking = false;
      this.nativeWalkFacing = this.facing;
      this.nativeWalkRunning = false;
      this.mode = 'native';

      if (this.moving) {
        this.setMovement(true, this.facing, this.running);
      }
      return true;
    } catch (err) {
      if (body) {
        try {
          body.dispose?.();
        } catch {}
      }
      for (const el of addedStyles) el.remove();
      console.warn('[coo-room] 原生形象挂载回退至内置 2D 渲染器:', err?.message || err);
      if (seq === this.syncSeq) {
        this.disposeNative();
      }
      return false;
    }
  }

  disposeNative() {
    if (this.nativeBody?.dispose) {
      try {
        this.nativeBody.dispose();
      } catch {}
    }
    this.nativeBody = null;
    this.nativeKey = '';
    this.nativeFigureId = '';
    for (const el of this.nativeStyles) {
      try {
        el.remove();
      } catch {}
    }
    this.nativeStyles = [];
    this.nativeWords.clear();
    this.isNativeWalking = false;
    this.activeWalkId = 0;
    this.mode = 'fallback';
    this.svgImgPlayer.dispose();
    this.svgRasterizer.dispose();
    if (this.stageEl) this.stageEl.innerHTML = '';
  }

  setMovement(moving, facing = 1, running = false) {
    this.moving = Boolean(moving);
    this.running = Boolean(running);
    const prevFacing = this.facing;
    if (facing !== 0) this.facing = facing > 0 ? 1 : -1;

    if (!this.nativeBody) return;

    try {
      if (this.moving) {
        if (
          !this.isNativeWalking ||
          this.nativeWalkFacing !== this.facing ||
          this.nativeWalkRunning !== this.running
        ) {
          this.nativeBody.place?.(256, this.facing);
          const wid = ++this.walkSeq;
          this.activeWalkId = wid;
          this.isNativeWalking = true;
          this.nativeWalkFacing = this.facing;
          this.nativeWalkRunning = this.running;
          this.nativeBody.walk?.(this.facing > 0 ? 480 : 32, this.running, wid);
        }
      } else {
        if (this.isNativeWalking) {
          this.nativeBody.stopWalk?.(this.activeWalkId);
          this.isNativeWalking = false;
          this.nativeBody.place?.(256, this.facing);
        } else if (prevFacing !== this.facing) {
          this.nativeBody.place?.(256, this.facing);
        }
      }
    } catch {}
  }

  resolveActionWord(action) {
    if (!action) return null;
    const isBuiltIn = this.nativeFigureId === 'coo' || this.nativeFigureId === 'whale';
    if (isBuiltIn) {
      const builtinMap = {
        pat: 'happy',
        poke: 'shy',
        think: 'thinking',
        curious: 'look',
      };
      return builtinMap[action] || action;
    }

    const candidatesMap = {
      wave: ['cheer-wave', 'greet-wave', 'wave'],
      happy: ['cheer-hop', 'cheer-wave', 'tickle-giggle', 'happy'],
      pat: ['tickle-giggle', 'cheer-hop', 'happy'],
      poke: ['shy-startle', 'tsun-pout', 'tickle-giggle', 'shy'],
      shy: ['shy-startle', 'tsun-pout', 'shy'],
      jump: ['cheer-hop', 'jump', 'hop'],
      think: ['look-around', 'thinking', 'think'],
      curious: ['look-around', 'look'],
      sleep: ['sleep', 'sleepy'],
      sit: ['sit'],
    };

    const candidates = candidatesMap[action];
    if (candidates) {
      for (const word of candidates) {
        if (this.nativeWords.has(word)) return word;
      }
    }
    if (this.nativeWords.has(action)) return action;
    return action;
  }

  triggerPointerClick() {
    if (!this.nativeBody?.pointer) return;
    try {
      let pt = { x: 256, y: 280 };
      const layout = this.nativeBody.layout?.();
      if (Array.isArray(layout?.hit) && layout.hit[0]) {
        pt = { x: layout.hit[0].x, y: layout.hit[0].y };
      }
      const now = performance.now();
      this.nativeBody.pointer('down', { ...pt, t: now });
      this.nativeBody.pointer('up', { ...pt, t: now + 60 });
    } catch {}
  }

  triggerAction(action, durationSec = 4) {
    this.action = action || 'happy';
    this.actionUntil = action === 'sleep' || action === 'sit' ? Infinity : this.time + durationSec;

    if (action === 'happy' || action === 'shy' || action === 'pat') {
      this.spawnParticles(action === 'shy' ? '♥' : '✦', action === 'shy' ? '#ff6f9c' : '#ffd15c', 6);
    } else if (action === 'sleep') {
      this.spawnParticles('Z', '#8bb9ff', 3);
    }

    if (this.nativeBody) {
      if ((action === 'poke' || action === 'pat') && this.nativeFigureId !== 'coo' && this.nativeFigureId !== 'whale') {
        const mapped = this.resolveActionWord(action);
        if (mapped && mapped !== 'shy' && mapped !== 'happy' && this.nativeWords.has(mapped)) {
          try {
            this.nativeBody.do?.(mapped);
          } catch {}
        } else {
          this.triggerPointerClick();
        }
        return;
      }
      const resolved = this.resolveActionWord(this.action);
      if (resolved && this.nativeBody.do) {
        try {
          this.nativeBody.do(resolved);
        } catch {}
      }
    }
  }

  spawnParticles(symbol, color, count = 5) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: 256 + (Math.random() - 0.5) * 140,
        y: 170 + (Math.random() - 0.5) * 60,
        vy: -40 - Math.random() * 45,
        vx: (Math.random() - 0.5) * 28,
        life: 1.0,
        symbol,
        color,
        size: 20 + Math.random() * 12,
      });
    }
  }

  safeLayout() {
    try {
      return this.nativeBody?.layout?.() || null;
    } catch {
      return null;
    }
  }

  step(dt) {
    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    this.time += safeDt;

    if (this.action !== 'idle' && this.time > this.actionUntil) {
      this.action = 'idle';
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, 512, 512);

    if (this.mode === 'native' && this.nativeBody) {
      try {
        this.nativeBody.step(safeDt, true);

        const layout = this.safeLayout();
        const centerShiftX = Number.isFinite(layout?.x)
          ? Math.max(-256, Math.min(256, 256 - layout.x))
          : 0;

        if (this.moving && layout && Number.isFinite(layout.x) && (layout.x < 150 || layout.x > 362)) {
          this.nativeBody.place?.(256, this.facing);
          const wid = ++this.walkSeq;
          this.activeWalkId = wid;
          this.nativeBody.walk?.(this.facing > 0 ? 480 : 32, this.running, wid);
        }

        // Case 1: Canvas 渲染载体（大肥鱼 foreignObject<canvas> / 独立 Live2D canvas）
        const srcCanvas = this.stageEl.querySelector('canvas');
        if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
          const fo = srcCanvas.closest('foreignObject');
          if (fo) {
            const x = Number(fo.getAttribute('x')) || 0;
            const y = Number(fo.getAttribute('y')) || 0;
            const w = Number(fo.getAttribute('width')) || 256;
            const h = Number(fo.getAttribute('height')) || 256;
            let ctm = null;
            try {
              ctm = fo.getCTM?.();
            } catch {}
            if (ctm && Number.isFinite(ctm.a) && Number.isFinite(ctm.d) && (Math.abs(ctm.a) > 1e-4 || Math.abs(ctm.b) > 1e-4)) {
              ctx.save();
              ctx.translate(centerShiftX, 0);
              ctx.transform(ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f);
              ctx.drawImage(srcCanvas, x, y, w, h);
              ctx.restore();
            } else {
              ctx.drawImage(srcCanvas, 0, 0, 512, 512);
            }
          } else {
            ctx.drawImage(srcCanvas, 0, 0, 512, 512);
          }
          this.drawParticles(ctx, safeDt);
          return;
        }

        // Case 2: SVG <image> 载体（如 深深·动作库，支持 anim.webp 动图与 f_XXXX 序列帧）
        const svgImg = this.stageEl.querySelector('svg image');
        if (svgImg) {
          const href = svgImg.getAttribute('href') || svgImg.getAttributeNS(XLINK_NS, 'href') || '';
          const drawable = this.svgImgPlayer.step(href, safeDt);
          if (drawable) {
            const ix = Number(svgImg.getAttribute('x')) || 0;
            const iy = Number(svgImg.getAttribute('y')) || 0;
            const iw = Number(svgImg.getAttribute('width')) || 256;
            const ih = Number(svgImg.getAttribute('height')) || 256;
            let ctm = null;
            try {
              ctm = svgImg.getCTM?.();
            } catch {}
            ctx.save();
            if (ctm && Number.isFinite(ctm.a) && Number.isFinite(ctm.d) && (Math.abs(ctm.a) > 1e-4 || Math.abs(ctm.b) > 1e-4)) {
              ctx.translate(centerShiftX, 0);
              ctx.transform(ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f);
              ctx.drawImage(drawable, ix, iy, iw, ih);
            } else {
              ctx.drawImage(drawable, 0, 0, 512, 512);
            }
            ctx.restore();
            this.drawParticles(ctx, safeDt);
            return;
          }
          if (href) {
            // 正在加载首帧，保持等待而不闪退回默认猫咪
            this.drawParticles(ctx, safeDt);
            return;
          }
        }

        // Case 3: 纯矢量 <svg> 载体（如内置 Coo）
        const svgEl = this.stageEl.querySelector('svg');
        if (svgEl && svgEl.querySelector('path, circle, ellipse, rect, polygon')) {
          const vecImg = this.svgRasterizer.step(svgEl, this.nativeStyles, centerShiftX, safeDt);
          if (vecImg) {
            ctx.drawImage(vecImg, 0, 0, 512, 512);
          }
          this.drawParticles(ctx, safeDt);
          return;
        }
      } catch (err) {
        console.warn('[coo-room] 原生形象步进异常，已回退内置形象:', err?.message || err);
        this.disposeNative();
      }
    }

    this.drawAnimeCooFallback(ctx, safeDt);
    this.drawParticles(ctx, safeDt);
  }

  drawParticles(ctx, dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.85;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.font = `900 ${Math.round(p.size)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(p.symbol, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.symbol, p.x, p.y);
      ctx.restore();
    }
  }

  /**
   * 内置二次元风格 2D Coo 角色（柔和描边 + 灵动表情 + 走路弹跳 + 猫耳发饰）
   */
  drawAnimeCooFallback(ctx, _dt) {
    const t = this.time;
    const isWalk = this.moving;
    const isSleep = this.action === 'sleep';
    const isJump = this.action === 'jump';
    const isHappy = this.action === 'happy' || this.action === 'wave' || this.action === 'pat';
    const isShy = this.action === 'shy';

    const bounce = isJump
      ? Math.abs(Math.sin(t * 9)) * 42
      : isWalk
        ? Math.abs(Math.sin(t * 11)) * 18
        : Math.sin(t * 2.6) * 5;

    const tilt = isWalk ? Math.sin(t * 11) * 0.08 : isHappy ? Math.sin(t * 7) * 0.06 : 0;

    ctx.save();
    ctx.translate(256, 395 - bounce);
    ctx.scale(this.facing, 1);
    ctx.rotate(tilt);

    // 脚部摆动
    const legSwing = isWalk ? Math.sin(t * 11) * 18 : 0;
    ctx.lineCap = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#3b2c43';
    ctx.beginPath();
    ctx.moveTo(-32, 22);
    ctx.lineTo(-34 - legSwing * 0.6, 62 - Math.max(0, legSwing * 0.4));
    ctx.moveTo(32, 22);
    ctx.lineTo(34 + legSwing * 0.6, 62 - Math.max(0, -legSwing * 0.4));
    ctx.stroke();

    // 可爱小短手
    const waveY = this.action === 'wave' ? -45 + Math.sin(t * 14) * 18 : 6;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-88, -28);
    ctx.lineTo(-116, -6);
    ctx.moveTo(88, -28);
    ctx.lineTo(122, waveY);
    ctx.stroke();

    // 奶白色二次元软萌身体（带立体高光和深紫描边）
    const bodyGrad = ctx.createRadialGradient(-28, -95, 16, 0, -55, 130);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.75, '#fff5ec');
    bodyGrad.addColorStop(1, '#f4dfd4');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#3b2c43';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(0, -58, 96, 92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 顶部可爱猫耳（双色渐层）
    const drawEar = (sx) => {
      ctx.save();
      ctx.scale(sx, 1);
      ctx.fillStyle = '#fff5ec';
      ctx.beginPath();
      ctx.moveTo(-66, -124);
      ctx.quadraticCurveTo(-82, -190, -24, -148);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffa8c5';
      ctx.beginPath();
      ctx.moveTo(-58, -130);
      ctx.quadraticCurveTo(-68, -168, -34, -144);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawEar(1);
    drawEar(-1);

    // 发光四角星发夹（二次元点缀）
    ctx.save();
    ctx.translate(54, -124);
    ctx.fillStyle = '#7ec8ff';
    ctx.strokeStyle = '#3b2c43';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 18 : 7;
      const a = (i * Math.PI) / 4;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 腮红
    ctx.fillStyle = isShy ? 'rgba(255, 105, 150, 0.58)' : 'rgba(255, 145, 175, 0.36)';
    ctx.beginPath();
    ctx.ellipse(-52, -40, 18, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(52, -40, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛（自然眨眼 / 开心笑眼 / 睡觉闭眼）
    const blinking = Math.sin(t * 0.9) > 0.96;
    ctx.strokeStyle = '#3b2c43';
    ctx.fillStyle = '#3b2c43';
    ctx.lineWidth = 8;

    if (isSleep || blinking) {
      ctx.beginPath();
      ctx.arc(-34, -64, 15, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(34, -64, 15, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (isHappy) {
      ctx.beginPath();
      ctx.arc(-34, -56, 16, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(34, -56, 16, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
    } else {
      for (const ex of [-34, 34]) {
        ctx.fillStyle = '#3b2c43';
        ctx.beginPath();
        ctx.ellipse(ex, -64, 14, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex - 4, -71, 5.5, 0, Math.PI * 2);
        ctx.arc(ex + 5, -58, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 小猫咪嘴巴 (w)
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    if (isHappy) {
      ctx.arc(-8, -36, 9, 0.1 * Math.PI, 0.95 * Math.PI);
      ctx.arc(8, -36, 9, 0.05 * Math.PI, 0.9 * Math.PI);
    } else if (isSleep) {
      ctx.arc(0, -32, 6, 0, Math.PI * 2);
    } else {
      ctx.arc(-7, -38, 7, 0.15 * Math.PI, 0.95 * Math.PI);
      ctx.arc(7, -38, 7, 0.05 * Math.PI, 0.85 * Math.PI);
    }
    ctx.stroke();

    // 淡绿色小领结（呼应 Coopanion 品牌色）
    ctx.fillStyle = '#6fe0a4';
    ctx.strokeStyle = '#3b2c43';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(-22, 2);
    ctx.lineTo(-22, 22);
    ctx.closePath();
    ctx.moveTo(0, 12);
    ctx.lineTo(22, 2);
    ctx.lineTo(22, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
