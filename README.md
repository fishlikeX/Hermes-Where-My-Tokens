# 我的词元去哪了？ · Where My Tokens?

Hermes 私有用量账本看板：给你的 Hermes 装一个 zcode / GitHub 贡献图同款的 token 统计页——
活动热力图、近 30 天趋势、模型去向前五、连续活跃天数。全部数据来自本机 `state.db`，**纯只读，不上云**。

English below.

## 装

推荐官方 CLI：

```
hermes plugins install fishlikeX/Hermes-Where-My-Tokens --enable
```

或 clone 后手动：`python install.py`（只写两处安装路径 + config.yaml 的 plugins.enabled，幂等，保 CRLF/LF 风格）。

装完在桌面侧边栏出现「**我的词元去哪了？**」（图标=历史时间线）。桌面没自动刷新的话：⌘K / Ctrl+K → **Reload desktop plugins**。

## 看板口径（重要，数字对不上先查这）

- **累计 token 含缓存读**（`cache_read_tokens`）。本地推理 / prompt caching 场景下这一项常占总量的 90%+，与"净输入"口径差数倍属正常。
- **按会话首条 API 调用归日**（`first_seen`）。跨零点长会话整段记入起始日；做精确日报需按 `last_seen` 拆分，本页不做。
- **日期一律按你机器的系统时区归日**。REST 层只出 UTC epoch 秒，前端从系统时钟取本地偏移显式传参——北京机器看到北京周一起始的格子，柏林机器看到柏林的。没有任何写死的 "+8"。
- 连续活跃天数**从昨天锚定**（当天会话未落账前不算断，见代码注释）。
- 「最长会话」上限 7 天：跨网关重启永不关账的僵尸会话会被滤除（详见代码内注释）。

## 信任边界

- 数据库以 `mode=ro` 只读打开；插件不注册任何钩子（`register()` 是 no-op），不改任何文件，不碰任何会话。
- 零网络请求；统计不出本机。
- `hermes plugins validate` 全项通过（manifest / loadable / desktop surface / 无 core rebind）。

MIT · fishlikeX
