#!/usr/bin/env python3
# هوش‌یار — database toolbox (works without the API / fastapi installed)
# ------------------------------------------------------------------------------
# The app server is disposable; the DATABASE is what survives. This tool gives
# you the three operations that matter when a server dies or you switch hosts:
#
#   info                                  where is the DB + row counts
#   backup  OUT.json                      full portable snapshot (all data)
#   restore IN.json [--yes]               wipe + reload a snapshot
#   migrate [--from SRC] --to DST         zero-loss move SQLite ⇄ PostgreSQL
#
# "Source"/"target" selection:
#   * flag --from / --to: any sqlite path or postgresql:// DSN
#   * no flags: whatever the environment says (HOOSHYAR_DSN → PostgreSQL,
#     HOOSHYAR_DB → SQLite; default ./hooshyar.db)
#
# Examples
#   python tools/db_tool.py info
#   python tools/db_tool.py backup backups/school-2026-09-09.json
#   python tools/db_tool.py restore backups/school-2026-09-09.json --yes
#   python tools/db_tool.py migrate --from hooshyar.db \
#       --to postgresql://hooshyar:pass@dbhost:5432/hooshyar
import argparse, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import hooshyar_db as hd


def arg_parse():
    p = argparse.ArgumentParser(prog="db_tool.py", description="هوش‌یار database toolbox")
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("info"); i.add_argument("--from", dest="src")
    b = sub.add_parser("backup"); b.add_argument("out"); b.add_argument("--from", dest="src")
    r = sub.add_parser("restore"); r.add_argument(dest="infile"); r.add_argument("--to", dest="dst")
    r.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    m = sub.add_parser("migrate"); m.add_argument("--from", dest="src"); m.add_argument("--to", dest="dst", required=True)
    return p.parse_args()


def main():
    a = arg_parse()
    if a.cmd == "info":
        conn = hd.connect(a.src)
        with conn:
            print(json.dumps({**hd.describe(a.src), "rows": hd.counts(conn)},
                             ensure_ascii=False, indent=1))
    elif a.cmd == "backup":
        conn = hd.connect(a.src)
        with conn:
            snap = hd.snapshot(conn)
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        hd.write_snapshot(a.out, snap)
        print(f"✅ backup saved: {a.out}")
        print(json.dumps({t: len(v["rows"]) for t, v in snap.items()
                          if isinstance(v, dict) and "rows" in v}, ensure_ascii=False))
    elif a.cmd == "restore":
        snap = hd.read_snapshot(a.infile)
        conn = hd.connect(a.dst)
        with conn:
            hd.create_schema(conn)            # fresh target file may not have tables yet
            before = hd.counts(conn)
            total = sum(len(v["rows"]) for k, v in snap.items() if k in hd.TABLES)
            if not a.yes:
                print(f"restore {a.infile}  →  {a.dst}")
                print(f"will REPLACE current rows {json.dumps(before, ensure_ascii=False)}"
                      f" with {total} snapshot rows. type YES to continue:")
                if input("> ").strip() != "YES":
                    print("aborted — nothing changed"); sys.exit(1)
            hd.restore(conn, snap)
            after = hd.counts(conn)
        print("✅ restored:", json.dumps(hd.describe(a.dst), ensure_ascii=False))
        print("rows now:", json.dumps(after, ensure_ascii=False))
    elif a.cmd == "migrate":
        src = hd.connect(a.src)
        with src:
            snap = hd.snapshot(src)
            print("snapshot source:", json.dumps(hd.describe(a.src), ensure_ascii=False),
                  {t: len(v["rows"]) for t, v in snap.items() if t in hd.TABLES})
        dst = hd.connect(a.dst)
        with dst:
            hd.create_schema(dst)             # fresh target may have no tables yet
            before = hd.counts(dst)
            hd.restore(dst, snap)
            after = hd.counts(dst)
        print("✅ migrated →", json.dumps(hd.describe(a.dst), ensure_ascii=False))
        print(f"before: {json.dumps(before, ensure_ascii=False)}\nafter:  {json.dumps(after, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
