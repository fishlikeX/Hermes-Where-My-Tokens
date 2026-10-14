# Where My Tokens? · 我的词元去哪了？

A private token-analytics dashboard for your own Hermes agent — a zcode / GitHub-contributions-style usage page: activity heatmap, 30-day trend, top-5 model breakdown, active streaks. Every number comes from your local `state.db`. **Strictly read-only. Nothing leaves your machine.**

([中文说明](README.md))

## Install

Official CLI (preferred):

```
hermes plugins install fishlikeX/Hermes-Where-My-Tokens --enable
```

Or clone and run `python install.py` (touches only the two install paths plus `plugins.enabled` in config.yaml; idempotent, preserves the file's newline style).

A sidebar entry **"Where My Tokens?"** appears in the desktop app. If it doesn't show up live: ⌘K / Ctrl+K → **Reload desktop plugins**.

## Metric definitions (read this before filing "the numbers look wrong")

- **Lifetime tokens include cache reads** (`cache_read_tokens`). With local inference / prompt caching this is routinely 90%+ of the total — a several-fold gap versus a "net input" figure is expected, not a bug.
- **Days are bucketed by each session's first API call** (`first_seen`). A session that straddles midnight lands entirely on its start day.
- **All dates render in the viewer's system timezone.** The REST layer only ever emits UTC epoch seconds; the desktop page derives the machine's own UTC offset (`-new Date().getTimezoneOffset()/60`) and passes it explicitly. There is no hardcoded `+8` anywhere — a Berlin install paints Berlin Mondays, a Beijing install paints Beijing's.
- Active streaks anchor on **yesterday** (the live session has not billed yet, so "today so far" going dark at noon must not zero your streak).
- "Longest session" is capped at 7 days: sessions left open across gateway restarts are indistinguishable from marathon chats, and zombie rows are common (34 on the author's board).

## Trust boundary

- SQLite opened `mode=ro` — the plugin cannot write to state.db even if it wanted to.
- Zero hooks (`register()` is a documented no-op), zero file mutations, zero network calls.
- Passes `hermes plugins validate` (manifest / loadable / desktop surface / no core rebinds).

MIT · fishlikeX
