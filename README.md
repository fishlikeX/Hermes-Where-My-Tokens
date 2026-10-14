<div align="center">

# 我的词元去哪了？ · Where My Tokens?

![Plugin](https://img.shields.io/badge/Hermes-plugin-7c3aed)
![Readonly](https://img.shields.io/badge/state.db-mode%3Dro-22c55e)
![Hooks](https://img.shields.io/badge/hooks-zero-green)
![Network](https://img.shields.io/badge/network__calls-zero-06b6d4)
![Deps](https://img.shields.io/badge/python__deps-none-22c55e)
![Validate](https://img.shields.io/badge/plugins__validate-pass%20%C2%B7%20scan%20safe-16a34a)
![License](https://img.shields.io/badge/License-MIT-f97316)

[English](README-en.md)

</div>

---

给 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 装一块**私人用量账本看板**：
GitHub 贡献图同款的词元活动热力图、近 30 天柱状趋势、词元去向前五、连续活跃战绩。
每一个数字都从你本机的 `state.db` 算出来——**只读打开，零出站请求，账本不出本机**。

## 为什么需要它 / Why

Hermes 桌面端自带一块用量页，账不是没地方看。本插件的存在理由朴素得多：
作者就是馋 GitHub 贡献图那种热力图的颜值，想让它常驻侧边栏。
顺带把口径立了规矩：热力图、年份回看、去向前五全部从本机 `state.db` 现算，
统计口径写死并公开在下面的「看板口径」里，每个数字都可以拿 SQLite 复查。

## 看板长这样 / Features

- **活动热力图** — GitHub 贡献图同款周网格，五档深浅按**活跃日分位数**分桶。不用峰值比
  切法是实测出来的：本地推理账本长尾极重（一天 3 亿 vs 平常几百万），峰比切法会把九成
  格子糊成同一层颜色。月份轴按 GitHub 原版语义（每月 1 号落在哪列标哪列，跨年窗口不糊
  两个十二月），中文界面出「10月」、英文界面出 `Oct`，跟随界面语言自动切。
- **年份回看** — 面板右上角「最近 ⇄ 按年」开关 + `‹ ›` 箭头，只走**有账的年份**；选年
  即整年 53 列全景。选择写进插件私有存储，跨切页、跨重启都记得。
- **近 30 天柱状图** — 首尾日期标注（Hermes 官方用量页同款），窄面板下不折行不互叠。
- **词元去向前五** — 按模型聚合，条长即占比。
- **七张战绩卡** — 累计词元 / API 调用 / 会话数 / 连续活跃 / 最长连续活跃 / 峰值日 / 最长会话。
- **页宽实时可调** — 页头宽度输入框（`0` = 铺满），持久保存，治"大屏显空、小屏显挤"。

## 安装 / Install

前置条件：已安装 [Hermes Agent](https://github.com/NousResearch/hermes-agent)。
零 Python 依赖、零网络访问。桌面端负责看板；不装桌面也能装，六个只读统计端点照常可 REST 调用。

```
hermes plugins install fishlikeX/Hermes-Where-My-Tokens --enable
```

或 clone 后手动：`python install.py`（按 `$HERMES_HOME` 定位，只写两处安装路径 +
`config.yaml` 的 `plugins.enabled`，幂等，保留文件原有换行风格；没有 `plugins:` 块时
拒绝改写而不是乱写）。

装完桌面侧边栏出现「**我的词元去哪了？**」（图标=账单卡）。没自动刷新的话：
⌘K / Ctrl+K → **Reload desktop plugins**。

## 看板口径（数字对不上，先查这）/ Metric definitions

- **累计词元含缓存读**（`cache_read_tokens`）。本地推理 / prompt caching 场景下这一项
  常占总量的 90%+，与"净输入"口径差数倍属正常，不是 bug。
- **按会话首条 API 调用归日**（`first_seen`）。跨零点长会话整段记入起始日；做精确日报
  需按 `last_seen` 拆分，本页不做。
- **日期一律按查看者机器的系统时区归日**。REST 层只出 UTC epoch 秒，前端从系统时钟取
  本地偏移显式传参——北京机器看到北京周一起始的格子，柏林机器看到柏林的。代码里没有
  任何写死的 "+8"。
- **连续活跃从昨天锚定**：当天会话未落账前不算断——中午没跑机不会把你的连胜清零。
- **「最长会话」上限 7 天**：跨网关重启永不关账的僵尸会话会被滤除（作者本机账面就有 34 条）。

## 信任边界 / Trust boundary

启用第三方插件前请自行核对能力面。本插件的能力面如下：

| 维度 | 实况 |
|---|---|
| 数据库 | 以 `mode=ro` 只读打开——就算它想，也写不进 `state.db` |
| 网络 | 无任何出站请求（源码无 `urllib` / `requests` / `socket` / `subprocess`） |
| 钩子 | **零**——不注册任何钩子，Python 侧 `register()` 是文档化 no-op，不拦、不改、不投票 |
| 写入 | 不写任何文件；偏好（页宽 / 年份视图）走桌面 SDK 的插件私有存储 |
| 凭据 | 不读 config.yaml、不读环境变量、不碰 token/key |
| 后端 | 六个只读统计端点（`/days` `/sessions` `/models` `/peak` `/streak` `/years`），跑在插件宿主内（`plugins.isolation: host`） |
| 卸载 | `hermes plugins remove where-my-tokens`；删目录即彻底消失，无驻进程、不改 Hermes 源码 |

官方闸门实测（2026-10-15）：`hermes plugins validate` **全部通过，security scan — safe**。

## 状态 / Status

- [x] 只读统计后端（FastAPI，6 端点，按查看者时区归日）
- [x] 桌面看板（热力图 / 趋势 / 去向 / 战绩卡，随界面语言中英双语）
- [x] 年份回看（最近 ⇄ 按年 + 箭头步进，选择持久化）
- [x] 页宽实时调节 + 持久化
- [x] 热力图分桶 = 活跃日分位数（GitHub 同款五分位），色阶跟随主题
- [x] 日历/编解码逻辑无头矩阵验证（跨年月份轴、污染存储值拒收自愈、箭头步进边界）
- [x] 过官方 `hermes plugins validate`（scan safe）

## License

MIT · fishlikeX
