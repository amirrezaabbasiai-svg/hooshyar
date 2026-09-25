// Full browser-flow E2E (jsdom): simulates the real user journeys end-to-end.
// Run:  bash tests/run-e2e.sh   (installs jsdom to /tmp if missing)
// Or:   JSDOM_PATH=/path/to/jsdom node tests/e2e_browser.js
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || '../node_modules/jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'hooshyar-prototype.html'), 'utf8');
const vc = new VirtualConsole();
let jsErrors = [];
vc.on('jsdomError', e => jsErrors.push(e));
vc.on('error', m => jsErrors.push(new Error(m)));
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, virtualConsole: vc });
const win = dom.window, doc = win.document;
win.alert = () => {}; win.confirm = () => true;

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, x || ''); } };
const $ = sel => doc.querySelector(sel);
const $$ = sel => [...doc.querySelectorAll(sel)];
const click = (act, extra = '', sel = '') => {
  const b = $$(`[data-act="${act}"]${extra}`)[sel ? +sel : 0];
  if (!b) throw new Error('button not found: ' + act + extra);
  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  return b;
};
// rendered-text check that EXCLUDES <script> source (jsdom textContent includes script code!)
const vis = () => { const c = doc.body.cloneNode(true); c.querySelectorAll('script').forEach(s => s.remove()); return c.textContent; };
const has = txt => vis().includes(txt);
const tabTxt = () => $$('[data-act="tab"]').map(b => b.textContent).join('|');

async function main() {
  await new Promise(res => { if (doc.readyState === 'complete') res(); else win.addEventListener('load', res); });

  console.log('\n[E2E-1] Login page & role panels differ');
  ok('login page shows 3 role cards', $$('[data-act="lr"]').length === 3);
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');
  ok('teacher logged in: آزمون‌ساز tab', tabTxt().includes('آزمون‌ساز'));
  ok('teacher has داشبورد کلاس tab', $$('[data-act="tab"]').some(b => b.textContent.includes('داشبورد کلاس')));
  ok('teacher sees custom-question editor', has('سؤال دستی بسازید'));
  ok('teacher sees published-exams card', has('آزمون‌های منتشرشدهٔ من'));
  ok('teacher does NOT see student practice card', !has('تمرین آزاد (خودمختار)'));

  console.log('\n[E2E-2] Teacher adds custom MCQ question');
  $('#cqL').value = 'dna';
  $('#cqQ').value = 'کدام باز در DNA دو حلقه‌ای است؟';
  $('#cqO0').value = 'آدنین'; $('#cqO1').value = 'گوانین'; $('#cqO2').value = 'تیمین'; $('#cqO3').value = 'یوراسیل';
  $('#cqA1').checked = true;
  click('cqadd');
  ok('draft basket shows 1 question', has('سبد آزمون') && win.HOOSHYAR._state().draftQs.length === 1);
  const d = win.HOOSHYAR._state().draftQs[0];
  ok('draft has correct key + lesson', d.a === 1 && d.l === 'dna' && d.src === 'custom');

  console.log('\n[E2E-3] Teacher generates + approves + publishes exam');
  $('#cCount').value = '5';
  click('gen');
  ok('preview shows custom badge', has('دستی معلم'));
  ok('publish window select present (مهلت شرکت)', !!$('#pubWin'));
  if ($('[data-act="apall"]')) click('apall');
  const qsPreview = win.__preview;
  ok('custom question is inside the preview', qsPreview.some(q => q.id === d.id));
  click('pub');
  ok('exam published (draft basket cleared, 15min default window)', win.HOOSHYAR._state().published.length === 1 && win.HOOSHYAR._state().draftQs.length === 0 && win.HOOSHYAR._state().published[0].winMin === 15);
  ok('teacher pubs card lists the exam with results button', has('نتایج دانش‌آموزان'));

  console.log('\n[E2E-4] LOGOUT (the reported bug)');
  const logoutBtn = $('[data-act="logout"]');
  ok('logout button exists in header', !!logoutBtn);
  logoutBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('logout returns to login page', has('به TA خوش آمدید'));
  ok('teacher state preserved', win.HOOSHYAR._state().published.length === 1);

  console.log('\n[E2E-5] Student panel: deploy enables exam button');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu3"]');   // نگار
  ok('student tab is آزمون‌های من (not آزمون‌ساز)', !tabTxt().includes('آزمون‌ساز') && tabTxt().includes('آزمون‌های من'));
  ok('student has NO class dashboard tab', !$$('[data-act="tab"]').some(b => b.textContent.includes('داشبورد کلاس')));
  ok('new-exam badge on student tab', has('آزمون جدید'));
  ok('take button enabled after deployment', !!$('[data-act="take"]'));
  ok('student sees live join-window countdown chip', !!$('[data-dl]'));
  ok('STUDENT CANNOT CREATE: no gen button / settings / lesson chips', !$('[data-act="gen"]') && !$('#cCount') && !$$('[data-act="les"]').length);

  console.log('\n[E2E-6] Student takes the published exam');
  click('take');
  ok('exam room opened', has('آزمون جاری'));
  const total = JSON.parse(JSON.stringify(win.HOOSHYAR._state().published[0].qs)).length;
  for (let i = 0; i < total; i++) {
    const ansBtns = $$('[data-act="ans"]');
    if (ansBtns.length) ansBtns[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const next = $('[data-act="next"]');
    if (next) next.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
  click('fin');
  ok('result page shows Konkur percent', has('نتیجهٔ آزمون (فرمول رسمی کنکور)'));
  const pubRes = win.HOOSHYAR._state().pubResults[win.HOOSHYAR._state().published[0].id];
  ok('result recorded for stu3', pubRes && typeof pubRes.stu3.pct === 'number', JSON.stringify(pubRes));

  console.log('\n[E2E-7] BOTH see per-student results');
  click('new');
  ok('student: «نتایج من» card with rank', has('نتایج من در آزمون‌های معلم') && has('رتبهٔ من'));
  click('resx');
  ok('student: class results table shows نگار + others شرکت نکرده', has('نگار') && has('شرکت نکرده'));
  click('logout');
  ok('student logout works too', has('به TA خوش آمدید'));
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');
  click('resx');
  ok('teacher: results table shows نگار with percent', has('نگار'));
  ok('teacher: participation count ۱/۱۸ (live roster denominator)', has('۱/۱۸'));

  console.log('\n[E2E-8] Rule locks: one attempt + expired join window');
  click('logout');
  const alerts = []; const oldAlert = win.alert; win.alert = m => alerts.push(String(m));
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu3"]');   // already took the exam
  const eid = win.HOOSHYAR._state().published[0].id;
  ok('done exam shows «شرکت کردید ✓»', has('شرکت کردید ✓'));
  ok('no retake button for done exam', !$('[data-act="take"]'));
  const fake1 = doc.createElement('button'); fake1.setAttribute('data-act', 'take'); fake1.setAttribute('data-id', eid);
  doc.body.appendChild(fake1);
  fake1.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('forced retake blocked inside handler', alerts.some(m => m.includes('یک بار')), alerts.join('|'));
  ok('exam did NOT restart after blocked retake', !has('آزمون جاری'));
  fake1.remove();
  win.HOOSHYAR._state().published[0].deadline = Date.now() - 5;
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu5"]');   // آرش — never took it
  ok('fresh student sees expired chip ⏰', has('پایان مهلت شرکت'));
  ok('fresh student: take disabled «مهلت شرکت تمام شد»', has('مهلت شرکت تمام شد') && !$('[data-act="take"]'));
  const fake2 = doc.createElement('button'); fake2.setAttribute('data-act', 'take'); fake2.setAttribute('data-id', eid);
  doc.body.appendChild(fake2);
  fake2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('forced take after expiry blocked in handler', alerts.some(m => m.includes('مهلت')), alerts.join('|'));
  ok('exam did NOT start after expiry', !has('آزمون جاری'));
  fake2.remove(); win.alert = oldAlert;

  console.log('\n[E2E-9] Subject scoping: teacher only owns their subject');
  click('logout');
  click('lr', '[data-r="teacher"]');
  ok('teacher quick list shows all 12 subject teachers (incl. مطالعات)', $$('[data-act="quick"]').length === 12);
  click('quick', '[data-id="teacher"]');   // biology
  ok('biology teacher sees ONLY زیست chips', has('گیرنده‌های حسی (یازدهم)') && !has('معادلهٔ درجهٔ دو') && !has('گرامر کتاب درسی'), '');
  ok('biology badge «درس من: زیست‌شناسی» on pubs card', has('درس من: زیست‌شناسی'));
  ok('custom-q lesson select has NO english options', $('#cqL') && !$$('#cqL option').some(o => o.textContent.includes('زبان انگلیسی')));
  click('all');
  ok('«انتخاب همه» limited to biology lessons (26 ill. for 3 years)', (() => { const z = win.HOOSHYAR.SUBJECTS.find(s => s.id === 'zist'); const sel = win.HOOSHYAR._state().selLessons; return sel.length === z.lessons.length && sel.every(l => z.lessons.some(x => x.id === l)); })(), JSON.stringify(win.HOOSHYAR._state().selLessons));
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher2"]');   // chemistry
  ok('chemistry teacher sees ONLY شیمی chips', has('اسید، باز و pH (یازدهم)') && !has('گیرنده‌های حسی') && !has('معادلهٔ درجهٔ دو'));
  $('#cCount').value = '5';
  click('gen');
  ok('chem preview questions are all شیمی', win.__preview.every(q => q.s === 'shimi'));
  if ($('[data-act="apall"]')) click('apall');
  $('#pubWin').value = '30';
  click('pub');
  ok('chem exam published with 30min window', win.HOOSHYAR._state().published.some(p => p.subs && p.subs.includes('shimi') && p.winMin === 30));
  ok('chem teacher pubs card does NOT show biology exam', !has('زیست‌شناسی —'));
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');   // back to biology
  ok('biology teacher pubs card does NOT show شیمی exam', !has('شیمی —'));

  console.log('\n[E2E-10] Full 3-year curriculum');
  ok('bio chips include دهم topics', has('دنیای زنده (دهم)'));
  ok('bio chips include دوازدهم topics', has('مولکول‌های اطلاعاتی: DNA و RNA (دوازدهم)'));
  ok('bio chips include یازدهم topics', has('تنظیم عصبی (یازدهم)'));
  click('all'); $('#cCount').value = '20';
  click('gen');
  ok('generated full-bio exam has 20 MCQ + tashrihi', win.__preview.filter(q => q.type !== 'tashrihi').length === 20 && win.__preview.filter(q => q.type === 'tashrihi').length === 2, win.__preview.length);
  ok('full-bio exam mixes years (دهم + دوازدهم lessons present)', (() => { const ls = new Set(win.__preview.map(q => q.l)); return ls.size >= 3; })());
  click('cancel'); click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher8"]');   // زمین‌شناسی
  ok('زمین‌شناسی teacher sees only own chips', has('لایه‌ها و ساختمان زمین (یازدهم)') && !has('دنیای زنده'));
  click('all'); click('gen');
  ok('زمین‌شناسی exam is all zamin', win.__preview.every(q => q.s === 'zamin'));
  click('cancel'); click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher9"]');   // دین و زندگی
  click('all'); click('gen');
  ok('دین و زندگی exam is all dini', win.__preview.every(q => q.s === 'dini'));
  click('cancel');

  console.log('\n[E2E-11] Paper exam: print + manual score entry');
  click('logout');
  let printed = false; win.print = () => { printed = true; };
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');   // bio teacher again
  click('all'); $('#cCount').value = '5';
  click('gen');
  if ($('[data-act="apall"]')) click('apall');
  $('#pubWin').value = '15';
  click('pub');
  const ePaper = win.HOOSHYAR._state().published[win.HOOSHYAR._state().published.length - 1];
  ok('new exam published for paper flow', !!ePaper);
  ok('pubs card has print + manual buttons', !!$('[data-act="printpub"]') && !!$('[data-act="manadd"]'));
  // ---- print ----
  click('printpub');   // newest exam is rendered first
  ok('window.print called', printed);
  ok('printarea has student sheet + secret key', $('#printarea').textContent.includes('کلید معلم') && $('#printarea').textContent.includes('برگهٔ آزمون'));
  ok('printarea has bubble answer sheet', $('#printarea').textContent.includes('برگهٔ پاسخ‌برگ') && $('#printarea').textContent.includes('◯ الف'));
  // ---- manual entry: first publish (the one stu3 took ONLINE) must lock stu3 ----
  const eOnline = win.HOOSHYAR._state().published[0];
  const manForOnline = $$('[data-act="manadd"]').find(x => x.dataset.id === eOnline.id);
  ok('manual button exists for the older exam too', !!manForOnline);
  manForOnline.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('manual form opened', has('ورود دستی نمرات کاغذی'));
  ok('online taker stu3 LOCKED in manual form (one-attempt)', !$('#mu-stu3') && has('آنلاین شرکت کرده'));
  click('mancancel');
  // ---- manual entry on the fresh paper exam ----
  const alerts2 = []; win.alert = m => alerts2.push(String(m));
  const manForPaper = $$('[data-act="manadd"]').find(x => x.dataset.id === ePaper.id);
  manForPaper.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  $('#mu-stu7').value = '66.5';   // آرش — paper taker
  $('#mu-stu8').value = 'abc';    // type=number sanitizes to '' (browser-level validation)
  $('#mu-stu9').value = '-20';    // negative Konkur paper score
  click('mansave');
  ok('save alert reports 2 recorded paper scores', alerts2.some(m => m.includes('۲') && m.includes('ثبت شد')), alerts2.join('|'));
  const prPaper = win.HOOSHYAR._state().pubResults[ePaper.id];
  ok('manual records flagged 📝 with values', prPaper.stu7.manual === true && prPaper.stu7.pct === 66.5 && prPaper.stu9.pct === -20 && !prPaper.stu8);
  ok('student stu7 history gained manual exam', win.HOOSHYAR.prof('stu7').history.some(h => h.manual));
  // ---- teacher sees it in results table ----
  click('resx');
  ok('teacher: paper score appears in results', vis().includes('۶۶٫۵٪'));
  // ---- student sees their paper grade ----
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu7"]');
  ok('student: «نتایج من» shows 📝 کاغذی badge', has('📝 کاغذی'));
  const myRow = [...$$('table.tbl tr')].find(r => r.textContent.includes('کاغذی'));
  ok('student: paper percent + rank displayed', myRow && myRow.textContent.includes('۶۶٫۵٪'));

  console.log('\n[E2E-12] Admin roster management — new school year (add/remove students)');
  const alerts3 = []; win.alert = m => alerts3.push(String(m));
  click('logout');
  click('lr', '[data-r="admin"]');
  click('quick', '[data-id="admin"]');
  ok('admin home is school dashboard with roster card', has('مدیریت دانش‌آموزان'));
  ok('roster table starts with 18 students (2 per class × 9 classes)', $$('[data-act="delstu"]').length === 18);
  // validation: name is required
  click('addstu');
  ok('empty name rejected with Persian alert', alerts3.some(m => m.includes('نام دانش‌آموز')), alerts3.join('|'));
  // add a newcomer (ورودی جدید)
  $('#nsName').value = 'رضا تستی'; $('#nsCls').value = 'ب'; $('#nsAv').value = '👩‍🎓'; $('#nsPass').value = '';
  click('addstu');
  ok('new student row appears (19 total)', $$('[data-act="delstu"]').length === 19 && has('رضا تستی'));
  ok('newcomer marked ✨ ورودی جدید', has('ورودی جدید'));
  ok('alert shows generated username', alerts3.some(m => m.includes('stu18')), alerts3.join('|'));
  ok('state: account + stuExtra persisted', win.HOOSHYAR.ACCOUNTS.stu18 && win.HOOSHYAR._state().stuExtra.length === 1);
  ok('school stat counts the newcomer', has('۱۹') && has('دانش‌آموز کل مدرسه'));
  // newcomer can actually LOG IN with default password
  click('logout');
  click('lr', '[data-r="student"]');
  $('#lu').value = 'stu18'; $('#lp').value = '1234';
  click('dologin');
  ok('newcomer login works → student panel', has('آزمون‌های منتشرشده') && !has('ورود دانش‌آموز'));
  // back to admin: cancel a delete via the CUSTOM MODAL (browser confirm is
  // blocked in sandbox previews — that's why the old button looked dead),
  // then really delete
  click('logout');
  click('lr', '[data-r="admin"]');
  click('quick', '[data-id="admin"]');
  $$('[data-act="delstu"]').find(x => x.dataset.id === 'stu18').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('custom modal opens (sandbox-proof)', $('#cfm').style.display === 'flex' && has('برای همیشه حذف شود'));
  click('cfm-no');
  ok('delete cancelled via modal (19 stay)', $$('[data-act="delstu"]').length === 19 && $('#cfm').style.display === 'none');
  $$('[data-act="delstu"]').find(x => x.dataset.id === 'stu18').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click('cfm-yes');
  ok('delete confirmed via modal → row gone, back to 18', $$('[data-act="delstu"]').length === 18 && !has('رضا تستی'));
  ok('state: account + profile wiped', !win.HOOSHYAR.ACCOUNTS.stu18 && !win.HOOSHYAR._state().profiles.stu18);
  // deleted student can no longer log in
  click('logout');
  click('lr', '[data-r="student"]');
  $('#lu').value = 'stu18'; $('#lp').value = '1234';
  click('dologin');
  ok('deleted student login rejected', has('نام کاربری یا رمز اشتباه است'));
  ok('quick-pick list no longer shows newcomer', !$$('[data-act="quick"]').some(b => (b.dataset.id || '') === 'stu18'));

  console.log('\n[E2E-13] Boss launches آزمون جامع + memory backup');
  const alerts4 = []; win.alert = m => alerts4.push(String(m));
  click('lr', '[data-r="admin"]');
  click('quick', '[data-id="admin"]');
  ok('boss: جامع launch card visible', has('آزمون جامع کنکوری') && !!$('#jmTitle') && !!$('[data-act="jame"]'));
  ok('boss: memory card visible', has('حافظهٔ سامانه') && !!$('[data-act="backup"]'));
  click('jame');
  const pubsNow = win.HOOSHYAR._state().published;
  const eJame = pubsNow[pubsNow.length - 1];
  ok('جامع published with kind/quota metadata', eJame.kind === 'jame' && eJame.quota.zist === 8);
  ok('جامع has 28 questions (8+8+6+6 defaults)', eJame.qs.length === 28, eJame.qs.length);
  ok('launch alert confirms publish', alerts4.some(m => m.includes('منتشر شد') && m.includes('تراز')), alerts4.join('|'));
  ok('boss: empty results card waiting for takers', has('نتایج آزمون جامع') && has('شرکت نکرده'));
  // student takes the جامع exam
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu0"]');
  ok('student sees 🎯 جامع badge in exam list', has('🎯 جامع'));
  $$('[data-act="take"]').find(x => x.dataset.id === eJame.id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('exam room opened (booklet)', has('آزمون جاری'));
  for (let i = 0; i < eJame.qs.length; i++) {
    const ansBtns = $$('[data-act="ans"]');
    if (ansBtns.length) ansBtns[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const nxt = $('[data-act="next"]');
    if (nxt) nxt.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
  click('fin');
  click('new');
  const rJame = win.HOOSHYAR._state().pubResults[eJame.id].stu0;
  ok('result stored WITH per-subject breakdown + تراز', rJame && rJame.subs && typeof rJame.traz === 'number', JSON.stringify(rJame && rJame.traz));
  ok('breakdown covers the 4 science subjects', ['zist', 'shimi', 'fizik', 'riazi'].every(s => rJame.subs[s] && typeof rJame.subs[s].pct === 'number'));
  ok('student: «نتایج من» shows کارنامهٔ جامع + تراز', has('کارنامهٔ جامع') && has('تراز تخمینی'));
  ok('one-attempt lock applies to جامع too', has('شرکت کردید ✓'));
  // boss sees the school-wide results table
  click('logout');
  click('lr', '[data-r="admin"]');
  click('quick', '[data-id="admin"]');
  ok('boss: results table now has تراز تخمینی column', has('نتایج آزمون جامع') && has('تراز تخمینی'));
  ok('boss: علی appears with rank in جامع results', (() => { const row = [...$$('table.tbl tr')].find(r => r.textContent.includes('علی') && r.textContent.includes('٪')); return !!row; })());
  // memory: backup click + import/export round-trip in the browser
  click('backup');
  ok('backup click answered (download or guidance)', alerts4.some(m => m.includes('پشتیبان')), alerts4.join('|'));
  const snap2 = win.HOOSHYAR.exportState();
  win.HOOSHYAR.addStudent({ name: 'موقت بکاپ', cls: 'الف' });
  ok('roster grew before restore', win.HOOSHYAR.studentIds().length === 19);
  const imp2 = win.HOOSHYAR.importState(snap2);
  ok('restore returns ok + roster back to snapshot', imp2.ok === 1 && win.HOOSHYAR.studentIds().length === 18);
  ok('restore kept the جامع results (backup was after exam)', !!win.HOOSHYAR._state().pubResults[eJame.id].stu0);

  console.log('\n[E2E-14] Brand TA, nine classes, modal on blank finish');
  click('logout');
  ok('page title branded TA', doc.title.includes('TA'));
  ok('header shows TA brand', $$('h1').some(h => h.textContent.includes('TA')));
  click('lr', '[data-r="admin"]');
  click('quick', '[data-id="admin"]');
  ok('roster add form lists the nine real classes (هفتم → دوازدهم)', $$('#nsCls option').length === 9 && $$('#nsCls option')[0].textContent.includes('هفتم') && $$('#nsCls option')[8].textContent.includes('دوازدهم ریاضی'));
  ok('class comparison renders nine class bars', has('کلاس هفتم') && has('کلاس دوازدهم ریاضی'));
  click('logout');
  click('lr', '[data-r="student"]');
  ok('login quick-pick shows real class names incl. دورهٔ اول', has('دهم تجربی') && has('دوازدهم ریاضی') && has('هفتم') && has('نهم'));
  // blank finish → modal instead of blocked confirm (ePaper from E2E-11, stu2 hasn't taken it)
  click('quick', '[data-id="stu2"]');
  $$('[data-act="take"]').find(x => x.dataset.id === ePaper.id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('exam room opened', has('آزمون جاری'));
  click('fin');
  ok('blank-exam modal appears (not a dead dialog)', has('بی‌پاسخ مانده'));
  click('cfm-no');
  ok('انصراف keeps student inside the exam', has('آزمون جاری'));
  click('fin');
  click('cfm-yes');
  ok('تأیید grades the exam normally', has('نتیجهٔ آزمون'));

  console.log('\n[E2E-15] 🎯 Target class + 📥 bulk import');
  const alerts5 = []; win.alert = m => alerts5.push(String(m));
  // teacher publishes a targeted exam (pc0 = first class = هفتم)
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');
  click('all'); $('#cCount').value = '5';
  click('gen');
  if ($('[data-act="apall"]')) click('apall');
  $('#pc0').checked = true;   // هفتم
  click('pub');
  const pubsT = win.HOOSHYAR._state().published;
  const eT = pubsT[pubsT.length - 1];
  ok('published WITH targets=[هفتم]', JSON.stringify(eT.targets) === JSON.stringify(['هفتم']));
  ok('launch alert names the target class', alerts5.some(m => m.includes('مخاطب: هفتم')), alerts5.join('|'));
  ok('teacher pubs card shows 📌 badge', has('📌 هفتم'));
  // target student sees it; other-class student does not
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu0"]');   // هفتم
  ok('هفتم student CAN take it', !!doc.querySelector('[data-act="take"][data-id="' + eT.id + '"]'));
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu4"]');   // نهم
  ok('نهم student does NOT see it at all', !doc.querySelector('[data-id="' + eT.id + '"]'));
  // boss جامع targeted at دهم ریاضی
  click('logout');
  click('lr', '[data-r="admin"]');
  click('quick', '[data-id="admin"]');
  $('#jmCls').value = 'دهم ریاضی';
  click('jame');
  const pubsJ = win.HOOSHYAR._state().published;
  const eJ2 = pubsJ[pubsJ.length - 1];
  ok('جامع published targeted at دهم ریاضی', eJ2.kind === 'jame' && eJ2.targets && eJ2.targets[0] === 'دهم ریاضی');
  ok('boss results card scoped with 📌 badge', has('📌 دهم ریاضی'));
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu12"]');   // دهم ریاضی (با نقشهٔ ۹ کلاسه)
  ok('دهم ریاضی student CAN take the targeted جامع', !!doc.querySelector('[data-act="take"][data-id="' + eJ2.id + '"]'));
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu0"]');   // هفتم
  ok('هفتم student cannot see the دهم ریاضی جامع', !doc.querySelector('[data-id="' + eJ2.id + '"]'));
  // teacher bulk paste-import
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');
  const draftsBefore = win.HOOSHYAR._state().draftQs.length;
  $('#bqL').value = 'dna';
  $('#bqTxt').value = 'در DNA قاعدهٔ چارگاف چیست؟ * A=T و G≡C * A=C و G=T * A=G و C=T * هیچکدام * 1\nدر کدام ساختار نوکلئیک‌اسید وجود ندارد؟ * ریبوزوم * میتوکندری * راکیزه * پروتئین * 4\nخطِ خراب*الف*ب';
  click('bqadd');
  ok('bulk import added 2 valid questions', win.HOOSHYAR._state().draftQs.length === draftsBefore + 2, JSON.stringify(win.HOOSHYAR._state().draftQs.length));
  ok('broken line reported in Persian', alerts5.some(m => m.includes('خط ۳') || m.includes('نادیده')), alerts5.join('|'));
  ok('draft basket updated in UI', has('سبد آزمون'));

  console.log('\n[E2E-16] دورهٔ اول متوسطه (هفتم/هشتم/نهم) end-to-end');
  // معلم علوم دورهٔ اول logs in — builder shows ONLY علوم ۷/۸/۹ (not زیست‌شناسی, not ریاضی هفتم)
  click('logout');
  click('lr', '[data-r="teacher"]');
  ok('teacher10 in the teacher quick-pick', !!doc.querySelector('[data-id="teacher10"]'));
  click('quick', '[data-id="teacher10"]');
  // chips must be measured INSIDE the lesson card (#printarea holds a stale zist exam title!)
  const chipCard16 = [...$$('.card')].find(c => c.textContent.includes('۱) مباحث آزمون'));
  const chipTxt16 = chipCard16 ? chipCard16.textContent : '';
  ok('معلم علوم دورهٔ اول sees ONLY علوم ۷/۸/۹ chips', chipTxt16.includes('علوم تجربی (هفتم)') && chipTxt16.includes('علوم تجربی (هشتم)') && chipTxt16.includes('علوم تجربی (نهم)') && !chipTxt16.includes('زیست') && !chipTxt16.includes('ریاضی (هفتم)'), chipTxt16.slice(0, 80));
  click('all'); $('#cCount').value = '5';
  click('gen');
  const midPrev = win.__preview || [];
  ok('middle-school exam assembled (valid select value → full exam)', midPrev.length >= 5 && midPrev.every(q => (q.l || '').match(/7$|8$|9$/)), JSON.stringify(midPrev.map(q => q.l)));
  if ($('[data-act="apall"]')) click('apall');
  click('pub');
  const pubsMid = win.HOOSHYAR._state().published;
  const eMid = pubsMid[pubsMid.length - 1];
  ok('علوم دورهٔ اول exam published', eMid && eMid.subs && eMid.subs.some(s => s.startsWith('olum')));
  // student side is grade-scoped too: seeded نهم profile covers ONLY نهم lessons
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu4"]');   // نهم — took nothing so far (pristine seed)
  const keys4 = Object.keys((win.HOOSHYAR.prof('stu4') || {}).lessonStats || {});
  ok('نهم seed covers ONLY نهم lessons (olum9/riazi9)', keys4.length > 0 && keys4.every(k => k.endsWith('9')), JSON.stringify(keys4.slice(0, 6)));
  click('tab', '[data-v="plan"]');
  $('#printarea').innerHTML = '';   // vis() includes hidden #printarea — a leftover printed exam must not poison this check
  ok('نهم plan page shows NO دوازدهم/هفتم topics', !has('تنظیم عصبی (یازدهم)') && !has('اتم‌ها؛ الفبای مواد (هفتم)') && !has('مولکول‌های اطلاعاتی'));
  click('tab', '[data-v="builder"]');
  // …and can take + finish the published exam like any other class
  $$('[data-act="take"]').find(x => x.dataset.id === eMid.id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('نهم student opened the علوم exam room', has('آزمون جاری'));
  for (let qi = 0; qi < 10; qi++) {
    const opts = $$('.qopt');
    if (opts.length) opts[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    else { const ta = $('#tarea'); if (ta) ta.value = 'پاسخ تشریحی آزمایشی برای بررسی تصحیح'; }
    const nx = $('[data-act="next"]'); if (nx) nx.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
  click('fin');
  if ($('#cfm') && $('#cfm').style.display === 'flex') click('cfm-yes');
  ok('نهم student got auto-graded results', has('نتیجهٔ آزمون'));

  console.log('\n[E2E-17] چاپ برنامهٔ هفته (bugfix) + آزمون کاملاً تشریحی');
  // ---- part 1: student prints the weekly plan (used to print a BLANK/stale sheet)
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu0"]');   // هفتم
  click('tab', '[data-v="plan"]');
  let printed17 = false; win.print = () => { printed17 = true; };
  $('#printarea').innerHTML = '';       // wipe the stale exam sheet → proof printPlan() refills it
  const pbtn = [...$$('button')].find(b => b.textContent.includes('چاپ برنامه'));
  ok('«چاپ برنامه» button is on the plan page', !!pbtn);
  pbtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('window.print fired', printed17);
  const pt17 = $('#printarea').textContent;
  ok('printarea now holds the WEEKLY PLAN (not a stale exam)', pt17.includes('برنامهٔ هفته') && pt17.includes('📅 شنبه'), pt17.slice(0, 50));
  ok('plan sheet has student name + priority stars + signature lines', pt17.includes('علی') && pt17.includes('★') && pt17.includes('امضای والدین'));
  ok('no exam-sheet leftovers in the plan printout', !pt17.includes('کلید معلم'));
  // ---- part 2: teacher builds a FULLY tashrihi exam (zero تستی — سبک نهایی)
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher10"]');   // علوم دورهٔ اول — now has هماهنگ essay bank
  click('all'); $('#cCount').value = '5';
  $('#cKind').value = 'tashrihi';
  click('gen');
  const tPrev = win.__preview || [];
  ok('cKind=تشریحی yields a ZERO-MCQ exam (5/5 تشریحی)', tPrev.length === 5 && tPrev.every(q => q.type === 'tashrihi' && !q.o), JSON.stringify(tPrev.map(q => q.type)));
  ok('علوم exam prefers the هماهنگ bank (at least one approved n:1)', tPrev.some(q => q.n === 1 && q.approved === true && q.src === 'bank'));
  if (tPrev.some(q => !q.approved) && $('[data-act="apall"]')) click('apall');
  ok('publish is enabled after bank items / approval', $('[data-act="pub"]').disabled === false);
  click('pub');
  const pubs17 = win.HOOSHYAR._state().published, eTash = pubs17[pubs17.length - 1];
  ok('essay-only exam published with تشریحی in the title', eTash && eTash.title.includes('تشریحی'), eTash && eTash.title);
  // student side: stu0 (هفتم) takes it — default target = all classes
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu0"]');
  click('tab', '[data-v="builder"]');
  const takeBtn17 = $$('[data-act="take"]').find(x => x.dataset.id === eTash.id);
  ok('هفتم student sees the تشریحی exam', !!takeBtn17);
  takeBtn17.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('exam room opened', has('آزمون جاری'));
  ok('ZERO test options — it is 100% تشریحی', $$('.qopt').length === 0);
  ok('room explains the essay-only mode', has('کاملاً تشریحی'));
  const sheet17 = win.HOOSHYAR.shuffleForStudent(eTash.qs.map(q => ({ ...q })), eTash.id, 'stu0', eTash.kind);
  for (let qi = 0; qi < 5; qi++) {
    const ta = $('#tarea');
    const kws = ((sheet17[qi] && sheet17[qi].kw) || []).map(k => k[0]).join(' ');
    if (ta) ta.value = kws + ' — توضیح کامل به‌همراه مثال از کتاب درسی.';
    const nx = $('[data-act="next"]'); if (nx) nx.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
  click('fin');
  if ($('#cfm') && $('#cfm').style.display === 'flex') click('cfm-yes');
  ok('essay exam auto-graded by rubric', has('نتیجهٔ آزمون'));
  const myRes17 = (win.HOOSHYAR._state().pubResults[eTash.id] || {})['stu0'];
  ok('headline percent = rubric mean (not the old 0)', myRes17 && myRes17.pct > 0, JSON.stringify(myRes17 && myRes17.pct));
  ok('full-coverage answers score ۱۰۰٪', myRes17 && myRes17.pct === 100);
  // teacher sees the result land on the leaderboard
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher10"]');
  ok('teacher pubs show the تشریحی exam title + ۱/۱۸ participation', has('آزمون تشریحی') && has('۱/۱۸ شرکت کردند'), (() => { const v = vis(); const i = v.indexOf('آزمون تشریحی'); return i < 0 ? 'NOT FOUND' : v.slice(i, i + 140); })());
  $$('[data-act="resx"]').find(x => x.dataset.id === eTash.id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('teacher leaderboard (expanded) shows stu0 علی → ۱۰۰٪ 🥇', has('۱۰۰٪') && has('🥇'), (vis().match(/علی[^<]{0,60}/) || ['—'])[0]);

  console.log('\n[E2E-18] 🔀 ضد تقلب (per-student shuffle) + 🖨 کارنامهٔ چاپی');
  // ---- part 1: each student gets their own deterministic sheet of the SAME exam (eMid from E2E-16)
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu2"]');   // هشتم — has NOT taken eMid yet
  const expFirst2 = win.HOOSHYAR.fa(win.HOOSHYAR.shuffleForStudent(eMid.qs.map(q => ({ ...q })), eMid.id, 'stu2', eMid.kind)[0].q);
  $$('[data-act="take"]').find(x => x.dataset.id === eMid.id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('stu2 opens their PERSONALISED sheet (deterministic question #1)', $('#qbox').textContent.includes(expFirst2.slice(0, 25)), expFirst2.slice(0, 40));
  for (let qi = 0; qi < 8; qi++) {
    const opts = $$('.qopt'); if (opts.length) opts[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    else { const ta = $('#tarea'); if (ta) ta.value = 'توضیح و مثال کامل از کتاب درسی'; }
    const nx = $('[data-act="next"]'); if (nx) nx.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
  click('fin'); if ($('#cfm') && $('#cfm').style.display === 'flex') click('cfm-yes');
  ok('shuffled exam still auto-grades normally', has('نتیجهٔ آزمون'));
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu3"]');
  const expFirst3 = win.HOOSHYAR.fa(win.HOOSHYAR.shuffleForStudent(eMid.qs.map(q => ({ ...q })), eMid.id, 'stu3', eMid.kind)[0].q);
  $$('[data-act="take"]').find(x => x.dataset.id === eMid.id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('stu3 also gets a personalised sheet', $('#qbox').textContent.includes(expFirst3.slice(0, 25)), expFirst3.slice(0, 40));
  // follow stu3's sheet one click deeper: question #2 must ALSO match their deterministic order
  const expQ3_2 = win.HOOSHYAR.fa(win.HOOSHYAR.shuffleForStudent(eMid.qs.map(q => ({ ...q })), eMid.id, 'stu3', eMid.kind)[1].q);
  $('[data-act="next"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('question #2 follows stu3\'s own deterministic order', $('#qbox').textContent.includes(expQ3_2.slice(0, 25)), expQ3_2.slice(0, 40));
  // full-sheet diversity across two classmates on the same seed exam (~1/720 × 1/24ⁿ coincidence)
  const sheet3full = JSON.stringify(win.HOOSHYAR.shuffleForStudent(eMid.qs, eMid.id, 'stu3', eMid.kind).map(q => [q.id, q.a]));
  const sheet2full = JSON.stringify(win.HOOSHYAR.shuffleForStudent(eMid.qs, eMid.id, 'stu2', eMid.kind).map(q => [q.id, q.a]));
  ok('neighbours can NOT copy: full sheets differ (order and/or options)', sheet2full !== sheet3full);
  $('[data-act="prev"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click('fin'); if ($('#cfm') && $('#cfm').style.display === 'flex') click('cfm-yes');
  // ---- part 2: printable کارنامه — student self-print + staff per-row print
  click('tab', '[data-v="builder"]');
  const rbtn = [...$$('button')].find(b => b.textContent.includes('چاپ کارنامهٔ من'));
  ok('«🖨 چاپ کارنامهٔ من» button exists on the student panel', !!rbtn);
  $('#printarea').innerHTML = '';
  rbtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const rp18 = $('#printarea').textContent;
  ok('student report rendered into #printarea (کارنامه + نام + نتایج)', rp18.includes('کارنامهٔ تحلیلی') && rp18.includes('نگار') && rp18.includes('رتبه در کلاس'), rp18.slice(0, 50));
  ok('report has mastery table + signature lines', rp18.includes('تسلط بر مباحث') && rp18.includes('امضای والدین'));
  ok('honesty labels present (تخمینی / فرمول رسمی کنکور)', rp18.includes('تخمینی') && rp18.includes('فرمول رسمی کنکور'));
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher10"]');   // owns eMid
  $$('[data-act="resx"]').find(x => x.dataset.id === eMid.id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const prtBtns = $$('button').filter(b => (b.title || '').includes('چاپ کارنامهٔ تحلیلی'));
  ok('teacher leaderboard offers 🖨 per-student print (staff only)', prtBtns.length >= 1);
  $('#printarea').innerHTML = '';
  // the row's button tooltip carries the student name — the printed sheet must show THAT student
  const wantName = prtBtns[0].title.match(/تحلیلی (\S+)/)[1];
  prtBtns[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const rpT = $('#printarea').textContent;
  ok('teacher prints THAT student کارنامه (name follows the leaderboard row)', rpT.includes('کارنامهٔ تحلیلی') && rpT.includes(wantName), wantName + ' → ' + rpT.slice(0, 50));
  // students must NOT get the staff print button — check on a student view of the same leaderboard
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu3"]');
  // expand the SAME leaderboard as a student: the table shows, staff 🖨 buttons must not
  const stuResx = $$('[data-act="resx"]').find(x => x.dataset.id === eMid.id);
  if (stuResx) stuResx.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('student can open the class leaderboard table', has('رتبه'));
  ok('but the leaderboard shows ZERO 🖨 staff print buttons for a student', $$('button').filter(b => (b.title || '').includes('چاپ کارنامهٔ تحلیلی')).length === 0);

  console.log('[E2E-19] Teacher writes tashrihi question + important words -> AI scores the student');
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');   // zist
  $('#cqType').value = 'tashrihi';
  $('#cqType').dispatchEvent(new win.Event('change'));
  ok('tashrihi keyword form is visible after switching type', $('#cqTash') && $('#cqTash').style.display !== 'none');
  $('#cqL').value = 'khoon';
  $('#cqQ').value = 'مسیر خون از بطن چپ تا بازگشت به قلب را بنویسید.';
  $('#cqK').value = 'آئورت:40، مویرگ:35، دهلیز:25';
  $('#cqM').value = 'بطن چپ ← آئورت ← مویرگ ← دهلیز راست';
  const draftsBefore19 = win.HOOSHYAR._state().draftQs.length;
  click('cqadd');
  ok('teacher essay landed in the draft basket', win.HOOSHYAR._state().draftQs.length === draftsBefore19 + 1);
  const d19 = win.HOOSHYAR._state().draftQs[win.HOOSHYAR._state().draftQs.length - 1];
  ok('draft is tashrihi with the teacher 40/35/25 keyword weights', d19.type === 'tashrihi' && d19.kw[0][0] === 'آئورت' && d19.kw[0][1] === 40 && d19.kw[2][1] === 25);
  ok('build-from-my-essays button is on the page', !!$('[data-act="fromtash"]'));
  click('fromtash');
  const prev19 = win.__preview || [];
  ok('fromtash preview is 100% teacher essays (no MCQ, already approved)', prev19.length >= 1 && prev19.every(q => q.type === 'tashrihi' && q.approved === true && !q.o));
  ok('preview includes the teacher exact question', prev19.some(q => q.q.includes('مسیر خون')));
  click('pub');
  const pubs19 = win.HOOSHYAR._state().published;
  const e19 = pubs19[pubs19.length - 1];
  ok('teacher-authored tashrihi exam published', e19 && e19.qs.every(q => q.type === 'tashrihi') && e19.qs.some(q => q.q.includes('مسیر خون')));
  // student writes an answer that has ONLY آئورت -> must score 40, not 0 and not 100
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu1"]');   // Sara - 7th
  const take19 = $$('[data-act="take"]').find(x => x.dataset.id === e19.id);
  ok('student sees the tashrihi exam', !!take19);
  take19.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('exam room is essay-only (no option buttons)', has('آزمون جاری') && $$('.qopt').length === 0);
  ok('keywords are HIDDEN from the student during the exam', !has('آئورت:40') && !vis().includes('مویرگ:35'));
  const ta19 = $('#tarea');
  ok('answer box is there', !!ta19);
  ta19.value = 'خون از بطن چپ وارد آئورت می‌شود و به بدن می‌رود.';
  click('fin');
  if ($('#cfm') && $('#cfm').style.display === 'flex') click('cfm-yes');
  ok('partial keyword coverage auto-scored 40 (only aorta)', (() => {
    const r = (win.HOOSHYAR._state().pubResults[e19.id] || {}).stu1;
    return r && r.pct === 40 && r.tash && r.tash[0].score === 40 && r.tash[0].hits.filter(h => h.ok).map(h => h.kw).join() === 'آئورت';
  })(), JSON.stringify((win.HOOSHYAR._state().pubResults[e19.id] || {}).stu1));
  ok('stored review payload has the student exact text', ((win.HOOSHYAR._state().pubResults[e19.id] || {}).stu1 || {}).tash[0].text.includes('آئورت'));
  // teacher opens the review queue and sees found/missing keywords
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');
  const revBtn = $$('[data-act="essayrev"]').find(x => x.dataset.id === e19.id);
  ok('teacher pubs card has essay-review button', !!revBtn);
  revBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('review shows student text + found keyword + missing keywords', has('سارا') && has('وارد آئورت می‌شود') && has('آئورت') && has('مویرگ') && has('دهلیز'));
  ok('review offers a teacher override box', !!$('#tr-stu1-0'));
  $('#tr-stu1-0').value = '70';
  click('tashsave');
  ok('teacher override updates the stored percent to 70', ((win.HOOSHYAR._state().pubResults[e19.id] || {}).stu1 || {}).pct === 70);

  console.log('[E2E-20] Bank of past final-exam (nahayi) essay questions');
  click('logout');
  click('lr', '[data-r="teacher"]');
  click('quick', '[data-id="teacher"]');
  ok('biology teacher sees the nahayi essay bank card', has('بانک سؤال تشریحی') && has('امتحان نهایی'));
  const nahBtn = $$('[data-act="nahadd"]').find(b => {
    const q = win.HOOSHYAR.BANK.find(x => x.id === b.dataset.id);
    return q && q.n === 1;
  });
  ok('at least one Add button from the final-exam bank', !!nahBtn);
  const nahId = nahBtn && nahBtn.dataset.id;
  const beforeNah = win.HOOSHYAR._state().draftQs.length;
  nahBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('nahayi question landed in the draft basket', win.HOOSHYAR._state().draftQs.length === beforeNah + 1);
  ok('draft keeps n:1 (final-exam) metadata', win.HOOSHYAR._state().draftQs.some(q => q.id === nahId && q.n === 1 && q.approved === true));
  click('fromtash');
  const prev20 = win.__preview || [];
  ok('preview is essay-only and includes the bank item', prev20.length >= 1 && prev20.every(q => q.type === 'tashrihi') && prev20.some(q => q.id === nahId));
  ok('preview badge says امتحان نهایی', has('امتحان نهایی'));

  console.log('[E2E-21] Student spider (radar) chart in تحلیل عملکرد');
  click('logout');
  click('lr', '[data-r="student"]');
  click('quick', '[data-id="stu6"]');
  /* earlier class-simulation sections seeded stu6 — start from a clean slate */
  const P6 = win.HOOSHYAR.prof('stu6');
  P6.history = []; P6.lessonStats = {};
  click('tab', '[data-v="analytics"]');
  ok('fresh student sees demo-data offer on analytics tab', has('بارگذاری دادهٔ نمایشی'));
  click('demo');
  ok('analytics now shows the spider chart card', has('نمودار عنکبوری'));
  const spiderSvgs = $$('svg.spider');
  ok('1 big spider + 7 mini spiders (7 subjects in demo persona)', spiderSvgs.length === 8, spiderSvgs.length);
  ok('one selector chip per subject with data', $$('[data-act="spider"][data-spiderkind="chip"]').length === 7, $$('[data-act="spider"][data-spiderkind="chip"]').length);
  ok('untested lessons drawn as hollow dots', $$('svg.spider circle[fill="none"]').length > 0);
  ok('big spider defaults to first subject with data (زیست‌شناسی)', $$('h2').some(h => h.textContent.includes('زیست‌شناسی')));
  const chipSel = '[data-act="spider"][data-spiderkind="chip"]';
  const shimiChip = $$(chipSel).find(c => c.dataset.id === 'shimi');
  shimiChip.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('chip click switches the big spider subject (شیمی)', $$('h2').some(h => h.textContent.includes('شیمی')) && !$$('h2').some(h => h.textContent.includes('زیست‌شناسی')));
  const zistChip = $$(chipSel).find(c => c.dataset.id === 'zist');
  zistChip.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('switching back works (زیست‌شناسی again)', $$('h2').some(h => h.textContent.includes('زیست‌شناسی')));

  /* mini radars are tappable buttons: tapping one swaps it into the big chart */
  const minis = $$('.spidermini');
  ok('one tappable mini button per subject (with data)', minis.length === 7, minis.length);
  ok('selected mini is highlighted initially', minis.find(m => m.dataset.id === 'zist').classList.contains('on'));
  const shimiMini = minis.find(m => m.dataset.id === 'shimi');
  // tap INSIDE the mini svg (like a real finger on the chart)
  shimiMini.querySelector('svg.spider').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('tapping a mini swaps it into the big chart (شیمی)', $$('h2').some(h => h.textContent.includes('شیمی')) && !$$('h2').some(h => h.textContent.includes('زیست‌شناسی')));
  ok('tapped mini gets the on-state, previous one loses it', $$('.spidermini').find(m => m.dataset.id === 'shimi').classList.contains('on') && !$$('.spidermini').find(m => m.dataset.id === 'zist').classList.contains('on'));
  const arabiMini = $$('.spidermini').find(m => m.dataset.id === 'arabi');
  arabiMini.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('tapping another mini keeps swapping (عربی)', $$('h2').some(h => h.textContent.includes('عربی')));
  ok('old linear bars preserved in a collapsed list view', has('نمای فهرستی') && has('مبحث ارزیابی‌شده'));
  ok('trend line + weak topics cards still render for students', has('روند درصد آزمون‌ها'));
  ok('teacher viewing a student sees the same spider (shared analytics view)', (() => {
    click('logout');
    click('lr', '[data-r="teacher"]');
    click('quick', '[data-id="teacher"]');
    click('tab', '[data-v="analytics"]');
    click('views', '[data-id="stu6"]');
    return has('نمودار عنکبوری') && $$('svg.spider').length === 8;
  })());

  ok('no uncaught js errors during the whole flow', jsErrors.length === 0, jsErrors.map(e => e.message).join('\n'));
  console.log(`\n================  E2E: ${pass} passed, ${fail} failed  ================`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('E2E crashed:', e); process.exit(1); });
