/**
 * Coopanion / Cortico WebUI 扩展面板客户端。
 * 在 Coopanion「World 扩展 → 二次元3D公寓」页面中展示房间状态与一键打开按钮。
 */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default {
  panels: {
    room: {
      async mount(ctx) {
        const el = ctx.root || ctx.el;
        if (!el) return;

        el.innerHTML = `
          <div style="font-family:system-ui,-apple-system,sans-serif;padding:16px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(128,128,128,0.22);display:grid;gap:12px;max-width:560px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div>
                <div style="font-size:16px;font-weight:700;">二次元 3D 两人套间</div>
                <div id="coo-room-url" style="font-size:12px;opacity:0.75;margin-top:2px;">正在获取本地服务地址…</div>
              </div>
              <a id="coo-room-open" href="http://127.0.0.1:7890" target="_blank" rel="noopener"
                 style="padding:8px 14px;border-radius:10px;background:#ff7aa8;color:#fff;text-decoration:none;font-weight:600;font-size:13px;">
                打开 3D 公寓
              </a>
            </div>
            <div id="coo-room-info" style="font-size:13px;line-height:1.6;opacity:0.9;">加载状态中…</div>
            <div style="display:flex;gap:8px;">
              <button id="coo-room-refresh" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:transparent;color:inherit;cursor:pointer;font-size:12px;">
                刷新同步当前 2D 模型
              </button>
            </div>
          </div>
        `;

        const urlEl = el.querySelector('#coo-room-url');
        const openEl = el.querySelector('#coo-room-open');
        const infoEl = el.querySelector('#coo-room-info');
        const btn = el.querySelector('#coo-room-refresh');

        async function render() {
          try {
            const st = await ctx.invoke('status');
            const roomUrl = st?.url || '';
            if (roomUrl) {
              urlEl.textContent = roomUrl;
              openEl.href = roomUrl;
              openEl.style.opacity = '1';
              openEl.style.pointerEvents = 'auto';
            } else {
              urlEl.textContent = '3D 公寓服务尚未启动（请先启用本 World）';
              openEl.removeAttribute('href');
              openEl.style.opacity = '0.45';
              openEl.style.pointerEvents = 'none';
            }
            const fig = st?.figure;
            const petRoom = st?.rooms?.[st?.pet?.room]?.name || st?.pet?.room || '客厅';
            infoEl.innerHTML = [
              `<div>当前同步模型：<b>${esc(fig?.figureName || 'Coo')}</b>（${fig?.connected ? `已连接本机桌宠端口 ${esc(fig.petPort)}` : '等待连接桌宠服务'}）</div>`,
              `<div>桌宠所在房间：<b>${esc(petRoom)}</b> ｜ 房间时间：<b>${esc(st?.time?.label || '--:--')}</b></div>`,
              `<div>在线 3D 网页：<b>${st?.user?.online ? '已连接' : '未打开'}</b></div>`,
            ].join('');
          } catch (err) {
            infoEl.textContent = `读取状态失败：${err?.message || err}`;
          }
        }

        btn?.addEventListener(
          'click',
          async () => {
            try {
              await ctx.invoke('resyncFigure');
            } catch {}
            await render();
          },
          ctx.signal ? { signal: ctx.signal } : undefined
        );

        await render();
      },
    },
  },
};
