# 🎓 هوش‌یار (Hooshyar)

**AI-powered exam & adaptive-learning system for Iranian high schools** — exam generation, automatic grading (تستی + تشریحی), per-lesson analytics, and personalized study plans, built for the Konkur/امتحانات نهایی reality where school grades carry 60% of university admission.

> هوش (intelligence) + یار (companion) = Hooshyar

---

## What's in this repo

| File | Layer | What it is |
|---|---|---|
| `hooshyar_backend.py` | **API** | FastAPI backend: auth, exam generation (with **per-teacher subject scoping**), Gate-A approval, publish, attempts (Konkur negative-marking formula), tashrihi rubric grading, mastery, planner, class heatmap. **Stateless/disposable**: all data lives in the separate database (see `hooshyar_db.py`) |
| `hooshyar_db.py` | **Storage** | Pluggable database core — **the data is decoupled from the server**: PostgreSQL via `HOOSHYAR_DSN` (production/Docker, separate service + volume) or SQLite via `HOOSHYAR_DB` (dev default). Same SQL on both engines + portable JSON snapshots (`snapshot`/`restore`) so a crash or a full server switch loses nothing |
| `hooshyar_questions.py` | Data | **Auto-generated** from the prototype — full school curriculum: 18 subjects · 134 lessons · 348 bank MCQ + 132 bank tashrihi (دورهٔ اول: علوم/ریاضی/مطالعات هفتم تا نهم + دورهٔ دوم) + deterministic generator templates |
| `tools/export_questions.js` | Tool | Single-source exporter: edits go in `hooshyar-prototype.html`, then `node tools/export_questions.js` regenerates the backend data |
| `tools/db_tool.py` | Tool | Database toolbox (no fastapi needed): `info` / `backup` / `restore` / `migrate` — works with SQLite ⇄ PostgreSQL, engine-agnostic JSON snapshots |
| `hooshyar-prototype.html` | **Frontend** | Self-contained Persian RTL app — works fully **offline** (in-browser engine) and **online** (connects to the API). Boss/teacher/student panels |
| `hooshyar-blueprint.md` | Docs | Product & technical blueprint (architecture, data model, modules, risks) |
| `hooshyar-roadmap.md` | Docs | 12-month execution plan on the Iranian academic calendar with 4 Go/No-Go gates |
| `hooshyar-tests.js` | Tests | 303 assertions for the frontend engine (`node hooshyar-tests.js`) |
| `tests/e2e_browser.js` | Tests | 198 jsdom browser-flow assertions (`bash tests/run-e2e.shell`, self-installs jsdom) |
| `test_hooshyar_backend.py` + `test_hooshyar_db.py` | Tests | 27 API + storage tests (`pytest`; the same suite also runs against a real PostgreSQL when `HOOSHYAR_DSN` is set) |

## Quick start

**Easiest (2 seconds):** double-click **`hooshyar-prototype.html`** — it runs fully offline in any browser. Log in with the on-screen quick-pick buttons: 🏢 `admin` · 🧑‍🏫 `teacher`…`teacher12` · 🎒 `stu0`…`stu17` — password `1234` everywhere. Data auto-saves in the browser (localStorage).

### 1. Backend

```bash
pip install -r requirements.txt   # or: pip install fastapi "uvicorn[standard]" pytest httpx "psycopg[binary]"
uvicorn hooshyar_backend:app --port 8000     # dev: SQLite file ./hooshyar.db (zero config)
# interactive docs → http://localhost:8000/docs
```

- **Where is the data?** By default SQLite (`HOOSHYAR_DB`, file next to the script). For a real deployment the database is a **separate service** — set `HOOSHYAR_DSN=postgresql://user:pass@dbhost:5432/hooshyar` (or `DATABASE_URL`) and every table (students, teachers, exams, attempts, mastery) lives there, outside the app server. `GET /health` reports which engine the instance is attached to.

Demo credentials: teachers `t1`..`t12` (one per subject — `t10` علوم، `t11` ریاضی و `t12` مطالعات اجتماعی دورهٔ اول متوسطه, each scoped to their own درس) · students `s0`..`s17` (2 per class × 9 classes) · boss `b1`.

### 2. Frontend

Open **`hooshyar-prototype.html`** in any browser — no build step.
- **Offline mode** (default): everything runs in the browser; use 🔁 تغییر کاربر to play teacher/student roles, load demo data, take exams.
- **Online mode**: on the آزمون‌ساز tab, enter `http://localhost:8000` + uid (`t1` or `s0`…), hit اتصال. Now exams, grading and plans are served by the backend.

### 3. Docker (production — database as a separate service)

```bash
cp .env.example .env     # set a REAL POSTGRES_PASSWORD
docker compose up -d --build
curl http://localhost:8000/health    # → "engine": "postgres"
```

`docker compose up` starts **two** containers: `db` (PostgreSQL, data on the named volume `hooshyar-pgdata`) and `api` (stateless FastAPI that only talks to the db over `HOOSHYAR_DSN`). The api container can be stopped, rebuilt, crashed or deleted at any time — the data is not inside it.

## 🗄️ Database is separate — no data loss when the server dies or you switch hosts

The school's data (students, teachers, exams, attempts, per-lesson mastery) is **never stored inside the app server anymore**. Storage goes through `hooshyar_db.py`, which runs the same schema and the same SQL on either engine:

| | Engine | When | Survives… |
|---|---|---|---|
| **PostgreSQL** | `HOOSHYAR_DSN` | production / Docker / shared hosting | api crash ✅ redeploy ✅ new host ✅ (db is its own service/volume) |
| **SQLite** | `HOOSHYAR_DB` | dev / single machine | api crash ✅ — but it's a file on the same disk, so move it to Postgres for real resilience |

**Zero-loss server-switch runbook (PostgreSQL):**

```bash
# on the OLD host: dump the database (data is in the db volume/service, not the api)
docker compose exec db pg_dump -U hooshyar hooshyar | gzip > hooshyar-$(date +%F).sql.gz

# on the NEW host: same .env (POSTGRES_PASSWORD), same compose file
rsync hooshyar-*.sql.gz new-host:~
docker compose up -d --build
# if the volume was not copied:  gunzip -c hooshyar-2026-xx-xx.sql.gz | docker compose exec -T db psql -U hooshyar hooshyar
curl http://localhost:8000/health          # → engine postgres
# every student/teacher/exam/attempt row is back — nothing to re-enter
```

**Even more portable: JSON snapshots, engine-agnostic.** `GET /admin/backup` (boss token) or `python tools/db_tool.py backup out.json` dumps *all* tables as one portable JSON file; `db_tool.py restore out.json --yes` rebuilds it onto **any** database — PostgreSQL, SQLite, another machine, another OS:

```bash
python tools/db_tool.py info                              # engine + row counts
python tools/db_tool.py backup backups/school-$(date +%F).json
python tools/db_tool.py migrate --from hooshyar.db \      # move an old SQLite school
    --to postgresql://hooshyar:pass@dbhost:5432/hooshyar  #    to PostgreSQL, zero-loss
python tools/db_tool.py restore backups/school-2026-09-09.json --yes
```

Restores are transactional per table and validated (bad files are refused). The API auto-seeds the demo roster only when the `users` table is empty, so a restored database keeps exactly what was backed up. Automated nightly dumps = a cron line calling `db_tool.py backup` or `pg_dump` (see above) into a `backups/` folder that you copy off-host.

**Proven by tests + a live crash drill:** `pytest` runs the whole suite on SQLite *and* (with `HOOSHYAR_DSN` set) on a real PostgreSQL — including a snapshot taken on Postgres restoring byte-exact onto SQLite and back. Verified live: create exam + attempt on Postgres → kill the api process → start a brand-new api instance → student still logs in and sees her published exam with her old score; admin still sees 18 students / 12 teachers.

## Verified end-to-end demo loop

1. Teacher generates exam → **Gate A blocks publish** until AI questions approved ✅
2. Teacher approves → publishes → student sees it in آزمون‌های منتشرشده
3. Student takes exam (تستی + تشریحی) → server grades with official formula `((صحیح×3 − غلط) × 100) / (کل×3)`
4. Mastery updates per lesson → adaptive weekly plan regenerates (weakness × ضریب × forgetting)
5. Teacher's class dashboard shows the real heatmap + psychometric flags (bad questions, trap options)

### 🕸 Spider (radar) chart for students

- In **تحلیل عملکرد**, students now get a **spider chart** instead of the flat per-lesson bar list: one big radar for the selected **درس** (each axis = one مبحث of that درس, centre = ۰٪, edge = ۱۰۰٪) with **subject chips** to switch درس, plus a **mini radar per subject** showing the whole-skill shape at a glance.
- Untested lessons are drawn as **hollow dots at the centre** with a «هنوز ارزیابی نشده» tooltip, so the shape honestly shows what the student hasn't been assessed on yet. Values feed on the same mastery model (۵۵٪ last + ۴۵٪ mean) as before.
- The old linear bars aren't lost — they live in a collapsed **«نمای فهرستی»** list under the spider card, and the trend line + مباحث بحرانی cards are unchanged. Pure hand-rolled SVG (no chart library, works offline in the single-file demo); teachers preview the same spider when they open a student's profile. Unit-pinned in `hooshyar-tests.js` ([27]) and in the E2E flow (E2E-21).

## Run tests

```bash
node hooshyar-tests.js              # frontend engine (303)
bash tests/run-e2e.shell            # full browser flows in jsdom (198)
python3 -m pytest test_hooshyar_backend.py test_hooshyar_db.py -q   # API+storage (27)
# the same suite against a REAL PostgreSQL:
HOOSHYAR_DSN=postgresql://user:pass@host:5432/hooshyar \
HOOSHYAR_TEST_PG_DSN=$HOOSHYAR_DSN \
  python3 -m pytest test_hooshyar_backend.py test_hooshyar_db.py -q
```

### 🔀 Anti-cheat shuffle + 🖨 printable student report card

- **ضد تقلب (per-student shuffle):** every student who joins an online exam receives their own **question order + option order**, derived deterministically from `(exam | student)` — a refresh re-opens the SAME personalised sheet, neighbours can't copy, and grading stays exact because the key travels with its options (unit-pinned: no question lost, permutations valid, fully-correct sheet still scores 100٪). جامع exams keep their دفترچه subject blocks (shuffle only *inside* each درس, like real Konkur booklet codes); تشریحی items stay last; the teacher's A4 print + paper/OMR flow keeps the canonical sheet; server exams stay canonical for answer alignment (roadmap).
- **🖨 کارنامهٔ چاپی دانش‌آموز:** one A4 report for parents & the student file — summary stats (آزمون‌ها، میانگین درصد، مباحث بحرانی), published-exam table with rank-in-class, per-lesson mastery with last-practice age, تراز تخمینی (labelled درون‌مدرسه‌ای), honesty footer (روبریک تشریحی + فرمول رسمی کنکور) and signature lines. Students get **«چاپ کارنامهٔ من»** under «نتایج من»; staff get a per-student 🖨 button inside class leaderboards (students never see the staff button — pinned in E2E). Zero-exam students still get a graceful one-pager.

### ✍️ Exam-composition modes (تستی / تشریحی / ترکیبی) + printable weekly plan

- **نوع آزمون selector** in the teacher builder: **ترکیبی** (MCQs + ۱–۲ نهایی-style riders, the default) · **فقط تستی** (کنکور-style practice, zero essays) · **کاملاً تشریحی — بدون تستی** (امتحانات نهایی style, zero MCQs). Essay-only exams pull verified bank tashrihi first; when the bank runs dry, the SimulatedLLM writes process-focused drafts (توضیح/مثال/مراحل — no invented facts) that **wait in the Gate-A approval queue** like any AI question. Grading a zero-MCQ exam uses the rubric mean (never 0/NaN), teacher overrides re-sync the headline percent, and the exam room + paper printout explain the essay-only mode. Post-publish titles are flagged «آزمون تشریحی». Server parity: `POST /exams/generate` accepts `kind: mix|mcq|tashrihi` with the same rules.
- **✍️ تشریحی با واژه‌های کلیدی معلم (the main essay workflow):** the teacher writes the question and the **important words** of the answer (optional per-word points, e.g. `آئورت:۴۰، مویرگ:۳۵، دهلیز:۲۵`). Students never see that list. After they write, the engine (normalized Persian/Arabic) checks which words appear and scores `sum of found weights` (always out of 100). Button **«ساخت آزمون تشریحی فقط از سؤال‌های من»** publishes only those teacher questions — no AI filler. Teacher panel **«بازبینی تشریحی»** shows each student’s text + ✓/✗ per word and lets the teacher override the grade.
- **📋 بانک امتحان نهایی + هماهنگ:** 90+ past تشریحی items — نهایی for دهم تا دوازدهم and **امتحان هماهنگ/خرداد for every هفتم/هشتم/نهم lesson** (علوم + ریاضی، ۲ سؤال در هر مبحث) with model answer + keyword rubric. Badge is «امتحان نهایی» or «امتحان هماهنگ». Teacher picks from the bank the same way Konkur MCQs are reused; keyword AI grades the student.
- **🖨 چاپ برنامهٔ هفته** on the student plan now actually prints the plan: it renders a dedicated A4 sheet (student/class header, day-by-day tasks with minutes + ★ priority, rest days, parent/teacher signature lines) into the print area first. (Bugfix: the button used to fire `window.print()` raw — the print stylesheet only shows `#printarea`, which still held the last *exam* sheet or nothing.)

### 🎯 Target class per exam + real Konkur questions

- **Target classes:** teacher publish dialog (checkboxes) and boss جامع (select) can publish to specific class(es) among the nine; students of other classes never see the exam; results/manual entry/ranks are scoped inside the target group (📌 badges everywhere) and participation denominators follow the target group (targetCount), not a hardcoded roster size. No selection = whole school.
- **Real Konkur import:** verified questions harvested from the internet (gama.ir typed pages with official-style answers+explanations) live in the bank with `k:1, y:1404` metadata and 🎓 کنکور سراسری badges in the preview. Honest scale story: mass sources are PDF/image/rate-limited → the scalable channel is **📥 bulk paste-import** in the teacher panel: `سؤال * گزینه۱..۴ * شمارهٔ صحیح` per line, straight into the draft basket (teacher stays the Gate-A approver).

### Brand & classes — هفتم تا دوازدهم (۹ کلاس)

The app is branded **TA — دستیار هوشمند معلم (Teacher Assistant)**. Students belong to **nine** real classes, each a separate group of 2 demo students:
`هفتم · هشتم · نهم` (دورهٔ اول متوسطه) + `دهم تجربی · یازدهم تجربی · دوازدهم تجربی · دهم ریاضی · یازدهم ریاضی · دوازدهم ریاضی` (دورهٔ دوم). The boss panel compares all nine; new students pick one of the nine; backend seeds mirror the same scheme.

**دورهٔ اول متوسطه curriculum** — lesson lists taken from the official آموزش‌وپرورش textbooks (علوم تجربی، ریاضی و مطالعات اجتماعی، ۱۴۰۳-۱۴۰۴): 9 subjects (`olum7/8/9`, `riazi7/8/9`, `mot7/8/9`) × 5 textbook chapters + bank MCQ/تشریحی + generator templates (جمع اعداد صحیح علامت‌دار، aᵐ×aⁿ، فیثاغورث). Three teacher accounts for it (`teacher10` علوم، `teacher11` ریاضی، `teacher12` مطالعات اجتماعی — each scoped across its three grades). **Grade-scoped curriculum everywhere:** seeded profiles, plan pages and any lesson list only cover the student's own grade — a هفتم kid never sees زیست‌شناسی دوازدهم content. Draft baskets are teacher-scoped too (a zist teacher's draft never rides into the علوم teacher's exam).

All destructive/confirm flows (delete student, blank-exam finish, clear data) use a **custom in-app modal** — the native browser dialog is blocked inside sandboxed previews, which previously made buttons look dead.

### آزمون جامع کنکوری (boss one-click, end-of-year)

The boss panel can publish a school-wide **آزمون جامع کنکوری** in one click: configurable per-subject counts (زیست/شیمی/فیزیک/ریاضی, defaults 8/8/6/6), all تستی, questions grouped by subject like the real دفترچه. Same school rules apply (one attempt + join window). After finishing, each student's report stores a per-subject درصد (official negative formula) + **تراز تخمینی** (documented demo mapping ۱۰۰۰…۱۰۰۰۰, in-school comparison only) — shown in «نتایج من» as کارنامهٔ جامع and in the boss panel as a school results table with ranks and averages.

### Memory & backup (۳ لایه)

1. **localStorage** — every mutation auto-saves; refresh loses nothing on the same device (in sandboxed previews the browser may block storage → use layer 2).
2. **Backup file** — boss panel downloads `hooshyar-backup.json` (full state) and can restore it anywhere (`exportState`/`importState`, roster rebuilt authoritatively).
3. **Server DB — separate from the app server** — all API data lives in its own database (`hooshyar_db.py`): PostgreSQL (`HOOSHYAR_DSN`, own service/volume in Docker) or SQLite (`HOOSHYAR_DB`, dev). Crash / redeploy / new host ⇒ zero loss; `GET /admin/backup` (JSON) or `tools/db_tool.py` snapshots move everything between engines and machines; every device sees one truth via the `apiFetch` sync point.

### Admin roster management (new school year)

The boss panel (🏢 مدیر) includes **مدیریت دانش‌آموزان**: remove graduates and add newcomers each year. New accounts log in immediately (default pass `1234`); deletions wipe account + history + exam results; ids are monotone (`stuSeq`) so a graduate's username is never reused. Roster changes persist across refresh via `state.stuExtra` / `state.stuRemoved`, and every student list (results, manual paper-score entry, login quick-pick) reads the live roster.

## Architecture (blueprint §4)

```
PWA (this HTML)  ──REST──>  FastAPI ──hooshyar_db──>  PostgreSQL   (separate db service:
                                                        own container/volume — api is
                                                        stateless & disposable)
                                        │   dev fallback: SQLite (HOOSHYAR_DB)
                    LLM adapter interface ──> today: SimulatedLLM (templates)
                                        │     prod: self-hosted vLLM + textbook RAG
                                        └── sanctions-resilient: no foreign API in the critical path
```

**Production swaps** (marked in code): LLM adapter → vLLM · dev SQLite → PostgreSQL **already an env switch** (`HOOSHYAR_DSN`, live-tested) · manual OMR entry → OpenCV scanning · keyword tashrihi grading → LLM rubric grading.

## Trust rules (non-negotiable, from the roadmap)

- **Gate A**: no AI-generated question reaches students before a teacher approves it — enforced server-side (publish returns `400`).
- Teachers approve/edit all AI grades (تشریحی review queue).
- Student answers never include answer keys; keys never leave the backend.

---

*Built as a phased MVP: Phase 0 content engine → Phase 1 exam loop → Phase 2 adaptive analytics → Phase 3 LLM grading & OMR at scale.*
