# هوش‌یار — Pluggable storage core (دیتابیسِ جداشده از سرور اپلیکیشن)
# ------------------------------------------------------------------------------
# WHY: the school's data (students, teachers, exams, attempts, mastery) must
# SURVIVE the app server. The app server is disposable — you can kill it,
# redeploy it, or switch to a brand-new host without losing a single row,
# because the data lives in its own database:
#
#   • PostgreSQL  (production / Docker):  HOOSHYAR_DSN=postgresql://user:pass@dbhost:5432/hooshyar
#     — the DB runs as a SEPARATE service (own container/host), on its own
#       durable volume, with its own backups. Point ANY app server at the same
#       DSN and it serves the exact same students/teachers/results.
#   • SQLite      (dev / single-machine fallback):  HOOSHYAR_DB=/path/hooshyar.db
#     — zero-config default, byte-for-byte compatible API. If no env var is
#       set, the file lives next to this script (hooshyar.db).
#
# Everything else in this module is engine-agnostic: the same SQL with `?`
# placeholders runs on both engines (translated to %s for psycopg), rows are
# always mapping-like (row["col"]), and snapshots are portable JSON so you can
# move a database between machines/engines with `tools/db_tool.py migrate`.
from __future__ import annotations
import json, os, re, time

DEFAULT_SQLITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hooshyar.db")

# ---------------------------------------------------------------- resolution
def resolve(override: str | None = None) -> tuple[str, str]:
    """Return (engine, target) from env. Precedence:
       1) explicit override (path or postgres:// DSN — used by CLI/tests)
       2) HOOSHYAR_DSN / DATABASE_URL  → PostgreSQL
       3) HOOSHYAR_DB (sqlite path)    → SQLite
       4) default ./hooshyar.db        → SQLite
    """
    raw = override if override else (
        os.environ.get("HOOSHYAR_DSN") or os.environ.get("DATABASE_URL")
        or os.environ.get("HOOSHYAR_DB") or DEFAULT_SQLITE)
    if raw.startswith(("postgres://", "postgresql://")):
        return ("postgres", raw)
    if raw.startswith("sqlite:///"):
        return ("sqlite", raw[len("sqlite:///"):])
    return ("sqlite", raw)

def describe(override: str | None = None) -> dict:
    """Human-readable info for /health and `db_tool.py info`."""
    kind, target = resolve(override)
    if kind == "postgres":
        # postgresql://user:***@host:port/db — hide the password
        m = re.match(r"postgres(?:ql)?://([^:/@]+)(?::[^@/]*)?@([^:/@]+):?(\d*)/([^?]+)", target)
        shown = f"@{m.group(2)}:{m.group(3)}/{m.group(4)}" if m else "(dsn)"
        return {"engine": "postgres", "target": shown, "var": "HOOSHYAR_DSN"}
    return {"engine": "sqlite", "target": target, "var": "HOOSHYAR_DB"}

# ---------------------------------------------------------------- connection
SCHEMA = [
    "CREATE TABLE IF NOT EXISTS users   (id TEXT PRIMARY KEY, role TEXT, name TEXT, profile TEXT)",
    "CREATE TABLE IF NOT EXISTS exams   (id TEXT PRIMARY KEY, creator TEXT, title TEXT, qs TEXT, published INTEGER, at DOUBLE PRECISION)",
    "CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, exam_id TEXT, user_id TEXT, ans TEXT, res TEXT, at DOUBLE PRECISION)",
    "CREATE TABLE IF NOT EXISTS stats   (user_id TEXT, lesson TEXT, p DOUBLE PRECISION, t DOUBLE PRECISION)",
]
TABLES = ["users", "exams", "attempts", "stats"]

class Conn:
    """Engine-agnostic connection: `?`-placeholders + mapping rows + the same
    context-manager contract on SQLite and PostgreSQL.

        with connect() as con:
            row = con.execute("SELECT * FROM users WHERE id=?", ("s0",)).fetchone()
            con.execute("UPDATE ...", (...))     # auto COMMIT on clean exit
    Rollback happens on exception; the underlying connection is always closed.
    """
    def __init__(self, raw, kind: str):
        self._raw, self.kind = raw, kind
    def __getattr__(self, name):                 # commit/rollback/close/cursor…
        return getattr(self._raw, name)
    def execute(self, sql, params=()):
        if self.kind == "postgres":
            sql = sql.replace("?", "%s")         # codebase SQL is written in `?` dialect
        return self._raw.execute(sql, params or ())
    def executemany(self, sql, seq):
        if self.kind == "postgres":
            sql = sql.replace("?", "%s")
            cur = self._raw.cursor()          # psycopg3: executemany lives on cursors
            cur.executemany(sql, seq)
            return cur
        return self._raw.executemany(sql, seq)
    def __enter__(self):
        return self
    def __exit__(self, et, ev, tb):
        try:
            if et is None:
                self._raw.commit()
            else:
                self._raw.rollback()
        finally:
            try: self._raw.close()
            except Exception: pass

def connect(override: str | None = None) -> Conn:
    """Open a connection to whatever engine the environment (or `override`)
    selects. SQLite needs nothing; PostgreSQL needs `pip install psycopg[binary]`."""
    kind, target = resolve(override)
    if kind == "postgres":
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError:
            raise RuntimeError("HOOSHYAR_DSN is set (PostgreSQL) but psycopg is missing — "
                               "run: pip install 'psycopg[binary]>=3.1'")
        return Conn(psycopg.connect(target, row_factory=dict_row, connect_timeout=8), "postgres")
    import sqlite3
    if target != ":memory:" and os.path.dirname(target):
        os.makedirs(os.path.dirname(target), exist_ok=True)
    con = sqlite3.connect(target, timeout=15)
    con.row_factory = sqlite3.Row
    return Conn(con, "sqlite")

def create_schema(con: Conn) -> None:
    for ddl in SCHEMA:
        con.execute(ddl)

# ---------------------------------------------------------------- snapshots
def cols_of(con: Conn, table: str) -> list[str]:
    return [d[0] for d in con.execute(f"SELECT * FROM {table} LIMIT 0").description]

def snapshot(con: Conn) -> dict:
    """Full, portable JSON snapshot of every table (students, teachers, exams,
    attempts, mastery rows). Engine-agnostic: restores onto SQLite or PostgreSQL."""
    out = {"app": "hooshyar-db", "v": 1, "engine": con.kind,
           "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    for t in TABLES:
        cols = cols_of(con, t)
        # value-aligned rows (sqlite Row and psycopg dict_row differ in iteration,
        # so index explicitly per column — engine-agnostic snapshots)
        rows = [[r[c] for c in cols] for r in con.execute(f"SELECT * FROM {t}")]
        out[t] = {"cols": cols, "rows": rows}
    return out

def counts(con: Conn) -> dict[str, int]:
    return {t: con.execute(f"SELECT COUNT(*) n FROM {t}").fetchone()["n"] for t in TABLES}

def restore(con: Conn, snap: dict, confirm_even_if_students: bool = True) -> dict[str, int]:
    """Wipe + load a snapshot produced by snapshot(). Schema is created first so
    restoring onto an empty/fresh database (even a different engine) works."""
    if not isinstance(snap, dict) or "users" not in snap or snap.get("app") != "hooshyar-db":
        raise ValueError("not a هوش‌یار snapshot (created by db_tool.py backup or GET /admin/backup)")
    create_schema(con)
    for t in TABLES:
        cols, rows = snap[t]["cols"], snap[t]["rows"]
        if not cols:
            continue
        con.execute(f"DELETE FROM {t}")
        if rows:
            ph = ",".join("?" for _ in cols)
            con.executemany(f"INSERT INTO {t} ({','.join(cols)}) VALUES ({ph})", [tuple(r) for r in rows])
    con.commit()
    return counts(con)

def read_snapshot(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def write_snapshot(path: str, snap: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=1)

def transfer(src: Conn, dst: Conn) -> dict[str, int]:
    """Zero-loss move: snapshot everything from `src`, restore into `dst`
    (engine-agnostic — SQLite ⇄ PostgreSQL both directions)."""
    return restore(dst, snapshot(src))
