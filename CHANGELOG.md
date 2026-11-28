# Changelog

## 1.1.2

- 彻底修复与「深深与额外动作拓展」（`shenshen-actions`）同时使用时的冲突与闪退：
  - 修复 `lib/ws-server.js` 与 `lib/pet-bridge.js` 将已解码的中文路径（如 `额外动作拓展/index.js`、`额外动作拓展/.../anim.webp`）直接传给 `http.request()` 引发同步 `ERR_UNESCAPED_CHARACTERS` 异常，导致 Coopanion Core 进程崩溃退出的问题；新增路径安全白名单、分段重新编码、畸形编码 400 拦截、流错误处理、上游超时与连接清理，防止任何异常请求拖垮宿主。
  - 修复 `web/figure-renderer.js` 仅能读取 `<canvas>` 而无法渲染「深深」等 SVG `<image>` 形象包以及内置纯矢量 Coo 的问题：新增基于 WebCodecs `ImageDecoder` 的 `anim.webp` / `anim.gif` 动图逐帧播放与帧序列支持、纯矢量 `<svg>` 异步光栅化与颜色变量兼容、以及 `<foreignObject><canvas>` 矩阵合成。
  - 禁用离线挂载后原生 `kit` 的自由乱逛（`roam: 'off'`），打通 3D 公寓跨房间移动时的 `walk` / `stopWalk` / `place` 朝向与通用动作词映射，默认入口文件名兜底修正为 `figure.js`。
  - 桌宠端口探测范围扩展至 `7797–7806` 并加入 `syncOnce` 防重入锁与 WebGL 上下文丢失保护。

## 1.1.1

- 安全加固：`/ws` WebSocket 升级握手严格校验 `Origin`，仅放行与当前实际监听端口同源的 `http://127.0.0.1:<port>` 请求，缺失或不匹配一律返回 `403 Forbidden` 并关闭连接。
- 安全加固：移除 `/pet-proxy/` 响应中的 `access-control-allow-origin: *` 头部，禁止外部站点跨域读取桌宠状态与形象包。

## 1.1.0

- 完整适配 **Cortico World API v6** 规范：补齐全部工具 `tags` 与 `handler`、事件改为 `host.pushEvent`、WebUI 提供顶层 `invoke` / 状态灯 / 快捷入口与 `ENV_PROMPT.md` 环境提示词注入。
- 真实 80–85㎡ 2LDK 动静分离两人户型：6 大功能区（客厅餐厅、主卧、书房、厨房、卫生间、阳台）与 5 扇实体可开关门（含自动开门、防夹与防卡门碰撞保护）。
- 修复并完善 Coopanion 原生 2D 形象包同步加载（支持内置 Coo / 大肥鱼及自定义 api v2 形象包的 `URL` `base`、`model` JSON 拉取与默认 `scheme` 解析）。
- 零外部依赖、纯程序化卡通几何家具，体积极轻且支持系统/自定义 24 小时昼夜光照。
