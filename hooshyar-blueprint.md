# هوش‌یار (Hooshyar) — Technical Blueprint
### AI-Powered Exam & Adaptive Learning System for Iranian High Schools

> Working title: **Hooshyar** (هوش‌یار) — a pun on هوش (intelligence) + یار (companion).
> Status: Draft v1.0 · July 2026

---

## 1. The Problem We're Solving

Iranian high schools run on one engine: exams. Two of them, actually:

| Exam | Style | Why it matters |
|---|---|---|
| **Konkur (کنکور سراسری)** | 4-option MCQ (تستی), negative marking (every 3 wrong = −1 correct) | ~40% of university admission for 1405 |
| **Final national exams (امتحانات نهایی)** | Mixed تستی + descriptive (تشریحی) | **سابقه تحصیلی = 60% definitive weight (تاثیر قطعی)** for grades 11 & 12 |

Today in a typical school:
- Teachers spend **hours** writing exam papers per lesson per grade, and correcting them by hand.
- Students get a score sheet — maybe a درصد per lesson — and then **guess** what to study next.
- Counselors (مشاور) manually build study plans for hundreds of students; quality varies wildly.
- Parents have no visibility until report cards.

**Hooshyar** gives the school a single system that:
1. **Generates** exams from lessons (AI-drafted, teacher-approved),
2. **Grades** them automatically (online, or paper via phone-camera OMR),
3. **Analyzes** results per lesson per student (mastery charts, growth curves, error types),
4. **Plans** each student's week automatically, weighted toward their weakest topics — respecting Konkur lesson coefficients (ضرایب).

**Business model:** B2B2C — sell to schools (especially غیرانتفاعی / private schools first; they have budget, motivation, and fast procurement). Students & parents get accounts through the school.

---

## 2. Users & What They Get

| User | Dashboard highlights |
|---|---|
| **Student** | Weekly study plan, practice exams, per-lesson mastery radar, growth chart per درس, estimated درصد trajectory, "top 3 weak topics this week" |
| **Teacher** | Exam builder (5 min instead of 3 hrs), auto-grading, class heatmap (lesson × student), per-question stats (difficulty, discrimination, distractor analysis), one-click remedial exam for weak topics |
| **School admin / principal** | Cross-class comparison, cohort progress toward سوابق تحصیلی goals, teacher workload saved, exportable reports |
| **Parent** | Weekly SMS/web summary: plan compliance, درصد per subject, trend (no raw data overload) |
| **Counselor (مشاور)** | AI-drafted plans they can edit/approve instead of writing from scratch (10× throughput) |

---

## 3. Content Foundation (Do This First)

Everything depends on a clean, structured curriculum map. Iranian textbooks (کتاب‌های درسی) are standardized nationally and their PDFs are publicly distributed — this is a huge advantage.

### 3.1 Curriculum taxonomy

```
Track (رشته)                → ریاضی‌فیزیک | تجربی | انسانی
 └── Grade (پایه)           → دهم | یازدهم | دوازدهم
      └── Subject (درس)     → زیست‌شناسی, حسابان, شیمی, ادبیات, عربی, ...
           └── Chapter (فصل) → فصل ۳: تنظیم عصبی
                └── Lesson (درس/مبحث) → گیرنده‌های حسی
                     └── Topic (زیرمبحث) → ساختمان چشم
```

Every question, exam, mastery record, and plan item hangs off this tree.

### 3.2 Track/subject coverage decision
Ship **تجربی** (largest track, highest-stakes) + shared عمومی subjects (ادبیات، عربی، معارف، زبان) first. Add ریاضی second; انسانی third (its Konkur demand is real but per-school urgency is lower).

### 3.3 Question bank schema (each question carries metadata)

| Field | Example | Notes |
|---|---|---|
| `type` | تستی / تشریحی | تشریحی also stores a rubric + model answer |
| `topic_id` | FK into taxonomy | Required — powers all analytics |
| `difficulty` | 1–5 | Calibrated later from real student stats |
| `cognitive_level` | یادآوری / فهم / کاربرد / تحلیل | Bloom-adapted, matches نهایی style guides |
| `source` | AI-generated / teacher-uploaded / licensed | Copyright tracking is mandatory |
| `konkur_coefficient` (ضریب) | e.g., زیست دوازدهم = 4 | Used by the planner for weighting |
| `stats` | p-value, discrimination, chosen-distractor % | Filled automatically after real usage |

**Quality gate:** no AI-generated question is ever shown to students before a teacher approves it (human-in-the-loop forever in B2B — trust is the product).

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                        │
│  PWA (RTL, Persian): Student / Teacher / Admin / Parent views   │
│  + Teacher phone camera → OMR upload for paper exams            │
└──────────────┬──────────────────────────────────────────────────┘
               │ REST/GraphQL
┌──────────────▼──────────────────────────────────────────────────┐
│  API BACKEND (Python · FastAPI)                                 │
│  ├─ Auth & roles (school-scoped multi-tenancy)                  │
│  ├─ Exam service (build, deliver, timer, anti-cheat basics)     │
│  ├─ Grading service (MCQ+OMR engine, LLM rubric grader)         │
│  ├─ Analytics service (mastery, item analysis, heatmaps)        │
│  └─ Planner service (weekly plan generation & re-planning)      │
└──────┬────────────────────┬──────────────────────┬──────────────┘
       │                    │                      │
┌──────▼──────┐   ┌─────────▼─────────┐   ┌────────▼────────────┐
│ PostgreSQL  │   │ AI WORKERS        │   │ Storage/Queue       │
│ + pgvector  │   │ (self-hosted GPU) │   │ Redis · MinIO (PDFs)│
│ (embeddings │   │ ├─ LLM via vLLM   │   │ Celery jobs          │
│  for dedup) │   │ ├─ Embeddings     │   │ SMS: Kavenegar      │
└─────────────┘   │ └─ OMR (OpenCV)   │   │ Payment: ZarinPal   │
                  └───────────────────┘   └─────────────────────┘
```

### Key design decisions

**A. Sanctions-resilient stack (non-negotiable).** No foreign cloud APIs in the critical path. Host on Iranian infrastructure (ArvanCloud / Liara / in-school server option). Payments via ZarinPal/IDPay. SMS via Kavenegar/Ghasedak. This isn't just compliance — it's a *sales argument*: "works fully inside Iran, no VPN, no sanction risk."

**B. Self-hosted LLM instead of foreign APIs.** Run an open-weight multilingual model with strong Persian (Qwen 2.5/3 14–32B class, or a Persian-tuned variant) via **vLLM** on a rented in-country GPU server. One 4090/3090-class GPU comfortably serves a pilot of several schools for generation + rubric grading with batching.

**C. RAG over real textbooks.** Question generation is grounded in the actual کتاب درسی PDFs (chunked into pgvector) so content stays syllabus-accurate, with citations back to the فصل/صفحه for teacher review.

**D. Hybrid paper + online — the adoption killer feature.** Many schools can't guarantee every student a device. So: teacher prints the generated exam with **bubble sheets**, students answer on paper, teacher photographs the stack with a phone, **OMR (OpenCV) grades it in seconds** and results flow into the same analytics. Online exam mode exists for schools that want it.

**E. Multi-tenant, school-scoped.** `school_id` on every entity; a school can even self-host the whole stack (some private schools will pay extra for this).

---

## 5. Module Details

### 5.1 Exam Generator
- Teacher picks: track/grade → subjects → lessons → # questions → difficulty mix (slider: آسان/متوسط/سخت %) → question type mix (تستی/تشریحی) → exam duration.
- System drafts from the bank first (proven questions), tops up with AI generation (RAG + prompt templates per lesson style, e.g., کنکور-style stem/4 options/1 correct + plausible distractors).
- **Dedup:** embedding similarity check so near-duplicate AI questions don't pollute the bank.
- Output: printable Persian PDF (proper RTL, KaTeX/MathJax formulas with LTR islands) + answer key + online version.

### 5.2 Grading
- **تستی:** instant. Score uses the official formula: `درصد = ((صحیح×3 − غلط) × 100) / (کل×3)`.
- **Paper/OMR:** deskew → locate answer grid → read bubbles → flag ambiguous marks for teacher micro-review (only flagged rows shown to human).
- **تشریحی (phase 2+):** LLM rubric grading — model applies the teacher's rubric, returns score + 1-line justification per item; teacher sees a side-by-side review queue and can override. We never fully auto-publish تشریحی grades in v1.

### 5.3 Analytics
Three layers, all pre-computed on attempt submission:

1. **Per-question:** p-value (correct rate), point-biserial discrimination, distractor pick distribution → automatically flags bad questions ("سؤال ۱۴: 90% picked distractor C, discrimination negative — review it").
2. **Per-student × per-topic mastery:**
   ```
   mastery(topic) = 0.45·recent_acc(3 last attempts)
                  + 0.30·lifetime_acc
                  + 0.25·trend(slope of last 5)
   × forgetting_decay = exp(−days_since_practice / τ)   # τ≈20d
   ```
   Plus **error taxonomy** from attempt metadata: مفهومی (conceptual) / بی‌دقتی (careless — answered fast, wrong on easy item) / زمان (ran out). Each needs a different remedy.
3. **Aggregates:** class heatmap, cohort سوابق trajectory, "مباحث بحرانی این هفته" per class.

### 5.4 Adaptive Study Planner
The differentiator. Weekly job per student:

```
for each topic in track:
    priority = (1 − mastery) · ضریب_درس · forget_decay + error_type_boost

plan = allocate(weekly_available_hours ∝ priority)
     + interleave(spaced_repetition_reviews)     # SM-2 style, 1-3-7-16d
     + cap(daily_load ≤ student_limit)
     + insert(weekly mini-mock on weakest 3 topics)
```
- Output is a **day-by-day plan in Persian**: "شنبه: زیست فصل ۳ — ۴۰ دقیقه مرور چشم و گوش + ۲۰ تست سطح ۳".
- **Re-planning triggers:** every graded exam, plan-compliance < 60% (reduce load, don't guilt-trip), teacher override.
- Counselor sees drafts → approve/edit in bulk → publish. The AI does the math; humans keep judgment.

---

## 6. Data Model (core entities)

```sql
school(id, name, type, city)
user(id, school_id, role[student|teacher|admin|parent|counselor], ...)
student(id, user_id, track, grade, weekly_hours, ...)
taxonomy: track(id) grade(id) subject(id) chapter(id) lesson(id) topic(id)
question(id, topic_id, type, difficulty, cognitive_level, body_fa,
         options_json, answer_key, rubric_json, source, status[pending|approved],
         p_value, discrimination, embedding vector)
exam(id, school_id, creator_id, title, mode[online|paper], duration_min, ...)
exam_item(exam_id, question_id, order)
attempt(id, exam_id, student_id, started_at, finished_at)
answer(attempt_id, question_id, given, is_correct, latency_sec, graded_by, score)
mastery(student_id, topic_id, mastery, forgetting_ts, updated_at)
study_plan(id, student_id, week, status, approved_by)
plan_item(plan_id, day, topic_id, task_type[review|test|mock], est_minutes, done)
```

---

## 7. Roadmap

| Phase | Months (small team, 3–5 devs) | Scope |
|---|---|---|
| **0. Content** | 0–2 | Curriculum taxonomy digitized (تجربی + عمومی), seed bank ~3k licensed/teacher questions, RAG pipeline over textbooks |
| **1. MVP** | 2–5 | Exam builder + AI generation w/ approval queue, online exams, **OMR paper grading**, auto درصد, per-lesson charts, class heatmap |
| **2. Adaptive** | 5–8 | Mastery engine, weekly planner v1, counselor approval flow, parent SMS summaries |
| **3. Deep AI** | 8–12 | تشریحي LLM rubric grading + review queue, IRT calibration, question auto-quality flags, multi-track coverage |
| **Pilot** | from month 4 | 1–3 private schools, grades 11–12, one city. Iterate weekly with teachers. |

**Pilot success criteria** (agree with schools up front): exam creation time < 15 min, OMR accuracy ≥ 99.5%, ≥ 70% weekly plan compliance, measurable درصد uplift on repeated topics within 6 weeks.

### Rough costs (MVP→pilot)
- Team: ~3–4 people (backend, frontend/PWA, AI engineer, part-time content teacher per subject).
- Infra: 1 GPU server (rented in-country) + modest app/DB servers — order of a few million toman/month at pilot scale; LLM tokens are basically free (self-hosted).
- Main hidden cost: **content digitization & review** — budget teacher-hours, it's the moat.

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AI generates wrong/ambiguous questions | Approval queue mandatory; p-value/discrimination auto-flags after use; regenerate loop |
| Schools fear "AI replaces teachers" | Position as teacher **amplifier**: they approve everything; dashboards show *their* time saved |
| Uneven student device access | Paper + phone-OMR workflow (no student devices needed) |
| Content licensing (کتاب کمک‌درسی questions are copyrighted) | Use textbook-grounded generation + teacher-created + licensed content only; track `source` field |
| Data privacy (minors) | Per-school data isolation, on-prem option, minimal PII, parent consent flow |
| Model quality in Persian | Human approval until error rate proven low; Persian-tuned open models improving fast; fine-tune on approved in-domain data |
| Sales cycles in public schools | Start with غیرانتفاعی/nمونه schools; public-sector later via district pilots |

## 9. KPIs
Exam creation time, % AI questions approved, OMR accuracy, plan compliance, mastery uplift per topic per cycle, weekly active students, school renewal rate.

---

### Next steps if you want to continue
1. **Prototype the core loop** (I can build this here): topic picker → AI generates Persian MCQ exam → auto-grade → mastery chart → next-week plan.
2. Competitive teardown of پلکان یادگیری / ایویرا / کانون digital to sharpen positioning.
3. A 10-slide pitch deck for the first school meetings (فارسی).
