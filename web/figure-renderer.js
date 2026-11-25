/**
 * 2D 桌宠渲染适配器（512×512 离屏画布 → Three.js CanvasTexture）：
 * 1. 当本机运行最新版 Coopanion 时，通过同源反代 /pet-proxy/ 直接加载当前选用的形象包
 *    （内置 Coo、DeepSeek 大肥鱼或任意 api: 2 自定义形象包），复用原版 2D 渲染与动作词表；
 * 2. 当未连接 Coopanion（独立预览）或外部包暂不可用时，无缝切换至内置高颜值二次元 2D 桌宠渲染器。
 */

export class Pet2DFigureRenderer {
  constructor(stageEl) {
    this.stageEl = stageEl;
    this.outputCanvas = document.createElement('canvas');
    this.outputCanvas.width = 512;
    this.outputCanvas.height = 512;
    this.ctx = this.outputCanvas.getContext('2d');

    this.nativeBody = null;
    this.nativeKey = '';
    this.mode = 'fallback'; // 'native' | 'fallback'
    this.facing = 1;
    this.moving = false;
    this.action = 'idle';
    this.actionUntil = 0;
    this.time = 0;
    this.particles = [];
  }

  /**
   * 尝试同步并挂载 Coopanion 当前选中的原生 2D 模型
   */
  async syncNativeFigure(figureSnap) {
    if (!figureSnap?.connected) {
      this.disposeNative();
      return false;
    }

    const key = `${figureSnap.figureId}:${figureSnap.scheme || ''}:${JSON.stringify(figureSnap.skin || {})}`;
    if (key === this.nativeKey && this.nativeBody) return true;

    this.disposeNative();

    try {
      const kit = await import('/pet-proxy/web/kit/body.js');
      const id = figureSnap.figureId || 'coo';
      const meta = figureSnap.figureMeta || null;

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
      let entryUrl = new URL(
        meta?.entry
          ? String(meta.entry).replace(/^\.?\//, '')
          : id === 'whale'
            ? 'whale.js'
            : 'coo.js',
        base
      ).href;
      const exportName = meta?.export || 'default';

      let modelData = null;
      if (typeof meta?.model === 'string' && meta.model) {
        const modelRes = await fetch(new URL(meta.model.replace(/^\.?\//, ''), base));
        if (modelRes.ok) modelData = await modelRes.json();
      } else if (meta?.model && typeof meta.model === 'object') {
        modelData = meta.model;
      }

      let resolvedScheme = figureSnap.scheme || '';
      if (!resolvedScheme && meta) {
        if (Array.isArray(meta.presets) && meta.presets[0]?.id) {
          resolvedScheme = meta.presets[0].id;
        } else if (Array.isArray(meta.axes) && meta.axes.length > 0) {
          resolvedScheme = meta.axes.map((a) => a?.options?.[0]?.id || '').filter(Boolean).join('-');
        }
      }

      const mod = await import(entryUrl);
      const factory = mod[exportName] || mod.default || Object.values(mod).find((v) => typeof v === 'function');
      if (typeof factory !== 'function') {
        throw new Error('形象包未导出有效的 factory 函数');
      }

      this.stageEl.innerHTML = '';
      const bounds = { W: 512, H: 512, floorY: 460, S: 1.45 };
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

      const body = await factory(base, {
        model: modelData ?? undefined,
        scheme: resolvedScheme,
        kit,
        loadImage,
        asset,
        host,
      });

      if (!body || typeof body.step !== 'function') {
        throw new Error('形象包实例缺少 step()');
      }

      this.nativeBody = body;
      this.nativeKey = key;
      this.mode = 'native';
      return true;
    } catch (err) {
      console.warn('[coo-room] 原生形象挂载回退至内置 2D 渲染器:', err?.message || err);
      this.disposeNative();
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
    this.mode = 'fallback';
    if (this.stageEl) this.stageEl.innerHTML = '';
  }

  setMovement(moving, facing = 1) {
    this.moving = Boolean(moving);
    if (facing !== 0) this.facing = facing > 0 ? 1 : -1;
    if (this.nativeBody?.set) {
      try {
        this.nativeBody.set({ moving: this.moving, facing: this.facing });
      } catch {}
    }
  }

  triggerAction(action, durationSec = 4) {
    this.action = action || 'happy';
    this.actionUntil = action === 'sleep' || action === 'sit' ? Infinity : this.time + durationSec;

    if (action === 'happy' || action === 'shy' || action === 'pat') {
      this.spawnParticles(action === 'shy' ? '♥' : '✦', action === 'shy' ? '#ff6f9c' : '#ffd15c', 6);
    } else if (action === 'sleep') {
      this.spawnParticles('Z', '#8bb9ff', 3);
    }

    if (this.nativeBody?.do) {
      try {
        this.nativeBody.do(this.action);
      } catch {}
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
        const srcCanvas = this.stageEl.querySelector('canvas');
        if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
          ctx.drawImage(srcCanvas, 0, 0, 512, 512);
          this.drawParticles(ctx, safeDt);
          return;
        }
      } catch {
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
