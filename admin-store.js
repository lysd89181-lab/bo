// ملفي — إدارة المتاجر: تأكيد الدفع، البلاغات، المتاجر، التسويات، الموظفين
import {
  db, $, $$, esc, num, icon, toast, modal, confirmBox, busy, empty, skeleton, errText, fmtDate, ago, apiPost, storeUrl, safeImg, t, pushCardHTML,
  collection, doc, onSnapshot, query, where, getDoc, updateDoc
} from './core.js';

let A = null;
const X = { open: [], hist: [], stores: [], wallets: [], payouts: [], month: '', otab: 'awaiting', ptab: 'due', unsubs: [], seen: null, histUnsub: null };
const SYM = { LYD: 'د.ل', SAR: 'ر.س', USDT: 'USDT' };
const money = (n, c) => `⁦${(Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${SYM[c] || esc(c || '')}⁩`;
const monthKey = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const ST = { awaiting: ['warn', 'بانتظار الدفع'], preparing: ['info', 'قيد التجهيز'], delivered: ['ok', 'تم التسليم'], completed: ['off', 'مكتمل'], problem: ['bad', 'بلاغ'], refunded: ['off', 'مرجّع'], rejected: ['bad', 'مرفوض'], cancelled: ['off', 'ملغي'] };

export function setupAdminStore(ctx) {
  A = ctx;
  const ids = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  const err = e => console.error(e);
  X.month = monthKey(Date.now());
  X.unsubs.push(onSnapshot(query(collection(db, 'orders'), where('open', '==', true)), s => { X.open = ids(s).sort((a, b) => a.createdAt - b.createdAt); alertNew(); A.refresh('orders'); }, err));
  watchMonth();
  if (A.isAdmin) {
    X.unsubs.push(onSnapshot(collection(db, 'stores'), s => { X.stores = ids(s); A.refresh('stores'); }, err));
    X.unsubs.push(onSnapshot(collection(db, 'wallets'), s => { X.wallets = ids(s); A.refresh('wallets'); }, err));
    X.unsubs.push(onSnapshot(collection(db, 'payouts'), s => { X.payouts = ids(s).sort((a, b) => b.createdAt - a.createdAt); A.refresh('payouts'); }, err));
  } else ['stores', 'wallets', 'payouts'].forEach(k => A.refresh(k));
}
function watchMonth() {
  X.histUnsub?.();
  X.histUnsub = onSnapshot(query(collection(db, 'orders'), where('month', '==', X.month)), s => { X.hist = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt); A.refresh('ohist'); }, e => console.error(e));
}
function alertNew() {
  const ids = new Set(X.open.filter(o => o.status === 'awaiting').map(o => o.id));
  if (X.seen && [...ids].some(i => !X.seen.has(i))) { toast(t('طلب متجر جديد بانتظار تأكيد الدفع')); beep(); }
  X.seen = ids;
}
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, 200].forEach(d => setTimeout(() => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = .08; o.connect(g); g.connect(c.destination); o.start(); setTimeout(() => o.stop(), 150); }, d)); setTimeout(() => c.close(), 600); } catch { } }
export const awaitingOrders = () => X.open.filter(o => o.status === 'awaiting');
export const problemOrders = () => X.open.filter(o => o.status === 'problem');
export function bellItems() {
  return awaitingOrders().slice(0, 5).map(o => `<a class="bellitem soon" href="#sorders"><b data-raw>${esc(o.storeName)} · #${esc(o.id)}</b><small>${money(o.total, o.currency)} · ${t('بانتظار تأكيد الدفع')}</small></a>`).join('');
}

/* ===================== طلبات المتاجر ===================== */
export function vStoreOrders(view) {
  const tabs = [['awaiting', 'بانتظار الدفع', o => o.status === 'awaiting'], ['preparing', 'قيد التجهيز', o => o.status === 'preparing'], ['problem', 'بلاغات', o => o.status === 'problem'], ['delivered', 'مسلّمة', o => o.status === 'delivered'], ['hist', 'السجل', null]];
  const cur = tabs.find(x => x[0] === X.otab) || tabs[0];
  const list = cur[2] ? X.open.filter(cur[2]) : X.hist;
  const done = X.hist.filter(o => o.status === 'completed');
  const fees = {}; done.forEach(o => { fees[o.currency] = (fees[o.currency] || 0) + num(o.fee); });
  const sales = {}; X.hist.filter(o => o.paidAt && !['refunded'].includes(o.status)).forEach(o => { sales[o.currency] = (sales[o.currency] || 0) + num(o.total); });
  const sumTxt = o => Object.keys(o).length ? Object.entries(o).map(([c, v]) => money(v, c)).join(' + ') : '—';
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('طلبات المتاجر')}</h1><p>${t('أكّد الدفع من الإيصال، والتسليم يصير تلقائياً')}</p></div></div>
  ${A.isAdmin ? '' : `<div style="margin-bottom:16px">${pushCardHTML(t('فعّل الإشعارات باش يوصلك تنبيه أول ما يجي طلب يستنى تأكيد الدفع، أو بلاغ من زبون.'))}</div>`}
  ${A.isAdmin ? `<div class="kpis rv" style="margin-bottom:18px"><div class="kpi"><small>${t('مبيعات المتاجر هذا الشهر')}</small><b>${sumTxt(sales)}</b></div><div class="kpi"><small>${t('عمولة مكتملة هذا الشهر')}</small><b class="t-ok">${sumTxt(fees)}</b></div><div class="kpi"><small>${t('بانتظار الدفع')}</small><b class="num t-amber">${awaitingOrders().length}</b></div><div class="kpi"><small>${t('بلاغات مفتوحة')}</small><b class="num t-bad">${problemOrders().length}</b></div></div>` : ''}
  <div class="toolbar rv"><div class="chips scrollx">${tabs.map(([k, l, f]) => `<button class="chip ${X.otab === k ? 'on' : ''}" data-act="soTab" data-id="${k}">${t(l)}${f ? ` <span class="dim">${X.open.filter(f).length}</span>` : ''}</button>`).join('')}</div>
    ${X.otab === 'hist' ? `<input class="inp" type="month" id="soMonth" value="${X.month}" style="width:auto" aria-label="${t('الشهر')}">` : ''}</div>
  <div class="rems rv">${list.length ? list.map(orderCard).join('') : `<div class="card">${empty('receipt', t('ما فيش طلبات هنا.'))}</div>`}</div>`;
  const mi = $('#soMonth'); if (mi) mi.onchange = () => { if (/^\d{4}-\d{2}$/.test(mi.value)) { X.month = mi.value; X.hist = []; watchMonth(); } };
}
function orderCard(o) {
  const st = ST[o.status] || ['off', o.status];
  const items = (o.items || []).map(i => `${esc(i.name)}${i.opt ? ' · ' + esc(i.opt) : ''}${i.qty > 1 ? ' ×' + i.qty : ''}`).join('، ');
  const pay = o.payCurrency === 'USDT' ? `${money(o.payAmount, 'USDT')} <small class="dim">(${money(o.total, o.currency)})</small>` : money(o.total, o.currency);
  const acts = o.status === 'awaiting' ? `<button class="btn teal sm" data-act="soConfirm" data-id="${esc(o.id)}">${icon('check')} ${t('تأكيد الدفع')}</button><button class="btn red sm" data-act="soReject" data-id="${esc(o.id)}">${t('رفض')}</button>`
    : A.isAdmin && ['problem', 'preparing', 'delivered'].includes(o.status) ? `<button class="btn ghost sm" data-act="soResolve" data-id="${esc(o.id)}">${icon('shield')} ${t('حسم')}</button>` : '';
  return `<div class="rem socard ${o.status === 'awaiting' ? 'soon' : o.status === 'problem' ? 'over' : ''}" style="grid-template-columns:1fr auto;align-items:start">
    <div style="min-width:0;display:flex;flex-direction:column;gap:4px"><div><b style="display:inline" data-raw>${esc(o.storeName)}</b> <span class="dim num small">#${esc(o.id)}</span></div>
      <div class="when">${pay} · <span data-raw>${esc(o.method?.name || '')}</span></div>
      <div class="small muted" data-raw>${items}</div>
      <div class="small muted">${t('الزبون')}: <span data-raw>${esc(o.customer?.name)}</span> · <span class="ltr" data-raw>${esc(o.customer?.phone)}</span></div>
      <div class="small row" style="gap:6px"><span class="muted" data-raw>${esc(o.refLabel || t('رقم العملية'))}:</span><span class="ltr" style="font-weight:700" data-raw>${esc(o.reference)}</span><button class="iconbtn sm" style="width:28px;height:28px" data-act="copy" data-v="${esc(o.reference)}" aria-label="${t('نسخ')}">${icon('copy')}</button></div>
      ${o.problem ? `<div class="small t-bad">${icon('alert')} <span data-raw>${esc(o.problem.text)}</span>${o.problem.reply ? ` · ${t('رد المتجر')}: <span data-raw>${esc(o.problem.reply)}</span>` : ''}</div>` : ''}
      <div class="small row" style="gap:8px"><span class="dim">${ago(o.createdAt)}</span><span class="badge ${st[0]}">${t(st[1])}</span>${o.hasReceipt ? `<button class="btn ghost sm" style="height:30px" data-act="soReceipt" data-id="${esc(o.id)}">${icon('eye')} ${t('الإيصال')}</button>` : ''}</div></div>
    <div class="acts">${acts}</div></div>`;
}
const O = id => X.open.find(o => o.id === id) || X.hist.find(o => o.id === id);
async function confirmPay(o, btn) {
  const pay = o.payCurrency === 'USDT' ? money(o.payAmount, 'USDT') : money(o.total, o.currency);
  if (!await confirmBox(`${t('تأكيد استلام')} <b>${pay}</b> ${t('من')} <b data-raw>${esc(o.customer?.name)}</b> ${t('لطلب')} <b data-raw>${esc(o.storeName)}</b>؟<br><br>${t('بعد التأكيد تتسلّم المنتجات للزبون تلقائياً.')}`, { ok: t('تأكيد الدفع'), title: t('تأكيد الدفع') })) return;
  await busy(btn, async () => {
    const r = await apiPost(`/a/orders/${o.id}/confirm`);
    toast(r.failed ? t('تأكد الدفع، لكن فيه منتجات ما تسلّمتش (المخزون تغيّر). الطلب تحول لبلاغ.') : r.status === 'delivered' ? t('تأكد الدفع وتسلّم الطلب') : t('تأكد الدفع، الطلب عند التاجر للتسليم'));
  });
}
function rejectPay(o) {
  const m = modal(t('رفض الطلب'), `<p class="muted" style="margin-bottom:14px"><span data-raw>${esc(o.storeName)}</span> · #${esc(o.id)} · ${money(o.total, o.currency)}</p>
    <div class="field"><label>${t('السبب (يظهر للزبون)')}</label><input id="rjN" maxlength="300" value="${t('الدفع ما وصلش.')}"></div>
    <div class="mfoot"><button class="btn red" id="rjGo">${t('رفض الطلب')}</button></div>`);
  $('#rjGo', m.el).onclick = e => busy(e.currentTarget, async () => { await apiPost(`/a/orders/${o.id}/reject`, { note: $('#rjN', m.el).value.trim() }); m.close(); toast(t('تم رفض الطلب ورجع المخزون للتاجر')); });
}
function resolve(o) {
  const m = modal(t('حسم الطلب'), `<p class="muted" style="margin-bottom:10px"><span data-raw>${esc(o.storeName)}</span> · #${esc(o.id)} · ${t('للتاجر')} ${money(o.subtotal, o.currency)}</p>
    ${o.problem ? `<div class="summary"><div><span>${t('البلاغ')}</span><b data-raw>${esc(o.problem.text)}</b></div>${o.problem.reply ? `<div><span>${t('رد المتجر')}</span><b data-raw>${esc(o.problem.reply)}</b></div>` : ''}</div>` : ''}
    <div class="field"><label>${t('ملاحظة (تظهر للزبون)')}</label><input id="rsN" maxlength="300"></div>
    <div class="mfoot" style="flex-direction:column"><button class="btn teal" id="rsRel">${icon('check')} ${t('الطلب سليم: حوّل المبلغ للتاجر')}</button><button class="btn red" id="rsRef">${t('إرجاع المبلغ للزبون (تحوّله أنت يدوياً)')}</button></div>`);
  const go = action => e => busy(e.currentTarget, async () => {
    if (action === 'refund' && !await confirmBox(t('المبلغ ما يوصلش للتاجر، وأنت ترجّعه للزبون يدوياً. متأكد؟'), { ok: t('إرجاع'), danger: true })) return;
    await apiPost(`/a/orders/${o.id}/resolve`, { action, note: $('#rsN', m.el).value.trim() }); m.close(); toast(t('تم'));
  });
  $('#rsRel', m.el).onclick = go('release'); $('#rsRef', m.el).onclick = go('refund');
}
async function showReceipt(o) {
  const m = modal(t('صورة الإيصال'), `<div id="rcV">${skeleton(3)}</div>`, { wide: true });
  try {
    const s = await getDoc(doc(db, 'orderReceipts', o.id));
    const img = s.exists() ? safeImg(s.data().image) : '';
    $('#rcV', m.el).innerHTML = img ? `<img src="${img}" alt="" style="width:100%;border-radius:12px;display:block">` : empty('inbox', t('الإيصال مش موجود.'));
  } catch (e) { $('#rcV', m.el).innerHTML = empty('ban', errText(e)); }
}

/* ===================== المتاجر ===================== */
export function vStores(view) {
  const users = A.users();
  const wal = id => X.wallets.find(w => w.id === id) || {};
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('المتاجر')}</h1><p>${t('كل متاجر التجار وأرصدتهم')}</p></div></div>
  <div class="card rv" style="padding:0;overflow:hidden">${X.stores.length ? `<div class="tbl" style="border:0;border-radius:0"><table style="min-width:860px"><thead><tr><th>${t('المتجر')}</th><th>${t('التاجر')}</th><th>${t('الدولة')}</th><th>${t('معلّق')}</th><th>${t('قابل للسحب')}</th><th>${t('الحالة')}</th><th>${t('موقوف من الإدارة')}</th></tr></thead><tbody>
    ${X.stores.sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0)).map(s => { const u = users.find(x => x.id === s.id) || {}; const w = wal(s.id); return `<tr>
      <td><b data-raw>${esc(s.name)}</b><br><a class="link ltr" href="${esc(storeUrl(s.slug))}" target="_blank" rel="noopener" data-raw>${esc(s.slug)}</a></td>
      <td data-raw>${esc(u.displayName || '—')}<br><small class="dim ltr">${esc(u.email || '')}</small></td>
      <td>${t(s.country === 'SA' ? 'السعودية' : 'ليبيا')}</td><td class="num">${money(w.pending, s.currency)}</td><td class="num">${money(w.available, s.currency)}</td>
      <td><span class="badge ${s.status === 'active' && !s.suspended ? 'ok' : 'off'}">${t(s.suspended ? 'موقوف' : s.status === 'active' ? 'مفتوح' : 'موقّف من التاجر')}</span></td>
      <td><label class="toggle"><input type="checkbox" data-susp="${esc(s.id)}" ${s.suspended ? 'checked' : ''} aria-label="${t('إيقاف')}"><span></span></label></td></tr>`; }).join('')}
  </tbody></table></div>` : empty('store', t('ما فيش متاجر للحين.'))}</div>`;
  $$('[data-susp]').forEach(x => x.onchange = async () => {
    try { await updateDoc(doc(db, 'stores', x.dataset.susp), { suspended: x.checked }); toast(x.checked ? t('تم إيقاف المتجر') : t('تم تشغيل المتجر')); }
    catch (e) { x.checked = !x.checked; toast(e.message, 'bad'); }
  });
}

/* ===================== التسويات ===================== */
export function vPayouts(view) {
  const due = X.payouts.filter(p => p.status === 'due'), paid = X.payouts.filter(p => p.status === 'paid');
  const list = X.ptab === 'due' ? due : paid;
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('التسويات')}</h1><p>${t('كل 7 أيام من فتح المتجر، الأرباح المؤكدة تتحول للتاجر')}</p></div><button class="btn ghost" data-act="soCron">${icon('refresh')} ${t('تشغيل المهام الآن')}</button></div>
  <div class="toolbar rv"><div class="chips">${[['due', `قيد التحويل (${due.length})`], ['paid', 'المحوّلة']].map(([k, l]) => `<button class="chip ${X.ptab === k ? 'on' : ''}" data-act="soPtab" data-id="${k}">${t(l)}</button>`).join('')}</div></div>
  <div class="rems rv">${list.length ? list.map(p => `<div class="rem ${p.status === 'due' ? 'soon' : ''}" style="grid-template-columns:1fr auto"><div><b data-raw>${esc(p.storeName)}</b><span class="when num">${money(p.amount, p.currency)}</span><small>${fmtDate(p.createdAt)}${p.reference ? ` · <span data-raw>${esc(p.reference)}</span>` : ''}</small></div>
    <div class="acts">${p.status === 'due' ? `<button class="btn teal sm" data-act="soPay" data-id="${esc(p.id)}">${icon('check')} ${t('تم التحويل')}</button>` : `<span class="badge ok">${t('تم')}</span>`}</div></div>`).join('') : `<div class="card">${empty('wallet', t('ما فيش تسويات هنا.'))}</div>`}</div>`;
}
async function payDialog(p) {
  const m = modal(t('تحويل التسوية'), `<div id="pyV">${skeleton(2)}</div>`);
  let info = null; try { const s = await getDoc(doc(db, 'storePrivate', p.storeId)); info = s.exists() ? s.data().payout : null; } catch { }
  $('#pyV', m.el).innerHTML = `<div class="summary"><div><span>${t('المتجر')}</span><b data-raw>${esc(p.storeName)}</b></div><div><span>${t('المبلغ')}</span><b class="num">${money(p.amount, p.currency)}</b></div>
    ${info ? `<div><span>${t('الطريقة')}</span><b data-raw>${esc(info.method || '—')}</b></div><div><span>${t('الاسم')}</span><b data-raw>${esc(info.name || '—')}</b></div><div><span>${t('التفاصيل')}</span><b dir="auto" data-raw style="white-space:pre-wrap">${esc(info.details)}</b></div>` : `<div><span class="t-bad">${t('التاجر ما حددش بيانات التحويل')}</span></div>`}</div>
    <div class="field"><label>${t('رقم عملية التحويل')}</label><input id="pyR" maxlength="120"></div>
    <div class="mfoot"><button class="btn teal" id="pyGo">${icon('check')} ${t('تأكيد التحويل')}</button></div>`;
  $('#pyGo', m.el).onclick = e => busy(e.currentTarget, async () => { await apiPost(`/a/payouts/${p.id}/paid`, { reference: $('#pyR', m.el).value.trim() }); m.close(); toast(t('تم تسجيل التحويل')); });
}

/* ===================== الموظفين ===================== */
export function vStaff(view) {
  const staff = A.users().filter(u => u.role === 'staff');
  view.innerHTML = `
  <div class="pagehead rv"><div><h1>${t('الموظفين')}</h1><p>${t('الموظف يقدر يأكد أو يرفض دفع طلبات المتاجر بس')}</p></div></div>
  <section class="card rv" style="max-width:760px;margin-bottom:18px"><div class="shead"><h2>${t('إضافة موظف')}</h2><p>${t('الموظف يسجل حساب عادي في ملفي، وبعدين تضيفه هنا بإيميله.')}</p></div>
    <div class="row"><input class="inp" id="stfE" dir="ltr" placeholder="email@example.com" style="flex:1;min-width:200px"><button class="btn amber" id="stfGo">${icon('plus')} ${t('إضافة')}</button></div></section>
  <div class="rems rv" style="max-width:760px">${staff.length ? staff.map(u => `<div class="rem" style="grid-template-columns:1fr auto"><div><b data-raw>${esc(u.displayName || '—')}</b><small class="ltr" data-raw>${esc(u.email)}</small></div><button class="btn red sm" data-act="stfDel" data-id="${esc(u.id)}">${t('إزالة')}</button></div>`).join('') : `<div class="card">${empty('users', t('ما فيش موظفين.'))}</div>`}</div>`;
  $('#stfGo').onclick = e => busy(e.currentTarget, async () => {
    const em = $('#stfE').value.trim().toLowerCase();
    const u = A.users().find(x => String(x.email).toLowerCase() === em);
    if (!u) throw new Error(t('ما فيش حساب بهذا الإيميل. خلّيه يسجل أولاً.'));
    if (u.role === 'admin') throw new Error(t('الحساب هذا أدمن.'));
    if (!await confirmBox(`${t('إضافة')} <b data-raw>${esc(u.displayName || u.email)}</b> ${t('كموظف؟ لو عنده متجر أو اشتراك تاجر، لوحة التاجر تتقفل عليه.')}`, { ok: t('إضافة') })) return;
    await updateDoc(doc(db, 'users', u.id), { role: 'staff' }); toast(t('تمت الإضافة'));
  });
}

/* ===================== الإعدادات: المتاجر ===================== */
export function storeSettingsHTML(pf) {
  const fees = c => (pf.storeFees?.[c] || [{ upTo: 50, rate: 5 }, { upTo: 100, rate: 4 }, { upTo: 200, rate: 3 }, { upTo: 0, rate: 2 }]);
  const row = (c, f) => `<div class="frow feerow" data-c="${c}"><input class="inp" data-up inputmode="decimal" dir="ltr" placeholder="${t('أقل من (فاضي = الباقي)')}" value="${f.upTo || ''}"><input class="inp" data-rt inputmode="decimal" dir="ltr" placeholder="%" value="${f.rate ?? ''}"><button type="button" class="iconbtn sm" data-rmfee aria-label="${t('حذف')}">${icon('x')}</button></div>`;
  return `<section class="card rv section" style="max-width:860px">
    <h2 style="margin-bottom:6px">${t('المتاجر')}</h2><p class="muted small" style="margin-bottom:16px">${t('رسوم الخدمة يدفعها الزبون فوق سعر التاجر، وكل ما كبرت الفاتورة قلّت النسبة.')}</p>
    ${['LYD', 'SAR'].map(c => `<div class="lbl" style="margin-top:6px">${t(c === 'LYD' ? 'شرائح الدينار الليبي' : 'شرائح الريال السعودي')} <span class="dim">(${t('أقل من المبلغ ← النسبة %')})</span></div><div data-fees="${c}">${fees(c).map(f => row(c, f)).join('')}</div><button type="button" class="btn ghost sm" data-addfee="${c}" style="margin-bottom:14px">${icon('plus')} ${t('شريحة')}</button>`).join('')}
    <div class="grid2"><div class="field"><label>${t('سعر USDT بالدينار (1 USDT = ؟ د.ل)')}</label><input id="gsRL" inputmode="decimal" dir="ltr" value="${pf.usdtRate?.LYD ?? ''}"></div><div class="field"><label>${t('سعر USDT بالريال (1 USDT = ؟ ر.س)')}</label><input id="gsRS" inputmode="decimal" dir="ltr" value="${pf.usdtRate?.SAR ?? ''}"></div></div>
    <p class="hint" style="margin:-6px 0 14px">${t('فاضي = USDT ما يظهرش في المتاجر بهذي العملة')}</p>
    <div class="grid2"><div class="field"><label>${t('التأكيد التلقائي بعد التسليم (ساعة)')}</label><input id="gsCH" type="number" min="1" max="168" dir="ltr" value="${pf.completeHours || 24}"></div><div class="field"><label>${t('إلغاء الطلب لو الدفع ما تأكدش خلال (ساعة)')}</label><input id="gsAH" type="number" min="1" max="168" dir="ltr" value="${pf.awaitHours || 24}"></div></div>
    <label class="row" style="margin-bottom:16px"><span class="toggle"><input type="checkbox" id="gsTS" ${pf.trialStore ? 'checked' : ''}><span></span></span><span><b>${t('المتجر متاح في التجربة المجانية')}</b></span></label>
    <button class="btn amber" id="gsStoreSave">${t('حفظ إعدادات المتاجر')}</button></section>`;
}
let feeBound = false;
export function bindStoreSettings(save) {
  const row = c => `<div class="frow feerow" data-c="${c}"><input class="inp" data-up inputmode="decimal" dir="ltr" placeholder="${t('أقل من (فاضي = الباقي)')}"><input class="inp" data-rt inputmode="decimal" dir="ltr" placeholder="%"><button type="button" class="iconbtn sm" data-rmfee aria-label="${t('حذف')}">${icon('x')}</button></div>`;
  $$('[data-addfee]').forEach(b => b.onclick = () => { const box = $(`[data-fees="${b.dataset.addfee}"]`); if ($$('.feerow', box).length < 8) box.insertAdjacentHTML('beforeend', row(b.dataset.addfee)); });
  if (!feeBound) { feeBound = true; document.addEventListener('click', e => { const d = e.target.closest('[data-rmfee]'); if (d) d.closest('.feerow').remove(); }); }
  const btn = $('#gsStoreSave'); if (!btn) return;
  btn.onclick = e => busy(e.currentTarget, async () => {
    const storeFees = {};
    for (const c of ['LYD', 'SAR']) {
      const tiers = $$(`.feerow[data-c="${c}"]`).filter(r => $('[data-rt]', r).value.trim() !== '').map(r => ({ upTo: Math.max(0, num($('[data-up]', r).value)), rate: num($('[data-rt]', r).value) }));
      if (tiers.some(x => x.rate < 0 || x.rate > 30)) throw new Error(t('النسبة لازم تكون بين 0 و 30.'));
      if (!tiers.some(x => !x.upTo)) tiers.push({ upTo: 0, rate: tiers.length ? tiers[tiers.length - 1].rate : 0 });
      const ups = tiers.filter(x => x.upTo).map(x => x.upTo);
      if (new Set(ups).size !== ups.length) throw new Error(t('فيه شرائح مكررة.'));
      storeFees[c] = tiers.sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity)).slice(0, 8);
    }
    const rate = v => { const n = num(v); return n > 0 ? n : 0; };
    await save({ storeFees, usdtRate: { LYD: rate($('#gsRL').value), SAR: rate($('#gsRS').value) }, completeHours: Math.min(168, Math.max(1, Math.floor(num($('#gsCH').value)) || 24)), awaitHours: Math.min(168, Math.max(1, Math.floor(num($('#gsAH').value)) || 24)), trialStore: $('#gsTS').checked });
    toast(t('تم الحفظ'));
  });
}

/* ===================== الأحداث ===================== */
export const ADMIN_STORE_ACTS = {
  soTab: id => { X.otab = id; A.rerender(); },
  soPtab: id => { X.ptab = id; A.rerender(); },
  soConfirm: (id, b) => { const o = O(id); o && confirmPay(o, b); },
  soReject: id => { const o = O(id); o && rejectPay(o); },
  soResolve: id => { const o = O(id); o && resolve(o); },
  soReceipt: id => { const o = O(id); o && showReceipt(o); },
  soPay: id => { const p = X.payouts.find(x => x.id === id); p && payDialog(p); },
  soCron: (id, b) => busy(b, async () => { const r = await apiPost('/a/maintenance'); toast(`${t('تم')}: ${r.completed || 0} ${t('مكتمل')}، ${r.expired || 0} ${t('ملغي')}، ${r.settled || 0} ${t('تسوية')}`); }),
  stfDel: async id => { const u = A.users().find(x => x.id === id); if (u && await confirmBox(`${t('إزالة')} <span data-raw>${esc(u.displayName || u.email)}</span> ${t('من الموظفين؟')}`, { ok: t('إزالة'), danger: true })) updateDoc(doc(db, 'users', id), { role: 'merchant' }).then(() => toast(t('تمت الإزالة'))).catch(e => toast(e.message, 'bad')); }
};
