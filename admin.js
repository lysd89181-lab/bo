// ملفي — لوحة الأدمن
import {
  db, $, $$, esc, money, num, fmtDate, toInput, fromInput, addMonths, daysLeft, tsMs, ago, leftText, DAY,
  waLink, icon, RIDGE, toast, skeleton, startOfDay, modal, confirmBox, busy, empty, requireUser, shell, animate, safeImg, compressImage, isEN, t, moneyIn, planPrices, CURS, monthsTxt, bannerHref,
  collection, doc, onSnapshot, writeBatch, setDoc, updateDoc, deleteDoc, getDocs, Timestamp, serverTimestamp
} from './core.js';

const S = { range: 'month', rFrom: '', rTo: '', users: [], requests: [], plans: [], platform: {}, methods: [], banners: [], loaded: new Set(), started: false, f: { mq: '', mst: 'all', rst: 'pending' } };
const NEED = 6;
// مبلغ الطلب بعملته (الطلبات القديمة بدون عملة)
const rMoney = r => r.currency ? moneyIn(r.price, r.currency) : money(r.price);
// مجموع حسب العملة: «120 د.ل + 300 ر.س»
const sumByCur = list => { const o = {}; list.forEach(r => { const c = r.currency || 'LYD'; o[c] = (o[c] || 0) + num(r.price); }); const parts = Object.keys(CURS).filter(c => o[c]).map(c => moneyIn(o[c], c)); return parts.length ? parts.join(' + ') : moneyIn(0, 'LYD'); };
const exp = u => tsMs(u.planExpiresAt);
const mState = u => u.role === 'admin' ? 'admin' : u.status === 'deleted' ? 'deleted' : !u.isActive ? 'off' : exp(u) <= Date.now() ? 'expired' : daysLeft(exp(u)) <= 5 ? 'soon' : 'on';
const ST = { on: ['ok', 'نشط'], soon: ['warn', 'قرب ينتهي'], off: ['off', 'موقوف'], expired: ['bad', 'منتهي'], admin: ['info', 'أدمن'], deleted: ['off', 'محذوف'] };
const merchants = () => S.users.filter(u => u.role !== 'admin' && u.status !== 'deleted');
const allMerchants = () => S.users.filter(u => u.role !== 'admin');
const pendingReqs = () => S.requests.filter(r => r.status === 'pending');

/* ================= التشغيل ================= */
const { profile } = await requireUser();
if (profile.role !== 'admin') { location.replace('app.html'); await new Promise(() => {}); }
const NAV = [
  { id: 'home', icon: 'home', label: 'نظرة عامة' },
  { id: 'merchants', icon: 'users', label: 'التجار' },
  { id: 'requests', icon: 'inbox', label: 'طلبات الاشتراك' },
  { id: 'plans', icon: 'card', label: 'خطط الاشتراك' },
  { id: 'banners', icon: 'globe', label: 'البنرات' },
  { id: 'settings', icon: 'sliders', label: 'الإعدادات العامة' }
];
const UI = shell({ nav: NAV, name: profile.displayName || profile.email, sub: 'مدير المنصة', searchPh: 'ابحث عن تاجر بالاسم أو الإيميل…', bellHref: '#requests',
  extra: `<a class="btn ghost sm" style="margin-top:14px" href="app.html">${icon('box')} لوحة التاجر</a>` });
const view = UI.view;
view.innerHTML = `<div class="card" style="margin-bottom:16px">${skeleton(3)}</div><div class="card">${skeleton(5)}</div>`;

let raf = 0;
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render(false)); };
const arrived = k => { S.loaded.add(k); if (!S.started && S.loaded.size >= NEED) { S.started = true; render(true); } else if (S.started) schedule(); };
const onErr = e => { console.error(e); toast('تعذر تحميل البيانات. تأكد إن حسابك أدمن والقواعد منشورة.', 'bad'); };
const ids = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
onSnapshot(collection(db, 'users'), s => { S.users = ids(s); arrived('users'); }, onErr);
onSnapshot(collection(db, 'subscriptionRequests'), s => { S.requests = ids(s).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)); arrived('requests'); }, onErr);
onSnapshot(collection(db, 'plans'), s => { S.plans = ids(s).sort((a, b) => a.months - b.months); arrived('plans'); }, onErr);
onSnapshot(doc(db, 'settings', 'platform'), s => { S.platform = s.exists() ? s.data() : {}; arrived('platform'); }, onErr);
onSnapshot(collection(db, 'banners'), s => { S.banners = ids(s).sort((a, b) => (a.order || 0) - (b.order || 0)); arrived('banners'); }, onErr);
onSnapshot(collection(db, 'paymentMethods'), s => { S.methods = ids(s).sort((a, b) => (a.order || 0) - (b.order || 0)); arrived('methods'); }, onErr);
window.addEventListener('hashchange', () => S.started && render(true));

const VIEWS = { home: vHome, merchants: vMerchants, requests: vRequests, plans: vPlans, banners: vBanners, settings: vSettings };
function render(fresh) {
  let r = (location.hash || '#home').slice(1);
  if (!VIEWS[r]) r = 'home';
  UI.setActive(r); VIEWS[r](); if (r === 'home') bindRange();
  if (fresh) { animate(view); window.scrollTo(0, 0); } else view.classList.remove('anim');
  const p = pendingReqs().length; UI.setBadge('requests', p);
  UI.setBell(p, p ? pendingReqs().slice(0, 5).map(r => `<a class="bellitem soon" href="#requests"><b data-raw>${esc(r.merchantName || r.merchantEmail)}</b><small>${esc(r.planName)} · ${rMoney(r)}</small></a>`).join('') : `<p class="muted small" style="padding:12px">${t('ما فيش طلبات جديدة.')}</p>`);
}

/* ================= نظرة عامة ================= */
function vHome() {
  const ms = merchants(), active = ms.filter(u => ['on', 'soon'].includes(mState(u)));
  const approved = S.requests.filter(r => r.status === 'approved');
  const revenue = sumByCur(approved);
  const now = new Date();
  const monthStart = i => new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
  // فلتر الفترة
  const [ra, rb] = rangeBounds();
  const inR = x => x >= ra && x < rb;
  const thisM = sumByCur(approved.filter(r => inR(tsMs(r.reviewedAt || r.createdAt))));
  const newThisM = ms.filter(u => inR(tsMs(u.createdAt))).length;
  const expiredN = ms.filter(u => mState(u) === 'expired').length;
  const soon = active.filter(u => daysLeft(exp(u)) <= 5).sort((a, b) => exp(a) - exp(b));

  // آخر 6 أشهر
  const months = Array.from({ length: 6 }, (_, i) => 5 - i).map(i => ({ a: monthStart(i), b: monthStart(i - 1), label: new Date(monthStart(i)).toLocaleDateString(isEN ? 'en-US' : 'ar-LY', { month: 'short' }) }));
  const rev = months.map(m => approved.filter(r => { const x = tsMs(r.reviewedAt || r.createdAt); return x >= m.a && x < m.b; }).length);
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
      <div class="pagehead rv" style="margin-bottom:0"><div><h1>لوحة إدارة ملفي</h1></div></div>
      <div class="row rv">
        <div class="chips scrollx">${[['today', 'اليوم'], ['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['custom', 'مخصص']].map(([k, l]) => `<button class="chip ${S.range === k ? 'on' : ''}" data-act="range" data-id="${k}">${l}</button>`).join('')}</div>
        ${S.range === 'custom' ? `<div class="row"><input class="inp" style="width:auto" type="date" id="rFrom" value="${S.rFrom}" aria-label="من"><input class="inp" style="width:auto" type="date" id="rTo" value="${S.rTo}" aria-label="إلى"></div>` : ''}
      </div>
      <div class="kpis rv">
        <div class="kpi"><small>إيرادات الفترة</small><b>${thisM}</b><span class="dim small">${t('الإجمالي')}: ${revenue}</span></div>
        <div class="kpi"><small>تجار جدد</small><b class="num">${newThisM}</b></div>
        <div class="kpi"><small>التجار النشطين</small><b class="num t-ok">${active.length}</b><span class="dim small">${t('من أصل')} ${ms.length}</span></div>
        <div class="kpi"><small>اشتراكات منتهية</small><b class="num t-bad">${expiredN}</b></div>
      </div>
      <section class="card rv">
        <div class="chead"><div><h2>نمو المنصة</h2><p>التفعيلات وتسجيلات التجار، آخر 6 أشهر</p></div>
          <div class="row small"><span style="color:var(--amber-t)">━ تفعيلات</span><span class="t-ok">● تسجيلات</span></div></div>
        ${lineChart(months.map(m => m.label), rev, reg)}
      </section>
      <section class="card rv">
        <div class="chead"><div><h2>آخر النشاطات</h2></div></div>
        ${feed.length ? `<div class="rems">${feed.map(x => `<div class="rem" style="grid-template-columns:auto 1fr auto"><span class="badge icon ${x.tone}" style="padding:0 8px">${icon(x.ic)}</span><div><b style="font-weight:500;font-size:14px">${x.txt}</b></div><small class="dim">${ago(x.t)}</small></div>`).join('')}</div>` : empty('pulse', 'ما فيش نشاط للحين.')}
      </section>
    </div>
  </div>`;
}
function rangeBounds() {
  const today = startOfDay();
  if (S.range === 'today') return [today, Infinity];
  if (S.range === 'week') return [today - 6 * DAY, Infinity];
  if (S.range === 'custom') return [fromInput(S.rFrom) || 0, S.rTo ? fromInput(S.rTo) + DAY : Infinity];
  const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), Infinity];
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
    ${rev.map((v, i) => `<circle cx="${x(i)}" cy="${yR(v)}" r="4.5" fill="#FCD34D"><title>${labels[i]}: ${v}</title></circle><circle cx="${x(i)}" cy="${yG(reg[i])}" r="3.5" fill="#2BB3A8"><title>${labels[i]}: ${reg[i]} تاجر</title></circle>
      <text x="${x(i)}" y="${H - 10}" fill="#64748B" font-size="12" text-anchor="middle" font-family="IBM Plex Sans Arabic">${labels[i]}</text>`).join('')}
  </svg>`;
}
function reqCard(r) {
  return `<div class="rem soon rv" style="grid-template-columns:1fr auto">
    <div><b>${esc(r.merchantName || r.merchantEmail)}</b><span class="when">${esc(r.planName)}، ${rMoney(r)}</span>
      <small>${esc(r.method || '')}${r.reference ? `، ${esc(r.refLabel || 'رقم العملية')}: ` : ''}<span dir="auto">${esc(r.reference || '')}</span></small>
      ${r.note ? `<small>${esc(r.note)}</small>` : ''}<small>${tsMs(r.createdAt) ? ago(tsMs(r.createdAt)) : ''}</small></div>
    <div class="acts"><button class="btn teal sm" data-act="approve" data-id="${r.id}">${icon('check')} تفعيل</button><button class="btn red sm" data-act="reject" data-id="${r.id}">رفض</button></div></div>`;
}

function bindRange() {
  ['rFrom', 'rTo'].forEach(k => { const el = $('#' + k); if (el) el.onchange = () => { S[k] = el.value; vHome(); bindRange(); }; });
}
/* ================= التجار ================= */
function vMerchants() {
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>إدارة التجار</h1><p>تفعيل، إيقاف، وتمديد الاشتراكات</p></div></div>
  <div class="toolbar rv">
    <input class="inp grow" id="mq" type="search" placeholder="ابحث بالاسم، الإيميل، أو الرقم…" value="${esc(S.f.mq)}">
    <div class="chips">${[['all', 'الكل'], ['on', 'نشط'], ['expired', 'منتهي'], ['off', 'موقوف'], ['deleted', 'محذوف']].map(([k, l]) => `<button class="chip ${S.f.mst === k ? 'on' : ''}" data-act="mst" data-id="${k}">${l}</button>`).join('')}</div>
  </div>
  <div class="card rv" style="padding:0;overflow:hidden" id="mlist"></div>`;
  const draw = () => {
    const q = S.f.mq.trim().toLowerCase();
    const list = (S.f.mst === 'deleted' ? allMerchants() : merchants()).filter(u => (S.f.mst === 'all' || mState(u) === S.f.mst || (S.f.mst === 'on' && mState(u) === 'soon')) && (!q || [u.displayName, u.email, u.phone].some(v => String(v || '').toLowerCase().includes(q))))
      .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    $('#mlist').innerHTML = list.length ? `<div class="tbl" style="border:0;border-radius:0"><table style="min-width:820px"><thead><tr><th>التاجر</th><th>البريد الإلكتروني</th><th>واتساب</th><th>الخطة</th><th>ينتهي في</th><th>الحالة</th><th>مفعّل</th><th></th></tr></thead><tbody>
      ${list.map(u => { const st = mState(u); return `<tr>
        <td><b>${esc(u.displayName || '—')}</b><br><small class="dim">${tsMs(u.createdAt) ? 'سجّل ' + fmtDate(tsMs(u.createdAt)) : ''}</small></td>
        <td class="ltr">${esc(u.email)}</td><td class="ltr">${esc(u.phone || '—')}</td>
        <td>${u.plan?.name ? `<span class="tag">${esc(u.plan.name)}</span>` : '<span class="dim">—</span>'}</td>
        <td class="num">${exp(u) ? fmtDate(exp(u)) : '—'}</td>
        <td><span class="badge ${ST[st][0]}">${ST[st][1]}</span></td>
        <td>${st === 'deleted' ? '' : `<label class="toggle"><input type="checkbox" data-toggle="${u.id}" ${u.isActive ? 'checked' : ''} aria-label="تفعيل ${esc(u.displayName)}"><span></span></label>`}</td>
        <td>${st === 'deleted' ? '' : `<div class="row" style="flex-wrap:nowrap"><button class="btn ghost sm" data-act="extend" data-id="${u.id}">${icon('clock')} تمديد</button>${u.phone ? `<a class="iconbtn sm" target="_blank" rel="noopener" href="${waLink(u.phone, '')}" aria-label="واتساب">${icon('wa')}</a>` : ''}<button class="iconbtn sm" data-act="delMerchant" data-id="${u.id}" aria-label="حذف التاجر">${icon('trash')}</button></div>`}</td></tr>`; }).join('')}
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

// حذف التاجر: يمسح كل بياناته ويعلّم حسابه محذوف (ما يقدرش يرجع يدخل)
const MER_COLS = ['products', 'files', 'codes', 'numbers', 'customers', 'sales', 'settings'];
async function delMerchant(u) {
  const m = modal(t('حذف التاجر'), `
    <p style="margin-bottom:10px">${t('بيتمسح كل شي يخص')} <b data-raw>${esc(u.displayName || u.email)}</b>: ${t('المنتجات، الملفات، الأكواد، الأرقام، العملاء، المبيعات، والقوالب.')}</p>
    <p class="t-bad" style="margin-bottom:14px"><b>${t('الحذف نهائي وما يرجعش.')}</b></p>
    <div class="field"><label>${t('للتأكيد اكتب إيميل التاجر')}</label><input id="dmConf" dir="ltr" placeholder="${esc(u.email)}" autocomplete="off"></div>
    <p class="hint" id="dmProg"></p>
    <div class="mfoot"><button class="btn red" id="dmGo" disabled>${icon('trash')} ${t('حذف نهائي')}</button><button class="btn ghost" data-x>${t('إلغاء')}</button></div>`);
  const btn = $('#dmGo', m.el);
  $('#dmConf', m.el).oninput = e => { btn.disabled = e.target.value.trim().toLowerCase() !== String(u.email).toLowerCase(); };
  btn.onclick = () => busy(btn, async () => {
    let n = 0;
    for (const c of MER_COLS) {
      const snap = await getDocs(collection(db, 'merchants', u.id, c));
      for (let i = 0; i < snap.docs.length; i += 450) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => b.delete(d.ref));
        await b.commit(); n += Math.min(450, snap.docs.length - i);
        $('#dmProg', m.el).textContent = `${t('تم حذف')} ${n}…`;
      }
    }
    await updateDoc(doc(db, 'users', u.id), { status: 'deleted', isActive: false, planExpiresAt: null, plan: null, deletedAt: serverTimestamp() });
    m.close(); toast(t('تم حذف التاجر'));
  });
}

/* ================= الطلبات ================= */
function vRequests() {
  const list = S.requests.filter(r => S.f.rst === 'all' || r.status === S.f.rst);
  const STS = { pending: ['warn', 'قيد المراجعة'], approved: ['ok', 'تم التفعيل'], rejected: ['bad', 'مرفوض'] };
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>طلبات الاشتراك</h1><p>راجع الدفع وفعّل التاجر بضغطة</p></div></div>
  <div class="toolbar rv"><div class="chips">${[['pending', `قيد المراجعة (${pendingReqs().length})`], ['approved', 'المفعّلة'], ['rejected', 'المرفوضة'], ['all', 'الكل']].map(([k, l]) => `<button class="chip ${S.f.rst === k ? 'on' : ''}" data-act="rst" data-id="${k}">${l}</button>`).join('')}</div></div>
  <div class="card rv" style="padding:0;overflow:hidden">${list.length ? `<div class="tbl" style="border:0;border-radius:0"><table style="min-width:860px"><thead><tr><th>التاجر</th><th>الخطة</th><th>المبلغ</th><th>طريقة الدفع</th><th>بيانات الدفع</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>
    ${list.map(r => `<tr><td><b>${esc(r.merchantName)}</b><br><small class="dim ltr">${esc(r.merchantEmail)}</small></td><td>${esc(r.planName)}</td><td class="num"><span class="price">${rMoney(r)}</span></td>
      <td>${esc(r.method || '—')}</td><td>${r.refLabel ? `<small class="dim">${esc(r.refLabel)}</small><br>` : ''}<span dir="auto">${esc(r.reference || '—')}</span>${r.note ? `<br><small class="dim">${esc(r.note)}</small>` : ''}</td><td class="num">${tsMs(r.createdAt) ? fmtDate(tsMs(r.createdAt)) : '—'}</td>
      <td><span class="badge ${STS[r.status]?.[0] || 'off'}">${STS[r.status]?.[1] || r.status}</span>${r.adminNote ? `<br><small class="dim">${esc(r.adminNote)}</small>` : ''}</td>
      <td>${r.status === 'pending' ? `<div class="row" style="flex-wrap:nowrap"><button class="btn teal sm" data-act="approve" data-id="${r.id}">${icon('check')} تفعيل</button><button class="btn red sm" data-act="reject" data-id="${r.id}">رفض</button></div>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : empty('inbox', 'ما فيش طلبات هنا.')}</div>`;
}
async function approve(r) {
  const u = S.users.find(x => x.id === r.merchantId);
  if (!u) { toast('حساب التاجر مش موجود', 'bad'); return; }
  // المدة والسعر من الخطة الأصلية، مش من الطلب (التاجر ما يقدرش يتلاعب)
  const plan = S.plans.find(p => p.id === r.planId);
  if (!plan) { toast('الخطة هذي محذوفة. فعّل التاجر يدوي من "تمديد".', 'bad'); return; }
  const base = Math.max(Date.now(), exp(u) || 0), end = addMonths(base, plan.months);
  const cur = r.currency || 'LYD', pp = planPrices(plan)[cur];
  const mismatch = pp == null || num(pp) !== num(r.price) ? `<br><b class="t-bad">${t('انتبه: سعر الطلب')} ${rMoney(r)} ${t('يختلف عن سعر الخطة الحالي')} ${pp == null ? '—' : moneyIn(pp, cur)}.</b>` : '';
  if (!await confirmBox(`${t('تفعيل')} <b>${esc(r.merchantName)}</b> ${t('على')} <b>${esc(plan.name)}</b> (${t(monthsTxt(plan.months))})${t('، لين')} ${fmtDate(end)}؟<br>${t('تأكد إن مبلغ')} ${rMoney(r)} ${t('وصلك.')}${mismatch}`, { ok: 'تفعيل', title: 'تفعيل الاشتراك' })) return;
  try {
    const b = writeBatch(db);
    b.update(doc(db, 'subscriptionRequests', r.id), { status: 'approved', reviewedAt: serverTimestamp() });
    b.update(doc(db, 'users', u.id), { isActive: true, planExpiresAt: Timestamp.fromMillis(end), plan: { id: plan.id, name: plan.name, months: plan.months } });
    await b.commit(); toast(`تم تفعيل ${r.merchantName}`);
  } catch (e) { toast(e.message, 'bad'); }
}
function reject(r) {
  const m = modal('رفض الطلب', `<p class="muted" style="margin-bottom:14px">طلب ${esc(r.merchantName)}: ${esc(r.planName)}، ${rMoney(r)}</p>
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
  ${S.plans.length ? `<div class="plans" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${S.plans.map(p => { const pr = planPrices(p); return `
    <div class="plan card rv" style="cursor:default;${p.active === false ? 'opacity:.55' : ''}">
      <b data-raw>${esc(p.name)}</b>${Object.keys(pr).map(c => `<div class="pr" style="font-size:24px">${moneyIn(pr[c], c)}</div>`).join('') || '<div class="pr">—</div>'}<small class="dim">${monthsTxt(p.months)}</small>${p.active === false ? ' <small class="dim">مخفية</small>' : ''}
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn ghost sm" data-act="planForm" data-id="${p.id}">${icon('edit')} تعديل</button><button class="iconbtn sm" data-act="planDel" data-id="${p.id}" aria-label="حذف">${icon('trash')}</button></div>
    </div>`; }).join('')}</div>` : `<div class="card rv">${empty('card', 'ما فيش خطط. أضف خطة باش التجار يقدروا يشتركوا.', `<button class="btn amber" data-act="planForm">${icon('plus')} إضافة خطة</button>`)}</div>`}`;
}
function planForm(p) {
  const ed = !!p, pr = planPrices(p);
  const m = modal(ed ? 'تعديل الخطة' : 'إضافة خطة', `
    <div class="field"><label>اسم الخطة</label><input id="plName" maxlength="60" value="${esc(p?.name || '')}"></div>
    <div class="field"><label>المدة بالأشهر</label><input id="plM" type="number" min="1" max="36" inputmode="numeric" dir="ltr" value="${p?.months || 1}"></div>
    <div class="grid3"><div class="field"><label>السعر بالدينار الليبي</label><input id="plLYD" inputmode="decimal" dir="ltr" value="${pr.LYD ?? ''}"></div>
      <div class="field"><label>السعر بالريال السعودي</label><input id="plSAR" inputmode="decimal" dir="ltr" value="${pr.SAR ?? ''}"></div>
      <div class="field"><label>السعر بـ USDT</label><input id="plUSDT" inputmode="decimal" dir="ltr" value="${pr.USDT ?? ''}"></div></div>
    <p class="hint" style="margin:-6px 0 14px">اتركه فاضي لو الخطة ما تتباعش بهذي العملة</p>
    <label class="row" style="margin-bottom:16px"><span class="toggle"><input type="checkbox" id="plA" ${p?.active === false ? '' : 'checked'}><span></span></span> ظاهرة للتجار</label>
    <div class="mfoot"><button class="btn amber" id="plGo">${icon('check')} حفظ</button></div>`);
  $('#plGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const prices = {};
    [['LYD', '#plLYD'], ['SAR', '#plSAR'], ['USDT', '#plUSDT']].forEach(([c, sel]) => { const v = $(sel, m.el).value.trim(); if (v !== '') prices[c] = num(v); });
    const d = { name: $('#plName', m.el).value.trim(), months: Math.floor(num($('#plM', m.el).value)), prices, active: $('#plA', m.el).checked };
    if (!d.name) throw new Error(t('اكتب اسم الخطة.'));
    if (d.months < 1) throw new Error(t('المدة شهر على الأقل.'));
    if (!Object.keys(prices).length || Object.values(prices).some(v => v <= 0)) throw new Error(t('حط سعر بعملة وحدة على الأقل.'));
    await setDoc(ed ? doc(db, 'plans', p.id) : doc(collection(db, 'plans')), d);
    m.close(); toast('تم حفظ الخطة');
  });
}

/* ================= البنرات ================= */
const LINK_TYPES = [['none', 'بدون رابط', ''], ['url', 'موقع', 'https://example.com'], ['tiktok', 'تيك توك', '@username'], ['facebook', 'فيسبوك', 'facebook.com/page'], ['whatsapp', 'رقم واتساب', '09XXXXXXXX']];
function vBanners() {
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>البنرات</h1><p>بنرات دعائية تظهر للتجار في لوحتهم</p></div>
    <button class="btn amber" data-act="bannerForm">${icon('plus')} إضافة بنر</button></div>
  ${S.banners.length ? `<div class="plist">${S.banners.map(b => { const href = bannerHref(b.linkType, b.linkValue); const lt = LINK_TYPES.find(x => x[0] === b.linkType) || LINK_TYPES[0]; return `
    <article class="card pcard rv" style="${b.active === false ? 'opacity:.55' : ''}">
      ${safeImg(b.image) ? `<img src="${safeImg(b.image)}" alt="" style="width:100%;border-radius:14px;display:block">` : ''}
      <div class="row"><span class="tag">${lt[1]}</span>${href ? `<a class="link ltr" href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%" data-raw>${esc(href)}</a>` : ''}${b.active === false ? '<span class="badge off">مخفية</span>' : ''}</div>
      <div class="row"><span class="spacer"></span><button class="btn ghost sm" data-act="bannerForm" data-id="${b.id}">${icon('edit')} تعديل</button><button class="iconbtn sm" data-act="bannerDel" data-id="${b.id}" aria-label="حذف">${icon('trash')}</button></div>
    </article>`; }).join('')}</div>` : `<div class="card rv">${empty('globe', 'ما فيش بنرات. أضف صورة ورابط يوديه للمكان اللي تبيه.', `<button class="btn amber" data-act="bannerForm">${icon('plus')} إضافة بنر</button>`)}</div>`}`;
}
function bannerForm(b) {
  const ed = !!b;
  let image = safeImg(b?.image), type = b?.linkType || 'none';
  const md = modal(ed ? 'تعديل البنر' : 'إضافة بنر', `
    <div class="field"><label>صورة البنر</label>
      <div id="bImgBox" style="border-radius:14px;overflow:hidden;border:1px dashed var(--line2);min-height:90px;display:grid;place-items:center;margin-bottom:8px">${image ? `<img src="${image}" alt="" style="width:100%;display:block">` : icon('globe')}</div>
      <div class="row"><label class="btn ghost sm" style="cursor:pointer">${icon('plus')} صورة<input type="file" id="bImg" accept="image/*" hidden></label><span class="hint">المقاس المناسب 1200×400 تقريباً</span></div></div>
    <div class="field"><label>لما يضغط عليه يمشي لـ</label><div class="chips" id="bTypes">${LINK_TYPES.map(([k, l]) => `<button type="button" class="chip ${k === type ? 'on' : ''}" data-lt="${k}">${l}</button>`).join('')}</div></div>
    <div class="field" id="bValBox" ${type === 'none' ? 'hidden' : ''}><label>الرابط أو الحساب</label><input id="bVal" dir="ltr" maxlength="300" value="${esc(b?.linkValue || '')}"><span class="hint ltr" id="bPrev" data-raw></span></div>
    <div class="grid2 keep"><div class="field"><label>الترتيب</label><input id="bOrder" type="number" inputmode="numeric" dir="ltr" value="${b?.order ?? S.banners.length + 1}"></div>
      <label class="row" style="margin-top:22px"><span class="toggle"><input type="checkbox" id="bActive" ${b?.active === false ? '' : 'checked'}><span></span></span> ظاهرة للتجار</label></div>
    <div class="mfoot"><button class="btn amber" id="bGo">${icon('check')} حفظ</button></div>`);
  const el = md.el;
  const prev = () => { const h = bannerHref(type, $('#bVal', el).value); $('#bPrev', el).textContent = h || ($('#bVal', el).value.trim() ? '✕' : ''); };
  const setType = k => { type = k; $$('[data-lt]', el).forEach(x => x.classList.toggle('on', x.dataset.lt === k)); $('#bValBox', el).hidden = k === 'none'; $('#bVal', el).placeholder = LINK_TYPES.find(x => x[0] === k)[2]; prev(); };
  $$('[data-lt]', el).forEach(x => x.onclick = () => setType(x.dataset.lt));
  $('#bVal', el).oninput = prev; setType(type);
  $('#bImg', el).onchange = async e => {
    try { image = await compressImage(e.target.files[0], 1200, 700000); $('#bImgBox', el).innerHTML = `<img src="${image}" alt="" style="width:100%;display:block">`; }
    catch (err) { toast(err.message, 'bad'); }
    e.target.value = '';
  };
  $('#bGo', el).onclick = e => busy(e.currentTarget, async () => {
    if (!image) throw new Error(t('اختار صورة البنر.'));
    const val = $('#bVal', el).value.trim();
    if (type !== 'none' && !bannerHref(type, val)) throw new Error(t('الرابط غير صحيح.'));
    const d = { image, linkType: type, linkValue: type === 'none' ? '' : val, order: Math.floor(num($('#bOrder', el).value)), active: $('#bActive', el).checked };
    await setDoc(ed ? doc(db, 'banners', b.id) : doc(collection(db, 'banners')), d);
    md.close(); toast('تم حفظ البنر');
  });
}

/* ================= الإعدادات العامة وطرق الدفع ================= */
const PRESETS = {
  bank: { name: 'تحويل مصرفي', inputLabel: 'رقم الإيصال أو اسم المحوّل', fields: ['اسم المصرف', 'اسم صاحب الحساب', 'رقم الحساب', 'رقم خدمة LY'] },
  libyana: { name: 'ليبيانا', inputLabel: 'رقم الهاتف اللي حوّلت منه', fields: ['رقم ليبيانا'] },
  madar: { name: 'المدار', inputLabel: 'رقم الهاتف اللي حوّلت منه', fields: ['رقم المدار'] },
  usdt: { name: 'USDT', inputLabel: 'رقم العملية (TxID)', fields: ['الشبكة', 'عنوان المحفظة'], currencies: ['USDT'] }
};
function vSettings() {
  const pf = S.platform;
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>الإعدادات العامة</h1><p>التسجيل وطرق الدفع اللي تظهر للتجار</p></div></div>
  <section class="card rv section" style="max-width:860px">
    <h2 style="margin-bottom:16px">التسجيل</h2>
    <label class="row" style="margin-bottom:18px"><span class="toggle"><input type="checkbox" id="gsReg" ${pf.registrationOpen === false ? '' : 'checked'}><span></span></span><span><b>التسجيل مفتوح</b><br><small class="dim">لو قفلته، ما حد يقدر يسجّل كتاجر جديد</small></span></label>
    <div class="field"><label>ملاحظة عامة فوق طرق الدفع (اختياري)</label><textarea id="gsInfo" rows="3" maxlength="600" placeholder="مثلاً: التفعيل خلال ساعة من التحويل">${esc(pf.paymentInfo || '')}</textarea></div>
    <button class="btn amber" id="gsSave">حفظ</button>
  </section>
  <section class="card glow rv" style="max-width:860px">
    <div class="chead"><div><h2>طرق الدفع</h2><p>التاجر يختار وحدة، وتطلعله تفاصيلها جاهزة للنسخ</p></div>
      <button class="btn amber sm" data-act="methodForm">${icon('plus')} إضافة طريقة</button></div>
    ${S.methods.length ? `<div class="rems">${S.methods.map(m => `
      <div class="rem" style="grid-template-columns:auto 1fr auto;${m.active === false ? 'opacity:.55' : ''}">
        ${safeImg(m.image) ? `<img src="${safeImg(m.image)}" alt="" style="width:52px;height:52px;border-radius:12px;object-fit:contain;background:#fff;padding:4px">` : `<span class="avatar">${icon('card')}</span>`}
        <div><b>${esc(m.name)}</b><small>${(m.fields || []).filter(f => f.value).length} حقل${m.active === false ? '، مخفية' : ''}</small></div>
        <div class="row" style="flex-wrap:nowrap"><button class="btn ghost sm" data-act="methodForm" data-id="${m.id}">${icon('edit')} تعديل</button><button class="iconbtn sm" data-act="methodDel" data-id="${m.id}" aria-label="حذف">${icon('trash')}</button></div>
      </div>`).join('')}</div>` : empty('card', 'ما فيش طرق دفع. أضف مصرف أو ليبيانا باش التاجر يعرف وين يحوّل.', `<button class="btn amber" data-act="methodForm">${icon('plus')} إضافة طريقة</button>`)}
  </section>`;
  $('#gsSave').onclick = e => busy(e.currentTarget, async () => {
    await setDoc(doc(db, 'settings', 'platform'), { registrationOpen: $('#gsReg').checked, paymentInfo: $('#gsInfo').value.trim() }, { merge: true });
    toast('تم الحفظ');
  });
}
function methodForm(m) {
  const ed = !!m;
  let image = safeImg(m?.image);
  const fieldRow = (f = {}) => `<div class="frow"><input class="inp" data-fl placeholder="اسم الحقل" maxlength="60" value="${esc(f.label || '')}"><input class="inp" data-fv placeholder="القيمة" maxlength="200" dir="auto" value="${esc(f.value || '')}"><button type="button" class="iconbtn sm" data-del aria-label="حذف الحقل">${icon('x')}</button></div>`;
  const md = modal(ed ? 'تعديل طريقة الدفع' : 'إضافة طريقة دفع', `
    ${ed ? '' : `<div class="field"><label>قالب جاهز</label><div class="chips">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="chip" data-preset="${k}">${p.name}</button>`).join('')}</div></div>`}
    <div class="imgpick"><span id="mImgBox">${image ? `<img src="${image}" alt="">` : `<span class="ph">${icon('card')}</span>`}</span>
      <div class="row"><label class="btn ghost sm" style="cursor:pointer">${icon('plus')} صورة<input type="file" id="mImg" accept="image/*" hidden></label><button type="button" class="btn ghost sm" id="mImgDel" ${image ? '' : 'hidden'}>إزالة</button></div></div>
    <div class="field"><label>اسم الطريقة</label><input id="mName" maxlength="60" value="${esc(m?.name || '')}" placeholder="مصرف الجمهورية"></div>
    <label class="small muted" style="display:block;margin-bottom:8px">التفاصيل اللي يشوفها التاجر (كل وحدة جنبها زر نسخ)</label>
    <div id="mFields">${(m?.fields?.length ? m.fields : [{}]).map(fieldRow).join('')}</div>
    <button type="button" class="btn ghost sm" id="mAddF" style="margin-bottom:16px">${icon('plus')} حقل جديد</button>
    <div class="field"><label>الحقل اللي يعبيه التاجر</label><input id="mInput" maxlength="80" value="${esc(m?.inputLabel || 'رقم العملية')}"></div>
    <div class="field"><label>ملاحظة تظهر تحت التفاصيل (اختياري)</label><input id="mNote" maxlength="300" value="${esc(m?.note || '')}"></div>
    <div class="field"><label>العملات</label><div class="chips">${Object.keys(CURS).map(c => `<button type="button" class="chip ${!m?.currencies?.length || m.currencies.includes(c) ? 'on' : ''}" data-mc="${c}">${CURS[c].name}</button>`).join('')}</div></div>
    <div class="grid2 keep"><div class="field"><label>الترتيب</label><input id="mOrder" type="number" inputmode="numeric" dir="ltr" value="${m?.order ?? S.methods.length + 1}"></div>
      <label class="row" style="margin-top:22px"><span class="toggle"><input type="checkbox" id="mActive" ${m?.active === false ? '' : 'checked'}><span></span></span> ظاهرة للتجار</label></div>
    <div class="mfoot"><button class="btn amber" id="mGo">${icon('check')} حفظ</button></div>`, { wide: true });
  const el = md.el;
  const setImg = v => { image = v; $('#mImgBox', el).innerHTML = v ? `<img src="${v}" alt="">` : `<span class="ph">${icon('card')}</span>`; $('#mImgDel', el).hidden = !v; };
  $('#mImg', el).onchange = async e => { try { setImg(await compressImage(e.target.files[0])); } catch (err) { toast(err.message, 'bad'); } e.target.value = ''; };
  $('#mImgDel', el).onclick = () => setImg('');
  $$('[data-mc]', el).forEach(x => x.onclick = () => x.classList.toggle('on'));
  $('#mAddF', el).onclick = () => $('#mFields', el).insertAdjacentHTML('beforeend', fieldRow());
  $('#mFields', el).addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (d) d.closest('.frow').remove(); });
  $$('[data-preset]', el).forEach(b => b.onclick = () => {
    const p = PRESETS[b.dataset.preset];
    $$('[data-preset]', el).forEach(x => x.classList.toggle('on', x === b));
    if (!$('#mName', el).value.trim() || Object.values(PRESETS).some(x => x.name === $('#mName', el).value.trim())) $('#mName', el).value = p.name;
    $('#mInput', el).value = p.inputLabel;
    $('#mFields', el).innerHTML = p.fields.map(l => fieldRow({ label: l })).join('');
    if (p.currencies) $$('[data-mc]', el).forEach(x => x.classList.toggle('on', p.currencies.includes(x.dataset.mc)));
  });
  $('#mGo', el).onclick = e => busy(e.currentTarget, async () => {
    const fields = $$('.frow', el).map(r => ({ label: $('[data-fl]', r).value.trim(), value: $('[data-fv]', r).value.trim() })).filter(f => f.label && f.value).slice(0, 12);
    const d = { name: $('#mName', el).value.trim(), image: image || '', fields, inputLabel: $('#mInput', el).value.trim() || 'رقم العملية', note: $('#mNote', el).value.trim(), currencies: $$('[data-mc].on', el).map(x => x.dataset.mc), order: Math.floor(num($('#mOrder', el).value)), active: $('#mActive', el).checked };
    if (!d.name) throw new Error(t('اكتب اسم الطريقة.'));
    if (!fields.length) throw new Error(t('عبّي حقل واحد على الأقل (الاسم والقيمة).'));
    if (!$$('[data-mc].on', el).length) throw new Error(t('اختار عملة وحدة على الأقل.'));
    await setDoc(ed ? doc(db, 'paymentMethods', m.id) : doc(collection(db, 'paymentMethods')), d);
    md.close(); toast('تم حفظ طريقة الدفع');
  });
}

/* ================= الأحداث والبحث ================= */
const R = id => S.requests.find(r => r.id === id);
const ACTS = {
  approve: id => R(id) && approve(R(id)),
  reject: id => R(id) && reject(R(id)),
  extend: id => { const u = S.users.find(x => x.id === id); u && extend(u); },
  delMerchant: id => { const u = S.users.find(x => x.id === id); u && delMerchant(u); },
  mst: id => { S.f.mst = id; vMerchants(); },
  range: id => { S.range = id; if (id === 'custom' && !S.rFrom) { S.rFrom = toInput(Date.now() - 30 * DAY); S.rTo = toInput(Date.now()); } vHome(); bindRange(); },
  rst: id => { S.f.rst = id; vRequests(); },
  planForm: id => planForm(S.plans.find(p => p.id === id)),
  bannerForm: id => bannerForm(S.banners.find(b => b.id === id)),
  bannerDel: async id => { if (await confirmBox(t('حذف البنر؟'), { ok: 'حذف', danger: true })) deleteDoc(doc(db, 'banners', id)).then(() => toast('تم الحذف')).catch(e => toast(e.message, 'bad')); },
  methodForm: id => methodForm(S.methods.find(m => m.id === id)),
  methodDel: async id => { const m = S.methods.find(x => x.id === id); if (m && await confirmBox(`حذف طريقة الدفع "${esc(m.name)}"؟`, { ok: 'حذف', danger: true })) deleteDoc(doc(db, 'paymentMethods', id)).then(() => toast('تم الحذف')).catch(e => toast(e.message, 'bad')); },
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
