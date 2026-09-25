# هوش‌یار (Hooshyar) — Execution Roadmap
### 12-month plan · Mordad 1405 → Tir 1406 (Aug 2026 → Jul 2027)

> Companion doc: `hooshyar-blueprint.md` (architecture & product).
> This doc = **when**, **who**, and **what "done" means**.

---

## 1. Strategy in one paragraph

The Iranian school year starts **Mehr 1 (~Sep 23)** and ends with **امتحانات نهایی in Khordad**; Konkur lands **early Tir**. School budgets and purchases happen in **Shahrivar**. We're starting in Mordad 1405, so we *miss* this year's buying window — perfect, because we're not ready anyway. Instead: build through autumn, run a **free pilot with 2–3 private schools from Azar (Dec)**, prove results by spring exams, and convert to **paid contracts for the summer/Konkur 1406 season and the 1406-1407 school year**. Everything in this plan points at that conversion moment.

## 2. Timeline at a glance

```
1405:         MRD  SHH  MHR  ABN  AZR  DEY  BAH  | 1406:  FAR  ORD  KHR  TIR
              ─────────────────────────────────────────────────────────
PHASE 0       ███  ███                                                          Content & Corpus
PHASE 1            ███  ███  ███  ███                                           MVP
PILOT (free)                ▲    ███  ███  ███  ███  ███  ███                   2-3 schools
PHASE 2                          ███  ███  ███    ███                           Adaptive engine
▲ GATE A              ▲ GATE B        ▲ GATE C        ▲ GATE D                Go/No-Go points
PHASE 3                                   ███  ███  ███  ███                  Deep AI + scale
SUMMER PUSH                                                      ███  ███     Paid prep, Konkur 1406
PAID from                                                       ✱ target: contracts for Mehr 1406

Legend: MRD=Mordad SHH=Shahrivar MHR=Mehr ABN=Aban AZR=Azar DEY=Dey BAH=Bahman
        FAR=Farvardin ORD=Ordibehesht KHR=Khordad TIR=Tir   ✱ = revenue start
```

## 3. Guiding rules

1. **Content before code.** A beautiful app with a weak question bank dies. A rough app with great questions lives.
2. **Teachers approve everything AI generates.** Non-negotiable trust rule (until data proves otherwise).
3. **Ship to real classrooms every month** from Azar onward — even if it's just OMR grading of a paper exam.
4. **One track first:** تجربی + عمومی subjects of grades 11–12. Nothing else until Gate C.
5. **Every phase ends with a Go/No-Go gate** with numeric criteria. Miss the gate → fix, don't proceed.

---

## PHASE 0 — Content Foundation (Mordad–Shahrivar · months 0–2)

**Goal:** the curriculum spine and a seed corpus good enough that AI generation rarely embarrasses a teacher.

| Workstream | Tasks | Owner | Done when |
|---|---|---|---|
| Curriculum taxonomy | Digitize تجربی گریدهای ۱۱–۱۲ + عمومی (ادبیات، عربی، معارف، زبان) into Track→Grade→Subject→Chapter→Lesson→Topic tree; attach ضرایب دروس per زیرگروه | Content lead | Tree reviewed & signed off by 2 experienced teachers |
| Textbook corpus | Chunk official کتاب درسی PDFs → embeddings (pgvector); page-level citations | AI eng | RAG returns correct صفحه/فصل for 95% of sampled topic queries |
| Seed question bank | Collect/create 3,000 questions (teacher-written + licensed + verified past finals, امتحانات نهایی سال‌های قبل with solutions) | Content + teachers | ≥150 questions per major subject, all with topic tags, difficulty, answer keys |
| Generation pipeline | Prompt templates per question style (کنکور تستی، نهایی تستی، تشریحی + rubric); embedding dedup check | AI eng | Internal approval rate of AI drafts ≥ 80% by reviewing teacher |
| Tooling | Minimal content-review web UI (raw, internal-only) | Full-stack | Teachers can approve/edit/reject questions in <30 s each |

> **🚦 GATE A (end Shahrivar):** For 3 pilot subjects, ≥80% of AI-generated questions pass teacher review, and coverage ≥90% of lessons in the taxonomy. **Fail →** spend up to one more month on corpus/prompts; do not start building the student-facing app yet (it'll be garbage-in-garbage-out).

**First-two-weeks checklist (do immediately):**
- [ ] Register infra: in-country GPU server (one 4090-class box) + app server + domain
- [ ] Stand up PostgreSQL+pgvector, MinIO (PDFs), Redis/Celery
- [ ] Recruit content lead (an experienced معلم زیست or شیمی) — this hire matters more than any engineer
- [ ] Seed taxonomy in DB for زیست‌شناسی ۱۱–۱۲ only (prove the pattern on one subject)
- [ ] Baseline test: run generation for 20 lessons of زیست, measure approval rate

---

## PHASE 1 — MVP (Shahrivar–Azar · months 2–5, overlapping)

**Goal:** a school can create a real exam in minutes, deliver it online *or on paper*, scan it with a phone, and see per-lesson charts the same day.

| Sprint | Deliverable | Acceptance criteria |
|---|---|---|
| S1–S2 | Multi-tenant auth (schools, roles), taxonomy browser, question bank CRUD wired to Phase 0 corpus | Two schools' data fully isolated; teachers browse/find questions by lesson |
| S3–S4 | **Exam builder** + Persian PDF export (RTL + KaTeX, bubble-sheet edition for paper mode) + AI top-up with approval queue | Teacher builds a 20-question mixed exam in <15 min; PDF prints correctly |
| S5–S6 | **Online exam player** (timer, autosave, question palette, negative-marking notice) + instant grading with official formula | 100 concurrent students in one school without hiccups; درصد matches manual calc |
| S7–S8 | **OMR pipeline:** upload phone photos → deskew → read bubbles → flag ambiguous → teacher micro-review | ≥99.5% read accuracy on 500 real classroom sheets, ≤5% flagged |
| S9–S10 | **Analytics v1:** per-student per-lesson درصد chart, class lesson×student heatmap, per-question stats (p-value, distractor picks) | Principal sees heatmap within seconds of grading; teachers confirm "this matches my feel of the class" |
| S11–S12 | Pilot hardening: onboarding flow, Persian fonts/UI polish (Vazirmatn), SMS summaries via gateway, backup/ops runbook | Ready for real classrooms; one-command rollback |

> **🚦 GATE B (end Azar):** OMR accuracy ≥99.5% in *classroom lighting with real phones*, exam-builder time <15 min, and both pilot schools' teachers have used it for **real** exams (not staged demos). **Fail →** delay pilot expansion, fix the failing piece; do NOT build Phase 2 planner on top of untrusted grading.

---

## PILOT — free, 2–3 غیرانتفاعی schools (Azar–Khordad)

**School selection criteria:** private (budget + fast decisions), motivated principal, ≥2 classes of پایه دوازدهم تجربی, decent teacher buy-in, within visitable distance.

| Month | Pilot activity | What we measure |
|---|---|---|
| Azar | School #1: weekly paper exams via OMR + online quizzes; weekly on-site feedback | Time saved per teacher; OMR accuracy in the wild |
| Dey | School #2 joins; add counselor: first **manually-assisted** study plans (we generate, counselor edits) | Counselor edit-distance on AI plans (target: <30% changed) |
| Bahman | Winter مview: repeated-topic cycles to measure uplift; collect parent feedback | درصد uplift on re-tested weak topics (target: +15% in 6 weeks) |
| Farvardin | Nowruz break: fix everything; prep planner v2; negotiate paid terms | — |
| Ordibehesht–Khordad | **The big test: امتحانات نهایی season.** Students prep with Hooshyar; compare pilot classes vs. school's own previous cohorts | نهایی score delta; teacher/counselor NPS; willingness-to-pay conversations |

> **🚦 GATE C (end Khordad):** ≥70% weekly plan compliance, measurable uplift vs. baseline, ≥8/10 teacher NPS, and both schools verbally agree to paid terms. **This gate decides the company.**

---

## PHASE 2 — Adaptive Engine (Bahman–Ordibehesht, parallel with pilot)

**Goal:** replace the counselor-assisted plans with the real thing.

| Workstream | Tasks | Done when |
|---|---|---|
| Mastery engine | Implement mastery = 0.45·recent + 0.30·lifetime + 0.25·trend, × forgetting decay; error taxonomy (مفهومی/بی‌دقتی/زمان) from latency + option patterns | Backtested on pilot data: mastery predicts next-exam per-topic درصد with meaningful correlation |
| Planner v1 | Weekly allocation ∝ (1−mastery)·ضریب·decay + spaced repetition (1-3-7-16d) + daily-load caps + weekly mini-mock on weakest 3 topics | Plans generated automatically for all pilot students; counselor approval <5 min/class |
| Analytics v2 | Estimated درصد trajectory per subject, "مباحث بحرانی این هفته" per class, parent weekly SMS/web summary | Parents receive and open summaries (track opens) |
| UX | Student home = today's plan; streaks and gentle compliance nudges (no guilt mechanics) | Weekly active students ≥75% of enrolled |

---

## PHASE 3 — Deep AI & Scale (Ordibehesht–Tir 1406)

| Workstream | Tasks | Gate |
|---|---|---|
| تشریحی grading | LLM rubric grading + teacher review queue (side-by-side override) | Avg |AI−teacher| score delta <0.5/5 per item on 1,000 real answers |
| IRT calibration | Convert usage stats into calibrated difficulty/discrimination; auto-flag bad questions | Question bank difficulty reliably ranks real outcomes |
| Track expansion | Add ریاضی track bank + generation templates | Gate A criteria repeated for ریاضی |
| On-prem option | Docker compose bundle for schools that demand local hosting | One school deploys without our engineers on site |
| Sales machine | Case studies from pilot, principal-facing demo kit (Persian), pricing: per-student-per-year with school dashboard included | ≥5 signed LOIs for Mehr 1406 |

> **🚦 GATE D (Tir 1406):** signed contracts covering ≥1,500 students for the next year (mix of summer prep + Mehr 1406). Then: raise/hire for scale. Miss → analyze honestly: product issue or sales issue? Fix the right one.

---

## 4. Team & hiring plan

| When | Role | Why now |
|---|---|---|
| Mordad | Content lead (senior teacher) | Day-one hire; owns taxonomy & quality |
| Mordad | AI/backend engineer | RAG, generation, grading services |
| Mordad–Shahrivar | Full-stack (PWA) engineer | Everything teachers/students touch |
| Aban | Part-time subject teachers (زیست، شیمی، فیزیک، ادبیات، عربی...) | Review queues before pilot volume |
| Dey | Computer-vision engineer (or contractor) | Harden OMR beyond happy-path |
| Farvardin | Sales/customer-success lead | Convert pilot stories into contracts |

Sizing: 3–4 core people through MVP; ~6–7 (half part-time) by pilot peak. Total effort to Gate C ≈ **12–15 person-months**.

## 5. Budget sketch (rough, adjust to your market)

| Item | Estimate |
|---|---|
| Core team (to Gate C) | 12–15 person-months — the dominant cost |
| Part-time content reviewers | ~2–4 person-months equivalent |
| Infra: 1× GPU server (in-country rental) + app/DB/object storage | A few million toman/month at pilot scale; LLM usage ≈ free (self-hosted) |
| SMS/payment gateways | Per-message fees; negligible until parent summaries scale |
| Misc: domain, legal (school contracts, privacy), demo printing, travel to schools | Small but non-zero |

Keep burn minimal until **Gate D** — that's when spending accelerates (hiring, sales).

## 6. Risk board with trigger points

| Risk | Early warning signal | Trigger → action |
|---|---|---|
| AI question quality stalls <80% approval | Gate A metrics | Pivot prompts→more templated generation per question type; add reviewer-in-loop fine-tuning |
| OMR fails in real classrooms | Phones can't focus / bad lighting in school #1 | Ship official answer-sheet PDF with corner fiducials; fallback: teacher keys in scores manually (still saves grading math) |
| Teachers see it as surveillance | Heatmap demo gets cold reaction | Reframe: teacher owns all data visibility settings; position as their tool, not the principal's |
| Counselor resists planner | Edit-distance stuck >50% | Co-design sessions; make counselor the "approver" hero, not the replaced party |
| School drags procurement | Verbal yes, no signature by Tir | Smaller entry offer: paid summer prep course for their دوازدهمی‌ها as gateway drug |
| Competitor ships similar | پلکان/کانون announces school B2B | Lean into OMR + on-prem + تشریحی grading — the unsexy school stuff they lack |

## 7. KPI dashboard (targets)

| Metric | By Gate B | By Gate C | By Gate D |
|---|---|---|---|
| Exam creation time | <15 min | <10 min | <10 min |
| AI question approval rate | ≥80% | ≥85% | ≥90% |
| OMR accuracy | ≥99.5% | ≥99.7% | — |
| Weekly plan compliance | — | ≥70% | ≥75% |
| Uplift on re-tested weak topics | — | +15% (6 wks) | +20% |
| Schools: pilot → paid | 2 free | 2 free | ≥5 signed |

---

### What happens next
This week = the **first-two-weeks checklist** in Phase 0. If you want, I can start *doing* parts of it right here: stand up the curriculum taxonomy + a working AI question-generation prototype (lessons in → Persian تستی exam out, with answer keys) so you have something to show a teacher within days, not months.
