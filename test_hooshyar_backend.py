# Backend API tests — pytest + FastAPI TestClient (uses a throwaway DB).
# Default engine: SQLite in /tmp. Set HOOSHYAR_DSN=postgresql://… to run the
# SAME suite against a real PostgreSQL (data-independence is engine-agnostic).
import os, sys, json
if not os.environ.get("HOOSHYAR_DSN"):
    os.environ["HOOSHYAR_DB"] = "/tmp/hooshyar_test.db"
    if os.path.exists("/tmp/hooshyar_test.db"):
        os.remove("/tmp/hooshyar_test.db")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
import hooshyar_backend as hb

client = TestClient(hb.app)
with hb.db() as con:
    hb.init_db(con)

T = client.post("/auth/login", json={"uid": "t1"}).json()["token"]
S0 = client.post("/auth/login", json={"uid": "s0"}).json()["token"]
HT = {"Authorization": f"Bearer {T}"}
HS = {"Authorization": f"Bearer {S0}"}


def publish_exam(count=10):
    """helper: teacher generates → approves (Gate A) → publishes → exam_id"""
    r = client.post("/exams/generate", json={"lessons": ["dna", "khoon", "ph"], "count": count}, headers=HT).json()
    eid = r["exam_id"]
    assert client.post(f"/exams/{eid}/approve", headers=HT).status_code == 200
    assert client.post(f"/exams/{eid}/publish", headers=HT).status_code == 200
    return eid


def attempt_known(eid=None):
    """helper: student answers 6 correct / 2 wrong / 2 blank + perfect tashrihi"""
    eid = eid or publish_exam()
    with hb.db() as con:
        qs = json.loads(con.execute("SELECT qs FROM exams WHERE id=?", (eid,)).fetchone()["qs"])
    ans = [None] * len(qs)
    mcq = [(i, q) for i, q in enumerate(qs) if q.get("type") != "tashrihi"]
    for j, (i, q) in enumerate(mcq):
        if j < 6: ans[i] = q["a"]
        elif j < 8: ans[i] = (q["a"] + 1) % 4
    for i, q in enumerate(qs):
        if q.get("type") == "tashrihi": ans[i] = q["model"]
    r = client.post("/attempts", json={"exam_id": eid, "answers": ans}, headers=HS)
    assert r.status_code == 200
    return r.json()


def test_health():
    r = client.get("/health", headers={"Origin": "http://localhost:5500"})
    assert r.json()["ok"]
    assert r.headers.get("access-control-allow-origin") == "*"  # prototype can call API


def test_taxonomy_authed():
    r = client.get("/taxonomy", headers=HT)
    assert r.status_code == 200 and "zist" in r.json()
    assert client.get("/taxonomy").status_code == 401


def test_login_and_roles():
    assert client.post("/auth/login", json={"uid": "s0"}).json()["role"] == "student"
    assert client.post("/auth/login", json={"uid": "nobody"}).status_code == 404
    assert client.post("/exams/generate", json={"lessons": ["dna"]}, headers=HS).status_code == 403
    assert client.get("/class/heatmap", headers=HS).status_code == 403


def test_generate_gateA_publish_flow():
    r = client.post("/exams/generate", json={"lessons": ["dna", "khoon", "ph"], "count": 10}, headers=HT)
    data = r.json()
    mcq = [q for q in data["qs"] if q.get("type") != "tashrihi"]
    assert len(mcq) == 10
    assert any(q["src"] == "ai" and not q["approved"] for q in mcq)
    assert any(q.get("type") == "tashrihi" for q in data["qs"])
    eid = data["exam_id"]
    assert client.post(f"/exams/{eid}/publish", headers=HT).status_code == 400  # Gate-A blocks
    assert client.post(f"/exams/{eid}/approve", headers=HT).json()["approved"] == len(data["qs"])
    assert client.post(f"/exams/{eid}/publish", headers=HT).status_code == 200


def test_ai_generation_variety_and_shuffle():
    r = client.post("/exams/generate", json={"lessons": ["ph"], "count": 8}, headers=HT).json()
    ai = [q for q in r["qs"] if q["src"] == "ai"]
    assert ai and all(q["a"] in range(4) and len(q["o"]) == 4 for q in ai)
    assert len({tuple(q["o"]) for q in ai}) == len(ai)


def test_unknown_lessons_ignored():
    # frontend may send lesson ids the server doesn't know — must not crash or leak
    r = client.post("/exams/generate", json={"lessons": ["nonsense", "ph"], "count": 5}, headers=HT)
    assert r.status_code == 200
    assert all(q["l"] != "nonsense" for q in r.json()["qs"])
    r2 = client.post("/exams/generate", json={"lessons": ["nonsense"], "count": 5}, headers=HT)
    assert r2.status_code == 200 and len(r2.json()["qs"]) >= 5


def test_exam_view_hides_keys():
    eid = publish_exam()
    ex = client.get(f"/exams/{eid}", headers=HS).json()
    assert all("a" not in q for q in ex["qs"])
    pubs = client.get("/exams/published", headers=HS).json()
    assert any(p["exam_id"] == eid for p in pubs)


def test_konkur_grading_exact():
    res = attempt_known()
    assert res["c"] == 6 and res["w"] == 2 and res["b"] == 2
    assert res["pct"] == round((6 * 3 - 2) * 100 / (10 * 3), 2)  # 53.33
    assert all(x["grade"]["score"] == 100 for x in res["tashrihi"])


def test_attempt_length_validation():
    eid = publish_exam()
    assert client.post("/attempts", json={"exam_id": eid, "answers": [1, 2]}, headers=HS).status_code == 400


def test_mastery_and_plan_after_attempt():
    attempt_known()
    ms = client.get("/students/s0/mastery", headers=HS).json()
    assert ms and all(0 <= v["m"] <= 100 for v in ms.values())
    plan = client.get("/students/s0/plan", headers=HS).json()
    assert len(plan) == 7 and plan["جمعه"]
    assert client.get("/students/s1/mastery", headers=HS).status_code == 403
    assert client.get("/students/s1/mastery", headers=HT).status_code == 200


def test_tashrihi_arabic_normalization():
    q35 = next(t for t in hb.TASHRIHI if t["id"] == "q35")
    q34 = next(t for t in hb.TASHRIHI if t["id"] == "q34")
    g = hb.LLM.grade_tashrihi(q35, "خون از آئورت به سرخرگ و مویرگ و سیاهرگ می‌رود و به دهلیز برمی‌گردد")
    assert g["score"] == 100, g
    g2 = hb.LLM.grade_tashrihi(q34, "قند دئوكسي ريبز دارد و باز تيمين؛ در RNA ريبز و یوراسیل")
    assert g2["score"] == 100, g2


def test_admin_role_and_panels():
    """Boss (admin) gets school-level access; students/teachers are blocked from it."""
    A = client.post("/auth/login", json={"uid": "b1"}).json()
    assert A["role"] == "admin"
    HA = {"Authorization": f"Bearer {A['token']}"}
    # admin CANNOT create/publish exams (oversight only)
    assert client.post("/exams/generate", json={"lessons": ["dna"]}, headers=HA).status_code == 403
    # teachers CANNOT open boss endpoints
    assert client.get("/admin/overview", headers=HT).status_code == 403
    assert client.get("/admin/classes", headers=HT).status_code == 403
    # students CANNOT either
    assert client.get("/admin/overview", headers=HS).status_code == 403
    # boss CAN open everything at school level
    ov = client.get("/admin/overview", headers=HA).json()
    assert ov["students"] == 18 and ov["teachers"] == 12
    assert ov["classes"] == {"هفتم": 2, "هشتم": 2, "نهم": 2, "دهم تجربی": 2, "یازدهم تجربی": 2,
                             "دوازدهم تجربی": 2, "دهم ریاضی": 2, "یازدهم ریاضی": 2, "دوازدهم ریاضی": 2}
    # boss CAN also read class endpoints (staff-guard shared with teachers)
    assert client.get("/class/heatmap", headers=HA).status_code == 200


def test_admin_classes_breakdown():
    A = client.post("/auth/login", json={"uid": "b1"}).json()
    HA = {"Authorization": f"Bearer {A['token']}"}
    attempt_known()  # s0 (هفتم) takes an exam
    classes = client.get("/admin/classes", headers=HA).json()
    by = {c["class"]: c for c in classes}
    assert set(by) == {"هفتم", "هشتم", "نهم", "دهم تجربی", "یازدهم تجربی", "دوازدهم تجربی",
                       "دهم ریاضی", "یازدهم ریاضی", "دوازدهم ریاضی"}
    assert sum(len(by[c]["students"]) for c in by) == 18
    assert by["هفتم"]["avg"] is not None               # only هفتم has data
    assert all(by[c]["avg"] is None for c in by if c != "هفتم")
    ov = client.get("/admin/overview", headers=HA).json()
    assert ov["attempts"] >= 1 and ov["active_students"] >= 1
    assert ov["participation_pct"] >= 5
    assert ov["school_avg_pct"] is not None
    ALL_T = {f"معلم {n}" for n in ["زیست‌شناسی", "شیمی", "فیزیک", "ریاضی", "ادبیات فارسی", "عربی", "زبان انگلیسی", "زمین‌شناسی", "دین و زندگی", "علوم — دورهٔ اول", "ریاضی — دورهٔ اول", "مطالعات اجتماعی — دورهٔ اول"]}
    assert set(ov["exams_by_teacher"]).issubset(ALL_T) and len(ov["exams_by_teacher"]) == 12


def test_subject_scoping_server_side():
    """معلم زیست نمی‌تواند سروری از شیمی آزمون بگیرد — mirrors prototype rule."""
    zist_lessons = set(hb.SUBJECTS["zist"]["lessons"])
    shimi_lessons = set(hb.SUBJECTS["shimi"]["lessons"])
    # t1 (bio) asks ONLY for chemistry lessons -> gets zist fallback, zero shimi
    r1 = client.post("/exams/generate", json={"lessons": ["ph", "mol"], "count": 10}, headers=HT)
    got1 = {q["l"] for q in r1.json()["qs"]}
    assert got1 and got1.issubset(zist_lessons), got1
    # t2 (chemistry) asks for ph -> chemistry only
    T2 = client.post("/auth/login", json={"uid": "t2"}).json()["token"]
    H2 = {"Authorization": f"Bearer {T2}"}
    r2 = client.post("/exams/generate", json={"lessons": ["ph", "dna"], "count": 10}, headers=H2)
    got2 = {q["l"] for q in r2.json()["qs"]}
    assert got2 and got2.issubset(shimi_lessons), got2
    # new teacher accounts log in fine
    for tid in ["t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t11", "t12"]:
        assert client.post("/auth/login", json={"uid": tid}).json()["role"] == "teacher"
    # t10 (علوم دورهٔ اول) asking for علوم هفتم lessons stays inside its scope — no دوازدهم content
    T10 = client.post("/auth/login", json={"uid": "t10"}).json()["token"]
    H10 = {"Authorization": f"Bearer {T10}"}
    r10 = client.post("/exams/generate", json={"lessons": ["atom7", "dna"], "count": 6}, headers=H10)
    got10 = {q["l"] for q in r10.json()["qs"]}
    assert "atom7" in got10 and "dna" not in got10, got10


def test_full_curriculum_parity():
    """Backend exposes the full 3-year taxonomy (single source shared with prototype)."""
    tx = client.get("/taxonomy", headers=HT).json()
    assert len(tx) == 18 and "zamin" in tx and "dini" in tx and "olum7" in tx and "riazi9" in tx
    assert "mot7" in tx and "mot9" in tx  # مطالعات اجتماعی — دورهٔ اول (هفتم/هشتم/نهم)
    assert sum(len(s["lessons"]) for s in tx.values()) >= 110
    tax = client.get("/taxonomy", headers=HT).json()
    zist_years = " ".join(tax["zist"]["lessons"].values())
    assert "(دهم)" in zist_years and "(یازدهم)" in zist_years and "(دوازدهم)" in zist_years
    assert len(hb.BANK) >= 150 and len(hb.TASHRIHI) >= 5


def test_class_reports():
    attempt_known()
    hm = client.get("/class/heatmap", headers=HT).json()
    assert len(hm) == 18 and any(r["per_lesson"] for r in hm)
    assert all("class" in r for r in hm)
    res = client.get("/class/results", headers=HT).json()
    assert res and "pct" in res[0] and "title" in res[0]


def test_exam_kind_tashrihi_is_fully_essay():
    """kind=tashrihi (کاملاً تشریحی): zero MCQ; bank-verified tashrihi first;
    AI drafts top up and MUST stay unapproved until the teacher approves (Gate-A)."""
    ht10 = {"Authorization": "Bearer " + client.post("/auth/login", json={"uid": "t10"}).json()["token"]}
    # علوم هفتم now has a هماهنگ essay bank (2 per lesson), so a 6-question exam on ONE
    # lesson must mix verified bank + AI drafts — and stay unpublishable (Gate-A).
    r = client.post("/exams/generate", json={
        "lessons": ["heat7"], "count": 6,
        "kind": "tashrihi"}, headers=ht10)
    qs = r.json()["qs"]
    assert len(qs) == 6 and all(q.get("type") == "tashrihi" for q in qs), qs
    assert all("o" not in q or not q.get("o") for q in qs)          # no تستی options at all
    bank = [q for q in qs if q.get("src") == "bank"]
    ai = [q for q in qs if q.get("src") == "ai"]
    assert bank, "علوم هفتم now has a هماهنگ essay bank"
    assert all(q["approved"] for q in bank)
    assert all(not q["approved"] for q in ai)
    assert r.json()["title"].startswith("آزمون تشریحی")
    # Gate-A: publish must REFUSE while drafts are unapproved, then pass after approve
    eid = r.json()["exam_id"]
    assert client.post(f"/exams/{eid}/publish", headers=ht10).status_code == 400
    assert client.post(f"/exams/{eid}/approve", headers=ht10).status_code == 200
    assert client.post(f"/exams/{eid}/publish", headers=ht10).status_code == 200


def test_exam_kind_tashrihi_prefers_verified_bank():
    """زیست bank tashrihi (authored + امتحان نهایی) come first and approved;
    AI drafts only top up and stay in Gate-A."""
    r = client.post("/exams/generate", json={
        "lessons": ["dna", "khoon", "hayat", "govaresh"], "count": 5,
        "kind": "tashrihi"}, headers=HT).json()
    qs = r["qs"]
    assert len(qs) == 5 and all(q.get("type") == "tashrihi" for q in qs)
    n_bank = sum(1 for q in qs if q["approved"] and q["src"] == "bank")
    n_ai = sum(1 for q in qs if not q["approved"] and q["src"] == "ai")
    assert n_bank >= 2 and n_bank + n_ai == 5
    assert all(sum(w for _, w in q["kw"]) == 100 for q in qs if q["src"] == "ai")   # rubric = 100 pts


def test_exam_kind_mcq_has_zero_tashrihi():
    """kind=mcq (فقط تستی): کنکور-style practice with NO نهایی riders attached."""
    r = client.post("/exams/generate", json={
        "lessons": ["dna", "khoon"], "count": 15, "kind": "mcq"}, headers=HT).json()
    qs = r["qs"]
    assert len(qs) == 15 and all(q.get("type") != "tashrihi" for q in qs)
    # default kind (mix) still attaches the نهایی rider — unchanged behaviour
    r2 = client.post("/exams/generate", json={"lessons": ["dna", "khoon"], "count": 15}, headers=HT).json()
    assert any(q.get("type") == "tashrihi" for q in r2["qs"])


def test_pure_tashrihi_exam_grades_by_rubric_mean():
    """An essay-only exam has n==0 MCQs: percent must be the rubric mean
    (never 0-by-default, never a division error)."""
    r = client.post("/exams/generate", json={
        "lessons": ["dna", "khoon", "hayat", "govaresh"], "count": 4,
        "kind": "tashrihi"}, headers=HT).json()
    eid = r["exam_id"]
    client.post(f"/exams/{eid}/approve", headers=HT)
    client.post(f"/exams/{eid}/publish", headers=HT)
    import json as _json
    with hb.db() as con:
        qs = _json.loads(con.execute("SELECT qs FROM exams WHERE id=?", (eid,)).fetchone()["qs"])
    # answer covering EVERY rubric keyword (bank tashrihi have their own rubrics)
    ans = [" ".join(k for k, _ in q["kw"]) + " — توضیح کامل به‌همراه مثال" for q in qs]
    res = client.post("/attempts", json={"exam_id": eid, "answers": ans}, headers=HS)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["n"] == 0 and body["pct"] == 100.0, body
    # a blank essay exam scores 0 (still no NaN/division error)
    res2 = client.post("/attempts", json={"exam_id": eid, "answers": [""] * len(qs)}, headers=HS)
    assert res2.status_code == 200 and res2.json()["pct"] == 0.0
