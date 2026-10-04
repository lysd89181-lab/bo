// ملفي — لوحة الأدمن
import {
  db, $, $$, esc, money, num, fmtDate, toInput, fromInput, addMonths, daysLeft, tsMs, ago, leftText, DAY,
  waLink, icon, RIDGE, toast, modal, confirmBox, busy, empty, requireUser, shell, animate,
  collection, doc, onSnapshot, writeBatch, setDoc, updateDoc, deleteDoc, Timestamp, serverTimestamp
} from './core.js';

const S = { users: [], requests: [], plans: [], platform: {}, loaded: new Set(), started: false, f: { mq: '', mst: 'all', rst: 'pending' } };
const NEED = 4;
const monthsTxt = m => m === 1 ? 'شهر' : m === 2 ? 'شهرين' : m <= 10 ? `${m} أشهر` : `${m} شهر`;
const exp = u => tsMs(u.planExpiresAt);
const mState = u => u.role === 'admin' ? 'admin' : !u.isActive ? 'off' : exp(u) > Date.now() ? 'on' : 'expired';
const ST = { on: ['ok', 'نشط'], off: ['off', 'موقوف'], expired: ['bad', 'منتهي'], admin: ['info', 'أدمن'] };
const merchants = () => S.users.filter(u => u.role !== 'admin');
const pendingReqs = () => S.requests.filter(r => r.status === 'pending');

/* ================= التشغيل ================= */
const { profile } = await requireUser();
if (profile.role !== 'admin') { location.replace('app.html'); await new Promise(() => {}); }
const NAV = [
  { id: 'home', icon: 'home', label: 'نظرة عامة' },
  { id: 'merchants', icon: 'users', label: 'التجار' },
  { id: 'requests', icon: 'inbox', label: 'طلبات الاشتراك' },
  { id: 'plans', icon: 'card', label: 'خطط الاشتراك' },
  { id: 'settings', icon: 'sliders', label: 'الإعدادات العامة' }
];
const UI = shell({ nav: NAV, name: profile.displayName || profile.email, sub: 'مدير المنصة', searchPh: 'ابحث عن تاجر بالاسم أو الإيميل…', bellHref: '#requests',
  extra: `<a class="btn ghost sm" style="margin-top:14px" href="app.html">${icon('box')} لوحة التاجر</a>` });
const view = UI.view;
view.innerHTML = `<div class="empty" style="padding-top:18vh"><p>جاري التحميل…</p></div>`;

let raf = 0;
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render(false)); };
const arrived = k => { S.loaded.add(k); if (!S.started && S.loaded.size >= NEED) { S.started = true; render(true); } else if (S.started) schedule(); };
const onErr = e => { console.error(e); toast('تعذر تحميل البيانات. تأكد إن حسابك أدمن والقواعد منشورة.', 'bad'); };
const ids = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
onSnapshot(collection(db, 'users'), s => { S.users = ids(s); arrived('users'); }, onErr);
onSnapshot(collection(db, 'subscriptionRequests'), s => { S.requests = ids(s).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)); arrived('requests'); }, onErr);
onSnapshot(collection(db, 'plans'), s => { S.plans = ids(s).sort((a, b) => a.months - b.months); arrived('plans'); }, onErr);
onSnapshot(doc(db, 'settings', 'platform'), s => { S.platform = s.exists() ? s.data() : {}; arrived('platform'); }, onErr);
window.addEventListener('hashchange', () => S.started && render(true));

const VIEWS = { home: vHome, merchants: vMerchants, requests: vRequests, plans: vPlans, settings: vSettings };
function render(fresh) {
  let r = (location.hash || '#home').slice(1);
  if (!VIEWS[r]) r = 'home';
  UI.setActive(r); VIEWS[r]();
  if (fresh) { animate(view); window.scrollTo(0, 0); } else view.classList.remove('anim');
  const p = pendingReqs().length; UI.setBadge('requests', p); UI.setBell(p);
}

/* ================= نظرة عامة ================= */
function vHome() {
  const ms = merchants(), active = ms.filter(u => mState(u) === 'on');
  const approved = S.requests.filter(r => r.status === 'approved');
  const revenue = approved.reduce((a, r) => a + num(r.price), 0);
  const now = new Date();
  const monthStart = i => new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
  const thisM = approved.filter(r => tsMs(r.reviewedAt || r.createdAt) >= monthStart(0)).reduce((a, r) => a + num(r.price), 0);
  const newThisM = ms.filter(u => tsMs(u.createdAt) >= monthStart(0)).length;
  const soon = active.filter(u => daysLeft(exp(u)) <= 5).sort((a, b) => exp(a) - exp(b));

  // آخر 6 أشهر
  const months = Array.from({ length: 6 }, (_, i) => 5 - i).map(i => ({ a: monthStart(i), b: monthStart(i - 1), label: new Date(monthStart(i)).toLocaleDateString('ar-LY', { month: 'short' }) }));
  const rev = months.map(m => approved.filter(r => { const t = tsMs(r.reviewedAt || r.createdAt); return t >= m.a && t < m.b; }).reduce((a, r) => a + num(r.price), 0));
  const reg = months.map(m => ms.filter(u => { const t = tsMs(u.createdAt); return t >= m.a && t < m.b; }).length);

  const feed = [
    ...ms.map(u => ({ t: tsMs(u.createdAt), ic: 'user', tone: 'info', txt: `${esc(u.displayName || u.email)} سجّل كتاجر جديد` })),
    ...S.requests.map(r => ({ t: tsMs(r.reviewedAt || r.createdAt), ic: r.status === 'approved' ? 'check' : r.status === 'rejected' ? 'x' : 'inbox', tone: r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn',
      txt: r.status === 'pending' ? `${esc(r.merchantName)} طلب اشتراك ${esc(r.planName)}` : r.status === 'approved' ? `تم تفعيل ${esc(r.merchantName)} (${esc(r.planName)})` : `تم رفض طلب ${esc(r.merchantName)}` }))
  ].filter(x => x.t).sort((a, b) => b.t - a.t).slice(0, 8);

  view.innerHTML = `
  <div class="dash">
    <aside class="dash-side" style="display:flex;flex-direction:column;gap:22px">
      <div class="card rv">
        <div class="chead"><div><h2>طلبات تنتظرك</h2><p>فعّل التجار بعد التأكد من الدفع</p></div><a class="link" href="#requests">الكل</a></div>
        <div class="rems">${pendingReqs().length ? pendingReqs().slice(0, 5).map(reqCard).join('') : empty('inbox', 'ما فيش طلبات جديدة.')}</div>
      </div>
      <div class="card rv">
        <div class="chead"><div><h2>اشتراكات تنتهي قريب</h2><p>خلال 5 أيام</p></div></div>
        <div class="rems">${soon.length ? soon.map(u => `<div class="rem soon rv" style="grid-template-columns:auto 1fr auto"><span class="dot"></span><div><b>${esc(u.displayName)}</b><span class="when">${leftText(exp(u))}</span></div>${u.phone ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink(u.phone, `مرحباً ${u.displayName}، اشتراكك في ملفي ينتهي في ${fmtDate(exp(u))}. تبي تجدد؟`)}">${icon('wa')}</a>` : ''}</div>`).join('') : empty('clock', 'ما فيش اشتراكات قريبة الانتهاء.')}</div>
      </div>
    </aside>
    <div class="dash-main">
      <section class="hero rv">${RIDGE}<h1>لوحة إدارة ملفي</h1><p class="muted">${newThisM} تاجر جديد هذا الشهر، ${pendingReqs().length ? `و${pendingReqs().length} طلب ينتظر التفعيل` : 'وما فيش طلبات تنتظر التفعيل'}.</p></section>
      <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <div class="stat a rv"><div class="lbl"><span>إيرادات المنصة</span>${icon('coins')}</div><div class="val">${money(revenue)}</div><span class="delta"><b>${money(thisM)}</b> هذا الشهر</span></div>
        <div class="stat t rv"><div class="lbl"><span>التجار النشطين</span>${icon('pulse')}</div><div class="val">${active.length}</div><span class="delta">من أصل ${ms.length} تاجر</span></div>
        <div class="stat b rv"><div class="lbl"><span>إجمالي التجار</span>${icon('users')}</div><div class="val">${ms.length}</div><span class="delta"><b>+${newThisM}</b> هذا الشهر</span></div>
      </div>
      <section class="card glow rv">
        <div class="chead"><div><h2>نمو المنصة</h2><p>الإيرادات وتسجيلات التجار، آخر 6 أشهر</p></div>
          <div class="row small"><span style="color:var(--amber2)">━ الإيرادات</span><span style="color:#5EEAD4">● تسجيلات</span></div></div>
        ${lineChart(months.map(m => m.label), rev, reg)}
      </section>
      <section class="card rv">
        <div class="chead"><div><h2>آخر النشاطات</h2></div></div>
        ${feed.length ? `<div class="rems">${feed.map(x => `<div class="rem" style="grid-template-columns:auto 1fr auto"><span class="badge icon ${x.tone}" style="padding:0 8px">${icon(x.ic)}</span><div><b style="font-weight:500;font-size:14px">${x.txt}</b></div><small class="dim">${ago(x.t)}</small></div>`).join('')}</div>` : empty('pulse', 'ما فيش نشاط للحين.')}
      </section>
    </div>
  </div>`;
}
function lineChart(labels, rev, reg) {
  const W = 640, H = 230, pl = 14, pr = 14, pt = 20, pb = 34;
  const maxR = Math.max(1, ...rev), maxG = Math.max(1, ...reg);
  const x = i => W - pr - i * (W - pl - pr) / (labels.length - 1); // RTL: الأقدم على اليمين
  const yR = v => pt + (1 - v / maxR) * (H - pt - pb);
  const yG = v => pt + (1 - v / maxG) * (H - pt - pb);
  const path = rev.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yR(v)}`).join(' ');
  const area = `${path} L${x(labels.length - 1)},${H - pb} L${x(0)},${H - pb} Z`;
  const gpath = reg.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yG(v)}`).join(' ');
  return `<svg class="linechart" viewBox="0 0 ${W} ${H}" role="img" aria-label="مخطط نمو المنصة">
    <defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F59E0B" stop-opacity=".35"/><stop offset="1" stop-color="#F59E0B" stop-opacity="0"/></linearGradient></defs>
    ${[0, .25, .5, .75, 1].map(f => `<line x1="${pl}" x2="${W - pr}" y1="${pt + f * (H - pt - pb)}" y2="${pt + f * (H - pt - pb)}" stroke="rgba(148,163,184,.1)"/>`).join('')}
    <path d="${area}" fill="url(#ar)"/>
    <path d="${path}" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${gpath}" fill="none" stroke="#2BB3A8" stroke-width="1.6" stroke-dasharray="5 5"/>
    ${rev.map((v, i) => `<circle cx="${x(i)}" cy="${yR(v)}" r="4.5" fill="#FCD34D"><title>${labels[i]}: ${money(v)}</title></circle><circle cx="${x(i)}" cy="${yG(reg[i])}" r="3.5" fill="#2BB3A8"><title>${labels[i]}: ${reg[i]} تاجر</title></circle>
      <text x="${x(i)}" y="${H - 10}" fill="#64748B" font-size="12" text-anchor="middle" font-family="IBM Plex Sans Arabic">${labels[i]}</text>`).join('')}
  </svg>`;
}
function reqCard(r) {
  return `<div class="rem soon rv" style="grid-template-columns:1fr auto">
    <div><b>${esc(r.merchantName || r.merchantEmail)}</b><span class="when">${esc(r.planName)}، ${money(r.price)}</span>
      <small>${esc(r.method || '')}${r.reference ? '، رقم العملية: ' : ''}<span class="ltr">${esc(r.reference || '')}</span></small>
      ${r.note ? `<small>${esc(r.note)}</small>` : ''}<small>${tsMs(r.createdAt) ? ago(tsMs(r.createdAt)) : ''}</small></div>
    <div class="acts"><button class="btn teal sm" data-act="approve" data-id="${r.id}">${icon('check')} تفعيل</button><button class="btn red sm" data-act="reject" data-id="${r.id}">رفض</button></div></div>`;
}

/* ================= التجار ================= */
function vMerchants() {
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>إدارة التجار</h1><p>تفعيل، إيقاف، وتمديد الاشتراكات</p></div></div>
  <div class="toolbar rv">
    <input class="inp grow" id="mq" type="search" placeholder="ابحث بالاسم، الإيميل، أو الرقم…" value="${esc(S.f.mq)}">
    <div class="chips">${[['all', 'الكل'], ['on', 'نشط'], ['expired', 'منتهي'], ['off', 'موقوف']].map(([k, l]) => `<button class="chip ${S.f.mst === k ? 'on' : ''}" data-act="mst" data-id="${k}">${l}</button>`).join('')}</div>
  </div>
  <div class="card rv" style="padding:0;overflow:hidden" id="mlist"></div>`;
  const draw = () => {
    const q = S.f.mq.trim().toLowerCase();
    const list = merchants().filter(u => (S.f.mst === 'all' || mState(u) === S.f.mst) && (!q || [u.displayName, u.email, u.phone].some(v => String(v || '').toLowerCase().includes(q))))
      .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    $('#mlist').innerHTML = list.length ? `<div class="tbl" style="border:0;border-radius:0"><table style="min-width:820px"><thead><tr><th>التاجر</th><th>البريد الإلكتروني</th><th>واتساب</th><th>الخطة</th><th>ينتهي في</th><th>الحالة</th><th>مفعّل</th><th></th></tr></thead><tbody>
      ${list.map(u => { const st = mState(u); return `<tr>
        <td><b>${esc(u.displayName || '—')}</b><br><small class="dim">${tsMs(u.createdAt) ? 'سجّل ' + fmtDate(tsMs(u.createdAt)) : ''}</small></td>
        <td class="ltr">${esc(u.email)}</td><td class="ltr">${esc(u.phone || '—')}</td>
        <td>${u.plan?.name ? `<span class="tag">${esc(u.plan.name)}</span>` : '<span class="dim">—</span>'}</td>
        <td class="num">${exp(u) ? fmtDate(exp(u)) : '—'}</td>
        <td><span class="badge ${ST[st][0]}">${ST[st][1]}</span></td>
        <td><label class="toggle"><input type="checkbox" data-toggle="${u.id}" ${u.isActive ? 'checked' : ''} aria-label="تفعيل ${esc(u.displayName)}"><span></span></label></td>
        <td><div class="row" style="flex-wrap:nowrap"><button class="btn ghost sm" data-act="extend" data-id="${u.id}">${icon('clock')} تمديد</button>${u.phone ? `<a class="iconbtn sm" target="_blank" rel="noopener" href="${waLink(u.phone, '')}" aria-label="واتساب">${icon('wa')}</a>` : ''}</div></td></tr>`; }).join('')}
    </tbody></table></div>` : empty('users', 'ما فيش تجار يطابقوا البحث.');
    $$('[data-toggle]').forEach(t => t.onchange = async () => {
      const u = S.users.find(x => x.id === t.dataset.toggle);
      try { await updateDoc(doc(db, 'users', u.id), { isActive: t.checked }); toast(t.checked ? `تم تفعيل ${u.displayName}` : `تم إيقاف ${u.displayName}`); }
      catch (e) { t.checked = !t.checked; toast(e.message, 'bad'); }
    });
  };
  $('#mq').oninput = e => { S.f.mq = e.target.value; draw(); };
  draw();
}
function extend(u) {
  const base = Math.max(Date.now(), exp(u) || 0);
  const m = modal(`تمديد اشتراك ${esc(u.displayName)}`, `
    <div class="summary"><div><span>الانتهاء الحالي</span><b>${exp(u) ? fmtDate(exp(u)) : 'غير مشترك'}</b></div></div>
    <div class="field"><label>الخطة</label><select id="exPlan"><option value="">تمديد يدوي</option>${S.plans.map(p => `<option value="${p.id}">${esc(p.name)} (${monthsTxt(p.months)})</option>`).join('')}</select></div>
    <div class="chips" style="margin-bottom:14px">${[1, 2, 3, 6, 12].map(n => `<button type="button" class="chip" data-mm="${n}">+${monthsTxt(n)}</button>`).join('')}</div>
    <div class="field"><label>ينتهي في</label><input id="exDate" type="date" value="${toInput(addMonths(base, 1))}"></div>
    <div class="mfoot"><button class="btn amber" id="exGo">${icon('check')} حفظ وتفعيل</button>${exp(u) ? `<button class="btn red" id="exStop">إنهاء الاشتراك</button>` : ''}</div>`);
  $$('[data-mm]', m.el).forEach(b => b.onclick = () => { $('#exDate', m.el).value = toInput(addMonths(base, +b.dataset.mm)); });
  $('#exPlan', m.el).onchange = e => { const p = S.plans.find(x => x.id === e.target.value); if (p) $('#exDate', m.el).value = toInput(addMonths(base, p.months)); };
  $('#exGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const end = fromInput($('#exDate', m.el).value) + DAY - 1;
    if (end <= Date.now()) throw new Error('التاريخ لازم يكون في المستقبل.');
    const p = S.plans.find(x => x.id === $('#exPlan', m.el).value);
    await updateDoc(doc(db, 'users', u.id), { isActive: true, planExpiresAt: Timestamp.fromMillis(end), plan: p ? { id: p.id, name: p.name, months: p.months } : (u.plan || { name: 'يدوي' }) });
    m.close(); toast('تم التمديد');
  });
  $('#exStop', m.el) && ($('#exStop', m.el).onclick = e => busy(e.currentTarget, async () => {
    await updateDoc(doc(db, 'users', u.id), { planExpiresAt: Timestamp.fromMillis(Date.now() - 1000) }); m.close(); toast('تم إنهاء الاشتراك');
  }));
}

/* ================= الطلبات ================= */
function vRequests() {
  const list = S.requests.filter(r => S.f.rst === 'all' || r.status === S.f.rst);
  const STS = { pending: ['warn', 'قيد المراجعة'], approved: ['ok', 'تم التفعيل'], rejected: ['bad', 'مرفوض'] };
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>طلبات الاشتراك</h1><p>راجع الدفع وفعّل التاجر بضغطة</p></div></div>
  <div class="toolbar rv"><div class="chips">${[['pending', `قيد المراجعة (${pendingReqs().length})`], ['approved', 'المفعّلة'], ['rejected', 'المرفوضة'], ['all', 'الكل']].map(([k, l]) => `<button class="chip ${S.f.rst === k ? 'on' : ''}" data-act="rst" data-id="${k}">${l}</button>`).join('')}</div></div>
  <div class="card rv" style="padding:0;overflow:hidden">${list.length ? `<div class="tbl" style="border:0;border-radius:0"><table style="min-width:860px"><thead><tr><th>التاجر</th><th>الخطة</th><th>المبلغ</th><th>طريقة الدفع</th><th>رقم العملية</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${list.map(r => `<tr><td><b>${esc(r.merchantName)}</b><br><small class="dim ltr">${esc(r.merchantEmail)}</small></td><td>${esc(r.planName)}</td><td class="num"><span class="price">${money(r.price)}</span></td>
      <td>${esc(r.method || '—')}</td><td class="ltr">${esc(r.reference || '—')}${r.note ? `<br><small class="dim">${esc(r.note)}</small>` : ''}</td><td class="num">${tsMs(r.createdAt) ? fmtDate(tsMs(r.createdAt)) : '—'}</td>
      <td><span class="badge ${STS[r.status]?.[0] || 'off'}">${STS[r.status]?.[1] || r.status}</span>${r.adminNote ? `<br><small class="dim">${esc(r.adminNote)}</small>` : ''}</td>
      <td>${r.status === 'pending' ? `<div class="row" style="flex-wrap:nowrap"><button class="btn teal sm" data-act="approve" data-id="${r.id}">${icon('check')} تفعيل</button><button class="btn red sm" data-act="reject" data-id="${r.id}">رفض</button></div>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : empty('inbox', 'ما فيش طلبات هنا.')}</div>`;
}
async function approve(r) {
  const u = S.users.find(x => x.id === r.merchantId);
  if (!u) { toast('حساب التاجر مش موجود', 'bad'); return; }
  const base = Math.max(Date.now(), exp(u) || 0), end = addMonths(base, r.months || 1);
  if (!await confirmBox(`تفعيل ${esc(r.merchantName)} لمدة ${monthsTxt(r.months || 1)}، لين ${fmtDate(end)}؟<br>تأكد إن مبلغ ${money(r.price)} وصلك.`, { ok: 'تفعيل', title: 'تفعيل الاشتراك' })) return;
  try {
    const b = writeBatch(db);
    b.update(doc(db, 'subscriptionRequests', r.id), { status: 'approved', reviewedAt: serverTimestamp() });
    b.update(doc(db, 'users', u.id), { isActive: true, planExpiresAt: Timestamp.fromMillis(end), plan: { id: r.planId || '', name: r.planName, months: r.months || 1 } });
    await b.commit(); toast(`تم تفعيل ${r.merchantName}`);
  } catch (e) { toast(e.message, 'bad'); }
}
function reject(r) {
  const m = modal('رفض الطلب', `<p class="muted" style="margin-bottom:14px">طلب ${esc(r.merchantName)}: ${esc(r.planName)}، ${money(r.price)}</p>
    <div class="field"><label>سبب الرفض (يظهر للتاجر)</label><input id="rjNote" placeholder="مثلاً: المبلغ ما وصلش"></div>
    <div class="mfoot"><button class="btn red" id="rjGo">رفض الطلب</button></div>`);
  $('#rjGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    await updateDoc(doc(db, 'subscriptionRequests', r.id), { status: 'rejected', adminNote: $('#rjNote', m.el).value.trim(), reviewedAt: serverTimestamp() });
    m.close(); toast('تم رفض الطلب');
  });
}

/* ================= الخطط ================= */
function vPlans() {
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>خطط الاشتراك</h1><p>المدد والأسعار اللي يشوفها التاجر عند التفعيل</p></div>
    <button class="btn amber" data-act="planForm">${icon('plus')} إضافة خطة</button></div>
  ${S.plans.length ? `<div class="plans" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${S.plans.map(p => `
    <div class="plan card rv" style="cursor:default;${p.active === false ? 'opacity:.55' : ''}">
      <b>${esc(p.name)}</b><div class="pr">${money(p.price)}</div><small class="dim">${monthsTxt(p.months)}${p.active === false ? '، مخفية' : ''}</small>
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn ghost sm" data-act="planForm" data-id="${p.id}">${icon('edit')} تعديل</button><button class="iconbtn sm" data-act="planDel" data-id="${p.id}" aria-label="حذف">${icon('trash')}</button></div>
    </div>`).join('')}</div>` : `<div class="card rv">${empty('card', 'ما فيش خطط. أضف خطة باش التجار يقدروا يشتركوا.', `<button class="btn amber" data-act="planForm">${icon('plus')} إضافة خطة</button>`)}</div>`}`;
}
function planForm(p) {
  const ed = !!p;
  const m = modal(ed ? 'تعديل الخطة' : 'إضافة خطة', `
    <div class="field"><label>اسم الخطة</label><input id="plName" value="${esc(p?.name || '')}" placeholder="اشتراك شهر"></div>
    <div class="grid2 keep"><div class="field"><label>المدة بالأشهر</label><input id="plM" type="number" min="1" max="36" inputmode="numeric" dir="ltr" value="${p?.months || 1}"></div>
      <div class="field"><label>السعر</label><input id="plP" inputmode="decimal" dir="ltr" value="${p?.price ?? ''}"></div></div>
    <label class="row" style="margin-bottom:16px"><span class="toggle"><input type="checkbox" id="plA" ${p?.active === false ? '' : 'checked'}><span></span></span> ظاهرة للتجار</label>
    <div class="mfoot"><button class="btn amber" id="plGo">${icon('check')} حفظ</button></div>`);
  $('#plGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const d = { name: $('#plName', m.el).value.trim(), months: Math.floor(num($('#plM', m.el).value)), price: num($('#plP', m.el).value), active: $('#plA', m.el).checked };
    if (!d.name) throw new Error('اكتب اسم الخطة.');
    if (d.months < 1) throw new Error('المدة شهر على الأقل.');
    await setDoc(ed ? doc(db, 'plans', p.id) : doc(collection(db, 'plans')), d);
    m.close(); toast('تم حفظ الخطة');
  });
}

/* ================= الإعدادات العامة ================= */
function vSettings() {
  const pf = S.platform;
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>الإعدادات العامة</h1><p>التسجيل وطرق الدفع اللي تظهر للتجار</p></div></div>
  <section class="card glow rv" style="max-width:760px">
    <label class="row" style="margin-bottom:20px"><span class="toggle"><input type="checkbox" id="gsReg" ${pf.registrationOpen === false ? '' : 'checked'}><span></span></span><span><b>التسجيل مفتوح</b><br><small class="dim">لو قفلته، ما حد يقدر يسجّل كتاجر جديد</small></span></label>
    <div class="field"><label>تعليمات الدفع (تظهر للتاجر وقت الاشتراك)</label><textarea id="gsInfo" rows="6" placeholder="حوّل المبلغ على رقم ليبيانا 09XXXXXXXX&#10;أو تحويل مصرفي على الحساب...">${esc(pf.paymentInfo || '')}</textarea></div>
    <div class="field"><label>طرق الدفع (كل طريقة في سطر)</label><textarea id="gsMethods" rows="4" placeholder="ليبيانا&#10;المدار&#10;تحويل مصرفي&#10;USDT">${esc((pf.paymentMethods || []).join('\n'))}</textarea></div>
    <button class="btn amber" id="gsSave">حفظ الإعدادات</button>
  </section>`;
  $('#gsSave').onclick = e => busy(e.currentTarget, async () => {
    await setDoc(doc(db, 'settings', 'platform'), {
      registrationOpen: $('#gsReg').checked, paymentInfo: $('#gsInfo').value.trim(),
      paymentMethods: $('#gsMethods').value.split('\n').map(s => s.trim()).filter(Boolean)
    }, { merge: true });
    toast('تم حفظ الإعدادات');
  });
}

/* ================= الأحداث والبحث ================= */
const R = id => S.requests.find(r => r.id === id);
const ACTS = {
  approve: id => R(id) && approve(R(id)),
  reject: id => R(id) && reject(R(id)),
  extend: id => { const u = S.users.find(x => x.id === id); u && extend(u); },
  mst: id => { S.f.mst = id; vMerchants(); },
  rst: id => { S.f.rst = id; vRequests(); },
  planForm: id => planForm(S.plans.find(p => p.id === id)),
  planDel: async id => { const p = S.plans.find(x => x.id === id); if (p && await confirmBox(`حذف خطة "${esc(p.name)}"؟ التجار المشتركين فيها ما يتأثروش.`, { ok: 'حذف', danger: true })) deleteDoc(doc(db, 'plans', id)).then(() => toast('تم الحذف')).catch(e => toast(e.message, 'bad')); }
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || !ACTS[b.dataset.act]) return;
  e.preventDefault(); ACTS[b.dataset.act](b.dataset.id, b);
});
const q = $('#q'), sres = $('#sres');
q.addEventListener('input', () => {
  const t = q.value.trim().toLowerCase();
  if (!t) { sres.hidden = true; return; }
  const hits = merchants().filter(u => [u.displayName, u.email, u.phone].some(v => String(v || '').toLowerCase().includes(t))).slice(0, 6);
  sres.innerHTML = hits.map(u => `<a href="#" data-mid="${u.id}"><span>${esc(u.displayName)}</span><small class="ltr">${esc(u.email)}</small></a>`).join('') || '<div class="empty" style="padding:14px">ما فيش نتائج</div>';
  sres.hidden = false;
});
q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('a', sres)?.click(); } });
sres.addEventListener('click', e => {
  const a = e.target.closest('[data-mid]'); if (!a) return;
  e.preventDefault(); const u = S.users.find(x => x.id === a.dataset.mid);
  S.f.mq = u.email; S.f.mst = 'all'; sres.hidden = true; q.value = '';
  location.hash === '#merchants' ? render(true) : (location.hash = '#merchants');
});
document.addEventListener('click', e => { if (!e.target.closest('.search')) sres.hidden = true; });
