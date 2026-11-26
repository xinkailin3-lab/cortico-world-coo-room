# Changelog

## 1.1.1

- 安全加固：`/ws` WebSocket 升级握手严格校验 `Origin`，仅放行与当前实际监听端口同源的 `http://127.0.0.1:<port>` 请求，缺失或不匹配一律返回 `403 Forbidden` 并关闭连接。
- 安全加固：移除 `/pet-proxy/` 响应中的 `access-control-allow-origin: *` 头部，禁止外部站点跨域读取桌宠状态与形象包。

## 1.1.0

- 完整适配 **Cortico World API v6** 规范：补齐全部工具 `tags` 与 `handler`、事件改为 `host.pushEvent`、WebUI 提供顶层 `invoke` / 状态灯 / 快捷入口与 `ENV_PROMPT.md` 环境提示词注入。
- 真实 80–85㎡ 2LDK 动静分离两人户型：6 大功能区（客厅餐厅、主卧、书房、厨房、卫生间、阳台）与 5 扇实体可开关门（含自动开门、防夹与防卡门碰撞保护）。
- 修复并完善 Coopanion 原生 2D 形象包同步加载（支持内置 Coo / 大肥鱼及自定义 api v2 形象包的 `URL` `base`、`model` JSON 拉取与默认 `scheme` 解析）。
- 零外部依赖、纯程序化卡通几何家具，体积极轻且支持系统/自定义 24 小时昼夜光照。
