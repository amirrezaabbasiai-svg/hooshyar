# هوش‌یار — storage-core tests: the database is separate from the API server,
# so these tests prove a snapshot taken on one machine/engine restores exactly
# on another (SQLite ⇄ PostgreSQL), plus the /admin/backup endpoint contract.
import os, sys, json, subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hooshyar_db as hd

from fastapi.testclient import TestClient
import hooshyar_backend as hb

# fresh throwaway DB (same env rules as test_hooshyar_backend.py)
if not os.environ.get("HOOSHYAR_DSN"):
    os.environ["HOOSHYAR_DB"] = "/tmp/hooshyar_dbtest.db"
    if os.path.exists("/tmp/hooshyar_dbtest.db"):
        os.remove("/tmp/hooshyar_dbtest.db")

client = TestClient(hb.app)
with hb.db() as con:
    hb.init_db(con)

BA = {"Authorization": "Bearer " + client.post("/auth/login", json={"uid": "b1"}).json()["token"]}
TA = {"Authorization": "Bearer " + client.post("/auth/login", json={"uid": "t1"}).json()["token"]}
PG_DSN = os.environ.get("HOOSHYAR_TEST_PG_DSN")


def rows_of(con, t):
    cols = hd.cols_of(con, t)          # works for sqlite Row AND psycopg dict rows
    return [tuple(r[c] for c in cols) for r in con.execute(f"SELECT * FROM {t} ORDER BY 1")]


def seed_school(con, activity=True):
    """Fresh school on any engine: real backend seeding (1 admin + 12 teachers
    + 18 students) + a published exam, an attempt and one mastery row."""
    hb.init_db(con)                       # seeds the demo roster (users empty → fill)
    if activity:
        con.execute("INSERT INTO exams VALUES(?,?,?,?,?,?)",
                    ("e1", "t1", "آزمون تست", '[]', 1, 1700000000.5))
        con.execute("INSERT INTO attempts VALUES(?,?,?,?,?,?)",
                    ("a1", "e1", "s0", '[]', json.dumps({"pct": 66.7}), 1700000100.25))
        con.execute("INSERT INTO stats VALUES(?,?,?,?)", ("s0", "zist", 66.7, 1700000100.25))
        con.commit()


def test_env_resolution_defaults_to_sqlite(monkeypatch):
    monkeypatch.delenv("HOOSHYAR_DSN", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("HOOSHYAR_DB", raising=False)
    kind, target = hd.resolve()
    assert kind == "sqlite" and target.endswith("hooshyar.db")
    kind2, target2 = hd.resolve("postgresql://u:p@h:5432/x")
    assert kind2 == "postgres" and "u:p@h" in target2


def test_snapshot_restore_roundtrip_sqlite(tmp_path):
    src = hd.connect(str(tmp_path / "src.db")); seed_school(src)
    with src:
        snap = hd.snapshot(src)
        before = hd.counts(src)
        src_rows = {t: rows_of(src, t) for t in hd.TABLES}
    # write/read through the JSON file — exactly what backup/restore does
    f = tmp_path / "backup.json"; hd.write_snapshot(str(f), snap)
    snap2 = hd.read_snapshot(str(f))

    dst = hd.connect(str(tmp_path / "dst.db"))
    with dst:
        hd.restore(dst, snap2)
        assert hd.counts(dst) == before
        for t in hd.TABLES:
            assert rows_of(dst, t) == src_rows[t]  # byte-exact per row
    # demo roster present: 1 admin + 12 teachers + 18 students
    names = {r[0]: r[2] for r in snap2["users"]["rows"]}
    assert names["b1"] == "مدیر مدرسه" and "t12" in names and len([u for u in names if u.startswith("s")]) == 18


def test_restore_rejects_garbage(tmp_path):
    dst = hd.connect(str(tmp_path / "x.db"))
    with dst:
        try:
            hd.restore(dst, {"foo": 1})
            raise AssertionError("expected ValueError")
        except ValueError:
            pass


def test_transfer_engine_agnostic(tmp_path):
    """SQLite → SQLite transfer via the same path `migrate` uses; PG variant
    below runs when HOOSHYAR_TEST_PG_DSN is set (real Postgres)."""
    src = hd.connect(str(tmp_path / "a.db")); seed_school(src)
    with src:
        snap = hd.snapshot(src)
    dst = hd.connect(str(tmp_path / "b.db"))
    with dst:
        hd.restore(dst, snap)
        assert hd.counts(dst)["users"] == 31 and hd.counts(dst)["attempts"] == 1


def test_admin_backup_endpoint():
    r = client.get("/admin/backup", headers=BA)
    assert r.status_code == 200
    snap = r.json()
    assert snap["app"] == "hooshyar-db"
    for t in hd.TABLES:
        assert t in snap and "cols" in snap[t] and "rows" in snap[t]
    # live roster: 1 admin + 12 teachers (t1..t12) + 18 students
    u = snap["users"]["rows"]
    roles = {}
    for row in u:
        roles[row[1]] = roles.get(row[1], 0) + 1
    assert roles == {"admin": 1, "teacher": 12, "student": 18}, roles
    assert client.get("/admin/backup", headers=TA).status_code == 403  # teachers: no
    assert client.get("/admin/backup").status_code == 401              # anonymous: no


def test_db_tool_cli_backup_restore(tmp_path):
    """End-to-end CLI: backup from one SQLite file, restore into a second one."""
    env = dict(os.environ, HOOSHYAR_DSN="", DATABASE_URL="", HOOSHYAR_DB=str(tmp_path / "src.db"))
    root = os.path.dirname(os.path.abspath(__file__))
    # make a live db via API helpers (login not needed — direct core calls)
    con = hd.connect(str(tmp_path / "src.db")); seed_school(con)
    with con:
        pass
    out = str(tmp_path / "bk.json")
    p = subprocess.run([sys.executable, "tools/db_tool.py", "backup", out], env=env,
                       cwd=root, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    assert "users" in json.load(open(out))
    env2 = dict(env, HOOSHYAR_DB=str(tmp_path / "dst.db"))
    p = subprocess.run([sys.executable, "tools/db_tool.py", "restore", out, "--yes"],
                       env=env2, cwd=root, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    assert '"users": 31' in p.stdout or "users" in p.stdout
    with hd.connect(str(tmp_path / "dst.db")) as con:
        assert hd.counts(con)["users"] == 31 and hd.counts(con)["attempts"] == 1


def _pg_roundtrip(dsn: str, tmp_path):
    import psycopg
    with psycopg.connect(dsn, autocommit=True) as root:
        # dedicated scratch database, dropped afterwards
        root.execute("DROP DATABASE IF EXISTS hooshyar_dbtest")
        root.execute("CREATE DATABASE hooshyar_dbtest")
    db = dsn.rsplit("/", 1)[0] + "/hooshyar_dbtest"

    # 1) populate a SQLite school, snapshot it
    src = hd.connect(str(tmp_path / "src.db"))
    seed_school(src)
    with src:
        snap = hd.snapshot(src)

    # 2) restore onto real PostgreSQL
    dst = hd.connect(db)
    with dst:
        hd.restore(dst, snap)
        assert hd.counts(dst)["users"] == 31
        # Persian round-trip + float precision survive the engine switch
        row = dst.execute("SELECT name, profile FROM users WHERE id='s0'").fetchone()
        assert row["name"] == "علی" and json.loads(row["profile"])["class"] == "هفتم"
        st = dst.execute("SELECT p,t FROM stats WHERE user_id='s0'").fetchone()
        assert abs(st["p"] - 66.7) < 1e-9 and abs(st["t"] - 1700000100.25) < 1e-6

    # 3) and back again: PostgreSQL → SQLite — rows byte-exact
    dst2 = hd.connect(db)                    # fresh connection (dst closed above)
    with dst2:
        snap2 = hd.snapshot(dst2)
        pg_counts = hd.counts(dst2)
        pg_rows = {t: rows_of(dst2, t) for t in hd.TABLES}
    back = hd.connect(str(tmp_path / "back.db"))
    with back:
        hd.restore(back, snap2)
        assert hd.counts(back) == pg_counts
        for t in hd.TABLES:
            assert rows_of(back, t) == pg_rows[t]
    # connect to the server's admin database, not the one being dropped
    with psycopg.connect(dsn.rsplit("/", 1)[0] + "/postgres", autocommit=True) as root:
        root.execute("DROP DATABASE IF EXISTS hooshyar_dbtest")


def test_postgres_roundtrip_real(tmp_path):
    if not PG_DSN:
        import pytest
        pytest.skip("set HOOSHYAR_TEST_PG_DSN=postgresql://… to run the real-Postgres test")
    _pg_roundtrip(PG_DSN, tmp_path)
