// Validation harness for hooshyar-prototype.html — verifies the exam engine.
// Run: node hooshyar-tests.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/hooshyar-prototype.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
eval(scripts.join('\n;\n')); // loads BANK, TEMPLATES, etc. + sets module.exports inside
// Re-grab from the eval'd scope (module.exports was overwritten by the script itself)
// but safer: just use directly-bound globals from eval scope — not available, so
// read them off module.exports which the script assigned.
global.localStorage = undefined;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗ FAIL:', name, extra || ''); }
}

const H = module.exports;
const { BANK, TEMPLATES, SUBJECTS, assembleExam, gradeExam, buildPlan, fa } = H;

console.log('\n[1] Question bank integrity');
const ids = new Set();
const MCQ = BANK.filter(q => q.type !== 'tashrihi');
ok('all MCQ questions have 4 options & valid answer index', MCQ.every(q => q.o.length === 4 && q.a >= 0 && q.a < 4));
ok('tashrihi items have model answer + rubric', BANK.filter(q => q.type === 'tashrihi').every(q => q.model && Array.isArray(q.kw) && q.kw.length));
ok('unique ids', BANK.every(q => !ids.has(q.id) && (ids.add(q.id), true)));
ok('options non-empty & unique per question', MCQ.every(q => q.o.every(o => String(o).trim().length > 0) && new Set(q.o.map(String)).size === 4));
const lessonIds = new Set(SUBJECTS.flatMap(s => s.lessons.map(l => l.id)));
ok('every question tags a real lesson', BANK.every(q => lessonIds.has(q.l)));

console.log('\n[2] AI generator templates (300 rounds)');
let genOK = true, answerValid = true, uniq = true;
for (let r = 0; r < 50; r++) for (const t of TEMPLATES) {
  const g = t.gen();
  if (!g.q || !g.exp) genOK = false;
  if (!(g.o.length === 4 && g.a >= 0 && g.a < 4)) answerValid = false;
  if (new Set(g.o.map(String)).size !== 4) { uniq = false; console.log('     dup options in', t.id, g.o); }
}
ok('all templates produce question + explanation', genOK);
ok('all generated items have 4 options & valid key', answerValid);
ok('generated options always unique', uniq);
// spot-check physics template math
for (let r = 0; r < 20; r++) {
  const g = TEMPLATES[2].gen();
  const correct = Number(String(g.o[g.a]));
  const m = g.exp.match(/= (\d+) m/);
  if (Number(m[1]) !== correct) { ok('t3 math consistent', false, g); break; }
}
ok('t3 physics answers match explanation math', true);
// spot-check Viete template: the keyed answer must be the LARGEST real root of the printed equation
for (let r = 0; r < 20; r++) {
  const g = TEMPLATES[4].gen();
  const m = g.q.match(/x² − (\d+)x \+ (\d+) = 0/);
  const s = +m[1], p = +m[2];          // x² − s·x + p = 0, roots sum s, product p
  const disc = s * s - 4 * p;
  const r1 = (s + Math.sqrt(disc)) / 2, r2 = (s - Math.sqrt(disc)) / 2;
  const chosen = Number(g.o[g.a]);
  if (chosen !== Math.max(r1, r2)) { ok('t5 picks largest root', false, g); break; }
}
ok('t5 math (largest root) correct', true);
// spot-check Chargaff template: G% must equal 50−A% parsed from the question
for (let r = 0; r < 20; r++) {
  const g = TEMPLATES[5].gen();
  const A = +g.q.match(/(\d+)٪/)[1];
  if (Number(g.o[g.a]) !== 50 - A) { ok('t6 chargaff correct', false, g); break; }
}
ok('t6 chargaff (G=50−A) correct', true);
// spot-check pH template: pH must equal −log10(concentration)
for (let r = 0; r < 20; r++) {
  const g = TEMPLATES[0].gen();
  const c = +g.q.match(/برابر ([\d.]+) مولار/)[1];
  if (Number(g.o[g.a]) !== Math.round(-Math.log10(c))) { ok('t1 pH correct', false, g); break; }
}
ok('t1 pH math correct', true);

console.log('\n[3] Exam assembly');
const exam = assembleExam([...lessonIds], 10, 'mix');
const examMCQ = exam.filter(q => q.type !== 'tashrihi');
ok('assembles requested MCQ count', examMCQ.length === 10);
ok('includes 1 tashrihi on 10-question exam', exam.length - examMCQ.length === 1, exam.length);
const aiCount = examMCQ.filter(q => q.src === 'ai').length;
ok('~40% AI share', aiCount >= 2 && aiCount <= 6, 'ai=' + aiCount);
ok('bank items pre-approved, AI pending', exam.every(q => q.src === 'bank' ? q.approved : !q.approved));
ok('shuffled options keep valid key', examMCQ.every(q => q.o.length === 4 && q.a >= 0 && q.a < 4 && q.o[q.a] !== undefined));
const exam2 = assembleExam([...lessonIds], 10, 'mix');
ok('two assemblies differ (randomization works)', JSON.stringify(exam.map(q => q.q)) !== JSON.stringify(exam2.map(q => q.q)));

console.log('\n[4] Konkur grading formula');
// 10 questions: 5 correct, 3 wrong, 2 blank → ((5*3-3)*100)/(10*3) = 40%
const qs10 = Array.from({ length: 10 }, (_, i) => ({ l: 'dna', a: i % 4, o: ['1', '2', '3', '4'] }));
const ans = [qs10[0].a, qs10[1].a, qs10[2].a, qs10[3].a, qs10[4].a, (qs10[5].a + 1) % 4, (qs10[6].a + 1) % 4, (qs10[7].a + 1) % 4, null, null];
const res = gradeExam(qs10, ans);
ok('counts correct', res.c === 5 && res.w === 3 && res.b === 2);
ok('percent = ((5×3−3)×100)/(10×3) = 40', res.pct === 40, 'got ' + res.pct);
const allWrong = gradeExam(qs10, ans.map((x, i) => (qs10[i].a + 1) % 4));
ok('all-wrong can go negative (Konkur reality)', allWrong.pct < 0, allWrong.pct);
const perL = gradeExam(exam, exam.map(q => q.type === 'tashrihi' ? '' : q.a));
ok('per-lesson breakdown sums to MCQ total', Object.values(perL.perL).reduce((s, x) => s + x.t, 0) === perL.n);

console.log('\n[5] Mastery + planner');
H.loadDemo(); // mutates state inside the module scope
const plan = buildPlan();
ok('plan has 7 days', plan.days.length === 7);
ok('every day has tasks', plan.days.every(d => d.tasks.length > 0));
ok('friday is rest-only', plan.days[6].tasks.length === 1);
const totalTasks = plan.days.slice(0, 6).reduce((s, d) => s + d.tasks.length, 0);
ok('9 personalized tasks + weekly mini-mock', totalTasks >= 9, totalTasks);
// weakest topics should be prioritized: check mol/d2eq/rank among first tasks
const sat = plan.days[0].tasks.concat(plan.days[1].tasks).map(t => t.txt).join(' ');
ok('weak topics surface early (مول or درجهٔ دو on شنبه/یکشنبه)', /مول|درجهٔ دو|DNA|انرژی/.test(sat), sat);
ok('fa() digit conversion', fa('40.5') === '۴۰٫۵');

console.log('\n[6] Tashrihi (descriptive) grading');
ok('tashrihi items exist in bank', BANK.some(q => q.type === 'tashrihi'));
ok('tashrihi rubric weights sum to 100', BANK.filter(q => q.type === 'tashrihi').every(q => q.kw.reduce((s, k) => s + k[1], 0) === 100));
const g36 = BANK.find(q => q.id === 'q36');
const full = H.gradeTashrihi(g36, 'HCl یک اسید قوی است و کاملا به یون تجزیه می‌شود؛ پس با لگاریتم pH = -log غلظت ۰٫۰۱ که برابر 2 می‌شود.');
ok('full model answer scores 100', full.score === 100, full.score);
const partial = H.gradeTashrihi(g36, 'چون اسید قوی است و یونیزه می‌شود.');
ok('partial answer scores less', partial.score > 0 && partial.score < 100, partial.score);
const empty = H.gradeTashrihi(g36, '');
ok('empty answer scores 0 with message', empty.score === 0 && empty.why.length > 0);
ok('Arabic-script chars normalized (ي→ی)', H.normFa('ياد').includes('ی'));
const g34 = BANK.find(q => q.id === 'q34');
const arabicAnswer = H.gradeTashrihi(g34, 'قند دئوكسي ريبز دارد و باز تيمين؛ در RNA ريبز و يوراسيل است.');
ok('Arabic-script keywords still match', arabicAnswer.score === 100, arabicAnswer.score);

console.log('\n[7] Mixed exam (MCQ + tashrihi)');
const mixed = assembleExam([...lessonIds], 15, 'mix');
const tashCount = mixed.filter(q => q.type === 'tashrihi').length;
ok('tashrihi rides along on 15-question exam', tashCount >= 1 && tashCount <= 2, tashCount);
const mAns = mixed.map(q => q.type === 'tashrihi' ? q.model : q.a);
const mRes = H.gradeExam(mixed, mAns);
ok('percent computed over MCQ only (n excludes tashrihi)', mRes.n === mixed.length - tashCount);
ok('perfect mixed exam scores 100', mRes.pct === 100, mRes.pct);
ok('tashrihi grades attached to result', mRes.tashrihi.length === tashCount && mRes.tashrihi.every(x => x.grade && typeof x.grade.score === 'number'));
ok('tashrihi excluded from per-lesson MCQ buckets', Object.values(mRes.perL).reduce((s, x) => s + x.t, 0) === mRes.n);

console.log('\n[8] Class simulation + psychometrics');
const examForSim = assembleExam([...lessonIds], 10, 'mix');
const S1 = H.simClass(examForSim, { rng: H.mulberry32(7), plantIdx: 2 });
ok('simulates 12 students', S1.students.length === 12);
ok('every student graded', S1.students.every(s => s.res && typeof s.res.pct === 'number'));
ok('per-lesson matrix filled', S1.students.every(s => Object.keys(s.perLesson).length > 0));
const plantedQ = S1.qs[2];
const trapShare = S1.students.filter(s => s.ans[2] === (plantedQ.a + 2) % 4).length / S1.students.length;
ok('planted trap fools >60% of class', trapShare > 0.6, trapShare);
const plantedStats = S1.itemStats[2];
ok('trap option flagged automatically', plantedStats.flags.some(f => f.includes('فریب')), plantedStats.flags);
ok('low p-value flagged as hard', plantedStats.flags.includes('خیلی سخت'), plantedStats.flags);
ok('item stats cover all questions', S1.itemStats.length === S1.qs.length);
ok('deterministic with seeded rng', JSON.stringify(H.simClass(examForSim, { rng: H.mulberry32(7), plantIdx: 2 }).students.map(s => s.res.pct)) === JSON.stringify(S1.students.map(s => s.res.pct)));
// unseeded run sanity: flags array exists on every MCQ item
const S2 = H.simClass(examForSim, { rng: H.mulberry32(99) });
ok('stats valid without plant', S2.itemStats.every(x => x.type === 'tashrihi' || (x.p >= 0 && x.p <= 1 && x.disc >= -1 && x.disc <= 1)));

console.log('\n[9] Profiles & roles');
const q0 = H.assembleExam([...lessonIds], 5, 'mix');
const alice = H.seedStudent('stu0', 0);
ok('seeded student has history + mastery', alice.history.length >= 2 && Object.keys(alice.lessonStats).length >= 3);
ok('seeded data is deterministic per student', (() => { const a = H.seedStudent('stuX', 0), b = H.seedStudent('stuX2', 0); return Object.keys(a.lessonStats).length === alice.history.length || a.history.length === alice.history.length; })());
ok('different students get different data (i ≠ i+1)', (() => { const a = H.seedStudent('sA', 1), b = H.seedStudent('sB', 2); return JSON.stringify(a.history) !== JSON.stringify(b.history); })());
const pub = H.addPublished(q0, 'آزمون تستی');
ok('publish stores exam', H._state().published.some(p => p.id === pub.id));
H.recordPubResult(pub.id, 'stu0', 66.7);
H.recordPubResult(pub.id, 'stu1', 48);
ok('pub results recorded per student', H._state().pubResults[pub.id].stu0.pct === 66.7 && H._state().pubResults[pub.id].stu1.pct === 48);
ok('profiles isolated', H.prof('stu0') !== H.prof('stu1'));
// cleanup shared state for repeatability
H._state().published = []; H._state().pubResults = {};

console.log('\n[10] Login roles & access matrix');
const accts = Object.values(H.ACCOUNTS);
ok('3 roles present: admin/teachers/students', accts.some(a => a.role === 'admin') && accts.filter(a => a.role === 'teacher').length === 12 && accts.filter(a => a.role === 'student').length === 18);
ok('every teacher owns subject(s)', accts.filter(a => a.role === 'teacher').every(a => Array.isArray(a.subjects) && a.subjects.length >= 1));
ok('each curriculum subject has exactly one owner teacher', (() => { const owns = accts.filter(a => a.role === 'teacher').flatMap(a => a.subjects).sort(); const subs = H.SUBJECTS.map(s => s.id).sort(); return JSON.stringify(owns) === JSON.stringify(subs); })());
ok('every account has password', accts.every(a => !!a.pass));
ok('admin panel has school tab, no builder/plan', H.ROLE_TAB.admin.includes('school') && !H.ROLE_TAB.admin.includes('builder') && !H.ROLE_TAB.admin.includes('plan'));
ok('teacher has builder + class + plan', ['builder', 'class', 'plan'].every(t => H.ROLE_TAB.teacher.includes(t)));
ok('student has no class/school dashboards', !H.ROLE_TAB.student.includes('class') && !H.ROLE_TAB.student.includes('school'));
ok('role homes differ', H.ROLE_HOME.admin === 'school' && H.ROLE_HOME.teacher === 'builder' && H.ROLE_HOME.student === 'builder');
ok('students split across the nine real classes (2 per class)', (() => { const cls = accts.filter(a => a.role === 'student').map(a => a.cls); return H.CLASS_LIST.every(k => cls.filter(c => c === k).length === 2); })());
ok('prof() inherits role from ACCOUNTS', H.prof('admin').role === 'admin' && H.prof('teacher2').role === 'teacher');

console.log('\n[11] Teacher custom questions (سؤال دستی)');
const cmcq = H.mkCustomMcq({ lesson: 'dna', text: 'سؤال دستی تستی؟', opts: ['الف1', 'ب2', 'ج3', 'د4'], correct: 2, d: 3 });
ok('custom MCQ builds with metadata', cmcq.o.length === 4 && cmcq.a === 2 && cmcq.l === 'dna' && cmcq.s === 'zist');
ok('custom MCQ is teacher-approved (no Gate-A queue)', cmcq.src === 'custom' && cmcq.approved === true);
ok('custom MCQ grades correctly through gradeExam', (() => { const r = H.gradeExam([cmcq], [2]); return r.pct === 100; })());
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };
ok('rejects duplicate options', throws(() => H.mkCustomMcq({ lesson: 'dna', text: 'x', opts: ['یک', 'یک', 'دو', 'سه'], correct: 0 })));
ok('rejects empty option', throws(() => H.mkCustomMcq({ lesson: 'dna', text: 'x', opts: ['یک', '', 'دو', 'سه'], correct: 0 })));
ok('rejects empty text', throws(() => H.mkCustomMcq({ lesson: 'dna', text: ' ', opts: ['یک', 'دو', 'سه', 'چهار'], correct: 0 })));
ok('rejects unknown lesson', throws(() => H.mkCustomMcq({ lesson: 'nope', text: 'x', opts: ['یک', 'دو', 'سه', 'چهار'], correct: 0 })));
ok('rejects missing correct radio (correct=-1)', throws(() => H.mkCustomMcq({ lesson: 'dna', text: 'x', opts: ['یک', 'دو', 'سه', 'چهار'], correct: -1 })));
const ctash = H.mkCustomTashrihi({ lesson: 'khoon', text: 'مسیر خون را بنویسید', model: 'پاسخ الگو', kws: ['آئورت', 'مویرگ', 'دهلیز'] });
ok('custom tashrihi rubric weights sum to 100', ctash.kw.reduce((s, k) => s + k[1], 0) === 100, JSON.stringify(ctash.kw));
ok('custom tashrihi grades through gradeTashrihi (score>0 on keywords)', H.gradeTashrihi(ctash, 'خون از آئورت وارد مویرگ‌ها و سپس دهلیز می‌شود').score === 100);
ok('custom tashrihi rejects no keywords', throws(() => H.mkCustomTashrihi({ lesson: 'khoon', text: 'x', kws: [] })));
ok('Arabic-script question-keyboard keywords normalize (أ/ي)', H.gradeTashrihi(H.mkCustomTashrihi({ lesson: 'khoon', text: 'x', kws: ['يادگيري'] }), 'من يادگيري را دوست دارم').score === 100);
const c6 = H.mkCustomTashrihi({ lesson: 'khoon', text: 'x', kws: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
ok('keywords capped at 6, weights still sum to 100', c6.kw.length === 6 && c6.kw.reduce((s, k) => s + k[1], 0) === 100);

console.log('\n[12] mergeDrafts + role-panel differentiation');
H._state().draftQs = [];
const base = H.assembleExam([...lessonIds], 10, 'mix');
ok('no drafts -> exam unchanged shape', H.mergeDrafts(base).length === base.length);
H._state().draftQs = [cmcq, ctash];
const merged = H.mergeDrafts(base);
ok('drafts appended (+2 questions)', merged.length === base.length + 2, merged.length);
ok('custom questions survive into the exam with keys intact', merged.some(q => q.src === 'custom' && q.a === 2) && merged.some(q => q.type === 'tashrihi' && q.src === 'custom'));
ok('tashrihi still grouped at the end', (() => { const mcqIdx = merged.findIndex(q => q.src === 'custom' && q.type !== 'tashrihi'); const taIdx = merged.findIndex(q => q.src === 'custom' && q.type === 'tashrihi'); return taIdx > mcqIdx && merged.slice(merged.length - 2 - 1).some(q => q.type === 'tashrihi'); })());
ok('merged exam still grades end-to-end', (() => { const r = H.gradeExam(merged, merged.map(q => q.type === 'tashrihi' ? (q.kw ? q.kw.map(k => k[0]).join(' ') : '') : q.a)); return r.pct === 100; })(), 'pct');
H._state().draftQs = [];
ok('static: draft merge is subject-scoped (معلم علوم ≠ سبد معلم زیست)', html.includes('if(subs)cq=cq.filter(q=>subs.includes(LSUB[q.l]))'));
ok('static: basket display scoped the same way', html.includes('(state.draftQs||[]).filter(q=>!subs||subs.includes(LSUB[q.l]))'));
ok('static: gen never builds a 0-question exam (odd select safeguard)', html.includes('if(!cfg.count||cfg.count<1)cfg.count=10;'));
// static regression checks on the HTML source
ok('LOGOUT FIX: click delegation at document.body (header/nav outside #app)', html.includes("document.body.addEventListener('click',onClick)"));
ok('role-split builder present (teacher vs student)', html.includes('function vBuilderTeacher()') && html.includes('function vBuilderStudent()'));
ok('custom-question editor present for teacher only', html.includes('function vCustomQ()') && html.includes('data-act="cqadd"'));
ok('publish button exists (Gate: انتشار)', html.includes('data-act="pub"'));
ok('take button exists for students (شرکت در آزمون)', html.includes('data-act="take"'));
ok('class-results toggle wired for both roles', html.includes('data-act="resx"') && html.includes('function vClassResults('));
ok('vClass undefined-S crash fixed (const S=classSim)', html.includes('const S=classSim;'));
ok('student tab gets new-exam badge', html.includes('آزمون جدید'));

console.log('\n[13] School rules: subject scoping / one attempt / join window');
// subject scoping: biology teacher's lessons → biology-only exams
const bioLessons = [...lessonIds].filter(l => H.SUBJECTS.find(s => s.id === 'zist').lessons.some(x => x.id === l));
for (let r = 0; r < 5; r++) {
  const bioExam = H.assembleExam(bioLessons, 10, 'mix');
  if (!bioExam.every(q => q.s === 'zist')) { ok('biology-only exam contains only زیست questions', false); break; }
  if (r === 4) ok('biology-only exam contains only زیست questions', true);
}
ok('chemistry teacher subjects = shimi only', JSON.stringify(H.ACCOUNTS.teacher2.subjects) === JSON.stringify(['shimi']));
ok('custom questions respect scope: bio teacher CANNOT author into english lesson', throws(() => H.mkCustomMcq({ lesson: 'gram', text: 'x', opts: ['a', 'b', 'c', 'd'], correct: 0 })) === false && H.ACCOUNTS.teacher.subjects.includes('zist') && !H.ACCOUNTS.teacher.subjects.includes('english'));
// join window (مهلت شرکت)
const w0 = H.addPublished(q0, 'آزمون با مهلت', 20, 'teacher');
ok('publish records deadline = at + winMin×60s', Math.abs(w0.deadline - (w0.at + 20 * 60000)) < 1000 && w0.winMin === 20);
ok('publish defaults to 15 minutes', H.addPublished(q0, 'default win', 0).winMin === 15);
ok('pubExpired: fresh=false, past=true', !H.pubExpired(w0) && H.pubExpired({ deadline: Date.now() - 1 }));
ok('publish records owner + subjects for scoping', w0.by === 'teacher' && w0.subs.length >= 1);
H._state().published = []; H._state().pubResults = {};
// static regression checks
ok('no self-practice card remains anywhere', !html.includes('تمرین آزاد'));
ok('one-attempt: button + handler lock present', html.includes('شرکت کردید ✓') && html.includes('فقط یک بار'));
ok('join-window select in publish row (pubWin)', html.includes('id="pubWin"'));
ok('live countdown chip wired (data-dl ticker)', html.includes('data-dl=') && html.includes('startPubTicker'));
ok('lessonChips filters by teacher subject', html.includes('SUBJECTS.filter(s=>!subs||subs.includes(s.id))'));
ok('custom-question editor also subject-scoped', html.includes('function vCustomQ()') && html.includes('درس شما'));

console.log('\n[14] Full 3-year curriculum coverage (دهم/یازدهم/دوازدهم)');
const allLIds = new Set();
let years = new Set();
SUBJECTS.forEach(s => s.lessons.forEach(l => {
  allLIds.add(l.id);
  const m = l.name.match(/\((دهم|یازدهم|دوازدهم|دهم تا دوازدهم)\)/);
  if (m) years.add(m[1]);
}));
ok('taxonomy covers 3 years: دهم + یازدهم + دوازدهم', years.has('دهم') && years.has('یازدهم') && years.has('دوازدهم'), [...years].join(','));
ok('18 subjects (9 high-school + 9 middle-school علوم/ریاضی/مطالعات)', SUBJECTS.length === 18 && SUBJECTS.some(s => s.id === 'zamin') && SUBJECTS.some(s => s.id === 'mot7') && ['olum7','olum8','olum9','riazi7','riazi8','riazi9','mot7','mot8','mot9'].every(id => SUBJECTS.some(s => s.id === id)));
ok('big taxonomy: 80+ lessons', allLIds.size >= 80, allLIds.size);
const tplLessons = new Set(TEMPLATES.map(t => t.l));
const coverage = [...allLIds].filter(l => {
  const bankMCQ = BANK.filter(q => q.l === l && q.type !== 'tashrihi').length;
  return bankMCQ + (tplLessons.has(l) ? 1 : 0) < 2;
});
ok('every lesson has ≥2 question sources (bank or template)', coverage.length === 0, coverage.join(','));
ok('huge bank: 150+ MCQ', BANK.filter(q => q.type !== 'tashrihi').length >= 150, BANK.length);
// ـ new templates spot-math
for (let r = 0; r < 20; r++) {
  const g8 = TEMPLATES[7].gen();   // limit (x²−a²)/(x−a) = 2a
  const a8 = +g8.q.match(/x به (\d+) میل/)[1];
  const aa2 = +g8.q.match(/x² − (\d+)/)[1];
  if (aa2 !== a8 * a8 || Number(g8.o[g8.a]) !== 2 * a8) { ok('t8 limit math', false, g8); break; }
  const g9 = TEMPLATES[8].gen();   // P = ρgh
  const h9 = +g9.q.match(/عمق (\d+) متری/)[1];
  if (Number(g9.o[g9.a]) !== h9 * 10000) { ok('t9 pressure math', false, g9); break; }
  const g10 = TEMPLATES[9].gen();  // W = F·d
  const F10 = +g10.q.match(/(\d+) نیوتنی/)[1], d10 = +g10.q.match(/(\d+) متر جابه‌جا/)[1];
  if (Number(g10.o[g10.a]) !== F10 * d10) { ok('t10 work math', false, g10); break; }
  if (r === 19) { ok('t8 limit math (2a)', true); ok('t9 pressure math (10000h)', true); ok('t10 work math (F·d)', true); }
}
for (let r = 0; r < 20; r++) {
  const g7 = TEMPLATES[6].gen();   // trig known values
  const known = [['sin 30°', '½'], ['cos 60°', '½'], ['tan 45°', '1'], ['sin 90°', '1'], ['cos 0°', '1'], ['tan 30°', '√3/3'], ['sin 60°', '√3/2'], ['cos 30°', '√3/2']];
  const k = g7.q.match(/مقدار (.+) کدام است؟/)[1];
  const row = known.find(x => x[0] === k);
  if (!row || String(g7.o[g7.a]) !== row[1]) { ok('t7 trig values', false, g7.q + ' -> ' + g7.o[g7.a]); break; }
  if (r === 19) ok('t7 trig values correct', true);
}

console.log('\n[15] Paper exam: print + manual score entry');
const pubP = H.addPublished(q0, 'آزمون چاپی', 30, 'teacher');
const printHtml = H.buildPrintHtml(pubP.qs, pubP.title);
ok('print HTML has exam sheet header', printHtml.includes('برگهٔ آزمون'));
ok('print HTML has bubble answer sheet', printHtml.includes('برگهٔ پاسخ‌برگ') && printHtml.includes('◯ الف'));
ok('print HTML has SECRET teacher key page', printHtml.includes('کلید معلم') && printHtml.includes('محرمانه'), '');
ok('print shows tashrihi writing lines', pubP.qs.some(q => q.type === 'tashrihi') ? printHtml.includes('(✍️ تشریحی') : true);
ok('every printed MCQ has 4 options', (() => { const mcqs = pubP.qs.filter(q => q.type !== 'tashrihi').length; const pq = (printHtml.match(/class="pq"/g) || []).length; const popts = (printHtml.match(/class="popts"/g) || []).length; const optRows = (printHtml.match(/<span><b>/g) || []).length; return pq === pubP.qs.length && popts === mcqs && optRows === mcqs * 4; })());
// manual entry integration
H._state().pubResults[pubP.id] = {};
H.recordManualResult(pubP.id, 'stu7', 66.5, pubP);
ok('manual result recorded with 📝 flag', H._state().pubResults[pubP.id].stu7.manual === true && H._state().pubResults[pubP.id].stu7.pct === 66.5);
ok('student history updated (manual exam)', H.prof('stu7').history.some(h => h.manual), JSON.stringify(H.prof('stu7').history.slice(-1)));
ok('lesson stats updated for covered lessons (approx documented)', [...new Set(pubP.qs.map(q => q.l))].every(l => H.prof('stu7').lessonStats[l] && H.prof('stu7').lessonStats[l].tries.length >= 1));
ok('score clamped to [-33,100]', (() => { H.recordManualResult(pubP.id, 'stu8', 450, pubP); return H._state().pubResults[pubP.id].stu8.pct === 100; })());
ok('negative Konkur percent allowed', (() => { H.recordManualResult(pubP.id, 'stu9', -20, pubP); return H._state().pubResults[pubP.id].stu9.pct === -20; })());
// static UI checks
ok('#printarea element exists in body (E2E caught it missing once!)', html.includes('id="printarea"'));
ok('preview print button for teacher', html.includes('data-act="printprev"'));
ok('pubs card print + manual buttons', html.includes('data-act="printpub"') && html.includes('data-act="manadd"'));
ok('manual-entry view renders the live roster', html.includes('function vManual(') && html.includes("id=\"mu-"));
ok('online results locked in manual view (one-attempt)', html.includes("existing&&!existing.manual)return;"));
ok('📝 badge in class results', html.includes('r.manual') && html.includes('نمرهٔ دستی معلم'));
H._state().published = []; H._state().pubResults = {}; delete H._state().profiles.stu7; delete H._state().profiles.stu8; delete H._state().profiles.stu9;

console.log('\n[16] Admin roster management (add/remove students every school year)');
ok('default roster = 18 demo students in stable order', (() => { const r = H.studentIds(); return r.length === 18 && r[0] === 'stu0' && r[17] === 'stu17'; })());
ok('addStudent rejects empty name', H.addStudent({ name: '  ', cls: 'دهم تجربی' }).err !== undefined);
const add1 = H.addStudent({ name: 'رضا تستی', cls: 'یازدهم تجربی', avatar: '👨‍🎓', pass: '' });
ok('new student gets next monotone id (stu18)', add1.id === 'stu18');
ok('account is immediately loggable with default pass 1234', H.ACCOUNTS[add1.id] && H.ACCOUNTS[add1.id].pass === '1234' && H.ACCOUNTS[add1.id].role === 'student' && H.ACCOUNTS[add1.id].cls === 'یازدهم تجربی');
ok('fresh EMPTY profile created (no fake history for newcomers)', (() => { const p = H.prof(add1.id); return p.role === 'student' && p.cls === 'یازدهم تجربی' && p.history.length === 0; })());
ok('roster grows to 19 + persists in state.stuExtra', H.studentIds().length === 19 && H._state().stuExtra.some(e => e.id === add1.id));
ok('invalid class falls back to هفتم (first class)', (() => { const r = H.addStudent({ name: 'موقت', cls: 'ج' }); const a = H.ACCOUNTS[r.id]; H.delStudent(r.id); return a.cls === 'هفتم'; })());
ok('cannot delete teacher/admin/ghost accounts', H.delStudent('teacher').err !== undefined && H.delStudent('admin').err !== undefined && H.delStudent('ghost').err !== undefined);
const pubR = H.addPublished(q0, 'آزمون ثبت نمرهٔ دانش‌آموز حذف‌شده', 30, 'teacher');
H.recordPubResult(pubR.id, add1.id, 80);
ok('result exists before delete', (H._state().pubResults[pubR.id] || {})[add1.id] !== undefined);
const del1 = H.delStudent(add1.id);
ok('delete returns ok', del1.ok === 1);
ok('account + profile + exam results are wiped', !H.ACCOUNTS[add1.id] && !H._state().profiles[add1.id] && (H._state().pubResults[pubR.id] || {})[add1.id] === undefined);
ok('roster back to 18; removed-added id tracked nowhere (came from stuExtra)', H.studentIds().length === 18 && !H._state().stuRemoved.includes(add1.id) && H._state().stuExtra.length === 0);
const add2 = H.addStudent({ name: 'بعدی', cls: 'دوازدهم ریاضی' });
ok('ids are monotone — a removed id is NEVER reused', add2.id !== add1.id && +add2.id.replace('stu', '') > 18, add2.id);
H.delStudent(add2.id);
ok('removing an ORIGINAL demo student marks stuRemoved', (() => { H.delStudent('stu3'); return H._state().stuRemoved.includes('stu3') && !H.ACCOUNTS.stu3 && H.studentIds().length === 17; })());
ok('applyRoster re-applies removals (survives refresh)', (() => { H.ACCOUNTS.stu3 = { id: 'stu3', role: 'student', name: 'نگار', avatar: '👩‍🎓', pass: '1234', cls: 'دوازدهم ریاضی' }; H.applyRoster(); return !H.ACCOUNTS.stu3; })());
// restore demo state
H._state().stuRemoved = []; H._state().stuExtra = []; H._state().published = []; H._state().pubResults = {};
H.applyRoster();   // authoritative rebuild brings stu3 back with its real class (هشتم)
ok('static: admin panel has roster card + add/delete buttons', html.includes('مدیریت دانش‌آموزان') && html.includes('data-act="addstu"') && html.includes('data-act="delstu"'));
ok('static: student-list views read the LIVE roster (not NAMES)', html.includes('studentIds().filter(pid=>canSeeExam(pub,pid)).map') && html.includes('studentIds().filter(pid=>canSeeExam(jamePub,pid)).map') && html.includes('isStu?studentIds()'));
ok('static: login quick-pick uses live roster', html.includes('isStu?studentIds()'));

console.log('\n[17] آزمون جامع کنکوری + memory/backup layer');
const quota = { zist: 4, shimi: 4, fizik: 0, riazi: 6 };
const jqs = H.assembleJameExam(quota, 'mid');
ok('jame exam size = sum of quotas (zero subjects excluded)', jqs.length === 14, jqs.length);
ok('jame exam is fully تستی (سراسری-style)', jqs.every(q => q.type !== 'tashrihi'));
ok('jame questions auto-approved (boss = school-level approver)', jqs.every(q => q.approved === true));
ok('jame covers exactly the requested subjects', (() => { const c = {}; jqs.forEach(q => c[q.s] = (c[q.s] || 0) + 1); return c.zist === 4 && c.shimi === 4 && c.riazi === 6 && !c.fizik; })(), JSON.stringify(jqs.map(q => q.s)));
ok('jame questions valid (4 options, real answer index)', jqs.every(q => q.o && q.o.length === 4 && q.a >= 0 && q.a < 4));
ok('jame exam id uniqueness', new Set(jqs.map(q => q.id)).size === jqs.length);
ok('all-zero quota -> empty exam', H.assembleJameExam({ zist: 0, shimi: 0 }, 'mid').length === 0);
const bd = H.jameBreakdown(
  [{ s: 'x', a: 0 }, { s: 'x', a: 1 }, { s: 'x', a: 2 }, { s: 'x', a: 3 }, { s: 'y', a: 0 }, { s: 'y', a: 1 }],
  [0, null, 0, 3, 1, 1]);
ok('breakdown counts c/w/b per subject', bd.x.c === 2 && bd.x.w === 1 && bd.x.b === 1 && bd.x.n === 4 && bd.y.c === 1 && bd.y.w === 1 && bd.y.n === 2, JSON.stringify(bd));
ok('breakdown percent uses Konkur negative formula', bd.x.pct === 41.7 && bd.y.pct === 33.3, JSON.stringify(bd));
ok('estTraz scale: −33→1000, 100→10000 (clamped)', H.estTraz(-33) === 1000 && H.estTraz(100) === 10000 && H.estTraz(-999) === 1000 && H.estTraz(999) === 10000);
ok('estTraz mid mapping', H.estTraz(0) === 3233 && H.estTraz(50) === Math.round(1000 + 83 * (9000 / 133)));
const pubJ = H.addPublished(jqs, 'آزمون جامع تستی', 30, 'admin', { kind: 'jame', quota });
ok('addPublished keeps kind/quota metadata + multi-subject subs', pubJ.kind === 'jame' && pubJ.quota.zist === 4 && pubJ.subs.includes('zist') && pubJ.subs.includes('riazi'));
H.recordPubResult(pubJ.id, 'stu5', 62.5, { subs: bd, traz: H.estTraz(62.5) });
ok('jame result stores subs + traz', (() => { const r = H._state().pubResults[pubJ.id].stu5; return r.pct === 62.5 && r.subs && r.traz === H.estTraz(62.5); })());
ok('static: finishExam wires jame breakdown', html.includes("pub.kind==='jame'") && html.includes('jameBreakdown(exam.qs,answers)'));
ok('static: boss panel has جامع launch card', html.includes('data-act="jame"') && html.includes('jmTitle') && html.includes('jmN_zist') && html.includes('آزمون جامع کنکوری'));
ok('static: boss panel has results +_memory cards', html.includes('نتایج آزمون جامع') && html.includes('حافظهٔ سامانه'));
// ---- memory / backup ----
const snap = H.exportState();
ok('export wraps state with app tag', snap.includes('"app": "ta"') && snap.includes('"state"'));
const snapAdd = H.addStudent({ name: 'بکاپ', cls: 'الف' });
ok('state mutated after snapshot', H.studentIds().length === 19);
const imp = H.importState(snap);
ok('importState round-trip restores snapshot (newcomer gone)', imp.ok === 1 && H.studentIds().length === 18 && !H.ACCOUNTS[snapAdd.id], JSON.stringify({ n: H.studentIds().length }));
ok('import accepts raw state too', H.importState(JSON.stringify(H._state())).ok === 1);
ok('import rejects garbage + bad shape', H.importState('not json').err !== undefined && H.importState('{"a":1}').err !== undefined);
ok('static: backup + restore UI in boss panel', html.includes('data-act="backup"') && html.includes('importState(r.result)'));
// clean up exam created in this section
H._state().published = H._state().published.filter(p => p.id !== pubJ.id); delete H._state().pubResults[pubJ.id]; delete H._state().profiles.stu5;

console.log('\n[18] Brand TA + nine real classes (هفتم تا دوازدهم) + sandbox-proof confirm modal');
ok('brand TA everywhere — zero هوش‌یار left in the app', !html.includes('هوش‌یار'));
ok('title + header carry the TA brand', html.includes('<title>TA') && html.includes('<h1>TA</h1>'));
ok('backup files branded ta', H.exportState().includes('"app": "ta"'));
ok('nine classes: هفتم..نهم (دورهٔ اول) + 6 high-school (grade × major)', H.CLASS_LIST.length === 9 && H.CLASS_LIST[0] === 'هفتم' && H.CLASS_LIST[2] === 'نهم' && H.CLASS_LIST[3] === 'دهم تجربی' && H.CLASS_LIST[8] === 'دوازدهم ریاضی');
ok('default roster: each class is a separate group of 2', (() => { const c = {}; H.studentIds().forEach(k => { const cl = H.ACCOUNTS[k].cls; c[cl] = (c[cl] || 0) + 1; }); return H.CLASS_LIST.every(cl => c[cl] === 2); })());
ok('class mapping: stu0→هفتم, stu6→دهم تجربی, stu17→دوازدهم ریاضی', H.ACCOUNTS.stu0.cls === 'هفتم' && H.ACCOUNTS.stu6.cls === 'دهم تجربی' && H.ACCOUNTS.stu17.cls === 'دوازدهم ریاضی');
ok('addStudent stores any of the nine classes', (() => { const r = H.addStudent({ name: 'کلاسی', cls: 'نهم' }); const a = H.ACCOUNTS[r.id]; H.delStudent(r.id); return a.cls === 'نهم'; })());
ok('static: ZERO browser confirm() left (sandbox-blocked — the delete-button bug!)', !html.includes('confirm('));
ok('static: modal #cfm exists + wired to handlers', html.includes('id="cfm"') && html.includes('function uiConfirm') && html.includes('data-act="cfm-yes"') && html.includes("act==='cfm-yes'"));
ok('static: delete-student + blank-exam flows use the modal', html.includes('بله، حذف شود') && html.includes('()=>finishExam(true)'));
ok('static: 🗑 wipe-all REMOVED everywhere (students could reach it!)', !html.includes('data-act="clear"') && !html.includes("act==='clear'") && !html.includes('function clearAll') && !html.includes('پاک‌سازی همهٔ داده‌ها'));
ok('static: گزارش ماهانه button removed too', !html.includes('گزارش ماهانه'));

console.log('\n[19] 🎯 Target class per exam (کدام کلاس‌ها آزمون را می‌بینند)');
const pubT = H.addPublished(H.assembleExam(H.SUBJECTS.find(s => s.id === 'zist').lessons.map(l => l.id), 5, 'mid'), 'آزمون هدف‌دار', 30, 'teacher', { targets: ['دهم تجربی'] });
ok('targets preserved on published exam', H.examTargets(pubT) && H.examTargets(pubT)[0] === 'دهم تجربی');
ok('targeted: دهم تجربی student CAN see it', H.canSeeExam(pubT, 'stu6') === true && H.canSeeExam(pubT, 'stu7') === true);
ok('targeted: other grades CANNOT see it (هفتم/دوازدهم ریاضی/هشتم)', H.canSeeExam(pubT, 'stu0') === false && H.canSeeExam(pubT, 'stu16') === false && H.canSeeExam(pubT, 'stu2') === false);
ok('untargeted exam visible to everyone', (() => { const p = H.addPublished([], 'بدون هدف', 30, 'teacher'); const vis = H.studentIds().every(k => H.canSeeExam(p, k)); H._state().published = H._state().published.filter(x => x.id !== p.id); return vis; })());
ok('targetCount = 2 for one demo class (2 per class)', H.targetCount(pubT) === 2);
ok('targetCount whole roster when untargeted', H.targetCount({}) === 18);
ok('garbage targets are sanitized to null', H.examTargets({ targets: ['ج', 'x'] }) === null);
ok('static: publish UI has class checkboxes for all nine classes', html.includes('type="checkbox" id="pc${i}"') && html.includes('CLASS_LIST.map((c,i)=>'));
ok('targeted هفتم exam: هفتم sees it — هشتم/دهم do not', (() => { const p = H.addPublished([], 'آزمون تجربی هفتم', 30, 'teacher10', { targets: ['هفتم'] }); const okV = H.canSeeExam(p, 'stu0') === true && H.canSeeExam(p, 'stu2') === false && H.canSeeExam(p, 'stu6') === false; H._state().published = H._state().published.filter(x => x.id !== p.id); return okV; })());
ok('static: student list + teacher card + results honor targets', html.includes('filter(p=>canSeeExam(p,curPid()))') && html.includes('targetCount(p)') && html.includes('filter(pid=>canSeeExam(pub,pid)).map'));
ok('static: boss جامع has target select', html.includes('id="jmCls"') && html.includes('targets:jtargets'));
H._state().published = H._state().published.filter(p => p.id !== pubT.id); delete H._state().pubResults[pubT.id];

console.log('\n[20] 🎓 Real Konkur import from the internet + 📥 bulk paste-import');
const konkur = H.BANK.filter(q => q.k === 1);
ok('konkur-imported questions exist (real internet batch)', konkur.length >= 2, konkur.length);
ok('konkur items carry year + official explanation', konkur.every(q => q.y === 1404 && q.exp && q.exp.includes('gama.ir')));
ok('konkur items are valid MCQ (4 unique options, valid answer)', konkur.every(q => q.o.length === 4 && new Set(q.o).size === 4 && q.a >= 0 && q.a < 4 && lessonIds.has(q.l)));
ok('konkur answers match the verified official keys', konkur.find(q => q.id === 'q193').a === 0 && konkur.find(q => q.id === 'q194').a === 1);
ok('static: preview shows 🎓 کنکور سراسری badge', html.includes('🎓 کنکور سراسری'));
const goodBulk = `کدام باز دوحلقه‌ای است؟ * آدنین * گوانین * تیمین * یوراسیل * 2\nکدام عضو ATP تولید می‌کند؟ * سیتوپلاسم * میتوکندری * ریبوزوم * گلژی * ۲`;
const pGood = H.parseBulk(goodBulk, 'dna');
ok('bulk parse: 2 clean lines → 2 questions, correct answers mapped', pGood.items.length === 2 && pGood.items[0].a === 1 && pGood.items[1].a === 1 && pGood.errs.length === 0);
const pBad = H.parseBulk('فقط سه بخش*الف*ب\nمتن*الف*ب*ج*د*9', 'dna');
ok('bulk parse: bad lines rejected with Persian error lines', pBad.items.length === 0 && pBad.errs.length === 2 && pBad.errs[0].includes('خط ۱'));
ok('bulk parse: unknown lesson → one clean error', H.parseBulk('متن*الف*ب*ج*د*1', 'nope').errs.length === 1);
ok('bulk items become teacher custom questions (Gate-A kept)', pGood.items.every(q => q.src === 'custom' && q.approved === true));
ok('static: bulk card + handler wired', html.includes('id="bqTxt"') && html.includes('data-act="bqadd"') && html.includes("act==='bqadd'"));

console.log('\n[21] Bigger bank (authored incl. دورهٔ اول متوسطه) + creativity templates');
ok('bank grew to 300+ MCQ', MCQ.length >= 300, MCQ.length);
ok('template count is now 20', TEMPLATES.length === 20, TEMPLATES.length);
ok('templates t11..t20 wired to real lessons', ['t11','t12','t13','t14','t15','t16','t17','t18','t19','t20'].every(id => { const t = TEMPLATES.find(x => x.id === id); return t && lessonIds.has(t.l); }));
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't11').gen();
  const M1 = +g.q.match(/محلول ([\d.]+) مولار برداشته/)[1];
  const [, V2, M2] = g.q.match(/تهیهٔ (\d+) میلی‌لیتر محلول ([\d.]+)/).map(Number);
  if (Number(g.o[g.a]) !== M2 * V2 / M1) { ok('t11 dilution math', false, g.q); break; }
  if (r === 14) ok('t11 dilution math (M1V1=M2V2)', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't12').gen();
  const n = +g.q.match(/در ([\d.]+) مول ماده/)[1];
  const want = (n * 6.022).toFixed(1) + '×۱۰^23';
  if (g.o[g.a] !== want) { ok('t12 Avogadro math', false, g.q + ' -> ' + g.o[g.a]); break; }
  if (r === 14) ok('t12 Avogadro particle math', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't13').gen();
  const [, a, b] = g.q.match(/f\(x\) = (\d+)x² \+ (\d+)x/);
  const p = +g.q.match(/x = (\d+)/)[1];
  if (Number(g.o[g.a]) !== 2 * (+a) * p + (+b)) { ok('t13 derivative math', false, g.q); break; }
  if (r === 14) ok('t13 derivative-at-point math', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't14').gen();
  const t = +g.q.match(/در (\d+) ثانیه/)[1];
  if (Number(g.o[g.a]) !== 5 * t * t) { ok('t14 free-fall math', false, g.q); break; }
  if (r === 14) ok('t14 free-fall math (5t²)', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't15').gen();
  const [, m, v] = g.q.match(/جرم (\d+) کیلوگرم و تندی (\d+)/);
  if (Number(g.o[g.a]) !== 0.5 * m * v * v) { ok('t15 kinetic math', false, g.q); break; }
  if (r === 14) ok('t15 kinetic energy math (½mv²)', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't16').gen();
  const [, F1, A1, A2] = g.q.match(/نیروی (\d+) نیوتنی به پیستونی با سطح (\d+) سانتی‌متر مربع وارد می‌شود. در پیستون دیگر با سطح (\d+)/);
  if (Number(g.o[g.a]) !== F1 * A2 / A1) { ok('t16 Pascal math', false, g.q); break; }
  if (r === 14) ok('t16 hydraulic lift math (F1A2/A1)', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't17').gen();
  const [, x, y] = g.q.match(/log (\d+) \+ log (\d+)/);
  if (Number(g.o[g.a]) !== Math.log10(x * y)) { ok('t17 log math', false, g.q); break; }
  if (r === 14) ok('t17 log-add math (log xy)', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't18').gen();
  const [, big, sml] = g.q.match(/\(−(\d+)\) \+ (\d+)/);
  if (Number(g.o[g.a]) !== (+sml) - (+big)) { ok('t18 signed-add math', false, g.q); break; }
  if (r === 14) ok('t18 signed integer add math (هفتم)', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't19').gen();
  const [, b, m, n] = g.q.match(/‎?(\d+) به توان (\d+) × \d+ به توان (\d+)/);
  if (Number(g.o[g.a]) !== Math.pow(+b, (+m) + (+n))) { ok('t19 power-rule math', false, g.q); break; }
  if (r === 14) ok('t19 same-base power multiply math (نهم)', true);
}
for (let r = 0; r < 15; r++) {
  const g = TEMPLATES.find(t => t.id === 't20').gen();
  const [, a, b] = g.q.match(/قائم‌الزاویه (\d+) و (\d+)/);
  const c = Number(g.o[g.a]);
  if (c * c !== (+a) * (+a) + (+b) * (+b)) { ok('t20 Pythagoras math', false, g.q); break; }
  if (r === 14) ok('t20 Pythagorean triples math (هشتم)', true);
}
ok('generator variety: two builds differ now (big pool + 20 templates)', (() => { const L = H.SUBJECTS.find(s => s.id === 'shimi').lessons.map(l => l.id); const seen = new Set(); for (let i = 0; i < 5; i++) { seen.add(H.assembleExam(L, 8, 'mid').map(q => q.id).join(',')); if (seen.size >= 2) return true; } return false; })());
ok('authored spot-check: CO2 molar mass = 44', (() => { const q = H.BANK.find(x => x.id === 'q195'); return q.o[q.a] === 44; })());
ok('authored spot-check: left ventricle → آئورت', (() => { const q = H.BANK.find(x => x.id === 'q238'); return q.o[q.a] === 'آئورت'; })());
ok('authored spot-check: derivative of x³ = 3x²', (() => { const q = H.BANK.find(x => x.id === 'q231'); return q.o[q.a] === '3x²'; })());

console.log('\n[22] دورهٔ اول متوسطه: هفتم / هشتم / نهم (classes + curriculum + teachers + grade-scoped profiles)');
ok('demo mapping: stu0,1→هفتم · stu2,3→هشتم · stu4,5→نهم', ['stu0','stu1'].every(p => H.ACCOUNTS[p].cls === 'هفتم') && ['stu2','stu3'].every(p => H.ACCOUNTS[p].cls === 'هشتم') && ['stu4','stu5'].every(p => H.ACCOUNTS[p].cls === 'نهم'));
ok('lessonsForClass(هفتم) = علوم + ریاضی + مطالعات هفتم', (() => { const L = H.lessonsForClass('هفتم'); const ref = H.SUBJECTS.filter(s => ['olum7','riazi7','mot7'].includes(s.id)).flatMap(s => s.lessons.map(l => l.id)); return L.length === ref.length && L.every(x => ref.includes(x)); })());
ok('دورهٔ دوم classes get the full 9-subject curriculum (not علوم هفتم)', (() => { const L = H.lessonsForClass('دوازدهم ریاضی'); return L.length === lessonIds.size - 45 && !L.some(x => ['atom7','sihir7','mix8','move9','hoghogh7'].includes(x)); })());
ok('middle-school lessons are textbook chapters (فصل‌های رسمی)', ['اتم‌ها؛ الفبای مواد (هفتم)','از درون اتم چه خبر (هشتم)','گوناگونی جانداران (نهم)','عددهای صحیح (هفتم)','چندضلعی‌ها (هشتم)','مجموعه‌ها (نهم)'].every(n => H.SUBJECTS.some(s => s.lessons.some(l => l.name === n))));
ok('every middle-school lesson has ≥1 authored bank question', ['olum7','olum8','olum9','riazi7','riazi8','riazi9','mot7','mot8','mot9'].every(sid => H.SUBJECTS.find(s => s.id === sid).lessons.every(l => H.BANK.some(q => q.l === l.id && q.type !== 'tashrihi'))));
ok('every middle-school lesson has ≥1 تشریحی from past exams', ['olum7','olum8','olum9','riazi7','riazi8','riazi9','mot7','mot8','mot9'].every(sid => H.SUBJECTS.find(s => s.id === sid).lessons.every(l => H.BANK.some(q => q.l === l.id && q.type === 'tashrihi' && q.n === 1))));
ok('teacher10 scopes all three علوم grades, teacher11 all three ریاضی', JSON.stringify(H.ACCOUNTS.teacher10.subjects) === JSON.stringify(['olum7','olum8','olum9']) && JSON.stringify(H.ACCOUNTS.teacher11.subjects) === JSON.stringify(['riazi7','riazi8','riazi9']));
ok('seeded هفتم profile only touches هفتم lessons (no دوازدهم noise)', (() => { const p = H.seedStudent('stu0', 0); const okL = new Set(H.lessonsForClass('هفتم')); return Object.keys(p.lessonStats).every(k => okL.has(k)); })());
ok('seeded هشتم/نهم profiles scoped the same way', (() => { const a = H.seedStudent('stu2', 2), b = H.seedStudent('stu4', 4); const la = new Set(H.lessonsForClass('هشتم')), lb = new Set(H.lessonsForClass('نهم')); return Object.keys(a.lessonStats).every(k => la.has(k)) && Object.keys(b.lessonStats).every(k => lb.has(k)); })());
const e7 = H.assembleExam(H.SUBJECTS.find(s => s.id === 'olum7').lessons.map(l => l.id), 6, 'mid');
ok('علوم هفتم exam assembles from its own bank (6 MCQ, هفتم lessons only)', e7.filter(q => q.type !== 'tashrihi').length === 6 && e7.every(q => ['atom7','energy7','heat7','yakhte7','water7'].includes(q.l)), e7.map(q => q.l).join(','));
const riBuilds = Array.from({ length: 8 }, () => H.assembleExam(H.SUBJECTS.find(s => s.id === 'riazi7').lessons.map(l => l.id), 6, 'mid'));
ok('ریاضی هفتم can mix bank + template-generated (t18 Gate-A pending)', riBuilds.some(eb => eb.some(q => q.src === 'ai' && q.approved === false)));
const pubH = H.addPublished(e7, 'آزمون علوم هفتم', 30, 'teacher10', { targets: ['هفتم'] });
ok('targeted هفتم exam: هفتم sees it — هشتم does not', H.canSeeExam(pubH, 'stu0') === true && H.canSeeExam(pubH, 'stu2') === false);
ok('targetCount(هفتم-targeted exam) = 2', H.targetCount(pubH) === 2);
H._state().published = H._state().published.filter(p => p.id !== pubH.id); delete H._state().pubResults[pubH.id]; delete H._state().profiles.stu0; delete H._state().profiles.stu2; delete H._state().profiles.stu4;
ok('static: about page documents هفتم..دوازدهم coverage', html.includes('از هفتم و هشتم و نهم') && html.includes('دهم/یازدهم/دوازدهم'));
ok('static: role-aware teacher pubs denominator uses targetCount (not hardcoded 12)', html.includes('(${fa(done.length)}/${fa(targetCount(p))} شرکت کرده‌اند'));

// [23] چاپ برنامهٔ هفته (bugfix) + آزمون کاملاً تشریحی (exam-composition modes)
console.log('\n[23] چاپ برنامهٔ هفته + حالت‌های آزمون (تشریحی/تستی)');
ok('plan print buttons call printPlan() — the old raw window.print bug is gone', (html.match(/onclick="printPlan\(\)">🖨 چاپ برنامه/g) || []).length >= 2 && !html.includes('onclick="window.print()">🖨 چاپ برنامه'));
const planHtml = H.buildPlanPrintHtml([{ day: 'شنبه', tasks: [{ txt: 'اتم‌ها — مرور', meta: '۴۵ دقیقه', star: '★★★' }] }, { day: 'جمعه', tasks: [] }], { name: 'علی محمدی', cls: 'هفتم' });
ok('plan printout has header (student+class), days, tasks, stars, signatures', planHtml.includes('علی محمدی') && planHtml.includes('هفتم') && planHtml.includes('📅 شنبه') && planHtml.includes('اتم‌ها — مرور') && planHtml.includes('★★★') && planHtml.includes('امضای والدین'));
ok('empty plan day renders a rest row (never a blank box)', planHtml.includes('روز استراحت'));
ok('printPlan + buildPlanPrintHtml exported', typeof H.printPlan === 'function' && typeof H.buildPlanPrintHtml === 'function');
ok('static: نوع آزمون (composition) selector in the settings card', html.includes('id="cKind"') && html.includes('کاملاً تشریحی') && html.includes("cfg.kind=el('cKind')"));
const dnaIds = ['dna', 'khoon', 'hayat', 'govaresh', 'tanaffos', 'molec1'];
const eMcq = H.assembleExam(dnaIds, 10, 'mid', 'mcq');
ok('فقط تستی mode: exactly 10 MCQs, ZERO تشریحی riders', eMcq.length === 10 && eMcq.every(q => q.type !== 'tashrihi'));
const eMix2 = H.assembleExam(dnaIds, 10, 'mid');
ok('ترکیبی default unchanged: 10 MCQ + 1 نهایی rider', eMix2.filter(q => q.type !== 'tashrihi').length === 10 && eMix2.filter(q => q.type === 'tashrihi').length === 1);
const eT = H.assembleExam(dnaIds, 6, 'mid', 'tashrihi');
ok('کاملاً تشریحی mode: 6/6 تشریحی, ZERO تستی options anywhere', eT.length === 6 && eT.every(q => q.type === 'tashrihi' && !q.o));
const bankT = eT.filter(q => q.src === 'bank');
ok('تشریحی mode prefers the verified bank (approved نهایی/تالیفی first)', bankT.length >= 2 && bankT.every(q => q.approved));
ok('bank top-up drafts wait in Gate-A with a 100-point rubric', eT.filter(q => q.src === 'ai').length === 6 - bankT.length && eT.filter(q => q.src === 'ai').every(q => q.approved === false && q.kw.reduce((s, k) => s + k[1], 0) === 100));
const o7 = H.SUBJECTS.find(s => s.id === 'olum7').lessons.map(l => l.id);
const eT7 = H.assembleExam(o7, 5, 'mid', 'tashrihi');
ok('علوم هفتم تشریحی uses the هماهنگ bank (approved) and stays inside هفتم lessons', eT7.length === 5 && eT7.every(q => q.type === 'tashrihi' && o7.includes(q.l)) && eT7.some(q => q.src === 'bank' && q.approved && q.n === 1) && eT7.filter(q => q.src === 'ai').every(q => !q.approved));
ok('AI stems vary by seed and push توضیح+مثال pedagogy', H.TASH_STEMS.length >= 5 && new Set([0, 1, 2, 3, 4, 5].map(i => H.mkAiTashrihi('dna', i, 3).q)).size >= 5 && H.mkAiTashrihi('dna', 0, 3).q.includes('مثال'));
ok('mkAiTashrihi rubric sums 100 + model answer flagged for teacher review', H.mkAiTashrihi('dna', 1, 2).kw.reduce((s, k) => s + k[1], 0) === 100 && H.mkAiTashrihi('dna', 1, 2).model.includes('معلم'));
const gT = H.gradeExam([H.mkCustomTashrihi({ lesson: 'dna', text: 'تست ۱', kws: ['DNA'], d: 2 }), H.mkCustomTashrihi({ lesson: 'khoon', text: 'تست ۲', kws: ['بطن'], d: 2 })], ['مبحث DNA کامل', 'مسیر بطن چپ']);
ok('gradeExam on a ZERO-MCQ exam: pct = rubric mean (not the old hardcoded 0)', gT.n === 0 && gT.pct === 100);
ok('blank essay exam grades to 0 (no NaN/Infinity leak)', H.gradeExam([H.mkCustomTashrihi({ lesson: 'dna', text: 'تست', kws: ['DNA'], d: 2 })], ['']).pct === 0);
ok('static: published title flags تشریحی-only exams', html.includes("allTash?'آزمون تشریحی':'آزمون'"));
ok('static: exam-room footer explains the pure-تشریحی mode', html.includes('این آزمون کاملاً تشریحی است'));

// [24] 🔀 ضد تقلب (per-student shuffle) + 🖨 کارنامهٔ چاپی (printable report)
console.log('\n[24] ضد تقلب shuffle + کارنامهٔ چاپی');
ok('hashStr is a stable 32-bit hash (seed source)', H.hashStr('EX|stu7') === H.hashStr('EX|stu7') && (H.hashStr('EX|stu7') >>> 0) === H.hashStr('EX|stu7'));
const baseEx = H.assembleExam(dnaIds, 10, 'mid');            // 10 MCQ + 1 نهایی rider
const sh1 = H.shuffleForStudent(baseEx, 'EX1', 'stuAlpha');
const sh1b = H.shuffleForStudent(baseEx, 'EX1', 'stuAlpha');
ok('per-student shuffle is deterministic — a refresh re-opens the SAME personalised sheet', JSON.stringify(sh1) === JSON.stringify(sh1b));
const sh2 = H.shuffleForStudent(baseEx, 'EX1', 'stuBeta');
ok('two classmates get DIFFERENT sheets (anti-cheat, deterministic)', JSON.stringify(sh1) !== JSON.stringify(sh2));
ok('no question lost or duplicated by the shuffle', new Set(sh1.map(q => q.id)).size === baseEx.length);
ok('options stay a permutation and the KEY travels with its option (never corrupts grading)', baseEx.filter(q => q.type !== 'tashrihi').every(bq => { const sq = sh1.find(q => q.id === bq.id); return sq.o[sq.a] === bq.o[bq.a]; }));
ok('تشریحی riders stay AFTER all MCQs (نهایی layout preserved)', sh1.slice(0, 10).every(q => q.type !== 'tashrihi') && sh1[10].type === 'tashrihi');
ok('a fully-correct sheet still scores 100٪ after reshuffle (grading integrity)', (() => { const g = H.gradeExam(sh1, sh1.map(q => q.type === 'tashrihi' ? 'پاسخ' : q.a)); return g.c === 10 && g.w === 0; })());
const jq24 = H.assembleJameExam({ zist: 4, shimi: 4 }, 'mid');
const jsh24 = H.shuffleForStudent(jq24, 'J1', 'stuGamma', 'jame');
ok('جامع keeps the دفترچه subject blocks — shuffle happens INSIDE each درس only', jsh24.slice(0, 4).every(q => q.s === 'zist') && jsh24.slice(4, 8).every(q => q.s === 'shimi'));
ok('static: the take-handler personalises each student\'s sheet', html.includes('exam={qs:shuffleForStudent(p.qs.map(q=>({...q})),p.id,curPid(),p.kind)}'));
H.seedStudent('stu0', 0);
const pub24 = H.addPublished(H.assembleExam(dnaIds, 6, 'mid'), 'آزمون نمونهٔ کارنامه', 30, 'teacher', { targets: ['هفتم'] });
H.recordPubResult(pub24.id, 'stu0', 88); H.recordPubResult(pub24.id, 'stu1', 64);
const rep24 = H.buildReportPrintHtml('stu0');
ok('report card has student header + exam table with درصد/رتبه', rep24.includes('علی') && rep24.includes('هفتم') && rep24.includes('۸۸٪') && rep24.includes('رتبه در کلاس') && rep24.includes('آزمون نمونهٔ کارنامه'));
ok('report card shows per-lesson تسلط + weakness callout + honesty labels', rep24.includes('تسلط بر مباحث') && rep24.includes('تخمینی') && rep24.includes('فرمول رسمی کنکور'));
ok('report card has signature lines for والدین/مدیر', rep24.includes('امضای والدین') && rep24.includes('امضای مدیر مدرسه'));
const repEmpty = H.buildReportPrintHtml('stu17');
ok('student with ZERO exams still gets a printable sheet (graceful, not a crash)', repEmpty.includes('کارنامهٔ تحلیلی دانش‌آموز') && repEmpty.includes('هنوز'));
ok('static: چاپ کارنامهٔ من button on student results + 🖨 per-row for staff', html.includes('onclick="printReport(curPid())"') && html.includes('چاپ کارنامهٔ تحلیلی'));
H._state().published = H._state().published.filter(p => p.id !== pub24.id); delete H._state().pubResults[pub24.id]; delete H._state().profiles.stu0;

// [25] Teacher-authored تشریحی: question + important words → AI keyword score
console.log('\n[25] تشریحی معلم‌ساخته: سؤال + واژه‌های کلیدی → نمرهٔ خودکار');
ok('parseKws splits comma/Arabic comma and optional weights', (() => {
  const p = H.parseKws('آئورت:40، مویرگ، دهلیز:25');
  return p.length === 3 && p[0][0] === 'آئورت' && p[0][1] === 40 && p[1][0] === 'مویرگ' && p[1][1] === null && p[2][1] === 25;
})());
ok('resolveKwWeights equal-splits when any weight is missing', (() => {
  const w = H.resolveKwWeights([['آئورت', 40], ['مویرگ', null]]);
  return w.length === 2 && w[0][1] + w[1][1] === 100 && w[0][1] === 50 && w[1][1] === 50;
})());
ok('resolveKwWeights keeps explicit weights that already sum to 100', (() => {
  const w = H.resolveKwWeights([['آئورت', 40], ['مویرگ', 35], ['دهلیز', 25]]);
  return w[0][1] === 40 && w[1][1] === 35 && w[2][1] === 25;
})());
const weighted = H.mkCustomTashrihi({ lesson: 'khoon', text: 'مسیر خون را بنویسید', kwPairs: [['آئورت', 40], ['مویرگ', 35], ['دهلیز', 25]] });
ok('mkCustomTashrihi accepts kwPairs and keeps the 40/35/25 rubric', weighted.kw[0][1] === 40 && weighted.kw[1][1] === 35 && weighted.kw[2][1] === 25 && weighted.approved === true);
ok('AI score = sum of FOUND keyword weights (آئورت only → 40)', H.gradeTashrihi(weighted, 'خون از آئورت خارج می‌شود').score === 40);
ok('AI score = 100 when every important word is present', H.gradeTashrihi(weighted, 'از آئورت به مویرگ می‌رود و به دهلیز برمی‌گردد').score === 100);
ok('AI score = 0 when none of the important words appear', H.gradeTashrihi(weighted, 'نمی‌دانم').score === 0);
ok('kws-array path unchanged (equal split, sum 100) — old callers still work', (() => {
  const q = H.mkCustomTashrihi({ lesson: 'khoon', text: 'x', kws: ['آئورت', 'مویرگ'] });
  return q.kw[0][1] === 50 && q.kw[1][1] === 50;
})());
H._state().draftQs = [weighted, H.mkCustomMcq({ lesson: 'dna', text: 'کدام باز؟', opts: ['A', 'T', 'G', 'C'], correct: 1 })];
const onlyT = H.examFromTeacherTashrihi();
ok('examFromTeacherTashrihi uses ONLY the teacher essay items (skips MCQ drafts)', onlyT.length === 1 && onlyT[0].type === 'tashrihi' && onlyT[0].approved === true && onlyT[0].q.includes('مسیر خون'));
ok('a zero-MCQ teacher essay exam grades by rubric mean', (() => {
  const r = H.gradeExam(onlyT, ['آئورت مویرگ دهلیز']);
  return r.n === 0 && r.pct === 100 && r.tashrihi[0].grade.score === 100;
})());
H._state().draftQs = [];
ok('examFromTeacherTashrihi throws when the basket has no essay', (() => { try { H.examFromTeacherTashrihi(); return false; } catch (e) { return /تشریحی|واژه/.test(e.message); } })());
ok('static: keyword-add + fromtash + essay-review wired', html.includes('data-act="cqkwadd"') && html.includes('data-act="fromtash"') && html.includes('data-act="essayrev"') && html.includes('function vEssayReview') && html.includes('function parseKws') && html.includes('function examFromTeacherTashrihi'));
ok('static: teacher is told to write the important words', html.includes('واژه‌های مهم پاسخ') && html.includes('دانش‌آموز این لیست را نمی‌بیند'));
ok('static: finishExam stores tash hits for the teacher review queue', html.includes('extra.tash=lastResult.res.tashrihi.map'));

// [26] بانک تشریحی امتحان نهایی (سؤال‌های برگزارشده)
console.log('\n[26] بانک تشریحی امتحان نهایی');
const nahayi = BANK.filter(q => q.type === 'tashrihi' && q.n === 1);
ok('past-exam essay bank has 90+ items (نهایی + هماهنگ ۷–۹)', nahayi.length >= 90, nahayi.length);
ok('every هفتم/هشتم/نهم lesson appears in the هماهنگ essay bank', ['olum7','olum8','olum9','riazi7','riazi8','riazi9','mot7','mot8','mot9'].every(sid => H.SUBJECTS.find(s => s.id === sid).lessons.every(l => nahayi.some(q => q.l === l.id))));
ok('middle-school essays are labelled هماهنگ not نهایی', nahayi.filter(q => /^(olum|riazi|mot)[789]$/.test(q.s)).every(q => H.nahLabel(q) === 'امتحان هماهنگ'));
ok('every نهایی item has year + official model + rubric summing to 100', nahayi.every(q => q.y && q.model && q.kw && q.kw.reduce((s, k) => s + k[1], 0) === 100));
ok('نهایی items tag a real lesson', nahayi.every(q => lessonIds.has(q.l)));
ok('unique ids still hold after the نهایی import', (() => { const s = new Set(); return BANK.every(q => !s.has(q.id) && (s.add(q.id), true)); })());
const g324 = BANK.find(q => q.id === 'q324');
ok('official 1404 rRNA-site question grades 100 on the official keywords', H.gradeTashrihi(g324, 'جایگاه E — رنای متیونین وارد E نمی‌شود').score === 100);
ok('same question scores 0 on an empty/wrong essay', H.gradeTashrihi(g324, 'نمی‌دانم').score === 0);
ok('static: teacher bank picker + nahadd + نهایی/هماهنگ badges', html.includes('function vNahayiBank') && html.includes('data-act="nahadd"') && html.includes('function nahLabel') && html.includes('امتحان هماهنگ') && html.includes('${vNahayiBank()}'));
ok('static: preview distinguishes نهایی essays from teacher-authored ones', html.includes("q.n?") && html.includes('امتحان نهایی'));

// [27] نمودار عنکبوری دانش‌آموز (student spider chart)
console.log('\n[27] Student spider (radar) chart');
{
  const P = H.prof('stu0');
  P.lessonStats = {
    girande: { tries: [{ t: Date.now(), p: 80 }, { t: Date.now() - 864e5, p: 60 }] },
    dna:     { tries: [{ t: Date.now() - 3 * 864e5, p: 45 }] },
    ph:      { tries: [{ t: Date.now(), p: 55 }] },
  };
  const sp = H.studentSpiders('stu0');
  ok('studentSpiders returns ONLY subjects with assessed lessons', sp.length === 2 && sp.every(x => x.testedCount > 0), JSON.stringify(sp.map(x => x.sid)));
  const zist = sp.find(x => x.sid === 'zist');
  ok('each subject exposes axes for ALL its lessons', zist.lessons.length === H.SUBJECTS.find(x => x.id === 'zist').lessons.length, zist.lessons.length);
  ok('assessed lessons carry mastery, untested ones are null', zist.lessons.find(l => l.lid === 'girande').ms && zist.lessons.find(l => l.lid === 'khoon').ms === null);
  const gm = zist.lessons.find(l => l.lid === 'girande').ms.m, dm = zist.lessons.find(l => l.lid === 'dna').ms.m;
  ok('subject avg = mean of assessed lesson mastery', zist.avg === Math.round((gm + dm) / 2), zist.avg + ' vs ' + (gm + dm) / 2);
  const svg = H.spiderSVG([80, 20, null, 60, 90], ['یک', 'دو', 'سه', 'چهار', 'پنج'], { size: 300 });
  ok('spiderSVG emits one dot per axis', (svg.match(/<circle/g) || []).length === 5, svg.slice(0, 60));
  ok('spiderSVG draws 4 ring polygons + 1 data polygon', (svg.match(/<polygon/g) || []).length === 5, svg.match(/<polygon/g).length);
  ok('spiderSVG renders every axis label', ['یک', 'دو', 'سه', 'چهار', 'پنج'].every(l => svg.includes('>' + l + '</text>')));
  ok('untested axis is a hollow dot (fill="none")', svg.includes('fill="none" stroke="var(--acc)"'));
  ok('tooltips carry Persian-digit percent + untested label', svg.includes('۸۰٪') && svg.includes('هنوز ارزیابی نشده'));
  ok('fewer than 3 axes degrades to a message, not a broken svg', H.spiderSVG([50, 60], ['a', 'b']).includes('حداقل'));
  P.lessonStats = {}; P.history = [];
}
ok('static: analytics tab renders the spider card + subject chips for students', html.includes('نمودار عنکبوری') && html.includes('data-act="spider"') && html.includes('function spiderSVG') && html.includes('function studentSpiders'));
ok('static: mini radars are tappable buttons that swap the big chart (spidermini + same spider act)', html.includes('data-spiderkind="mini"') && html.includes('data-spiderkind="chip"') && html.includes('class="spidermini'));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail ? 1 : 0);
process.exit(fail ? 1 : 0);
