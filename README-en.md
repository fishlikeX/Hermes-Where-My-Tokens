<div align="center">

# Where My Tokens? · 我的词元去哪了？

![Plugin](https://img.shields.io/badge/Hermes-plugin-7c3aed)
![Readonly](https://img.shields.io/badge/state.db-mode%3Dro-22c55e)
![Hooks](https://img.shields.io/badge/hooks-zero-green)
![Network](https://img.shields.io/badge/network__calls-zero-06b6d4)
![Deps](https://img.shields.io/badge/python__deps-none-22c55e)
![Validate](https://img.shields.io/badge/plugins__validate-pass%20%C2%B7%20scan%20safe-16a34a)
![License](https://img.shields.io/badge/License-MIT-f97316)

([中文说明](README.md))

</div>

---

A **private usage ledger dashboard** for [Hermes Agent](https://github.com/NousResearch/hermes-agent):
a GitHub-contributions-style token activity heatmap, a 30-day bar trend, top-5 model
breakdown, and streak stats. Every number is computed from your local `state.db` —
**opened read-only, zero outbound requests, the ledger never leaves your machine**.

## Why

Hermes already ships a usage page — the ledger is not invisible. This plugin exists
for a humbler reason: the author thinks the GitHub-contributions heatmap is gorgeous
and wanted one living in the sidebar, over the very same `state.db`. Along the way the
metric definitions got written down and published below, so every number can be
re-verified with plain SQLite.

## Features

- **Activity heatmap** — GitHub-style week grid; five intensity levels bucketed by
  **quantiles over active days**. Peak-ratio bucketing was tried and rejected: local
  inference ledgers are brutally long-tailed (a 300M day versus typical millions),
  and ratio cuts flatten nine-tenths of the board into one color. The month axis
  follows GitHub's exact semantics (a month's 1st owns its week-column; year-spanning
  windows never merge two Decembers); labels follow the UI locale — `Oct` in English,
  「10月」 in Chinese.
- **Year browser** — a 最近 ⇄ by-year switch plus `‹ ›` arrows in the panel header,
  walking only years that actually have activity; selecting a year draws the full
  53-column calendar. The choice persists across pane switches and restarts via the
  plugin's private storage.
- **30-day trend** — endpoint date labels Hermes-usage-page style; no wrapping or
  smearing on narrow panes.
- **Top-5 destinations** — tokens aggregated per model; bar length = share.
- **Seven stat cards** — lifetime tokens / API calls / sessions / active streak /
  longest active streak / peak day / longest session.
- **Live page-width control** — header input (`0` = fill the pane), persisted;
  fixes "empty on big screens, cramped on small ones".

## Install

Requires [Hermes Agent](https://github.com/NousResearch/hermes-agent). Zero Python
dependencies, zero network access. The desktop app renders the dashboard; the six
read-only stats endpoints work REST-side without it.

```
hermes plugins install fishlikeX/Hermes-Where-My-Tokens --enable
```

Or clone and run `python install.py` (locates `$HERMES_HOME`, writes only the two
install paths plus `plugins.enabled` in config.yaml; idempotent, preserves the
file's newline style, refuses to write anything when the `plugins:` anchor is absent).

A sidebar entry **"Where My Tokens?"** (bill-card icon) appears in the desktop app.
If it doesn't show up live: ⌘K / Ctrl+K → **Reload desktop plugins**.

## Metric definitions (read this before filing "the numbers look wrong")

- **Lifetime tokens include cache reads** (`cache_read_tokens`). With local inference
  / prompt caching this is routinely 90%+ of the total — a several-fold gap versus a
  "net input" figure is expected, not a bug.
- **Days are bucketed by each session's first API call** (`first_seen`). A session
  straddling midnight lands entirely on its start day; precise daily reports would
  split by `last_seen`, this page deliberately doesn't.
- **All dates render in the viewer's system timezone.** The REST layer only ever
  emits UTC epoch seconds; the page derives the machine's own offset and passes it
  explicitly. No hardcoded `+8` anywhere — a Berlin install paints Berlin Mondays.
- **Active streaks anchor on yesterday** — the live session hasn't billed yet, so a
  quiet afternoon must not zero your streak.
- **"Longest session" is capped at 7 days** — zombie sessions left open across
  gateway restarts get filtered (the author's own ledger had 34 of them).

## Trust boundary

Verify any plugin's capability surface before enabling it. Ours, in full:

| Dimension | Reality |
|---|---|
| Database | Opened `mode=ro` — it cannot write to `state.db` even if it wanted to |
| Network | No outbound requests (no `urllib` / `requests` / `socket` / `subprocess` in source) |
| Hooks | **Zero** — `register()` is a documented no-op; no veto, no mutation, no voting |
| Writes | No files written; preferences (width / year view) live in the desktop SDK's per-plugin storage |
| Credentials | Never reads config.yaml, environment, tokens or keys |
| Backend | Six read-only stats endpoints (`/days` `/sessions` `/models` `/peak` `/streak` `/years`), served inside the plugin host (`plugins.isolation: host`) |
| Uninstall | `hermes plugins remove where-my-tokens`; deleting the folder leaves nothing behind — no daemons, no source patches |

Official gate, measured 2026-10-15: `hermes plugins validate` — **all checks passed,
security scan — safe**.

## Status

- [x] Read-only stats backend (FastAPI, 6 endpoints, viewer-timezone day bucketing)
- [x] Desktop dashboard (heatmap / trend / destinations / stat cards; bilingual by UI locale)
- [x] Year browser (switch + arrow stepping, persisted)
- [x] Live page-width control, persisted
- [x] Quantile bucketing (GitHub's own quintiles), theme-following tint
- [x] Headless calendar/codec matrix (year-spanning month axis, polluted-storage rejection, arrow boundaries)
- [x] Passes the official `hermes plugins validate` gate (scan safe)

## License

MIT · fishlikeX
