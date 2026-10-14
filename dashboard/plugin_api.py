"""Dashboard REST surface for `我的词元去哪了？` — /api/plugins/where-my-tokens/.

Read-only analytics over Hermes' own state.db. Deliberately timezone-pure:
every timestamp leaves this module as raw UTC epoch seconds and every daily
bucket is derived in Python with an explicit timezone argument. Rendering
locality (system timezone) is the client's job — the server never bakes in
'+8 hours' or any other viewer-specific offset, so the same build shows a
Beijing user their Beijing days and a Berlin user their Berlin days.

Data source notes (verified against live state.db, 2026-10):
- `session_model_usage` is the ledger: one row per (session, model) with
  input/output/cache token counts, api_call_count, first_seen/last_seen.
- `messages.token_count` is mostly NULL — never sum it for totals.
- timestamps are Unix SECONDS (float), not milliseconds.
- open sessions have ended_at NULL ("still talking") and no usage rows yet,
  so live streaks anchor on yesterday, not on "today so far".
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

WEEKS_DEFAULT = 26
TREND_DAYS = 30
TOP_MODELS = 5


# ── state.db discovery ─────────────────────────────────────────────
def _db_path() -> Path:
    """Locate state.db the same way Hermes itself does. HERMES_HOME wins;
    Windows falls back to %LOCALAPPDATA%\\hermes, POSIX to ~/.hermes."""
    home = os.environ.get("HERMES_HOME")
    if home:
        base = Path(home)
    elif os.name == "nt":
        local = os.environ.get("LOCALAPPDATA")
        if not local:
            raise HTTPException(500, "cannot locate Hermes home (set HERMES_HOME)")
        base = Path(local) / "hermes"
    else:
        base = Path.home() / ".hermes"
    db = base / "state.db"
    if not db.exists():
        raise HTTPException(404, f"state.db not found at {db}")
    return db


def _query(sql: str, params: tuple = ()) -> list[tuple]:
    """Open read-only; never block behind WAL writers (busy_timeout + WAL)."""
    db = sqlite3.connect(f"file:{_db_path()}?mode=ro", uri=True, timeout=10)
    try:
        db.execute("PRAGMA busy_timeout = 10000")
        return db.execute(sql, params).fetchall()
    except sqlite3.Error as exc:
        raise HTTPException(500, f"state.db read failed: {exc}")
    finally:
        db.close()


# ── timezone-pure day bucketing ────────────────────────────────────
def _local_tz() -> timezone:
    """Machine timezone as a fixed offset (correct for streaks/heatmaps;
    DST-boundary sessions may shift by one hour, never by a whole day
    unless the session straddles the switch — acceptable for analytics)."""
    return timezone(timedelta(seconds=-time.timezone))


def _day_of(ts: float, tz: timezone) -> str:
    return datetime.fromtimestamp(ts, tz).date().isoformat()


# ── model label cleanup ────────────────────────────────────────────
def _model_label(model: str) -> str:
    """GGUF paths like /home/u/models/x-mtp.gguf render as the basename;
    normal model names pass through."""
    name = (model or "").replace("\\", "/").rsplit("/", 1)[-1]
    if name.lower().endswith(".gguf"):
        name = name[: -len(".gguf")]
    return name or "(unknown)"


# ── endpoints ──────────────────────────────────────────────────────
@router.get("/days")
def days(
    tz: float = Query(
        ...,
        description="Viewer timezone offset in hours east of UTC, e.g. 8 for "
        "UTC+8, -5 for UTC-5. The desktop page derives it from the machine "
        "clock: -new Date().getTimezoneOffset()/60",
    ),
    weeks: int = Query(WEEKS_DEFAULT, ge=1, le=104),
    year: Optional[int] = Query(
        None, ge=2000, le=2100,
        description="Calendar year (viewer timezone) to return IN FULL — "
        "overrides the rolling `weeks` window. Used by the year browser.",
    ),
) -> dict[str, Any]:
    """Per-day token totals + sessions + calls, bucketed in the viewer's tz.

    Daily bucketing needs the VIEWER's timezone, which the REST layer cannot
    know — so raw epoch seconds stay canonical here and the client supplies
    its system offset explicitly. No viewer-specific '+8 hours' is ever
    baked into this server."""
    if not (-12 <= tz <= 14):
        raise HTTPException(400, "tz must be within UTC-12..UTC+14")
    if not isinstance(weeks, int):  # direct calls (tests/smoke) bypass FastAPI
        weeks = WEEKS_DEFAULT
    tzinfo = timezone(timedelta(hours=tz))

    rows = _query(
        """
        SELECT first_seen,
               input_tokens + output_tokens + cache_read_tokens + cache_write_tokens,
               api_call_count
        FROM session_model_usage
        WHERE first_seen IS NOT NULL
        """
    )

    per_day_tokens: dict[str, int] = defaultdict(int)
    per_day_calls: dict[str, int] = defaultdict(int)
    per_day_sessions: dict[str, set] = defaultdict(set)
    sess_model_rows = _query(
        "SELECT session_id, first_seen FROM session_model_usage WHERE first_seen IS NOT NULL"
    )
    seen_sessions: set[str] = set()
    for sid, first in sess_model_rows:
        day = _day_of(first, tzinfo)
        per_day_sessions[day].add(sid)

    for first_seen, tok, calls in rows:
        day = _day_of(first_seen, tzinfo)
        per_day_tokens[day] += int(tok or 0)
        per_day_calls[day] += int(calls or 0)

    now = datetime.now(tzinfo)
    today = now.date()
    days_out = [
        {
            "date": d,
            "tokens": per_day_tokens.get(d, 0),
            "calls": per_day_calls.get(d, 0),
            "sessions": len(per_day_sessions.get(d, ())),
        }
        for d in sorted(per_day_tokens)
    ]

    # Streaks anchor on yesterday: the live session hasn't billed yet, so
    # "today" going dark mid-day must not zero the streak (state.db pitfall).
    active = {d["date"]: d["tokens"] > 0 for d in days_out}

    streak = 0
    probe = today if active.get(today.isoformat(), False) else today - timedelta(days=1)
    while streak < 3660 and active.get(probe.isoformat(), False):
        streak += 1
        probe -= timedelta(days=1)

    best = cur = 0
    prev: Optional[date] = None
    for d in sorted(k for k in active if active[k]):
        day = date.fromisoformat(d)
        cur = cur + 1 if prev and (day - prev).days == 1 else 1
        best = max(best, cur)
        prev = day

    total = sum(int(t or 0) for _, t, _ in rows)
    calls_total = sum(int(c or 0) for _, _, c in rows)
    peak_day = max(days_out, key=lambda d: d["tokens"], default=None)

    sess = _query(
        """
        SELECT count(*),
               max(CASE WHEN ended_at IS NOT NULL AND ended_at > started_at
                             AND ended_at - started_at < 7 * 86400
                        THEN ended_at - started_at END)
        FROM sessions
        """
    )[0]  # 7-day cap: sessions left open across gateway restarts are
    # indistinguishable from genuinely long-lived chat threads, so this card
    # is an upper-bound estimate for conversations under a week (34 known
    # multi-week zombies on the author's board, 2026-10).
    sessions_total, longest_secs = int(sess[0] or 0), float(sess[1] or 0)

    horizon = today - timedelta(weeks=weeks + 1)
    if isinstance(year, int):
        prefix = f"{year}-"  # iso dates are zero-padded; prefix match is exact
        window = [d for d in days_out if d["date"].startswith(prefix)]
    else:
        window = [d for d in days_out if date.fromisoformat(d["date"]) >= horizon]

    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "tz_offset_hours": tz,
        "year": year if isinstance(year, int) else None,
        "totals": {
            "tokens": total,
            "calls": calls_total,
            "sessions": sessions_total,
            "longest_session_hours": round(longest_secs / 3600, 1),
            "peak_day": peak_day["date"] if peak_day else None,
            "peak_day_tokens": peak_day["tokens"] if peak_day else 0,
            "streak_days": streak,
            "best_streak_days": best,
        },
        "days": window,
    }


@router.get("/years")
def years(tz: float = Query(..., description="Viewer timezone offset, hours east of UTC")) -> dict[str, Any]:
    """Calendar years that have any billed activity, newest first, with the
    per-year token sum — the year navigator's fuel."""
    if not (-12 <= tz <= 14):
        raise HTTPException(400, "tz must be within UTC-12..UTC+14")
    tzinfo = timezone(timedelta(hours=tz))
    rows = _query(
        """
        SELECT first_seen,
               input_tokens + output_tokens + cache_read_tokens + cache_write_tokens
        FROM session_model_usage WHERE first_seen IS NOT NULL
        """
    )
    per_year: dict[int, int] = defaultdict(int)
    for first_seen, tok in rows:
        per_year[datetime.fromtimestamp(first_seen, tzinfo).year] += int(tok or 0)
    active = sorted((y for y, t in per_year.items() if t > 0), reverse=True)
    return {
        "years": [
            {"year": y, "tokens": per_year[y], "past": y < datetime.now(tzinfo).year}
            for y in active
        ]
    }


@router.get("/models")
def models(limit: int = Query(TOP_MODELS, ge=1, le=30)) -> dict[str, Any]:
    """Lifetime token share by model, GGUF paths de-noised."""
    if not isinstance(limit, int):  # direct calls (tests/smoke) bypass FastAPI
        limit = TOP_MODELS
    rows = _query(
        """
        SELECT model,
               sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens),
               sum(api_call_count)
        FROM session_model_usage
        GROUP BY model
        HAVING sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) > 0
        ORDER BY 2 DESC
        LIMIT ?
        """,
        (limit,),
    )
    label_tokens: dict[str, int] = defaultdict(int)
    label_calls: dict[str, int] = defaultdict(int)
    for model, tok, calls in rows:
        label = _model_label(model)
        label_tokens[label] += int(tok or 0)
        label_calls[label] += int(calls or 0)
    ranked = sorted(label_tokens.items(), key=lambda kv: -kv[1])[:limit]
    total = sum(label_tokens.values()) or 1
    return {
        "models": [
            {
                "model": label,
                "tokens": tok,
                "calls": label_calls[label],
                "share": round(tok / total, 4),
            }
            for label, tok in ranked
        ],
        "models_total_tokens": total,
    }


# import-time sanity: the module must import even when state.db is absent
if __name__ == "__main__":  # manual smoke: python plugin_api.py [tz_hours]
    tz = float(sys.argv[1]) if len(sys.argv) > 1 else -time.timezone / 3600
    d = days(tz=tz)
    print("totals:", d["totals"])
    print("recent:", d["days"][-3:])
    print("models:", [m["model"] for m in models()["models"]])
