// ملفي — لوحة التاجر
import {
  db, $, $$, esc, money, num, setCurrency, fmtDate, toInput, fromInput, startOfDay, addMonths, daysLeft,
  monthsCeil, tsMs, ago, leftText, DAY, normPhone, waLink, fill, copyText, icon, RIDGE, toast, modal,
  confirmBox, busy, empty, skeleton, fmtShort, requireUser, shell, animate, safeImg, isEN, t, moneyIn, planPrices, CURS, monthsTxt, bannerHref, auth, sendEmailVerification,
  collection, doc, onSnapshot, query, where, writeBatch, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp
} from './core.js';

/* ================= الحالة ================= */
const DEFAULT_TPL_EN = {
  account: 'Hi {name} 👋\nYour {product} subscription details:\n\n📧 Email: {email}\n🔑 Password: {password}\n👤 Profile: {file}\n📅 Ends on: {expiry_date}\n\nThanks for your trust 🌟',
  code: 'Hi {name} 👋\nYour {product} code:\n\n{code}\n\nThanks for your trust 🌟',
  number: 'Hi {name} 👋\nYour number ({country}):\n\n{number}\n\nThanks for your trust 🌟',
  reminder: 'Hi {name} 👋\nYour {product} subscription (profile {file}) ends on {expiry_date}.\nWould you like to renew?'
};
const DEFAULT_TPL_AR = {
  account: 'مرحباً {name} 👋\nتفاصيل اشتراكك في {product}:\n\n📧 الإيميل: {email}\n🔑 كلمة المرور: {password}\n👤 الملف: {file}\n📅 ينتهي في: {expiry_date}\n\nشكراً لثقتك 🌟',
  code: 'مرحباً {name} 👋\nكود {product} متاعك:\n\n{code}\n\nشكراً لثقتك 🌟',
  number: 'مرحباً {name} 👋\nرقمك ({country}):\n\n{number}\n\nشكراً لثقتك 🌟',
  reminder: 'مرحباً {name} 👋\nاشتراكك في {product} (الملف {file}) ينتهي في {expiry_date}.\nتبي تجدد؟'
};
const DEFAULT_TPL = isEN ? DEFAULT_TPL_EN : DEFAULT_TPL_AR;
const TPL_VARS = {
  account: ['name', 'product', 'email', 'password', 'file', 'expiry_date'],
  code: ['name', 'product', 'code'],
  number: ['name', 'country', 'number'],
  reminder: ['name', 'product', 'file', 'expiry_date']
};
const TYPE_TXT = { account: 'ملف', code: 'كود', number: 'رقم' };
const STATE_TXT = { av: 'متاح', sold: 'مباع', soon: 'قرب ينتهي', over: 'انتهى', dead: 'منتهي' };
const SERVICES = ['Netflix', 'Shahid VIP', 'OSN+', 'Disney+', 'Amazon Prime', 'Spotify', 'YouTube Premium', 'TOD', 'beIN Connect', 'Apple TV+'];
const CODE_HINTS = ['ببجي 60 UC', 'ببجي 325 UC', 'فري فاير 100 جوهرة', 'فري فاير 530 جوهرة', 'iTunes أمريكي 10$', 'iTunes أمريكي 25$', 'Google Play 10$', 'PlayStation 10$'];
const COUNTRIES = ['أمريكا', 'بريطانيا', 'كندا', 'ألمانيا', 'فرنسا', 'هولندا', 'السويد', 'إندونيسيا', 'روسيا', 'البرازيل'];

const S = {
  profile: null, products: [], files: [], codes: [], numbers: [], customers: [], sales: [],
  tpl: { ...DEFAULT_TPL }, plans: [], platform: {}, requests: [], methods: [], banners: [], subCur: null, bIdx: 0,
  loaded: new Set(), started: false,
  f: { ptab: 'account', fst: 'all', fprod: 'all', sq: '', stype: 'all', smonth: 'all', cq: '', nq: '', ncountry: 'all', homeProd: null }
};
const uid = () => S.profile.id;
const mcol = name => collection(db, 'merchants', uid(), name);
const mdoc = (name, id) => doc(db, 'merchants', uid(), name, id);
const round2 = n => Math.round(n * 100) / 100;

/* ================= مشتقات ================= */
const isActive = () => S.profile.isActive === true && tsMs(S.profile.planExpiresAt) > Date.now();
const P = id => S.products.find(p => p.id === id);
const accProducts = () => S.products.filter(p => p.type === 'account').sort((a, b) => b.createdAt - a.createdAt);
const codeProducts = () => S.products.filter(p => p.type === 'code').sort((a, b) => a.name.localeCompare(b.name, 'ar'));
const accDead = p => !p || (p.accountEnd && p.accountEnd <= Date.now());
const filesOf = pid => S.files.filter(f => f.productId === pid).sort((a, b) => a.fileNumber - b.fileNumber);
const codesOf = pid => S.codes.filter(c => c.productId === pid).sort((a, b) => a.createdAt - b.createdAt);
const availCodes = pid => codesOf(pid).filter(c => c.status === 'available');
function fileState(f) {
  const p = P(f.productId);
  if (accDead(p)) return 'dead';
  if (f.status === 'sold') {
    if (f.endDate <= Date.now()) return 'over';
    return daysLeft(f.endDate) <= 3 ? 'soon' : 'sold';
  }
  return 'av';
}
const reminders = () => S.files.filter(f => f.status === 'sold' && fileState(f) !== 'dead').sort((a, b) => a.endDate - b.endDate);
const urgentCount = () => reminders().filter(f => ['soon', 'over'].includes(fileState(f))).length;
function accCost(p, start, end) {
  const total = Math.max(DAY, p.accountEnd - p.accountStart);
  const used = Math.max(0, Math.min(end, p.accountEnd) - Math.max(start, p.accountStart));
  return round2((num(p.purchasePrice) / (p.totalFiles || 1)) * (used / total));
}
const monthOpts = (max, sel = 1) => Array.from({ length: max }, (_, i) => i + 1).map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${monthsTxt(m)}</option>`).join('');
function saleBadge(s) {
  if (s.type !== 'account') return '<span class="badge info">مسلّم</span>';
  if (s.status === 'renewed') return '<span class="badge info">تم التجديد</span>';
  if (s.status === 'not_renewed') return '<span class="badge off">لم يجدد</span>';
  if (s.endDate <= Date.now()) return '<span class="badge bad">منتهي</span>';
  if (daysLeft(s.endDate) <= 3) return '<span class="badge warn">قريب ينتهي</span>';
  return '<span class="badge ok">نشط</span>';
}
function planLine() {
  if (S.profile.role === 'admin' && !isActive()) return 'مدير المنصة';
  return isActive() ? `مشترك حتى ${fmtDate(tsMs(S.profile.planExpiresAt))}` : 'الاشتراك غير مفعّل';
}

/* ================= التشغيل ================= */
const { profile } = await requireUser();
S.profile = profile;
setCurrency(profile.currency);
const NAV = [
  { id: 'home', icon: 'home', label: 'الرئيسية' },
  { id: 'products', icon: 'box', label: 'المنتجات' },
  { id: 'files', icon: 'folder', label: 'الملفات' },
  { id: 'sales', icon: 'cart', label: 'المبيعات' },
  { id: 'customers', icon: 'user', label: 'العملاء' },
  { id: 'reminders', icon: 'bell', label: 'تجديدات قربت' },
  { id: 'settings', icon: 'sliders', label: 'الإعدادات' }
];
const UI = shell({
  nav: NAV, name: profile.displayName || profile.email, sub: planLine(),
  searchPh: 'ابحث عن زبون، منتج، أو رقم…'
});
const view = UI.view;
view.innerHTML = `<div class="card" style="margin-bottom:16px">${skeleton(3)}</div><div class="card">${skeleton(5)}</div>`;

let raf = 0;
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render(false)); };
// بيانات عامة تتحمل دايماً، وبيانات التاجر تتحمل بس لو اشتراكه مفعّل (القواعد تمنعها غير هكي)
const BASE = ['user', 'plans', 'platform', 'banners', 'methods', 'requests'];
const MER = ['products', 'files', 'codes', 'numbers', 'customers', 'sales', 'tpl'];
const isDeleted = () => S.profile.status === 'deleted';
const ready = () => BASE.every(k => S.loaded.has(k)) && (isDeleted() || !isActive() || MER.every(k => S.loaded.has(k)));
function arrived(k) {
  S.loaded.add(k);
  if (!S.started && ready()) { S.started = true; render(true); }
  else if (S.started) schedule();
}
const onErr = e => { console.error(e); toast('تعذر تحميل بعض البيانات. تحقق من الإنترنت.', 'bad'); };
let merUnsubs = [];
function startMerchant() {
  if (merUnsubs.length) return;
  const sub = (name, ref) => onSnapshot(ref, snap => { S[name] = snap.docs.map(d => ({ id: d.id, ...d.data() })); arrived(name); }, onErr);
  merUnsubs = ['products', 'files', 'codes', 'numbers', 'customers', 'sales'].map(n => sub(n, mcol(n)));
  merUnsubs.push(onSnapshot(mdoc('settings', 'templates'), s => { S.tpl = { ...DEFAULT_TPL, ...(s.exists() ? s.data() : {}) }; arrived('tpl'); }, onErr));
}
function stopMerchant() {
  merUnsubs.forEach(u => u()); merUnsubs = [];
  MER.forEach(k => S.loaded.delete(k));
  ['products', 'files', 'codes', 'numbers', 'customers', 'sales'].forEach(n => { S[n] = []; });
}

onSnapshot(doc(db, 'users', uid()), s => {
  const was = S.started ? (isActive() ? 'on' : 'off') + isDeleted() : null;
  S.profile = { id: s.id, ...s.data() };
  setCurrency(S.profile.currency);
  UI.setMe(S.profile.displayName || S.profile.email, planLine());
  if (isActive() && !isDeleted()) startMerchant(); else stopMerchant();
  const now = (isActive() ? 'on' : 'off') + isDeleted();
  if (S.started && was !== now) { S.started = false; }   // تغيّرت الحالة: نعيد العرض بعد ما تتحمل البيانات
  arrived('user');
}, onErr);
onSnapshot(collection(db, 'plans'), s => { S.plans = s.docs.map(d => ({ id: d.id, ...d.data() })); arrived('plans'); }, onErr);
onSnapshot(doc(db, 'settings', 'platform'), s => { S.platform = s.exists() ? s.data() : {}; arrived('platform'); }, onErr);
onSnapshot(collection(db, 'banners'), s => { S.banners = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.active !== false && safeImg(b.image)).sort((a, b) => (a.order || 0) - (b.order || 0)); arrived('banners'); }, onErr);
onSnapshot(collection(db, 'paymentMethods'), s => { S.methods = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0)); arrived('methods'); }, onErr);
onSnapshot(query(collection(db, 'subscriptionRequests'), where('merchantId', '==', uid())), s => {
  S.requests = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)); arrived('requests');
}, onErr);

window.addEventListener('hashchange', () => S.started && render(true));

/* ================= الموجّه ================= */
const VIEWS = { home: vHome, products: vProducts, files: vFiles, sales: vSales, customers: vCustomers, reminders: vReminders, settings: vSettings };
function render(fresh) {
  let r = (location.hash || '#home').slice(1);
  if (!VIEWS[r]) r = 'home';
  if (isDeleted()) { UI.setActive(''); vDeleted(); }
  else if (needsVerify()) { UI.setActive(''); vVerify(); }
  else if (!isActive()) { UI.setActive(''); vGate(); }
  else { UI.setActive(r); VIEWS[r](); }
  if (fresh) { animate(view); window.scrollTo(0, 0); } else view.classList.remove('anim');
  const u = urgentCount();
  const urgent = reminders().filter(f => ['soon', 'over'].includes(fileState(f))).slice(0, 5);
  UI.setBadge('reminders', u);
  UI.setBell(u, urgent.length ? urgent.map(f => `<button type="button" class="bellitem ${fileState(f)}" data-act="tile" data-id="${f.id}"><b>${esc(f.customerName || '—')}</b><small>${esc(P(f.productId)?.name || '')} · ${t(leftText(f.endDate))}</small></button>`).join('') : `<p class="muted small" style="padding:12px">${t('ما فيش تجديدات قربت 🎉')}</p>`);
}
const guardWrite = () => { if (isActive()) return true; toast('اشتراكك غير مفعّل. فعّله من صفحة الاشتراك.', 'bad'); return false; };

/* ================= عناصر مشتركة ================= */
// صف ملف (الملفات والرئيسية): الصف كامل يفتح التفاصيل
function fileRow(f) {
  const st = fileState(f);
  const ic = st === 'av' ? 'folderOpen' : st === 'dead' ? 'ban' : 'folder';
  const sub = st === 'av' ? 'جاهز للبيع' : st === 'dead' ? 'الحساب منتهي' : esc(f.customerName || '');
  const badge = { av: 'ok', sold: 'off', soon: 'warn', over: 'bad', dead: 'off' }[st];
  return `<button type="button" class="frow-item ${st}" data-act="tile" data-id="${f.id}" ${st === 'dead' ? 'disabled' : ''}>
    <span class="fic">${icon(ic)}</span>
    <span class="fmid"><b>الملف #${f.fileNumber}</b><small>${sub}${st !== 'av' && st !== 'dead' && f.endDate ? ` · ${fmtShort(f.endDate)}` : ''}</small></span>
    <span class="badge ${badge}">${STATE_TXT[st]}</span><span class="chev">${icon('arrow')}</span></button>`;
}
// صف تجديد (التذكيرات والرئيسية)
function remRow(f) {
  const st = fileState(f), p = P(f.productId), d = daysLeft(f.endDate);
  const cls = st === 'over' || d < 3 ? 'bad' : d < 7 ? 'warn' : 'ok';
  const acts = st === 'over'
    ? `<button class="btn teal sm" data-act="renew" data-id="${f.id}">جدّد</button><button class="btn red sm" data-act="norenew" data-id="${f.id}">لم يجدد</button>`
    : `<button class="btn warn sm" data-act="remindWa" data-id="${f.id}">${icon('wa')} إرسال تذكير</button>`;
  return `<div class="rrow"><div class="rmid"><b>${esc(f.customerName || '—')}</b><small>${esc(p?.name || '')} · الملف #${f.fileNumber}</small></div>
    <span class="badge ${cls}">${leftText(f.endDate)}</span><div class="racts">${acts}</div></div>`;
}
function salesRows(list, actions = true) {
  return list.map(s => `<tr>
    <td><b>${esc(s.customerName)}</b></td>
    <td>${esc(s.productName)}</td>
    <td><span class="ltr">${esc(s.itemLabel || '')}</span></td>
    <td><span class="tag">${TYPE_TXT[s.type]}</span></td>
    <td class="num"><span class="price">${money(s.price)}</span></td>
    <td class="num ${s.profit < 0 ? 't-bad' : 't-ok'}">${money(s.profit)}</td>
    <td class="num">${fmtDate(s.date)}</td>
    <td>${saleBadge(s)}</td>
    ${actions ? `<td><button class="iconbtn sm" data-act="resend" data-id="${s.id}" aria-label="إعادة إرسال">${icon('send')}</button></td>` : ''}
  </tr>`).join('');
}
const salesHead = (actions = true) => `<thead><tr><th>العميل</th><th>المنتج</th><th>العنصر</th><th>النوع</th><th>السعر</th><th>الربح</th><th>التاريخ</th><th>الحالة</th>${actions ? '<th></th>' : ''}</tr></thead>`;

/* ================= الرئيسية ================= */
function vHome() {
  const today = startOfDay(), yday = today - DAY;
  const inRange = (a, b) => S.sales.filter(s => s.date >= a && s.date < b);
  const tSales = inRange(today, Infinity), ySales = inRange(yday, today);
  const tProfit = tSales.reduce((a, s) => a + num(s.profit), 0);
  const due = reminders().filter(f => fileState(f) === 'over' || daysLeft(f.endDate) <= 7);
  const avail = S.files.filter(f => fileState(f) === 'av').length
    + S.codes.filter(c => c.status === 'available' && P(c.productId)).length
    + S.numbers.filter(n => n.status === 'available').length;
  const recent = [...S.sales].sort((a, b) => b.date - a.date).slice(0, 3);
  const name = (S.profile.displayName || '').split(' ')[0];
  view.innerHTML = `
  <div class="home">
    ${bannersHTML()}
    <p class="hello rv">مرحباً، ${esc(name || 'بيك')}</p>
    <section class="today rv" aria-label="اليوم">
      <div><small>مبيعات اليوم</small><b class="num">${tSales.length.toLocaleString('en-US')}</b></div>
      <div><small>أرباح اليوم</small><b class="num t-ok">${money(tProfit)}</b></div>
      <div><small>تجديدات مستحقة</small><b class="num t-amber">${due.length}</b></div>
    </section>
    <div class="cta2 rv">
      <button class="btn amber big" data-act="quickSell">${icon('cart')} بيع جديد</button>
      <button class="btn outline big" data-act="addProduct" data-id="account">${icon('plus')} إضافة منتج</button>
    </div>
    ${due.length ? `<section class="card rv"><div class="chead"><h2>تذكيرات اليوم</h2><a class="link" href="#reminders">عرض الكل</a></div>
      <div class="rlist">${due.slice(0, 5).map(remRow).join('')}</div></section>` : ''}
    <section class="card rv"><div class="chead"><h2>آخر العمليات</h2></div>
      ${recent.length ? `<div class="oplist">${recent.map(s => `<div class="op"><div><b>${esc(s.customerName)}</b><small>${esc(s.productName)}${s.itemLabel ? ' · ' + esc(s.itemLabel) : ''}</small></div><div class="opr"><b class="num">${money(s.price)}</b><small>${ago(s.date)}</small></div></div>`).join('')}</div>
        <a class="link morelink" href="#sales">عرض الكل</a>`
      : empty('cart', 'ما فيش مبيعات للحين.', `<button class="btn amber sm" data-act="quickSell">${icon('cart')} بيع جديد</button>`)}
    </section>
    <div class="mini2 rv">
      <a class="mini" href="#files"><small>المتاح للبيع</small><b class="num">${avail}</b></a>
      <a class="mini" href="#sales"><small>مبيعات الأمس</small><b class="num">${ySales.length}</b></a>
    </div>
  </div>`;
}

/* ================= المنتجات ================= */
function vProducts() {
  const t = S.f.ptab;
  const counts = { account: accProducts().length, code: codeProducts().length, number: S.numbers.length };
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>المنتجات</h1><p>الحسابات، الأكواد، والأرقام اللي عندك</p></div>
    <button class="btn amber" data-act="addProduct" data-id="${t}">${icon('plus')} ${t === 'account' ? 'إضافة حساب' : t === 'code' ? 'إضافة فئة أكواد' : 'إضافة رقم'}</button></div>
  <div class="tabs rv" style="margin-bottom:20px">
    ${[['account', 'tv', 'الحسابات'], ['code', 'ticket', 'الأكواد'], ['number', 'phone', 'الأرقام']].map(([k, i, l]) =>
      `<button class="${t === k ? 'on' : ''}" data-act="ptab" data-id="${k}">${icon(i)} ${l} <span class="dim">${counts[k]}</span></button>`).join('')}
  </div>
  <div id="plist"></div>`;
  if (t === 'account') renderAccounts(); else if (t === 'code') renderCodeProducts(); else renderNumbers();
}
function renderAccounts() {
  const list = accProducts();
  $('#plist').innerHTML = list.length ? `<div class="plist">${list.map(p => {
    const fs = filesOf(p.id), sold = fs.filter(f => f.status === 'sold').length;
    const rev = S.sales.filter(s => s.productId === p.id).reduce((a, s) => a + num(s.price), 0);
    const dead = accDead(p);
    return `<article class="card pcard rv ${dead ? '' : 'glow'}" ${dead ? 'style="opacity:.7"' : ''}>
      <div class="ph"><div><h3>${esc(p.name)}</h3><small class="dim">${fmtDate(p.accountStart)} إلى ${fmtDate(p.accountEnd)}</small></div>
        ${dead ? '<span class="badge off">منتهي</span>' : `<span class="badge ${daysLeft(p.accountEnd) <= 7 ? 'warn' : 'ok'}">${leftText(p.accountEnd)}</span>`}</div>
      <div class="cred">${icon('mail')}<span>${esc(p.email)}</span><button data-act="copy" data-v="${esc(p.email)}" aria-label="نسخ الإيميل">${icon('copy')}</button></div>
      <div class="cred">${icon('key')}<span data-pw="${esc(p.password)}">••••••••</span><button data-act="reveal" aria-label="إظهار">${icon('eye')}</button><button data-act="copy" data-v="${esc(p.password)}" aria-label="نسخ كلمة المرور">${icon('copy')}</button></div>
      <div><div class="row small muted" style="margin-bottom:6px"><span>الملفات</span><span class="spacer"></span><span>${sold} مباع من ${fs.length}</span></div>
        <div class="meter"><i class="s" style="width:${fs.length ? sold / fs.length * 100 : 0}%"></i></div></div>
      <div class="kv"><div><small>سعر الشراء</small><b>${money(p.purchasePrice)}</b></div><div><small>الملف شهرياً</small><b>${money(p.fileSellPrice)}</b></div><div><small>الإيراد</small><b>${money(rev)}</b></div></div>
      ${p.notes ? `<p class="small muted">${esc(p.notes)}</p>` : ''}
      <div class="row">
        ${dead ? '' : `<button class="btn amber sm" data-act="sellProd" data-id="${p.id}">${icon('cart')} بيع ملف</button>`}
        <button class="btn ghost sm" data-act="filesOf" data-id="${p.id}">الملفات</button>
        <span class="spacer"></span>
        <button class="iconbtn sm" data-act="editProd" data-id="${p.id}" aria-label="تعديل">${icon('edit')}</button>
        <button class="iconbtn sm" data-act="delProd" data-id="${p.id}" aria-label="حذف">${icon('trash')}</button>
      </div></article>`;
  }).join('')}</div>` : `<div class="card">${empty('tv', 'ما عندكش حسابات. أضف حساب Netflix أو Shahid وقسّمه لملفات.', `<button class="btn amber" data-act="addProduct" data-id="account">${icon('plus')} إضافة حساب</button>`)}</div>`;
}
function renderCodeProducts() {
  const list = codeProducts();
  $('#plist').innerHTML = list.length ? `<div class="plist">${list.map(p => {
    const cs = codesOf(p.id), av = cs.filter(c => c.status === 'available').length;
    return `<article class="card pcard rv ${av ? 'glow' : ''}">
      <div class="ph"><div><h3>${esc(p.name)}</h3><small class="dim">${cs.length} كود مضاف</small></div>
        <span class="badge ${av ? 'ok' : 'bad'}">${av ? `${av} متاح` : 'نفد المخزون'}</span></div>
      <div class="kv"><div><small>سعر الشراء</small><b>${money(p.purchasePrice)}</b></div><div><small>سعر البيع</small><b>${money(p.sellPrice)}</b></div><div><small>مباع</small><b>${cs.length - av}</b></div></div>
      <div class="row">
        <button class="btn amber sm" data-act="sellProd" data-id="${p.id}" ${av ? '' : 'disabled'}>${icon('cart')} بيع كود</button>
        <button class="btn ghost sm" data-act="addCodes" data-id="${p.id}">${icon('plus')} أكواد</button>
        <span class="spacer"></span>
        <button class="iconbtn sm" data-act="viewCodes" data-id="${p.id}" aria-label="عرض الأكواد">${icon('eye')}</button>
        <button class="iconbtn sm" data-act="editProd" data-id="${p.id}" aria-label="تعديل">${icon('edit')}</button>
        <button class="iconbtn sm" data-act="delProd" data-id="${p.id}" aria-label="حذف">${icon('trash')}</button>
      </div></article>`;
  }).join('')}</div>` : `<div class="card">${empty('ticket', 'أضف فئة أكواد، مثلاً "ببجي 60 UC"، والصق الأكواد دفعة وحدة.', `<button class="btn amber" data-act="addProduct" data-id="code">${icon('plus')} إضافة فئة</button>`)}</div>`;
}
function renderNumbers() {
  const countries = [...new Set(S.numbers.map(n => n.country).filter(Boolean))].sort();
  $('#plist').innerHTML = `
  <div class="toolbar rv">
    <input class="inp grow" id="nq" type="search" placeholder="ابحث بالرقم…" value="${esc(S.f.nq)}" dir="ltr" style="text-align:right">
    <select class="inp" id="ncountry"><option value="all">كل الدول</option>${countries.map(c => `<option ${c === S.f.ncountry ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
  </div>
  <div class="card rv" style="padding:0;overflow:hidden" id="nlist"></div>`;
  const draw = () => {
    const q = S.f.nq.replace(/\s/g, '');
    const list = S.numbers.filter(n => (S.f.ncountry === 'all' || n.country === S.f.ncountry) && (!q || String(n.number).replace(/\s/g, '').includes(q)))
      .sort((a, b) => (a.status === 'available' ? 0 : 1) - (b.status === 'available' ? 0 : 1) || b.createdAt - a.createdAt);
    $('#nlist').innerHTML = list.length ? `<div class="tbl" style="border:0;border-radius:0"><table><thead><tr><th>الرقم</th><th>الدولة</th><th>الشراء</th><th>البيع</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map(n => `<tr><td><b class="ltr">${esc(n.number)}</b></td><td>${esc(n.country)}</td><td class="num">${money(n.purchasePrice)}</td><td class="num"><span class="price">${money(n.sellPrice)}</span></td>
        <td>${n.status === 'available' ? '<span class="badge ok">متاح</span>' : `<span class="badge off">مباع${n.customerName ? ' لـ ' + esc(n.customerName) : ''}</span>`}</td>
        <td><div class="row" style="flex-wrap:nowrap">${n.status === 'available' ? `<button class="btn amber sm" data-act="sellNum" data-id="${n.id}">بيع</button>` : ''}
          <button class="iconbtn sm" data-act="copy" data-v="${esc(n.number)}" aria-label="نسخ">${icon('copy')}</button>
          <button class="iconbtn sm" data-act="editNum" data-id="${n.id}" aria-label="تعديل">${icon('edit')}</button>
          <button class="iconbtn sm" data-act="delNum" data-id="${n.id}" aria-label="حذف">${icon('trash')}</button></div></td></tr>`).join('')}
    </tbody></table></div>` : empty('phone', S.numbers.length ? 'ما فيش أرقام تطابق البحث.' : 'أضف الأرقام اللي شاريها، كل رقم بدولته وسعره.', S.numbers.length ? '' : `<button class="btn amber" data-act="addProduct" data-id="number">${icon('plus')} إضافة رقم</button>`);
  };
  $('#nq').oninput = e => { S.f.nq = e.target.value; draw(); };
  $('#ncountry').onchange = e => { S.f.ncountry = e.target.value; draw(); };
  draw();
}

/* ================= الملفات ================= */
function vFiles() {
  const accs = accProducts();
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>الملفات</h1><p>كل ملفات حساباتك وحالتها</p></div>
    <button class="btn amber" data-act="addProduct" data-id="account">${icon('plus')} إضافة حساب</button></div>
  <div class="toolbar rv">
    <div class="chips scrollx">${[['all', 'الكل'], ['av', 'متاح'], ['sold', 'مباع'], ['soon', 'قرب ينتهي'], ['over', 'انتهى']].map(([k, l]) =>
      `<button class="chip ${S.f.fst === k ? 'on' : ''}" data-act="fst" data-id="${k}">${l}</button>`).join('')}</div>
    <span class="spacer"></span>
    <select class="inp" id="fprod"><option value="all">كل الحسابات</option>${accs.map(p => `<option value="${p.id}" ${S.f.fprod === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  </div>
  <div id="flist"></div>`;
  $('#fprod').onchange = e => { S.f.fprod = e.target.value; vFiles(); };
  const groups = accs.filter(p => S.f.fprod === 'all' || p.id === S.f.fprod).map(p => {
    const fs = filesOf(p.id).filter(f => S.f.fst === 'all' || fileState(f) === S.f.fst);
    if (!fs.length) return '';
    return `<section class="card rv section" ${accDead(p) ? 'style="opacity:.75"' : ''}>
      <div class="chead"><div><h2>${esc(p.name)}</h2><p class="ltr" style="text-align:right">${esc(p.email)}</p></div>
        <span class="badge ${accDead(p) ? 'off' : 'ok'}">${accDead(p) ? 'الحساب منتهي' : `ينتهي ${fmtDate(p.accountEnd)}`}</span></div>
      <div class="flist">${fs.map(fileRow).join('')}</div></section>`;
  }).join('');
  $('#flist').innerHTML = groups || `<div class="card">${accs.length ? empty('folder', 'ما فيش ملفات بهذي الحالة.') : `<div class="empty">${icon('folder')}<h3>ما فيش ملفات للحين</h3><p>أضف أول حساب باش تبدأ البيع</p><button class="btn amber" data-act="addProduct" data-id="account">${icon('plus')} إضافة حساب</button></div>`}</div>`;
}

/* ================= المبيعات ================= */
const MN_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthLabel = m => { const [y, mm] = m.split('-').map(Number); return isEN ? new Date(y, mm - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : `${MN_AR[mm - 1]} ${y}`; };
function vSales() {
  const months = [...new Set(S.sales.map(s => { const d = new Date(s.date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }))].sort().reverse();
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>سجل المبيعات</h1><p>كل عمليات البيع والأرباح</p></div>
    <button class="btn amber" data-act="quickSell">${icon('cart')} بيع جديد</button></div>
  <div class="toolbar rv">
    <input class="inp grow" id="sq" type="search" placeholder="ابحث بالعميل، المنتج، أو الكود…" value="${esc(S.f.sq)}">

    <select class="inp" id="smonth"><option value="all">كل الأشهر</option>${months.map(m => `<option value="${m}" ${S.f.smonth === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>
  </div>
  <div class="chips scrollx rv" style="margin-bottom:16px">${[['all', 'الكل'], ['account', 'ملفات'], ['code', 'أكواد'], ['number', 'أرقام']].map(([k, l]) => `<button class="chip ${S.f.stype === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>
  <div id="slist"></div>`;
  const draw = () => {
    const q = S.f.sq.trim().toLowerCase();
    const list = S.sales.filter(s => {
      if (S.f.stype !== 'all' && s.type !== S.f.stype) return false;
      if (S.f.smonth !== 'all') { const d = new Date(s.date); if (`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` !== S.f.smonth) return false; }
      return !q || [s.customerName, s.productName, s.itemLabel, s.customerPhone].some(v => String(v || '').toLowerCase().includes(q));
    }).sort((a, b) => b.date - a.date);
    const rev = list.reduce((a, s) => a + num(s.price), 0), prof = list.reduce((a, s) => a + num(s.profit), 0);
    $('#slist').innerHTML = `
      <div class="sumbar"><div><small>عدد العمليات</small><b>${list.length}</b></div><div><small>الإيراد</small><b>${money(rev)}</b></div><div><small>صافي الربح</small><b class="t-ok">${money(prof)}</b></div></div>
      ${list.length ? `<div class="tbl card" style="padding:0"><table>${salesHead()}<tbody>${salesRows(list.slice(0, 300))}</tbody></table></div>` : `<div class="card">${empty('cart', 'ما فيش مبيعات تطابق الفلتر.')}</div>`}`;
  };
  $('#sq').oninput = e => { S.f.sq = e.target.value; draw(); };
  $$('[data-st]').forEach(b => b.onclick = () => { S.f.stype = b.dataset.st; $$('[data-st]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#smonth').onchange = e => { S.f.smonth = e.target.value; draw(); };
  draw();
}

/* ================= العملاء ================= */
function custStats(c) {
  const ss = S.sales.filter(s => s.customerId === c.id);
  return { count: ss.length, total: ss.reduce((a, s) => a + num(s.price), 0), last: Math.max(0, ...ss.map(s => s.date)), list: ss.sort((a, b) => b.date - a.date) };
}
function vCustomers() {
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>العملاء</h1><p>بيانات زباينك ومشترياتهم</p></div>
    <button class="btn amber" data-act="custForm">${icon('plus')} إضافة عميل</button></div>
  <div class="toolbar rv"><input class="inp grow" id="cq" type="search" placeholder="ابحث بالاسم أو الرقم…" value="${esc(S.f.cq)}"></div>
  <div class="card rv" style="padding:0;overflow:hidden" id="clist"></div>`;
  const draw = () => {
    const q = S.f.cq.trim().toLowerCase();
    const list = S.customers.filter(c => !q || [c.name, c.phone].some(v => String(v || '').toLowerCase().includes(q)))
      .map(c => ({ c, st: custStats(c) })).sort((a, b) => b.st.last - a.st.last || a.c.name.localeCompare(b.c.name, 'ar'));
    $('#clist').innerHTML = list.length ? `<div class="tbl" style="border:0;border-radius:0"><table><thead><tr><th>الاسم</th><th>واتساب</th><th>المشتريات</th><th>الإجمالي</th><th>آخر شراء</th><th></th></tr></thead><tbody>
      ${list.map(({ c, st }) => `<tr class="click" data-act="cust" data-id="${c.id}"><td><b>${esc(c.name)}</b></td><td class="ltr">${esc(c.phone || '—')}</td><td class="num">${st.count}</td><td class="num"><span class="price">${money(st.total)}</span></td><td class="num">${st.last ? fmtDate(st.last) : '—'}</td>
        <td><div class="row" style="flex-wrap:nowrap">${c.phone ? `<a class="iconbtn sm" href="${waLink(c.phone, '')}" target="_blank" rel="noopener" aria-label="واتساب" data-stop>${icon('wa')}</a>` : ''}<button class="iconbtn sm" data-act="custForm" data-id="${c.id}" aria-label="تعديل">${icon('edit')}</button></div></td></tr>`).join('')}
    </tbody></table></div>` : empty('users', S.customers.length ? 'ما فيش عملاء يطابقوا البحث.' : 'العملاء ينضافوا تلقائياً مع أول عملية بيع، أو تقدر تضيفهم يدوي.');
  };
  $('#cq').oninput = e => { S.f.cq = e.target.value; draw(); };
  draw();
}

/* ================= تجديدات قربت ================= */
function remTab(f) {
  if (fileState(f) === 'over') return 'late';
  const d = daysLeft(f.endDate);
  return d <= 1 ? 'today' : d <= 7 ? 'week' : null;
}
function vReminders() {
  const all = reminders();
  const g = { today: [], week: [], late: [] };
  all.forEach(f => { const k = remTab(f); if (k) g[k].push(f); });
  if (!S.f.rtab) S.f.rtab = g.late.length && !g.today.length ? 'late' : 'today';
  const k = S.f.rtab;
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>تجديدات قربت</h1><p>تابع زباينك قبل ما تنتهي اشتراكاتهم</p></div></div>
  <div class="tabs rv" style="margin-bottom:16px">${[['today', 'اليوم'], ['week', 'هذا الأسبوع'], ['late', 'متأخر']].map(([x, l]) => `<button class="${x === k ? 'on' : ''}" data-act="rtab" data-id="${x}">${l} <span class="dim">${g[x].length}</span></button>`).join('')}</div>
  <section class="card rv">${g[k].length ? `<div class="rlist">${g[k].map(remRow).join('')}</div>`
    : `<div class="empty">${icon('check')}<h3>ما فيش تجديدات قربت 🎉</h3><p>كل زباينك مرتاحين</p></div>`}</section>`;
}

/* ================= الإعدادات ================= */
function subProgress() {
  const end = tsMs(S.profile.planExpiresAt), months = S.profile.plan?.months || 1;
  const start = addMonths(end, -months), pct = Math.min(100, Math.max(0, (Date.now() - start) / Math.max(1, end - start) * 100));
  return `<div class="meter" style="margin:4px 0 16px" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i class="s" style="width:${pct}%"></i></div>`;
}
const TPL_SAMPLE = { name: 'أحمد', product: 'Netflix', email: 'demo@email.com', password: '••••••', file: '#1', expiry_date: '', code: 'XXXX-XXXX', number: '+1 555 000 0000', country: 'أمريكا' };
function vSettings() {
  const pr = S.profile, end = tsMs(pr.planExpiresAt);
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>الإعدادات</h1></div></div>
  <div class="setstack">
    <section class="card rv">
      <div class="shead"><h2>بياناتك</h2><p>اسمك ورقمك والعملة اللي تبيع بيها</p></div>
      <div class="field"><label>الاسم أو اسم المتجر</label><input id="stName" maxlength="80" value="${esc(pr.displayName || '')}"></div>
      <div class="grid2"><div class="field"><label>رقم الواتساب</label><input id="stPhone" dir="ltr" maxlength="30" value="${esc(pr.phone || '')}"></div>
        <div class="field"><label>العملة</label><select id="stCur">${[['$', 'دولار ($)'], ['د.ل', 'دينار ليبي (د.ل)'], ['ر.س', 'ريال سعودي (ر.س)']].map(([v, l]) => `<option value="${v}" ${pr.currency === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><label>البريد الإلكتروني</label><input value="${esc(pr.email)}" disabled dir="ltr"></div>
      <button class="btn amber" id="stSave">حفظ البيانات</button>
    </section>
    <section class="card rv">
      <div class="shead"><h2>الاشتراك</h2><p>${pr.plan?.name ? `<span data-raw>${esc(pr.plan.name)}</span>` : ''}</p></div>
      <p style="margin-bottom:8px">${t('اشتراكك فعّال، ينتهي في')} <b>${fmtDate(end)}</b> <span class="muted">(${t(leftText(end))})</span></p>
      ${subProgress()}
      <button class="btn amber" data-act="subscribe">${icon('card')} تجديد الاشتراك</button>
      ${reqList()}
    </section>
    <section class="card rv">
      <div class="shead"><h2>قوالب الرسائل</h2><p>اضغط على أي متغير لإضافته في مكان المؤشر.</p></div>
      ${[['account', 'تسليم ملف حساب'], ['code', 'تسليم كود'], ['number', 'تسليم رقم'], ['reminder', 'تذكير بالتجديد']].map(([k, l]) => `
        <div class="field tplf"><div class="row"><label for="tpl_${k}">${l}</label><span class="spacer"></span><button class="btn ghost sm" type="button" data-act="tplTest" data-id="${k}">${icon('wa')} إرسال تجريبي</button></div>
          <textarea id="tpl_${k}" class="tpl">${esc(S.tpl[k])}</textarea>
          <div class="chips">${TPL_VARS[k].map(v => `<button class="chip var" type="button" data-act="insVar" data-id="tpl_${k}" data-v="{${v}}">{${v}}</button>`).join('')}</div></div>`).join('')}
      <div class="row"><button class="btn amber" id="tplSave">حفظ القوالب</button><button class="btn ghost" id="tplReset">استرجاع القوالب الافتراضية</button></div>
    </section>
  </div>`;
  $('#stSave').onclick = e => busy(e.currentTarget, async () => {
    const name = $('#stName').value.trim();
    if (!name) throw new Error(t('اكتب الاسم.'));
    await updateDoc(doc(db, 'users', uid()), { displayName: name, phone: $('#stPhone').value.trim(), currency: $('#stCur').value });
    toast('تم حفظ البيانات');
  });
  $('#tplSave').onclick = e => busy(e.currentTarget, async () => {
    const data = {}; Object.keys(DEFAULT_TPL).forEach(k => data[k] = $('#tpl_' + k).value);
    await setDoc(mdoc('settings', 'templates'), data); toast('تم حفظ القوالب');
  });
  $('#tplReset').onclick = () => Object.keys(DEFAULT_TPL).forEach(k => $('#tpl_' + k).value = DEFAULT_TPL[k]);
}
function reqList() {
  if (!S.requests.length) return '';
  const st = { pending: ['warn', 'قيد المراجعة'], approved: ['ok', 'تم التفعيل'], rejected: ['bad', 'مرفوض'] };
  return `<div style="margin-top:20px"><h3 style="margin-bottom:10px">طلباتك</h3><div class="rems">${S.requests.slice(0, 5).map(r => `
    <div class="rem" style="grid-template-columns:1fr auto"><div><b>${esc(r.planName)}، ${r.currency ? moneyIn(r.price, r.currency) : money(r.price)}</b><small>${tsMs(r.createdAt) ? ago(tsMs(r.createdAt)) : 'الآن'}${r.adminNote ? '، ' + esc(r.adminNote) : ''}</small></div><span class="badge ${st[r.status]?.[0] || 'off'}">${st[r.status]?.[1] || r.status}</span></div>`).join('')}</div></div>`;
}

/* ================= البنرات ================= */
function bannersHTML() {
  if (!S.banners.length) return '';
  const i = S.bIdx % S.banners.length;
  return `<section class="banners rv" aria-label="عروض"><div class="slides">${S.banners.map((b, k) => {
    const href = bannerHref(b.linkType, b.linkValue);
    const img = `<img src="${safeImg(b.image)}" alt="${esc(b.title || '')}" loading="lazy">`;
    return href ? `<a class="slide ${k === i ? 'on' : ''}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${img}<span class="visit">${t('زيارة')} ${icon('arrow')}</span></a>` : `<div class="slide ${k === i ? 'on' : ''}">${img}</div>`;
  }).join('')}</div>${S.banners.length > 1 ? `<div class="dots">${S.banners.map((_, k) => `<button type="button" class="${k === i ? 'on' : ''}" data-act="bannerGo" data-id="${k}" aria-label="${k + 1}"></button>`).join('')}</div>` : ''}</section>`;
}
function showBanner(k) {
  S.bIdx = k;
  $$('.banners').forEach(box => {
    $$('.slide', box).forEach((sl, j) => sl.classList.toggle('on', j === k % S.banners.length));
    $$('.dots button', box).forEach((d, j) => d.classList.toggle('on', j === k % S.banners.length));
  });
}
setInterval(() => { if (S.banners.length > 1 && $('.banners') && !document.hidden) showBanner((S.bIdx + 1) % S.banners.length); }, 5000);
// سحب البنر باليد على الهاتف
let tx = null;
document.addEventListener('touchstart', e => { tx = e.target.closest('.banners') ? e.touches[0].clientX : null; }, { passive: true });
document.addEventListener('touchend', e => {
  if (tx == null || S.banners.length < 2) return;
  const dx = e.changedTouches[0].clientX - tx; tx = null;
  if (Math.abs(dx) > 40) showBanner((S.bIdx + ((dx < 0) === (document.dir === 'rtl') ? -1 : 1) + S.banners.length) % S.banners.length);
}, { passive: true });

/* ================= حساب محذوف ================= */
function vDeleted() {
  view.innerHTML = `<div class="gate"><section class="card rv">${empty('ban', 'حسابك محذوف. تواصل مع إدارة المنصة لو عندك استفسار.')}</section></div>`;
}

/* ================= تأكيد البريد ================= */
let lastSend = 0;
function vVerify() {
  const u = auth.currentUser;
  view.innerHTML = `
  <div class="gate">
    <section class="hero rv">${RIDGE}
      <h1>أكّد بريدك الإلكتروني</h1>
      <p class="muted">بعتنالك رابط تأكيد على <b class="ltr" data-raw>${esc(u?.email || '')}</b></p>
    </section>
    <section class="card glow rv" style="margin-top:22px">
      <p style="margin-bottom:8px">افتح الرسالة واضغط الرابط، وبعدين ارجع هنا واضغط "تأكدت".</p>
      <p class="muted small" style="margin-bottom:18px">لو ما لقيتهاش، شوف مجلد الرسائل غير المرغوب فيها (Spam).</p>
      <div class="row"><button class="btn amber" id="vDone">${icon('check')} تأكدت</button><button class="btn ghost" id="vSend">${icon('send')} إعادة إرسال الرابط</button></div>
    </section>
  </div>`;
  $('#vDone').onclick = e => busy(e.currentTarget, async () => {
    await auth.currentUser.reload();
    if (!auth.currentUser.emailVerified) { toast('البريد لسه ما تأكدش. افتح الرابط من الإيميل وجرّب مرة ثانية.', 'bad'); return; }
    await auth.currentUser.getIdToken(true);   // تحديث التوكن باش القواعد تشوف التأكيد
    location.reload();
  });
  $('#vSend').onclick = e => busy(e.currentTarget, async () => {
    if (Date.now() - lastSend < 60000) { toast('استنى دقيقة قبل ما تطلب رابط جديد.', 'bad'); return; }
    auth.languageCode = isEN ? 'en' : 'ar';
    await sendEmailVerification(auth.currentUser); lastSend = Date.now(); toast('تم إرسال رابط جديد');
  });
}
const needsVerify = () => S.profile.role !== 'admin' && auth.currentUser && !auth.currentUser.emailVerified;

/* ================= بوابة الاشتراك ================= */
function vGate() {
  const expired = tsMs(S.profile.planExpiresAt) && tsMs(S.profile.planExpiresAt) <= Date.now();
  const pending = S.requests.find(r => r.status === 'pending');
  view.innerHTML = `
  <div class="gate">
    ${bannersHTML() ? `<div style="margin-bottom:22px">${bannersHTML()}</div>` : ''}
    <section class="hero rv" style="margin-bottom:22px">${RIDGE}
      <h1>${expired ? 'انتهى اشتراكك' : `أهلاً ${esc((S.profile.displayName || '').split(' ')[0])}، خطوة وحدة وتبدأ`}</h1>
      <p class="muted">${pending ? 'طلبك وصل الإدارة وقيد المراجعة. أول ما يتفعّل تفتح لوحتك تلقائياً.' : expired ? 'بياناتك محفوظة. جدّد الاشتراك باش ترجع تبيع وتعدّل.' : 'اختار مدة الاشتراك، ادفع، وابعت رقم العملية. الإدارة تفعّل حسابك.'}</p>
    </section>
    <section class="card glow rv" id="subBox">${subscribeHTML()}</section>
    ${S.requests.length ? `<section class="card rv" style="margin-top:22px">${reqList()}</section>` : ''}
  </div>`;
  bindSubscribe($('#subBox'));
}
const activePlans = () => S.plans.filter(p => p.active !== false && Object.keys(planPrices(p)).length).sort((a, b) => a.months - b.months);
function subCurrencies() { const set = new Set(); activePlans().forEach(p => Object.keys(planPrices(p)).forEach(c => set.add(c))); return Object.keys(CURS).filter(c => set.has(c)); }
function subscribeHTML() {
  const curs = subCurrencies();
  if (!curs.length) return empty('card', 'ما فيش خطط اشتراك متاحة حالياً. تواصل مع الإدارة.');
  if (!curs.includes(S.subCur)) S.subCur = curs[0];
  const cur = S.subCur;
  const plans = activePlans().filter(p => planPrices(p)[cur] != null);
  const ms = S.methods.filter(m => !m.currencies?.length || m.currencies.includes(cur));
  return `
    ${curs.length > 1 ? `<div class="row" style="margin-bottom:18px"><span class="muted">العملة:</span><div class="chips">${curs.map(c => `<button type="button" class="chip ${c === cur ? 'on' : ''}" data-cur="${c}">${CURS[c].name}</button>`).join('')}</div></div>` : ''}
    <h2 style="margin-bottom:14px">1. اختار المدة</h2>
    <div class="plans" style="margin-bottom:22px">${plans.map((p, i) => `<button type="button" class="plan ${i === 0 ? 'on' : ''}" data-plan="${p.id}"><b data-raw>${esc(p.name)}</b><div class="pr">${moneyIn(planPrices(p)[cur], cur)}</div><small class="dim">${monthsTxt(p.months)}</small></button>`).join('')}</div>
    <h2 style="margin-bottom:14px">2. اختار طريقة الدفع</h2>
    ${S.platform.paymentInfo ? `<div class="payinfo" style="margin-bottom:14px" data-raw>${esc(S.platform.paymentInfo)}</div>` : ''}
    ${S.methods.length ? (ms.length ? `<div class="pmethods">${ms.map(m => `<button type="button" class="pm" data-pm="${m.id}">${safeImg(m.image) ? `<img src="${safeImg(m.image)}" alt="">` : `<span class="ph">${icon('card')}</span>`}<b data-raw>${esc(m.name)}</b></button>`).join('')}</div>
      <div id="pmDetail" hidden></div>` : `<p class="muted" style="margin-bottom:14px">ما فيش طرق دفع لهذي العملة.</p>`) : ''}
    <div id="pmForm" ${S.methods.length ? 'hidden' : ''}>
      ${S.methods.length ? '' : `<div class="field"><label>دفعت عن طريق</label><input id="rqMethod" maxlength="60"></div>`}
      <div class="field"><label id="rqRefLbl">رقم العملية أو المرسِل</label><input id="rqRef" maxlength="200" dir="auto"></div>
      <div class="field"><label>ملاحظة (اختياري)</label><input id="rqNote" maxlength="300"></div>
      <p class="err" id="rqErr"></p>
      <button class="btn amber" id="rqSend">${icon('send')} إرسال طلب التفعيل</button>
    </div>`;
}
function bindSubscribe(root) {
  if (!root) return;
  $$('[data-cur]', root).forEach(b => b.onclick = () => { S.subCur = b.dataset.cur; root.innerHTML = subscribeHTML(); bindSubscribe(root); });
  const btn = $('#rqSend', root); if (!btn) return;
  let method = null;
  $$('.plan', root).forEach(b => b.onclick = () => $$('.plan', root).forEach(x => x.classList.toggle('on', x === b)));
  $$('.pm', root).forEach(b => b.onclick = () => {
    $$('.pm', root).forEach(x => x.classList.toggle('on', x === b));
    method = S.methods.find(m => m.id === b.dataset.pm);
    const d = $('#pmDetail', root);
    d.className = 'pdetail';
    d.innerHTML = (method.fields || []).filter(f => f.value).map(f => `<div class="prow" data-raw><div><small>${esc(f.label)}</small><b dir="auto">${esc(f.value)}</b></div><button class="iconbtn sm" type="button" data-act="copy" data-v="${esc(f.value)}" aria-label="${t('نسخ')}">${icon('copy')}</button></div>`).join('')
      + (method.note ? `<p class="small muted" style="white-space:pre-wrap" data-raw>${esc(method.note)}</p>` : '');
    d.hidden = !d.innerHTML;
    $('#rqRefLbl', root).textContent = method.inputLabel || 'رقم العملية';
    $('#rqRefLbl', root).toggleAttribute('data-raw', !!method.inputLabel);
    $('#pmForm', root).hidden = false;
    $('#rqErr', root).textContent = '';
  });
  btn.onclick = () => busy(btn, async () => {
    const cur = S.subCur;
    const plan = S.plans.find(p => p.id === $('.plan.on', root)?.dataset.plan);
    const ref = $('#rqRef', root).value.trim();
    const mName = method ? method.name : ($('#rqMethod', root)?.value.trim() || '');
    if (!plan) throw new Error(t('اختار خطة.'));
    if (S.methods.length && !method) throw new Error(t('اختار طريقة الدفع.'));
    if (!ref) { $('#rqErr', root).textContent = `${t('اكتب')} ${method?.inputLabel || t('رقم العملية')}.`; return; }
    if (S.requests.some(r => r.status === 'pending')) throw new Error(t('عندك طلب قيد المراجعة.'));
    await addDoc(collection(db, 'subscriptionRequests'), {
      merchantId: uid(), merchantName: (S.profile.displayName || '').slice(0, 80), merchantEmail: S.profile.email,
      merchantPhone: (S.profile.phone || '').slice(0, 30), planId: plan.id, planName: plan.name, months: plan.months,
      currency: cur, price: planPrices(plan)[cur],
      methodId: method?.id || '', method: mName.slice(0, 60), refLabel: method?.inputLabel || 'رقم العملية',
      reference: ref.slice(0, 200), note: $('#rqNote', root).value.trim().slice(0, 300), status: 'pending', createdAt: serverTimestamp()
    });
    toast('تم إرسال الطلب للإدارة');
    root.closest('.mback') && $('[data-x]', root.closest('.mback')).click();
  });
}

/* ================= نوافذ البيع ================= */
function custFields() {
  return `<div class="grid2">
    <div class="field"><label for="cName">اسم الزبون</label><input id="cName" list="custDL" autocomplete="off"></div>
    <div class="field"><label for="cPhone">رقم الواتساب</label><input id="cPhone" type="tel" inputmode="tel" dir="ltr" placeholder="09XXXXXXXX"></div></div>
    <datalist id="custDL">${S.customers.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>`;
}
function bindCust(root) {
  const n = $('#cName', root), ph = $('#cPhone', root);
  n.addEventListener('input', () => { const c = S.customers.find(c => c.name === n.value.trim()); if (c && !ph.dataset.touched) ph.value = c.phone || ''; });
  ph.addEventListener('input', () => { ph.dataset.touched = 1; });
}
function resolveCust(root, b) {
  const name = $('#cName', root).value.trim(), phone = $('#cPhone', root).value.trim();
  if (!name) throw new Error('اكتب اسم الزبون.');
  const c = S.customers.find(c => c.name === name);
  if (c) { if (phone && phone !== c.phone) b.update(mdoc('customers', c.id), { phone }); return { id: c.id, name, phone: phone || c.phone || '' }; }
  const ref = doc(mcol('customers'));
  b.set(ref, { name, phone, notes: '', createdAt: Date.now() });
  return { id: ref.id, name, phone };
}
const accMsg = (p, fileNumber, name, end) => fill(S.tpl.account, { name, product: p.name, email: p.email, password: p.password, file: '#' + fileNumber, expiry_date: fmtDate(end) });

function deliver(msg, phone, title = 'تسليم للزبون', done = '') {
  const m = modal(title, `
    ${done ? `<p class="okline">${icon('check')} ${t('تم البيع بنجاح')}</p>` : ''}
    <div class="field"><label>الرسالة</label><textarea id="dMsg" rows="8">${esc(msg)}</textarea></div>
    <div class="field"><label>واتساب الزبون</label><input id="dPhone" type="tel" dir="ltr" value="${esc(phone || '')}" placeholder="09XXXXXXXX"></div>
    <button class="btn wa big full" id="dWa">${icon('wa')} إرسال على واتساب</button>
    <div class="mfoot" style="margin-top:10px"><button class="btn ghost" id="dCopy">${icon('copy')} نسخ الرسالة</button><button class="btn text" id="dDone" data-x>تم</button></div>`);
  $('#dWa', m.el).onclick = () => {
    const ph = $('#dPhone', m.el).value;
    if (!normPhone(ph)) { toast(t('اكتب رقم واتساب الزبون'), 'bad'); return; }
    window.open(waLink(ph, $('#dMsg', m.el).value), '_blank');
  };
  $('#dCopy', m.el).onclick = () => copyText($('#dMsg', m.el).value);
  if (done) $('#dDone', m.el).addEventListener('click', () => toast(done));
}

function sellAccount({ file, product }) {
  if (!guardWrite()) return;
  const p = product || P(file?.productId);
  if (!p) return;
  if (accDead(p)) { toast('الحساب هذا منتهي', 'bad'); return; }
  const f = file || filesOf(p.id).find(x => x.status === 'available');
  if (!f) { toast('ما فيش ملفات متاحة في هذا الحساب', 'bad'); return; }
  const today = startOfDay();
  const maxM = Math.max(1, Math.min(24, monthsCeil(Math.max(today, p.accountStart), p.accountEnd)));
  const m = modal(`بيع ${esc(p.name)}، الملف #${f.fileNumber}`, `
    ${custFields()}
    <div class="grid2 keep">
      <div class="field"><label>المدة</label><select id="sM">${monthOpts(maxM)}</select></div>
      <div class="field"><label>السعر</label><input id="sPrice" inputmode="decimal" dir="ltr" value="${num(p.fileSellPrice)}"></div></div>
    <div class="field"><label>تاريخ البداية</label><input id="sStart" type="date" value="${toInput(Math.max(today, p.accountStart))}"></div>
    <div class="summary" id="sSum"></div>
    <div class="mfoot"><button class="btn amber" id="sGo">${icon('check')} تأكيد البيع</button></div>`);
  bindCust(m.el);
  const price = $('#sPrice', m.el);
  const calc = () => {
    const start = fromInput($('#sStart', m.el).value) || today, mm = +$('#sM', m.el).value;
    const end = Math.min(addMonths(start, mm), p.accountEnd), cost = accCost(p, start, end);
    $('#sSum', m.el).innerHTML = `<div><span>ينتهي في</span><b>${fmtDate(end)}${end === p.accountEnd ? ' (نهاية الحساب)' : ''}</b></div><div><span>تكلفة الملف للمدة</span><b>${money(cost)}</b></div><div><span>الربح</span><b class="t-ok">${money(num(price.value) - cost)}</b></div>`;
    return { start, mm, end, cost };
  };
  price.addEventListener('input', () => { price.dataset.touched = 1; calc(); });
  $('#sM', m.el).onchange = () => { if (!price.dataset.touched) price.value = round2(num(p.fileSellPrice) * +$('#sM', m.el).value); calc(); };
  $('#sStart', m.el).onchange = calc;
  calc();
  $('#sGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const { start, mm, end, cost } = calc();
    if (start >= p.accountEnd) throw new Error('تاريخ البداية بعد نهاية الحساب.');
    const cur = S.files.find(x => x.id === f.id);
    if (!cur || cur.status !== 'available') throw new Error('الملف هذا تباع من قبل.');
    const b = writeBatch(db), c = resolveCust(m.el, b), pr = num(price.value), sref = doc(mcol('sales'));
    b.set(sref, { type: 'account', productId: p.id, productName: p.name, itemId: f.id, itemLabel: `الملف #${f.fileNumber}`, customerId: c.id, customerName: c.name, customerPhone: c.phone, price: pr, cost, profit: round2(pr - cost), months: mm, startDate: start, endDate: end, date: Date.now(), status: 'active' });
    b.update(mdoc('files', f.id), { status: 'sold', customerId: c.id, customerName: c.name, customerPhone: c.phone, saleId: sref.id, startDate: start, endDate: end });
    await b.commit();
    m.close();
    deliver(accMsg(p, f.fileNumber, c.name, end), c.phone, 'تسليم الملف', `${t('تم بيع')} ${t('الملف #' + f.fileNumber)}`);
  });
}

function sellCode({ product }) {
  if (!guardWrite()) return;
  const list = codeProducts().filter(p => availCodes(p.id).length);
  if (!list.length) { toast('ما فيش أكواد متاحة', 'bad'); return; }
  const sel = product && availCodes(product.id).length ? product : list[0];
  const m = modal('بيع كود', `
    <div class="field"><label>الفئة</label><select id="kP">${list.map(p => `<option value="${p.id}" ${p.id === sel.id ? 'selected' : ''}>${esc(p.name)} (${availCodes(p.id).length} متاح)</option>`).join('')}</select></div>
    ${custFields()}
    <div class="field"><label>السعر</label><input id="kPrice" inputmode="decimal" dir="ltr" value="${num(sel.sellPrice)}"></div>
    <div class="mfoot"><button class="btn amber" id="kGo">${icon('check')} تأكيد البيع</button></div>`);
  bindCust(m.el);
  $('#kP', m.el).onchange = e => { $('#kPrice', m.el).value = num(P(e.target.value)?.sellPrice); };
  $('#kGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const p = P($('#kP', m.el).value), code = availCodes(p.id)[0];
    if (!code) throw new Error('نفدت أكواد هذي الفئة.');
    const b = writeBatch(db), c = resolveCust(m.el, b), pr = num($('#kPrice', m.el).value), cost = num(p.purchasePrice), sref = doc(mcol('sales'));
    b.set(sref, { type: 'code', productId: p.id, productName: p.name, itemId: code.id, itemLabel: code.code, customerId: c.id, customerName: c.name, customerPhone: c.phone, price: pr, cost, profit: round2(pr - cost), date: Date.now(), status: 'done' });
    b.update(mdoc('codes', code.id), { status: 'sold', saleId: sref.id, soldAt: Date.now(), customerName: c.name });
    await b.commit();
    m.close();
    deliver(fill(S.tpl.code, { name: c.name, product: p.name, code: code.code }), c.phone, 'تسليم الكود', t('تم البيع'));
  });
}

function sellNumber(n) {
  if (!guardWrite()) return;
  if (!n || n.status !== 'available') { toast('الرقم هذا مش متاح', 'bad'); return; }
  const m = modal('بيع رقم', `
    <div class="summary"><div><span>الرقم</span><b class="ltr">${esc(n.number)}</b></div><div><span>الدولة</span><b>${esc(n.country)}</b></div><div><span>سعر الشراء</span><b>${money(n.purchasePrice)}</b></div></div>
    ${custFields()}
    <div class="field"><label>السعر</label><input id="nPrice" inputmode="decimal" dir="ltr" value="${num(n.sellPrice)}"></div>
    <div class="mfoot"><button class="btn amber" id="nGo">${icon('check')} تأكيد البيع</button></div>`);
  bindCust(m.el);
  $('#nGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const cur = S.numbers.find(x => x.id === n.id);
    if (!cur || cur.status !== 'available') throw new Error('الرقم هذا تباع من قبل.');
    const b = writeBatch(db), c = resolveCust(m.el, b), pr = num($('#nPrice', m.el).value), cost = num(n.purchasePrice), sref = doc(mcol('sales'));
    b.set(sref, { type: 'number', productId: null, productName: `رقم ${n.country}`, itemId: n.id, itemLabel: n.number, country: n.country, customerId: c.id, customerName: c.name, customerPhone: c.phone, price: pr, cost, profit: round2(pr - cost), date: Date.now(), status: 'done' });
    b.update(mdoc('numbers', n.id), { status: 'sold', saleId: sref.id, soldAt: Date.now(), customerName: c.name, customerPhone: c.phone });
    await b.commit();
    m.close();
    deliver(fill(S.tpl.number, { name: c.name, country: n.country, number: n.number }), c.phone, 'تسليم الرقم', t('تم البيع'));
  });
}

function quickSell() {
  if (!guardWrite()) return;
  const accs = accProducts().filter(p => !accDead(p) && filesOf(p.id).some(f => f.status === 'available'));
  const codes = codeProducts().filter(p => availCodes(p.id).length);
  const nums = S.numbers.filter(n => n.status === 'available').length;
  const row = (act, id, ic, title, sub) => `<button class="rem" style="width:100%;text-align:right;cursor:pointer;color:inherit;grid-template-columns:auto 1fr auto" data-act="${act}" data-id="${id}">${icon(ic)}<div><b>${title}</b><small>${sub}</small></div>${icon('arrow')}</button>`;
  const html = [
    ...accs.map(p => row('sellProd', p.id, 'tv', esc(p.name), `${filesOf(p.id).filter(f => f.status === 'available').length} ملف متاح`)),
    ...codes.map(p => row('sellProd', p.id, 'ticket', esc(p.name), `${availCodes(p.id).length} كود متاح`)),
    nums ? row('goNumbers', '', 'phone', 'الأرقام', `${nums} رقم متاح، اختار الرقم من القائمة`) : ''
  ].join('');
  const m = modal('بيع جديد', html ? `<div class="rems" data-close>${html}</div>` : empty('box', 'ما عندكش مخزون متاح للبيع.', `<button class="btn amber" data-act="addProduct" data-id="account">${icon('plus')} إضافة منتج</button>`));
  m.el.addEventListener('click', e => { if (e.target.closest('[data-act]')) setTimeout(m.close, 0); });
}

/* ================= التجديد والتذكير ================= */
function renew(f) {
  if (!guardWrite()) return;
  const p = P(f.productId);
  if (accDead(p)) { toast('الحساب نفسه منتهي', 'bad'); return; }
  const start = f.endDate;
  if (start >= p.accountEnd) { toast('الحساب ينتهي مع اشتراك الزبون، ما فيش مدة للتجديد. سجّل "لم يجدد".', 'bad'); return; }
  const maxM = Math.max(1, Math.min(24, monthsCeil(start, p.accountEnd)));
  const m = modal(`تجديد ${esc(f.customerName)}`, `
    <div class="summary"><div><span>الحساب</span><b>${esc(p.name)}، الملف #${f.fileNumber}</b></div><div><span>انتهى/ينتهي في</span><b>${fmtDate(f.endDate)}</b></div></div>
    <div class="grid2 keep"><div class="field"><label>مدة التجديد</label><select id="rM">${monthOpts(maxM)}</select></div>
      <div class="field"><label>السعر</label><input id="rPrice" inputmode="decimal" dir="ltr" value="${num(p.fileSellPrice)}"></div></div>
    <div class="summary" id="rSum"></div>
    <div class="mfoot"><button class="btn teal" id="rGo">${icon('refresh')} تأكيد التجديد</button></div>`);
  const price = $('#rPrice', m.el);
  const calc = () => {
    const mm = +$('#rM', m.el).value, end = Math.min(addMonths(start, mm), p.accountEnd), cost = accCost(p, start, end);
    $('#rSum', m.el).innerHTML = `<div><span>ينتهي الجديد في</span><b>${fmtDate(end)}</b></div><div><span>الربح</span><b class="t-ok">${money(num(price.value) - cost)}</b></div>`;
    return { mm, end, cost };
  };
  price.addEventListener('input', () => { price.dataset.touched = 1; calc(); });
  $('#rM', m.el).onchange = () => { if (!price.dataset.touched) price.value = round2(num(p.fileSellPrice) * +$('#rM', m.el).value); calc(); };
  calc();
  $('#rGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const { mm, end, cost } = calc(), pr = num(price.value);
    const b = writeBatch(db), sref = doc(mcol('sales'));
    b.set(sref, { type: 'account', productId: p.id, productName: p.name, itemId: f.id, itemLabel: `الملف #${f.fileNumber}`, customerId: f.customerId || null, customerName: f.customerName, customerPhone: f.customerPhone || '', price: pr, cost, profit: round2(pr - cost), months: mm, startDate: start, endDate: end, date: Date.now(), status: 'active', isRenewal: true });
    if (f.saleId && S.sales.find(s => s.id === f.saleId)) b.update(mdoc('sales', f.saleId), { status: 'renewed' });
    b.update(mdoc('files', f.id), { endDate: end, saleId: sref.id });
    await b.commit();
    m.close(); toast('تم التجديد');
    deliver(accMsg(p, f.fileNumber, f.customerName, end), f.customerPhone, 'رسالة التجديد');
  });
}
async function notRenewed(f) {
  if (!guardWrite()) return;
  const ok = await confirmBox(`الملف #${f.fileNumber} يرجع متاح للبيع، ويتسجّل إن ${esc(f.customerName)} لم يجدد.<br><br>قبل ما تبيعه لزبون ثاني، غيّر كلمة مرور الحساب أو رمز الملف.`, { ok: 'لم يجدد، حرّر الملف', title: 'تحرير الملف' });
  if (!ok) return;
  try {
    const b = writeBatch(db);
    b.update(mdoc('files', f.id), { status: 'available', customerId: null, customerName: null, customerPhone: null, saleId: null, startDate: null, endDate: null });
    if (f.saleId && S.sales.find(s => s.id === f.saleId)) b.update(mdoc('sales', f.saleId), { status: 'not_renewed' });
    await b.commit(); toast('الملف رجع متاح');
  } catch (e) { toast(e.message, 'bad'); }
}
const remindMsg = f => fill(S.tpl.reminder, { name: f.customerName, product: P(f.productId)?.name || '', file: '#' + f.fileNumber, expiry_date: fmtDate(f.endDate) });
// تذكير مباشر: يفتح واتساب لو الرقم موجود
function remindWa(f) {
  if (normPhone(f.customerPhone)) window.open(waLink(f.customerPhone, remindMsg(f)), '_blank');
  else remind(f);
}
function remind(f) {
  const p = P(f.productId);
  deliver(fill(S.tpl.reminder, { name: f.customerName, product: p?.name || '', file: '#' + f.fileNumber, expiry_date: fmtDate(f.endDate) }), f.customerPhone, 'رسالة التذكير');
}
function fileDetails(f) {
  const st = fileState(f), p = P(f.productId);
  if (st === 'av') return sellAccount({ file: f });
  if (st === 'dead') return;
  const m = modal(`${esc(p.name)}، الملف #${f.fileNumber}`, `
    <div class="summary">
      <div><span>الزبون</span><b>${esc(f.customerName)}</b></div>
      <div><span>واتساب</span><b class="ltr">${esc(f.customerPhone || '—')}</b></div>
      <div><span>من</span><b>${fmtDate(f.startDate)}</b></div>
      <div><span>إلى</span><b>${fmtDate(f.endDate)}</b></div>
      <div><span>الحالة</span><b>${leftText(f.endDate)}</b></div>
    </div>
    <div class="mfoot" style="flex-direction:column">
      <button class="btn ghost" data-act="resendFile" data-id="${f.id}">${icon('send')} إعادة إرسال بيانات الملف</button>
      <button class="btn warn" data-act="remind" data-id="${f.id}">${icon('bell')} تذكير بالتجديد</button>
      <div class="row" style="width:100%"><button class="btn teal" style="flex:1" data-act="renew" data-id="${f.id}">${icon('refresh')} جدّد</button><button class="btn red" style="flex:1" data-act="norenew" data-id="${f.id}">لم يجدد</button></div>
    </div>`);
  m.el.addEventListener('click', e => { if (e.target.closest('[data-act]')) setTimeout(m.close, 0); });
}

/* ================= نماذج المنتجات ================= */
function productForm(type, existing) {
  if (!guardWrite()) return;
  if (type === 'number') return numberForm(existing);
  const ed = !!existing, p = existing || {};
  if (type === 'account') {
    const st = p.accountStart || startOfDay(), en = p.accountEnd || addMonths(startOfDay(), 1);
    const m = modal(ed ? 'تعديل الحساب' : 'إضافة حساب جديد', `
      <div class="field"><label>اسم المنتج</label><input id="aName" list="svcDL" value="${esc(p.name || '')}" placeholder="Netflix"><datalist id="svcDL">${SERVICES.map(s => `<option value="${s}">`).join('')}</datalist></div>
      <div class="field"><label>إيميل الحساب</label><input id="aEmail" dir="ltr" value="${esc(p.email || '')}" placeholder="example@email.com"></div>
      <div class="field"><label>كلمة المرور</label><input id="aPass" dir="ltr" value="${esc(p.password || '')}"></div>
      <div class="grid2 keep"><div class="field"><label>بداية الحساب</label><input id="aStart" type="date" value="${toInput(st)}"></div>
        <div class="field"><label>نهاية الحساب</label><input id="aEnd" type="date" value="${toInput(en)}"></div></div>
      <div class="chips" style="margin:-4px 0 16px">${[1, 2, 3, 6, 12].map(n => `<button type="button" class="chip" data-mm="${n}">+${monthsTxt(n)}</button>`).join('')}</div>
      <div class="grid3 keep">
        <div class="field"><label>عدد الملفات</label><input id="aFiles" type="number" min="${ed ? p.totalFiles : 1}" inputmode="numeric" dir="ltr" value="${p.totalFiles || 5}"></div>
        <div class="field"><label>سعر الشراء</label><input id="aBuy" inputmode="decimal" dir="ltr" value="${p.purchasePrice ?? ''}"></div>
        <div class="field"><label>الملف شهرياً</label><input id="aSell" inputmode="decimal" dir="ltr" value="${p.fileSellPrice ?? ''}"></div></div>
      <div class="field"><label>ملاحظات</label><input id="aNotes" value="${esc(p.notes || '')}"></div>
      ${ed ? '<p class="hint" style="margin-bottom:12px">تقدر تزيد عدد الملفات، لكن ما تقدرش تنقصه.</p>' : ''}
      <div class="mfoot"><button class="btn amber" id="aGo">${icon('check')} ${ed ? 'حفظ التعديل' : 'حفظ'}</button></div>`);
    $$('[data-mm]', m.el).forEach(b => b.onclick = () => { $('#aEnd', m.el).value = toInput(addMonths(fromInput($('#aStart', m.el).value) || startOfDay(), +b.dataset.mm)); });
    $('#aGo', m.el).onclick = e => busy(e.currentTarget, async () => {
      const d = {
        type: 'account', name: $('#aName', m.el).value.trim(), email: $('#aEmail', m.el).value.trim(), password: $('#aPass', m.el).value,
        accountStart: fromInput($('#aStart', m.el).value), accountEnd: fromInput($('#aEnd', m.el).value) + DAY - 1,
        totalFiles: Math.floor(num($('#aFiles', m.el).value)), purchasePrice: num($('#aBuy', m.el).value), fileSellPrice: num($('#aSell', m.el).value), notes: $('#aNotes', m.el).value.trim()
      };
      if (!d.name) throw new Error('اكتب اسم المنتج.');
      if (!d.email) throw new Error('اكتب إيميل الحساب.');
      if (!d.accountStart || d.accountEnd <= d.accountStart) throw new Error('نهاية الحساب لازم تكون بعد البداية.');
      if (d.totalFiles < 1 || d.totalFiles > 50) throw new Error('عدد الملفات من 1 لـ 50.');
      if (ed && d.totalFiles < p.totalFiles) throw new Error(`عدد الملفات ما يقلش عن ${p.totalFiles}.`);
      const b = writeBatch(db);
      const ref = ed ? mdoc('products', p.id) : doc(mcol('products'));
      if (ed) b.update(ref, d); else b.set(ref, { ...d, createdAt: Date.now() });
      const from = ed ? p.totalFiles + 1 : 1;
      for (let i = from; i <= d.totalFiles; i++) b.set(doc(mcol('files')), { productId: ref.id, fileNumber: i, status: 'available', createdAt: Date.now() });
      await b.commit();
      m.close(); toast(ed ? 'تم حفظ التعديل' : `تم إضافة ${d.name} بـ ${d.totalFiles} ملفات`);
      if (!ed) { S.f.ptab = 'account'; }
    });
    return;
  }
  // فئة أكواد
  const m = modal(ed ? 'تعديل فئة الأكواد' : 'إضافة فئة أكواد', `
    <div class="field"><label>اسم الفئة</label><input id="kName" list="codeDL" value="${esc(p.name || '')}" placeholder="ببجي 60 UC"><datalist id="codeDL">${CODE_HINTS.map(s => `<option value="${s}">`).join('')}</datalist></div>
    <div class="grid2 keep"><div class="field"><label>سعر شراء الكود</label><input id="kBuy" inputmode="decimal" dir="ltr" value="${p.purchasePrice ?? ''}"></div>
      <div class="field"><label>سعر بيع الكود</label><input id="kSell" inputmode="decimal" dir="ltr" value="${p.sellPrice ?? ''}"></div></div>
    ${ed ? '' : `<div class="field"><label>الأكواد (كل كود في سطر)</label><textarea id="kCodes" rows="6" dir="ltr" placeholder="XXXX-XXXX-XXXX"></textarea><span class="hint" id="kCount">0 كود</span></div>`}
    <div class="mfoot"><button class="btn amber" id="kGo">${icon('check')} ${ed ? 'حفظ التعديل' : 'حفظ'}</button></div>`);
  const ta = $('#kCodes', m.el);
  if (ta) ta.oninput = () => { $('#kCount', m.el).textContent = `${parseCodes(ta.value).length} كود`; };
  $('#kGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const d = { type: 'code', name: $('#kName', m.el).value.trim(), purchasePrice: num($('#kBuy', m.el).value), sellPrice: num($('#kSell', m.el).value) };
    if (!d.name) throw new Error('اكتب اسم الفئة.');
    if (ed) { await updateDoc(mdoc('products', p.id), d); m.close(); toast('تم حفظ التعديل'); return; }
    const ref = doc(mcol('products'));
    await setDoc(ref, { ...d, createdAt: Date.now() });
    const n = await saveCodes(ref.id, parseCodes(ta.value));
    m.close(); toast(`تم إضافة ${d.name}${n ? ` مع ${n} كود` : ''}`);
  });
}
const parseCodes = t => [...new Set(String(t || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
async function saveCodes(pid, list) {
  const have = new Set(codesOf(pid).map(c => c.code));
  const fresh = list.filter(c => !have.has(c));
  for (let i = 0; i < fresh.length; i += 450) {
    const b = writeBatch(db);
    fresh.slice(i, i + 450).forEach((code, j) => b.set(doc(mcol('codes')), { productId: pid, code, status: 'available', createdAt: Date.now() + i + j }));
    await b.commit();
  }
  return fresh.length;
}
function addCodes(p) {
  if (!guardWrite()) return;
  const m = modal(`إضافة أكواد: ${esc(p.name)}`, `
    <div class="field"><label>الأكواد (كل كود في سطر)</label><textarea id="acT" rows="8" dir="ltr"></textarea><span class="hint" id="acC">0 كود</span></div>
    <div class="mfoot"><button class="btn amber" id="acGo">${icon('plus')} إضافة</button></div>`);
  $('#acT', m.el).oninput = e => { $('#acC', m.el).textContent = `${parseCodes(e.target.value).length} كود`; };
  $('#acGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const list = parseCodes($('#acT', m.el).value);
    if (!list.length) throw new Error('الصق الأكواد أولاً.');
    const n = await saveCodes(p.id, list);
    m.close(); toast(n ? `تم إضافة ${n} كود` : 'الأكواد كلها موجودة من قبل');
  });
}
function viewCodes(p) {
  const list = codesOf(p.id).sort((a, b) => (a.status === 'available' ? 0 : 1) - (b.status === 'available' ? 0 : 1));
  modal(`أكواد ${esc(p.name)}`, list.length ? `<div class="tbl"><table style="min-width:420px"><thead><tr><th>الكود</th><th>الحالة</th><th></th></tr></thead><tbody>${list.map(c => `
    <tr><td><b class="ltr">${esc(c.code)}</b></td><td>${c.status === 'available' ? '<span class="badge ok">متاح</span>' : `<span class="badge off">مباع${c.customerName ? ' لـ ' + esc(c.customerName) : ''}</span>`}</td>
    <td><div class="row" style="flex-wrap:nowrap"><button class="iconbtn sm" data-act="copy" data-v="${esc(c.code)}" aria-label="نسخ">${icon('copy')}</button>${c.status === 'available' ? `<button class="iconbtn sm" data-act="delCode" data-id="${c.id}" aria-label="حذف">${icon('trash')}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : empty('ticket', 'ما فيش أكواد.'), { wide: true });
}
function numberForm(existing) {
  const ed = !!existing, n = existing || {};
  const countries = [...new Set([...S.numbers.map(x => x.country).filter(Boolean), ...COUNTRIES])];
  const m = modal(ed ? 'تعديل الرقم' : 'إضافة رقم', `
    <div class="field"><label>الرقم</label><input id="nNum" type="tel" dir="ltr" value="${esc(n.number || '')}" placeholder="+1 555 000 0000"></div>
    <div class="field"><label>الدولة</label><input id="nCountry" list="ctryDL" value="${esc(n.country || '')}"><datalist id="ctryDL">${countries.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="grid2 keep"><div class="field"><label>سعر الشراء</label><input id="nBuy" inputmode="decimal" dir="ltr" value="${n.purchasePrice ?? ''}"></div>
      <div class="field"><label>سعر البيع</label><input id="nSell" inputmode="decimal" dir="ltr" value="${n.sellPrice ?? ''}"></div></div>
    <div class="field"><label>ملاحظات</label><input id="nNotes" value="${esc(n.notes || '')}"></div>
    <div class="mfoot"><button class="btn amber" id="nGo">${icon('check')} حفظ</button>${ed ? '' : `<button class="btn ghost" id="nMore">${icon('plus')} حفظ وإضافة آخر</button>`}</div>`);
  const save = async again => {
    const d = { number: $('#nNum', m.el).value.trim(), country: $('#nCountry', m.el).value.trim(), purchasePrice: num($('#nBuy', m.el).value), sellPrice: num($('#nSell', m.el).value), notes: $('#nNotes', m.el).value.trim() };
    if (!d.number) throw new Error('اكتب الرقم.');
    if (!d.country) throw new Error('اكتب الدولة.');
    if (S.numbers.some(x => x.number.replace(/\s/g, '') === d.number.replace(/\s/g, '') && x.id !== n.id)) throw new Error('الرقم هذا مضاف من قبل.');
    if (ed) await updateDoc(mdoc('numbers', n.id), d);
    else await setDoc(doc(mcol('numbers')), { ...d, status: 'available', createdAt: Date.now() });
    toast(ed ? 'تم حفظ التعديل' : 'تم إضافة الرقم');
    if (again) { $('#nNum', m.el).value = ''; $('#nNotes', m.el).value = ''; $('#nNum', m.el).focus(); } else m.close();
  };
  $('#nGo', m.el).onclick = e => busy(e.currentTarget, () => save(false));
  if (!ed) $('#nMore', m.el).onclick = e => busy(e.currentTarget, () => save(true));
}
async function delProduct(p) {
  if (!guardWrite()) return;
  const kids = p.type === 'account' ? filesOf(p.id) : codesOf(p.id);
  const soldNow = p.type === 'account' ? kids.filter(f => f.status === 'sold' && f.endDate > Date.now()).length : 0;
  const ok = await confirmBox(`حذف "${esc(p.name)}" مع ${kids.length} ${p.type === 'account' ? 'ملف' : 'كود'}؟ سجل المبيعات يبقى محفوظ.${soldNow ? `<br><br><b class="t-bad">فيه ${soldNow} ملف عليه اشتراك نشط.</b>` : ''}`, { ok: 'حذف', danger: true, title: 'حذف المنتج' });
  if (!ok) return;
  try {
    const refs = [mdoc('products', p.id), ...kids.map(k => mdoc(p.type === 'account' ? 'files' : 'codes', k.id))];
    for (let i = 0; i < refs.length; i += 450) { const b = writeBatch(db); refs.slice(i, i + 450).forEach(r => b.delete(r)); await b.commit(); }
    toast('تم الحذف');
  } catch (e) { toast(e.message, 'bad'); }
}

/* ================= العملاء: نوافذ ================= */
function custForm(c) {
  if (!guardWrite()) return;
  const ed = !!c;
  const m = modal(ed ? 'تعديل العميل' : 'إضافة عميل', `
    <div class="field"><label>الاسم</label><input id="cfName" value="${esc(c?.name || '')}"></div>
    <div class="field"><label>رقم الواتساب</label><input id="cfPhone" type="tel" dir="ltr" value="${esc(c?.phone || '')}" placeholder="09XXXXXXXX"></div>
    <div class="field"><label>ملاحظات</label><textarea id="cfNotes" rows="3">${esc(c?.notes || '')}</textarea></div>
    <div class="mfoot"><button class="btn amber" id="cfGo">${icon('check')} حفظ</button>${ed ? `<button class="btn red" id="cfDel">${icon('trash')} حذف</button>` : ''}</div>`);
  $('#cfGo', m.el).onclick = e => busy(e.currentTarget, async () => {
    const d = { name: $('#cfName', m.el).value.trim(), phone: $('#cfPhone', m.el).value.trim(), notes: $('#cfNotes', m.el).value.trim() };
    if (!d.name) throw new Error('اكتب الاسم.');
    if (S.customers.some(x => x.name === d.name && x.id !== c?.id)) throw new Error('فيه عميل بنفس الاسم. زيد حرف أو لقب يميزه.');
    if (ed) await updateDoc(mdoc('customers', c.id), d); else await setDoc(doc(mcol('customers')), { ...d, createdAt: Date.now() });
    m.close(); toast('تم الحفظ');
  });
  if (ed) $('#cfDel', m.el).onclick = async () => {
    m.close();
    if (await confirmBox(`حذف ${esc(c.name)}؟ مشترياته تبقى في سجل المبيعات.`, { ok: 'حذف', danger: true })) {
      await deleteDoc(mdoc('customers', c.id)).then(() => toast('تم الحذف')).catch(e => toast(e.message, 'bad'));
    }
  };
}
function custDetails(c) {
  const st = custStats(c);
  const active = S.files.filter(f => f.customerId === c.id && f.status === 'sold');
  modal(esc(c.name), `
    <div class="kv" style="margin-bottom:16px"><div><small>المشتريات</small><b>${st.count}</b></div><div><small>الإجمالي</small><b>${money(st.total)}</b></div><div><small>آخر شراء</small><b>${st.last ? fmtDate(st.last) : '—'}</b></div></div>
    ${c.notes ? `<p class="muted" style="margin-bottom:14px">${esc(c.notes)}</p>` : ''}
    ${active.length ? `<h3 style="margin-bottom:10px">اشتراكات حالية</h3><div class="rlist" style="margin-bottom:16px">${active.map(remRow).join('')}</div>` : ''}
    ${st.list.length ? `<h3 style="margin-bottom:10px">سجل المشتريات</h3><div class="tbl"><table>${salesHead()}<tbody>${salesRows(st.list)}</tbody></table></div>` : ''}
    <div class="mfoot" style="margin-top:16px">${c.phone ? `<a class="btn wa" href="${waLink(c.phone, '')}" target="_blank" rel="noopener">${icon('wa')} محادثة واتساب</a>` : ''}<button class="btn ghost" data-act="custForm" data-id="${c.id}">${icon('edit')} تعديل</button></div>`, { wide: true });
}

/* ================= إعادة الإرسال ================= */
function resend(s) {
  if (s.type === 'account') {
    const p = P(s.productId), f = S.files.find(x => x.id === s.itemId);
    if (!p) { toast('المنتج محذوف، ما نقدرش نجيب بياناته', 'bad'); return; }
    deliver(accMsg(p, f?.fileNumber ?? String(s.itemLabel).replace(/\D/g, ''), s.customerName, s.endDate), s.customerPhone);
  } else if (s.type === 'code') deliver(fill(S.tpl.code, { name: s.customerName, product: s.productName, code: s.itemLabel }), s.customerPhone);
  else deliver(fill(S.tpl.number, { name: s.customerName, country: s.country || '', number: s.itemLabel }), s.customerPhone);
}

/* ================= الأحداث ================= */
const F = id => S.files.find(f => f.id === id);
const ACTS = {
  tile: id => { const f = F(id); f && fileDetails(f); },
  renew: id => { const f = F(id); f && renew(f); },
  norenew: id => { const f = F(id); f && notRenewed(f); },
  remind: id => { const f = F(id); f && remind(f); },
  remindWa: id => { const f = F(id); f && remindWa(f); },
  rtab: id => { S.f.rtab = id; vReminders(); },
  tplTest: id => {
    const own = S.profile.phone; const txt = fill($('#tpl_' + id)?.value || S.tpl[id], { ...TPL_SAMPLE, name: t(TPL_SAMPLE.name), country: t(TPL_SAMPLE.country), expiry_date: fmtDate(addMonths(Date.now(), 1)) });
    if (!normPhone(own)) { toast(t('أضف رقم واتسابك في "بياناتك" أولاً.'), 'bad'); return; }
    window.open(waLink(own, txt), '_blank');
  },
  resendFile: id => { const f = F(id); const s = f && S.sales.find(x => x.id === f.saleId); s ? resend(s) : f && deliver(accMsg(P(f.productId), f.fileNumber, f.customerName, f.endDate), f.customerPhone); },
  sellProd: id => { const p = P(id); if (!p) return; p.type === 'account' ? sellAccount({ product: p }) : sellCode({ product: p }); },
  sellNum: id => sellNumber(S.numbers.find(n => n.id === id)),
  quickSell, goNumbers: () => { S.f.ptab = 'number'; location.hash = '#products'; render(true); },
  addProduct: id => productForm(id || 'account'),
  editProd: id => { const p = P(id); p && productForm(p.type, p); },
  delProd: id => { const p = P(id); p && delProduct(p); },
  addCodes: id => { const p = P(id); p && addCodes(p); },
  viewCodes: id => { const p = P(id); p && viewCodes(p); },
  delCode: async (id, b) => { if (!guardWrite()) return; await deleteDoc(mdoc('codes', id)).catch(e => toast(e.message, 'bad')); b.closest('tr')?.remove(); toast('تم حذف الكود'); },
  editNum: id => { if (!guardWrite()) return; const n = S.numbers.find(x => x.id === id); n && numberForm(n); },
  delNum: async id => { if (!guardWrite()) return; const n = S.numbers.find(x => x.id === id); if (n && await confirmBox(`حذف الرقم ${esc(n.number)}؟`, { ok: 'حذف', danger: true })) deleteDoc(mdoc('numbers', id)).then(() => toast('تم الحذف')).catch(e => toast(e.message, 'bad')); },
  ptab: id => { S.f.ptab = id; vProducts(); animate(view); },
  fst: id => { S.f.fst = id; vFiles(); },
  filesOf: id => { S.f.fprod = id; S.f.fst = 'all'; location.hash = '#files'; },
  copy: (id, b) => copyText(b.dataset.v),
  reveal: (id, b) => { const sp = b.parentElement.querySelector('[data-pw]'); const on = sp.textContent === sp.dataset.pw; sp.textContent = on ? '••••••••' : sp.dataset.pw; },
  cust: id => { const c = S.customers.find(x => x.id === id); c && custDetails(c); },
  custForm: (id, b, e) => { e.stopPropagation(); custForm(S.customers.find(x => x.id === id)); },
  resend: id => { const s = S.sales.find(x => x.id === id); s && resend(s); },
  insVar: (id, b) => { const t = $('#' + id); const v = b.dataset.v, s = t.selectionStart ?? t.value.length; t.value = t.value.slice(0, s) + v + t.value.slice(t.selectionEnd ?? s); t.focus(); t.selectionStart = t.selectionEnd = s + v.length; },
  subscribe: () => { if (needsVerify()) { render(true); return; } const m = modal('الاشتراك', `<div id="subBoxM">${subscribeHTML()}</div>`, { wide: true }); bindSubscribe($('#subBoxM', m.el)); },
  bannerGo: id => showBanner(+id)
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const fn = ACTS[b.dataset.act];
  if (!fn || e.target.closest('[data-stop]')) return;
  e.preventDefault();
  fn(b.dataset.id, b, e);
});

/* ================= البحث العام ================= */
const q = $('#q'), sres = $('#sres');
q.addEventListener('input', () => {
  const t = q.value.trim().toLowerCase();
  if (!t) { sres.hidden = true; return; }
  const out = [];
  S.customers.filter(c => [c.name, c.phone].some(v => String(v || '').toLowerCase().includes(t))).slice(0, 4)
    .forEach(c => out.push(`<a href="#" data-sr="cust" data-id="${c.id}"><span>${esc(c.name)}</span><small>عميل</small></a>`));
  S.products.filter(p => [p.name, p.email].some(v => String(v || '').toLowerCase().includes(t))).slice(0, 4)
    .forEach(p => out.push(`<a href="#" data-sr="prod" data-id="${p.id}"><span>${esc(p.name)}</span><small>${p.type === 'account' ? 'حساب' : 'أكواد'}</small></a>`));
  S.numbers.filter(n => String(n.number).replace(/\s/g, '').includes(t.replace(/\s/g, ''))).slice(0, 3)
    .forEach(n => out.push(`<a href="#" data-sr="num" data-id="${n.id}"><span class="ltr">${esc(n.number)}</span><small>رقم ${esc(n.country)}</small></a>`));
  sres.innerHTML = out.join('') || '<div class="empty" style="padding:14px">ما فيش نتائج</div>';
  sres.hidden = false;
});
q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('a', sres)?.click(); } if (e.key === 'Escape') { sres.hidden = true; q.blur(); } });
sres.addEventListener('click', e => {
  const a = e.target.closest('[data-sr]'); if (!a) return;
  e.preventDefault(); sres.hidden = true; q.value = '';
  const id = a.dataset.id;
  if (a.dataset.sr === 'cust') { const c = S.customers.find(x => x.id === id); c && custDetails(c); }
  else if (a.dataset.sr === 'prod') { const p = P(id); S.f.ptab = p.type; location.hash === '#products' ? render(true) : location.hash = '#products'; }
  else { const n = S.numbers.find(x => x.id === id); S.f.ptab = 'number'; S.f.nq = n.number; location.hash === '#products' ? render(true) : location.hash = '#products'; }
});
document.addEventListener('click', e => { if (!e.target.closest('.search')) sres.hidden = true; });
