// ملفي — متجر التاجر: الإنشاء، المنتجات، التصميم، الطلبات، المحفظة
import {
  db, $, $$, esc, num, icon, toast, modal, confirmBox, busy, empty, skeleton, fmtDate, fmtShort, ago, tsMs, DAY, addMonths, monthsTxt,
  toInput, fromInput, normPhone, waLink, copyText, compressImage, safeImg, apiPost, storeUrl, ROOT_DOMAIN, t, isEN, pushCardHTML,
  collection, doc, onSnapshot, query, where, setDoc, getDoc, updateDoc
} from './core.js';
import { TEMPLATES, PALETTES, FONTS, CARDS, CORNERS, SECTIONS, CAT_ICONS, normDesign, normSections, colorsOf, ic as sic } from './store-theme.js';

let A = null;            // سياق لوحة التاجر (من app.js)
const M = {
  store: undefined, items: [], open: [], hist: [], wallet: null, payouts: [], ledger: [], priv: null,
  otab: 'todo', ed: null, edTab: 'tpl', wiz: null, unsubs: [], syncT: 0, lastOrderIds: null
};
const CUR = { LYD: ['د.ل', 'دينار ليبي'], SAR: ['ر.س', 'ريال سعودي'] };
const sym = () => CUR[M.store?.currency]?.[0] || 'د.ل';
const money = (n, s = sym()) => `⁦${(Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${esc(s)}⁩`;
const minPay = () => Math.max(0, +A?.S?.platform?.minPayout?.[M.store?.currency] || 0);
const wDays = () => Math.min(30, Math.max(1, Math.floor(+A?.S?.platform?.warrantyDays) || 7));
function warrLine(o) {
  const dl = o.deliveredAt, now = Date.now();
  const hd = o.holdDays ?? wDays(), md = o.wDays ?? wDays();
  if (md === 0) return t('بدون ضمان، والأرباح تتحول فوراً بعد التسليم.');
  const parts = [];
  if (hd > 0) parts.push(now < dl + hd * DAY ? `${t('ضمان ملفي لين')} ${fmtDate(dl + hd * DAY)}` : t('ضمان ملفي انتهى'));
  if (md > hd) parts.push(now < dl + md * DAY ? `${t('ضمانك لين')} ${fmtDate(dl + md * DAY)}` : t('ضمانك انتهى'));
  return parts.join(' · ');
}
const round2 = n => Math.round((+n || 0) * 100) / 100;
const uid = () => A.uid();
const sref = () => doc(db, 'stores', uid());
const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'email', 'smtp', 'ftp', 'cdn', 'static', 'assets', 'img', 'images', 'store', 'stores', 'shop', 'help', 'support', 'status', 'blog', 'docs', 'dev', 'test', 'staging', 'beta', 'malafy', 'malafi', 'ns1', 'ns2', 'root', 'billing', 'pay', 'payment', 'payments', 'secure', 'login', 'account', 'accounts', 'dashboard', 'panel'];
const slugOk = s => /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/.test(s) && !s.includes('--') && !RESERVED.includes(s);
const monthKey = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const ORD_ST = { awaiting: ['warn', 'بانتظار الدفع'], preparing: ['info', 'للتسليم'], delivered: ['ok', 'تم التسليم'], completed: ['off', 'مكتمل'], problem: ['bad', 'بلاغ'], refunded: ['off', 'مرجّع'], rejected: ['bad', 'مرفوض'], cancelled: ['off', 'ملغي'] };
const TYPE_LBL = { account: 'ملفات حساب', code: 'أكواد', number: 'أرقام', manual: 'خدمة يدوية' };
const TYPE_IC = { account: 'tv', code: 'ticket', number: 'phone', manual: 'bolt' };

/* ===================== الصلاحية ===================== */
export function storeAllowed() {
  const p = A.S.profile;
  if (!A.isActive() || p.status === 'deleted') return false;
  if (p.storeAccess === true) return true;
  if (p.plan?.trial) return A.S.platform.trialStore === true;
  return A.S.plans.find(x => x.id === p.plan?.id)?.storeEnabled === true;
}

/* ===================== الاشتراكات اللحظية ===================== */
export function setupStore(ctx) { A = ctx; }
export function startStore() {
  if (M.unsubs.length) return;
  const err = e => { console.error(e); };
  const ids = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  const now = Date.now(), months = [monthKey(now), monthKey(addMonths(now, -1))];
  // استعلام بشرطين؛ لو Firestore طلب فهرس مركّب نرجع لشرط واحد ونفلتر هنا
  const live = (coll, extra, test, cb) => {
    let un = onSnapshot(query(collection(db, coll), where('storeId', '==', uid()), extra), s => cb(ids(s)), e => {
      if (e?.code !== 'failed-precondition') return err(e);
      un = onSnapshot(query(collection(db, coll), where('storeId', '==', uid())), s => cb(ids(s).filter(test)), err);
    });
    return () => un();
  };
  M.unsubs = [
    onSnapshot(sref(), s => { M.store = s.exists() ? { id: s.id, ...s.data() } : null; A.refresh(); }, e => { M.store = null; err(e); A.refresh(); }),
    onSnapshot(collection(db, 'stores', uid(), 'items'), s => { M.items = ids(s); A.refresh(); scheduleSync(); }, err),
    live('orders', where('open', '==', true), o => o.open === true, l => { M.open = l; notifyNew(); A.refresh(); }),
    live('orders', where('month', 'in', months), o => months.includes(o.month), l => { M.hist = l; A.refresh(); }),
    onSnapshot(doc(db, 'wallets', uid()), s => { M.wallet = s.exists() ? s.data() : null; A.refresh(); }, err),
    onSnapshot(query(collection(db, 'payouts'), where('storeId', '==', uid())), s => { M.payouts = ids(s).sort((a, b) => b.createdAt - a.createdAt); A.refresh(); }, err),
    live('ledger', where('month', 'in', months), l => months.includes(l.month), l => { M.ledger = l.sort((a, b) => b.at - a.at); A.refresh(); }),
    onSnapshot(doc(db, 'storePrivate', uid()), s => { M.priv = s.exists() ? s.data() : null; }, err)
  ];
}
export function stopStore() { M.unsubs.forEach(u => u()); M.unsubs = []; M.store = undefined; M.items = []; M.open = []; M.hist = []; M.lastOrderIds = null; }
const orders = () => { const m = new Map(); [...M.hist, ...M.open].forEach(o => m.set(o.id, o)); return [...m.values()].sort((a, b) => b.createdAt - a.createdAt); };
const todo = () => M.open.filter(o => o.status === 'preparing' || o.status === 'problem' || o.claim?.open);
const stOf = o => o.claim?.open ? ['bad', 'بلاغ ضمان'] : (ORD_ST[o.status] || ['off', o.status]);
function notifyNew() {
  const ids = new Set(todo().map(o => o.id + o.status + (o.claim?.open ? 'c' : '')));
  if (M.lastOrderIds && [...ids].some(x => !M.lastOrderIds.has(x))) { toast(t('طلب جديد يحتاج تسليم في متجرك')); beep(); }
  M.lastOrderIds = ids;
}
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = .08; o.connect(g); g.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close(); }, 180); } catch { } }
// للجرس في الأعلى
export function storeBell() {
  const list = todo();
  return { n: list.length, html: list.slice(0, 4).map(o => `<a class="bellitem soon" href="#store/orders"><b>${esc(o.customer?.name || '')} · #${esc(o.id)}</b><small>${o.claim?.open ? t('بلاغ ضمان') : o.status === 'problem' ? t('بلاغ من الزبون') : t('طلب للتسليم')}</small></a>`).join('') };
}

/* ===================== مزامنة المخزون مع المتجر ===================== */
// كل ما يتغير المخزون (ملفات، أكواد، أرقام) نحدّث الكميات المعروضة في المتجر
export function scheduleSync() { clearTimeout(M.syncT); M.syncT = setTimeout(syncStock, 1200); }
const maskNumber = n => { const s = String(n || ''); const total = (s.match(/\d/g) || []).length; let i = 0; return s.replace(/\d/g, c => { const k = i++; return k < 3 || k >= total - 2 ? c : '•'; }); };
// شهر = 30 يوم بالضبط
function monthsAvail(accountEnd) { const now = Date.now(); let m = 0; while (m < 24 && now + (m + 1) * 30 * DAY - DAY <= accountEnd) m++; return m; }
// المدد والتواريخ تنحسب من مخزون ملفي: كل حساب يطلع بتاريخ نهايته، والسعر = سعر الشهر ÷ 30 × الأيام
// سعر الشهر في المتجر = «الملف شهرياً» في حسابات ملفي
async function syncAccPrice(ids, price) {
  const ps = A.S.products.filter(p => ids.includes(p.id) && round2(p.fileSellPrice) !== price);
  for (const p of ps) { try { await updateDoc(doc(db, 'merchants', uid(), 'products', p.id), { fileSellPrice: price }); } catch (e) { console.warn('price link', e); } }
}
const durLbl = d => { const m = Math.floor(d / 30), r = d % 30; const mt = m ? t(monthsTxt(m)) : ''; const rt = r ? `${r} ${r === 1 ? t('يوم') : r === 2 ? t('يومين') : r <= 10 ? t('أيام') : t('يوم')}` : ''; return m && r ? `${mt} ${t('و')}${rt}` : mt || rt; };
function linkedAccounts(it) { const pids = new Set(it.productIds || []); return A.S.products.filter(p => pids.has(p.id) && p.type === 'account'); }
function monthPriceOf(it) {
  const ps = linkedAccounts(it).map(p => round2(p.fileSellPrice)).filter(x => x > 0);
  if (!ps.length) return round2(it.monthPrice) || 0;
  const cnt = {}; ps.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
  return +Object.entries(cnt).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}
function accountStock(it) {
  const S = A.S, now = Date.now(), prods = linkedAccounts(it), mp = monthPriceOf(it);
  let stock = 0, maxMonths = 0;
  const byEnd = new Map();
  prods.forEach(p => {
    const end = +p.accountEnd || 0;
    const av = S.files.filter(f => f.productId === p.id && f.status === 'available').length;
    if (!av || end <= now + DAY) return;
    const mm = monthsAvail(end);
    if (mm >= 1) { stock += av; maxMonths = Math.max(maxMonths, mm); }
    const days = Math.round((end - now) / DAY);
    const price = round2((round2(p.fileSellPrice) || mp) / 30 * days);
    const x = byEnd.get(end) || { d: end, price: 0, n: 0 };
    x.price = Math.max(x.price, price); x.n += av; byEnd.set(end, x);
  });
  const months = (it.durMonths && it.durMonths.length ? it.durMonths : (it.durations || []).map(d => d.m)).filter(m => m >= 1 && m <= 24);
  const durations = mp > 0 ? [...new Set(months)].sort((a, b) => a - b).map(m => ({ m, price: round2(mp * m) })) : [];
  const exact = new Set(durations.map(d => d.m * 30));
  const list = [...byEnd.values()].filter(u => u.price > 0 && !exact.has(Math.round((u.d - now) / DAY))).sort((a, b) => a.d - b.d).slice(0, 40);
  return { stock, maxMonths, monthPrice: mp, durations, untils: list.map(u => ({ d: u.d, price: u.price })), untilN: list.map(u => ({ d: u.d, n: u.n })) };
}
function computeStock(it) {
  const S = A.S;
  if (it.type === 'code') return { stock: S.codes.filter(c => c.productId === it.productId && c.status === 'available').length };
  if (it.type === 'account') {
    return accountStock(it);
  }
  if (it.type === 'number') {
    const av = S.numbers.filter(n => n.status === 'available');
    const cs = {}; av.forEach(n => { cs[n.country] = (cs[n.country] || 0) + 1; });
    const countries = Object.entries(cs).map(([country, n]) => ({ country, n })).sort((a, b) => a.country.localeCompare(b.country, 'ar'));
    if (it.mode === 'pick') {
      const numbers = av.filter(n => num(n.sellPrice) > 0).sort((a, b) => num(a.createdAt) - num(b.createdAt)).slice(0, 80).map(n => ({ id: n.id, mask: maskNumber(n.number), country: n.country || '', price: round2(n.sellPrice) }));
      return { stock: numbers.length, numbers, countries };
    }
    const priced = new Set((it.prices || []).map(p => p.country));
    return { stock: countries.filter(c => priced.has(c.country)).reduce((a, c) => a + c.n, 0), countries };
  }
  return { stock: (it.packs || []).length ? 999 : 0 };
}
async function syncStock() {
  if (!M.store || !storeAllowed() || !A.loaded()) return;
  const diff = [];
  for (const it of M.items) {
    const st = computeStock(it);
    const cur = {}; Object.keys(st).forEach(k => cur[k] = it[k] ?? null);
    if (JSON.stringify(cur) !== JSON.stringify(st)) diff.push({ id: it.id, ...st });
  }
  if (!diff.length || M.syncing) return;
  M.syncing = true;
  try { for (let i = 0; i < diff.length; i += 60) await apiPost('/m/items/sync', { items: diff.slice(i, i + 60) }); }
  catch (e) { console.warn('sync', e); }
  finally { M.syncing = false; }
}

/* ===================== الواجهة: الهيكل ===================== */
const SUBS = [['', 'home', 'متجري'], ['orders', 'receipt', 'الطلبات'], ['cats', 'layers', 'الأقسام'], ['items', 'box', 'المنتجات'], ['design', 'palette', 'التصميم'], ['wallet', 'wallet', 'المحفظة'], ['settings', 'sliders', 'الإعدادات']];
function subnav(cur) {
  const n = todo().length;
  return `<div class="chips scrollx rv" style="margin-bottom:18px">${SUBS.map(([k, i, l]) => `<a class="chip ${cur === k ? 'on' : ''}" href="#store${k ? '/' + k : ''}" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">${icon(i)}${k === 'cats' ? `<span data-raw>${isEN ? 'Categories' : 'الأقسام'}</span>` : l}${k === 'orders' && n ? ` <b class="sbadge">${n}</b>` : ''}</a>`).join('')}</div>`;
}
export function storeView(sub) {
  const view = A.view;
  if (M.store === undefined) { view.innerHTML = `<div class="card">${skeleton(4)}</div>`; return; }
  const allowed = storeAllowed();
  if (!M.store) {
    if (!allowed) { view.innerHTML = lockedHTML(); return; }
    return wizardView();
  }
  const fns = { '': dashView, orders: ordersView, cats: catsView, items: itemsView, design: designView, wallet: walletView, settings: settingsView };
  (fns[sub] || dashView)();
}
function lockedHTML() {
  return `<div class="gate"><section class="hero rv" style="margin-bottom:22px"><h1>${t('متجرك الخاص')}</h1><p class="muted">${t('متجر باسمك ورابطك، الزبون يشتري ويدفع، والطلبات تتسلّم تلقائياً من مخزونك.')}</p></section>
    <section class="card rv">${empty('store', t('المتجر متاح في خطط معيّنة. جدّد أو رقّي اشتراكك لخطة فيها متجر.'), `<button class="btn amber" data-act="subscribe">${icon('card')} ${t('الخطط')}</button>`)}</section></div>`;
}
function closedReason() {
  const s = M.store;
  if (!storeAllowed()) return t('متجرك مقفول للزبائن لأن خطتك الحالية ما فيهاش متجر، أو اشتراكك انتهى.');
  if (s.suspended) return t('الإدارة أوقفت متجرك مؤقتاً. تواصل مع الدعم.');
  if (s.status !== 'active') return t('متجرك موقّف من عندك، الزبائن ما يقدروش يطلبوا.');
  return '';
}

/* ===================== الرئيسية ===================== */
function dashView() {
  const s = M.store, url = storeUrl(s.slug), w = M.wallet || {};
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const os = orders();
  const paidToday = os.filter(o => o.paidAt >= today.getTime() && !['refunded'].includes(o.status));
  const awaiting = M.open.filter(o => o.status === 'awaiting').length;
  const why = closedReason();
  const checklist = [
    [(s.categories || []).length > 0, 'أضف أقسام متجرك', '#store/cats'],
    [M.items.length > 0, 'أضف أول منتج للمتجر', '#store/items'],
    [storeMethods().length > 0 && (!Array.isArray(s.payMethods) || s.payMethods.length > 0), 'اختار طرق الدفع اللي تظهر في متجرك', '#store/settings'],
    [!!s.logo, 'ارفع شعار المتجر', '#store/design'],
    [!!(M.priv?.payout?.details), 'حدد وين توصلك أرباحك', '#store/settings'],
    [!!s.info?.whatsapp, 'أضف رقم واتساب المتجر', '#store/design']
  ].filter(x => !x[0]);
  A.view.innerHTML = `
  <div class="pagehead rv"><div><h1 data-raw>${esc(s.name)}</h1><p>${t('متجرك على رابط خاص، بهويتك أنت')}</p></div></div>
  ${subnav('')}
  ${why ? `<div class="card rv" style="border-color:rgba(239,68,68,.4);margin-bottom:16px"><p class="t-bad">${icon('alert')} ${why}</p></div>` : ''}
  <section class="card glow rv" style="margin-bottom:16px">
    <div class="chead"><div><h2>${t('رابط متجرك')}</h2><p>${t('ابعته لزباينك، وكل شي يتم من هناك')}</p></div>
      <label class="row small"><span class="toggle"><input type="checkbox" id="stOpen" ${s.status === 'active' ? 'checked' : ''} ${storeAllowed() ? '' : 'disabled'}><span></span></span>${t('استقبال الطلبات')}</label></div>
    <div class="linkbox"><b class="ltr" data-raw>${esc(url.replace('https://', ''))}</b></div>
    <div class="row"><button class="btn amber sm" data-act="stCopy">${icon('copy')} ${t('نسخ')}</button><a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">${icon('ext')} ${t('افتح المتجر')}</a><button class="btn ghost sm" data-act="stShare">${icon('share')} ${t('مشاركة')}</button></div>
  </section>
  <section class="today rv" style="margin-bottom:16px">
    <div><small>${t('مبيعات اليوم')}</small><b class="num">${money(paidToday.reduce((a, o) => a + num(o.subtotal), 0))}</b></div>
    <div><small>${t('للتسليم')}</small><b class="num t-amber">${todo().length}</b></div>
    <div><small>${t('بانتظار الدفع')}</small><b class="num">${awaiting}</b></div>
  </section>
  <div class="mini2 rv" style="margin-bottom:16px">
    <a class="mini" href="#store/wallet"><small>${t('قابل للسحب')}</small><b class="num t-ok">${money(w.available)}</b></a>
    <a class="mini" href="#store/wallet"><small>${t('رصيد معلّق')}</small><b class="num">${money(w.pending)}</b></a>
  </div>
  ${pushCardHTML(t('فعّل الإشعارات باش يوصلك تنبيه أول ما يجي طلب جديد، أو بلاغ من زبون، أو تتحول أرباحك.'))}
  <div style="height:16px"></div>
  ${checklist.length ? `<section class="card rv" style="margin-bottom:16px"><div class="chead"><h2>${t('كمّل تجهيز متجرك')}</h2></div><div class="rems">${checklist.map(([, l, h]) => `<a class="rem" href="${h}" style="grid-template-columns:auto 1fr auto;text-decoration:none;color:inherit"><span class="dot"></span><b style="font-size:14px">${t(l)}</b>${icon('arrow')}</a>`).join('')}</div></section>` : ''}
  <section class="card rv"><div class="chead"><h2>${t('آخر الطلبات')}</h2><a class="link" href="#store/orders">${t('عرض الكل')}</a></div>
    ${os.length ? `<div class="oplist">${os.slice(0, 5).map(orderRow).join('')}</div>` : empty('receipt', t('ما فيش طلبات للحين. شارك رابط متجرك!'))}</section>`;
  const tg = $('#stOpen');
  if (tg) tg.onchange = async () => {
    tg.disabled = true;
    try { await apiPost('/m/store/save', { status: tg.checked ? 'active' : 'paused' }); toast(tg.checked ? t('المتجر يستقبل الطلبات') : t('تم إيقاف استقبال الطلبات')); }
    catch (e) { tg.checked = !tg.checked; toast(e.message, 'bad'); }
    tg.disabled = false;
  };
}
function orderRow(o) {
  const st = stOf(o);
  const what = (o.items || []).map(i => i.name + (i.qty > 1 ? ` ×${i.qty}` : '')).join('، ');
  return `<button type="button" class="op" data-act="stOrder" data-id="${esc(o.id)}" style="width:100%;background:none;border-inline:0;border-bottom:0;color:inherit;text-align:start;cursor:pointer">
    <div><b><span data-raw>${esc(o.customer?.name || '')}</span> <small class="dim num" style="display:inline">#${esc(o.id)}</small></b><small data-raw>${esc(what)}</small><small>${ago(o.createdAt)}</small></div>
    <div class="opr"><b class="num">${money(o.subtotal)}</b><span class="badge ${st[0]}">${t(st[1])}</span></div></button>`;
}

/* ===================== الطلبات ===================== */
function ordersView() {
  const os = orders();
  const tabs = { todo: o => ['preparing', 'problem'].includes(o.status) || !!o.claim?.open, awaiting: o => o.status === 'awaiting', done: o => ['delivered', 'completed'].includes(o.status), all: () => true };
  const list = os.filter(tabs[M.otab] || tabs.todo);
  A.view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('طلبات المتجر')}</h1><p>${t('الطلب يوصلك بعد ما ملفي تأكد الدفع')}</p></div></div>
  ${subnav('orders')}
  <div class="chips scrollx rv" style="margin-bottom:14px">${[['todo', 'للتسليم'], ['awaiting', 'بانتظار الدفع'], ['done', 'مسلّمة'], ['all', 'الكل']].map(([k, l]) => `<button class="chip ${M.otab === k ? 'on' : ''}" data-act="stOtab" data-id="${k}">${t(l)} <span class="dim">${os.filter(tabs[k]).length}</span></button>`).join('')}</div>
  <div class="card rv" style="margin-bottom:12px;padding:14px 18px;font-size:13px;color:var(--ok-t);background:rgba(43,179,168,.08);border-color:rgba(43,179,168,.3)">${icon('shield')} ${t('الأكواد والأرقام والحسابات تتسلّم للزبون تلقائياً. الخدمات اليدوية تسلّمها أنت من هنا.')}</div>
  <section class="card rv">${list.length ? `<div class="oplist">${list.map(orderRow).join('')}</div>` : empty('receipt', t('ما فيش طلبات هنا.'))}</section>
  <p class="hint rv" style="margin-top:10px">${t('يظهر هنا طلبات الشهر هذا واللي قبله، والطلبات المفتوحة كلها.')}</p>`;
}
async function orderDetails(o) {
  const st = stOf(o);
  const paid = !['awaiting', 'rejected', 'cancelled'].includes(o.status);
  let sec = null;
  if (paid) { try { const s = await getDoc(doc(db, 'orderSecrets', o.id)); sec = s.exists() ? s.data() : null; } catch { } }
  const linesOf = i => (sec?.lines || []).find(l => l.line === i)?.items || [];
  const canDeliver = ['preparing', 'problem', 'delivered'].includes(o.status);
  const m = modal(`${t('طلب')} #${esc(o.id)}`, `
    <div class="row" style="margin-bottom:14px"><span class="badge ${st[0]}">${t(st[1])}</span><span class="spacer"></span><small class="dim">${fmtDate(o.createdAt)} · ${ago(o.createdAt)}</small></div>
    <div class="summary"><div><span>${t('الزبون')}</span><b data-raw>${esc(o.customer?.name)}</b></div><div><span>${t('واتساب')}</span><b class="ltr" data-raw>${esc(o.customer?.phone)}</b></div></div>
    ${o.deliveredAt ? `<p class="hint" style="margin-bottom:14px">${icon('shield')} ${warrLine(o)}${o.received ? ' · ' + t('الزبون أكد إن كل شي تمام') : ''}</p>` : ''}
    ${o.claim ? `<div class="card" style="padding:14px;margin-bottom:14px;border-color:rgba(239,68,68,.4)"><b class="t-bad">${icon('alert')} ${t('بلاغ على ضمانك')}</b>${o.claim.open ? '' : ` <span class="badge ok">${t('انحل')}</span>`}<p data-raw style="margin:6px 0">${esc(o.claim.text)}</p>
      <p class="small muted" style="margin-bottom:6px">${t('ضمان ملفي خلص وأرباح الطلب اتحولتلك، والزبون يبلّغ على ضمانك أنت. تواصل معاه وحل المشكلة.')}</p>
      ${o.claim.reply ? `<p class="small muted">${t('ردك')}: <span data-raw>${esc(o.claim.reply)}</span></p>` : ''}
      ${o.claim.open ? `<div class="field" style="margin:10px 0 8px"><textarea id="odReply" maxlength="800" placeholder="${t('ردك على الزبون…')}"></textarea></div><button class="btn ghost sm" id="odReplyBtn">${icon('send')} ${t('إرسال الرد')}</button>` : ''}</div>` : ''}
    ${o.status === 'awaiting' ? `<p class="hint" style="margin-bottom:14px">${t('بانتظار تأكيد الدفع من ملفي. ما تسلّمش حاجة قبل التأكيد.')}</p>` : ''}
    ${o.problem ? `<div class="card" style="padding:14px;margin-bottom:14px;border-color:rgba(239,68,68,.4)"><b class="t-bad">${icon('alert')} ${o.problem.by === 'system' ? t('ملاحظة النظام') : t('بلاغ الزبون')}</b><p data-raw style="margin:6px 0">${esc(o.problem.text)}</p>
      ${o.problem.reply ? `<p class="small muted">${t('ردك')}: <span data-raw>${esc(o.problem.reply)}</span></p>` : ''}
      ${o.status === 'problem' ? `<div class="field" style="margin:10px 0 8px"><textarea id="odReply" maxlength="800" placeholder="${t('ردك على الزبون…')}"></textarea></div><button class="btn ghost sm" id="odReplyBtn">${icon('send')} ${t('إرسال الرد')}</button>` : ''}</div>` : ''}
    <div class="rems" style="margin-bottom:14px">${(o.items || []).map((x, i) => {
      const done = x.status === 'delivered', ls = linesOf(i);
      return `<div class="rem" style="grid-template-columns:1fr;gap:8px"><div class="row"><b data-raw>${esc(x.name)}${x.opt ? ` · ${esc(x.opt)}` : ''}${x.qty > 1 ? ` × ${x.qty}` : ''}</b><span class="spacer"></span><span class="badge ${done ? 'ok' : x.status === 'failed' ? 'bad' : 'warn'}">${t(done ? 'تم التسليم' : x.status === 'failed' ? 'تعذر التسليم' : paid ? 'للتسليم' : 'محجوز')}</span></div>
        ${(x.input || []).map(f => `<div class="row small"><span class="muted" data-raw>${esc(f.label)}:</span><span class="ltr" style="font-weight:700" data-raw>${esc(f.value)}</span><button class="iconbtn sm" data-act="copy" data-v="${esc(f.value)}" aria-label="${t('نسخ')}">${icon('copy')}</button></div>`).join('')}
        ${ls.length ? `<div class="small muted" data-raw>${ls.map(l => `${esc(l.l)}: <span class="ltr" style="font-weight:700">${esc(l.v)}</span>`).join('<br>')}</div>` : ''}
        ${!done && canDeliver && paid ? `<div class="field" style="margin:0"><textarea data-dl="${i}" rows="2" maxlength="1500" placeholder="${t('رسالة التسليم للزبون (مثلاً: تم الشحن، أو الكود)')}"></textarea></div><button class="btn teal sm" data-dlb="${i}">${icon('check')} ${t('تم التسليم')}</button>` : ''}</div>`;
    }).join('')}</div>
    <div class="summary"><div><span>${t('أرباحك من الطلب')}</span><b class="num t-ok">${money(o.subtotal)}</b></div><div><span>${t('رسوم الخدمة (يدفعها الزبون)')}</span><b class="num">${money(o.fee)}</b></div><div><span>${t('دفع الزبون')}</span><b class="num">${money(o.total)}</b></div></div>
    <div class="mfoot">${o.customer?.phone ? `<button class="btn wa" id="odWa">${icon('wa')} ${t('واتساب الزبون')}</button>` : ''}</div>`, { wide: true });
  const el = m.el;
  $$('[data-dlb]', el).forEach(b => b.onclick = () => busy(b, async () => {
    const i = +b.dataset.dlb, text = $(`[data-dl="${i}"]`, el).value.trim();
    if (!text) throw new Error(t('اكتب رسالة التسليم.'));
    await apiPost(`/m/orders/${o.id}/deliver`, { idx: i, text });
    toast(t('تم التسليم')); m.close();
  }));
  const rb = $('#odReplyBtn', el);
  if (rb) rb.onclick = () => busy(rb, async () => {
    const text = $('#odReply', el).value.trim(); if (!text) throw new Error(t('اكتب ردك.'));
    await apiPost(`/m/orders/${o.id}/reply`, { text }); toast(t('تم إرسال الرد')); m.close();
  });
  const wb = $('#odWa', el);
  if (wb) wb.onclick = () => {
    const ready = (o.items || []).map((x, i) => { const ls = linesOf(i); return ls.length ? `${x.name}${x.opt ? ' · ' + x.opt : ''}\n${ls.map(l => `${l.l}: ${l.v}`).join('\n')}` : ''; }).filter(Boolean).join('\n\n');
    const msg = `${t('مرحباً')} ${o.customer?.name || ''} 👋\n${t('بخصوص طلبك رقم')} #${o.id}${ready ? '\n\n' + ready : ''}`;
    window.open(waLink(o.customer.phone, msg), '_blank');
  };
}

/* ===================== المنتجات ===================== */
function itemsView() {
  const list = [...M.items].sort((a, b) => num(a.order) - num(b.order) || String(a.name).localeCompare(String(b.name), 'ar'));
  const cats = M.store.categories || [];
  const noCat = list.filter(it => !cats.some(c => c.id === it.cat)).length;
  A.view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('منتجات المتجر')}</h1><p>${t('اربط منتجات المتجر بمخزونك، والتسليم يصير تلقائي')}</p></div>
    <button class="btn amber" data-act="stItemNew">${icon('plus')} ${t('منتج جديد')}</button></div>
  ${subnav('items')}
  ${!cats.length ? `<div class="card rv" style="margin-bottom:16px;border-color:rgba(245,158,11,.45)"><p>${icon('alert')} ${t('قبل ما تضيف منتجات، أنشئ قسم واحد على الأقل.')} <a class="link" href="#store/cats">${t('الأقسام')}</a></p></div>` : ''}
  ${noCat ? `<div class="card rv" style="margin-bottom:16px;border-color:rgba(239,68,68,.4)"><p class="t-bad">${icon('alert')} ${noCat} ${t('منتج بدون قسم. عدّلهم واختار لهم قسم.')}</p></div>` : ''}
  ${list.length ? `<div class="plist">${list.map(it => {
    const img = safeImg(it.image);
    const from = priceFrom(it);
    const out = (it.stock || 0) < 1 && !(it.untilN || []).some(u => u.n > 0 && u.d > Date.now());
    return `<article class="card pcard rv" style="${it.active === false ? 'opacity:.6' : ''}">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start">${img ? `<img src="${img}" alt="" style="width:64px;height:64px;border-radius:14px;object-fit:cover;flex:none">` : `<span class="fic" style="width:64px;height:64px;border-radius:14px">${icon(TYPE_IC[it.type])}</span>`}
        <div class="fmid"><b data-raw>${esc(it.name)}</b><small>${t(TYPE_LBL[it.type])} · ${cats.find(c => c.id === it.cat) ? `<span data-raw>${esc(cats.find(c => c.id === it.cat).name)}</span>` : `<span class="t-bad">${t('بدون قسم')}</span>`}</small>
        <div class="row" style="margin-top:6px"><b class="num" style="color:var(--amber-t)">${from.many ? t('من') + ' ' : ''}${money(from.min)}</b>${it.type === 'manual' ? '' : `<span class="badge ${out ? 'bad' : 'ok'}">${out ? t('نفد') : `${it.stock} ${t('متاح')}`}</span>`}${it.warranty == null ? `<span class="badge bad">${t('حدد الضمان')}</span>` : `<span class="badge icon ${it.warranty ? 'info' : 'off'}">${icon('shield')} ${it.warranty ? `${t('ضمان')} ${it.warranty} ${t('يوم')}` : t('بدون ضمان')}</span>`}${it.featured ? `<span class="badge warn">${t('مميز')}</span>` : ''}${it.active === false ? `<span class="badge off">${t('مخفي')}</span>` : ''}</div></div></div>
      ${stockHint(it)}
      <div class="row"><button class="btn ghost sm" data-act="stItemEdit" data-id="${esc(it.id)}">${icon('edit')} ${t('تعديل')}</button><label class="row small"><span class="toggle"><input type="checkbox" data-itact="${esc(it.id)}" ${it.active === false ? '' : 'checked'}><span></span></span>${t('ظاهر')}</label><span class="spacer"></span><button class="iconbtn sm" data-act="stItemDel" data-id="${esc(it.id)}" aria-label="${t('حذف')}">${icon('trash')}</button></div>
    </article>`;
  }).join('')}</div>` : `<div class="card rv">${empty('box', t('أضف منتجات لمتجرك: ملفات حسابات، أكواد، أرقام، أو خدمة يدوية مثل الشحن بالـ ID.'), `<button class="btn amber" data-act="stItemNew">${icon('plus')} ${t('منتج جديد')}</button>`)}</div>`}`;
  $$('[data-itact]').forEach(x => x.onchange = async () => {
    x.disabled = true;
    try { await apiPost('/m/items/active', { id: x.dataset.itact, active: x.checked }); } catch (e) { x.checked = !x.checked; toast(e.message, 'bad'); }
    x.disabled = false;
  });
}
function stockHint(it) {
  if (it.type === 'account' && (it.stock || 0) > 0 && (it.durations || []).some(d => d.m > (it.maxMonths || 0))) return `<p class="hint">${t('أطول مدة متاحة حالياً')}: ${t(monthsTxt(it.maxMonths || 0))}</p>`;
  if (it.type === 'number' && it.mode !== 'pick' && !(it.prices || []).length) return `<p class="hint t-bad">${t('حط سعر لكل دولة باش تظهر للزبون')}</p>`;
  return '';
}
function priceFrom(it) {
  let l = [];
  if (it.type === 'account') l = [...(it.durations || []).map(d => d.price), ...(it.untils || []).map(u => u.price)];
  else if (it.type === 'code') l = [it.price];
  else if (it.type === 'number') l = it.mode === 'pick' ? (it.numbers || []).map(n => n.price) : (it.prices || []).map(p => p.price);
  else l = (it.packs || []).map(p => p.price);
  l = l.map(num).filter(x => x > 0);
  return { min: l.length ? Math.min(...l) : 0, many: new Set(l).size > 1 };
}
function needCats() {
  if ((M.store.categories || []).length) return true;
  toast(t('أنشئ قسم واحد على الأقل قبل ما تضيف منتجات.'), 'bad'); location.hash = '#store/cats'; return false;
}
function itemNew() {
  if (!guard() || !needCats()) return;
  const m = modal(t('منتج جديد'), `<div class="rems">${[['account', 'tv', 'ملفات حساب', 'Netflix، Shahid… الزبون يختار المدة ويستلم الملف تلقائياً'], ['code', 'ticket', 'أكواد', 'ببجي، فري فاير، بطاقات… الكود يتسلّم تلقائياً'], ['number', 'phone', 'أرقام', 'أرقام تفعيل، الزبون يختار الرقم أو الدولة'], ['manual', 'bolt', 'خدمة يدوية', 'شحن بالـ ID أو أي خدمة تسلّمها أنت']].map(([k, i, l, d]) =>
    `<button class="rem" data-pick="${k}" style="grid-template-columns:auto 1fr auto;text-align:start;color:inherit;cursor:pointer;width:100%"><span class="fic">${icon(i)}</span><div><b>${t(l)}</b><small>${t(d)}</small></div>${icon('arrow')}</button>`).join('')}</div>`);
  $$('[data-pick]', m.el).forEach(b => b.onclick = () => { m.close(); itemForm({ type: b.dataset.pick }); });
}
function itemForm(it) {
  if (!guard() || !needCats()) return;
  const ed = !!it.id, S = A.S, type = it.type, cats = M.store.categories || [];
  let image = safeImg(it.image);
  const accs = S.products.filter(p => p.type === 'account');
  const codes = S.products.filter(p => p.type === 'code');
  const countries = [...new Set(S.numbers.map(n => n.country).filter(Boolean))];
  let body = '';
  if (type === 'account') {
    const names = [...new Set(accs.map(p => p.name))];
    body = accs.length ? `<label class="small muted" style="display:block;margin-bottom:8px">${t('الحسابات اللي يتسلّم منها (يختار النظام ملف متاح تلقائياً)')}</label>
      <div class="chips" style="margin-bottom:14px">${names.map(n => `<button type="button" class="chip ${(it.productIds || []).some(id => accs.find(p => p.id === id)?.name === n) ? 'on' : ''}" data-accname="${esc(n)}"><span data-raw>${esc(n)}</span>&nbsp;<span class="dim">${accs.filter(p => p.name === n).length}</span></button>`).join('')}</div>
      <div class="field"><label>${t('سعر الشهر للملف')} <span class="dim">(30 ${t('يوم')})</span></label><input id="ifMP" inputmode="decimal" dir="ltr" value="${monthPriceOf(it) || ''}" placeholder="15"></div>
      <label class="small muted" style="display:block;margin-bottom:8px">${t('المدد اللي تظهر للزبون')}</label>
      ${monthChips(it.durMonths?.length ? it.durMonths : (it.durations || []).map(d => d.m), false)}
      <div id="ifAuto" class="autobox"></div>
      <p class="hint" style="margin:6px 0 14px">${t('كل الأسعار تنحسب من سعر الشهر: الشهر 30 يوم، والأيام = سعر الشهر ÷ 30 × الأيام. وكل حساب في مخزونك يطلع للزبون بتاريخ نهايته وأيامه الباقية لحاله. سعر الشهر مربوط بـ«الملف شهرياً» في حساباتك، لو غيرته هنا يتغير هناك والعكس. المدد 7 أيام أو أقل ملفي ما تضمنهاش.')}</p>`
      : `<p class="t-bad" style="margin-bottom:14px">${t('ما عندكش حسابات. أضف حساب من صفحة المنتجات أولاً.')}</p>`;
  } else if (type === 'code') {
    body = codes.length ? `<div class="field"><label>${t('فئة الأكواد')}</label><select id="ifProd">${codes.map(p => `<option value="${esc(p.id)}" ${it.productId === p.id ? 'selected' : ''} data-raw>${esc(p.name)} (${S.codes.filter(c => c.productId === p.id && c.status === 'available').length})</option>`).join('')}</select></div>
      <div class="grid2 keep"><div class="field"><label>${t('سعر الكود في المتجر')}</label><input id="ifPrice" inputmode="decimal" dir="ltr" value="${it.price ?? ''}"></div><div class="field"><label>${t('أقصى كمية للطلب')}</label><input id="ifMax" type="number" min="1" max="10" dir="ltr" value="${it.maxQty || 10}"></div></div>`
      : `<p class="t-bad" style="margin-bottom:14px">${t('ما عندكش فئات أكواد. أضف فئة من صفحة المنتجات أولاً.')}</p>`;
  } else if (type === 'number') {
    const mode = it.mode || 'country';
    body = `<div class="field"><label>${t('طريقة البيع')}</label><div class="chips">${[['country', 'الزبون يختار الدولة'], ['pick', 'الزبون يختار الرقم']].map(([k, l]) => `<button type="button" class="chip ${mode === k ? 'on' : ''}" data-mode="${k}">${t(l)}</button>`).join('')}</div></div>
      <div id="ifCtry" ${mode === 'pick' ? 'hidden' : ''}>${countries.length ? `<label class="small muted" style="display:block;margin-bottom:8px">${t('سعر كل دولة (فاضي = ما تظهرش)')}</label><div class="grid2 keep">${countries.map(c => `<div class="field"><label data-raw>${esc(c)} <span class="dim">(${S.numbers.filter(n => n.country === c && n.status === 'available').length})</span></label><input data-cp="${esc(c)}" inputmode="decimal" dir="ltr" value="${(it.prices || []).find(p => p.country === c)?.price ?? ''}"></div>`).join('')}</div>` : `<p class="t-bad" style="margin-bottom:14px">${t('ما عندكش أرقام. أضف أرقام من صفحة المنتجات أولاً.')}</p>`}</div>
      <p class="hint" id="ifPickHint" ${mode === 'pick' ? '' : 'hidden'} style="margin-bottom:14px">${t('كل رقم يظهر بسعر البيع حقه (من صفحة الأرقام)، ونص الرقم مخفي لين الزبون يدفع.')}</p>`;
  } else {
    const packs = it.packs?.length ? it.packs : [{}];
    const fields = it.fields?.length ? it.fields : [{ label: 'ID اللاعب', req: true }];
    body = `<label class="small muted" style="display:block;margin-bottom:8px">${t('الباقات والأسعار')}</label><div id="ifPacks">${packs.map(packRow).join('')}</div>
      <button type="button" class="btn ghost sm" id="ifAddPack" style="margin-bottom:16px">${icon('plus')} ${t('باقة')}</button>
      <label class="small muted" style="display:block;margin-bottom:8px">${t('البيانات اللي يكتبها الزبون (مثلاً: ID اللاعب)')}</label><div id="ifFields">${fields.map(fieldRow).join('')}</div>
      <button type="button" class="btn ghost sm" id="ifAddField" style="margin-bottom:16px">${icon('plus')} ${t('حقل')}</button>`;
  }
  const m = modal(ed ? t('تعديل منتج المتجر') : t(TYPE_LBL[type]), `
    <div class="imgpick"><span id="ifImgBox">${image ? `<img src="${image}" alt="" style="object-fit:cover;padding:0">` : `<span class="ph">${icon('img')}</span>`}</span>
      <div class="row"><label class="btn ghost sm" style="cursor:pointer">${icon('upload')} ${t('صورة')}<input type="file" id="ifImg" accept="image/*" hidden></label><button type="button" class="btn ghost sm" id="ifImgDel" ${image ? '' : 'hidden'}>${t('إزالة')}</button></div></div>
    <div class="field"><label>${t('اسم المنتج في المتجر')}</label><input id="ifName" maxlength="80" value="${esc(it.name || '')}"></div>
    <div class="field"><label>${t('الوصف')}</label><textarea id="ifDesc" maxlength="800" rows="3">${esc(it.desc || '')}</textarea></div>
    ${body}
    <div class="grid2 keep"><div class="field"><label>${t('القسم')}</label><select id="ifCat">${cats.some(c => c.id === it.cat) ? '' : `<option value="" selected disabled>${t('اختار القسم…')}</option>`}${cats.map(c => `<option value="${esc(c.id)}" ${it.cat === c.id ? 'selected' : ''} data-raw>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>${t('الترتيب')}</label><input id="ifOrder" type="number" dir="ltr" value="${it.order ?? M.items.length + 1}"></div></div>
    <div class="field wq"><label>${t('مدة ضمان المنتج')} <span class="t-bad">*</span></label>
      <div class="chips" style="margin-bottom:8px">${[['yes', 'فيه ضمان'], ['no', 'بدون ضمان']].map(([k, l]) => `<button type="button" class="chip ${it.warranty == null ? '' : (k === 'no') === (it.warranty === 0) ? 'on' : ''}" data-wq="${k}">${t(l)}</button>`).join('')}</div>
      <div id="ifWBox" ${it.warranty > 0 ? '' : 'hidden'}><div class="row" style="flex-wrap:nowrap;gap:8px"><input id="ifW" type="number" min="1" max="365" inputmode="numeric" dir="ltr" style="max-width:120px" value="${it.warranty > 0 ? it.warranty : ''}" placeholder="7"><span class="muted">${t('يوم من التسليم')}</span></div></div>
      <p class="hint" id="ifWHint" style="margin-top:8px"></p></div>
    <div class="field"><label>${t('ملاحظة للزبون (اختياري)')}</label><input id="ifNote" maxlength="300" value="${esc(it.note || '')}" placeholder="${t('مثلاً: التسليم خلال ساعة')}"></div>
    <div class="row" style="margin-bottom:16px"><label class="row small"><span class="toggle"><input type="checkbox" id="ifFeat" ${it.featured ? 'checked' : ''}><span></span></span>${t('مميز (يظهر فوق)')}</label><label class="row small"><span class="toggle"><input type="checkbox" id="ifAct" ${it.active === false ? '' : 'checked'}><span></span></span>${t('ظاهر للزبائن')}</label></div>
    <div class="mfoot"><button class="btn amber" id="ifGo">${icon('check')} ${t('حفظ')}</button></div>`, { wide: true });
  const el = m.el;
  const setImg = v => { image = v; $('#ifImgBox', el).innerHTML = v ? `<img src="${v}" alt="" style="object-fit:cover;padding:0">` : `<span class="ph">${icon('img')}</span>`; $('#ifImgDel', el).hidden = !v; };
  $('#ifImg', el).onchange = async e => { try { setImg(await compressImage(e.target.files[0], 640, 140000)); } catch (er) { toast(er.message, 'bad'); } e.target.value = ''; };
  $('#ifImgDel', el).onclick = () => setImg('');
  let wq = it.warranty == null ? '' : it.warranty === 0 ? 'no' : 'yes';
  const wHint = () => {
    const n = Math.floor(num($('#ifW', el).value)), md = wDays();
    $('#ifWHint', el).textContent = wq === 'no' ? t('ملفي ما تضمنش المنتج هذا، ويظهر للزبون «بدون ضمان». أرباحه تصير قابلة للسحب أول ما يتسلّم.')
      : wq === 'yes' ? (n > md ? `${t('ملفي تضمن أول')} ${md} ${t('أيام، وأنت تضمن الباقي لين')} ${n} ${t('يوم. أرباحه تتحول بعد')} ${md} ${t('أيام.')}` : n > 0 ? `${t('ملفي تضمن المنتج')} ${n} ${t('يوم، وأرباحه تتحول بعد ما تخلص.')}` : t('اكتب عدد أيام الضمان.'))
      : t('سؤال إجباري: حدد كم يوم تضمن المنتج، أو اختار «بدون ضمان».');
  };
  $$('[data-wq]', el).forEach(b => b.onclick = () => { wq = b.dataset.wq; $$('[data-wq]', el).forEach(x => x.classList.toggle('on', x === b)); $('#ifWBox', el).hidden = wq !== 'yes'; if (wq === 'yes') setTimeout(() => $('#ifW', el).focus(), 30); wHint(); });
  $('#ifW', el).oninput = wHint; wHint();
  $$('[data-accname]', el).forEach(b => b.onclick = () => b.classList.toggle('on'));
  let mode = it.mode || 'country';
  $$('[data-mode]', el).forEach(b => b.onclick = () => { mode = b.dataset.mode; $$('[data-mode]', el).forEach(x => x.classList.toggle('on', x === b)); $('#ifCtry', el).hidden = mode === 'pick'; $('#ifPickHint', el).hidden = mode !== 'pick'; });
  const autoPrev = () => {
    const box = $('#ifAuto', el); if (!box) return;
    const names = $$('[data-accname].on', el).map(b => b.dataset.accname);
    const tmp = { productIds: accs.filter(p => names.includes(p.name)).map(p => p.id), durMonths: $$('[data-mc].on', el).map(b => +b.dataset.mc), monthPrice: round2(num($('#ifMP', el).value)) };
    const mp = round2(num($('#ifMP', el).value));
    const st = accountStock({ ...tmp, durMonths: tmp.durMonths });
    const durs = mp > 0 ? tmp.durMonths.sort((a, b) => a - b).map(m => ({ m, price: round2(mp * m) })) : [];
    const days = d => Math.round((d - Date.now()) / DAY);
    box.innerHTML = (durs.length || st.untils.length) ? `<div class="autolist">${durs.map(d => `<div><span>${t(monthsTxt(d.m))} <small class="dim">${d.m * 30} ${t('يوم')}</small></span><b class="num">${money(d.price)}</b></div>`).join('')}
      ${st.untils.map((u, i) => `<div><span>${t('لين')} ${fmtShort(u.d)} <small class="dim">${durLbl(days(u.d))} · ${st.untilN[i].n} ${t('ملف')}${days(u.d) <= 7 ? ' · ' + t('بدون ضمان ملفي') : ''}</small></span><b class="num">${money(mp > 0 ? round2(mp / 30 * days(u.d)) : u.price)}</b></div>`).join('')}</div>`
      : `<p class="hint">${t('اختار الحسابات وحط سعر الشهر، وتطلع هنا المدد والأسعار اللي يشوفها الزبون.')}</p>`;
  };
  if (type === 'account') {
    bindMonthChips(el, { onToggle: (m, b) => { b.classList.toggle('on'); autoPrev(); } });
    $('#ifMP', el).oninput = autoPrev;
    $$('[data-accname]', el).forEach(b => b.addEventListener('click', () => setTimeout(autoPrev)));
    autoPrev();
  }

  const ap = $('#ifAddPack', el); if (ap) ap.onclick = () => { if ($$('.packrow', el).length < 20) $('#ifPacks', el).insertAdjacentHTML('beforeend', packRow({})); };
  const af = $('#ifAddField', el); if (af) af.onclick = () => { if ($$('.fieldrow', el).length < 4) $('#ifFields', el).insertAdjacentHTML('beforeend', fieldRow({})); };
  el.addEventListener('click', e => { const d = e.target.closest('[data-rm]'); if (d) d.closest('.frow').remove(); });
  $('#ifGo', el).onclick = e => busy(e.currentTarget, async () => {
    let linkPrice = null;
    const d = {
      type, name: $('#ifName', el).value.trim().slice(0, 80), desc: $('#ifDesc', el).value.trim().slice(0, 800), cat: $('#ifCat', el).value, image: image || '', imgV: image ? (image === safeImg(it.image) ? (it.imgV || Date.now()) : Date.now()) : 0,
      note: $('#ifNote', el).value.trim().slice(0, 300), order: Math.floor(num($('#ifOrder', el).value)), featured: $('#ifFeat', el).checked, active: $('#ifAct', el).checked, updatedAt: Date.now()
    };
    if (!d.name) throw new Error(t('اكتب اسم المنتج.'));
    if (!cats.some(c => c.id === d.cat)) throw new Error(t('اختار قسم المنتج.'));
    if (!wq) { $('.wq', el).scrollIntoView({ block: 'center' }); throw new Error(t('حدد مدة ضمان المنتج، أو اختار «بدون ضمان».')); }
    d.warranty = wq === 'no' ? 0 : Math.floor(num($('#ifW', el).value));
    if (wq === 'yes' && !(d.warranty >= 1 && d.warranty <= 365)) { $('#ifW', el).focus(); throw new Error(t('اكتب مدة الضمان بالأيام (من 1 لـ 365).')); }
    if (type === 'account') {
      const names = $$('[data-accname].on', el).map(b => b.dataset.accname);
      d.productIds = accs.filter(p => names.includes(p.name)).map(p => p.id).slice(0, 10);
      d.monthPrice = round2(num($('#ifMP', el).value));
      d.durMonths = $$('[data-mc].on', el).map(b => +b.dataset.mc).sort((a, b) => a - b);
      if (!d.productIds.length) throw new Error(t('اختار حساب واحد على الأقل.'));
      if (accs.filter(p => names.includes(p.name)).length > 10) throw new Error(t('أقصى حد 10 حسابات للمنتج الواحد.'));
      if (!(d.monthPrice > 0)) { $('#ifMP', el).focus(); throw new Error(t('حط سعر الشهر للملف.')); }
      // نربط سعر الشهر بـ«الملف شهرياً» في الحسابات
      linkPrice = { ids: d.productIds, price: d.monthPrice };
      Object.assign(d, accountStock({ ...d, productIds: d.productIds }), { monthPrice: d.monthPrice });
      d.durations = d.durMonths.map(m => ({ m, price: round2(d.monthPrice * m) }));
      const now = Date.now();
      d.untils = (d.untils || []).map(u => ({ d: u.d, price: round2(d.monthPrice / 30 * Math.round((u.d - now) / DAY)) }));
      if (!d.durations.length && !d.untils.length) throw new Error(t('اختار مدة وحدة على الأقل، أو ضيف حسابات فيها أيام باقية.'));
    } else if (type === 'code') {
      d.productId = $('#ifProd', el)?.value || ''; d.price = round2(num($('#ifPrice', el)?.value)); d.maxQty = Math.min(10, Math.max(1, Math.floor(num($('#ifMax', el)?.value)) || 10));
      if (!d.productId) throw new Error(t('اختار فئة الأكواد.'));
      if (!(d.price > 0)) throw new Error(t('حط سعر الكود.'));
    } else if (type === 'number') {
      d.mode = mode;
      d.prices = mode === 'pick' ? [] : $$('[data-cp]', el).map(i => ({ country: i.dataset.cp, price: round2(num(i.value)) })).filter(p => p.price > 0).slice(0, 40);
      if (mode === 'country' && !d.prices.length) throw new Error(t('حط سعر لدولة وحدة على الأقل.'));
    } else {
      d.packs = $$('.packrow', el).map(r => ({ label: $('[data-pl]', r).value.trim().slice(0, 60), price: round2(num($('[data-pp]', r).value)) })).filter(p => p.label && p.price > 0).slice(0, 20);
      d.fields = $$('.fieldrow', el).map(r => ({ label: $('[data-fl]', r).value.trim().slice(0, 40), req: $('[data-fr]', r).checked })).filter(f => f.label).slice(0, 4);
      if (!d.packs.length) throw new Error(t('أضف باقة وحدة على الأقل (الاسم والسعر).'));
    }
    Object.assign(d, computeStock({ ...it, ...d }));
    await apiPost('/m/items/save', { id: ed ? it.id : '', item: d });
    if (linkPrice) await syncAccPrice(linkPrice.ids, linkPrice.price);
    m.close(); toast(t('تم الحفظ'));
  });
}
// أزرار المدد: من شهر لـ12، و«التالي» يكمل من 13 لـ24، و«مدة معينة» تفتح التقويم
function monthChips(on = [], custom = true, max = 24) {
  const chip = m => `<button type="button" class="chip ${on.includes(m) ? 'on' : ''}" data-mc="${m}">${t(monthsTxt(m))}</button>`;
  const p1 = Array.from({ length: Math.min(12, max) }, (_, i) => i + 1), p2 = Array.from({ length: Math.max(0, Math.min(24, max) - 12) }, (_, i) => i + 13);
  const second = on.some(m => m > 12);
  return `<div class="mchips"><div class="chips" data-mp="1" ${second ? 'hidden' : ''}>${p1.map(chip).join('')}</div>${p2.length ? `<div class="chips" data-mp="2" ${second ? '' : 'hidden'}>${p2.map(chip).join('')}</div>` : ''}
    <div class="chips" style="margin-top:8px">${p2.length ? `<button type="button" class="chip" data-mpage>${second ? '‹ ' + t('من شهر لـ12') : t('التالي') + ' ›'}</button>` : ''}${custom ? `<button type="button" class="chip" data-mcustom>${icon('calendar')} ${t('مدة معينة')}</button>` : ''}</div></div>`;
}
function bindMonthChips(root, { onToggle, onCustom }) {
  $$('[data-mc]', root).forEach(b => b.onclick = () => onToggle(+b.dataset.mc, b));
  const pg = $('[data-mpage]', root);
  if (pg) pg.onclick = () => { const p2 = $('[data-mp="2"]', root), p1 = $('[data-mp="1"]', root); const show2 = p2.hidden; p2.hidden = !show2; p1.hidden = show2; pg.textContent = show2 ? '‹ ' + t('من شهر لـ12') : t('التالي') + ' ›'; };
  const cu = $('[data-mcustom]', root); if (cu && onCustom) cu.onclick = () => onCustom(cu);
}
const durRow = d => `<div class="frow durrow" data-m="${d.m}"><span class="dlbl"><b>${t(monthsTxt(d.m))}</b><small class="dim">${d.m * 30} ${t('يوم')}</small></span><input class="inp" data-dp inputmode="decimal" dir="ltr" placeholder="${t('السعر')}" value="${d.price ?? ''}"><button type="button" class="iconbtn sm" data-rmdur aria-label="${t('حذف')}">${icon('x')}</button></div>`;
const untilRow = u => `<div class="frow untilrow"><input class="inp" type="date" data-ud value="${u.d ? toInput(u.d) : ''}" min="${toInput(Date.now() + DAY)}"><input class="inp" data-up inputmode="decimal" dir="ltr" placeholder="${t('السعر')}" value="${u.price ?? ''}"><button type="button" class="iconbtn sm" data-rm aria-label="${t('حذف')}">${icon('x')}</button></div>`;
const packRow = p => `<div class="frow packrow"><input class="inp" data-pl maxlength="60" placeholder="${t('مثلاً: 60 شدة')}" value="${esc(p.label || '')}"><input class="inp" data-pp inputmode="decimal" dir="ltr" placeholder="${t('السعر')}" value="${p.price ?? ''}"><button type="button" class="iconbtn sm" data-rm aria-label="${t('حذف')}">${icon('x')}</button></div>`;
const fieldRow = f => `<div class="frow fieldrow"><input class="inp" data-fl maxlength="40" placeholder="${t('اسم الحقل')}" value="${esc(f.label || '')}"><label class="row small" style="gap:6px"><input type="checkbox" data-fr ${f.req !== false ? 'checked' : ''}>${t('إجباري')}</label><button type="button" class="iconbtn sm" data-rm aria-label="${t('حذف')}">${icon('x')}</button></div>`;
async function itemDel(it) {
  if (!guard()) return;
  if (!await confirmBox(`${t('حذف')} "<span data-raw>${esc(it.name)}</span>" ${t('من المتجر؟ المخزون نفسه ما يتأثرش.')}`, { ok: t('حذف'), danger: true })) return;
  try { await apiPost('/m/items/delete', { id: it.id }); toast(t('تم الحذف')); } catch (e) { toast(e.message, 'bad'); }
}
function guard() {
  if (!storeAllowed()) { toast(t('التعديل على المتجر يحتاج خطة فيها متجر واشتراك مفعّل.'), 'bad'); return false; }
  return true;
}

/* ===================== التصميم (المحرر والمعاينة) ===================== */
function draftFrom(s) {
  return JSON.parse(JSON.stringify({ name: s.name, design: normDesign(s.design), sections: normSections(s.sections), info: { heroTitle: '', heroSub: '', announce: '', about: '', whatsapp: '', floatWa: true, policy: '', faq: [], socials: {}, ...(s.info || {}) }, logo: s.logo || '', cover: s.cover || '', categories: s.categories || [] }));
}
function previewPayload() {
  const d = M.ed, s = M.store;
  const items = M.items.filter(i => i.active !== false).map(it => {
    const o = { id: it.id, type: it.type, name: it.name, desc: it.desc || '', cat: it.cat || '', wd: it.warranty ?? null, featured: !!it.featured, order: num(it.order), note: it.note || '', img: safeImg(it.image), stock: it.stock || 0 };
    if (it.type === 'account') Object.assign(o, { durations: (it.durations || []).filter(x => x.price > 0), maxMonths: it.maxMonths || 0, untils: (it.untils || []).filter(u => u.d > Date.now()).map(u => ({ ...u, n: (it.untilN || []).find(x => x.d === u.d)?.n || 0 })) });
    if (it.type === 'code') Object.assign(o, { price: it.price, maxQty: it.maxQty || 10 });
    if (it.type === 'number') { o.mode = it.mode === 'pick' ? 'pick' : 'country'; if (o.mode === 'pick') o.numbers = it.numbers || []; else o.prices = (it.prices || []).map(p => ({ ...p, n: (it.countries || []).find(c => c.country === p.country)?.n || 0 })); }
    if (it.type === 'manual') Object.assign(o, { packs: it.packs || [], fields: it.fields || [] });
    return o;
  }).sort((a, b) => a.order - b.order);
  return {
    store: { slug: s.slug, name: d.name, currency: s.currency, country: s.country, open: true, design: d.design, sections: d.sections, categories: d.categories, info: { ...d.info, whatsapp: normPhone(d.info.whatsapp) }, logo: safeImg(d.logo), cover: safeImg(d.cover) },
    items, pay: { methods: [], warrantyDays: wDays(), fees: (A.S.platform.storeFees?.[s.currency] || [{ upTo: 50, rate: 5 }, { upTo: 100, rate: 4 }, { upTo: 200, rate: 3 }, { upTo: 0, rate: 2 }]) }
  };
}
let pvT = 0, pvReady = false;
function pushPreview(route) {
  clearTimeout(pvT);
  pvT = setTimeout(() => { const f = $('#edFrame'); if (f && pvReady) f.contentWindow.postMessage({ type: 'malafy-preview', payload: previewPayload(), route }, location.origin); }, 90);
}
window.addEventListener('message', e => { if (e.origin === location.origin && e.data?.type === 'malafy-preview-ready') { pvReady = true; pushPreview('/'); } });
function miniHTML(k, d = {}) {
  const T = TEMPLATES[k], c = colorsOf({ template: k, mode: T.mode, palette: T.palette, card: T.card, corner: T.corner, ...d });
  const r = { sharp: 3, soft: 7, round: 10 }[c.s.corner];
  const hero = { pulse: `radial-gradient(120% 90% at 0% 100%,${c.pri}88,transparent 60%),${c.surface}`, clean: c.surface2, pop: c.pri, luxe: `linear-gradient(180deg,${c.surface},${c.bg})`, nova: `linear-gradient(135deg,${c.pri},${c.sec})`, nature: c.surface2 }[k];
  const card = n => `<i style="display:block;background:${c.surface};border:1px solid ${c.line};border-radius:${r}px;height:${c.s.card === 'list' ? 18 : 44}px;${c.s.card === 'grid' ? '' : 'grid-column:1/-1;'}"><i style="display:block;height:${c.s.card === 'list' ? '100%' : '60%'};width:${c.s.card === 'list' ? '30%' : '100%'};background:linear-gradient(140deg,${c.pri}55,${c.sec}44);border-radius:${r}px ${r}px 0 0"></i></i>`;
  return `<div style="background:${c.bg};padding:8px;height:150px;overflow:hidden;border-radius:10px"><div style="height:10px;width:50%;border-radius:4px;background:${c.text};opacity:.8;margin-bottom:6px"></div><div style="height:46px;border-radius:${r}px;background:${hero};margin-bottom:6px;border:1px solid ${c.line}"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">${[1, 2, 3, 4].map(card).join('')}</div></div>`;
}
function designView() {
  if (!guard()) { location.hash = '#store'; return; }
  if (!M.ed) M.ed = draftFrom(M.store);
  pvReady = false;
  const tabs = [['tpl', 'layout', 'القالب'], ['color', 'palette', 'الألوان'], ['font', 'type', 'الخط'], ['look', 'list', 'الشكل'], ['secs', 'layers', 'الأقسام'], ['info', 'store', 'المحتوى'], ['contact', 'wa', 'التواصل']];
  A.view.innerHTML = `<div class="ed" id="ed" role="dialog" aria-label="${t('تصميم المتجر')}">
    <div class="ed-top"><button class="iconbtn" data-act="edClose" aria-label="${t('إغلاق')}">${icon('x')}</button><b>${t('تصميم المتجر')}</b><span class="spacer"></span><button class="btn amber sm" data-act="edSave">${icon('check')} ${t('حفظ ونشر')}</button></div>
    <div class="ed-prev" id="edPrev"><div class="ed-phone" id="edPhone"><iframe id="edFrame" src="store.html?preview=1" title="${t('معاينة المتجر')}"></iframe></div></div>
    <div class="ed-tabs">${tabs.map(([k, i, l]) => `<button class="${M.edTab === k ? 'on' : ''}" data-act="edTab" data-id="${k}">${icon(i)}${t(l)}</button>`).join('')}</div>
    <div class="ed-body" id="edBody"></div></div>`;
  document.body.classList.add('noscroll');
  edBody(); fitPhone();
}
function edBody() {
  const d = M.ed, ds = d.design, k = M.edTab, el = $('#edBody'); if (!el) return;
  let h = '';
  if (k === 'tpl') h = `<div class="tpls">${Object.entries(TEMPLATES).map(([key, T]) => `<button class="tplc ${ds.template === key ? 'on' : ''}" data-act="edTpl" data-id="${key}">${miniHTML(key)}${ds.template === key ? `<span class="chk">${icon('check')}</span>` : ''}<b>${T.name}</b><small>${t(T.desc)}</small></button>`).join('')}</div><p class="hint" style="margin-top:12px">${t('اختيار قالب يغيّر الألوان والشكل لقيمه الافتراضية، وتقدر تعدّلها بعدين.')}</p>`;
  if (k === 'color') h = `<div class="lbl">${t('مجموعات الألوان')}</div><div class="swatches">${Object.entries(PALETTES).map(([key, [a, b, n]]) => `<button class="sw ${!ds.color && ds.palette === key ? 'on' : ''}" data-act="edPal" data-id="${key}" aria-label="${t(n)}" title="${t(n)}"><i style="--a:${a};--b:${b}"></i></button>`).join('')}<label class="sw custom ${ds.color ? 'on' : ''}" title="${t('لون مخصص')}" style="${ds.color ? `background:${ds.color};border-style:solid` : ''}">${ds.color ? '' : icon('plus')}<input type="color" id="edColor" value="${ds.color || '#7C5CFF'}" aria-label="${t('لون مخصص')}"></label></div>
    <div class="lbl">${t('الوضع')}</div><div class="opts3" style="grid-template-columns:1fr 1fr">${[['dark', 'moon', 'داكن'], ['light', 'sun', 'فاتح']].map(([key, i, l]) => `<button class="${ds.mode === key ? 'on' : ''}" data-act="edSet" data-id="mode:${key}">${icon(i)}${t(l)}</button>`).join('')}</div>
    <p class="hint">${t('أي لون تختاره، النظام يضبط درجاته ونصوصه تلقائياً باش يبقى مقروء.')}</p>`;
  if (k === 'font') h = `<div class="lbl">${t('خط المتجر')}</div><div class="fonts">${FONTS.map(([f, n]) => `<button class="fontb ${ds.font === f ? 'on' : ''}" data-act="edSet" data-id="font:${f}"><b style="font-family:'${f}'" data-raw>${esc(d.name)}</b><small>${n}</small></button>`).join('')}</div>`;
  if (k === 'look') h = `<div class="lbl">${t('شكل بطاقة المنتج')}</div><div class="opts3">${CARDS.map(([key, l]) => `<button class="${ds.card === key ? 'on' : ''}" data-act="edSet" data-id="card:${key}">${icon({ grid: 'layout', list: 'list', large: 'big' }[key])}${t(l)}</button>`).join('')}</div>
    <div class="lbl">${t('الأزرار والزوايا')}</div><div class="opts3">${CORNERS.map(([key, l]) => `<button class="${ds.corner === key ? 'on' : ''}" data-act="edSet" data-id="corner:${key}"><span style="width:44px;height:22px;border-radius:${{ sharp: '4px', soft: '10px', round: '999px' }[key]};background:var(--amber)"></span>${t(l)}</button>`).join('')}</div>`;
  if (k === 'secs') h = `<div class="lbl">${t('رتّب أقسام الصفحة الرئيسية أو أخفيها')}</div>${d.sections.map((x, i) => `<div class="secl"><label class="toggle"><input type="checkbox" ${x.on ? 'checked' : ''} data-sec="${i}" aria-label="${t('إظهار')}"><span></span></label><b>${t(SECTIONS.find(s => s[0] === x.id)[1])}</b><button class="iconbtn sm" data-act="edMv" data-id="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('فوق')}">${icon('up')}</button><button class="iconbtn sm" data-act="edMv" data-id="${i}:1" ${i === d.sections.length - 1 ? 'disabled' : ''} aria-label="${t('تحت')}">${icon('down')}</button></div>`).join('')}`;
  if (k === 'info') h = `
    <div class="imgpick"><span>${safeImg(d.logo) ? `<img src="${d.logo}" alt="" style="object-fit:cover;padding:0">` : `<span class="ph">${icon('img')}</span>`}</span><div class="row"><label class="btn ghost sm" style="cursor:pointer">${icon('upload')} ${t('الشعار')}<input type="file" id="edLogo" accept="image/*" hidden></label>${d.logo ? `<button class="btn ghost sm" data-act="edImgDel" data-id="logo">${t('إزالة')}</button>` : ''}</div></div>
    <div class="imgpick"><span>${safeImg(d.cover) ? `<img src="${d.cover}" alt="" style="object-fit:cover;padding:0;width:120px">` : `<span class="ph">${icon('img')}</span>`}</span><div class="row"><label class="btn ghost sm" style="cursor:pointer">${icon('upload')} ${t('صورة الغلاف')}<input type="file" id="edCover" accept="image/*" hidden></label>${d.cover ? `<button class="btn ghost sm" data-act="edImgDel" data-id="cover">${t('إزالة')}</button>` : ''}</div></div>
    <div class="field"><label>${t('اسم المتجر')}</label><input data-e="name" maxlength="40" value="${esc(d.name)}"></div>
    <div class="field"><label>${t('شريط الإعلان')}</label><input data-e="info.announce" maxlength="120" value="${esc(d.info.announce)}" placeholder="${t('مثلاً: خصم 10% اليوم')}"></div>
    <div class="field"><label>${t('عنوان الغلاف')}</label><input data-e="info.heroTitle" maxlength="80" value="${esc(d.info.heroTitle)}"></div>
    <div class="field"><label>${t('وصف الغلاف')}</label><input data-e="info.heroSub" maxlength="160" value="${esc(d.info.heroSub)}"></div>
    <div class="field"><label>${t('من نحن')}</label><textarea data-e="info.about" maxlength="1200" rows="3">${esc(d.info.about)}</textarea></div>
    <div class="field"><label>${t('سياسة الاسترجاع')}</label><textarea data-e="info.policy" maxlength="2000" rows="3">${esc(d.info.policy)}</textarea></div>
    <div class="lbl">${t('أسئلة شائعة')}</div><div id="edFaq">${(d.info.faq || []).map((f, i) => `<div class="card" style="padding:12px;margin-bottom:8px"><div class="field"><input data-fq="${i}" maxlength="160" value="${esc(f.q)}" placeholder="${t('السؤال')}"></div><div class="field" style="margin:0"><textarea data-fa="${i}" maxlength="800" rows="2" placeholder="${t('الجواب')}">${esc(f.a)}</textarea></div><button class="btn text sm" data-act="edFaqDel" data-id="${i}">${t('حذف')}</button></div>`).join('')}</div>
    ${(d.info.faq || []).length < 12 ? `<button class="btn ghost sm" data-act="edFaqAdd">${icon('plus')} ${t('سؤال')}</button>` : ''}`;
  if (k === 'contact') {
    const so = d.info.socials || {};
    h = `<div class="field"><label>${t('واتساب المتجر')}</label><input data-e="info.whatsapp" maxlength="20" dir="ltr" inputmode="tel" value="${esc(d.info.whatsapp)}" placeholder="${M.store.country === 'SA' ? '05XXXXXXXX' : '09XXXXXXXX'}"></div>
      <label class="row small" style="margin-bottom:16px"><span class="toggle"><input type="checkbox" id="edFab" ${d.info.floatWa !== false ? 'checked' : ''}><span></span></span>${t('زر واتساب عائم في المتجر')}</label>
      ${[['instagram', 'Instagram', 'https://instagram.com/…'], ['tiktok', 'TikTok', 'https://tiktok.com/@…'], ['facebook', 'Facebook', 'https://facebook.com/…'], ['telegram', 'Telegram', 'https://t.me/…'], ['snapchat', 'Snapchat', 'https://snapchat.com/add/…'], ['x', 'X', 'https://x.com/…']].map(([key, n, ph]) => `<div class="field"><label>${n}</label><input data-e="info.socials.${key}" maxlength="200" dir="ltr" value="${esc(so[key] || '')}" placeholder="${ph}"></div>`).join('')}`;
  }
  el.innerHTML = h;
  $$('[data-e]', el).forEach(i => i.oninput = () => { setPath(d, i.dataset.e, i.value); pushPreview(); });
  $$('[data-fq],[data-fa]', el).forEach(i => i.oninput = () => { const f = d.info.faq[+(i.dataset.fq ?? i.dataset.fa)]; if (f) f[i.dataset.fq != null ? 'q' : 'a'] = i.value; pushPreview(); });
  $$('[data-sec]', el).forEach(i => i.onchange = () => { d.sections[+i.dataset.sec].on = i.checked; pushPreview('/'); });
  const fab = $('#edFab', el); if (fab) fab.onchange = () => { d.info.floatWa = fab.checked; pushPreview(); };
  const col = $('#edColor', el); if (col) col.oninput = () => { ds.color = col.value; pushPreview(); clearTimeout(col._t); col._t = setTimeout(edBody, 300); };
  const img = (id, key, max, bytes) => { const f = $(id, el); if (f) f.onchange = async () => { try { d[key] = await compressImage(f.files[0], max, bytes); edBody(); pushPreview('/'); } catch (e) { toast(e.message, 'bad'); } }; };
  img('#edLogo', 'logo', 320, 90000); img('#edCover', 'cover', 1200, 300000);
}
function setPath(o, p, v) { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach(k => { x[k] = x[k] && typeof x[k] === 'object' ? x[k] : {}; x = x[k]; }); x[ks[ks.length - 1]] = v; }
function fitPhone() {
  const p = $('#edPrev'), ph = $('#edPhone'); if (!p || !ph) return;
  const sc = Math.min((p.clientWidth - 24) / 390, (p.clientHeight - 16) / 760, 1);
  ph.style.transform = `scale(${sc})`;
}
window.addEventListener('resize', () => fitPhone());
async function edSave(btn) {
  const d = M.ed, s = M.store;
  await busy(btn, async () => {
    if (!d.name.trim()) throw new Error(t('اكتب اسم المتجر.'));
    const clean = { ...d.info, faq: (d.info.faq || []).map(f => ({ q: String(f.q || '').trim().slice(0, 160), a: String(f.a || '').trim().slice(0, 800) })).filter(f => f.q && f.a), socials: Object.fromEntries(Object.entries(d.info.socials || {}).map(([k, v]) => [k, String(v || '').trim().slice(0, 200)]).filter(([, v]) => v)) };
    const upd = { name: d.name.trim().slice(0, 40), design: d.design, sections: d.sections, info: clean };
    if (d.logo !== (s.logo || '')) upd.logo = d.logo;
    if (d.cover !== (s.cover || '')) upd.cover = d.cover;
    await apiPost('/m/store/save', upd);
    toast(t('تم الحفظ، التغييرات تظهر في متجرك خلال ثواني'));
    closeEditor(true);
  });
}
async function closeEditor(saved) {
  if (!saved && M.ed && JSON.stringify(M.ed) !== JSON.stringify(draftFrom(M.store)) && !await confirmBox(t('فيه تغييرات ما تحفظتش. تطلع بدونها؟'), { ok: t('اطلع'), danger: true })) return;
  M.ed = null; document.body.classList.remove('noscroll');
  location.hash = '#store';
}

/* ===================== المحفظة ===================== */
function walletView() {
  const w = M.wallet || {}, s = M.store;
  const ns = w.nextSettle || (() => { const b = s.launchedAt || Date.now(); let d = b + 7 * DAY; while (d <= Date.now()) d += 7 * DAY; return d; })();
  const LT = { hold: ['طلب مدفوع (معلّق)', ''], release: ['انتهى الضمان', 'pos'], refund: ['إرجاع للزبون', 'neg'], payout: ['تسوية (قيد التحويل)', 'neg'], paid: ['تم التحويل', ''] };
  A.view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('المحفظة')}</h1><p>${t('الأسعار اللي تحطها توصلك كاملة، رسوم الخدمة يدفعها الزبون')}</p></div></div>
  ${subnav('wallet')}
  <section class="card glow rv wal" style="margin-bottom:16px"><small class="muted">${t('قابل للسحب')}</small><div class="wbig num t-ok">${money(w.available)}</div>
    <div class="row" style="margin:6px 0 12px"><button class="btn amber" data-act="stWithdraw" ${num(w.available) > 0 ? '' : 'disabled'}>${icon('wallet')} ${t('اسحب أرباحك')}</button>${minPay() ? `<small class="muted">${t('أقل مبلغ للسحب')} ${money(minPay())}</small>` : ''}</div>
    <div class="row small"><span class="muted">${t('أو تتحول تلقائياً في التسوية القادمة')}:</span><b>${fmtDate(ns)}</b></div></section>
  <div class="kv rv" style="margin-bottom:16px"><div><small>${t('معلّق (فترة الضمان)')}</small><b class="num">${money(w.pending)}</b></div><div><small>${t('قيد التحويل')}</small><b class="num">${money(w.inPayout)}</b></div><div><small>${t('تم تحويله')}</small><b class="num">${money(w.withdrawn)}</b></div></div>
  <p class="hint rv" style="margin:-6px 0 16px">${icon('shield')} ${t('المنتجات المضمونة: ملفي تضمنها لحد')} ${wDays()} ${t('أيام بعد التسليم، وأرباحها تصير قابلة للسحب بعد ما يخلص ضمان ملفي. المنتجات بدون ضمان: أرباحها تصير قابلة للسحب فوراً بعد التسليم.')}</p>
  ${M.priv?.payout?.details ? '' : `<div class="card rv" style="margin-bottom:16px;border-color:rgba(245,158,11,.45)"><p>${icon('alert')} ${t('حدد وين تبي توصلك أرباحك')} <a class="link" href="#store/settings">${t('من الإعدادات')}</a></p></div>`}
  <section class="card rv" style="margin-bottom:16px"><div class="chead"><h2>${t('التسويات')}</h2></div>
    ${M.payouts.length ? `<div class="oplist">${M.payouts.map(p => `<div class="op"><div><b class="num">${money(p.amount)}</b><small>${fmtDate(p.createdAt)}${p.reference ? ` · <span data-raw>${esc(p.reference)}</span>` : ''}</small></div><div class="opr"><span class="badge ${p.status === 'paid' ? 'ok' : 'warn'}">${t(p.status === 'paid' ? 'تم التحويل' : 'قيد التحويل')}</span></div></div>`).join('')}</div>` : empty('wallet', t('ما فيش تسويات للحين.'))}</section>
  <section class="card rv"><div class="chead"><h2>${t('كشف الحركات')}</h2><p>${t('هذا الشهر واللي قبله')}</p></div>
    ${M.ledger.length ? `<div class="oplist">${M.ledger.map(l => `<div class="op"><div><b style="font-size:14px">${t(LT[l.type]?.[0] || l.type)}</b><small>${l.orderId ? '#' + esc(l.orderId) + ' · ' : ''}${ago(l.at)}</small></div><div class="opr"><b class="num ${l.amount < 0 ? 't-bad' : l.type === 'release' ? 't-ok' : ''}">${l.amount ? (l.amount < 0 ? '−' : '+') + money(Math.abs(l.amount)) : '—'}</b></div></div>`).join('')}</div>` : empty('receipt', t('ما فيش حركات للحين.'))}</section>`;
}

/* ===================== الإعدادات ===================== */
function settingsView() {
  const s = M.store, p = M.priv?.payout || {};
  const pms = storeMethods(), chosen = Array.isArray(s.payMethods) ? s.payMethods : null;
  A.view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('إعدادات المتجر')}</h1></div></div>
  ${subnav('settings')}
  <div class="setstack">
    <section class="card rv"><div class="shead"><h2>${t('الرابط')}</h2><p>${t('حروف إنجليزية صغيرة وأرقام وشرطة، من 3 لـ 30 حرف')}</p></div>
      <div class="slug"><input id="ssSlug" maxlength="30" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.slug)}"><span>.${ROOT_DOMAIN}</span></div><p class="hint" id="ssSlugMsg" style="margin:6px 0 12px"></p>
      <button class="btn ghost" id="ssSlugGo">${t('تغيير الرابط')}</button>
      <p class="hint" style="margin-top:10px">${t('الدولة')}: <b>${t(s.country === 'SA' ? 'السعودية' : 'ليبيا')}</b> · ${t('العملة')}: <b>${t(CUR[s.currency]?.[1] || s.currency)}</b> ${t('(ما تتغيرش)')}</p></section>
    <section class="card rv"><div class="shead"><h2>${t('طرق الدفع في متجرك')}</h2><p>${t('الزبون يدفع لحسابات ملفي، وملفي تأكد الدفع وتحوّل أرباحك. اختار الطرق اللي تظهر لزباينك.')}</p></div>
      ${pms.length ? `<div class="rems" id="ssPms">${pms.map(m => `<label class="rem" style="grid-template-columns:auto 1fr auto;cursor:pointer">${safeImg(m.image) ? `<img src="${safeImg(m.image)}" alt="" style="width:36px;height:36px;border-radius:10px;object-fit:cover">` : `<span class="fic">${icon('card')}</span>`}<div><b data-raw>${esc(m.name)}</b><small>${esc((m.currencies || []).join(' · '))}</small></div><span class="toggle"><input type="checkbox" data-pm="${esc(m.id)}" ${!chosen || chosen.includes(m.id) ? 'checked' : ''}><span></span></span></label>`).join('')}</div>
      <button class="btn amber" id="ssPmGo" style="margin-top:12px">${t('حفظ طرق الدفع')}</button>`
      : `<p class="hint">${t('الإدارة ما فعّلتش طرق دفع لمتاجر')} ${t(s.country === 'SA' ? 'السعودية' : 'ليبيا')} ${t('للحين. أول ما تتفعّل تظهر هنا.')}</p>`}</section>
    <section class="card rv"><div class="shead"><h2>${t('وين توصلك أرباحك')}</h2><p>${t('الإدارة تحوّل التسوية الأسبوعية على هذي البيانات')}</p></div>
      <div class="field"><label>${t('الطريقة')}</label><input id="ssPm" maxlength="60" value="${esc(p.method || '')}" placeholder="${t('مثلاً: تحويل مصرفي، ليبيانا، USDT')}"></div>
      <div class="field"><label>${t('اسم صاحب الحساب')}</label><input id="ssPn" maxlength="80" value="${esc(p.name || '')}"></div>
      <div class="field"><label>${t('رقم الحساب أو المحفظة والتفاصيل')}</label><textarea id="ssPd" maxlength="300" rows="3" dir="auto">${esc(p.details || '')}</textarea></div>
      <button class="btn amber" id="ssPayGo">${t('حفظ')}</button></section>
  </div>`;
  const slugIn = $('#ssSlug'), msg = $('#ssSlugMsg');
  slugIn.oninput = () => { slugIn.value = slugIn.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); msg.textContent = slugIn.value && !slugOk(slugIn.value) ? t('الرابط غير صالح أو محجوز.') : ''; };
  $('#ssSlugGo').onclick = e => busy(e.currentTarget, async () => {
    if (!guard()) return;
    const v = slugIn.value.trim();
    if (v === s.slug) return;
    if (!slugOk(v)) throw new Error(t('الرابط غير صالح أو محجوز.'));
    if (!await confirmBox(t('تغيير الرابط يخلي الرابط القديم ما يشتغلش، والزبائن لازم ياخذوا الجديد. متأكد؟'), { ok: t('غيّر') })) return;
    await apiPost('/m/store/slug', { slug: v }); toast(t('تم تغيير الرابط'));
  });
  const pg = $('#ssPmGo');
  if (pg) pg.onclick = e => busy(e.currentTarget, async () => {
    if (!guard()) return;
    const on = $$('[data-pm]').filter(x => x.checked).map(x => x.dataset.pm);
    if (!on.length) throw new Error(t('اختار طريقة دفع وحدة على الأقل، وإلا الزبائن ما يقدروش يطلبوا.'));
    await apiPost('/m/store/save', { payMethods: on }); toast(t('تم الحفظ'));
  });
  $('#ssPayGo').onclick = e => busy(e.currentTarget, async () => {
    const d = { method: $('#ssPm').value.trim().slice(0, 60), name: $('#ssPn').value.trim().slice(0, 80), details: $('#ssPd').value.trim().slice(0, 300) };
    if (!d.details) throw new Error(t('اكتب رقم الحساب أو المحفظة.'));
    await setDoc(doc(db, 'storePrivate', uid()), { payout: d, updatedAt: Date.now() }); toast(t('تم الحفظ'));
  });
}
// طرق الدفع اللي فعّلتها الإدارة للمتاجر في دولة المتجر
function storeMethods() {
  const s = M.store; if (!s) return [];
  return (A.S.allMethods || []).filter(m => m.active !== false && Array.isArray(m.useFor) && m.useFor.includes('store')
    && (!Array.isArray(m.storeCountries) || m.storeCountries.includes(s.country))
    && (!Array.isArray(m.currencies) || !m.currencies.length || m.currencies.includes(s.currency) || m.currencies.includes('USDT')));
}

/* ===================== الأقسام ===================== */
const newCid = () => 'c' + Math.random().toString(36).slice(2, 10);
function catsView() {
  const cats = M.store.categories || [];
  const cnt = id => M.items.filter(i => i.cat === id).length;
  A.view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('أقسام المتجر')}</h1><p>${t('كل منتج لازم يكون في قسم. مثلاً: اشتراكات، شحن ألعاب، أرقام')}</p></div>
    ${cats.length < 12 ? `<button class="btn amber" data-act="stCatNew">${icon('plus')} ${t('قسم جديد')}</button>` : ''}</div>
  ${subnav('cats')}
  ${cats.length ? `<section class="card rv"><div class="rems">${cats.map((c, i) => `<div class="rem catl">
      <span class="fic">${sic(c.icon)}</span>
      <div><b data-raw>${esc(c.name)}</b><small>${cnt(c.id)} ${t('منتج')}</small></div>
      <div class="row catacts">
        <button class="iconbtn sm" data-act="stCatMv" data-id="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('فوق')}">${icon('up')}</button>
        <button class="iconbtn sm" data-act="stCatMv" data-id="${i}:1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="${t('تحت')}">${icon('down')}</button>
        <button class="iconbtn sm" data-act="stCatEdit" data-id="${esc(c.id)}" aria-label="${t('تعديل')}">${icon('edit')}</button>
        <button class="iconbtn sm" data-act="stCatDel" data-id="${esc(c.id)}" aria-label="${t('حذف')}">${icon('trash')}</button>
      </div></div>`).join('')}</div></section>
    <p class="hint rv" style="margin-top:10px">${t('الترتيب هنا هو نفس ترتيب الأقسام في متجرك. القسم اللي فيه منتجات ما ينحذفش.')}</p>`
    : `<div class="card rv">${empty('layers', t('ما عندكش أقسام. أنشئ أول قسم وبعدين أضف منتجاتك فيه.'), `<button class="btn amber" data-act="stCatNew">${icon('plus')} ${t('قسم جديد')}</button>`)}</div>`}`;
}
async function saveCats(list) {
  const r = await apiPost('/m/store/cats', { categories: list });
  if (M.store && r?.categories) M.store.categories = r.categories;
  if (location.hash.startsWith('#store/cats')) catsView();
}
function catForm(c) {
  if (!guard()) return;
  const ed = !!c;
  let ic = c?.icon || 'star';
  const m = modal(ed ? t('تعديل القسم') : t('قسم جديد'), `
    <div class="field"><label>${t('اسم القسم')}</label><input id="cfName" maxlength="30" value="${esc(c?.name || '')}" placeholder="${t('مثلاً: اشتراكات')}"></div>
    <div class="field"><label>${t('الأيقونة')}</label><div class="chips" id="cfIcons">${CAT_ICONS.map(([k, l]) => `<button type="button" class="chip ${ic === k ? 'on' : ''}" data-ic="${k}" title="${t(l)}" aria-label="${t(l)}" style="display:inline-flex;align-items:center;gap:6px">${sic(k)}${t(l)}</button>`).join('')}</div></div>
    <p class="err" id="cfErr"></p>
    <div class="mfoot"><button class="btn amber" id="cfGo">${icon('check')} ${t('حفظ')}</button></div>`);
  const el = m.el;
  $$('[data-ic]', el).forEach(b => b.onclick = () => { ic = b.dataset.ic; $$('[data-ic]', el).forEach(x => x.classList.toggle('on', x === b)); });
  setTimeout(() => $('#cfName', el).focus(), 50);
  $('#cfGo', el).onclick = e => busy(e.currentTarget, async () => {
    const name = $('#cfName', el).value.trim().slice(0, 30);
    if (!name) { $('#cfErr', el).textContent = t('اكتب اسم القسم.'); return; }
    const cur = (M.store.categories || []).map(x => ({ ...x }));
    if (cur.some(x => x.name === name && x.id !== c?.id)) { $('#cfErr', el).textContent = t('فيه قسم بنفس الاسم.'); return; }
    if (ed) Object.assign(cur.find(x => x.id === c.id) || {}, { name, icon: ic });
    else { if (cur.length >= 12) throw new Error(t('أقصى حد 12 قسم.')); cur.push({ id: newCid(), name, icon: ic }); }
    try { await saveCats(cur); } catch (er) { $('#cfErr', el).textContent = er.message; return; }
    m.close(); toast(t('تم الحفظ'));
  });
}
async function catDel(id) {
  if (!guard()) return;
  const c = (M.store.categories || []).find(x => x.id === id); if (!c) return;
  const n = M.items.filter(i => i.cat === id).length;
  if (n) { toast(`${t('القسم فيه')} ${n} ${t('منتج. انقلهم لقسم ثاني أو احذفهم قبل ما تحذف القسم.')}`, 'bad'); return; }
  if (!await confirmBox(`${t('حذف قسم')} "<span data-raw>${esc(c.name)}</span>"؟`, { ok: t('حذف'), danger: true })) return;
  try { await saveCats(M.store.categories.filter(x => x.id !== id)); toast(t('تم الحذف')); } catch (e) { toast(e.message, 'bad'); }
}
async function catMove(spec) {
  if (!guard()) return;
  const [i, d] = spec.split(':').map(Number), l = (M.store.categories || []).map(x => ({ ...x })), j = i + d;
  if (j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  try { await saveCats(l); } catch (e) { toast(e.message, 'bad'); }
}

/* ===================== إنشاء المتجر ===================== */
function wizardView() {
  const w = M.wiz || (M.wiz = { step: 1, name: (A.S.profile.displayName || '').slice(0, 40), country: '', slug: '', template: 'pulse', slugState: '' });
  const st = w.step;
  const head = `<div class="steps">${[1, 2, 3].map(i => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div><p class="hint" style="margin-bottom:16px">${t('الخطوة')} ${st} ${t('من')} 3 · ${t(['معلومات المتجر', 'رابط المتجر', 'شكل المتجر'][st - 1])}</p>`;
  let body = '';
  if (st === 1) body = `<div class="field"><label>${t('اسم المتجر')}</label><input id="wzName" maxlength="40" value="${esc(w.name)}" placeholder="${t('مثلاً: متجر الصقر')}"></div>
    <div class="field"><label>${t('دولة المتجر')}</label><div class="grid2 keep">${[['LY', 'ليبيا', 'دينار ليبي'], ['SA', 'السعودية', 'ريال سعودي']].map(([k, n, c]) => `<button type="button" class="plan ${w.country === k ? 'on' : ''}" data-ctry="${k}" style="padding:14px"><b style="font-size:16px">${t(n)}</b><small class="dim">${t(c)}</small></button>`).join('')}</div>
    <p class="hint" style="margin-top:8px">${t('الدولة تحدد العملة وطرق الدفع، وما تتغيرش بعدين.')}</p></div>`;
  if (st === 2) body = `<div class="field"><label>${t('رابط المتجر')}</label><div class="slug"><input id="wzSlug" maxlength="30" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(w.slug)}" placeholder="saqr"><span>.${ROOT_DOMAIN}</span></div><p class="hint" id="wzMsg" style="margin-top:6px">${w.slugState === 'ok' ? `<span class="t-ok">${icon('check')} ${t('متاح')}</span>` : w.slugState === 'taken' ? `<span class="t-bad">${t('مأخوذ، جرّب غيره')}</span>` : ''}</p></div>
    <p class="hint">${t('حروف إنجليزية صغيرة وأرقام وشرطة (-) بس، من 3 لـ 30 حرف. هذا الرابط اللي بتبعته لزباينك.')}</p>`;
  if (st === 3) body = `<div class="tpls">${Object.entries(TEMPLATES).map(([k, T]) => `<button class="tplc ${w.template === k ? 'on' : ''}" data-tpl="${k}">${miniHTML(k)}${w.template === k ? `<span class="chk">${icon('check')}</span>` : ''}<b>${T.name}</b><small>${t(T.desc)}</small></button>`).join('')}</div><p class="hint" style="margin-top:12px">${t('تقدر تغيّر كل شي بعدين من التصميم: الألوان، الخط، الشكل، والأقسام.')}</p>`;
  const can = st === 1 ? w.name.trim() && w.country : st === 2 ? w.slugState === 'ok' : !!w.template;
  A.view.innerHTML = `<div class="gate">
    <section class="hero rv" style="margin-bottom:22px"><h1>${t('أنشئ متجرك')}</h1><p class="muted">${t('رابط خاص باسمك، والزبون يشتري ويدفع بأمان، وأنت تستلم أرباحك كل أسبوع.')}</p></section>
    <section class="card glow rv">${head}${body}<div class="row" style="margin-top:8px">${st > 1 ? `<button class="btn ghost" data-act="wzBack">${t('السابق')}</button>` : ''}<span class="spacer"></span><button class="btn amber" id="wzNext" data-act="wzNext" ${can ? '' : 'disabled'}>${st === 3 ? t('إنشاء المتجر') : t('التالي')}</button></div></section></div>`;
  const nm = $('#wzName'); if (nm) nm.oninput = () => { w.name = nm.value; $('#wzNext').disabled = !(w.name.trim() && w.country); };
  $$('[data-ctry]').forEach(b => b.onclick = () => { w.country = b.dataset.ctry; wizardView(); });
  $$('[data-tpl]').forEach(b => b.onclick = () => { w.template = b.dataset.tpl; wizardView(); });
  const sl = $('#wzSlug');
  if (sl) {
    let tm = 0;
    sl.oninput = () => {
      sl.value = sl.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); w.slug = sl.value; w.slugState = ''; $('#wzNext').disabled = true;
      const msg = $('#wzMsg'); clearTimeout(tm);
      if (!w.slug) { msg.textContent = ''; return; }
      if (!slugOk(w.slug)) { msg.innerHTML = `<span class="t-bad">${t(RESERVED.includes(w.slug) ? 'الاسم هذا محجوز، جرّب اسم ثاني.' : 'استعمل حروف إنجليزية صغيرة وأرقام، من 3 لـ 30 حرف.')}</span>`; return; }
      msg.textContent = t('نتأكد…');
      tm = setTimeout(async () => {
        const v = w.slug;
        try { const ex = await getDoc(doc(db, 'slugs', v)); if (v !== w.slug) return; w.slugState = ex.exists() ? 'taken' : 'ok'; }
        catch { w.slugState = ''; }
        msg.innerHTML = w.slugState === 'ok' ? `<span class="t-ok">${icon('check')} ${esc(v)}.${ROOT_DOMAIN} ${t('متاح')}</span>` : w.slugState === 'taken' ? `<span class="t-bad">${t('مأخوذ، جرّب غيره')}</span>` : `<span class="t-bad">${t('تعذر التحقق، جرّب مرة ثانية')}</span>`;
        $('#wzNext').disabled = w.slugState !== 'ok';
      }, 450);
    };
    setTimeout(() => sl.focus(), 50);
  }
}
async function createStore(btn) {
  const w = M.wiz;
  await busy(btn, async () => {
    if (!storeAllowed()) throw new Error(t('خطتك ما فيهاش متجر.'));
    await apiPost('/m/store/create', { name: w.name.trim().slice(0, 40), country: w.country, slug: w.slug, template: w.template, phone: (A.S.profile.phone || '').slice(0, 20) });
    M.wiz = null;
    toast(t('متجرك جاهز! ابدأ بإضافة أقسام متجرك'));
    location.hash = '#store/cats';
  });
}

/* ===================== الأحداث ===================== */
export const STORE_ACTS = {
  stCopy: () => copyText(storeUrl(M.store.slug)),
  stShare: async () => { const u = storeUrl(M.store.slug); if (navigator.share) { try { await navigator.share({ title: M.store.name, url: u }); } catch { } } else window.open(waLink('', u), '_blank'); },
  stOrder: id => { const o = orders().find(x => x.id === id); o && orderDetails(o); },
  stOtab: id => { M.otab = id; ordersView(); },
  stItemNew: () => itemNew(),
  stItemEdit: id => { const it = M.items.find(x => x.id === id); it && itemForm(it); },
  stItemDel: id => { const it = M.items.find(x => x.id === id); it && itemDel(it); },
  stCatNew: () => catForm(null),
  stWithdraw: async (id, b) => {
    const w = M.wallet || {};
    if (!M.priv?.payout?.details) { toast(t('حدد وين توصلك أرباحك من الإعدادات أولاً.'), 'bad'); location.hash = '#store/settings'; return; }
    if (minPay() && num(w.available) < minPay()) { toast(`${t('أقل مبلغ للسحب')} ${minPay()} ${sym()}`, 'bad'); return; }
    if (!await confirmBox(`${t('سحب')} <b>${money(w.available)}</b> ${t('على')} <span data-raw>${esc(M.priv.payout.method || '')} · ${esc(M.priv.payout.name || '')}</span>؟`, { ok: t('اسحب') })) return;
    await busy(b, async () => { const r = await apiPost('/m/wallet/withdraw'); toast(t('تم طلب السحب، الإدارة تحوّلك في أقرب وقت')); });
  },
  stCatEdit: id => { const c = (M.store.categories || []).find(x => x.id === id); c && catForm(c); },
  stCatDel: id => catDel(id),
  stCatMv: id => catMove(id),
  edTab: id => { M.edTab = id; $$('.ed-tabs button').forEach(b => b.classList.toggle('on', b.dataset.id === id)); edBody(); },
  edTpl: id => { const T = TEMPLATES[id]; Object.assign(M.ed.design, { template: id, palette: T.palette, color: '', card: T.card, corner: T.corner, mode: T.mode }); edBody(); pushPreview('/'); },
  edPal: id => { M.ed.design.palette = id; M.ed.design.color = ''; edBody(); pushPreview(); },
  edSet: id => { const [k, ...v] = id.split(':'); M.ed.design[k] = v.join(':'); edBody(); pushPreview(); },
  edMv: id => { const [i, d] = id.split(':').map(Number); const s = M.ed.sections; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; edBody(); pushPreview('/'); },
  edImgDel: id => { M.ed[id] = ''; edBody(); pushPreview('/'); },
  edFaqAdd: () => { (M.ed.info.faq ||= []).push({ q: '', a: '' }); edBody(); },
  edFaqDel: id => { M.ed.info.faq.splice(+id, 1); edBody(); pushPreview(); },
  edSave: (id, b) => edSave(b),
  edClose: () => closeEditor(false),
  wzNext: (id, b) => { const w = M.wiz; if (w.step === 3) return createStore(b); w.step++; wizardView(); },
  wzBack: () => { M.wiz.step--; wizardView(); }
};
export const storeState = M;
