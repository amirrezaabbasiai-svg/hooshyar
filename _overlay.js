/* ════════════════════════════════════════════════════════════════════════════════
 TA — redesigned frontend overlay (v2 UI)
 --------------------------------------------------------------------------------
 This block runs AFTER the engine and SHADOWS its view layer with a new UI/UX.
 The engine (data, exam logic, graders, planner, simClass, event dispatch via
 onClick/onKey, exports) is untouched and still unit-tested. Here we override:

 · TABS / render() / renderRolebox() → sidebar shell + page-head pattern
 · every v*() view → new componentized markup

 Every interaction keeps the SAME data-act values and ids the engine's
 onClick() dispatches on, so the redesign changes look & structure without
 touching tested behaviour. Theme engine + confirm modal are re-wired to the
 new shell.
 ════════════════════════════════════════════════════════════════════════════════ */

/* ---------- Helpers for the new shell ---------- */
function _page(title, sub, body, actions){
 return `<div class="page-head">
 <div><h1>${title}</h1>${sub?`<div class="sub">${sub}</div>`:''}</div>
 ${actions?`<div class="page-actions">${actions}</div>`:''}
 </div><div class="stack">${body}</div>`;
}
function _metric(hue,label,value,sub){
 return `<div class="metric tone-${hue}">
 <div class="m-label">${label}</div>
 <div class="m-value">${value}</div>
 ${sub?`<div class="m-sub">${sub}</div>`:''}
 </div>`;
}
function _empty(title,sub){
 return `<div class="card"><div class="empty">
 <div class="et">${title}</div>${sub?`<div class="es">${sub}</div>`:''}</div></div>`;
}

/* ---------- Nav (sidebar) ---------- */
const _NAV_TABS=[
 {id:'builder', label:'آزمونهای من'},
 {id:'school', label:'داشبورد مدرسه'},
 {id:'class', label:'داشبورد کلاس'},
 {id:'analytics',label:'تحلیل عملکرد'},
 {id:'plan', label:'برنامهٔ هفته'},
 {id:'about', label:'راهنما'},
];

function renderRolebox(){
 const b=el('rolebox');if(!b)return;
 const me=cur();
 const nm=api.on? (api.name||'') : (me.name||'');
 const rl=api.on? (ROLE_FA[api.role]||api.role) : (ROLE_FA[me.role]||'مهمان');
 const ini=(nm||'TA').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('');
 b.innerHTML=`<div class="av">${ini}</div>
 <div style="min-width:0"><div class="nm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nm}</div>
 <div class="rl">${rl}</div></div>
 <button class="icon-btn" title="خروج از حساب" data-act="logout" style="margin-inline-start:auto">خروج</button>`;
}

function render(){
 renderRolebox();
 if(!state.profileId){
 el('tabs').innerHTML='';
 el('appBody').innerHTML=vLogin();
 return;
 }
 /* header quick pickers (role switcher on mobile / always available) */
 const tabs=(ROLE_TAB[cur().role]||ROLE_TAB.student).map(id=>_NAV_TABS.find(t=>t.id===id)).filter(Boolean);
 let v=view;if(!tabs.some(t=>t.id===v))v=ROLE_HOME[cur().role]||'builder';view=v;
 const nav=tabs.map(t=>{
 let label=t.label;
 if(cur().role==='teacher'&&t.id==='builder')label='آزمونساز';
 let cnt='';
 if(cur().role==='student'&&t.id==='builder'){
 const fresh=state.published.filter(p=>!(state.pubResults[p.id]||{})[curPid()]).length;
 if(fresh)cnt=`<span class="cnt">${fa(fresh)}</span>`;
 }
 return `<button class="nav-btn ${view===t.id?'on':''}" data-act="tab" data-v="${t.id}">
 <span>${label}</span>${cnt}</button>`;}).join('');
 el('tabs').innerHTML=`<div class="nav-section">منوی ${ROLE_FA[cur().role]||'کاربر'}</div>${nav}`;

 /* log-in welcome clean: show a brand home instead of raw builder for guests */
 const appBody=el('appBody');
 if(essayEid&&cur().role==='teacher'){appBody.innerHTML=_page('بازبینی تشریحی','',vEssayReview(essayEid));startPubTicker();return;}
 if(manualEid&&cur().role==='teacher'){appBody.innerHTML=_page('ورود دستی نمرات','',vManual(manualEid));startPubTicker();return;}
 if(view==='builder')appBody.innerHTML=exam?vRun():vBuilder();
 else if(view==='school')appBody.innerHTML=vSchool();
 else if(view==='class')appBody.innerHTML=vClass();
 else if(view==='analytics')appBody.innerHTML=vAnalytics();
 else if(view==='plan')appBody.innerHTML=vPlan();
 else appBody.innerHTML=vAbout();
 if(view==='builder'&&exam)renderQ();
 startPubTicker();
}

/* ---------- Login ---------- */
function vLogin(){
 const roleCard=(r,title,sub)=>`<button class="role-tab ${loginRole===r?'on':''}" data-act="lr" data-r="${r}">
 <span class="rt">${title}</span><span class="rs">${sub}</span></button>`;
 let form='';
 if(loginRole){
 const isStu=loginRole==='student';
 const ids=isStu?studentIds():(loginRole==='teacher'?TEACHERS.map(t=>t.id):['admin']);
 const quick=ids.map(pid=>{const A=ACCOUNTS[pid];const P=state.profiles[pid];
 return `<button class="qopt" style="display:flex;align-items:center;gap:9px" data-act="quick" data-id="${pid}">
 <span style="flex:1"><b>${A.name}</b>
 <span class="muted" style="font-size:12px;display:block">${PID_LABEL(pid,A)}${P&&isStu&&P.history.length?` · ${fa(P.history.length)} آزمون`:''}</span></span>
 <span class="btn ghost sm" style="pointer-events:none;cursor:default">ورود</span></button>`;}).join('');
 form=`
 <div class="card" style="padding:20px">
 <h2>${loginRole==='admin'?'ورود مدیر':loginRole==='teacher'?'ورود معلم':'ورود دانش‌آموز'}</h2>
 <div class="scanrow" style="flex-wrap:nowrap">
 <input id="lu" placeholder="نام کاربری" style="flex:1;min-width:0;direction:ltr">
 <input id="lp" type="password" placeholder="رمز عبور" style="flex:1;min-width:0;direction:ltr">
 <button class="btn" data-act="dologin">ورود</button></div>
 ${loginErr?`<div class="kw n" style="margin:8px 0;display:block">${loginErr}</div>`:''}
 <div class="muted" style="margin:8px 0 6px">انتخاب سریع از حساب‌های دمو (رمز همه <span class="kbd">1234</span>):</div>
 <div class="login-quick">${quick}</div>
 </div>`;
 }
 return `
 <div class="login">
 <div class="login-split">
 <div class="login-hero">
 <h1>دستیار هوشمند معلم</h1>
 <p>سامانهٔ هوشمند آزمون‌سازی، تصحیح خودکار (تستی + تشریحی) و برنامه‌ریزی مطالعاتی تطبیقی برای مدرسه — از هفتم تا دوازدهم٫ کنکور و امتحانات نهایی.</p>
 <div class="fact">۱۸ درس · اِخ مبحث · بانک سؤال + تولید هوشمند</div>
 <div class="fact"> هر سؤال تولیدی فقط با تأیید معلم به دانش‌آموز می‌رسد</div>
 <div class="fact"> تحلیل تسلط، کارنامهٔ رشد و برنامهٔ هفتگی برای هر دانش‌آموز</div>
 </div>
 <div class="login-panel">
 ${form?form:`
 <div class="role-tabs">
 ${roleCard('admin','مدیر مدرسه','نظارت کل مدرسه')}
 ${roleCard('teacher','معلم','آزمون‌ساز و کلاس')}
 ${roleCard('student','دانش‌آموز','آزمون و برنامهٔ من')}
 </div>
 <div class="muted" style="text-align:center;font-size:13.5px">نقش خود را انتخاب کنید تا وارد سامانه شوید.</div>`}
 </div>
 </div>
 </div>`;
}

/* ---------- Builder — student (published exams + my results) ---------- */
function vBuilderStudent(){
 if(lastResult)return vResults();
 const body=`
 <div class="notice">آزمون‌ها را <b>معلم</b> می‌سازد و منتشر می‌کند. به‌محض انتشار، دکمهٔ <b>شرکت در آزمون</b> همین‌جا فعال می‌شود. هر آزمون <b>مهلت شرکت</b> دارد و هر دانش‌آموز فقط <b>یک بار</b> می‌تواند در آن شرکت کند؛ پس از تصحیح، نتیجهٔ شما و جدول کلاس برای شما و معلم دیده می‌شود.</div>
 ${api.on?'':vConnect()}
 ${api.on&&api.role==='student'?vPubsSrv():vPublished()}
 ${vMyResults()}`;
 return _page('آزمون‌های من','آزمون‌های منتشرشدهٔ معلم و نتایج شما — تابحال',body);
}

/* ---------- vPublished (student sees exams) ---------- */
function vPublished(){
 const pubs=state.published.slice().reverse().filter(p=>canSeeExam(p,curPid()));
 if(!pubs.length)return _empty('هنوز آزمون فعالی نیست','به‌محض اینکه معلم آزمونی منتشر کند، دکمهٔ «شرکت در آزمون» همین‌جا فعال می‌شود.');
 const rows=pubs.map(p=>{
 const done=state.pubResults[p.id]&&state.pubResults[p.id][curPid()];
 const n=Object.keys(state.pubResults[p.id]||{}).length;
 const exp=expPub.has(p.id);
 const expired=pubExpired(p);
 const actionBtn=done?`<button class="btn" disabled title="هر دانش‌آموز فقط یک بار">شرکت کردید </button>`
 :expired?`<button class="btn" disabled>مهلت تمام شد</button>`
 :`<button class="btn" data-act="take" data-id="${p.id}">٭ شرکت در آزمون</button>`;
 const dlChip=done?'':p.deadline
 ?(expired?`<span class="badge ai">⏰ پایان مهلت</span>`
 :`<span class="badge dl">⏳ مهلت: <b data-dl="${p.deadline}">${fa(p.winMin)}:۰۰</b></span>`)
 :'';
 return `<div class="exam-row">
 <div class="e-main">
 <span class="e-title">${p.title}</span>
 ${p.kind==='jame'?'<span class="badge ai"> جامع</span>':''}
 ${examTargets(p)?`<span class="badge dl" title="${examTargets(p).join('، ')}"> ${examTargets(p).map(c=>c.split(' ')[0]).join('، ')}</span>`:''}
 <span class="e-meta">${fa(p.qs.length)} سؤال · ${fa(n)} شرکت‌کننده</span>
 </div>
 <div class="e-actions">
 ${dlChip}
 ${done?`<span class="badge bk">نمرهٔ تو: ${fa(done.pct)}٪</span>`:''}
 <button class="btn ghost sm" data-act="resx" data-id="${p.id}">${exp?'▲ بستن':' نتایج کلاس'}</button>
 ${actionBtn}
 </div>
 </div>${exp?vClassResults(p):''}`;}).join('');
 return `<div class="card"><h2><span class="dot"></span>آزمون‌های منتشرشده توسط معلم</h2>
 <div class="card-hint">قانون مدرسه: شرکت دوباره ممنوع — قبل از پایان مهلت ⏳ وارد آزمون شوید.</div>${rows}</div>`;
}

/* ---------- vMyResults ---------- */
function vMyResults(){
 const rows=[];
 (state.published||[]).slice().reverse().forEach(p=>{
 const all=state.pubResults[p.id]||{};const mine=all[curPid()];
 if(!mine)return;
 const pcts=Object.entries(all).map(([pid,r])=>({pid,pct:r.pct})).sort((a,b)=>b.pct-a.pct);
 const rank=pcts.findIndex(x=>x.pid===curPid())+1;
 const avg=Math.round(pcts.reduce((s,x)=>s+x.pct,0)/pcts.length*10)/10;
 rows.push(`<tr><td>${p.title}${p.kind==='jame'?' <span class="badge ai"></span>':''}${mine.manual?' <span class="badge ai"></span>':''}</td>
 <td><b style="color:${mcolor(mine.pct)}">${fa(mine.pct)}٪</b></td><td> رتبه ${fa(rank)} از ${fa(pcts.length)}</td><td>${fa(avg)}٪</td></tr>`
 +(mine.subs?`<tr><td colspan="4" style="background:var(--acc-soft)"> کارنامهٔ جامع: ${Object.entries(mine.subs).map(([s,b])=>`${SNAME[s]||s} <b style="color:${mcolor(b.pct)}">${fa(b.pct)}٪</b>`).join(' · ')} — تراز تخمینی: <b>${fa(mine.traz)}</b></td></tr>`:''));
 });
 if(!rows.length)return '';
 return `<div class="card"><h2><span class="dot"></span>نتایج من در آزمون‌های معلم</h2>
 <div class="tbl-wrap"><table class="tbl"><thead><tr><th>آزمون</th><th>درصد من</th><th>رتبه</th><th>میانگین کلاس</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
 <button class="btn ghost sm" style="margin-top:10px" onclick="printReport(curPid())"> چاپ کارنامهٔ من</button></div>`;
}

/* ---------- Builder — teacher ---------- */
function vBuilderTeacher(){
 if(lastResult)return vResults();
 const body=`
 ${api.on?'':vConnect()}
 <div class="notice">گردش‌کار کلاس واقعی: <b>بسازید ( خودکار + دستی) ← تأیید صف ← انتشار</b>. به‌محض انتشار، دکمهٔ شرکت در پنل دانش‌آموزان فعال می‌شود و نتیجهٔ هر دانش‌آموز همین‌جا ثبت می‌گردد.</div>
 ${vTeacherWip()}
 ${vCustomQ()}
 ${vNahayiBank()}
 ${vDrafts()}
 <div class="card"><h2><span class="dot"></span>۱) مباحث آزمون</h2>${lessonChips()}
 <div class="muted">${fa(selSet().size)} مبحث انتخاب‌شده · <span class="chip" data-act="all">انتخاب همه</span></div></div>
 ${examSettingsCard('۲) تنظیمات و تولید آزمون','ترکیبی = تستی + ۱–۲ تشریحی · فقط تستی = تمرین کنکور · کاملاً تشریحی = سبک نهایی بدون تستی. سؤال‌های تا تأیید شما قابل انتشار نیستند.')}`;
 return _page('آزمون‌ساز','دو مرحله: مباحث را انتخاب کنید و آزمون را بسازید',body);
}
function vTeacherWip(){
 if(cur().role!=='teacher')return '';
 const pubs=teacherVisPubs().slice().reverse();
 if(!pubs.length)return '';
 const rows=pubs.map(p=>{
 const res=state.pubResults[p.id]||{};
 const done=Object.entries(res);
 const chips=done.length?done.map(([pid,r])=>{const bp=prof(pid);return `<span class="kw y" style="cursor:default">${bp.name}: ${fa(r.pct)}٪</span>`;}).join(''):'<span class="muted">هنوز کسی شرکت نکرده</span>';
 return `<div style="margin:8px 0"><b>${p.title}</b> <span class="muted">(${fa(done.length)}/${fa(targetCount(p))} شرکت${examTargets(p)?' — '+examTargets(p).join('، '):''})</span><div style="margin-top:4px">${chips}</div></div>`;}).join('');
 return `<div class="card"><h2><span class="dot"></span>نتایج آزمون‌های منتشرشدهٔ من</h2>${rows}</div>`;
}

/* ---------- Published (teacher) ---------- */
function vTeacherPubs(){
 const pubs=teacherVisPubs().slice().reverse();
 const mySubs=(myTeacherSubs()||[]).map(s=>SNAME[s]).join('، ');
 if(!pubs.length)return `<div class="card"><h2><span class="dot"></span>آزمون‌های منتشرشدهٔ من</h2>
 <div class="card-hint">درس من: ${mySubs||'—'}</div><div class="empty"><div class="et">هنوز آزمونی منتشر نکرده‌اید</div><div class="es">بعد از تولید و تأیید صف، «انتشار برای کلاس» را بزنید.</div></div></div>`;
 const rows=pubs.map(p=>{
 const n=Object.keys(state.pubResults[p.id]||{}).length;
 const exp=expPub.has(p.id);
 const expired=pubExpired(p);
 const stat=p.deadline?(expired?`<span class="badge ai">⏱ پایان یافته</span>`:`<span class="badge dl"> پذیرش باز: <b data-dl="${p.deadline}">…</b></span>`):'';
 return `<div class="exam-row">
 <div class="e-main">
 <span class="e-title">${p.title}</span>
 ${p.kind==='jame'?'<span class="badge ai"> جامع</span>':''}
 ${examTargets(p)?`<span class="badge dl" title="${examTargets(p).join('، ')}"> ${examTargets(p).map(c=>c.split(' ')[0]).join('، ')}</span>`:''}
 ${stat}
 <span class="e-meta">${fa(n)}/${fa(targetCount(p))} شرکت کردند${p.by&&ACCOUNTS[p.by]?` · سازنده: ${ACCOUNTS[p.by].name}`:''}</span>
 </div>
 <div class="e-actions">
 <button class="btn ghost sm" data-act="resx" data-id="${p.id}">${exp?'▲ بستن':' نتایج دانش‌آموزان'}</button>
 ${p.qs.some(q=>q.type==='tashrihi')?`<button class="btn ghost sm" data-act="essayrev" data-id="${p.id}"> بازبینی تشریحی</button>`:''}
 <button class="btn ghost sm" data-act="manadd" data-id="${p.id}"> ورود دستی</button>
 <button class="btn ghost sm" data-act="printpub" data-id="${p.id}"> چاپ</button>
 </div></div>${exp?vClassResults(p):''}`;}).join('');
 return `<div class="card"><h2><span class="dot"></span>آزمون‌های منتشرشدهٔ من و نتایج کلاس <span class="badge dl">درس من: ${mySubs}</span></h2>${rows}</div>`;
}

/* ---------- Lesson chips -------- */
function lessonChips(){
 const sel=selSet();
 const subs=myTeacherSubs();
 const stu=cur()&&cur().role==='student';
 const allowed=new Set(subs?subs:SUBJECTS.filter(s=>!stu||[...lessonsForClass(cur().cls||CLS0)].some(lid=>LSUB[lid]===s.id)).map(s=>s.id));
 return SUBJECTS.filter(s=>allowed.has(s.id)).map(s=>{
 const les=s.lessons.map(l=>`<span class="chip ${sel.has(l.id)?'on':''}" data-act="les" data-id="${l.id}">${l.name}</span>`).join('');
 return `<div style="margin:8px 0"><b style="font-size:14px">${s.name}</b> <span class="muted">(ضریب ${fa(s.coef)})</span><div style="margin-top:3px">${les}</div></div>`;
 }).join('');
}
function examSettingsCard(title,hint){
 const draftN=(state.draftQs||[]).length;
 return `<div class="card"><h2><span class="dot"></span>${title}</h2>
 <div class="grid2">
 <div class="field"><label>نوع آزمون</label>
 <select id="cKind">
 <option value="mix" ${cfg.kind==='mix'?'selected':''}>ترکیبی: تستی + ۱–۲ تشریحی</option>
 <option value="mcq" ${cfg.kind==='mcq'?'selected':''}>فقط تستی (سبک کنکور)</option>
 <option value="tashrihi" ${cfg.kind==='tashrihi'?'selected':''}> کاملاً تشریحی (سبک نهایی)</option>
 </select></div>
 <div class="field"><label>تعداد سؤال</label>
 <select id="cCount">${[5,10,15,20].map(n=>`<option ${cfg.count===n?'selected':''}>${n}</option>`).join('')}</select></div>
 <div class="field"><label>سطح</label>
 <select id="cLevel"><option value="mix">ترکیبی (استاندارد)</option>
 <option value="easy">آسان</option><option value="mid">متوسط</option><option value="hard">سخت</option></select></div>
 </div>
 <div style="margin-top:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
 <button class="btn" data-act="gen"> تولید آزمون${cur().role==='teacher'&&draftN?` + ${fa(draftN)} سؤال دستی`:''}</button>
 <span class="card-hint">${hint}</span></div></div>`;
}

/* ---------- Preview (approval queue) ---------- */
function vPreview(qs){
 const pend=qs.filter(q=>!q.approved).length;
 const rows=qs.map((q,i)=>`<tr>
 <td>${fa(i+1)}</td>
 <td>${q.type==='tashrihi'?(q.n?nahBadge(q):'<span class="badge bk"> تشریحی</span>'):q.src==='custom'?'<span class="badge bk"> دستی معلم</span>':q.k?`<span class="badge ai" title="${(q.exp||'').replace(/"/g,'')}"> کنکور${q.y?' '+fa(q.y):''}</span>`:q.src==='ai'?'<span class="badge ai"> هوش مصنوعی</span>':'<span class="badge bk">بانک</span>'}</td>
 <td>${LNAME[q.l]}</td>
 <td style="max-width:360px">${fa(q.q)}</td>
 <td>${q.approved?'<span style="color:var(--good);font-weight:700"> تأیید</span>':`<button class="btn wr sm" data-act="ap" data-i="${i}">تأیید</button>`}</td></tr>`).join('');
 const body=`
 <div class="card">
 <h2><span class="dot"></span>پیش‌نمایش آزمون — صف تأیید معلم ${window.__srvExam?'<span class="badge srv"> روی سرور</span>':''}</h2>
 <div class="card-hint">${fa(qs.length)} سؤال · ${fa(pend)} سؤال تولیدی در انتظار تأیید ${pend?`· <button class="btn ghost sm" data-act="apall"> تأیید همه</button>`:''}</div>
 <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>نوع</th><th>مبحث</th><th>سؤال</th><th>تأیید</th></tr></thead><tbody>${rows}</tbody></table></div>
 <div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap;align-items:center">
 <button class="btn" data-act="start" ${pend?'disabled':''}>▶ شروع آزمون (${fa(qs.length)} دقیقه)</button>
 <button class="btn ghost" data-act="paper" ${pend?'disabled':''}> حالت کاغذی</button>
 ${cur().role==='teacher'?`<button class="btn ghost" data-act="printprev" ${pend?'disabled':''}> چاپ A4</button>`:''}
 <button class="btn ghost" data-act="cancel">بازگشت</button>
 </div>
 ${cur().role==='teacher'?`<div class="scanrow" style="margin-top:12px;flex-wrap:wrap;background:var(--surface-2);padding:10px 12px;border-radius:12px">
 ⏳ مهلت شرکت: <select id="pubWin" style="width:auto">
 <option value="10">۱۰ دقیقه</option><option value="15" selected>۱۵ دقیقه</option>
 <option value="20">۲۰ دقیقه</option><option value="30">۳۰ دقیقه</option><option value="60">۱ ساعت</option></select>
 مخاطب: ${CLASS_LIST.map((c,i)=>`<label style="font-size:12px;cursor:pointer;white-space:nowrap"><input type="checkbox" id="pc${i}" value="${c}"> ${c}</label>`).join('')}
 <button class="btn" data-act="pub" ${pend?'disabled':''}> انتشار برای کلاس</button></div>`:''}
 ${pend?'<div class="muted">شروع تا تأیید همهٔ سؤال‌های غیرفعال است (قانون اعتماد).</div>':'<div class="muted">بعد از انتشار، دانش‌آموزان فقط تا پایان مهلت ⏳ و فقط یک بار می‌توانند شرکت کنند.</div>'}
 </div>`;
 return _page('پیش‌نمایش آزمون','',body);
}

/* ---------- Exam player (vRun + renderQ) ---------- */
function vRun(){
 const q=exam.qs[idx];
 const pal=exam.qs.map((p,i)=>{
 const done=p.type==='tashrihi'?!!String(answers[i]||'').trim():answers[i]!=null;
 return `<button class="${done?'done ':''}${i===idx?'cur':''}" data-act="go" data-i="${i}">${fa(i+1)}</button>`;}).join('');
 if(exam.paper)return `
 <div class="notice"> <b>حالت کاغذی (شبیه‌سازی OMR):</b> پاسخ دانش‌آموز را جلوی خود بگذارید و حباب‌های پرشده را همین‌جا کلیک کنید. در نسخهٔ واقعی: عکس گوشی ← OpenCV ← همین جدول.</div>
 <div class="exam-card">
 <div class="exam-head">
 <span><b>ورود پاسخ‌برگ</b> · سؤال ${fa(idx+1)} از ${fa(exam.qs.length)}</span>
 <button class="btn dng" data-act="fin">ثبت پاسخ‌برگ و تصحیح</button>
 </div>
 <div class="exam-body" id="qbox" style="min-height:120px"></div>
 <div class="exam-toolbar">
 <button class="btn ghost" data-act="prev" ${idx===0?'disabled':''}>← قبلی</button>
 <button class="btn ghost" data-act="next" ${idx===exam.qs.length-1?'disabled':''}>بعدی →</button>
 </div>
 <div style="padding:0 18px 16px"><div class="pal">${pal}</div></div>
 </div>`;
 const mcqN=exam.qs.filter(p=>p.type!=='tashrihi').length;
 const subjHint=mcqN?'نمرهٔ منفی: هر ۳ غلط = −۱ صحیح · گزینه با <span class="kbd">۱–۴</span>':' این آزمون کاملاً تشریحی است — پاسخ‌ها را کامل بنویسید';
 return `
 <div class="exam-card">
 <div class="exam-head">
 <span><b>آزمون جاری</b> · سؤال ${fa(idx+1)} از ${fa(exam.qs.length)} · <span class="muted">${subjHint}</span></span>
 <span style="display:flex;gap:9px;align-items:center">
 <span class="timer" id="timer"></span>
 <button class="btn dng" data-act="fin">پایان آزمون</button>
 </span>
 </div>
 <div class="exam-body" id="qbox" style="min-height:120px"></div>
 <div class="exam-toolbar">
 <button class="btn ghost" data-act="prev" ${idx===0?'disabled':''}>← قبلی</button>
 <button class="btn ghost" data-act="next" ${idx===exam.qs.length-1?'disabled':''}>بعدی →</button>
 </div>
 <div style="padding:0 18px 16px"><div class="pal">${pal}</div></div>
 </div>`;
}
function renderQ(){
 const q=exam.qs[idx];const L=['الف','ب','ج','د'];
 const box=el('qbox');
 if(q.type==='tashrihi'){
 const cur=typeof answers[idx]==='string'?answers[idx]:'';
 box.innerHTML=`<div class="q-meta"><span class="badge bk"> تشریحی</span><span>${LNAME[q.l]}</span><span>${'●'.repeat(q.d)}${'○'.repeat(5-q.d)}</span></div>
 <div class="q-text">${fa(idx+1)}. ${fa(q.q)}</div>
 <textarea id="tarea" class="tarea" dir="rtl" placeholder="پاسخ خود را اینجا بنویسید...">${cur.replace(/</g,'&lt;')}</textarea>
 <div class="muted" style="margin-top:6px">${exam.paper?'معلم پاسخ را از برگه اینجا وارد می‌کند — تصحیح + اصلاح معلم':'تصحیح خودکار با روبریک + امکان اصلاح توسط معلم'}</div>`;
 return;
 }
 box.innerHTML=`<div class="q-meta"><span class="badge bk">${LNAME[q.l]}</span>${q.src==='ai'?'<span class="badge ai"></span>':''}<span>سطح ${'●'.repeat(q.d)}${'○'.repeat(5-q.d)}</span></div>
 <div class="q-text">${fa(idx+1)}. ${fa(q.q)}</div>
 ${q.o.map((op,i)=>`<button class="qopt ${answers[idx]===i?'sel':''}" data-act="ans" data-i="${i}"><b>${L[i]})</b> ${fa(op)}</button>`).join('')}`;
}

/* ---------- Results ---------- */
function vTashrihi(){
 const t=lastResult.res.tashrihi;
 if(!t||!t.length)return '';
 const rows=t.map((x,gi)=>{
 const fin=x.grade.final!=null?x.grade.final:x.grade.score;
 const chips=x.grade.hits.map(h=>`<span class="kw ${h.ok?'y':'n'}">${h.ok?'':''} ${h.kw} (+${fa(h.w)})</span>`).join('');
 return `<div style="border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px">
 <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><b>${fa(x.i+1)}. ${fa(x.q.q)}</b><span class="badge bk">${LNAME[x.q.l]}</span></div>
 <div class="muted">پاسخ شما (${fa(x.grade.words)} کلمه): «${String(lastResult.ans[x.i]||'—').replace(/</g,'&lt;')}»</div>
 <div style="margin:8px 0">${chips}</div>
 <div class="muted"> تحلیل: ${x.grade.why||('نکته‌های دیده‌شده: '+(x.grade.hits.filter(h=>h.ok).map(h=>h.kw).join('، ')||'—'))}</div>
 <div class="scanrow" style="flex-wrap:wrap">
 ${pbar(fin,mcolor(fin))}
 <span>امتیاز : <b style="color:${mcolor(fin)}">${fa(x.grade.score)}</b>/۱۰۰</span>
 <input id="tadj-${gi}" type="number" min="0" max="100" value="${fin}" style="width:80px">
 <button class="btn ghost sm" data-act="tadj" data-i="${gi}"> ثبت نمرهٔ معلم</button>
 ${x.grade.final!=null?'<span class="badge ai">نهایی ثبت شد</span>':''}
 </div>
 <div class="muted">پاسخ الگو: ${fa(x.q.model)}</div></div>`;}).join('');
 return `<div class="card"><h2><span class="dot"></span>سؤال‌های تشریحی — تصحیح با واژه‌های کلیدی معلم</h2>
 <div class="card-hint"> نمره = جمع امتیاز واژه‌هایی که معلم مشخص کرده و در پاسخ شما یافت شده‌اند. معلم می‌تواند نمره را تغییر دهد.</div>${rows}</div>`;
}
function vResults(){
 const{res,qs}=lastResult;const L=['الف','ب','ج','د'];
 const perRows=Object.entries(res.perL).map(([lid,x])=>{
 const p=lessonPct(x);
 return `<tr><td>${LNAME[lid]}</td><td>${fa(x.c)}/${fa(x.w)}/${fa(x.b)}</td>
 <td>${pbar(p,mcolor(p))} <b style="color:${mcolor(p)}">${fa(p)}٪</b></td></tr>`;}).join('');
 const review=lastResult.srv?'':qs.map((q,i)=>{
 if(q.type==='tashrihi')return '';
 const r=lastResult.ans[i];
 const ops=q.o.map((op,j)=>{
 let cls='miss';if(j===q.a)cls='good';if(r===j&&r!==q.a)cls='bad';
 return `<div class="qopt ${cls}" style="cursor:default;margin:4px 0"><b>${L[j]})</b> ${fa(op)}</div>`;}).join('');
 const note=r==null?'— نزده':r===q.a?' صحیح':' غلط';
 return `<div style="border:1px solid var(--line);border-radius:12px;padding:13px;margin-bottom:10px">
 <b>${fa(i+1)}. ${fa(q.q)}</b> <span class="muted">(${note})</span>${ops}
 ${noEx(q.exp)?`<div class="muted" style="margin-top:6px"> ${fa(q.exp)}</div>`:''}</div>`;}).join('');
 const scoreHue=res.pct<40?'r':res.pct<70?'w':'g';
 const body=`
 <div class="card" style="text-align:center">
 <div class="muted">نتیجهٔ آزمون (فرمول رسمی کنکور)</div>
 <div style="font-size:56px;font-weight:800;color:${mcolor(res.pct)};margin-top:4px">${fa(res.pct)}٪</div>
 <div style="margin-top:8px">صحیح: <b style="color:var(--good)">${fa(res.c)}</b> · غلط: <b style="color:var(--bad)">${fa(res.w)}</b> · نزده: <b>${fa(res.b)}</b> · از ${fa(res.n)} سؤال تستی${res.tashrihi.length?` + ${fa(res.tashrihi.length)} تشریحی`:''}</div>
 </div>
 <div class="card"><h2><span class="dot"></span>درصد به تفکیک مبحث</h2>
 <div class="tbl-wrap"><table class="tbl"><thead><tr><th>مبحث</th><th>صحیح/غلط/نزده</th><th>درصد</th></tr></thead><tbody>${perRows}</tbody></table></div>
 <div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">
 <button class="btn" data-act="goplan"> ساخت / به‌روزرسانی برنامهٔ هفته</button>
 ${cur().role!=='student'?`<button class="btn wr" data-act="simcls"> شبیه‌سازی پاسخ کلاس (۱۲ نفر)</button>`:''}
 ${!lastResult.srv?`<button class="btn ghost" data-act="rev">${reviewOpen?'پنهان‌کردن':'مرور'} سؤالات</button>`:''}
 <button class="btn ghost" data-act="new">${cur().role==='student'?'بازگشت به آزمون‌های من':'آزمون جدید'}</button>
 </div></div>
 ${vTashrihi()}
 ${reviewOpen?`<div class="card"><h2><span class="dot"></span>پاسخنامه</h2>${review}</div>`:''}`;
 return _page('نتیجهٔ آزمون',`${scoreHue==='g'?'عالی بود! ':scoreHue==='w'?'قابل قبول — جای رشد دارد ':'نیاز به تمرین بیشتر '}`,body);
}

/* ---------- School (boss) ---------- */
function vSchool(){
 const stus=Object.entries(state.profiles).filter(([pid,p])=>p.role==='student'&&pid.startsWith('stu'));
 const scored=stus.map(([pid,p])=>({pid,p,avg:p.history.length?Math.round(p.history.reduce((s,h)=>s+h.pct,0)/p.history.length*10)/10:null})).filter(x=>x.avg!=null);
 const schoolAvg=scored.length?Math.round(scored.reduce((s,x)=>s+x.avg,0)/scored.length*10)/10:null;
 const classes=CLASS_LIST.map(k=>{
 const members=stus.filter(([,p])=>(p.cls||CLS0)===k);
 const ms=members.map(([pid,p])=>{const a=p.history.length?Math.round(p.history.reduce((s,h)=>s+h.pct,0)/p.history.length*10)/10:null;return a;}).filter(v=>v!=null);
 return {k,n:members.length,avg:ms.length?Math.round(ms.reduce((s,m)=>s+m,0)/ms.length*10)/10:null,act:ms.length};
 });
 const pubs=state.published.length;
 const pubRes=Object.values(state.pubResults).reduce((s,r)=>s+Object.keys(r).length,0);
 /* jame card + roster computed via the engine helpers, compacted */
 const jmSel=(id,def)=>`<select id="${id}">${[0,2,4,6,8,10,12].map(n=>`<option value="${n}"${n===def?' selected':''}>${fa(n)}</option>`).join('')}</select>`;
 const jmWinOpts=[10,15,20,30,60,120].map(n=>`<option value="${n}"${n===30?' selected':''}>${fa(n)}</option>`).join('');
 const jamePub=[...(state.published||[])].reverse().find(p=>p.kind==='jame');
 const weakAll={};let wn={};
 scored.forEach(x=>{Object.keys(x.p.lessonStats).forEach(lid=>{const ms=masteryOf(lid,x.pid);if(ms){weakAll[lid]=(weakAll[lid]||0)+ms.m;wn[lid]=(wn[lid]||0)+1;}});});
 const topWeak=Object.entries(weakAll).map(([lid,tot])=>({lid,avg:Math.round(tot/wn[lid])})).sort((a,b)=>a.avg-b.avg).filter(x=>x.avg<50).slice(0,4);
 const best=scored.slice().sort((a,b)=>b.avg-a.avg)[0];
 const worst=scored.slice().sort((a,b)=>b.avg-a.avg)[scored.length-1];
 const classBars=classes.map(c=>`<div class="lrow"><span class="nm">کلاس ${c.k}</span>
 <div class="bar-wrap"><div class="bar" style="width:${c.avg||2}%;background:${mcolor(c.avg||0)}"></div></div>
 <b style="width:64px;color:${mcolor(c.avg||0)}">${c.avg==null?'—':fa(c.avg)+'٪'}</b></div>`).join('');
 const rosterRows=studentIds().map((pid,i)=>{
 const A=ACCOUNTS[pid];const P=state.profiles[pid];
 const isNew=(state.stuExtra||[]).some(e=>e.id===pid);
 return `<tr><td>${fa(i+1)}</td><td>${A.name}${isNew?' <span class="badge ai"> ورودی جدید</span>':''}</td>
 <td>${A.cls||CLS0}</td><td>${P&&P.history.length?fa(P.history.length)+' آزمون':'—'}</td>
 <td><button class="btn ghost sm" data-act="delstu" data-id="${pid}"> حذف</button></td></tr>`;}).join('');
 let jameCard='';
 if(jamePub){
 const jr=state.pubResults[jamePub.id]||{};
 const list=studentIds().filter(pid=>canSeeExam(jamePub,pid)).map(pid=>({pid,A:ACCOUNTS[pid],r:jr[pid]})).sort((a,b)=>((b.r?b.r.pct:-1000))-((a.r?a.r.pct:-1000)));
 const took=list.filter(x=>x.r);
 const avg=took.length?Math.round(took.reduce((s,x)=>s+x.r.pct,0)/took.length*10)/10:null;
 let jrank=0;
 const jRows=list.map(x=>`<tr><td>${x.r?fa(++jrank):'—'}</td><td>${x.A.name}</td><td>${x.A.cls||CLS0}</td>
 <td>${x.r?`<b style="color:${mcolor(x.r.pct)}">${fa(x.r.pct)}٪</b>`:'<span class="muted">—</span>'}</td><td>${x.r&&x.r.traz!=null?fa(x.r.traz):'—'}</td></tr>`).join('');
 jameCard=took.length?`<div class="card"><h2><span class="dot"></span>نتایج آزمون جامع — ${jamePub.title}</h2>
 <div class="tbl-wrap"><table class="tbl"><thead><tr><th>رتبه</th><th>دانش‌آموز</th><th>کلاس</th><th>درصد کل</th><th>تراز</th></tr></thead><tbody>${jRows}</tbody></table></div>
 <div class="muted">میانگین مدرسه: <b>${fa(avg)}٪</b> · تراز تخمینی درون‌مدرسه‌ای (۱۰۰۰ تا ۱۰۰۰۰).</div></div>`:'';
 }
 const body=`
 <div class="metrics">
 ${_metric('g','دانش‌آموز کل مدرسه',fa(stus.length),'در ${fa(9)} کلاس')}
 ${_metric('b','فعال در سامانه',fa(scored.length),stus.length?fa(Math.round(scored.length/stus.length*100))+'٪ مشارکت':'—')}
 ${_metric('w','میانگین درصد مدرسه',schoolAvg==null?'—':fa(schoolAvg)+'٪','تازه‌ترین وضعیت')}
 ${_metric('o','آزمون / نتیجه',fa(pubs)+' / '+fa(pubRes),'منتشرشده / ثبت‌شده')}
 </div>
 <div class="card" style="border:2px solid var(--acc-soft)">
 <h2><span class="dot"></span>آزمون جامع کنکوری</h2>
 <div class="card-hint">با یک کلیک برای همهٔ دانش‌آموزان از دروس اصلی منتشر می‌شود؛ کارنامه = درصد هر درس + تراز تخمینی. قوانین مدرسه: یک‌بار شرکت + مهلت.</div>
 <div class="scanrow" style="flex-wrap:wrap">
 <input id="jmTitle" value="آزمون جامع کنکوری — پایان سال" style="flex:1;min-width:230px">
 ⏳ مهلت: <select id="jmWin" style="width:auto">${jmWinOpts}</select> دقیقه
 مخاطب: <select id="jmCls" style="width:auto"><option value="">همهٔ کلاس‌ها</option>${CLASS_LIST.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
 </div>
 <div class="scanrow" style="flex-wrap:wrap;margin-top:8px">
 زیست ${jmSel('jmN_zist',8)} · شیمی ${jmSel('jmN_shimi',8)} · فیزیک ${jmSel('jmN_fizik',6)} · ریاضی ${jmSel('jmN_riazi',6)}
 <button class="btn" data-act="jame"> برگزاری آزمون جامع</button>
 </div>
 </div>
 ${jameCard}
 <div class="card"><h2><span class="dot"></span>مدیریت دانش‌آموزان — شروع سال تحصیلی</h2>
 <div class="card-hint">هر سال: فارغ‌التحصیلان را حذف و ورودی‌های جدید را اضافه کنید. حساب جدید بلافاصله از صفحهٔ ورود فعال است.</div>
 <button class="btn" data-act="addstu"> افزودن دانش‌آموز جدید</button>
 <font style="font-size:13px" color="#8791a0"> · نام، کلاس، آواتار و رمز را در ستون بعد وارد کنید</font>
 <div style="margin-top:12px"></div>
 <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>دانش‌آموز</th><th>کلاس</th><th>فعالیت</th><th></th></tr></thead><tbody>${rosterRows}</tbody></table></div>
 <div class="scanrow" style="margin-top:12px;flex-wrap:wrap">
 <input id="nsName" placeholder="نام و نام خانوادگی" style="flex:1;min-width:160px">
 <select id="nsCls" style="width:auto">${CLASS_LIST.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
 <select id="nsAv" style="width:auto"><option value="&#x1f3eb;"> پسر</option><option value="&#x1f3eb;"> دختر</option></select>
 <input id="nsPass" placeholder="رمز — پیش‌فرض 1234" style="width:150px;direction:ltr">
 <button class="btn" data-act="addstu"> افزودن</button>
 </div></div>
 <div class="card"><h2><span class="dot"></span>مقایسهٔ کلاس‌ها</h2>${classBars||'<div class="muted">دادهٔ کافی نیست.</div>'}</div>
 <div class="card"><h2><span class="dot"></span>مباحث بحرانی سطح مدرسه</h2>
 ${topWeak.length?topWeak.map(x=>`<div class="task"><b>${LNAME[x.lid]}</b><span class="t-meta">میانگین ${fa(x.avg)}٪ · پیشنهاد: جلسهٔ جبرانی</span></div>`).join(''):'<div class="muted">مبحث بحرانی شناسایی نشد.</div>'}
 ${best?`<hr><div class="muted"> بهترین: <b>${best.p.name}</b> (${fa(best.avg)}٪) — تشویق عمومی<br> نیازمند توجه: <b>${worst.p.name}</b> (${fa(worst.avg)}٪) — ارجاع به مشاور</div>`:''}</div>
 <div class="card"><h2><span class="dot"></span>حافظهٔ سامانه و پشتیبان‌گیری</h2>
 <div class="card-hint">لایهٔ ۱: هر تغییر خودکار روی دستگاه ذخیره می‌شود. لایهٔ ۲: فایل پشتیبان برای انتقال بین دستگاه‌ها. لایهٔ ۳: پایگاه‌دادهٔ سرور.</div>
 <div style="display:flex;gap:9px;flex-wrap:wrap">
 <button class="btn ghost" data-act="backup"> دانلود فایل پشتیبان</button>
 <label class="btn ghost" style="cursor:pointer;margin:0"> بازیابی<input type="file" accept="application/json,.json" style="display:none" onchange="var f=this.files[0];if(!f)return;var r=new FileReader();r.onload=function(){var res=importState(r.result);alert(res.ok?' پشتیبان بازیابی شد.':' '+res.err);render();};r.readAsText(f);this.value='';"></label>
 </div></div>`;
 return _page('داشبورد مدرسه','نظارت کل: کلاس‌ها، نتایج، آزمون جامع و مدیریت دانش‌آموزان',body);
}

/* ---------- Class dashboard ---------- */
function vClass(){
 const S=classSim;
 const head=`<div class="notice">داشبورد معلم (فاز ۲/۳): همین آزمونی که ساختید را <b>۱۲ دانش‌آموز شبیه‌سازی‌شده</b> پاسخ داده‌اند — نقشهٔ حرارتی مبحث×دانش‌آموز + تحلیل روان‌سنجی سؤال‌ها به‌صورت خودکار. ${S?'':'<b>اول از آزمون‌ساز یک آزمون بسازید.</b>'}</div>`;
 const realOnly=cur().role==='teacher'?vClassSrv()+vTeacherWip():'';
 if(!S)return _page('داشبورد کلاس','',head+realOnly+_empty('هنوز شبیه‌سازی نشده','پس از ساخت و برگزاری آزمون، اینجا «شبیه‌سازی پاسخ کلاس ۱۲نفره» فعال می‌شود.'));
 const lids=[...new Set(S.qs.map(q=>q.l))];
 const hRows=S.students.map(st=>{
 const cells=lids.map(lid=>{
 const v=st.perLesson[lid];
 if(v==null)return `<td class="hc" style="background:var(--surface-2);color:var(--ink-3)">–</td>`;
 return `<td class="hc" style="background:${mcolor(v)}1F;color:${mcolor(v)}" title="${st.name} — ${LNAME[lid]}: ${fa(v)}٪">${fa(v)}</td>`;}).join('');
 const avg=Math.round(lids.reduce((s,l)=>s+(st.perLesson[l]||0),0)/lids.length);
 return `<tr><td class="rn">${st.name}</td>${cells}<td class="hc" style="background:var(--surface-2);color:var(--ink-2);font-weight:800"><b>${fa(avg)}</b></td></tr>`;}).join('');
 const headRow=lids.map(l=>`<th title="${LNAME[l]}">${LNAME[l].split('(')[0].trim().slice(0,10)}</th>`).join('')+'<th>میانگین</th>';
 const flagged=S.itemStats.filter(x=>x.flags&&x.flags.length);
 const qrows=flagged.length?flagged.map(x=>{
 const L=['الف','ب','ج','د'];
 const dist=(x.dist||[]).map(d=>`<span style="font-size:11px;margin-left:6px">${L[d.o]}: ${fa(Math.round(d.share*100))}٪${d.o===x.q.a?' ':''}</span>`).join('');
 return `<tr><td>${fa(x.qi+1)}</td><td style="max-width:300px">${fa(x.q.q)}</td>
 <td>${x.p!=null?fa(Math.round(x.p*100))+'٪':'—'}</td><td style="color:${x.disc<0?'var(--bad)':x.disc<0.15?'var(--warn)':'inherit'}">${x.disc!=null?fa(x.disc):'—'}</td>
 <td>${dist}</td><td>${x.flags.map(f=>`<span class="kw ${f.includes('منفی')||f.includes('فوری')?'n':'y'}">${f}</span>`).join('')}</td></tr>`;}).join(''):'';
 const avgClass=Math.round(S.students.reduce((s,x)=>s+x.res.pct,0)/S.students.length*10)/10;
 const body=`
 ${head}${realOnly}
 <div class="metrics">
 ${_metric('b','دانش‌آموز',fa(S.students.length),'شبیه‌سازی‌شده')}
 ${_metric('g','میانگین درصد کلاس',fa(avgClass)+'٪','درصد با فرمول کنکور')}
 ${_metric('w','سؤال نیازمند بازبینی',fa(flagged.length),'خروجی خودکار')}
 ${_metric('o','مبحث پوشش داده‌شده',fa(lids.length),'برگرفته از آزمون')}
 </div>
 <div class="card"><h2><span class="dot"></span>نقشهٔ حرارتی کلاس (مبحث × دانش‌آموز)</h2>
 <div class="tbl-wrap"><table class="ht"><tr><th style="text-align:right">دانش‌آموز</th>${headRow}</tr>${hRows}</table></div>
 <div class="muted" style="margin-top:6px">قرمز &lt;۴۰٪ · نارنجی ۴۰–۷۰٪ · سبز &gt;۷۰٪</div></div>
 ${qrows?`<div class="card"><h2><span class="dot"></span>سؤال‌های نیازمند بازبینی</h2>
 <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>سؤال</th><th>p-value</th><th>تمایز</th><th>توزیع گزینه‌ها</th><th>پرچم</th></tr></thead><tbody>${qrows}</tbody></table></div></div>`:''}
 <div class="card" style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
 <button class="btn ghost" data-act="resim"> شبیه‌سازی دوبارهٔ کلاس</button>
 <span class="muted">هر بار توانایی‌ها و بی‌دقتی‌های متفاوت شبیه‌سازی می‌شوند.</span></div>`;
 return _page('داشبورد کلاس','تحلیل سؤال‌ها و نقشهٔ تسلط کلاس',body);
}
function vClassResults(pub){
 const res=state.pubResults[pub.id]||{};
 const rows=studentIds().filter(pid=>canSeeExam(pub,pid)).map(pid=>({pid,name:ACCOUNTS[pid].name,cls:ACCOUNTS[pid].cls||CLS0,pct:res[pid]?res[pid].pct:null,manual:!!(res[pid]&&res[pid].manual)}))
 .sort((a,b)=>(b.pct==null?-1000:b.pct)-(a.pct==null?-1000:a.pct));
 const took=rows.filter(r=>r.pct!=null);
 const avg=took.length?Math.round(took.reduce((s,r)=>s+r.pct,0)/took.length*10)/10:null;
 let rank=0;
 const trs=rows.map((r,i)=>{
 const rk=r.pct==null?'':fa(++rank);
 return `<tr${r.pct==null?' style="opacity:.5"':''}><td>${r.pct==null?'—':(i===0?'':i===1?'':i===2?'':rk)}</td>
 <td>${r.name}${r.pid===curPid()?' <span class="badge bk">من</span>':''}${r.manual?' <span class="badge ai"></span>':''}${r.pct!=null&&cur().role!=='student'?` <button class="btn ghost sm" onclick="event.stopPropagation();printReport('${r.pid}')"></button>`:''}</td>
 <td>${r.cls}</td><td>${r.pct==null?'<span class="muted">شرکت نکرده</span>':`<b style="color:${mcolor(r.pct)}">${fa(r.pct)}٪</b>`}</td></tr>`;}).join('');
 return `<div class="card" style="margin-top:6px"><h2><span class="dot"></span>نتایج کلاس — ${pub.title}</h2>
 <div class="tbl-wrap"><table class="tbl"><thead><tr><th>رتبه</th><th>دانش‌آموز</th><th>کلاس</th><th>درصد</th></tr></thead><tbody>${trs}</tbody></table></div>
 <div class="muted">${fa(took.length)}/${fa(rows.length)} شرکت کرده‌اند · میانگین کلاس: ${avg==null?'—':fa(avg)+'٪'}${took.length?` · بالاترین: ${rows[0].name} (${fa(rows[0].pct)}٪)`:''}</div></div>`;
}

/* ---------- Analisis ---------- */
function viewPicker(ctx){
 if(cur().role==='student')return '';
 const chips=NAMES.map((n,i)=>{
 const pid='stu'+i;const P=state.profiles[pid];
 return `<span class="chip ${dispPid()===pid?'on':''}" data-act="views" data-id="${pid}">${i%2?'':''} ${n}${P?` (${fa(P.history.length)} آزمون)`:''}</span>`;}).join('');
 return `<div class="card"><h2><span class="dot"></span>مشاهدهٔ داده‌های کدام دانش‌آموز؟</h2>
 <span class="chip ${!state.teacherView?'on':''}" data-act="views" data-id="me"> خودم (معلم)</span>${chips}</div>`;
}
function vAnalytics(){
 const h=prof(dispPid()).history.slice().sort((a,b)=>a.t-b.t);
 const rows=allLessons().map(lid=>({lid,ms:masteryOf(lid)}));
 const avg=h.length?Math.round(h.reduce((s,x)=>s+x.pct,0)/h.length*10)/10:null;
 const tested=rows.filter(r=>r.ms);
 const weak=tested.filter(r=>r.ms.m<50).sort((a,b)=>a.ms.m-b.ms.m);
 let svg='';
 if(h.length>=2){
 const W=600,H=170,P=30,x0=P,x1=W-10,step=(x1-x0)/(h.length-1);
 const pts=h.map((e,i)=>[x0+i*step,H-P-(Math.max(0,Math.min(100,e.pct))/100)*(H-2*P)]);
 svg=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:640px">
 <line x1="${x0}" y1="${H-P}" x2="${x1}" y2="${H-P}" stroke="var(--line)"/>
 <line x1="${x0}" y1="${P}" x2="${x1}" y2="${P}" stroke="var(--line)"/>
 <polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="var(--acc)" stroke-width="3"/>
 ${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--acc)"/>${(i===0||i===pts.length-1)?`<text x="${p[0]}" y="${p[1]-8}" font-size="12" text-anchor="middle" fill="#7B8696">${fa(h[i].pct)}٪</text>`:''}`).join('')}
 </svg>`;
 }
 const testedRows=rows.filter(r=>r.ms),untestedRows=rows.filter(r=>!r.ms);
 const bars=testedRows.map(r=>{
 const nm=LNAME[r.lid];
 return `<div class="lrow"><span class="nm">${nm}</span>
 <div class="bar-wrap"><div class="bar" style="width:${r.ms.m}%;background:${mcolor(r.ms.m)}"></div></div>
 <b style="width:70px;color:${mcolor(r.ms.m)}">${fa(r.ms.m)}٪</b>
 <span class="muted" style="font-size:11px">${fa(r.ms.n)} آزمون${r.ms.age?` · ${fa(r.ms.age)} روز پیش`:''}</span></div>`;}).join('');
 const untestedHtml=untestedRows.length?`<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">${fa(untestedRows.length)} مبحث هنوز ارزیابی نشده (نمایش فهرست)</summary>
 <div style="margin-top:6px">${untestedRows.map(r=>`<span class="chip" style="font-size:11px;cursor:default">${LNAME[r.lid]}</span>`).join('')}</div></details>`:'';
 const srvBars=(api.on&&api.role==='student'&&SRV.mastery&&Object.keys(SRV.mastery).length)?(()=>{
 const rows=Object.entries(SRV.mastery).map(([lid,v])=>`<div class="lrow"><span class="nm">${LNAME[lid]||lid}</span>
 <div class="bar-wrap"><div class="bar" style="width:${v.m}%;background:${mcolor(v.m)}"></div></div>
 <b style="width:70px;color:${mcolor(v.m)}">${fa(v.m)}٪</b>
 <span class="muted" style="font-size:11px">${fa(v.n)} تلاش · ${fa(v.age_days)} روز پیش</span></div>`).join('');
 return `<div class="card"><h2><span class="dot"></span>تسلط شما — روی سرور FastAPI</h2>${rows}</div>`;})():'';
 let spiderHtml='';
 const isStuView=prof(dispPid()).role==='student';
 if(isStuView&&testedRows.length){
 const subs=studentSpiders(dispPid());
 if(subs.length){
 if(!spiderSubj||!subs.some(s=>s.sid===spiderSubj))spiderSubj=subs[0].sid;
 const sel=subs.find(s=>s.sid===spiderSubj);
 const maxc=sel.lessons.length>16?7:sel.lessons.length>8?10:14;
 const chips=subs.map(s=>`<span class="chip ${s.sid===sel.sid?'on':''}" data-act="spider" data-id="${s.sid}">${s.name}${s.avg!=null?` · ${fa(s.avg)}٪`:''}</span>`).join('');
 const mini=subs.map(s=>{
 const mc=s.lessons.length>16?6:s.lessons.length>8?8:10;
 const on=s.sid===sel.sid;
 return `<div class="spidermini ${on?'on':''}" data-act="spider" data-id="${s.sid}" title="بزرگ‌نمایی ${s.name}">
 <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px"><b>${s.name}</b><b style="color:${mcolor(s.avg)}">${fa(s.avg)}٪${on?' ':''}</b></div>
 ${spiderSVG(s.lessons.map(l=>l.ms?l.ms.m:null),s.lessons.map(l=>l.name),{size:200,maxw:200,maxc:mc,fs:9,rings:[50,100]})}
 </div>`;}).join('');
 spiderHtml=`<div class="card"><h2><span class="dot"></span>تسلط من — نمودار عنکبوری: ${SNAME[sel.sid]}</h2>
 <div style="margin:2px 0 10px;display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
 ${spiderSVG(sel.lessons.map(l=>l.ms?l.ms.m:null),sel.lessons.map(l=>l.name),{size:430,maxw:430,maxc})}
 <div class="muted" style="margin-top:4px">هر محور = یک مبحث؛ مرکز = ۰٪ و لبه = ۱۰۰٪. دایرهٔ توخالی = ارزیابی‌نشده.</div>
 <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:12px">${mini}</div></div>`;
 }
 }
 const bodies=`
 ${srvBars}
 ${viewPicker('تحلیل عملکرد')}
 ${!h.length?`<div class="notice">${dispPid()===curPid()&&cur().role==='student'?'هنوز در هیچ آزمونی شرکت نکرده‌اید — از «آزمون‌های من» وارد شوید.':'هنوز داده‌ای نیست.'} برای دیدن قدرت تحلیل: <button class="btn sm" data-act="demo"> بارگذاری دادهٔ نمایشی</button></div>`:''}
 ${_page('تحلیل عملکرد','الگوها، روند و مباحث بحرانی',`
 <div class="metrics">
 ${_metric('b','آزمون برگزارشده',fa(h.length),'')}
 ${_metric('g','میانگین درصد',avg!=null?fa(avg)+'٪':'—','')}
 ${_metric('o','بحرانی‌ترین مبحث',weak.length?LNAME[weak[0].lid]:'—','')}
 </div>
 ${spiderHtml}
 <div class="card"><h2><span class="dot"></span>تسلط بر مباحث</h2>
 ${spiderHtml?`<details style="margin-bottom:8px"><summary class="muted" style="cursor:pointer">نمای فهرستی (نوارهای خطی) — ${fa(testedRows.length)} مبحث</summary><div style="margin-top:8px">${bars}</div></details>`:(bars||'<div class="muted">هنوز مبحثی ارزیابی نشده است.</div>')}
 ${untestedHtml}
 <div class="muted">وزن‌دهی: ۵۵٪ آخرین عملکرد + ۴۵٪ میانگین.</div></div>
 ${h.length>=2?`<div class="card"><h2><span class="dot"></span>روند درصد آزمون‌ها</h2>${svg}</div>`:''}
 ${weak.length?`<div class="card"><h2><span class="dot"></span> مباحث بحرانی این هفته</h2>
 ${weak.map(w=>`<div class="task"><b>${LNAME[w.lid]}</b><span class="t-meta">تسلط ${fa(w.ms.m)}٪ <span class="stars">${w.ms.n>1?'●':'○'}</span></span></div>`).join('')}
 ${cur().role==='teacher'?`<button class="btn" data-act="weakexam" style="margin-top:6px"> تولید آزمون برای این مباحث</button>`:'<span class="muted">این مباحث در «برنامهٔ هفته» اولویت می‌گیرند.</span>'}</div>`:''}`)}`;
 return bodies;
}

/* ---------- Plan ---------- */
function vPlan(){
 if(api.on&&api.role==='student'&&SRV.plan){
 const days=Object.entries(SRV.plan);
 const body=`
 <div class="notice ok"> این برنامه را <b>بک‌اند واقعی</b> با الگوریتم (ضعف × ضریب × فراموشی) ساخته است.</div>
 ${days.map(([day,tasks])=>`<div class="daycard"><h3><span class="dnum">${brodaNum(day)}</span>${day}</h3>
 ${tasks.length?tasks.map(t=>`<div class="task">${t.topic}<span class="t-meta">${fa(t.mins)} دقیقه <span class="stars">${''.repeat(t.stars)}</span></span></div>`).join(''):'<span class="muted">—</span>'}</div>`).join('')}
 <button class="btn ghost" onclick="printPlan()"> چاپ برنامه</button>`;
 return _page('برنامهٔ هفته','برنامهٔ تطبیقی بر اساس ضعف و ضرایب',body);
 }
 const P=buildPlan();
 const body=`
 ${viewPicker('برنامهٔ هفته')}
 <div class="notice">برنامه بر اساس <b>تسلط فعلی</b>، <b>ضرایب دروس</b> و <b>فاصله از آخرین تمرین</b> (فراموشی) ساخته می‌شود و بعد از هر آزمون بازطراحی می‌گردد.</div>
 ${P.notes.map(n=>`<div class="muted" style="margin-bottom:6px"> ${n}</div>`).join('')}
 ${P.days.map(d=>{const dn=[0,1,2,3,4,5,6]['شنبه یکشنبه دوشنبه سه‌شنبه چهارشنبه پنجشنبه جمعه'.split(' ').indexOf(d.day)];return `<div class="daycard"><h3><span class="dnum">${dn!=null?fa(dn+1):''}</span>${d.day}</h3>
 ${d.tasks.length?d.tasks.map(t=>`<div class="task"><span>${t.txt}</span><span class="t-meta">${t.meta} <span class="stars">${t.star}</span></span></div>`).join(''):'<span class="muted">—</span>'}</div>`;}).join('')}
 <button class="btn ghost" onclick="printPlan()"> چاپ برنامه</button>`;
 return _page('برنامهٔ هفته','روزبه‌روز — اولویت با ضعف × ضریب × فراموشی',body);
}
function brodaNum(day){const m={'شنبه':1,'یکشنبه':2,'دوشنبه':3,'سه‌شنبه':4,'چهارشنبه':5,'پنجشنبه':6,'جمعه':7};return m[day]?fa(m[day]):'';}

/* ---------- About ---------- */
function vAbout(){
 const body=`
 <div class="card"><h2><span class="dot"></span>این نمونه چیست؟</h2>
 <p style="color:var(--ink-2);line-height:1.9">نسخهٔ قابل‌لمس <b>فاز ۰/۱ نقشهٔ راه TA</b>: آزمون‌ساز هوشمند ← تصحیح خودکار با فرمول رسمی کنکور (هر ۳ غلط = −۱ صحیح) ← نمودار تسلط به تفکیک مبحث ← برنامهٔ مطالعاتی تطبیقی.</p>
 <h3>آنچه واقعی است</h3>
 <ul style="line-height:2.1;color:var(--ink-2);font-size:14px">
 <li> پوشش کامل <b>شش پایهٔ مدرسه</b>: <b>${fa(allLessons().length)} مبحث</b> از ${fa(SUBJECTS.length)} درس — از هفتم/هشتم/نهم تا دهم/یازدهم/دوازدهمِ کنکوری</li>
 <li>${fa(BANK.filter(q=>q.type!=='tashrihi').length)} سؤال تستی تأییدشده + ${fa(BANK.filter(q=>q.type==='tashrihi').length)} تشریحی + ${fa(TEMPLATES.length)} قالب تولید هوشمند</li>
 <li>صف تأیید معلم برای سؤال‌های تولیدی (قانون Gate A)</li>
 <li> سه پنل مجزا: مدیر · معلم · دانش‌آموز</li>
 <li> هر معلم فقط از مباحث درس خودش آزمون می‌سازد</li>
 <li>⏳ مهلت شرکت + یک بار شرکت</li>
 <li> سؤال دستی تستی و تشریحی با واژه‌های کلیدی</li>
 <li> بانک سؤال تشریحی <b>امتحان نهایی</b> و <b>هماهنگ هفتم تا نهم</b></li>
 <li> سؤال واقعی کنکور سراسری + واردکردن گروهی</li>
 <li> مخاطب کلاس — هر آزمون فقط برای کلاس‌های مشخص</li>
 <li> چاپ برگهٔ A4 + پاسخ‌برگ حبابی + کلید محرمانه</li>
 <li> داشبورد کلاس: نقشهٔ حرارتی + تحلیل روان‌سنجی</li>
 <li>تسلط، روند، مباحث بحرانی، برنامهٔ هفته و نمودار عنکبوری </li>
 </ul>
 <h3>در نسخهٔ واقعی</h3>
 <ul style="line-height:2;color:var(--ink-2);font-size:14px">
 <li>تولید سؤال ← مدل زبانی خودمیزبان (vLLM) + RAG روی کتاب درسی</li>
 <li>تطبیق کلیدواژه ← تصحیح LLM با روبریک معلم</li>
 <li>ورود دستی ← اسکن OpenCV</li>
 <li>حافظهٔ محلی ← پایگاه‌دادهٔ PostgreSQL</li>
 </ul></div>
 ${vConnect()}`;
 return _page('راهنما','دربارهٔ سامانه و مسیر محصول',body);
}

/* ---------- Connect (server) ---------- */
function vConnect(){
 if(api.on)return `<div class="notice ok"> متصل به سرور واقعی <b>${api.url}</b> — ${api.name}
 · <button class="btn ghost sm" data-act="srvrf">↻ به‌روزرسانی</button>
 · <button class="btn dng sm" data-act="srvdisc">قطع اتصال</button></div>`;
 return `<div class="card"><h2><span class="dot"></span>اتصال به بک‌اند واقعی (FastAPI)</h2>
 <div class="card-hint">اگر <span class="kbd">uvicorn hooshyar_backend:app</span> را اجرا کرده‌اید، نمونه به موتور واقعی وصل می‌شود. دمو: معلم <span class="kbd">t1</span> · دانش‌آموز <span class="kbd">s0</span>…<span class="kbd">s4</span></div>
 <div class="scanrow" style="flex-wrap:nowrap;max-width:560px">
 <input id="srvurl" style="direction:ltr;flex:1" placeholder="http://localhost:8000" value="${api.url}">
 <input id="srvuid" style="width:80px;direction:ltr" placeholder="t1" value="${api.uid||'t1'}">
 <button class="btn" data-act="srvconn">اتصال</button></div>
 ${SRV.err?`<div class="kw n" style="margin-top:6px;display:block">اتصال ناموفق: ${SRV.err} — حالت آفلاین فعال است.</div>`:''}</div>`;
}

/* ---------- vManual (paper score entry) ---------- */
function vManual(eid){
 const pub=state.published.find(p=>p.id===eid);
 if(!pub)return '';
 const res=state.pubResults[eid]||{};
 const rows=studentIds().filter(pid=>canSeeExam(pub,pid)).map((pid,i)=>{
 const A=ACCOUNTS[pid];const ex=res[pid];
 let cell,badge;
 if(ex&&!ex.manual){cell=`<b style="color:${mcolor(ex.pct)}">${fa(ex.pct)}٪</b>`;badge='<span class="badge dl"> آنلاین — قفل</span>';}
 else if(ex&&ex.manual){cell=`<input id="mu-${pid}" type="number" min="-33" max="100" style="width:84px" value="${ex.pct}">`;badge='<span class="badge ai"> دستی (قابل ویرایش)</span>';}
 else{cell=`<input id="mu-${pid}" type="number" min="-33" max="100" style="width:84px" placeholder="—">`;badge='<span class="muted">کاغذی</span>';}
 return `<tr><td>${fa(i+1)}</td><td>${A.name}</td><td>${A.cls}</td><td>${cell}</td><td>${badge}</td></tr>`;}).join('');
 return `<div class="card"><h2><span class="dot"></span>ورود دستی نمرات کاغذی — ${pub.title}</h2>
 <div class="card-hint">برای دانش‌آموزانی که با برگهٔ چاپی امتحان داده‌اند، درصد نهایی (−۳۳ تا ۱۰۰) را بنویسید و ثبت کنید. خالی = غایب از کاغذی.</div>
 <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>دانش‌آموز</th><th>کلاس</th><th>درصد</th><th>وضعیت</th></tr></thead><tbody>${rows}</tbody></table></div>
 <div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">
 <button class="btn" data-act="mansave" data-id="${eid}"> ثبت نمرات</button>
 <button class="btn ghost" data-act="printpub" data-id="${eid}"> چاپ برگه</button>
 <button class="btn ghost" data-act="mancancel">بازگشت</button></div></div>`;
}

/* ---------- Custom question + nahayi bank + drafts (teacher) ---------- */
function vCustomQ(){
 const subs=myTeacherSubs();
 const opts=SUBJECTS.filter(s=>!subs||subs.includes(s.id)).map(s=>s.lessons.map(l=>`<option value="${l.id}">${s.name} • ${l.name}</option>`).join('')).join('');
 return `<div class="card"><h2><span class="dot"></span> سؤال دستی بسازید</h2>
 <div class="card-hint">فقط از مباحث <b>${(subs||[]).map(s=>SNAME[s]).join('، ')||'درس شما'}</b> می‌توانید سؤال بسازید. چون تأییدکنندهٔ خودتان هستید، مستقیم وارد آزمون می‌شود.</div>
 <div class="notice ok" style="margin-bottom:12px"><b> آزمون تشریحی چطور نمره می‌گیرد؟</b><br>سؤال را می‌نویسید و <b>واژه‌های مهم پاسخ</b> را مشخص می‌کنید (مثلاً آئورت، مویرگ، دهلیز). دانش‌آموز با زبان خودش جواب می‌دهد — همان واژه‌ها را در متن می‌گردد. جمع وزن‌ها همیشه ۱۰۰ است و بعد از آزمون نمره قابل اصلاح است.</div>
 <div class="grid2">
 <div>
 <div class="field"><label>مبحث</label><select id="cqL">${opts}</select></div>
 <div class="field"><label>نوع سؤال</label>
 <select id="cqType" onchange="var t=this.value==='tashrihi';document.getElementById('cqMcq').style.display=t?'none':'block';document.getElementById('cqTash').style.display=t?'block':'none'">
 <option value="mcq">🅰 تستی چهارگزینه‌ای</option><option value="tashrihi"> تشریحی (نمره با واژه‌های کلیدی)</option></select></div>
 <div class="field"><label>دشواری</label>
 <select id="cqD">${[1,2,3,4,5].map(n=>`<option ${n===2?'selected':''} value="${n}">${'●'.repeat(n)}${'○'.repeat(5-n)}</option>`).join('')}</select></div>
 <div class="field"><label>متن سؤال</label><textarea id="cqQ" class="tarea" style="min-height:70px" placeholder="مثلاً: مسیر خون از بطن چپ تا بازگشت به قلب را بنویسید."></textarea></div>
 </div>
 <div>
 <div id="cqMcq">
 <div class="field"><label>گزینه‌ها (دایرهٔ کنار گزینهٔ صحیح را بزنید)</label>
 ${['الف','ب','ج','د'].map((L,i)=>`<div class="scanrow" style="flex-wrap:nowrap"><input type="radio" name="cqA" id="cqA${i}" ${i===0?'checked':''}> <b>${L})</b> <input id="cqO${i}" style="flex:1" placeholder="متن گزینهٔ ${L}"></div>`).join('')}</div>
 </div>
 <div id="cqTash" style="display:none">
 <div class="field"><label>واژه‌های مهم پاسخ <span class="hint">(دانش‌آموز این را نمی‌بیند)</span></label>
 <div id="cqKwBox" style="min-height:34px;margin:4px 0;padding:6px;border:1.5px dashed var(--line-2);border-radius:10px;background:var(--surface-2)"><span class="muted" id="cqKwHint">هنوز واژه‌ای اضافه نشده</span></div>
 <div class="scanrow" style="flex-wrap:wrap">
 <input id="cqKwNew" style="flex:1;min-width:130px" placeholder="مثلاً آئورت" onkeydown="if(event.key==='Enter'){event.preventDefault();document.querySelector('[data-act=cqkwadd]').click();}">
 <input id="cqKwW" type="number" min="1" max="100" placeholder="امتیاز" style="width:84px">
 <button type="button" class="btn ghost sm" data-act="cqkwadd">＋ افزودن واژه</button>
 </div>
 <div class="hint" style="margin-top:6px">یا یک‌جا: <code>آئورت:۴۰، مویرگ:۳۰، دهلیز:۳۰</code></div>
 <input id="cqK" style="width:100%;margin-top:4px" placeholder="آئورت:۳۰، مویرگ:۲۵، سیاهرگ، دهلیز">
 </div>
 <div class="field"><label>پاسخ الگو (اختیاری)</label><textarea id="cqM" class="tarea" style="min-height:56px" placeholder="پاسخ کامل مورد انتظار..."></textarea></div>
 </div>
 </div>
 </div>
 <button class="btn" data-act="cqadd"> افزودن به سبد آزمون</button></div>

 <div class="card"><h2><span class="dot"></span> واردکردن گروهی سؤال</h2>
 <div class="card-hint">هر خط یک سؤال با جداکنندهٔ <code>*</code>: <code>متن سؤال * گزینه۱ * گزینه۲ * گزینه۳ * گزینه۴ * شمارهٔ صحیح</code>. خطوط ناقص رد و گزارش می‌شوند.</div>
 <div class="field"><label>مبحث</label><select id="bqL">${opts}</select></div>
 <textarea id="bqTxt" class="tarea" style="min-height:100px" placeholder="کدام باز دوحلقه‌ای است؟ * آدنین * گوانین * تیمین * یوراسیل * 2&#10;واحد پایهٔ DNA چه نام دارد؟ * نوکلئوتید * آمینواسید * قند * اسید چرب * 1"></textarea>
 <button class="btn" data-act="bqadd" style="margin-top:8px"> واردکردن به سبد</button></div>`;
}
function vNahayiBank(){
 const subs=myTeacherSubs();
 const pool=BANK.filter(q=>q.type==='tashrihi'&&(!subs||subs.includes(q.s))).sort((a,b)=>(b.n?1:0)-(a.n?1:0)||(b.y||0)-(a.y||0));
 if(!pool.length)return '';
 const inB=new Set((state.draftQs||[]).map(q=>q.id));
 const nah=pool.filter(q=>q.n).length;
 const midN=pool.filter(q=>q.n&&/^(olum|riazi|mot)[789]$/.test(q.s||'')).length;
 return `<div class="card"><h2><span class="dot"></span>بانک سؤال تشریحی — نهایی و هماهنگ (${fa(pool.length)} سؤال · ${fa(nah)} برگزارشده${midN?` · ${fa(midN)} هفتم تا نهم`:''})</h2>
 <div class="card-hint">بانک سؤال‌های برگزارشده با پاسخ الگو و واژه‌های کلیدی. «افزودن» را بزنید و سپس «ساخت آزمون تشریحی فقط از سؤال‌های من».</div>
 <div style="max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:8px">
 ${pool.map(q=>`<div class="scanrow" style="justify-content:space-between;align-items:flex-start;gap:8px;padding:8px 4px;border-bottom:1px dashed var(--line)">
 <span style="flex:1">${q.n?`<span class="badge ai"> نهایی${q.y?' '+fa(q.y):''}</span>`:'<span class="badge bk">تالیفی</span>'}
 <b>${LNAME[q.l]||q.l}</b> — ${fa((q.q||'').slice(0,110))}${(q.q||'').length>110?'…':''}
 <div style="margin-top:4px">${(q.kw||[]).map(k=>`<span class="kw y"> ${k[0]}</span>`).join('')}</div></span>
 ${inB.has(q.id)?'<span class="badge bk"> در سبد</span>':`<button class="btn ghost sm" style="flex:none" data-act="nahadd" data-id="${q.id}"> افزودن</button>`}
 </div>`).join('')}
 </div></div>`;
}
function vDrafts(){
 const subs=myTeacherSubs();
 const ds=(state.draftQs||[]).filter(q=>!subs||subs.includes(LSUB[q.l]));
 if(!ds.length)return '';
 const nTash=ds.filter(q=>q.type==='tashrihi').length;
 return `<div class="card"><h2><span class="dot"></span> سؤال‌های دستی در سبد آزمون (${fa(ds.length)})</h2>
 ${ds.map((q,i)=>`<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--line)">
 <div class="scanrow" style="justify-content:space-between">
 <span>${fa(i+1)}. ${q.type==='tashrihi'?(q.n?' '+nahLabel(q):' تشریحی'):'🅰 تستی'} · <b>${LNAME[q.l]}</b> — <span class="muted">${fa(q.q.slice(0,70))}${q.q.length>70?'…':''}</span></span>
 <button class="btn dng sm" data-act="cqdel" data-id="${q.id}">حذف</button></div>
 ${q.type==='tashrihi'&&q.kw?`<div style="margin-top:4px">${q.kw.map(k=>`<span class="kw y"> ${k[0]} <b>+${fa(k[1])}</b></span>`).join('')}</div>`:''}
 </div>`).join('')}
 ${nTash?`<div class="notice ok"> ${fa(nTash)} سؤال تشریحی با واژه‌های کلیدی آماده است.
 <div style="margin-top:8px"><button class="btn" data-act="fromtash"> ساخت آزمون تشریحی فقط از سؤال‌های من</button></div></div>`:''}
 <div class="muted">با زدن « تولید آزمون» این سؤال‌ها خودکار اضافه می‌شوند و پس از «انتشار» سبد خالی می‌گردد.</div></div>`;
}

/* ---------- vEssayReview ---------- */
function vEssayReview(eid){
 const pub=state.published.find(p=>p.id===eid);
 if(!pub)return '<div class="card">آزمون پیدا نشد. <button class="btn ghost" data-act="essaycancel">بازگشت</button></div>';
 const res=state.pubResults[eid]||{};
 const tashQs=pub.qs.map((q,i)=>({q,i})).filter(x=>x.q.type==='tashrihi');
 const rows=studentIds().filter(pid=>canSeeExam(pub,pid)).map(pid=>{
 const A=ACCOUNTS[pid];const rec=res[pid];
 if(!rec)return `<div class="scanrow" style="opacity:.5">${A.name}<span class="muted">شرکت نکرده</span></div>`;
 const items=rec.tash&&rec.tash.length?rec.tash:tashQs.map(x=>({i:x.i,q:x.q.q,l:x.q.l,kw:x.q.kw,score:null,text:null}));
 const body=items.map((t,gi)=>{
 const fin=t.final!=null?t.final:t.score;
 const chips=(t.hits||(t.kw||[]).map(k=>({kw:k[0],w:k[1],ok:null}))).map(h=>`<span class="kw ${h.ok===true?'y':h.ok===false?'n':''}">${h.ok===true?'':h.ok===false?'':''} ${h.kw} (+${fa(h.w)})</span>`).join('');
 return `<div style="border:1px solid var(--line);border-radius:12px;padding:12px;margin:9px 0;background:var(--surface)">
 <b>${fa((t.i!=null?t.i:gi)+1)}. ${fa(t.q||'')}</b>
 <div class="muted" style="margin:6px 0">پاسخ دانش‌آموز: «${t.text!=null?String(t.text).replace(/</g,'&lt;')||'— خالی —':'<i>ذخیره نشده</i>'}»</div>
 <div>${chips||'<span class="muted">واژهٔ کلیدی ثبت نشده</span>'}</div>
 <div class="muted">${t.why||''}</div>
 <div class="scanrow" style="margin-top:6px"> نمره: <b style="color:${fin==null?'inherit':mcolor(fin)}">${fin==null?'—':fa(fin)}</b>/۱۰۰
 <input id="tr-${pid}-${gi}" type="number" min="0" max="100" value="${fin==null?'':fin}" style="width:80px" title="اصلاح نمره">
 ${rec.tash?`<button class="btn ghost sm" data-act="tashsave" data-id="${eid}" data-pid="${pid}"> ثبت</button>`:''}</div></div>`;}).join('');
 return `<div class="card" style="box-shadow:none;border-style:dashed"><h3>${A.name} · ${A.cls||''} · درصد کل: <b style="color:${mcolor(rec.pct)}">${fa(rec.pct)}٪</b></h3>${body}</div>`;}).join('');
 return `<div class="card"><h2><span class="dot"></span>بازبینی پاسخ‌های تشریحی — ${pub.title}</h2>
 <div class="card-hint"> واژه‌های کلیدی شما را در متن دانش‌آموز گشته (/). نمره = جمع وزن واژه‌های یافت‌شده. هر نمره را می‌توانید عوض کنید.</div>
 <button class="btn ghost" data-act="essaycancel">← بازگشت</button></div>
 ${rows}`;
}

/* ---------- vPubsSrv + vClassSrv (server) ---------- */
function vPubsSrv(){
 const pubs=SRV.pubs;
 if(!pubs)return `<div class="card"><h2><span class="dot"></span>آزمون‌های سرور</h2>${SRV.busy?'<div class="muted">در حال دریافت از سرور...</div>':SRV.err?`<div class="kw n">${SRV.err}</div>`:'<div class="muted">—</div>'}</div>`;
 if(!pubs.length)return `<div class="card"><h2><span class="dot"></span>آزمون‌های سرور</h2><div class="muted">معلم هنوز روی سرور آزمونی منتشر نکرده است.</div></div>`;
 const rows=pubs.map(p=>`<div class="exam-row">
 <div class="e-main"><span class="e-title">${p.title}</span><span class="e-meta">${fa(p.exam_size||p.qs_count||'')} سؤال</span></div>
 <div class="e-actions">${p.my_pct!=null?`<span class="badge srv">${fa(p.my_pct)}٪</span>`:''}<button class="btn" data-act="takesrv" data-id="${p.exam_id}">شرکت در آزمون</button></div></div>`).join('');
 return `<div class="card"><h2><span class="dot"></span>آزمون‌های منتشرشده (سرور واقعی)</h2>${rows}</div>`;
}
function vClassSrv(){
 if(!api.on||api.role!=='teacher')return '';
 if(!SRV.heatmap)return `<div class="card"><h2><span class="dot"></span>دادهٔ سرور</h2><div class="muted">${SRV.busy?'در حال دریافت...':SRV.err||'—'}</div></div>`;
 const lids=[...new Set(SRV.heatmap.flatMap(r=>Object.keys(r.per_lesson)))];
 const rows=SRV.heatmap.map(r=>{
 const cells=lids.map(l=>{
 const v=r.per_lesson[l];
 return `<td class="hc" style="${v==null?'background:var(--surface-2);color:var(--ink-3)':'background:'+mcolor(v.m)+'1F;color:'+mcolor(v.m)}">${v==null?'–':fa(v.m)}</td>`;}).join('');
 return `<tr><td class="rn">${r.student}</td>${cells}<td class="hc" style="background:var(--surface-2)"><b>${r.avg==null?'–':fa(r.avg)}</b></td></tr>`;}).join('');
 const res=(SRV.results||[]).slice(0,12).map(x=>`<span class="kw y">${x.name} · ${x.title}: ${fa(Math.round(x.pct*100)/100)}٪</span>`).join(' ');
 return `<div class="card"><h2><span class="dot"></span>نقشهٔ حرارتی واقعی — از پایگاه‌دادهٔ سرور</h2>
 ${lids.length?`<div class="tbl-wrap"><table class="ht"><tr><th style="text-align:right">دانش‌آموز</th>${lids.map(l=>`<th title="${LNAME[l]||l}">${(LNAME[l]||l).slice(0,10)}</th>`).join('')}<th>میانگین</th></tr>${rows}</table></div>`
 :'<div class="muted">هنوز نتیجهٔ واقعی‌ای روی سرور نیست.</div>'}
 ${res?`<div style="margin-top:8px"><b>آخرین نتایج:</b><br>${res}</div>`:''}</div>`;
}

/* ensure the engine's public API still exposes the SHELL-compatible helpers the
 legacy tests check by string matching (e.g. html.includes) — no-op re-export */
if (typeof window !== 'undefined') {
 window.__taOverlay = true;
}