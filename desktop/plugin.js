// 我的词元去哪了？ Where My Tokens? — desktop page for the where-my-tokens plugin.
// Pure-JS ESM, hot-loaded from <hermes-home>/desktop-plugins/ (bare imports:
// @hermes/plugin-sdk + react only).
// HARD RULES inherited from the sibling plugin (owner caught blanks twice):
//  - React.createElement (h) with positional children; jsx(type, config, key)
//    drops positional children -> blank page. Never here.
//  - every optional SDK seam (ctx.i18n.*) is capability-checked; one missing
//    API must never throw inside register().
//  - no hardcoded colors: heat scale rides --ui-accent via color-mix().
// Timezone: day bucketing asks the BACKEND with this machine's own UTC offset
// (-new Date().getTimezoneOffset()/60). Nothing on this page assumes UTC+8;
// a Berlin install paints Berlin Mondays, a Beijing install paints Beijing's.
import {
  host,
  ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA,
} from '@hermes/plugin-sdk'
import { createElement as h, useCallback, useEffect, useState } from 'react'

const ID = 'where-my-tokens'
const PATH = '/where-my-tokens'
const MAXW_DEFAULT = 880 // px; 0 in the control means "no cap, fill the pane"
// The installed shell's ctx.storage behaves like ONE slot per plugin: after
// the heatmap year was stored, the width input read "2026" back across a pane
// switch (owner, 2026-10-15) — separate keys are NOT separate on that build.
// So everything persists as ONE self-describing string under PREF_KEY. Values
// the decoder doesn't recognize (bare numbers, junk from old builds sharing
// the slot) degrade to defaults instead of leaking into a control.
const PREF_KEY = '***'
const PREFS_DEFAULT = { maxw: MAXW_DEFAULT, recent: true, year: null }
// Second-tier memory: module scope survives Page remounts (pane switches)
// even on shells without ctx.storage; hot-reload resets it, as it should.
let cachedPrefs = null
// encode/decode: "w=880" | "w=880;r=0;y=2026". decode validates every field.
function encodePrefs(p) {
  const bits = ['w=' + p.maxw]
  if (!p.recent) bits.push('r=0')
  if (p.year) bits.push('y=' + p.year)
  return bits.join(';')
}
function decodePrefs(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('w=')) return null
  const out = { maxw: -1, recent: true, year: null }
  for (const bit of raw.split(';')) {
    const v = bit.slice(2)
    if (bit.slice(0, 2) === 'w=') {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) return null
      out.maxw = Math.min(n, 4000)
    } else if (bit.slice(0, 2) === 'r=') out.recent = v !== '0'
    else if (bit.slice(0, 2) === 'y=') {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 2000 || n > 2100) return null
      out.year = n
    } else return null
  }
  if (out.maxw < 0) return null
  if (!out.recent && !out.year) out.recent = true // year mode without a year decays to recent
  return out
}
// 5 intensity levels. Paint strengths; bucketing itself is quantile-based
// (see Heatmap). Bottom sits at 18% — on dark themes a fainter first tint
// is indistinguishable from an empty cell (owner: "too unclear", 2026-10-15).
const LEVEL_ALPHA = [18, 36, 55, 75, 100]

// color-mix() is dropped SILENTLY on Chromium < 111 Electron shells — every
// tinted panel rendered colorless on the owner's build (2026-10-15). Probe
// once; without support, paint full var() colors and encode the tint percent
// as leaf-element opacity (visually equivalent over any background).
const CAN_MIX = (() => {
  try {
    return !!(typeof CSS !== 'undefined' && CSS.supports &&
      CSS.supports('color', 'color-mix(in srgb, rgb(255 0 0) 10%, transparent)'))
  } catch (e) { return false }
})()
const tint = (pct, color) => {
  const c = color || 'var(--ui-accent)'
  return CAN_MIX
    ? { background: `color-mix(in srgb, ${c} ${pct}%, transparent)` }
    : { background: c, opacity: Math.max(pct / 100, 0.02) }
}
// containers cannot take opacity (it dims children) — overlay instead
const Overlay = ({ pct }) => CAN_MIX ? null : h('div', {
  style: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 'inherit',
    background: 'var(--ui-accent)', opacity: Math.max(pct / 100, 0.02),
    pointerEvents: 'none',
  },
})

const BUNDLES = {
  en: {
    nav: 'Where My Tokens?',
    title: 'Where My Tokens?',
    intro: 'Token analytics over your own Hermes state.db — read-only, all dates in your system timezone.',
    loading: 'reading the ledger…',
    backendError: 'backend error: ',
    enableHint: 'the Python half is not enabled — flip where-my-tokens on in Settings → Plugins (or add it to plugins.enabled in config.yaml), then reload.',
    tokens: 'lifetime tokens',
    calls: 'API calls',
    sessions: 'sessions',
    streak: 'active streak',
    bestStreak: 'longest active streak',
    peak: 'peak day',
    longest: 'longest session',
    heatmapTitle: 'Token activity',
    trendTitle: 'Last 30 days',
    modelsTitle: 'Where they went (top 5)',
    days: 'd',
    hrs: 'h',
    refreshed: 'refreshed',
    refresh: 'refresh',
    maxWidthHint: 'max width (px) · 0 = fill',
    maxWidthLabel: 'width',
    recent: 'recent',
    yearView: 'by year',
    prevYear: 'previous year',
    nextYear: 'next year',
    less: 'less',
    more: 'more',
    empty: 'no activity in range',
  },
  zh: {
    nav: '我的词元去哪了？',
    title: '我的词元去哪了？',
    intro: '读本机 Hermes state.db 的用量账——纯只读，日期一律按你系统的时区归日。',
    loading: '翻账本中…',
    backendError: '后端错误：',
    enableHint: 'Python 半边没启用——去 设置→插件 打开 where-my-tokens（或写进 config.yaml 的 plugins.enabled），然后重载。',
    tokens: '累计词元',
    calls: 'API 调用',
    sessions: '会话',
    streak: '连续活跃',
    bestStreak: '最长连续活跃',
    peak: '峰值日',
    longest: '最长会话',
    heatmapTitle: '词元活动热力图',
    trendTitle: '近 30 天',
    modelsTitle: '词元去向（前五）',
    days: '天',
    hrs: '小时',
    refreshed: '更新于',
    refresh: '刷新',
    maxWidthHint: '最大宽度(px) · 0=铺满',
    maxWidthLabel: '宽度',
    recent: '最近',
    yearView: '按年',
    prevYear: '上一年',
    nextYear: '下一年',
    less: '少',
    more: '多',
    empty: '区间内无活动',
  },
}

// ── formatting ─────────────────────────────────────────────────────
const fmtTok = (n, zh) => {
  n = Number(n) || 0
  if (zh) {
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿'
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万'
    return String(n)
  }
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}
const fmtInt = (n) => (Number(n) || 0).toLocaleString()

// ── tiny pieces ────────────────────────────────────────────────────
const cardBox = {
  border: '1px solid var(--ui-stroke-secondary)',
  borderRadius: 10, padding: '13px 16px', minWidth: 128,
  position: 'relative',
}
const Card = ({ value, label }) =>
  h('div', { style: cardBox },
    h(Overlay, { pct: 4 }),
    h('div', { style: { fontSize: 21, fontWeight: 700, color: 'var(--ui-accent)' } }, value),
    h('div', { style: { fontSize: 11.5, color: 'var(--ui-text-quaternary)', marginTop: 3 } }, label))

const Panel = ({ title, zh, extra, children }) => {
  // ONE child via h() arrives as a bare ReactElement (non-iterable) — the
  // exact source of "Spread syntax requires ...iterable" page crashes here.
  const kids = children == null ? [] : Array.isArray(children) ? children : [children]
  return h('div', {
    style: {
      border: '1px solid var(--ui-stroke-secondary)', borderRadius: 12,
      padding: '15px 18px', marginTop: 16, position: 'relative',
    },
  },
    h(Overlay, { pct: 3 }),
    h('div', { style: { display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ui-text-secondary)', marginBottom: 12 } },
      title, extra ? extra() : null),
    ...kids)
}

// GitHub semantics, exactly: a week-column gets a month label only when the
// calendar month's 1st falls INSIDE that week. 1st-days strictly increase,
// so labels are strictly monotone by construction — and each label is keyed
// by (year, month), so a year-spanning window can show two real Decembers
// (month-number keys once smeared 2025-12 across a跨年窗; caught by the
// test matrix, 2026-10-15). Windows starting mid-month simply show no label
// until the next 1st — GitHub's own behavior on rolling windows.
// Labels are locale-shaped by the caller: 中文 "10月" / GitHub-style "Oct".
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function monthLabels(start, end, fmtMonth) {
  const spans = Math.max(1, Math.round((end - start) / (7 * 86400000)) + 1)
  const arr = new Array(spans).fill('')
  const day = new Date(start)
  while (day <= end) {
    if (day.getDate() === 1) {
      const col = Math.floor((day - start) / (7 * 86400000))
      if (col >= 0 && col < spans && !arr[col]) arr[col] = fmtMonth(day.getMonth())
    }
    day.setDate(day.getDate() + 1)
  }
  return arr
}
function Heatmap({ days, weeks, year, zh, tr }) {
  // Grid of calendar columns (Mon-aligned), cells = weekday rows. Cells
  // stretch to the container (GitHub-style square stretch).
  //
  // Bucketing = quantiles over ACTIVE days only (GitHub's own quintile
  // scheme). A peak-ratio cut was tried first and failed visually: with a
  // 300M peak day and 1-10M normal days, log(10M)/log(300M) ≈ 0.67, so
  // almost every active day collapsed into one bucket and the board read
  // as a single flat color (owner: "too unclear", 2026-10-15).
  if (!days || !days.length) return h('div', { style: { color: 'var(--ui-text-quaternary)', fontSize: 12 } }, '—')
  const byDate = Object.fromEntries(days.map((d) => [d.date, d.tokens]))
  const active = days.map((d) => d.tokens).filter((t) => t > 0).sort((a, b) => a - b)
  const q = (p) => active.length ? active[Math.min(active.length - 1, Math.floor(active.length * p))] : 0
  const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)]
  const levelOf = (v) => { let n = 0; while (n < 4 && v >= cuts[n]) n++; return n }
  const today = new Date()
  const dayIdx = (today.getDay() + 6) % 7 // Mon=0
  let start, end, nWeeks
  if (year) {
    start = new Date(year, 0, 1)
    while ((start.getDay() + 6) % 7 !== 0) start.setDate(start.getDate() - 1)
    end = new Date(Math.min(today.getTime(), new Date(year, 11, 31).getTime()))
    while ((end.getDay() + 6) % 7 !== 6 && end > start) end.setDate(end.getDate() + 1)
    nWeeks = Math.round((end - start) / (7 * 86400000) + 0.001)
  } else {
    start = new Date(today)
    start.setDate(start.getDate() - dayIdx - 7 * (weeks - 1))
    end = new Date(Math.min(today.getTime(), start.getTime() + 7 * (weeks - 1) * 86400000 + 6 * 86400000))
    nWeeks = weeks
  }
  let labels = monthLabels(start, end, zh ? (m) => (m + 1) + '月' : (m) => MONTHS_EN[m])
  if (year) {
    // year view pads the grid with Monday-aligned weeks outside the calendar
    // year. A week keeps its label if ANY of its 7 days falls in the year
    // (GitHub draws "Jan" on the Dec29-Jan4 week — clearing by week-start
    // would eat that January); fully-outside padding columns go blank.
    const yStart = new Date(year, 0, 1).getTime()
    const yEnd = new Date(year, 11, 31).getTime()
    labels = labels.map((lb, i) => {
      const ws = start.getTime() + i * 7 * 86400000
      const we = ws + 6 * 86400000
      return (we >= yStart && ws <= yEnd) ? lb : ''
    })
  }
  const cols = []
  for (let w = 0; w < nWeeks; w++) {
    const cells = []
    for (let wd = 0; wd < 7; wd++) {
      const dt = new Date(start)
      dt.setDate(start.getDate() + w * 7 + wd)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      if (dt > today || (year && dt.getFullYear() !== year)) {
        cells.push(h('div', { key: wd, style: { borderRadius: 3, aspectRatio: '1 / 1', minHeight: 8, visibility: 'hidden' } }))
        continue
      }
      const v = byDate[key] || 0
      const lvl = levelOf(v)
      const cellStyle = lvl === 0
        ? { background: 'var(--ui-stroke-secondary)', opacity: 0.35 }
        : tint(LEVEL_ALPHA[lvl])
      cells.push(h('div', {
        key: wd, title: `${key} · ${fmtInt(v)}`,
        style: Object.assign({ borderRadius: 3, aspectRatio: '1 / 1', minHeight: 8 }, cellStyle),
      }))
    }
    cols.push(h('div', {
      key: w,
      style: { display: 'flex', flexDirection: 'column', gap: '0.4vmin', flex: '1 1 0', minWidth: 0 },
    }, ...cells))
  }
  const axis = h('div', {
    style: { display: 'flex', gap: '0.4vmin', marginTop: 5, fontSize: 9.5,
      color: 'var(--ui-text-quaternary)', userSelect: 'none' },
  },
    ...labels.map((lb, i) => h('div', {
      key: i, style: { flex: '1 1 0', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' },
    }, lb)))
  const legend = h('div', {
    style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
      fontSize: 11, color: 'var(--ui-text-quaternary)' },
  },
    tr('less'),
    ...LEVEL_ALPHA.map((a, i) => h('div', {
      key: i, title: i === 0 ? `≥ ${fmtInt(cuts[0])}` : (i < 4 ? `≥ ${fmtInt(cuts[i])}` : ''),
      style: Object.assign({ width: 11, height: 11, borderRadius: 3 }, tint(a)),
    })),
    tr('more'))
  return h('div', null,
    h('div', { style: { display: 'flex', gap: '0.4vmin', width: '100%' } }, ...cols),
    axis, legend)
}

function Trend({ days, zh }) {
  const last = days.slice(-30)
  if (!last.length) return h('div', { style: { color: 'var(--ui-text-quaternary)', fontSize: 12 } }, '—')
  const mx = Math.max(...last.map((d) => d.tokens), 1)
  const md = (iso) => { const p = iso.split('-'); return `${Number(p[1])}/${Number(p[2])}` }
  return h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 110 } },
      ...last.map((d) => h('div', {
        key: d.date, title: `${d.date} · ${fmtTok(d.tokens, zh)}`,
        style: Object.assign(
          { flex: 1, borderRadius: '2px 2px 0 0', minHeight: 2,
            height: `${Math.max(2, (d.tokens / mx) * 100)}%` },
          tint(62)),
      }))),
    // Hermes usage-page style: only the ends of the axis carry dates.
    // nowrap+no-shrink on both ends: when the pane is narrow they must
    // truncate apart, never wrap inward and smear into each other (owner,
    // 2026-10-15: first/last dates rendered "glued together").
    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5,
        fontSize: 10, color: 'var(--ui-text-quaternary)', userSelect: 'none' },
    },
      h('span', { style: { whiteSpace: 'nowrap', flexShrink: 0 } }, md(last[0].date)),
      h('span', { style: { whiteSpace: 'nowrap', flexShrink: 0 } }, md(last[last.length - 1].date))))
}

function ModelBars({ models, zh }) {
  if (!models || !models.length) return h('div', { style: { color: 'var(--ui-text-quaternary)', fontSize: 12 } }, '—')
  const mx = models[0].tokens || 1
  return h('div', null,
    ...models.map((m, i) => h('div', {
      key: m.model,
      style: { display: 'flex', alignItems: 'center', gap: 10, margin: '7px 0', fontSize: 12.5 },
    },
      h('div', {
        title: m.model,
        style: { width: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ui-text-secondary)' },
      }, m.model),
      h('div', { style: { flex: 1, height: 10, borderRadius: 5, background: 'var(--ui-stroke-secondary)' } },
        h('div', {
          style: Object.assign(
            { width: `${(m.tokens / mx) * 100}%`, height: '100%', borderRadius: 5 },
            tint(LEVEL_ALPHA[4 - Math.min(i, 4)])),
        })),
      h('div', { style: { width: 128, textAlign: 'right', color: 'var(--ui-text-quaternary)' } },
        `${fmtTok(m.tokens, zh)} · ${Math.round(m.share * 100)}%`))))
}

// ── page ───────────────────────────────────────────────────────────
function Page({ ctx, tr, zh }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  // ONE prefs object, one storage slot, string-encoded (see PREF_KEY note).
  // `recent` = rolling window; year mode browses calendar years via arrows.
  const [prefs, setPrefs] = useState(() => {
    try {
      // "storage answered" (trust its decode, null = default) vs no API (module cache)
      if (ctx.storage && typeof ctx.storage.get === 'function') {
        const v = decodePrefs(ctx.storage.get(PREF_KEY, ''))
        return v || PREFS_DEFAULT
      }
    } catch (e) { /* fall through to cache */ }
    return decodePrefs(cachedPrefs) || PREFS_DEFAULT
  })
  const savePrefs = (next) => {
    cachedPrefs = encodePrefs(next)
    try { if (ctx.storage && ctx.storage.set) ctx.storage.set(PREF_KEY, cachedPrefs) } catch (e) { /* session-only */ }
    setPrefs(next)
  }
  const maxw = prefs.maxw
  const yearModeOn = !prefs.recent
  const liveYears = () => (years || []).map((y) => y.year) // backend: newest first
  const saveMaxw = (next) => {
    const v = Math.max(0, Math.min(Math.round(next) || 0, 4000))
    savePrefs({ ...prefs, maxw: v })
  }
  const toggleRecent = () => {
    if (yearModeOn) savePrefs({ ...prefs, recent: true })
    else {
      // entering year mode lands on the newest year with activity, else current
      const ys = liveYears()
      const y = ys.length ? ys[0] : new Date().getFullYear()
      savePrefs({ ...prefs, recent: false, year: y })
    }
  }
  // ‹ toward the past, › toward the future (calendar intuition, owner-vetoed
  // GitHub's inverted mapping); walks only years with activity.
  const stepYear = (dir) => {
    const ys = liveYears() // newest first
    if (!ys.length) return
    let i = ys.indexOf(prefs.year)
    if (i === -1) i = dir < 0 ? 0 : 0 // entering from an unknown year: snap to newest
    else {
      const n = i - dir // dir<0 (‹, past) => next older = index+1 in a newest-first list
      if (n < 0 || n >= ys.length) return
      i = n
    }
    savePrefs({ ...prefs, recent: false, year: ys[i] })
  }
  const canStep = (dir) => {
    const ys = liveYears()
    if (!ys.length || !yearModeOn) return false
    const i = ys.indexOf(prefs.year)
    if (i === -1) return true
    return dir < 0 ? i + 1 < ys.length : i - 1 >= 0
  }
  // `years` (with activity) comes from /years on first load.
  const [years, setYears] = useState(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const tz = -new Date().getTimezoneOffset() / 60
      const urls = [
        ctx.rest(`/days?tz=${tz}&weeks=26${!prefs.recent && prefs.year ? `&year=${prefs.year}` : ''}`),
        ctx.rest('/models?limit=5'),
      ]
      if (!years) urls.push(ctx.rest(`/years?tz=${tz}`))
      const [days, models, yearsRes] = await Promise.all(urls)
      setData({ ...days, models: models.models })
      if (yearsRes) setYears(yearsRes.years || [])
      setErr(null)
    } catch (e) {
      const msg = String((e && (e.message || e.detail)) || e)
      setErr(msg.includes('404') || msg.includes('405') ? tr('enableHint') : msg)
    } finally {
      setBusy(false)
    }
  }, [ctx, tr, prefs, years])

  useEffect(() => { load() }, [load])

  // Heatmap view switch, in the panel header: a two-state segment picks
  // 最近 <-> 按年; the year itself walks with ‹ › (owner: one switch +
  // arrows beats a button-per-year strip, 2026-10-15).
  const yearRow = () => {
    const seg = (on, label, onClick) =>
      h('span', {
        onClick: on ? undefined : onClick,
        style: {
          padding: '2px 11px', fontSize: 11.5, userSelect: 'none',
          cursor: on ? 'default' : 'pointer',
          borderRadius: 999, // pill — owner: sharp rectangles read unfinished
          border: `1px solid ${on ? 'var(--ui-accent)' : 'var(--ui-stroke-secondary)'}`,
          background: on ? 'var(--ui-accent)' : 'transparent',
          color: on ? 'var(--ui-accent-invert, #fff)' : 'var(--ui-text-quaternary)',
          fontWeight: on ? 700 : 400,
        },
      }, label)
    const arrow = (dir, glyph, label, enabled) =>
      h('span', {
        title: label,
        onClick: enabled ? () => stepYear(dir) : undefined,
        style: {
          cursor: enabled ? 'pointer' : 'default', padding: '0 5px',
          color: enabled ? 'var(--ui-accent)' : 'var(--ui-text-quaternary)',
          opacity: enabled ? 1 : 0.35, userSelect: 'none', fontSize: 13,
        },
      }, glyph)
    const yearsLive = liveYears()
    const cur = prefs.year != null ? prefs.year : (yearsLive[0] ?? new Date().getFullYear())
    return h('span', {
      style: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center',
        gap: 4, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8,
        padding: '2px 4px', userSelect: 'none' },
    },
      seg(!yearModeOn, tr('recent'), toggleRecent),
      seg(yearModeOn, tr('yearView'), toggleRecent),
      // arrows only in year mode; disabled at the ends of the live-year list
      yearModeOn && yearsLive.length > 0 && h('span', {
        style: { display: 'inline-flex', alignItems: 'center', marginLeft: 4 },
      },
        arrow(-1, '‹', tr('prevYear'), canStep(-1)),
        h('span', { style: { minWidth: 38, textAlign: 'center', fontWeight: 600,
          color: 'var(--ui-text-secondary)', fontSize: 12 } }, String(cur)),
        arrow(1, '›', tr('nextYear'), canStep(1))))
  }

  if (err && !data) {
    return h('div', { style: { padding: '26px 30px', maxWidth: 860 } },
      h('div', { style: { fontSize: 17, fontWeight: 700, marginBottom: 10 } }, tr('title')),
      h('div', { style: { fontSize: 13, color: 'var(--ui-text-secondary)', whiteSpace: 'pre-wrap' } }, tr('backendError') + err))
  }
  if (!data) return h('div', { style: { padding: '26px 30px', color: 'var(--ui-text-quaternary)' } }, tr('loading'))

  const t = data.totals
  return h('div', {
    style: {
      padding: '22px 28px',
      // cap is owner-tunable live (header input, persisted); 0 = fill the pane
      maxWidth: maxw > 0 ? maxw : undefined,
      margin: maxw > 0 ? '0 auto' : undefined,
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
      h('div', { style: { fontSize: 18, fontWeight: 700 } }, tr('title')),
      h('div', {
        onClick: load,
        style: {
          fontSize: 11.5, cursor: 'pointer', color: busy ? 'var(--ui-text-quaternary)' : 'var(--ui-accent)',
          border: '1px solid var(--ui-stroke-secondary)', borderRadius: 6, padding: '3px 10px',
        },
      }, tr('refresh')),
      h('span', { style: { fontSize: 11, color: 'var(--ui-text-quaternary)' } }, tr('maxWidthLabel')),
      h('input', {
        type: 'number', min: 0, max: 4000, step: 20, value: maxw,
        title: tr('maxWidthHint'),
        onChange: (e) => saveMaxw(Number(e.target.value)),
        style: {
          width: 64, fontSize: 11.5, padding: '3px 8px', borderRadius: 6,
          marginLeft: 6,
          border: '1px solid var(--ui-stroke-secondary)',
          background: 'transparent', color: 'var(--ui-text-secondary)', outline: 'none',
        },
      }),
      h('div', { style: { fontSize: 11, color: 'var(--ui-text-quaternary)', marginLeft: 'auto' } },
        `${tr('refreshed')} ${data.generated_at ? data.generated_at.replace('T', ' ') : ''} (UTC${data.tz_offset_hours >= 0 ? '+' : ''}${data.tz_offset_hours})`)),
    h('div', { style: { fontSize: 12, color: 'var(--ui-text-quaternary)', margin: '6px 0 16px' } }, tr('intro')),

    // auto-fit grid: cards stretch to fill EVERY row evenly — with flex-wrap
    // the tail row sat at natural width and left a visible void on its right
    h('div', {
      style: {
        display: 'grid', gap: 12, marginBottom: 4,
        gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
      },
    },
      h(Card, { value: fmtTok(t.tokens, zh), label: tr('tokens') }),
      h(Card, { value: fmtInt(t.calls), label: tr('calls') }),
      h(Card, { value: fmtInt(t.sessions), label: tr('sessions') }),
      h(Card, { value: `${t.streak_days} ${tr('days')}`, label: tr('streak') }),
      h(Card, { value: `${t.best_streak_days} ${tr('days')}`, label: tr('bestStreak') }),
      h(Card, { value: `${fmtTok(t.peak_day_tokens, zh)}`, label: `${tr('peak')} ${t.peak_day || ''}` }),
      h(Card, { value: `${t.longest_session_hours} ${tr('hrs')}`, label: tr('longest') })),

    h(Panel, { title: tr('heatmapTitle'), zh, extra: yearRow },
      h(Heatmap, { days: data.days, weeks: 26, year: data.year || (!prefs.recent ? prefs.year : null), zh, tr })),
    h(Panel, { title: tr('trendTitle'), zh }, h(Trend, { days: data.days, zh })),
    h(Panel, { title: tr('modelsTitle'), zh }, h(ModelBars, { models: data.models, zh })))
}

// ── registration (i18n capability-checked; mirrors the proven sibling) ──
export default {
  id: ID,
  name: 'Where My Tokens? · 我的词元去哪了？',
  register(ctx) {
    const i18n = ctx.i18n
    let hasI18n = !!(i18n && typeof i18n.register === 'function' && typeof i18n.t === 'function')
    if (hasI18n) {
      try { i18n.register(BUNDLES) } catch (e) { hasI18n = false }
    }

    const zhGuess = () => {
      const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en'
      return lang.toLowerCase().startsWith('zh')
    }
    const makeTr = () => {
      if (hasI18n) {
        return (key) => {
          try {
            const v = i18n.t(key)
            return typeof v === 'string' && v ? v : (BUNDLES.en[key] || key)
          } catch (e) { return BUNDLES.en[key] || key }
        }
      }
      const b = zhGuess() ? BUNDLES.zh : BUNDLES.en
      return (key) => b[key]
    }

    const mount = () => {
      const tr = makeTr()
      const zh = (() => {
        const v = hasI18n ? i18n.t('nav') : null
        return typeof v === 'string' && v ? /[\u4e00-\u9fff]/.test(v) : zhGuess()
      })()
      ctx.registerMany([
        { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => h(Page, { ctx, tr, zh }) },
        { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: tr('nav'), codicon: 'gist-history' } },
        { id: 'open', area: PALETTE_AREA, data: { id: 'where-my-tokens.open', title: tr('nav'), run: () => host.navigate(PATH) } },
      ])
    }
    mount()
    if (hasI18n && typeof i18n.onLocaleChange === 'function') {
      i18n.onLocaleChange(() => mount())
    }
  },
}
