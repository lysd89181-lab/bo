// ملفي — الأدوات المشتركة بين كل الصفحات
import {
  initializeApp, getAuth, getFirestore, onAuthStateChanged, signOut, doc, getDoc, setDoc, serverTimestamp
} from './fb.js';
export * from './fb.js';
import { LANG, isEN, t, startI18n, getTheme, setTheme, setLang } from './i18n.js';
export { LANG, isEN, t, startI18n, getTheme, setTheme, setLang };

const firebaseConfig = {
  apiKey: "AIzaSyAPhOPjAgfGhON7ZJGiXAfNf2GFQr-LbvU",
  authDomain: "bolhia-8d9e4.firebaseapp.com",
  projectId: "bolhia-8d9e4",
  storageBucket: "bolhia-8d9e4.firebasestorage.app",
  messagingSenderId: "488563746126",
  appId: "1:488563746126:web:876cb478bf6a3aad8e2a1f"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ---------- DOM ---------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- العملة والأرقام ---------- */
// عملات اشتراك المنصة
export const CURS = { LYD: { ar: 'د.ل', en: 'LYD', name: 'دينار ليبي' }, SAR: { ar: 'ر.س', en: 'SAR', name: 'ريال سعودي' }, USDT: { ar: 'USDT', en: 'USDT', name: 'USDT' } };
const SYM_EN = { 'د.ل': 'LYD', 'ر.س': 'SAR' };
const fmtNum = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
// الرقم أولاً ثم مسافة ثم الرمز: «15 $» و«1,250 د.ل»
const withSym = (s, sym) => { sym = esc(sym || '$'); return '\u2066' + s + '\u00A0' + (isEN ? (SYM_EN[sym] || sym) : sym) + '\u2069'; };
let CUR = '$';
export const setCurrency = c => { CUR = ['$', 'د.ل', 'ر.س'].includes(c) ? c : '$'; };
export const money = n => withSym(fmtNum(n), CUR);
// مبلغ بعملة محددة (LYD / SAR / USDT) — للاشتراكات
export const moneyIn = (n, code) => withSym(fmtNum(n), CURS[code]?.ar || '$');
// أسعار الخطة: تدعم الشكل القديم (price) والجديد (prices)
export const planPrices = p => { const o = {}; const pr = p?.prices || {}; Object.keys(CURS).forEach(c => { if (pr[c] != null && pr[c] !== '') o[c] = +pr[c]; }); if (!Object.keys(o).length && p?.price != null) o.LYD = +p.price; return o; };
export const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };

/* ---------- التواريخ (نخزنها milliseconds) ---------- */
export const DAY = 864e5;
const p2 = n => String(n).padStart(2, '0');
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// «05 نوفمبر 2026» / «Nov 05, 2026»
export const fmtDate = ms => { if (!ms) return '—'; const d = new Date(ms); return isEN ? `${MONTHS_EN[d.getMonth()]} ${p2(d.getDate())}, ${d.getFullYear()}` : `${p2(d.getDate())} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtShort = ms => { const d = new Date(ms); return isEN ? `${MONTHS_EN[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`; };
export const formatDate = fmtDate;
export const toInput = ms => { const d = new Date(ms || Date.now()); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const fromInput = v => { if (!v) return 0; const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export const startOfDay = (ms = Date.now()) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const addMonths = (ms, m) => { const d = new Date(ms); const day = d.getDate(); d.setMonth(d.getMonth() + m); if (d.getDate() < day) d.setDate(0); return d.getTime(); };
export const daysLeft = ms => Math.ceil((ms - Date.now()) / DAY);
// عدد الأشهر (مقرّب للأعلى) بين تاريخين
export const monthsCeil = (a, b) => { if (b <= a) return 0; let m = 0; while (addMonths(a, m) < b && m < 240) m++; return m; };
export const tsMs = t => !t ? 0 : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : 0;
export const ago = ms => {
  if (Date.now() - ms > 7 * 864e5) return fmtDate(ms);
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'منذ يوم' : `منذ ${d} يوم`;
};
export const monthsTxt = m => m === 1 ? 'شهر' : m === 2 ? 'شهرين' : m <= 10 ? `${m} أشهر` : `${m} شهر`;
export const leftText = ms => {
  const d = daysLeft(ms);
  if (ms < Date.now()) return 'انتهى الاشتراك';
  if (d <= 1) return 'ينتهي اليوم';
  if (d === 2) return 'ينتهي بعد يومين';
  return d <= 10 ? `ينتهي بعد ${d} أيام` : `ينتهي بعد ${d} يوم`;
};

/* ---------- واتساب والقوالب ---------- */
export const normPhone = p => {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('09') && d.length === 10) d = '218' + d.slice(1);   // رقم ليبي محلي
  else if (d.startsWith('9') && d.length === 9) d = '218' + d;
  return d;
};
export const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(text || '')}`;
export const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? '') !== '' ? vars[k] : m);
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
  toast('تم النسخ');
}

/* ---------- الأيقونات ---------- */
const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/>',
  folderOpen: '<path d="M3 18.5V6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h7A1.5 1.5 0 0 1 19.5 9v1.5"/><path d="M3 18.5 5.6 11.6A1.5 1.5 0 0 1 7 10.5h13.4a1 1 0 0 1 .95 1.3L19.3 18.9a1.5 1.5 0 0 1-1.4 1.1H4.5A1.5 1.5 0 0 1 3 18.5Z"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 21h4"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  wa: '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20l1.2-4.2A8.5 8.5 0 1 1 20.5 11.5Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  ticket: '<path d="M3 7h18v3.5a1.5 1.5 0 0 0 0 3V17H3v-3.5a1.5 1.5 0 0 0 0-3Z"/><path d="M14 7v2M14 11v2M14 15v2"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5Z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/>',
  send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4Z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6Z"/>',
  arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>'
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

let lgId = 0;
export const LOGO = (cls = '') => {
  const id = 'lgm' + (++lgId);
  return `<svg class="logo ${cls}" viewBox="88 34 204 202" aria-hidden="true"><defs><linearGradient id="${id}" x1="110" y1="0" x2="270" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#B45309"/><stop offset=".5" stop-color="#F59E0B"/><stop offset="1" stop-color="#FCD34D"/></linearGradient></defs><path class="paper" d="M142,40 H226 L250,64 V140 H130 V52 Q130,40 142,40 Z" fill="#F8FAFC"/><path d="M226,40 V58 Q226,64 232,64 H250 Z" fill="#F59E0B"/><rect x="156" y="78" width="52" height="5" rx="2.5" fill="#070B19" opacity=".75"/><rect x="156" y="93" width="68" height="5" rx="2.5" fill="#070B19" opacity=".75"/><rect x="156" y="108" width="58" height="5" rx="2.5" fill="#070B19" opacity=".75"/><path d="M112,212 V112 L190,184 L268,112 V212" fill="none" stroke="url(#${id})" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};
// تضاريس جبلية خلفية (من روح التصميم)
export const RIDGE = `<svg class="ridge" viewBox="0 0 800 120" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F59E0B" stop-opacity=".22"/><stop offset="1" stop-color="#070B19" stop-opacity="0"/></linearGradient></defs><path d="M0 120V82l70-30 50 18 80-52 60 34 46-22 70 44 64-40 90 56 60-26 70 20 60-38 80 46V120Z" fill="url(#rg)"/><path d="M0 82l70-30 50 18 80-52 60 34 46-22 70 44 64-40 90 56 60-26 70 20 60-38 80 46" fill="none" stroke="#F59E0B" stroke-opacity=".35" stroke-width="1.2"/></svg>`;

/* ---------- التنبيهات والنوافذ ---------- */
export function toast(msg, type = 'ok') {
  if (type === 'ok' && /^(تعذر|ما |اكتب|اختار)/.test(msg)) type = 'warn';
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3000);
}
export function modal(title, body, { wide = false } = {}) {
  const back = document.createElement('div');
  back.className = 'mback';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="mhead"><h3>${title}</h3><button class="iconbtn sm" data-x aria-label="إغلاق">${icon('x')}</button></div><div class="mbody">${body}</div></div>`;
  document.body.append(back);
  document.body.classList.add('noscroll');
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    back.classList.add('out');
    setTimeout(() => { back.remove(); if (!$('.mback')) document.body.classList.remove('noscroll'); }, 200);
  };
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-x]')) close(); });
  document.addEventListener('keydown', onKey);
  return { el: back.querySelector('.modal'), close };
}
export function confirmBox(text, { ok = 'تأكيد', danger = false, title = 'تأكيد' } = {}) {
  return new Promise(res => {
    const m = modal(title, `<p class="muted" style="margin-bottom:18px">${text}</p><div class="mfoot"><button class="btn ${danger ? 'red' : 'amber'}" data-yes>${ok}</button><button class="btn ghost" data-no>إلغاء</button></div>`);
    $('[data-yes]', m.el).onclick = () => { m.close(); res(true); };
    $('[data-no]', m.el).onclick = () => { m.close(); res(false); };
  });
}
export async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true; btn.classList.add('loading');
  try { return await fn(); }
  catch (e) { console.error(e); toast(errText(e), 'bad'); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}
export function errText(e) {
  const c = e?.code || '';
  const map = {
    'permission-denied': 'ما عندكش صلاحية لهذي العملية. تأكد إن اشتراكك مفعّل.',
    'unavailable': 'تعذر الاتصال بالسيرفر. تحقق من الإنترنت.',
    'auth/invalid-credential': 'الإيميل أو كلمة المرور غلط.',
    'auth/wrong-password': 'كلمة المرور غلط.',
    'auth/user-not-found': 'ما فيش حساب بهذا الإيميل.',
    'auth/email-already-in-use': 'الإيميل هذا مسجّل من قبل.',
    'auth/weak-password': 'كلمة المرور ضعيفة، خليها 6 أحرف على الأقل.',
    'auth/invalid-email': 'صيغة الإيميل غير صحيحة.',
    'auth/too-many-requests': 'محاولات كثيرة، استنى شوية وجرّب.',
    'auth/network-request-failed': 'تعذر الاتصال. تحقق من الإنترنت.'
  };
  return map[c] || e?.message || 'صار خطأ غير متوقع.';
}
export const skeleton = (n = 4) => `<div class="skel" aria-hidden="true">${'<i></i>'.repeat(n)}</div>`;
export const empty = (ic, text, btn = '') => `<div class="empty">${icon(ic)}<p>${text}</p>${btn}</div>`;

/* ---------- حارس الدخول ---------- */
export function requireUser() {
  return new Promise(resolve => {
    let done = false;
    onAuthStateChanged(auth, async u => {
      if (done) return;
      if (!u) { location.replace('index.html'); return; }
      done = true;
      try {
        const data = await ensureUserDoc(u);
        resolve({ user: u, profile: { id: u.uid, ...data } });
      } catch (e) {
        document.body.innerHTML = `<div class="empty" style="padding-top:20vh">${icon('globe')}<p>${errText(e)}</p><button class="btn amber" onclick="location.reload()">إعادة المحاولة</button></div>`;
      }
    });
  });
}

// لو التسجيل انقطع في النص (الحساب موجود بدون بيانات) نكمّله هنا
export async function ensureUserDoc(u, extra = {}) {
  const ref = doc(db, 'users', u.uid);
  const s = await getDoc(ref);
  if (s.exists()) return s.data();
  const data = {
    email: u.email, displayName: (extra.displayName || u.displayName || u.email.split('@')[0]).slice(0, 80),
    phone: (extra.phone || '').slice(0, 30), role: 'merchant', isActive: false, plan: null, planExpiresAt: null,
    currency: '$', createdAt: serverTimestamp()
  };
  await setDoc(ref, data);
  return data;
}

/* ---------- الصور ---------- */
// نقبل بس صور data:image حتى ما يتحقنش رابط غريب
export const safeImg = v => (typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) ? v : '';
// ضغط الصورة في المتصفح وتحويلها لـ data URL صغير (يتخزن في Firestore بدون Storage)
export function compressImage(file, max = 240, maxBytes = 300000) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error('اختار ملف صورة.'));
    const r = new FileReader();
    r.onerror = () => rej(new Error('تعذر قراءة الصورة.'));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('صيغة الصورة غير مدعومة.'));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let out = c.toDataURL('image/webp', 0.85);
        if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
        if (out.length > maxBytes) { out = c.toDataURL('image/jpeg', 0.75); if (out.length > maxBytes) return rej(new Error('الصورة كبيرة، جرّب صورة أبسط.')); }
        res(out);
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

/* ---------- روابط البنرات ---------- */
// يبني رابط آمن (http/https أو واتساب فقط) حسب النوع
export function bannerHref(type, value) {
  const v = String(value || '').trim();
  if (!v || type === 'none') return '';
  const safe = (u, hosts) => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return ''; if (hosts && !hosts.some(h => x.hostname === h || x.hostname.endsWith('.' + h))) return ''; return x.href; } catch { return ''; } };
  if (type === 'whatsapp') return normPhone(v) ? `https://wa.me/${normPhone(v)}` : '';
  if (type === 'tiktok') return /^https?:/i.test(v) ? safe(v, ['tiktok.com']) : safe(`https://www.tiktok.com/@${v.replace(/^@/, '').replace(/[^\w.]/g, '')}`);
  if (type === 'facebook') return /^https?:/i.test(v) ? safe(v, ['facebook.com', 'fb.com', 'fb.me']) : safe(`https://www.facebook.com/${v.replace(/^@/, '').replace(/[^\w.\-]/g, '')}`);
  return safe(/^https?:/i.test(v) ? v : 'https://' + v);
}

/* ---------- اللغة والمظهر ---------- */
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON = '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>';
const themeIcon = () => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${getTheme() === 'light' ? MOON : SUN}</svg>`;
export const prefsHTML = () => `<div class="prefs"><button class="iconbtn txt" type="button" data-pref="lang" aria-label="تغيير اللغة">${isEN ? 'ع' : 'EN'}</button><button class="iconbtn" type="button" data-pref="theme" aria-label="تغيير المظهر">${themeIcon()}</button></div>`;
export function bindPrefs(root = document) {
  $$('[data-pref="lang"]', root).forEach(b => b.onclick = () => setLang(isEN ? 'ar' : 'en'));
  $$('[data-pref="theme"]', root).forEach(b => b.onclick = () => { setTheme(getTheme() === 'light' ? 'dark' : 'light'); $$('[data-pref="theme"]').forEach(x => x.innerHTML = themeIcon()); });
}

/* ---------- الهيكل (Sidebar + Header) ---------- */
export function shell({ nav, name, sub, searchPh, bellHref = '#reminders', extra = '' }) {
  document.body.innerHTML = `
  <div class="shell">
    <aside class="side" id="side">
      <a class="brand" href="#home">${LOGO()}<span><b>ملفي</b><small>Malafy</small></span></a>
      <nav class="nav">${nav.map(n => `<a href="#${n.id}" data-r="${n.id}">${icon(n.icon)}<span>${n.label}</span><i class="nbadge" data-badge="${n.id}" hidden></i></a>`).join('')}</nav>
      ${extra}
      <div class="side-foot">
        <div class="me"><div class="avatar" id="meAv"></div><div><b id="meName"></b><small id="meSub"></small></div></div>
        <div class="side-prefs">${prefsHTML()}</div>
        <button class="btn ghost sm full" id="logout">${icon('logout')} تسجيل الخروج</button>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <main class="main">
      <header class="top">
        <button class="iconbtn menu" id="menuBtn" aria-label="القائمة">${icon('menu')}</button>
        <a class="topbrand" href="#home">${LOGO()}<b>ملفي</b></a>
        <div class="search" id="searchBox">${icon('search')}<input id="q" type="search" placeholder="${searchPh}" autocomplete="off" aria-label="بحث"><div class="sres" id="sres" hidden></div></div>
        <button class="iconbtn searchbtn" id="searchBtn" type="button" aria-label="بحث">${icon('search')}</button>
        <div class="bellwrap"><button class="iconbtn bell" id="bellBtn" type="button" aria-label="التنبيهات" aria-expanded="false">${icon('bell')}<i class="dotc" id="bellc" hidden></i></button>
          <div class="belldd" id="bellDD" hidden><div class="belllist" id="bellList"></div><a class="link belldd-all" href="${bellHref}">عرض الكل</a></div></div>
        ${prefsHTML()}
      </header>
      <section id="view"></section>
    </main>
  </div>`;
  const side = $('#side'), scrim = $('#scrim');
  const toggle = on => { side.classList.toggle('open', on); scrim.classList.toggle('on', on); };
  $('#menuBtn').onclick = () => toggle(true);
  scrim.onclick = () => toggle(false);
  $$('.nav a').forEach(a => a.addEventListener('click', () => toggle(false)));
  $('#logout').onclick = async () => { await signOut(auth); location.replace('index.html'); };
  // البحث: أيقونة تفتح الخانة
  const top = $('.top');
  const openSearch = on => { top.classList.toggle('searching', on); if (on) setTimeout(() => $('#q').focus(), 30); };
  $('#searchBtn').onclick = () => openSearch(!top.classList.contains('searching'));
  $('#q').addEventListener('keydown', e => { if (e.key === 'Escape') openSearch(false); });
  $('#q').addEventListener('blur', () => setTimeout(() => { if (!$('#q').value) openSearch(false); }, 200));
  // قائمة الجرس
  const dd = $('#bellDD'), bb = $('#bellBtn');
  const showDD = on => { dd.hidden = !on; bb.setAttribute('aria-expanded', on); };
  bb.onclick = e => { e.stopPropagation(); showDD(dd.hidden); };
  document.addEventListener('click', e => { if (!e.target.closest('.bellwrap')) showDD(false); });
  dd.addEventListener('click', e => { if (e.target.closest('a,button')) showDD(false); });
  bindPrefs();
  startI18n();
  const api = {
    view: $('#view'),
    setMe(n, s) { $('#meName').textContent = n || ''; $('#meSub').textContent = s || ''; $('#meAv').textContent = (n || '؟').trim().charAt(0); },
    setActive(id) { $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === id)); },
    setBadge(id, n) { const b = $(`[data-badge="${id}"]`); if (b) { b.hidden = !n; b.textContent = n; } },
    setBell(n, html) { const b = $('#bellc'); b.hidden = !n; b.textContent = n; if (html != null) $('#bellList').innerHTML = html; }
  };
  api.setMe(name, sub);
  return api;
}

// مشغّل الصفحات: يعيد الرسم مع حركة الظهور عند تغيير الصفحة فقط
export function animate(view) {
  view.classList.remove('anim'); void view.offsetWidth; view.classList.add('anim');
  $$('.rv', view).forEach((el, i) => el.style.setProperty('--i', i));
}
