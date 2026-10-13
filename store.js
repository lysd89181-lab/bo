// متاجر ملفي — واجهة الزبون (تشتغل على xxx.malafy.net، وكمعاينة داخل محرر التاجر)
import { normDesign, normSections, storeTokens, colorsOf, fontHref, ic, TYPE_ICON } from './store-theme.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = n => Math.round((+n || 0) * 100) / 100;
const fmt = n => round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const SYM = { LYD: 'د.ل', SAR: 'ر.س', USDT: 'USDT' };
const money = (n, cur) => `⁦${fmt(n)} ${SYM[cur || B.store.currency] || ''}⁩`;
const monthsTxt = m => m === 1 ? 'شهر' : m === 2 ? 'شهرين' : m <= 10 ? `${m} أشهر` : `${m} شهر`;
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const when = ms => { if (!ms) return ''; const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}، ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const IMG_OK = v => typeof v === 'string' && (/^\/img\/[A-Za-z0-9/_-]+(\?v=\d+)?$/.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) ? v : '';
const safeUrl = (v, hosts) => { try { const u = new URL(String(v || '')); if (!/^https?:$/.test(u.protocol)) return ''; if (hosts && !hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) return ''; return u.href; } catch { return ''; } };
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};

const app = $('#app');
const bootEl = document.getElementById('boot');
const PREVIEW = !bootEl && new URLSearchParams(location.search).has('preview');
let B = null;
let route = { n: 'home' };
let depth = 0;
let cart = [];
const sel = {};
const co = { name: '', phone: '', methodId: '', ref: '', receipt: '' };
let flash = '';
let pollT = 0;
const orders = {}; // id -> view data

/* ===================== أدوات العرض ===================== */
function toast(msg, bad) {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; t.setAttribute('role', 'status');
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}
async function copy(v) {
  try { await navigator.clipboard.writeText(v); }
  catch { const a = document.createElement('textarea'); a.value = v; a.style.cssText = 'position:fixed;opacity:0'; document.body.append(a); a.select(); try { document.execCommand('copy'); } catch { } a.remove(); }
  toast('تم النسخ');
}
const items = () => B.items || [];
const item = id => items().find(i => i.id === id);
const store = () => B.store;
const cur = () => B.store.currency;
const slugKey = k => `${k}:${PREVIEW ? 'preview' : B.store.slug}`;
const art = (it, cls = 'art') => { const src = IMG_OK(it.img); return `<div class="${cls} artbg">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ic(TYPE_ICON[it.type] || 'star', 1.4)}</div>`; };
function priceInfo(it) {
  let list = [];
  if (it.type === 'account') list = (it.durations || []).map(d => d.price);
  else if (it.type === 'code') list = [it.price];
  else if (it.type === 'number') list = it.mode === 'pick' ? (it.numbers || []).map(n => n.price) : (it.prices || []).filter(p => p.n > 0).map(p => p.price);
  else if (it.type === 'manual') list = (it.packs || []).map(p => p.price);
  if (!list.length && it.type === 'number' && it.mode !== 'pick') list = (it.prices || []).map(p => p.price);
  list = list.filter(x => x > 0);
  return { min: list.length ? Math.min(...list) : 0, many: new Set(list).size > 1 || (it.type === 'account' && (it.durations || []).length > 1) };
}
const inStock = it => (it.stock || 0) > 0;
function pcard(it) {
  const { min, many } = priceInfo(it); const out = !inStock(it);
  const quick = it.type === 'code' && !out;
  return `<a class="pc ${out ? 'dim' : ''}" href="/p/${esc(it.id)}" data-go>${art(it)}${out ? '<span class="out">نفد</span>' : ''}
    <div class="meta"><b>${esc(it.name)}</b><div class="row"><span class="price num">${many ? '<small>من </small>' : ''}${money(min)}</span>
    ${quick ? `<span class="addb" role="button" style="display:grid;place-items:center" data-a="quick" data-v="${esc(it.id)}">أضف</span>` : `<span class="addb" style="display:grid;place-items:center">${out ? 'نفد' : 'عرض'}</span>`}</div></div></a>`;
}
const cartCount = () => cart.reduce((a, l) => a + l.qty, 0);
function logoBox() {
  const s = store(), src = IMG_OK(s.logo);
  return `<span class="slogo">${src ? `<img src="${esc(src)}" alt="">` : esc((s.name || '؟').trim().charAt(0))}</span>`;
}
function top(title, { backable = true } = {}) {
  const myOrders = LS.get(slugKey('morders'), []).length;
  const left = `${myOrders && route.n !== 'orders' ? `<a class="ibtn" href="/orders" data-go aria-label="طلباتي">${ic('receipt')}</a>` : ''}
    ${route.n !== 'cart' && route.n !== 'checkout' ? `<a class="ibtn" href="/cart" data-go aria-label="السلة">${ic('cart')}${cartCount() ? `<span class="dot">${cartCount()}</span>` : ''}</a>` : ''}`;
  return `<header class="st-top"><div class="wrap">${backable ? `<button class="ibtn" type="button" data-a="back" aria-label="رجوع">${ic('back', 2)}</button><h1>${esc(title)}</h1>` : `<a class="brand" href="/" data-go>${logoBox()}<b>${esc(store().name)}</b></a>`}${left}</div></header>`;
}
function footer() {
  const s = store(), so = s.info.socials || {};
  const links = [['instagram', 'insta', 'Instagram', ['instagram.com']], ['tiktok', 'tiktok', 'TikTok', ['tiktok.com']], ['facebook', 'fb', 'Facebook', ['facebook.com', 'fb.com', 'fb.me']], ['telegram', 'tg', 'Telegram', ['t.me', 'telegram.me']], ['snapchat', 'snap', 'Snapchat', ['snapchat.com']], ['x', 'xs', 'X', ['x.com', 'twitter.com']]]
    .map(([k, i, n, h]) => { const u = safeUrl(so[k], h); return u ? `<a class="ibtn" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="${n}">${ic(i)}</a>` : ''; }).join('');
  const wa = s.info.whatsapp ? `<a class="ibtn" href="https://wa.me/${esc(s.info.whatsapp)}" target="_blank" rel="noopener noreferrer" aria-label="واتساب">${ic('wa')}</a>` : '';
  return `<footer class="foot"><div class="soc">${wa}${links}</div>${esc(s.name)} © ${new Date().getFullYear()}</footer>`;
}
const waFab = () => store().info.whatsapp && store().info.floatWa !== false ? `<a class="wafab" href="https://wa.me/${esc(store().info.whatsapp)}" target="_blank" rel="noopener noreferrer" aria-label="تواصل مع المتجر على واتساب">${ic('wa', 2)}</a>` : '';

/* ===================== الصفحات ===================== */
function homeHTML() {
  const s = store(), info = s.info, list = items();
  const cats = (s.categories || []).filter(c => list.some(i => i.cat === c.id));
  const feat = list.filter(i => i.featured).slice(0, 8);
  const parts = {
    announce: () => info.announce ? `<div class="annc">${esc(info.announce)}</div>` : '',
    hero: () => { const cv = IMG_OK(s.cover); return `<section class="hero ${cv ? 'has-cover' : ''}">${cv ? `<img class="cover" src="${esc(cv)}" alt="">` : `<div class="art">${ic('sparkle', 1.1)}</div>`}<h2>${esc(info.heroTitle || s.name)}</h2>${info.heroSub ? `<p>${esc(info.heroSub)}</p>` : ''}</section>`; },
    cats: () => cats.length ? `<section class="sec wrap"><div class="sec-h"><h2>الأقسام</h2></div><div class="cats">${cats.map(c => `<a class="cat" href="/c/${esc(c.id)}" data-go><span class="i">${ic(c.icon || 'star', 1.6)}</span>${esc(c.name)}</a>`).join('')}</div></section>` : '',
    featured: () => feat.length ? `<section class="sec wrap"><div class="sec-h"><h2>المميزة</h2><a class="lnk" href="/c/all" data-go>عرض الكل</a></div><div class="plist">${feat.map(pcard).join('')}</div></section>` : '',
    all: () => list.length ? `<section class="sec wrap"><div class="sec-h"><h2>كل المنتجات</h2>${list.length > 12 ? '<a class="lnk" href="/c/all" data-go>عرض الكل</a>' : ''}</div><div class="plist">${list.slice(0, 12).map(pcard).join('')}</div></section>` : `<section class="sec wrap"><div class="empty">المتجر يجهز منتجاته، ارجع قريب.</div></section>`,
    about: () => info.about ? `<section class="sec wrap"><div class="sec-h"><h2>من نحن</h2></div><div class="card"><p class="prose">${esc(info.about)}</p></div></section>` : '',
    faq: () => (info.faq || []).length ? `<section class="sec wrap"><div class="sec-h"><h2>أسئلة شائعة</h2></div><div class="card" style="padding:4px 16px">${info.faq.map(f => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div></section>` : '',
    policy: () => info.policy ? `<section class="sec wrap"><div class="sec-h"><h2>سياسة الاسترجاع</h2></div><div class="card"><p class="prose">${esc(info.policy)}</p></div></section>` : ''
  };
  return `${top('', { backable: false })}${normSections(s.sections).filter(x => x.on).map(x => parts[x.id]?.() || '').join('')}${footer()}${waFab()}`;
}
let q = '';
function catHTML(id) {
  const s = store();
  const c = (s.categories || []).find(x => x.id === id);
  const all = id === 'all';
  if (!all && !c) return notFoundHTML();
  const ql = q.trim().toLowerCase();
  const list = items().filter(i => (all || i.cat === id) && (!ql || i.name.toLowerCase().includes(ql)));
  const cats = (s.categories || []).filter(x => items().some(i => i.cat === x.id));
  return `${top(all ? 'كل المنتجات' : c.name)}<div class="wrap">
    ${all ? `<label class="searchbox">${ic('search')}<input id="q" type="search" placeholder="ابحث عن منتج…" value="${esc(q)}" aria-label="بحث"></label>` : ''}
    ${cats.length > 1 ? `<div class="sec" style="padding-top:14px"><div class="chips"><a class="chip ${all ? 'on' : ''}" href="/c/all" data-go>الكل</a>${cats.map(x => `<a class="chip ${x.id === id ? 'on' : ''}" href="/c/${esc(x.id)}" data-go>${esc(x.name)}</a>`).join('')}</div></div>` : ''}
    <section class="sec" style="padding-top:14px">${list.length ? `<div class="plist">${list.map(pcard).join('')}</div>` : '<div class="empty">ما فيش منتجات هنا.</div>'}</section></div>${waFab()}`;
}
function selOf(it) {
  if (!sel[it.id]) {
    const firstD = (it.durations || []).find(d => d.m <= (it.maxMonths || 0)) || (it.durations || [])[0];
    const firstC = (it.prices || []).find(p => p.n > 0) || (it.prices || [])[0];
    sel[it.id] = { m: firstD?.m || 1, pack: 0, numberId: (it.numbers || [])[0]?.id || '', country: firstC?.country || '', qty: 1, input: [] };
  }
  return sel[it.id];
}
function unitFor(it, s) {
  if (it.type === 'account') { const d = (it.durations || []).find(x => x.m === s.m); return { unit: d?.price || 0, max: d && d.m <= (it.maxMonths || 0) ? Math.min(5, it.stock || 0) : 0 }; }
  if (it.type === 'code') return { unit: it.price, max: Math.min(it.maxQty || 10, it.stock || 0) };
  if (it.type === 'number' && it.mode === 'pick') { const n = (it.numbers || []).find(x => x.id === s.numberId); return { unit: n?.price || 0, max: n ? 1 : 0 }; }
  if (it.type === 'number') { const p = (it.prices || []).find(x => x.country === s.country); return { unit: p?.price || 0, max: p ? Math.min(10, p.n) : 0 }; }
  if (it.type === 'manual') { const p = (it.packs || [])[s.pack]; return { unit: p?.price || 0, max: p ? 10 : 0 }; }
  return { unit: 0, max: 0 };
}
function prodHTML(id) {
  const it = item(id);
  if (!it) return notFoundHTML();
  const s = selOf(it); const { unit, max } = unitFor(it, s);
  if (s.qty > Math.max(1, max)) s.qty = Math.max(1, max);
  let opts = '', note = '';
  const radio = (on, act, val, label, price, disabled, small = '') => `<button type="button" class="opt ${on ? 'on' : ''}" data-a="${act}" data-v="${esc(val)}" ${disabled ? 'disabled' : ''}><span class="rad"></span><span class="grow">${label}${small ? `<small>${small}</small>` : ''}</span><b class="num">${money(price)}</b></button>`;
  if (it.type === 'account') {
    opts = `<div class="lbl">اختار المدة</div>${(it.durations || []).map(d => radio(s.m === d.m, 'm', d.m, monthsTxt(d.m), d.price, d.m > (it.maxMonths || 0) || !inStock(it), d.m > (it.maxMonths || 0) && inStock(it) ? 'غير متاحة حالياً' : '')).join('')}`;
    note = `<div class="note info">${ic('bolt')}<span>يوصلك فوراً بعد تأكيد الدفع: الإيميل، كلمة المرور، ورقم الملف.</span></div>`;
  } else if (it.type === 'code') {
    note = `<div class="note info">${ic('bolt')}<span>الكود يوصلك فوراً بعد تأكيد الدفع.</span></div>`;
  } else if (it.type === 'number' && it.mode === 'pick') {
    opts = (it.numbers || []).length ? `<div class="lbl">اختار الرقم</div>${it.numbers.map(n => radio(s.numberId === n.id, 'num', n.id, `<span class="ltr">${esc(n.mask)}</span>`, n.price, false, esc(n.country))).join('')}` : '';
    note = `<div class="note info">${ic('bolt')}<span>الرقم يوصلك كامل فوراً بعد تأكيد الدفع.</span></div>`;
  } else if (it.type === 'number') {
    opts = `<div class="lbl">اختار الدولة</div>${(it.prices || []).map(p => radio(s.country === p.country, 'ctry', p.country, esc(p.country), p.price, !p.n, p.n ? 'رقم متاح يوصلك تلقائياً' : 'نفدت')).join('')}`;
    note = `<div class="note info">${ic('bolt')}<span>يوصلك رقم متاح من الدولة اللي اخترتها فوراً بعد تأكيد الدفع.</span></div>`;
  } else if (it.type === 'manual') {
    opts = `${(it.fields || []).map((f, i) => `<div class="fld"><label for="in${i}">${esc(f.label)}${f.req ? '' : ' (اختياري)'}</label><input class="inp" id="in${i}" data-in="${i}" maxlength="100" dir="auto" value="${esc(s.input[i] || '')}"></div>`).join('')}
      <div class="lbl">الباقة</div>${(it.packs || []).map((p, i) => radio(s.pack === i, 'pack', i, esc(p.label), p.price, false)).join('')}`;
    note = `<div class="note warn">${ic('clock')}<span>الطلب هذا يتسلّم من المتجر بعد تأكيد الدفع${(it.fields || []).length ? '، تأكد من البيانات اللي كتبتها' : ''}.</span></div>`;
  }
  const qtyable = it.type !== 'number' || it.mode !== 'pick';
  const out = !inStock(it) || max < 1;
  return `${top('تفاصيل المنتج')}<div class="wrap pd"><div>${art(it, 'pd-art')}</div><div>
    <div class="pd-h"><h2>${esc(it.name)}</h2>${it.desc ? `<p>${esc(it.desc)}</p>` : ''}<div class="badges">${out ? '<span class="badge b-bad">نفد</span>' : '<span class="badge b-ok">متاح</span>'}</div></div>
    <div class="pad">${opts}${qtyable && !out ? `<div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 14px"><span style="font-weight:600">الكمية</span><div class="qty"><button type="button" data-a="pq" data-v="-1" aria-label="أقل" ${s.qty <= 1 ? 'disabled' : ''}>${ic('minus', 2.2)}</button><b class="num">${s.qty}</b><button type="button" data-a="pq" data-v="1" aria-label="أكثر" ${s.qty >= max ? 'disabled' : ''}>${ic('plus', 2.2)}</button></div></div>` : ''}${note}${it.note ? `<div class="note info">${ic('info')}<span>${esc(it.note)}</span></div>` : ''}</div></div></div>
    <div class="bar"><div class="in"><button class="sbtn" type="button" data-a="add" data-v="${esc(it.id)}" ${out || !unit ? 'disabled' : ''}>${out ? 'نفد من المخزون' : `${ic('cart', 2)} أضف للسلة · <span class="num">${money(unit * s.qty)}</span>`}</button></div></div>`;
}
function lineInfo(l) {
  const it = item(l.itemId); if (!it) return null;
  let unit = 0, sub = '', max = 0, ok = true;
  if (it.type === 'account') { const d = (it.durations || []).find(x => x.m === +l.opt); if (!d) return null; unit = d.price; sub = monthsTxt(d.m); max = d.m <= (it.maxMonths || 0) ? Math.min(5, it.stock || 0) : 0; }
  else if (it.type === 'code') { unit = it.price; max = Math.min(it.maxQty || 10, it.stock || 0); }
  else if (it.type === 'number' && it.mode === 'pick') { const n = (it.numbers || []).find(x => x.id === l.numberId); if (!n) return null; unit = n.price; sub = `<span class="ltr">${esc(n.mask)}</span>`; max = 1; }
  else if (it.type === 'number') { const p = (it.prices || []).find(x => x.country === l.opt); if (!p) return null; unit = p.price; sub = esc(p.country); max = Math.min(10, p.n || 0); }
  else if (it.type === 'manual') { const p = (it.packs || [])[+l.opt]; if (!p) return null; unit = p.price; sub = esc(p.label) + (l.input || []).filter(Boolean).map(v => ' · ' + esc(v)).join(''); max = 10; }
  else return null;
  if (!(unit > 0)) return null;
  if (max < 1 || l.qty > max) ok = false;
  return { it, unit, sub, max, ok, total: round2(unit * l.qty) };
}
function feeRate(sub) {
  const tiers = (B.pay?.fees || []).map(t => ({ upTo: +t.upTo || 0, rate: +t.rate || 0 })).sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity));
  for (const t of tiers) if (!t.upTo || sub < t.upTo) return { rate: t.rate, tiers, idx: tiers.indexOf(t) };
  return { rate: 0, tiers, idx: -1 };
}
function totals() {
  const lines = cart.map(l => ({ l, x: lineInfo(l) })).filter(o => o.x);
  const sub = round2(lines.reduce((a, o) => a + o.x.total, 0));
  const { rate, tiers, idx } = feeRate(sub);
  const fee = round2(sub * rate / 100);
  return { lines, sub, rate, fee, total: round2(sub + fee), tiers, idx, ok: lines.length > 0 && lines.every(o => o.x.ok) };
}
function saveCart() { cart = cart.filter(l => lineInfo(l)); LS.set(slugKey('mcart'), cart); }
function cartHTML() {
  saveCart();
  if (!cart.length) return `${top('السلة')}<div class="done-h"><div class="ok muted">${ic('cart')}</div><h2>السلة فاضية</h2><p>تصفح المنتجات وضيف اللي يعجبك.</p></div><div class="pad"><a class="sbtn" href="/" data-go>تصفح المنتجات</a></div>`;
  const T = totals();
  const next = T.idx >= 0 ? T.tiers[T.idx] : null, lower = T.idx >= 0 ? T.tiers[T.idx + 1] : null;
  return `${top('السلة')}<div class="pad">${T.lines.map(({ l, x }, i) => `<div class="ci">${art(x.it, 'th artbg')}<div class="grow"><b>${esc(x.it.name)}</b>${x.sub ? `<small>${x.sub}</small>` : ''}<span class="price num" style="font-size:14px">${money(x.total)}</span>${x.ok ? '' : `<small style="color:var(--s-bad-t)">${x.max < 1 ? 'نفد من المخزون، احذفه من السلة' : `المتوفر ${x.max} بس`}</small>`}</div>
      <div class="side">${x.max > 1 || l.qty > 1 ? `<div class="qty"><button type="button" data-a="cq" data-v="${i}:-1" aria-label="أقل">${ic('minus', 2.2)}</button><b class="num">${l.qty}</b><button type="button" data-a="cq" data-v="${i}:1" aria-label="أكثر" ${l.qty >= x.max ? 'disabled' : ''}>${ic('plus', 2.2)}</button></div>` : ''}<button class="ibtn" style="width:36px;height:36px" type="button" data-a="crm" data-v="${i}" aria-label="حذف">${ic('x')}</button></div></div>`).join('')}
    <div class="card"><div class="line"><span>المجموع</span><b class="num">${money(T.sub)}</b></div><div class="line"><span>رسوم الخدمة (${T.rate}%)</span><b class="num">${money(T.fee)}</b></div><div class="line total"><span>الإجمالي</span><b class="num">${money(T.total)}</b></div></div>
    ${next?.upTo && lower && lower.rate < T.rate ? `<div class="note info">${ic('sparkle')}<span>كل ما زادت السلة قلّت الرسوم. زيد <b class="num">${money(next.upTo - T.sub)}</b> وتنزل الرسوم لـ ${lower.rate}%.</span></div>` : ''}
    </div><div class="bar"><div class="in"><a class="sbtn" href="/checkout" data-go ${T.ok ? '' : 'aria-disabled="true" style="opacity:.5;pointer-events:none"'}>إتمام الطلب · <span class="num">${money(T.total)}</span></a></div></div>`;
}
function checkoutHTML() {
  saveCart();
  if (!cart.length) { setTimeout(() => go('/cart', true)); return ''; }
  const T = totals(), ms = B.pay?.methods || [];
  if (!ms.some(m => m.id === co.methodId)) co.methodId = ms[0]?.id || '';
  const m = ms.find(x => x.id === co.methodId);
  const pay = m && m.pay === 'USDT' ? Math.ceil(T.total / (m.rate || 1) * 100 - 1e-9) / 100 : T.total;
  const country = store().country;
  return `${top('إتمام الطلب')}<div class="pad">
    <div class="card"><h3><span class="n">1</span>بياناتك</h3>
      <div class="fld"><label for="coName">الاسم</label><input class="inp" id="coName" maxlength="60" autocomplete="name" value="${esc(co.name)}" placeholder="مثلاً: أحمد سالم"></div>
      <div class="fld" style="margin:0"><label for="coPhone">رقم الواتساب</label><input class="inp" id="coPhone" maxlength="20" dir="ltr" inputmode="tel" autocomplete="tel" value="${esc(co.phone)}" placeholder="${country === 'SA' ? '05XXXXXXXX' : '09XXXXXXXX'}"></div></div>
    <div class="card"><h3><span class="n">2</span>طريقة الدفع</h3>
      ${ms.length ? `<div class="pms">${ms.map(x => `<button type="button" class="pm ${x.id === co.methodId ? 'on' : ''}" data-a="pm" data-v="${esc(x.id)}"><span class="pi">${IMG_OK(x.img) ? `<img src="${esc(x.img)}" alt="">` : ic('card')}</span>${esc(x.name)}</button>`).join('')}</div>
      ${(m.fields || []).map(f => `<div class="cp"><div class="grow"><small>${esc(f.label)}</small><b>${esc(f.value)}</b></div><button class="cpb" type="button" data-a="copy" data-v="${esc(f.value)}">${ic('copy')}نسخ</button></div>`).join('')}
      <div class="cp"><div class="grow"><small>المبلغ المطلوب</small><b class="num">${money(pay, m.pay)}</b></div><button class="cpb" type="button" data-a="copy" data-v="${esc(String(pay))}">${ic('copy')}نسخ</button></div>
      ${m.pay === 'USDT' ? `<p class="safe" style="justify-content:flex-start">سعر الصرف: 1 USDT = ${esc(fmt(m.rate))} ${SYM[cur()]}</p>` : ''}
      ${m.note ? `<div class="note info" style="margin:10px 0 0">${ic('info')}<span>${esc(m.note)}</span></div>` : ''}` : `<div class="note warn">${ic('alert')}<span>الدفع غير متاح حالياً في المتجر. تواصل مع المتجر.</span></div>`}</div>
    ${m ? `<div class="card"><h3><span class="n">3</span>إثبات الدفع</h3>
      <div class="fld"><label for="coRef">${esc(m.inputLabel)}</label><input class="inp" id="coRef" maxlength="120" dir="auto" value="${esc(co.ref)}"></div>
      ${m.receipt !== 'none' ? `<label class="drop" for="coFile">${co.receipt ? `<img src="${esc(co.receipt)}" alt="الإيصال"><span>تم رفع الإيصال. اضغط للتغيير</span>` : `${ic('upload')}<b style="color:var(--s-text)">ارفع صورة الإيصال${m.receipt === 'required' ? '' : ' (اختياري)'}</b><span>صورة واضحة للتحويل</span>`}</label><input type="file" id="coFile" accept="image/*" hidden>` : ''}</div>` : ''}
    <div class="card">${T.lines.map(({ x, l }) => `<div class="line"><span>${esc(x.it.name)}${l.qty > 1 ? ` × ${l.qty}` : ''}</span><b class="num">${money(x.total)}</b></div>`).join('')}
      <div class="line"><span>رسوم الخدمة (${T.rate}%)</span><b class="num">${money(T.fee)}</b></div><div class="line total"><span>الإجمالي</span><b class="num">${money(T.total)}</b></div></div>
    <div class="safe">${ic('lock')}دفع آمن عبر ملفي. المبلغ ما يوصل للمتجر إلا بعد ما تستلم طلبك.</div>
    </div><div class="bar"><div class="in"><button class="sbtn" type="button" id="place" data-a="place" ${m && T.ok ? '' : 'disabled'}>${ic('check', 2.2)} تأكيد الطلب · <span class="num">${money(T.total)}</span></button></div></div>`;
}
const STATUS = { awaiting: ['بانتظار تأكيد الدفع', 'b-warn'], preparing: ['قيد التجهيز', 'b-info'], delivered: ['تم التسليم', 'b-ok'], completed: ['مكتمل', 'b-ok'], problem: ['بلاغ مفتوح', 'b-bad'], refunded: ['تم إرجاع المبلغ', 'b-off'], rejected: ['مرفوض', 'b-bad'], cancelled: ['ملغي', 'b-off'] };
function myOrders() { return LS.get(slugKey('morders'), []).filter(o => o && /^[A-Za-z0-9]{1,20}$/.test(o.id) && typeof o.t === 'string'); }
function tokenOf(id) { return myOrders().find(o => o.id === id)?.t || ''; }
function orderHTML(id) {
  const o = orders[id];
  const back = top('تتبع الطلب');
  if (!o) return `${back}<div class="pad"><div class="card"><div class="empty">${o === null ? 'الطلب مش موجود، أو الرابط ناقص.' : 'جاري التحميل…'}</div></div></div>`;
  const manual = o.items.some(i => i.type === 'manual');
  const steps = [['awaiting', 'تم استلام طلبك', o.createdAt], ['paid', 'تم تأكيد الدفع', o.paidAt], ...(manual ? [['preparing', 'قيد التجهيز', 0]] : []), ['delivered', 'تم التسليم', o.deliveredAt], ['completed', 'مكتمل', o.completedAt]];
  const pos = { awaiting: 0, preparing: manual ? 2 : 1, delivered: manual ? 3 : 2, problem: manual ? 3 : 2, completed: manual ? 4 : 3 }[o.status];
  const bad = ['rejected', 'cancelled', 'refunded'].includes(o.status);
  const st = STATUS[o.status] || ['—', 'b-off'];
  const ready = o.items.filter(i => i.lines.length);
  const waMsg = `مرحباً، بخصوص طلبي رقم #${o.id}`;
  const link = `${location.origin}/o/${o.id}#${tokenOf(o.id)}`;
  return `${back}${flash === o.id ? `<div class="done-h"><div class="ok">${ic('check', 2.4)}</div><h2>وصلنا طلبك!</h2><p>رقم الطلب <b class="num" style="color:var(--s-text)">#${esc(o.id)}</b><br>نتأكد من الدفع، وبعدها يوصلك طلبك هنا.</p></div>` : ''}<div class="pad">
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px"><b class="num">#${esc(o.id)}</b><span class="badge ${st[1]}">${st[0]}</span></div>
      ${bad ? `<div class="note ${o.status === 'refunded' ? 'info' : 'bad'}" style="margin:0">${ic('alert')}<span>${o.status === 'rejected' ? 'ما قدرناش نأكد الدفع' : o.status === 'cancelled' ? 'تم إلغاء الطلب لأن الدفع ما تأكدش في الوقت' : 'تم إرجاع مبلغ الطلب'}${o.note ? `: ${esc(o.note)}` : ''}${o.resolution?.note ? `: ${esc(o.resolution.note)}` : ''}</span></div>`
      : `<div class="tl">${steps.map(([k, l, t], i) => { const done = i < pos || (i === pos && ['delivered', 'completed'].includes(k)); return `<div class="st1 ${done ? 'done' : i === pos ? 'cur' : ''}"><span class="dotx">${done ? ic('check', 3) : ''}</span><div><b>${l}</b><small>${t ? when(t) : ''}</small></div></div>`; }).join('')}</div>`}</div>
    ${o.status === 'awaiting' ? `<div class="note info">${ic('info')}<span>نراجع الدفع ونأكده في أقرب وقت. الصفحة هذي تتحدث لحالها.</span></div>` : ''}
    ${ready.length ? `<div class="card"><h3 style="color:var(--s-ok-t)">${ic('check', 2.4).replace('<svg', '<svg style="width:18px;height:18px"')}طلبك جاهز</h3>${ready.map(i => `<div class="codebox"><b>${esc(i.name)}${i.opt ? ` · ${esc(i.opt)}` : ''}</b>${i.lines.map(x => `<div class="cv"><div style="flex:1;min-width:0"><small>${esc(x.l)}</small><code>${esc(x.v)}</code></div><button class="cpb" type="button" data-a="copy" data-v="${esc(x.v)}">${ic('copy')}نسخ</button></div>`).join('')}</div>`).join('')}</div>` : ''}
    ${o.items.some(i => i.status !== 'delivered') && ['preparing', 'problem'].includes(o.status) ? `<div class="note warn">${ic('clock')}<span>${o.items.filter(i => i.status !== 'delivered').map(i => esc(i.name)).join('، ')}: قيد التجهيز عند المتجر.</span></div>` : ''}
    ${o.problem ? `<div class="card"><h3>${ic('alert')}البلاغ</h3><p class="prose">${esc(o.problem.text)}</p>${o.problem.reply ? `<div class="note info" style="margin:12px 0 0">${ic('info')}<span><b>رد المتجر:</b> ${esc(o.problem.reply)}</span></div>` : ''}${o.status === 'problem' ? `<p class="safe">مبلغك محفوظ لين تنحل المشكلة، وفريق ملفي يتابع.</p>` : ''}</div>` : ''}
    ${o.canReceive || o.canReport ? `<div class="gap" style="margin-bottom:14px">${o.canReceive ? `<button class="sbtn" type="button" data-a="recv">${ic('check', 2.2)} استلمت، كل شي تمام</button>` : ''}
      ${o.canReport ? `<button class="sbtn ghost" type="button" data-a="showProblem">عندي مشكلة</button><div id="probBox" hidden><div class="fld"><label for="probText">اشرح المشكلة</label><textarea class="inp" id="probText" maxlength="600"></textarea></div><button class="sbtn" type="button" data-a="sendProblem">إرسال البلاغ</button></div>` : ''}
      ${o.status === 'delivered' && o.autoAt ? `<p class="safe">${ic('clock')}لو ما فيش مشكلة، الطلب يتأكد تلقائياً ${when(o.autoAt)}.</p>` : ''}</div>` : ''}
    <div class="card"><h3>تفاصيل الدفع</h3>${o.items.map(i => `<div class="line"><span>${esc(i.name)}${i.opt ? ` · ${esc(i.opt)}` : ''}${i.qty > 1 ? ` × ${i.qty}` : ''}</span><b class="num">${money(i.total, o.currency)}</b></div>`).join('')}
      <div class="line"><span>رسوم الخدمة</span><b class="num">${money(o.fee, o.currency)}</b></div><div class="line total"><span>الإجمالي</span><b class="num">${money(o.total, o.currency)}</b></div>
      ${o.payCurrency === 'USDT' ? `<div class="line"><span>المدفوع</span><b class="num">${money(o.payAmount, 'USDT')}</b></div>` : ''}<div class="line"><span>${esc(o.method)}</span><b dir="auto">${esc(o.reference)}</b></div></div>
    <div class="cp" style="margin:0 0 12px"><div class="grow"><small>رابط تتبع طلبك (احفظه)</small><b class="ltr" style="font-size:13px">${esc(link)}</b></div><button class="cpb" type="button" data-a="copy" data-v="${esc(link)}">${ic('copy')}نسخ</button></div>
    ${o.store.whatsapp ? `<a class="sbtn ghost" href="https://wa.me/${esc(o.store.whatsapp)}?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener noreferrer">${ic('wa')} تواصل مع المتجر</a>` : ''}
    <div class="safe">${ic('shield')}دفع آمن عبر ملفي</div></div>`;
}
function ordersHTML() {
  const list = myOrders();
  return `${top('طلباتي')}<div class="pad">${list.length ? `<div class="card" style="padding:4px 16px">${list.map(o => { const v = orders[o.id]; const st = v ? STATUS[v.status] : null; return `<a class="ord" href="/o/${esc(o.id)}" data-go><div class="grow"><b class="num">#${esc(o.id)}</b><small>${when(o.at)}</small></div>${st ? `<span class="badge ${st[1]}">${st[0]}</span>` : ''}<b class="num">${money(o.total)}</b></a>`; }).join('')}</div>` : '<div class="empty">ما عندكش طلبات على هذا الجهاز.</div>'}</div>`;
}
const notFoundHTML = () => `${top('غير موجود')}<div class="done-h"><div class="ok muted">${ic('search')}</div><h2>الصفحة مش موجودة</h2><p>يمكن المنتج انحذف أو الرابط غلط.</p></div><div class="pad"><a class="sbtn" href="/" data-go>الرجوع للمتجر</a></div>`;
function closedHTML() {
  const s = store();
  const why = s.closedWhy === 'paused' ? 'المتجر واقف مؤقتاً.' : 'المتجر مغلق حالياً.';
  return `<div class="closed"><div>${logoBox()}<h2>${esc(s.name)}</h2><p>${why} جرّب بعدين${s.info.whatsapp ? '، أو تواصل مع المتجر' : ''}.</p>${s.info.whatsapp ? `<a class="sbtn wa" href="https://wa.me/${esc(s.info.whatsapp)}" target="_blank" rel="noopener noreferrer">${ic('wa')} تواصل على واتساب</a>` : ''}${myOrders().length ? `<a class="sbtn ghost" style="margin-top:10px" href="/orders" data-go>طلباتي</a>` : ''}</div></div>`;
}

/* ===================== التنقل والرسم ===================== */
function parse(path) {
  let m;
  if ((m = path.match(/^\/c\/([A-Za-z0-9_-]{1,40})\/?$/))) return { n: 'cat', id: m[1] };
  if ((m = path.match(/^\/p\/([A-Za-z0-9_-]{1,40})\/?$/))) return { n: 'prod', id: m[1] };
  if ((m = path.match(/^\/o\/([A-Za-z0-9]{1,20})\/?$/))) return { n: 'order', id: m[1] };
  if (/^\/cart\/?$/.test(path)) return { n: 'cart' };
  if (/^\/checkout\/?$/.test(path)) return { n: 'checkout' };
  if (/^\/orders\/?$/.test(path)) return { n: 'orders' };
  if (path === '/' || path === '') return { n: 'home' };
  return { n: 'nf' };
}
function go(path, replace) {
  const [p, hash] = path.split('#');
  if (PREVIEW) { route = parse(p); render(true); return; }
  if (replace) history.replaceState({ d: depth }, '', path); else { depth++; history.pushState({ d: depth }, '', path); }
  route = parse(p); if (hash) saveTokenFromHash(route, hash);
  render(true);
}
function back() { if (!PREVIEW && depth > 0) history.back(); else go('/', true); }
function render(toTop) {
  if (!B) return;
  clearTimeout(pollT);
  const s = store();
  let html;
  if (!s.open && !['order', 'orders'].includes(route.n)) html = closedHTML();
  else if (route.n === 'home') html = homeHTML();
  else if (route.n === 'cat') html = catHTML(route.id);
  else if (route.n === 'prod') html = prodHTML(route.id);
  else if (route.n === 'cart') html = cartHTML();
  else if (route.n === 'checkout') html = checkoutHTML();
  else if (route.n === 'order') { html = orderHTML(route.id); loadOrder(route.id); }
  else if (route.n === 'orders') { html = ordersHTML(); loadOrderList(); }
  else html = notFoundHTML();
  app.innerHTML = (PREVIEW ? '<span class="preview-tag">معاينة</span>' : '') + html;
  bindPage();
  if (toTop) window.scrollTo(0, 0);
}
function bindPage() {
  const qi = $('#q', app); if (qi) qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; render(false); const n = $('#q', app); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  $$('[data-in]', app).forEach(el => el.oninput = () => { const it = item(route.id); if (it) selOf(it).input[+el.dataset.in] = el.value.trim(); });
  const bindCo = (id, k) => { const el = $('#' + id, app); if (el) el.oninput = () => { co[k] = el.value; if (k === 'name' || k === 'phone') LS.set('mcust', { name: co.name, phone: co.phone }); }; };
  bindCo('coName', 'name'); bindCo('coPhone', 'phone'); bindCo('coRef', 'ref');
  const f = $('#coFile', app);
  if (f) f.onchange = async () => { const file = f.files[0]; f.value = ''; if (!file) return; try { co.receipt = await compress(file); render(false); } catch (e) { toast(e.message, true); } };
}
function applyTheme() {
  const d = normDesign(store().design);
  document.documentElement.style.cssText = storeTokens(d);
  app.className = `st tpl-${d.template} cards-${d.card}`;
  let l = document.getElementById('sfont');
  const href = fontHref(d.font);
  if (!l) { l = document.createElement('link'); l.id = 'sfont'; l.rel = 'stylesheet'; document.head.append(l); }
  if (l.getAttribute('href') !== href) l.setAttribute('href', href);
  let tc = document.querySelector('meta[name="theme-color"]');
  if (!tc) { tc = document.createElement('meta'); tc.name = 'theme-color'; document.head.append(tc); }
  tc.content = colorsOf(d).bg;
}
async function compress(file) {
  if (!/^image\//.test(file.type)) throw new Error('اختار صورة.');
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('تعذر قراءة الصورة.')); r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('صيغة الصورة غير مدعومة.')); i.src = url; });
  for (const [max, q] of [[1400, .82], [1200, .72], [1000, .62], [800, .55]]) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', q);
    if (out.length < 880000) return out;
  }
  throw new Error('الصورة كبيرة، جرّب صورة أصغر.');
}

/* ===================== الشبكة ===================== */
async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(token ? { 'x-order-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  let j = {}; try { j = await r.json(); } catch { }
  if (!r.ok) { const e = new Error(j.error || 'صار خطأ، جرّب مرة ثانية.'); e.status = r.status; e.data = j; throw e; }
  return j;
}
async function refreshCatalog() { try { B = await api('/api/store'); applyTheme(); } catch { } }
async function loadOrder(id) {
  if (PREVIEW) { if (orders[id] === undefined) { orders[id] = null; } return; }
  const t = tokenOf(id);
  if (!t) { if (orders[id] === undefined) { orders[id] = null; setTimeout(() => route.n === 'order' && route.id === id && render(false)); } return; }
  try {
    const o = await api('/api/orders/' + id, { token: t });
    const changed = JSON.stringify(orders[id]) !== JSON.stringify(o);
    orders[id] = o;
    if (changed && route.n === 'order' && route.id === id && !$('#probText:focus')) render(false);
  } catch (e) { if (e.status === 404) { orders[id] = null; if (route.n === 'order' && route.id === id) render(false); } }
  finally {
    clearTimeout(pollT);
    const o = orders[id];
    if (o && ['awaiting', 'preparing', 'delivered', 'problem'].includes(o.status)) pollT = setTimeout(() => { if (route.n === 'order' && route.id === id && !document.hidden) loadOrder(id); else if (route.n === 'order' && route.id === id) pollT = setTimeout(() => loadOrder(id), 5000); }, 15000);
  }
}
let listLoaded = false;
async function loadOrderList() {
  if (PREVIEW || listLoaded) return; listLoaded = true;
  await Promise.all(myOrders().slice(0, 10).map(async o => { try { orders[o.id] = await api('/api/orders/' + o.id, { token: o.t }); } catch { } }));
  if (route.n === 'orders') render(false);
}
function saveTokenFromHash(r, hash) {
  if (r.n !== 'order' || !/^[A-Za-z0-9]{10,64}$/.test(hash || '')) return;
  const list = myOrders();
  if (!list.some(o => o.id === r.id)) { list.unshift({ id: r.id, t: hash, at: Date.now(), total: 0 }); LS.set(slugKey('morders'), list.slice(0, 30)); }
  else if (!list.find(o => o.id === r.id).t) { list.find(o => o.id === r.id).t = hash; LS.set(slugKey('morders'), list); }
}

/* ===================== الأحداث ===================== */
function addToCart(it, s, qty) {
  const line = { itemId: it.id, qty };
  if (it.type === 'account') line.opt = String(s.m);
  if (it.type === 'number' && it.mode === 'pick') { line.numberId = s.numberId; line.qty = 1; }
  if (it.type === 'number' && it.mode !== 'pick') line.opt = s.country;
  if (it.type === 'manual') {
    const miss = (it.fields || []).find((f, i) => f.req && !s.input[i]);
    if (miss) { toast(`اكتب ${miss.label}`, true); $(`[data-in="${(it.fields || []).indexOf(miss)}"]`, app)?.focus(); return; }
    line.opt = String(s.pack); line.input = (it.fields || []).map((f, i) => (s.input[i] || '').slice(0, 100));
  }
  const key = l => JSON.stringify([l.itemId, l.opt || '', l.numberId || '', l.input || []]);
  const ex = cart.find(l => key(l) === key(line));
  const info = lineInfo(ex ? { ...ex, qty: ex.qty + line.qty } : line);
  if (!info) { toast('الاختيار هذا غير متاح.', true); return; }
  if (!info.ok) { toast(`المتوفر ${info.max} بس.`, true); return; }
  if (ex) ex.qty += line.qty; else cart.push(line);
  if (cart.length > 10) { cart.pop(); toast('أقصى حد 10 منتجات في الطلب.', true); return; }
  saveCart(); toast('تمت الإضافة للسلة'); render(false);
}
async function place(btn) {
  if (PREVIEW) { toast('هذي معاينة، الطلب ما يتبعتش.'); return; }
  const T = totals(); const m = (B.pay?.methods || []).find(x => x.id === co.methodId);
  if (!co.name.trim()) { toast('اكتب اسمك.', true); $('#coName')?.focus(); return; }
  if (co.phone.replace(/\D/g, '').length < 9) { toast('اكتب رقم واتساب صحيح.', true); $('#coPhone')?.focus(); return; }
  if (!m) { toast('اختار طريقة الدفع.', true); return; }
  if (!co.ref.trim()) { toast(`اكتب ${m.inputLabel}.`, true); $('#coRef')?.focus(); return; }
  if (m.receipt === 'required' && !co.receipt) { toast('ارفع صورة الإيصال.', true); return; }
  btn.disabled = true; btn.classList.add('loading');
  try {
    const r = await api('/api/orders', { method: 'POST', body: { items: cart, customer: { name: co.name.trim(), phone: co.phone.trim() }, methodId: m.id, reference: co.ref.trim(), receipt: m.receipt !== 'none' ? co.receipt : '', quote: T.total } });
    const list = myOrders(); list.unshift({ id: r.id, t: r.token, at: Date.now(), total: r.total }); LS.set(slugKey('morders'), list.slice(0, 30));
    cart = []; saveCart(); co.ref = ''; co.receipt = ''; flash = r.id; listLoaded = false;
    refreshCatalog();
    go(`/o/${r.id}`, true);
  } catch (e) {
    toast(e.message, true);
    if (e.status === 409) { await refreshCatalog(); render(false); }
  } finally { btn.disabled = false; btn.classList.remove('loading'); }
}
async function orderAction(kind) {
  const id = route.id, t = tokenOf(id);
  try {
    if (kind === 'recv') orders[id] = await api(`/api/orders/${id}/received`, { method: 'POST', body: {}, token: t });
    else { const text = ($('#probText')?.value || '').trim(); if (text.length < 5) { toast('اشرح المشكلة باختصار.', true); return; } orders[id] = await api(`/api/orders/${id}/problem`, { method: 'POST', body: { text }, token: t }); }
    toast(kind === 'recv' ? 'شكراً! تم تأكيد الاستلام' : 'تم إرسال البلاغ'); flash = ''; render(false);
  } catch (e) { toast(e.message, true); loadOrder(id); }
}
const ACT = {
  back, quick: id => { const it = item(id); if (it) addToCart(it, selOf(it), 1); },
  m: v => { selOf(item(route.id)).m = +v; render(false); },
  num: v => { selOf(item(route.id)).numberId = v; render(false); },
  ctry: v => { selOf(item(route.id)).country = v; render(false); },
  pack: v => { selOf(item(route.id)).pack = +v; render(false); },
  pq: v => { const it = item(route.id); const s = selOf(it); s.qty = Math.max(1, Math.min(unitFor(it, s).max || 1, s.qty + +v)); render(false); },
  add: id => { const it = item(id); if (it) { const s = selOf(it); addToCart(it, s, s.qty); } },
  cq: v => { const [i, d] = v.split(':').map(Number); const l = cart[i]; if (!l) return; l.qty += d; if (l.qty < 1) cart.splice(i, 1); saveCart(); render(false); },
  crm: v => { cart.splice(+v, 1); saveCart(); render(false); },
  pm: v => { co.methodId = v; render(false); },
  copy: v => copy(v),
  place: (v, b) => place(b),
  recv: () => orderAction('recv'),
  showProblem: (v, b) => { $('#probBox').hidden = false; b.hidden = true; $('#probText').focus(); },
  sendProblem: () => orderAction('problem')
};
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]');
  if (a && app.contains(a)) { e.preventDefault(); e.stopPropagation(); if (!a.disabled) ACT[a.dataset.a]?.(a.dataset.v, a); return; }
  const l = e.target.closest('a[data-go]');
  if (l && !e.ctrlKey && !e.metaKey && !e.shiftKey && l.getAttribute('aria-disabled') !== 'true') { e.preventDefault(); go(l.getAttribute('href')); }
});
window.addEventListener('popstate', e => { depth = e.state?.d || 0; route = parse(location.pathname); render(true); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && route.n === 'order') loadOrder(route.id); });

/* ===================== التشغيل ===================== */
function start() {
  cart = LS.get(slugKey('mcart'), []).filter(l => l && typeof l.itemId === 'string' && l.qty > 0).map(l => ({ ...l, qty: Math.min(10, Math.floor(l.qty)) }));
  const c = LS.get('mcust', {}); co.name = c.name || ''; co.phone = c.phone || '';
  applyTheme();
  render(false);
}
if (PREVIEW) {
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== window.parent || e.data?.type !== 'malafy-preview') return;
    const first = !B;
    B = e.data.payload;
    if (e.data.route) route = parse(e.data.route);
    if (first) start(); else { applyTheme(); render(!!e.data.route); }
  });
  window.parent.postMessage({ type: 'malafy-preview-ready' }, location.origin);
} else {
  history.scrollRestoration = 'manual';
  route = parse(location.pathname);
  const live = () => {
    if (location.hash) { saveTokenFromHash(route, location.hash.slice(1)); if (route.n === 'order') history.replaceState({ d: 0 }, '', location.pathname); }
    start();
  };
  try { B = JSON.parse(bootEl.textContent); } catch { B = null; }
  if (B?.store) live();
  else api('/api/store').then(j => { B = j; live(); }).catch(() => { app.innerHTML = '<p style="text-align:center;padding:40vh 20px 0;font-family:system-ui">تعذر تحميل المتجر. حدّث الصفحة.</p>'; });
}
