// ملفي — سيرفر المتاجر والطلبات (Cloudflare Worker)
// المطلوب: Secret اسمه FIREBASE_SA فيه ملف مفتاح Firebase (JSON) كامل.
// اختياري: ROOT_DOMAIN (الافتراضي malafy.net) و SITE_ORIGIN (الافتراضي https://malafy.net).

const DAY = 864e5;
const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'email', 'smtp', 'ftp', 'cdn', 'static', 'assets', 'img', 'images', 'store', 'stores', 'shop', 'help', 'support', 'status', 'blog', 'docs', 'dev', 'test', 'staging', 'beta', 'malafy', 'malafi', 'ns1', 'ns2', 'root', 'billing', 'pay', 'payment', 'payments', 'secure', 'login', 'account', 'accounts', 'dashboard', 'panel'];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const DEFAULT_FEES = [{ upTo: 50, rate: 5 }, { upTo: 100, rate: 4 }, { upTo: 200, rate: 3 }, { upTo: 0, rate: 2 }];
const OPEN = ['awaiting', 'preparing', 'delivered', 'problem'];
const CUR_SYM = { LYD: 'د.ل', SAR: 'ر.س', USDT: 'USDT' };
const ASSETS = { '/store.js': 'text/javascript; charset=utf-8', '/store.css': 'text/css; charset=utf-8', '/store-theme.js': 'text/javascript; charset=utf-8' };
const STORE_FIELDS = ['ownerId', 'slug', 'name', 'country', 'currency', 'status', 'suspended', 'design', 'sections', 'info', 'categories', 'logoV', 'coverV', 'launchedAt', 'updatedAt', 'payMethods'];
const ITEM_FIELDS = ['type', 'name', 'desc', 'cat', 'active', 'featured', 'order', 'imgV', 'note', 'productIds', 'durations', 'productId', 'price', 'maxQty', 'mode', 'prices', 'packs', 'fields', 'stock', 'maxMonths', 'countries', 'numbers', 'updatedAt', 'warranty'];
const USER_FIELDS = ['isActive', 'planExpiresAt', 'plan', 'status', 'storeAccess', 'role', 'displayName'];

class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; } }
class TxAbort extends Error { }
class IndexNeeded extends Error { }

/* ===================== أدوات عامة ===================== */
const round2 = n => Math.round((+n || 0) * 100) / 100;
const ceil2 = n => Math.ceil((+n || 0) * 100 - 1e-9) / 100;
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const int = v => { const n = Math.floor(num(v)); return Number.isFinite(n) ? n : 0; };
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '').trim().slice(0, max);
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const monthKey = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const addMonths = (ms, m) => { const d = new Date(ms); const day = d.getUTCDate(); d.setUTCMonth(d.getUTCMonth() + m); if (d.getUTCDate() < day) d.setUTCDate(0); return d.getTime(); };
const fmtDate = ms => { const d = new Date(ms + 2 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS_AR[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const monthsTxt = m => m === 1 ? 'شهر' : m === 2 ? 'شهرين' : m <= 10 ? `${m} أشهر` : `${m} شهر`;
const fmtMoney = (n, cur) => `${round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${CUR_SYM[cur] || cur}`;

function normPhone(p, country) {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (country === 'SA') {
    if (d.startsWith('05') && d.length === 10) d = '966' + d.slice(1);
    else if (d.startsWith('5') && d.length === 9) d = '966' + d;
  } else {
    if (d.startsWith('09') && d.length === 10) d = '218' + d.slice(1);
    else if (d.startsWith('9') && d.length === 9) d = '218' + d;
  }
  return d;
}
function maskNumber(n) {
  const s = String(n || ''); const total = (s.match(/\d/g) || []).length; let i = 0;
  return s.replace(/\d/g, c => { const k = i++; return k < 3 || k >= total - 2 ? c : '•'; });
}
const b64url = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64urlStr = s => b64url(new TextEncoder().encode(s));
const fromB64url = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
function randomStr(n, alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789') {
  const out = []; const buf = new Uint8Array(n * 2); crypto.getRandomValues(buf);
  for (let i = 0; out.length < n; i++) { if (i >= buf.length) { crypto.getRandomValues(buf); i = 0; } const v = buf[i]; if (v < 256 - (256 % alpha.length)) out.push(alpha[v % alpha.length]); }
  return out.join('');
}
async function sha256hex(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function safeEq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const IMG_RE = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;
function dataUrlBytes(v) {
  const m = typeof v === 'string' && v.length < 1_400_000 ? IMG_RE.exec(v) : null; if (!m) return null;
  const bin = atob(m[2]); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { type: 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]), bytes: out };
}
function safeUrl(v, hosts) {
  try { const u = new URL(String(v || '').trim()); if (!/^https?:$/.test(u.protocol)) return ''; if (hosts && !hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) return ''; return u.href; } catch { return ''; }
}
function feeRate(sub, tiers) {
  const list = (Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_FEES)
    .map(t => ({ upTo: Math.max(0, num(t?.upTo)), rate: Math.min(30, Math.max(0, num(t?.rate))) }))
    .sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity));
  for (const t of list) if (!t.upTo || sub < t.upTo) return t.rate;
  return list.length ? list[list.length - 1].rate : 0;
}
function nextSettle(launchedAt, now = Date.now()) {
  const base = num(launchedAt) || now; if (base > now) return base + 7 * DAY;
  return base + (Math.floor((now - base) / (7 * DAY)) + 1) * 7 * DAY;
}
function accCost(p, start, end) {
  const total = Math.max(DAY, num(p.accountEnd) - num(p.accountStart));
  const used = Math.max(0, Math.min(end, num(p.accountEnd)) - Math.max(start, num(p.accountStart)));
  return round2((num(p.purchasePrice) / (num(p.totalFiles) || 1)) * (used / total));
}

/* ===================== Firestore REST ===================== */
const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('bad number');
    return Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  throw new Error('bad value');
}
function encFields(o) { const f = {}; for (const k of Object.keys(o)) if (o[k] !== undefined) f[k] = enc(o[k]); return f; }
function dec(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  if ('bytesValue' in v) return v.bytesValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
}
function decFields(f) { const o = {}; for (const k of Object.keys(f || {})) o[k] = dec(f[k]); return o; }
const OPS = { '==': 'EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL', in: 'IN', '!=': 'NOT_EQUAL' };

let TOKEN = null, TOKEN_EXP = 0;
class FS {
  constructor(env) {
    let sa;
    try { sa = typeof env.FIREBASE_SA === 'string' ? JSON.parse(env.FIREBASE_SA) : env.FIREBASE_SA; } catch { sa = null; }
    if (!sa?.project_id || !sa.private_key || !sa.client_email) throw new HttpError(500, 'إعداد السيرفر ناقص (FIREBASE_SA).');
    this.sa = sa; this.pid = sa.project_id;
    this.root = `projects/${this.pid}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
    this.calls = 0;
  }
  name(path) { return `${this.root}/${path}`; }
  async token() {
    if (TOKEN && Date.now() < TOKEN_EXP - 120e3) return TOKEN;
    const now = Math.floor(Date.now() / 1000);
    const head = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = b64urlStr(JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const pem = this.sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const key = await crypto.subtle.importKey('pkcs8', fromB64url(pem.replace(/\+/g, '-').replace(/\//g, '_')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
    this.calls++;
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${body}.${b64url(sig)}` });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new HttpError(500, 'تعذر الاتصال بقاعدة البيانات (المفتاح).');
    TOKEN = j.access_token; TOKEN_EXP = Date.now() + (j.expires_in || 3600) * 1000;
    return TOKEN;
  }
  async call(method, url, body, { allow404 = false } = {}) {
    const tok = await this.token();
    this.calls++;
    const r = await fetch(url, { method, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404 && allow404) return null;
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : {}; } catch { j = null; }
    if (!r.ok) {
      const st = j?.error?.status || '';
      if (st === 'ABORTED' || (r.status === 409 && st !== 'ALREADY_EXISTS')) throw new TxAbort(st);
      if (st === 'ALREADY_EXISTS') throw new TxAbort('exists');
      if (st === 'FAILED_PRECONDITION' && /index/i.test(j?.error?.message || '')) throw new IndexNeeded(j.error.message);
      if (st === 'NOT_FOUND' || (st === 'FAILED_PRECONDITION' && /not found|no entity/i.test(j?.error?.message || ''))) throw new HttpError(409, 'البيانات تغيّرت، جرّب مرة ثانية.');
      console.log('firestore error', r.status, txt.slice(0, 400));
      throw new HttpError(502, 'تعذر الوصول لقاعدة البيانات، جرّب بعد شوية.');
    }
    return j;
  }
  maskQs(mask) { return mask ? mask.map(f => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&') : ''; }
  async get(path, { tx, mask } = {}) {
    const qs = [this.maskQs(mask), tx ? `transaction=${encodeURIComponent(tx)}` : ''].filter(Boolean).join('&');
    const j = await this.call('GET', `${this.base}/${path}${qs ? '?' + qs : ''}`, null, { allow404: true });
    if (!j) return null;
    return { id: path.split('/').pop(), ...decFields(j.fields || {}) };
  }
  async getMany(paths, { tx, mask } = {}) {
    if (!paths.length) return [];
    const body = { documents: paths.map(p => this.name(p)) };
    if (mask) body.mask = { fieldPaths: mask };
    if (tx) body.transaction = tx;
    const res = await this.call('POST', `${this.base}:batchGet`, body);
    const map = new Map();
    for (const x of res || []) {
      if (x.found) map.set(x.found.name, { id: x.found.name.split('/').pop(), ...decFields(x.found.fields || {}) });
    }
    return paths.map(p => map.get(this.name(p)) || null);
  }
  async query(coll, filters = [], opts = {}) {
    try { return await this.rawQuery(coll, filters, opts); }
    catch (e) {
      // لو Firestore طلب فهرس مركّب: نفلتر بالشرط الأول بس ونكمل الباقي هنا
      if (!(e instanceof IndexNeeded) || filters.length < 2) throw e;
      const sel = opts.select ? [...new Set([...opts.select, ...filters.map(f => f[0])])] : undefined;
      const rows = await this.rawQuery(coll, [filters[0]], { ...opts, select: sel, limit: 500 });
      const ok = (v, op, w) => op === '==' ? v === w : op === 'in' ? w.includes(v) : op === '<=' ? v <= w : op === '<' ? v < w : op === '>=' ? v >= w : op === '>' ? v > w : op === '!=' ? v !== w : false;
      return rows.filter(r => filters.slice(1).every(([f, op, v]) => ok(r[f], op, v))).slice(0, opts.limit || 500);
    }
  }
  async rawQuery(coll, filters = [], { parent = '', limit, tx, select, orderBy } = {}) {
    const fl = filters.map(([field, op, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: enc(value) } }));
    const sq = { from: [{ collectionId: coll }] };
    if (fl.length === 1) sq.where = fl[0]; else if (fl.length > 1) sq.where = { compositeFilter: { op: 'AND', filters: fl } };
    if (limit) sq.limit = limit;
    if (select) sq.select = { fields: select.map(f => ({ fieldPath: f })) };
    if (orderBy) sq.orderBy = orderBy.map(([f, d]) => ({ field: { fieldPath: f }, direction: d === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
    const body = { structuredQuery: sq };
    if (tx) body.transaction = tx;
    const res = await this.call('POST', `${this.base}${parent ? '/' + parent : ''}:runQuery`, body);
    return (res || []).filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), ...decFields(x.document.fields || {}) }));
  }
  async commit(writes, tx) {
    if (!writes.length && !tx) return;
    const body = { writes }; if (tx) body.transaction = tx;
    await this.call('POST', `${this.base}:commit`, body);
  }
  async rollback(tx) { try { await this.call('POST', `${this.base}:rollback`, { transaction: tx }); } catch { } }
  async tx(fn, tries = 5) {
    for (let i = 0; i < tries; i++) {
      const b = await this.call('POST', `${this.base}:beginTransaction`, {});
      const t = b.transaction; const writes = [];
      try {
        const out = await fn(t, writes);
        await this.commit(writes, t);
        return out;
      } catch (e) {
        if (e instanceof TxAbort) { if (i < tries - 1) { await new Promise(r => setTimeout(r, 60 * (i + 1) + Math.random() * 120)); continue; } throw new HttpError(409, 'ضغط على الطلبات حالياً، جرّب مرة ثانية.'); }
        await this.rollback(t);
        throw e;
      }
    }
  }
  // بناء عمليات الكتابة
  wSet(path, data) { return { update: { name: this.name(path), fields: encFields(data) } }; }
  wCreate(path, data) { return { update: { name: this.name(path), fields: encFields(data) }, currentDocument: { exists: false } }; }
  wUpdate(path, data) {
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    keys.forEach(k => { if (!FIELD_RE.test(k)) throw new Error('bad field ' + k); });
    return { update: { name: this.name(path), fields: encFields(data) }, updateMask: { fieldPaths: keys }, currentDocument: { exists: true } };
  }
  wDelete(path) { return { delete: this.name(path) }; }
}

/* ===================== تحقق هوية المستخدم (Firebase ID token) ===================== */
let JWKS = null, JWKS_AT = 0;
async function jwks(force) {
  if (JWKS && !force && Date.now() - JWKS_AT < 3600e3) return JWKS;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const j = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(j?.keys)) throw new HttpError(503, 'تعذر التحقق من الدخول، جرّب بعد شوية.');
  JWKS = j.keys; JWKS_AT = Date.now();
  return JWKS;
}
async function verifyIdToken(token, pid) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'سجّل الدخول من جديد.');
  let head, pay;
  try { head = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))); pay = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))); } catch { throw new HttpError(401, 'سجّل الدخول من جديد.'); }
  if (head.alg !== 'RS256' || !head.kid) throw new HttpError(401, 'سجّل الدخول من جديد.');
  let keys = await jwks(); let jwk = keys.find(k => k.kid === head.kid);
  if (!jwk) { keys = await jwks(true); jwk = keys.find(k => k.kid === head.kid); }
  if (!jwk) throw new HttpError(401, 'سجّل الدخول من جديد.');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || pay.aud !== pid || pay.iss !== `https://securetoken.google.com/${pid}` || !pay.sub || typeof pay.sub !== 'string' || pay.exp < now || pay.iat > now + 300 || (pay.auth_time && pay.auth_time > now + 300)) throw new HttpError(401, 'سجّل الدخول من جديد.');
  return { uid: pay.sub, email: pay.email || '', verified: pay.email_verified === true };
}

/* ===================== كاش بسيط في الذاكرة ===================== */
const MEM = new Map();
async function memo(key, ttl, fn) {
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v;
  const v = await fn();
  MEM.set(key, { v, at: Date.now() });
  if (MEM.size > 300) MEM.delete(MEM.keys().next().value);
  return v;
}
const forget = prefix => { for (const k of [...MEM.keys()]) if (k.startsWith(prefix)) MEM.delete(k); };

/* ===================== المتجر: الصلاحية والكتالوج ===================== */
async function platformOf(fs) { return memo('platform', 60e3, async () => (await fs.get('settings/platform')) || {}); }
async function planOf(fs, id) { if (!id || !ID_RE.test(id)) return null; return memo('plan:' + id, 60e3, () => fs.get(`plans/${id}`, { mask: ['storeEnabled', 'active'] })); }
async function merchantAllowed(fs, user, platform) {
  if (!user || user.status === 'deleted' || user.isActive !== true) return false;
  if (!(num(user.planExpiresAt) > Date.now())) return false;
  if (user.storeAccess === true) return true;
  if (user.plan?.trial) return platform.trialStore === true;
  const plan = await planOf(fs, user.plan?.id);
  return plan?.storeEnabled === true;
}
async function storeCtx(fs, slug) {
  return memo('ctx:' + slug, 15e3, async () => {
    const sl = await fs.get(`slugs/${slug}`);
    if (!sl?.storeId || !ID_RE.test(sl.storeId)) return null;
    const sid = sl.storeId;
    const [store, user, platform] = await Promise.all([
      fs.get(`stores/${sid}`, { mask: STORE_FIELDS }),
      fs.get(`users/${sid}`, { mask: USER_FIELDS }),
      platformOf(fs)
    ]);
    if (!store || store.slug !== slug) return null;
    const allowed = await merchantAllowed(fs, user, platform);
    const open = allowed && store.status === 'active' && store.suspended !== true;
    return { sid, store, platform, open, closedWhy: !allowed ? 'plan' : store.suspended ? 'suspended' : store.status !== 'active' ? 'paused' : '' };
  });
}
async function methodsFor(fs, store, platform) {
  const all = await memo('methods', 60e3, () => fs.query('paymentMethods', []));
  const cur = store.currency;
  const rate = num(platform.usdtRate?.[cur]);
  const chosen = Array.isArray(store.payMethods) ? store.payMethods : null;
  return all.filter(m => m.active !== false && Array.isArray(m.useFor) && m.useFor.includes('store')
      && (!Array.isArray(m.storeCountries) || m.storeCountries.includes(store.country)) && (!chosen || chosen.includes(m.id)))
    .map(m => {
      const curs = Array.isArray(m.currencies) && m.currencies.length ? m.currencies : ['LYD', 'SAR', 'USDT'];
      const pay = curs.includes(cur) ? cur : curs.includes('USDT') && rate > 0 ? 'USDT' : '';
      if (!pay) return null;
      return {
        id: m.id, name: clean(m.name, 60), pay, rate: pay === 'USDT' ? rate : 1,
        img: typeof m.image === 'string' && IMG_RE.test(m.image) ? `/img/m/${m.id}?v=${m.image.length}` : '',
        fields: (Array.isArray(m.fields) ? m.fields : []).filter(f => f && f.label && f.value).slice(0, 12).map(f => ({ label: clean(f.label, 60), value: clean(f.value, 200) })),
        inputLabel: clean(m.inputLabel, 80) || 'رقم العملية', note: clean(m.note, 300),
        receipt: ['none', 'optional', 'required'].includes(m.receipt) ? m.receipt : 'none', order: num(m.order)
      };
    }).filter(Boolean).sort((a, b) => a.order - b.order);
}
function pubItem(it) {
  const o = { id: it.id, type: it.type, name: clean(it.name, 80), desc: clean(it.desc, 800), cat: clean(it.cat, 30), featured: it.featured === true, order: num(it.order), note: clean(it.note, 300), img: it.imgV ? `/img/i/${it.id}?v=${int(it.imgV)}` : '', wd: itemWarranty(it) };
  if (it.type === 'account') {
    o.durations = (Array.isArray(it.durations) ? it.durations : []).map(d => ({ m: int(d?.m), price: round2(d?.price) })).filter(d => d.m >= 1 && d.m <= 24 && d.price > 0).sort((a, b) => a.m - b.m).slice(0, 8);
    o.stock = Math.max(0, int(it.stock)); o.maxMonths = Math.max(0, int(it.maxMonths));
  } else if (it.type === 'code') {
    o.price = round2(it.price); o.stock = Math.max(0, int(it.stock)); o.maxQty = Math.min(10, Math.max(1, int(it.maxQty) || 10));
  } else if (it.type === 'number') {
    o.mode = it.mode === 'pick' ? 'pick' : 'country';
    const avail = new Map((Array.isArray(it.countries) ? it.countries : []).map(c => [clean(c?.country, 40), Math.max(0, int(c?.n))]));
    if (o.mode === 'country') {
      o.prices = (Array.isArray(it.prices) ? it.prices : []).map(p => ({ country: clean(p?.country, 40), price: round2(p?.price) })).filter(p => p.country && p.price > 0).map(p => ({ ...p, n: avail.get(p.country) || 0 })).slice(0, 40);
      o.stock = o.prices.reduce((a, p) => a + p.n, 0);
    } else {
      o.numbers = (Array.isArray(it.numbers) ? it.numbers : []).filter(n => n && ID_RE.test(String(n.id || '')) && num(n.price) > 0).slice(0, 80).map(n => ({ id: n.id, mask: clean(n.mask, 40), country: clean(n.country, 40), price: round2(n.price) }));
      o.stock = o.numbers.length;
    }
  } else if (it.type === 'manual') {
    o.packs = (Array.isArray(it.packs) ? it.packs : []).map(p => ({ label: clean(p?.label, 60), price: round2(p?.price) })).filter(p => p.label && p.price > 0).slice(0, 20);
    o.fields = (Array.isArray(it.fields) ? it.fields : []).map(f => ({ label: clean(f?.label, 40), req: f?.req !== false })).filter(f => f.label).slice(0, 4);
    o.stock = o.packs.length ? 999 : 0;
  } else return null;
  return o;
}
function pubStore(ctx) {
  const s = ctx.store, info = s.info || {}, d = s.design || {};
  const soc = info.socials || {};
  const socials = {
    instagram: safeUrl(soc.instagram, ['instagram.com']), tiktok: safeUrl(soc.tiktok, ['tiktok.com']), facebook: safeUrl(soc.facebook, ['facebook.com', 'fb.com', 'fb.me']),
    telegram: safeUrl(soc.telegram, ['t.me', 'telegram.me']), snapchat: safeUrl(soc.snapchat, ['snapchat.com']), x: safeUrl(soc.x, ['x.com', 'twitter.com'])
  };
  return {
    slug: s.slug, name: clean(s.name, 40), currency: s.currency, country: s.country, open: ctx.open, closedWhy: ctx.closedWhy,
    design: { template: clean(d.template, 20), palette: clean(d.palette, 20), color: /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : '', font: clean(d.font, 40), card: clean(d.card, 10), corner: clean(d.corner, 10), mode: d.mode === 'light' ? 'light' : 'dark' },
    sections: (Array.isArray(s.sections) ? s.sections : []).map(x => ({ id: clean(x?.id, 20), on: x?.on !== false })).slice(0, 12),
    categories: (Array.isArray(s.categories) ? s.categories : []).map(c => ({ id: clean(c?.id, 30), name: clean(c?.name, 30), icon: clean(c?.icon, 20) })).filter(c => c.id && c.name).slice(0, 12),
    info: {
      heroTitle: clean(info.heroTitle, 80), heroSub: clean(info.heroSub, 160), announce: clean(info.announce, 120), about: clean(info.about, 1200),
      whatsapp: normPhone(info.whatsapp, s.country), floatWa: info.floatWa !== false, policy: clean(info.policy, 2000), socials,
      faq: (Array.isArray(info.faq) ? info.faq : []).map(f => ({ q: clean(f?.q, 160), a: clean(f?.a, 800) })).filter(f => f.q && f.a).slice(0, 12)
    },
    logo: s.logoV ? `/img/logo?v=${int(s.logoV)}` : '', cover: s.coverV ? `/img/cover?v=${int(s.coverV)}` : ''
  };
}
async function catalog(fs, slug) {
  return memo('cat:' + slug, 20e3, async () => {
    const ctx = await storeCtx(fs, slug);
    if (!ctx) return null;
    const [items, methods] = await Promise.all([
      fs.query('items', [], { parent: `stores/${ctx.sid}`, select: ITEM_FIELDS }),
      methodsFor(fs, ctx.store, ctx.platform)
    ]);
    const cur = ctx.store.currency;
    return {
      store: pubStore(ctx),
      items: items.filter(i => i.active !== false).map(pubItem).filter(Boolean).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
      pay: { methods, fees: (ctx.platform.storeFees?.[cur] || DEFAULT_FEES).map(t => ({ upTo: num(t.upTo), rate: num(t.rate) })), completeHours: completeHours(ctx.platform), warrantyDays: warrantyDays(ctx.platform) }
    };
  });
}
// مدة الضمان: الفلوس تبقى معلّقة والزبون يقدر يبلّغ طول المدة هذي بعد التسليم
const warrantyDays = p => Math.min(30, Math.max(1, int(p?.warrantyDays) || 7));
const completeHours = p => warrantyDays(p) * 24;
// ضمان المنتج اللي يحطه التاجر بالأيام (0 = بدون ضمان، null = منتج قديم ما تحددلهش → ضمان ملفي الافتراضي)
const itemWarranty = it => { const v = it?.warranty; return v === undefined || v === null || v === '' ? null : Math.max(0, Math.min(365, int(v))); };
// ملفي تضمن (وتحجز الفلوس) أقل قيمة بين ضمان التاجر ومدة ضمان ملفي
const holdDaysOf = (o, p) => o?.holdDays != null ? Math.max(0, int(o.holdDays)) : warrantyDays(p);
const merchDaysOf = (o, p) => o?.wDays != null ? Math.max(0, int(o.wDays)) : warrantyDays(p);
const minPayout = (p, cur) => Math.max(0, round2(p?.minPayout?.[cur]));
const awaitHours = p => Math.min(168, Math.max(1, int(p?.awaitHours) || 24));
async function purgeStore(slug) { forget('cat:' + slug); forget('ctx:' + slug); }

/* ===================== الطلبات: إنشاء ===================== */
async function readJson(req, max) {
  const len = +req.headers.get('content-length') || 0;
  if (len > max) throw new HttpError(413, 'الطلب كبير. صغّر صورة الإيصال.');
  const txt = await req.text();
  if (txt.length > max) throw new HttpError(413, 'الطلب كبير. صغّر صورة الإيصال.');
  try { const j = JSON.parse(txt || '{}'); if (!j || typeof j !== 'object' || Array.isArray(j)) throw 0; return j; } catch { throw new HttpError(400, 'بيانات غير صحيحة.'); }
}
async function createOrder(req, env, fs, slug, ectx) {
  const body = await readJson(req, 1_300_000);
  const ctx = await storeCtx(fs, slug);
  if (!ctx) throw new HttpError(404, 'المتجر مش موجود.');
  if (!ctx.open) throw new HttpError(403, 'المتجر مغلق حالياً، جرّب بعدين.');
  const { sid, store, platform } = ctx;
  const name = clean(body.customer?.name, 60);
  const phone = clean(body.customer?.phone, 20);
  const wa = normPhone(phone, store.country);
  if (!name) throw new HttpError(400, 'اكتب اسمك.');
  if (wa.length < 9 || wa.length > 15) throw new HttpError(400, 'اكتب رقم واتساب صحيح.');
  const lines = Array.isArray(body.items) ? body.items.slice(0, 11) : [];
  if (!lines.length) throw new HttpError(400, 'السلة فاضية.');
  if (lines.length > 10) throw new HttpError(400, 'أقصى حد 10 منتجات في الطلب الواحد.');
  const methods = await methodsFor(fs, store, platform);
  const m = methods.find(x => x.id === body.methodId);
  if (!m) throw new HttpError(400, 'اختار طريقة الدفع.');
  const reference = clean(body.reference, 120);
  if (!reference) throw new HttpError(400, `اكتب ${m.inputLabel}.`);
  let receipt = '';
  if (m.receipt !== 'none' && body.receipt) {
    if (typeof body.receipt !== 'string' || body.receipt.length > 950_000 || !IMG_RE.test(body.receipt)) throw new HttpError(400, 'صورة الإيصال غير صالحة أو كبيرة.');
    receipt = body.receipt;
  }
  if (m.receipt === 'required' && !receipt) throw new HttpError(400, 'ارفع صورة الإيصال.');
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const ipHash = (await sha256hex(ip + '|' + sid)).slice(0, 20);
  const [byIp, byWa] = await Promise.all([
    fs.query('orders', [['storeId', '==', sid], ['status', '==', 'awaiting'], ['ipHash', '==', ipHash]], { limit: 4, select: ['status'] }),
    fs.query('orders', [['storeId', '==', sid], ['status', '==', 'awaiting'], ['custWa', '==', wa]], { limit: 4, select: ['status'] })
  ]);
  if (byIp.length >= 3 || byWa.length >= 3) throw new HttpError(429, 'عندك طلبات بانتظار تأكيد الدفع. استنى لين تتأكد وبعدين اطلب من جديد.');

  // نجمع السطور المتشابهة
  const merged = [];
  for (const l of lines) {
    const itemId = String(l?.itemId || '');
    if (!ID_RE.test(itemId)) throw new HttpError(400, 'منتج غير صحيح.');
    const opt = clean(l?.opt, 40), numberId = l?.numberId ? String(l.numberId) : '';
    if (numberId && !ID_RE.test(numberId)) throw new HttpError(400, 'رقم غير صحيح.');
    const input = Array.isArray(l?.input) ? l.input.slice(0, 4).map(v => clean(v, 100)) : [];
    const qty = Math.max(1, Math.min(10, int(l?.qty) || 1));
    const same = merged.find(x => x.itemId === itemId && x.opt === opt && x.numberId === numberId && JSON.stringify(x.input) === JSON.stringify(input));
    if (same) same.qty = Math.min(10, same.qty + qty); else merged.push({ itemId, opt, numberId, input, qty });
  }

  const cust = await customerOf(fs, req);
  const now = Date.now();
  const token = randomStr(28, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789');
  const tokenHash = await sha256hex(token);
  const result = await fs.tx(async (tx, W) => {
    const oid = 'M' + randomStr(9);
    const ids = [...new Set(merged.map(l => l.itemId))];
    const docs = await fs.getMany(ids.map(id => `stores/${sid}/items/${id}`), { tx, mask: ITEM_FIELDS });
    const items = Object.fromEntries(ids.map((id, i) => [id, docs[i] ? { ...docs[i], id } : null]));
    const taken = new Set(); const reserved = []; const outLines = []; const touch = {};
    const mark = (itemId, c, id, extra) => { taken.add(c + '/' + id); (touch[itemId] ||= { n: 0, nums: [], ctry: {} }).n++; if (extra?.num) touch[itemId].nums.push(extra.num); if (extra?.country) touch[itemId].ctry[extra.country] = (touch[itemId].ctry[extra.country] || 0) + 1; };
    for (const l of merged) {
      const it = items[l.itemId];
      if (!it || it.active === false) throw new HttpError(409, 'فيه منتج في السلة ما عادش متاح. حدّث الصفحة.', { code: 'stale' });
      const nm = clean(it.name, 80); let unit = 0, opt = '', extra = {};
      const lineIdx = outLines.length;
      if (it.type === 'code') {
        const maxQ = Math.min(10, Math.max(1, int(it.maxQty) || 10));
        if (l.qty > maxQ) throw new HttpError(400, `أقصى كمية من ${nm} هي ${maxQ}.`);
        unit = round2(it.price);
        if (!(unit > 0) || !ID_RE.test(String(it.productId || ''))) throw new HttpError(409, `${nm} غير متاح حالياً.`, { code: 'stale' });
        const avail = await fs.query('codes', [['productId', '==', it.productId], ['status', '==', 'available']], { parent: `merchants/${sid}`, limit: l.qty + taken.size, tx, select: ['status'] });
        const pick = avail.filter(d => !taken.has('codes/' + d.id)).slice(0, l.qty);
        if (pick.length < l.qty) throw new HttpError(409, pick.length ? `المتوفر من ${nm} هو ${pick.length} بس.` : `${nm} نفد من المخزون.`, { code: 'stock' });
        pick.forEach(d => { reserved.push({ c: 'codes', id: d.id, line: lineIdx }); mark(it.id, 'codes', d.id); });
        extra = { src: { productId: it.productId } };
      } else if (it.type === 'account') {
        const months = int(l.opt);
        const dur = (Array.isArray(it.durations) ? it.durations : []).find(d => int(d?.m) === months && num(d?.price) > 0);
        if (!dur || months < 1 || months > 24) throw new HttpError(409, `المدة المختارة لـ ${nm} ما عادتش متاحة.`, { code: 'stale' });
        if (l.qty > 5) throw new HttpError(400, `أقصى كمية من ${nm} هي 5.`);
        const pids = (Array.isArray(it.productIds) ? it.productIds : []).filter(p => ID_RE.test(String(p))).slice(0, 10);
        if (!pids.length) throw new HttpError(409, `${nm} غير متاح حالياً.`, { code: 'stale' });
        unit = round2(dur.price); opt = monthsTxt(months);
        const [files, prods] = await Promise.all([
          fs.query('files', [['productId', 'in', pids], ['status', '==', 'available']], { parent: `merchants/${sid}`, limit: 60, tx, select: ['productId', 'fileNumber', 'status'] }),
          fs.getMany(pids.map(p => `merchants/${sid}/products/${p}`), { tx, mask: ['accountEnd', 'type'] })
        ]);
        const endOf = Object.fromEntries(pids.map((p, i) => [p, prods[i]?.type === 'account' ? num(prods[i].accountEnd) : 0]));
        const need = addMonths(now, months) - DAY;
        const ok = files.filter(f => !taken.has('files/' + f.id) && endOf[f.productId] >= need).sort((a, b) => endOf[a.productId] - endOf[b.productId] || num(a.fileNumber) - num(b.fileNumber));
        if (ok.length < l.qty) throw new HttpError(409, ok.length ? `المتوفر من ${nm} لمدة ${monthsTxt(months)} هو ${ok.length} بس.` : `${nm} لمدة ${monthsTxt(months)} نفد من المخزون.`, { code: 'stock' });
        ok.slice(0, l.qty).forEach(f => { reserved.push({ c: 'files', id: f.id, line: lineIdx }); mark(it.id, 'files', f.id); });
        extra = { months, src: { productIds: pids } };
      } else if (it.type === 'number') {
        if (it.mode === 'pick') {
          if (!l.numberId) throw new HttpError(400, 'اختار الرقم.');
          if (taken.has('numbers/' + l.numberId)) throw new HttpError(400, 'الرقم مكرر في السلة.');
          const n = await fs.get(`merchants/${sid}/numbers/${l.numberId}`, { tx });
          const listed = (Array.isArray(it.numbers) ? it.numbers : []).some(x => x?.id === l.numberId);
          if (!n || n.status !== 'available' || !listed) throw new HttpError(409, 'الرقم اللي اخترته تباع. اختار رقم ثاني.', { code: 'stock' });
          unit = round2(n.sellPrice);
          if (!(unit > 0)) throw new HttpError(409, 'الرقم غير متاح حالياً.', { code: 'stale' });
          l.qty = 1; opt = maskNumber(n.number);
          reserved.push({ c: 'numbers', id: n.id, line: lineIdx }); mark(it.id, 'numbers', n.id, { num: n.id, country: clean(n.country, 40) });
          extra = { country: clean(n.country, 40), numberId: n.id, src: { country: clean(n.country, 40) } };
        } else {
          const country = l.opt;
          const pr = (Array.isArray(it.prices) ? it.prices : []).find(p => clean(p?.country, 40) === country && num(p?.price) > 0);
          if (!pr) throw new HttpError(409, 'الدولة المختارة ما عادتش متاحة.', { code: 'stale' });
          unit = round2(pr.price); opt = country;
          const avail = await fs.query('numbers', [['country', '==', country], ['status', '==', 'available']], { parent: `merchants/${sid}`, limit: l.qty + taken.size, tx, select: ['status'] });
          const pick = avail.filter(d => !taken.has('numbers/' + d.id)).slice(0, l.qty);
          if (pick.length < l.qty) throw new HttpError(409, pick.length ? `المتوفر من أرقام ${country} هو ${pick.length} بس.` : `أرقام ${country} نفدت.`, { code: 'stock' });
          pick.forEach(d => { reserved.push({ c: 'numbers', id: d.id, line: lineIdx }); mark(it.id, 'numbers', d.id, { num: d.id, country }); });
          extra = { country, src: { country } };
        }
      } else if (it.type === 'manual') {
        const packs = (Array.isArray(it.packs) ? it.packs : []).filter(p => p?.label && num(p?.price) > 0);
        const pk = packs[int(l.opt)];
        if (!pk || !/^\d+$/.test(l.opt)) throw new HttpError(409, `الباقة المختارة لـ ${nm} ما عادتش متاحة.`, { code: 'stale' });
        const fields = (Array.isArray(it.fields) ? it.fields : []).filter(f => f?.label).slice(0, 4);
        const input = fields.map((f, i) => ({ label: clean(f.label, 40), value: l.input[i] || '' }));
        const miss = input.find((x, i) => fields[i].req !== false && !x.value);
        if (miss) throw new HttpError(400, `اكتب ${miss.label} لـ ${nm}.`);
        unit = round2(pk.price); opt = clean(pk.label, 60);
        extra = { input: input.filter(x => x.value) };
      } else throw new HttpError(409, 'منتج غير متاح.', { code: 'stale' });
      const wd = itemWarranty(it) ?? warrantyDays(platform);
      outLines.push({ itemId: it.id, type: it.type, name: nm, opt, qty: l.qty, unit, total: round2(unit * l.qty), status: 'pending', wd, ...extra });
    }
    const subtotal = round2(outLines.reduce((a, x) => a + x.total, 0));
    if (!(subtotal > 0)) throw new HttpError(400, 'مبلغ الطلب غير صحيح.');
    const rate = feeRate(subtotal, platform.storeFees?.[store.currency]);
    const fee = round2(subtotal * rate / 100), total = round2(subtotal + fee);
    if (body.quote != null && Math.abs(num(body.quote) - total) > 0.009) throw new HttpError(409, 'تغيّرت الأسعار. راجع السلة قبل ما تأكد.', { code: 'quote', total });
    const payCurrency = m.pay, payAmount = m.pay === 'USDT' ? ceil2(total / m.rate) : total;
    const order = {
      storeId: sid, slug, storeName: clean(store.name, 40), currency: store.currency, country: store.country,
      items: outLines, reserved, subtotal, feeRate: rate, fee, total, payCurrency, payAmount,
      customer: { name, phone, wa }, custWa: wa,
      method: { id: m.id, name: m.name }, refLabel: m.inputLabel, reference, hasReceipt: !!receipt,
      status: 'awaiting', open: true, month: monthKey(now), createdAt: now, updatedAt: now,
      expireAt: now + awaitHours(platform) * 3600e3, autoAt: null,
      tokenHash, ipHash, log: [{ s: 'awaiting', at: now }],
      wDays: Math.max(...outLines.map(x => x.wd)), holdDays: Math.max(...outLines.map(x => Math.min(x.wd, warrantyDays(platform))))
    };
    if (cust) { order.customerKey = cust.key; order.customerEmail = cust.email; }
    for (const r of reserved) W.push(fs.wUpdate(`merchants/${sid}/${r.c}/${r.id}`, { status: 'reserved', reservedBy: oid, reservedAt: now }));
    for (const [itemId, t] of Object.entries(touch)) {
      const it = items[itemId]; const upd = { stock: Math.max(0, int(it.stock) - t.n) };
      if (it.type === 'number') {
        upd.numbers = (Array.isArray(it.numbers) ? it.numbers : []).filter(x => !t.nums.includes(x?.id));
        upd.countries = (Array.isArray(it.countries) ? it.countries : []).map(c => ({ country: c?.country, n: Math.max(0, int(c?.n) - (t.ctry[c?.country] || 0)) }));
      }
      W.push(fs.wUpdate(`stores/${sid}/items/${itemId}`, upd));
    }
    W.push(fs.wCreate(`orders/${oid}`, order));
    if (receipt) W.push(fs.wCreate(`orderReceipts/${oid}`, { storeId: sid, image: receipt, createdAt: now }));
    return { id: oid, total, payAmount, payCurrency };
  });
  await purgeStore(slug);
  later(ectx, pushTo(fs, env, { roles: ['admin', 'staff'] }, { title: 'طلب متجر جديد', body: `${clean(store.name, 40)}: ${fmtMoney(result.payAmount, result.payCurrency)} بانتظار تأكيد الدفع`, link: 'admin.html#sorders', tag: 'sorder' }));
  return json({ ok: true, id: result.id, token, total: result.total, payAmount: result.payAmount, payCurrency: result.payCurrency }, 201);
}

/* ===================== الطلبات: عرض الزبون ===================== */
async function orderForCustomer(req, fs, slug, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, 'الطلب مش موجود.');
  const tok = req.headers.get('x-order-token') || '';
  const o = await fs.get(`orders/${id}`);
  let ok = !!(o && tok && safeEq(await sha256hex(tok), o.tokenHash));
  if (o && !ok && o.customerKey) { const c = await customerOf(fs, req); ok = !!c && c.key === o.customerKey; }
  if (!ok) throw new HttpError(404, 'الطلب مش موجود أو الرابط ناقص.');
  // الطلب لازم يكون من نفس المتجر (حتى لو التاجر غيّر رابطه بعد الطلب)
  if (o.slug !== slug && (await storeCtx(fs, slug))?.sid !== o.storeId) throw new HttpError(404, 'الطلب مش موجود أو الرابط ناقص.');
  return o;
}
async function customerView(fs, o, slug) {
  const ctx = (slug && await storeCtx(fs, slug)) || await storeCtx(fs, o.slug);
  const p = ctx?.platform || await platformOf(fs);
  let lines = [];
  if (o.items.some(i => i.status === 'delivered')) {
    const sec = await fs.get(`orderSecrets/${o.id}`);
    lines = Array.isArray(sec?.lines) ? sec.lines : [];
  }
  const ch = holdDaysOf(o, p) * DAY, md = merchDaysOf(o, p), now = Date.now();
  const dl = num(o.deliveredAt);
  const canClaim = o.status === 'completed' && dl > 0 && md > 0 && now < dl + md * DAY && !o.claim?.open;
  return {
    id: o.id, status: o.status, createdAt: o.createdAt, paidAt: o.paidAt || 0, deliveredAt: o.deliveredAt || 0, completedAt: o.completedAt || 0,
    currency: o.currency, subtotal: o.subtotal, fee: o.fee, feeRate: o.feeRate, total: o.total, payCurrency: o.payCurrency, payAmount: o.payAmount,
    method: o.method?.name || '', reference: o.reference, customer: { name: o.customer?.name || '' },
    items: o.items.map((x, i) => ({ name: x.name, opt: x.opt, qty: x.qty, total: x.total, type: x.type, status: x.status, wd: x.wd ?? null, input: x.input || [], lines: (lines.find(l => l.line === i)?.items || []).map(y => ({ l: y.l, v: y.v })) })),
    note: o.status === 'rejected' || o.status === 'cancelled' ? (o.adminNote || '') : '',
    problem: o.problem ? { text: o.problem.text, reply: o.problem.reply || '', at: o.problem.at } : null,
    resolution: o.resolution ? { action: o.resolution.action, note: o.resolution.note || '' } : null,
    autoAt: o.status === 'delivered' ? (o.autoAt || (o.deliveredAt + ch)) : 0,
    warrantyDays: holdDaysOf(o, p), warrantyEnd: dl && ch ? dl + ch : 0, merchDays: md, merchEnd: dl && md ? dl + md * DAY : 0, received: !!o.received,
    claim: o.claim ? { text: o.claim.text, reply: o.claim.reply || '', open: !!o.claim.open, at: o.claim.at } : null,
    canReceive: (o.status === 'delivered' && !o.received) || o.status === 'problem' || !!o.claim?.open,
    canReport: o.status === 'preparing' || (o.status === 'delivered' && now < dl + ch) || canClaim,
    account: !!o.customerKey,
    store: { name: ctx?.store?.name || o.storeName, whatsapp: normPhone(ctx?.store?.info?.whatsapp, o.country) }
  };
}

/* ===================== حركات المحفظة ===================== */
function walletInit(sid, store, now) {
  return { storeId: sid, currency: store?.currency || 'LYD', pending: 0, available: 0, inPayout: 0, withdrawn: 0, earned: 0, launchedAt: num(store?.launchedAt) || now, nextSettle: nextSettle(num(store?.launchedAt) || now, now), updatedAt: now };
}
function ledger(fs, W, o, type, amount, note, now) {
  W.push(fs.wCreate(`ledger/${o.id}-${type}-${now.toString(36)}`, { storeId: o.storeId, orderId: o.id, type, amount: round2(amount), currency: o.currency, note: note || '', month: monthKey(now), at: now }));
}
// إكمال الطلب: الفلوس تنتقل من معلّق لقابل للسحب
async function completeOrder(fs, id, by, expectAuto) {
  return fs.tx(async (tx, W) => {
    const o = await fs.get(`orders/${id}`, { tx });
    if (!o) throw new HttpError(404, 'الطلب مش موجود.');
    if (!['delivered', 'problem'].includes(o.status)) { if (expectAuto) return null; throw new HttpError(409, 'الطلب ما ينفعش يتأكد في حالته الحالية.'); }
    if (expectAuto && (o.status !== 'delivered' || !(num(o.autoAt) <= Date.now()))) return null;
    const now = Date.now();
    const w = await fs.get(`wallets/${o.storeId}`, { tx });
    const wal = w || walletInit(o.storeId, { currency: o.currency }, now);
    const nw = { pending: round2(Math.max(0, num(wal.pending) - o.subtotal)), available: round2(num(wal.available) + o.subtotal), earned: round2(num(wal.earned) + o.subtotal), updatedAt: now };
    W.push(w ? fs.wUpdate(`wallets/${o.storeId}`, nw) : fs.wCreate(`wallets/${o.storeId}`, { ...wal, ...nw }));
    W.push(fs.wUpdate(`orders/${id}`, { status: 'completed', open: false, completedAt: now, completedBy: by, autoAt: null, updatedAt: now, log: [...(o.log || []), { s: 'completed', at: now, by }].slice(-30) }));
    ledger(fs, W, o, 'release', o.subtotal, by === 'auto' ? 'تأكيد تلقائي' : by === 'customer' ? 'الزبون أكد الاستلام' : 'قرار الإدارة', now);
    return true;
  });
}
// إرجاع المحجوز للمخزون (رفض الدفع أو انتهاء المهلة)
async function releaseOrder(fs, id, status, note, by, expectExpired) {
  return fs.tx(async (tx, W) => {
    const o = await fs.get(`orders/${id}`, { tx });
    if (!o) throw new HttpError(404, 'الطلب مش موجود.');
    if (o.status !== 'awaiting') { if (expectExpired) return null; throw new HttpError(409, 'الطلب مش بانتظار تأكيد الدفع.'); }
    if (expectExpired && !(num(o.expireAt) <= Date.now())) return null;
    const now = Date.now(), sid = o.storeId;
    const res = Array.isArray(o.reserved) ? o.reserved : [];
    const docs = await fs.getMany(res.map(r => `merchants/${sid}/${r.c}/${r.id}`), { tx });
    const itemIds = [...new Set(o.items.map(x => x.itemId))];
    const its = await fs.getMany(itemIds.map(i => `stores/${sid}/items/${i}`), { tx, mask: ['type', 'stock', 'numbers', 'countries', 'mode'] });
    const itemMap = Object.fromEntries(itemIds.map((i, k) => [i, its[k]]));
    const back = {};
    res.forEach((r, k) => {
      const d = docs[k];
      if (!d || d.status !== 'reserved' || d.reservedBy !== id) return;
      W.push(fs.wUpdate(`merchants/${sid}/${r.c}/${r.id}`, { status: 'available', reservedBy: null, reservedAt: null }));
      const line = o.items[r.line]; if (!line) return;
      const b = (back[line.itemId] ||= { n: 0, nums: [], ctry: {} }); b.n++;
      if (r.c === 'numbers') { b.nums.push({ id: d.id, mask: maskNumber(d.number), country: clean(d.country, 40), price: round2(d.sellPrice) }); b.ctry[clean(d.country, 40)] = (b.ctry[clean(d.country, 40)] || 0) + 1; }
    });
    for (const [itemId, b] of Object.entries(back)) {
      const it = itemMap[itemId]; if (!it) continue;
      const upd = { stock: int(it.stock) + b.n };
      if (it.type === 'number') {
        const have = new Set((it.numbers || []).map(x => x?.id));
        upd.numbers = [...(it.numbers || []), ...b.nums.filter(x => !have.has(x.id) && x.price > 0)].slice(0, 80);
        const cs = Array.isArray(it.countries) ? it.countries.map(c => ({ country: c?.country, n: int(c?.n) })) : [];
        Object.entries(b.ctry).forEach(([c, n]) => { const x = cs.find(y => y.country === c); if (x) x.n += n; else cs.push({ country: c, n }); });
        upd.countries = cs;
      }
      W.push(fs.wUpdate(`stores/${sid}/items/${itemId}`, upd));
    }
    W.push(fs.wUpdate(`orders/${id}`, { status, open: false, adminNote: clean(note, 300), expireAt: null, reviewedBy: by, updatedAt: now, log: [...(o.log || []), { s: status, at: now, by }].slice(-30) }));
    return o.slug;
  });
}

/* ===================== تأكيد الدفع والتسليم التلقائي ===================== */
async function confirmOrder(fs, id, by, env, ctx) {
  const out = await fs.tx(async (tx, W) => {
    const o = await fs.get(`orders/${id}`, { tx });
    if (!o) throw new HttpError(404, 'الطلب مش موجود.');
    if (o.status !== 'awaiting') throw new HttpError(409, 'الطلب هذا تأكد أو تقفل من قبل.');
    const now = Date.now(), sid = o.storeId;
    const res = Array.isArray(o.reserved) ? o.reserved : [];
    const [docs, store, w, cq] = await Promise.all([
      fs.getMany(res.map(r => `merchants/${sid}/${r.c}/${r.id}`), { tx }),
      fs.get(`stores/${sid}`, { tx, mask: ['launchedAt', 'currency', 'name'] }),
      fs.get(`wallets/${sid}`, { tx }),
      fs.query('customers', [['phone', '==', o.customer.phone]], { parent: `merchants/${sid}`, limit: 1, tx, select: ['name'] })
    ]);
    const custId = cq[0]?.id || 'st' + randomStr(12, 'abcdefghijkmnpqrstuvwxyz23456789');
    if (!cq[0]) W.push(fs.wCreate(`merchants/${sid}/customers/${custId}`, { name: o.customer.name, phone: o.customer.phone, notes: 'من المتجر', createdAt: now }));
    const cust = { customerId: custId, customerName: o.customer.name, customerPhone: o.customer.phone };
    // نجيب المنتجات (الحسابات وفئات الأكواد) لحساب التكلفة والبيانات
    const pids = new Set();
    docs.forEach(d => { if (d?.productId) pids.add(d.productId); });
    o.items.forEach(x => { (x.src?.productIds || []).forEach(p => pids.add(p)); if (x.src?.productId) pids.add(x.src.productId); });
    const plist = [...pids].filter(p => ID_RE.test(p));
    const pdocs = await fs.getMany(plist.map(p => `merchants/${sid}/products/${p}`), { tx });
    const prod = Object.fromEntries(plist.map((p, i) => [p, pdocs[i] ? { ...pdocs[i], id: p } : null]));
    const items = o.items.map(x => ({ ...x }));
    const secrets = [];
    const used = new Set(res.map(r => r.c + '/' + r.id));
    let failed = 0, pending = 0;
    for (let i = 0; i < items.length; i++) {
      const line = items[i];
      if (line.type === 'manual') { pending++; continue; }
      const refs = res.map((r, k) => ({ r, d: docs[k] })).filter(x => x.r.line === i);
      const got = [];
      for (const { r, d } of refs) {
        if (d && d.status === 'reserved' && d.reservedBy === id) { got.push({ c: r.c, d: { ...d, id: r.id } }); continue; }
        // المحجوز تغيّر: نجرب بديل متاح
        let alt = null;
        if (r.c === 'codes' && line.src?.productId) alt = (await fs.query('codes', [['productId', '==', line.src.productId], ['status', '==', 'available']], { parent: `merchants/${sid}`, limit: 5, tx })).find(x => !used.has('codes/' + x.id));
        else if (r.c === 'numbers' && line.src?.country && !line.numberId) alt = (await fs.query('numbers', [['country', '==', line.src.country], ['status', '==', 'available']], { parent: `merchants/${sid}`, limit: 5, tx })).find(x => !used.has('numbers/' + x.id));
        else if (r.c === 'files' && line.src?.productIds?.length) {
          const need = addMonths(now, line.months || 1) - DAY;
          alt = (await fs.query('files', [['productId', 'in', line.src.productIds.slice(0, 10)], ['status', '==', 'available']], { parent: `merchants/${sid}`, limit: 20, tx }))
            .find(x => !used.has('files/' + x.id) && prod[x.productId]?.type === 'account' && num(prod[x.productId].accountEnd) >= need);
        }
        if (alt) { used.add(r.c + '/' + alt.id); got.push({ c: r.c, d: alt }); }
      }
      if (got.length < line.qty) { line.status = 'failed'; failed++; continue; }
      const sec = [];
      for (const { c, d } of got) {
        const saleId = 'st' + randomStr(14, 'abcdefghijkmnpqrstuvwxyz23456789');
        const sale = { ...cust, price: line.unit, date: now, source: 'store', orderId: id };
        if (c === 'codes') {
          const p = prod[d.productId];
          W.push(fs.wUpdate(`merchants/${sid}/codes/${d.id}`, { status: 'sold', saleId, soldAt: now, customerName: cust.customerName, reservedBy: null, reservedAt: null }));
          const cost = round2(p?.purchasePrice);
          W.push(fs.wCreate(`merchants/${sid}/sales/${saleId}`, { ...sale, type: 'code', productId: d.productId || null, productName: p?.name || line.name, itemId: d.id, itemLabel: d.code, cost, profit: round2(line.unit - cost), status: 'done' }));
          sec.push({ l: line.qty > 1 ? `الكود ${sec.length + 1}` : 'الكود', v: String(d.code || '') });
        } else if (c === 'numbers') {
          W.push(fs.wUpdate(`merchants/${sid}/numbers/${d.id}`, { status: 'sold', saleId, soldAt: now, customerName: cust.customerName, customerPhone: cust.customerPhone, reservedBy: null, reservedAt: null }));
          const cost = round2(d.purchasePrice);
          W.push(fs.wCreate(`merchants/${sid}/sales/${saleId}`, { ...sale, type: 'number', productId: null, productName: `رقم ${d.country || ''}`.trim(), itemId: d.id, itemLabel: d.number, country: d.country || '', cost, profit: round2(line.unit - cost), status: 'done' }));
          sec.push({ l: line.qty > 1 ? `الرقم ${sec.length + 1}` : 'الرقم', v: String(d.number || '') });
        } else if (c === 'files') {
          const p = prod[d.productId];
          const end = Math.min(addMonths(now, line.months || 1), num(p?.accountEnd) || addMonths(now, line.months || 1));
          const cost = p ? accCost(p, now, end) : 0;
          W.push(fs.wUpdate(`merchants/${sid}/files/${d.id}`, { status: 'sold', ...cust, saleId, startDate: now, endDate: end, reservedBy: null, reservedAt: null }));
          W.push(fs.wCreate(`merchants/${sid}/sales/${saleId}`, { ...sale, type: 'account', productId: d.productId, productName: p?.name || line.name, itemId: d.id, itemLabel: `الملف #${d.fileNumber}`, cost, profit: round2(line.unit - cost), months: line.months || 1, startDate: now, endDate: end, status: 'active' }));
          const pre = got.length > 1 ? ` ${sec.length / 4 + 1}` : '';
          sec.push({ l: 'الإيميل' + pre, v: String(p?.email || '') }, { l: 'كلمة المرور' + pre, v: String(p?.password || '') }, { l: 'رقم الملف' + pre, v: `#${d.fileNumber}` }, { l: 'ينتهي في' + pre, v: fmtDate(end) });
        }
      }
      // لو حجزنا أكثر من المطلوب (ما يصيرش عادة) ما نلمسوش الباقي
      line.status = 'delivered'; line.deliveredAt = now;
      secrets.push({ line: i, items: sec });
    }
    // المحجوز اللي ما استعملناش (تغيّر وجبنا بديل) يتجاهل
    const allDone = items.every(x => x.status === 'delivered');
    const status = failed ? 'problem' : allDone ? 'delivered' : 'preparing';
    const p = await platformOf(fs);
    const upd = {
      status, open: true, items, paidAt: now, confirmedBy: by, custId, expireAt: null, updatedAt: now,
      deliveredAt: allDone ? now : null, autoAt: allDone ? now + holdDaysOf(o, p) * DAY : null,
      log: [...(o.log || []), { s: 'paid', at: now, by }, ...(status !== 'preparing' ? [{ s: status, at: now, by: 'system' }] : [])].slice(-30)
    };
    if (failed) upd.problem = { text: 'تعذر تسليم بعض المنتجات تلقائياً (المخزون تغيّر). المتجر يسلّمها يدوياً أو الإدارة ترجع المبلغ.', at: now, by: 'system' };
    W.push(fs.wUpdate(`orders/${id}`, upd));
    if (secrets.length) W.push(fs.wSet(`orderSecrets/${id}`, { storeId: sid, lines: secrets, updatedAt: now }));
    const wal = w || walletInit(sid, store || { currency: o.currency }, now);
    const nw = { pending: round2(num(wal.pending) + o.subtotal), updatedAt: now };
    W.push(w ? fs.wUpdate(`wallets/${sid}`, nw) : fs.wCreate(`wallets/${sid}`, { ...wal, ...nw }));
    ledger(fs, W, o, 'hold', o.subtotal, 'طلب مدفوع (معلّق لين الاستلام)', now);
    return { status, slug: o.slug, pending, failed, storeId: sid, sub: o.subtotal, cur: o.currency, oid: id, noHold: allDone && holdDaysOf(o, p) === 0 };
  });
  // منتجات بدون ضمان: الفلوس تصير قابلة للسحب فوراً
  if (out.noHold) { try { if (await completeOrder(fs, id, 'auto')) out.status = 'completed'; } catch (e) { console.log('nohold', id, e.message); } }
  await purgeStore(out.slug);
  if (env) later(ctx, pushTo(fs, env, { uids: [out.storeId] }, out.status === 'delivered'
    ? { title: 'بيعة جديدة في متجرك 🎉', body: `طلب #${out.oid} تسلّم للزبون تلقائياً · ${fmtMoney(out.sub, out.cur)}`, link: 'app.html#store/orders', tag: 'order' }
    : { title: out.failed ? 'طلب يحتاج انتباهك' : 'طلب جديد يحتاج تسليم', body: `طلب #${out.oid} · ${fmtMoney(out.sub, out.cur)}${out.failed ? ' · فيه منتجات ما تسلّمتش' : ''}`, link: 'app.html#store/orders', tag: 'order' }));
  const { storeId, sub, cur, oid, noHold, ...pub } = out;
  return pub;
}

/* ===================== التاجر: تسليم يدوي ورد على البلاغ ===================== */
async function merchantDeliver(fs, uid, id, body) {
  const idx = int(body.idx), text = clean(body.text, 1500);
  if (!text) throw new HttpError(400, 'اكتب رسالة التسليم (مثلاً: تم الشحن، أو الكود).');
  const r = await fs.tx(async (tx, W) => {
    const o = await fs.get(`orders/${id}`, { tx });
    if (!o || o.storeId !== uid) throw new HttpError(404, 'الطلب مش موجود.');
    if (!['preparing', 'problem', 'delivered'].includes(o.status)) throw new HttpError(409, 'الطلب لازم يكون مدفوع وما تقفلش.');
    const items = o.items.map(x => ({ ...x }));
    const line = items[idx];
    if (!line || !['pending', 'failed'].includes(line.status)) throw new HttpError(409, 'المنتج هذا تسلّم من قبل.');
    const now = Date.now();
    const sec = await fs.get(`orderSecrets/${id}`, { tx });
    const lines = Array.isArray(sec?.lines) ? sec.lines.filter(l => l.line !== idx) : [];
    lines.push({ line: idx, items: [{ l: 'رسالة المتجر', v: text }] });
    W.push(fs.wSet(`orderSecrets/${id}`, { storeId: o.storeId, lines, updatedAt: now }));
    line.status = 'delivered'; line.deliveredAt = now; line.manual = true;
    const saleId = 'st' + randomStr(14, 'abcdefghijkmnpqrstuvwxyz23456789');
    W.push(fs.wCreate(`merchants/${uid}/sales/${saleId}`, { type: 'manual', productId: null, productName: line.name, itemId: line.itemId, itemLabel: line.opt || '', customerId: o.custId || null, customerName: o.customer.name, customerPhone: o.customer.phone, price: line.total, cost: 0, profit: line.total, date: now, status: 'done', source: 'store', orderId: id }));
    const allDone = items.every(x => x.status === 'delivered');
    const upd = { items, updatedAt: now };
    if (allDone && o.status === 'preparing') {
      const p = await platformOf(fs);
      Object.assign(upd, { status: 'delivered', deliveredAt: now, autoAt: now + holdDaysOf(o, p) * DAY, log: [...(o.log || []), { s: 'delivered', at: now, by: uid }].slice(-30) });
      if (holdDaysOf(o, p) === 0) upd.noHold = true;
    }
    const noHold = upd.noHold; delete upd.noHold;
    W.push(fs.wUpdate(`orders/${id}`, upd));
    return { status: upd.status || o.status, noHold };
  });
  if (r.noHold && await completeOrder(fs, id, 'auto').catch(() => null)) r.status = 'completed';
  return { status: r.status };
}
async function merchantReply(fs, uid, id, body) {
  const text = clean(body.text, 800);
  if (!text) throw new HttpError(400, 'اكتب ردك.');
  return fs.tx(async (tx, W) => {
    const o = await fs.get(`orders/${id}`, { tx });
    if (!o || o.storeId !== uid) throw new HttpError(404, 'الطلب مش موجود.');
    if (o.claim?.open) { W.push(fs.wUpdate(`orders/${id}`, { claim: { ...o.claim, reply: text, replyAt: Date.now() }, updatedAt: Date.now() })); return { ok: true }; }
    if (o.status !== 'problem' || !o.problem) throw new HttpError(409, 'ما فيش بلاغ مفتوح على الطلب.');
    W.push(fs.wUpdate(`orders/${id}`, { problem: { ...o.problem, reply: text, replyAt: Date.now() }, updatedAt: Date.now() }));
    return { ok: true };
  });
}

/* ===================== الإدارة: حسم البلاغ والتسويات ===================== */
async function resolveOrder(fs, uid, id, body) {
  const action = body.action, note = clean(body.note, 300);
  if (action === 'release') {
    const o = await fs.get(`orders/${id}`, { mask: ['status'] });
    if (!o) throw new HttpError(404, 'الطلب مش موجود.');
    if (o.status === 'preparing' || o.status === 'delivered' || o.status === 'problem') {
      // نخلي الطلب "مستلم" حتى لو ما وصلش لمرحلة التسليم (قرار الإدارة)
      await fs.tx(async (tx, W) => {
        const x = await fs.get(`orders/${id}`, { tx });
        if (!['preparing', 'delivered', 'problem'].includes(x.status)) throw new HttpError(409, 'حالة الطلب تغيّرت.');
        W.push(fs.wUpdate(`orders/${id}`, { status: 'problem', resolution: { action, note, at: Date.now(), by: uid }, updatedAt: Date.now() }));
      });
      await completeOrder(fs, id, uid);
      return { ok: true };
    }
    throw new HttpError(409, 'الطلب ما ينفعش يتحسم في حالته الحالية.');
  }
  if (action !== 'refund') throw new HttpError(400, 'إجراء غير معروف.');
  return fs.tx(async (tx, W) => {
    const o = await fs.get(`orders/${id}`, { tx });
    if (!o) throw new HttpError(404, 'الطلب مش موجود.');
    if (!['preparing', 'delivered', 'problem'].includes(o.status)) throw new HttpError(409, 'الطلب ما ينفعش يترجع في حالته الحالية.');
    const now = Date.now();
    const w = await fs.get(`wallets/${o.storeId}`, { tx });
    if (w) W.push(fs.wUpdate(`wallets/${o.storeId}`, { pending: round2(Math.max(0, num(w.pending) - o.subtotal)), refunded: round2(num(w.refunded) + o.subtotal), updatedAt: now }));
    W.push(fs.wUpdate(`orders/${id}`, { status: 'refunded', open: false, autoAt: null, resolution: { action, note, at: now, by: uid }, updatedAt: now, log: [...(o.log || []), { s: 'refunded', at: now, by: uid }].slice(-30) }));
    ledger(fs, W, o, 'refund', -o.subtotal, note || 'إرجاع المبلغ للزبون', now);
    return { ok: true };
  });
}
async function settleWallet(fs, sid) {
  return fs.tx(async (tx, W) => {
    const w = await fs.get(`wallets/${sid}`, { tx });
    const now = Date.now();
    if (!w || !(num(w.nextSettle) <= now)) return null;
    const amount = round2(w.available);
    const upd = { nextSettle: nextSettle(w.launchedAt, now), updatedAt: now };
    if (amount > 0 && amount >= minPayout(await platformOf(fs), w.currency)) {
      const store = await fs.get(`stores/${sid}`, { tx, mask: ['name', 'slug'] });
      const pid = `${sid.slice(0, 12)}-${now.toString(36)}`;
      W.push(fs.wCreate(`payouts/${pid}`, { storeId: sid, storeName: clean(store?.name, 40), slug: store?.slug || '', currency: w.currency, amount, status: 'due', createdAt: now, month: monthKey(now), periodEnd: now }));
      W.push(fs.wCreate(`ledger/${pid}-payout`, { storeId: sid, payoutId: pid, type: 'payout', amount: -amount, currency: w.currency, note: 'تسوية أسبوعية (قيد التحويل)', month: monthKey(now), at: now }));
      Object.assign(upd, { available: 0, inPayout: round2(num(w.inPayout) + amount) });
    }
    W.push(fs.wUpdate(`wallets/${sid}`, upd));
    return amount;
  });
}
// التاجر يطلب سحب رصيده القابل للسحب (بدون ما يستنى التسوية الأسبوعية)
async function requestPayout(fs, uid, env, ctx) {
  const [priv, p] = await Promise.all([fs.get(`storePrivate/${uid}`), fs.get('settings/platform', { mask: ['minPayout'] })]);
  if (!priv?.payout?.details) throw new HttpError(400, 'حدد وين توصلك أرباحك من إعدادات المتجر أولاً.');
  const r = await fs.tx(async (tx, W) => {
    const w = await fs.get(`wallets/${uid}`, { tx });
    const amount = round2(w?.available);
    if (!(amount > 0)) throw new HttpError(409, 'ما عندكش رصيد قابل للسحب.');
    const min = minPayout(p, w.currency);
    if (amount < min) throw new HttpError(409, `أقل مبلغ للسحب ${fmtMoney(min, w.currency)}. رصيدك توا ${fmtMoney(amount, w.currency)}.`);
    const now = Date.now();
    const store = await fs.get(`stores/${uid}`, { tx, mask: ['name', 'slug'] });
    const pid = `${uid.slice(0, 12)}-${now.toString(36)}`;
    W.push(fs.wCreate(`payouts/${pid}`, { storeId: uid, storeName: clean(store?.name, 40), slug: store?.slug || '', currency: w.currency, amount, status: 'due', requested: true, createdAt: now, month: monthKey(now), periodEnd: now }));
    W.push(fs.wCreate(`ledger/${pid}-payout`, { storeId: uid, payoutId: pid, type: 'payout', amount: -amount, currency: w.currency, note: 'طلب سحب (قيد التحويل)', month: monthKey(now), at: now }));
    W.push(fs.wUpdate(`wallets/${uid}`, { available: 0, inPayout: round2(num(w.inPayout) + amount), updatedAt: now }));
    return { amount, cur: w.currency, name: clean(store?.name, 40) };
  });
  later(ctx, pushTo(fs, env, { roles: ['admin'] }, { title: 'طلب سحب أرباح 💸', body: `${r.name}: ${fmtMoney(r.amount, r.cur)}`, link: 'admin.html#payouts', tag: 'payout' }));
  return { ok: true, amount: r.amount };
}
async function payoutPaid(fs, uid, id, body, env, ctx) {
  const reference = clean(body.reference, 120);
  return fs.tx(async (tx, W) => {
    const p = await fs.get(`payouts/${id}`, { tx });
    if (!p) throw new HttpError(404, 'التسوية مش موجودة.');
    if (p.status !== 'due') throw new HttpError(409, 'التسوية هذي محوّلة من قبل.');
    const now = Date.now();
    const w = await fs.get(`wallets/${p.storeId}`, { tx });
    if (w) W.push(fs.wUpdate(`wallets/${p.storeId}`, { inPayout: round2(Math.max(0, num(w.inPayout) - p.amount)), withdrawn: round2(num(w.withdrawn) + p.amount), updatedAt: now }));
    W.push(fs.wUpdate(`payouts/${id}`, { status: 'paid', paidAt: now, paidBy: uid, reference }));
    W.push(fs.wCreate(`ledger/${id}-paid`, { storeId: p.storeId, payoutId: id, type: 'paid', amount: 0, currency: p.currency, note: `تم التحويل${reference ? ' · ' + reference : ''}`, month: monthKey(now), at: now }));
    return { ok: true, p };
  }).then(r => {
    if (env) later(ctx, pushTo(fs, env, { uids: [r.p.storeId] }, { title: 'وصلتك تسوية 💰', body: `تم تحويل ${fmtMoney(r.p.amount, r.p.currency)} لحسابك`, link: 'app.html#store/wallet', tag: 'payout' }));
    return { ok: true };
  });
}

/* ===================== المهام الدورية ===================== */
async function maintenance(env) {
  const fs = new FS(env); const now = Date.now(); const done = { completed: 0, expired: 0, settled: 0 };
  const budget = () => fs.calls < 40;
  try {
    const due = await fs.query('orders', [['autoAt', '<=', now]], { limit: 20, select: ['status'] });
    for (const o of due) { if (!budget()) break; try { if (await completeOrder(fs, o.id, 'auto', true)) done.completed++; } catch (e) { console.log('auto', o.id, e.message); } }
    if (budget()) {
      const exp = await fs.query('orders', [['expireAt', '<=', now]], { limit: 10, select: ['status', 'slug'] });
      for (const o of exp) { if (!budget()) break; try { const slug = await releaseOrder(fs, o.id, 'cancelled', 'انتهت مهلة الدفع.', 'auto', true); if (slug) { done.expired++; purgeStore(slug); } } catch (e) { console.log('exp', o.id, e.message); } }
    }
    if (budget()) {
      const ws = await fs.query('wallets', [['nextSettle', '<=', now]], { limit: 20, select: ['nextSettle'] });
      for (const w of ws) { if (!budget()) break; try { if ((await settleWallet(fs, w.id)) !== null) done.settled++; } catch (e) { console.log('settle', w.id, e.message); } }
    }
  } catch (e) { console.log('maintenance', e.message); }
  try { if (fs.calls < 30) done.daily = await dailyJobs(fs, env); } catch (e) { console.log('daily', e.message); }
  return done;
}

/* ===================== Google APIs عامة (FCM و Auth) ===================== */
async function gcall(fs, method, url, body) {
  const tok = await fs.token();
  fs.calls++;
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch { }
  return { ok: r.ok, status: r.status, j };
}

/* ===================== الإشعارات (Firebase Cloud Messaging) ===================== */
const PUSH_RE = /^[A-Za-z0-9:_\-]{20,4096}$/;
async function pushRegister(fs, uid, role, body) {
  const token = String(body.token || '');
  if (!PUSH_RE.test(token)) throw new HttpError(400, 'رمز الإشعارات غير صالح.');
  const id = (await sha256hex(token)).slice(0, 40);
  if (body.on === false) { await fs.commit([fs.wDelete(`pushTokens/${id}`)]); return { ok: true }; }
  await fs.commit([fs.wSet(`pushTokens/${id}`, { uid, role: role || 'merchant', token, ua: clean(body.ua, 160), at: Date.now() })]);
  return { ok: true };
}
async function pushTo(fs, env, { uids = [], roles = [] }, msg) {
  try {
    const lists = [];
    for (let i = 0; i < uids.length; i += 10) lists.push(fs.query('pushTokens', [['uid', 'in', uids.slice(i, i + 10)]], { limit: 50 }));
    if (roles.length) lists.push(fs.query('pushTokens', [['role', 'in', roles]], { limit: 50 }));
    const toks = new Map(); (await Promise.all(lists)).flat().forEach(t => toks.set(t.id, t));
    const link = `${siteOrigin(env)}/${msg.link || ''}`;
    let sent = 0;
    for (const t of [...toks.values()].slice(0, 25)) {
      if (fs.calls > 45) break;
      const r = await gcall(fs, 'POST', `https://fcm.googleapis.com/v1/projects/${fs.pid}/messages:send`, {
        message: {
          token: t.token, notification: { title: msg.title, body: msg.body },
          data: { link }, webpush: { fcm_options: { link }, notification: { icon: `${siteOrigin(env)}/icon-192.png`, badge: `${siteOrigin(env)}/icon-192.png`, dir: 'rtl', lang: 'ar', tag: msg.tag || 'malafy' } }
        }
      });
      if (r.ok) sent++;
      else if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/.test(JSON.stringify(r.j))) { try { await fs.commit([fs.wDelete(`pushTokens/${t.id}`)]); } catch { } }
      else console.log('fcm', r.status, JSON.stringify(r.j).slice(0, 200));
    }
    return sent;
  } catch (e) { console.log('push', e.message); return 0; }
}
const later = (ctx, p) => { if (ctx?.waitUntil) ctx.waitUntil(p); else return p; };

/* ===================== الإيميلات (Resend) ===================== */
function mailHTML({ title, intro, code, button, note }) {
  const e = escHtml;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title></head>
<body style="margin:0;padding:0;background:#EEF0F5;font-family:Tahoma,Arial,sans-serif;direction:rtl">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F5;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #E2E5EE">
<tr><td style="background:#070B19;padding:20px 26px;text-align:right"><img src="https://malafy.net/icon-192.png" width="40" height="40" alt="ملفي" style="display:inline-block;width:40px;height:40px;border-radius:11px;vertical-align:middle;border:0">
<span style="color:#ffffff;font-size:20px;font-weight:bold;vertical-align:middle;margin-right:8px">ملفي</span></td></tr>
<tr><td style="padding:30px 26px 10px;text-align:right">
<h1 style="margin:0 0 12px;font-size:21px;color:#141829">${e(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.9;color:#4A5270">${e(intro)}</p>
${code ? `<div style="margin:6px 0 22px;text-align:center"><div style="display:inline-block;direction:ltr;letter-spacing:10px;font-size:34px;font-weight:bold;color:#141829;background:#FFF7E6;border:2px dashed #F59E0B;border-radius:14px;padding:14px 22px 14px 32px;font-family:Consolas,Menlo,monospace">${e(code)}</div></div>` : ''}
${button ? `<div style="margin:6px 0 24px;text-align:center"><a href="${e(button.url)}" style="display:inline-block;background:#F59E0B;color:#1A1205;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 28px;border-radius:12px">${e(button.text)}</a></div>` : ''}
${note ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.8;color:#7A819C">${e(note)}</p>` : ''}
</td></tr>
<tr><td style="padding:18px 26px 24px;border-top:1px solid #EEF0F5;text-align:right;font-size:12px;line-height:1.8;color:#9AA0B8">هذي رسالة تلقائية من منصة ملفي، ما تردش عليها.<br>لو ما طلبتش هذا، تجاهل الرسالة وحسابك في أمان.</td></tr>
</table><p style="font-size:11px;color:#9AA0B8;margin:14px 0 0">malafy.net</p></td></tr></table></body></html>`;
}
async function sendMail(env, to, subject, html) {
  if (!env.RESEND_KEY) throw new HttpError(503, 'إرسال الإيميلات مش مفعّل بعد في السيرفر.');
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM || 'ملفي <noreply@malafy.net>', to: [to], subject, html }) });
  if (!r.ok) { console.log('resend', r.status, (await r.text()).slice(0, 300)); throw new HttpError(502, 'تعذر إرسال الإيميل، جرّب بعد شوية.'); }
  return true;
}

/* ===================== أكواد التحقق (6 أرقام) ===================== */
const code6 = () => { const b = new Uint32Array(1); let n; do { crypto.getRandomValues(b); n = b[0]; } while (n >= 4294000000); return String(n % 1000000).padStart(6, '0'); };
const codeHash = (fs, code, key) => sha256hex(`${code}|${key}|${fs.sa.private_key_id || fs.pid}`);
async function issueCode(fs, env, key, email, kind, extra = {}) {
  const now = Date.now();
  const d = await fs.get(`authCodes/${key}`);
  const recent = (d?.sends || []).filter(t => now - t < 3600e3);
  if (d && now - num(d.sentAt) < 55e3) throw new HttpError(429, 'استنى دقيقة قبل ما تطلب كود جديد.');
  if (recent.length >= 5) throw new HttpError(429, 'طلبت أكواد كثيرة، جرّب بعد ساعة.');
  const code = code6();
  await fs.commit([fs.wSet(`authCodes/${key}`, { hash: await codeHash(fs, code, key), exp: now + 10 * 60e3, tries: 0, sentAt: now, sends: [...recent, now].slice(-5), kind })]);
  const T = {
    verify: [`${code} كود تأكيد إيميلك في ملفي`, 'أكّد إيميلك', 'أهلاً بيك في ملفي! استعمل الكود هذا باش تأكد إيميلك وتكمل تفعيل حسابك:'],
    reset: [`${code} كود استرجاع كلمة المرور`, 'استرجاع كلمة المرور', 'وصلنا طلب لتغيير كلمة المرور لحسابك في ملفي. استعمل الكود هذا:'],
    login: [`${code} كود الدخول لمتجر ${extra.store || ''}`, `الدخول لمتجر ${extra.store || ''}`, 'استعمل الكود هذا باش تدخل لحسابك وتشوف طلباتك وضمانها من أي جهاز:']
  }[kind] || [];
  await sendMail(env, email, T[0], mailHTML({ title: T[1], intro: T[2], code, note: 'الكود صالح لمدة 10 دقائق، وما تشاركهوش مع أي حد، حتى لو قال إنه من ملفي.' }));
}
async function checkCode(fs, key, code) {
  const d = await fs.get(`authCodes/${key}`);
  const now = Date.now();
  if (!d || num(d.exp) < now) throw new HttpError(400, 'الكود انتهى. اطلب كود جديد.');
  if (num(d.tries) >= 5) throw new HttpError(429, 'محاولات كثيرة. اطلب كود جديد.');
  if (!/^\d{6}$/.test(String(code || '')) || !safeEq(await codeHash(fs, String(code), key), d.hash)) {
    await fs.commit([fs.wUpdate(`authCodes/${key}`, { tries: num(d.tries) + 1 })]);
    throw new HttpError(400, `الكود غلط. باقيلك ${Math.max(0, 4 - num(d.tries))} محاولات.`);
  }
  await fs.commit([fs.wDelete(`authCodes/${key}`)]);
}
const IDT = fs => `https://identitytoolkit.googleapis.com/v1/projects/${fs.pid}`;
async function authUpdate(fs, data) {
  const r = await gcall(fs, 'POST', `${IDT(fs)}/accounts:update`, data);
  if (!r.ok) { console.log('idt', r.status, JSON.stringify(r.j).slice(0, 300)); throw new HttpError(502, 'تعذر تحديث الحساب، جرّب بعد شوية.'); }
}
const normEmail = e => String(e || '').trim().toLowerCase().slice(0, 200);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function authRoute(fs, env, p, body, who) {
  if (p === '/auth/verify/send') {
    if (who.verified) throw new HttpError(409, 'إيميلك مؤكد من قبل.');
    if (!who.email) throw new HttpError(400, 'ما فيش إيميل في حسابك.');
    await issueCode(fs, env, `v_${who.uid}`, who.email, 'verify'); return { ok: true };
  }
  if (p === '/auth/verify/check') {
    await checkCode(fs, `v_${who.uid}`, body.code);
    await authUpdate(fs, { localId: who.uid, emailVerified: true }); return { ok: true };
  }
  const email = normEmail(body.email);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'اكتب إيميل صحيح.');
  const key = 'r_' + (await sha256hex(email)).slice(0, 32);
  if (p === '/auth/reset/send') {
    const r = await gcall(fs, 'POST', `${IDT(fs)}/accounts:lookup`, { email: [email] });
    const u = r.ok ? r.j.users?.[0] : null;
    if (u?.localId && !u.disabled) await issueCode(fs, env, key, email, 'reset');
    return { ok: true };   // نفس الرد دايماً باش ما نكشفوش الإيميلات المسجلة
  }
  if (p === '/auth/reset/confirm') {
    const pass = String(body.password || '');
    if (pass.length < 6 || pass.length > 100) throw new HttpError(400, 'كلمة المرور لازم 6 أحرف على الأقل.');
    await checkCode(fs, key, body.code);
    const r = await gcall(fs, 'POST', `${IDT(fs)}/accounts:lookup`, { email: [email] });
    const u = r.ok ? r.j.users?.[0] : null;
    if (!u?.localId) throw new HttpError(400, 'الحساب مش موجود.');
    await authUpdate(fs, { localId: u.localId, password: pass, emailVerified: true }); return { ok: true };
  }
  throw new HttpError(404, 'غير موجود.');
}

/* ===================== متجر التاجر: الحفظ من السيرفر ===================== */
const TPLS = ['pulse', 'clean', 'pop', 'luxe', 'nova', 'nature'], PALS = ['malafy', 'ocean', 'emerald', 'royal', 'sunset', 'ruby', 'sky', 'mint', 'gold', 'mono'];
const FONT_LIST = ['IBM Plex Sans Arabic', 'Cairo', 'Tajawal', 'Almarai', 'Noto Kufi Arabic', 'Readex Pro'];
const SECTION_IDS = ['announce', 'hero', 'cats', 'featured', 'all', 'about', 'faq', 'policy'];
const ICON_IDS = ['tv', 'pad', 'gem', 'card', 'sim', 'bolt', 'star', 'gift'];
async function merchantGate(fs, uid) {
  const [user, platform] = await Promise.all([fs.get(`users/${uid}`, { mask: USER_FIELDS }), platformOf(fs)]);
  if (!user || user.status === 'deleted') throw new HttpError(403, 'الحساب محذوف.');
  if (user.isActive !== true || !(num(user.planExpiresAt) > Date.now())) throw new HttpError(403, user.plan?.trial ? 'التجربة المجانية انتهت. اشترك باش تقدر تعدّل متجرك.' : 'اشتراكك منتهي أو موقوف. جدّده باش تقدر تعدّل متجرك.');
  if (!(await merchantAllowed(fs, user, platform))) throw new HttpError(403, user.plan?.trial ? 'التجربة المجانية ما فيهاش متجر. اشترك في خطة فيها متجر.' : 'خطتك الحالية ما فيهاش متجر. رقّي اشتراكك لخطة فيها متجر، أو تواصل مع الإدارة.');
  return { user, platform };
}
const imgOrEmpty = (v, max) => { if (v === '' || v == null) return ''; if (typeof v !== 'string' || v.length > max || !IMG_RE.test(v)) throw new HttpError(400, 'الصورة غير صالحة أو كبيرة.'); return v; };
function cleanDesign(d = {}) {
  return {
    template: TPLS.includes(d.template) ? d.template : 'pulse', palette: PALS.includes(d.palette) ? d.palette : 'royal',
    color: /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : '', font: FONT_LIST.includes(d.font) ? d.font : 'IBM Plex Sans Arabic',
    card: ['grid', 'list', 'large'].includes(d.card) ? d.card : 'grid', corner: ['sharp', 'soft', 'round'].includes(d.corner) ? d.corner : 'round', mode: d.mode === 'light' ? 'light' : 'dark'
  };
}
function cleanInfo(i = {}) {
  const so = i.socials && typeof i.socials === 'object' ? i.socials : {};
  return {
    heroTitle: clean(i.heroTitle, 80), heroSub: clean(i.heroSub, 160), announce: clean(i.announce, 120), about: clean(i.about, 1200), policy: clean(i.policy, 2000),
    whatsapp: clean(i.whatsapp, 20), floatWa: i.floatWa !== false,
    faq: (Array.isArray(i.faq) ? i.faq : []).map(f => ({ q: clean(f?.q, 160), a: clean(f?.a, 800) })).filter(f => f.q && f.a).slice(0, 12),
    socials: Object.fromEntries(['instagram', 'tiktok', 'facebook', 'telegram', 'snapchat', 'x'].map(k => [k, clean(so[k], 200)]).filter(([, v]) => v))
  };
}
const cleanSections = l => { const seen = new Set(); return (Array.isArray(l) ? l : []).filter(x => SECTION_IDS.includes(x?.id) && !seen.has(x.id) && seen.add(x.id)).map(x => ({ id: x.id, on: x.on !== false })); };
async function storeCreate(fs, uid, body) {
  const { user } = await merchantGate(fs, uid);
  const name = clean(body.name, 40), slug = String(body.slug || '').toLowerCase(), country = body.country === 'SA' ? 'SA' : body.country === 'LY' ? 'LY' : '';
  if (!name) throw new HttpError(400, 'اكتب اسم المتجر.');
  if (!country) throw new HttpError(400, 'اختار دولة المتجر.');
  if (!SLUG_RE.test(slug) || slug.includes('--') || RESERVED.includes(slug)) throw new HttpError(400, 'الرابط غير صالح أو محجوز.');
  const tpl = TPLS.includes(body.template) ? body.template : 'pulse';
  const T = { pulse: ['royal', 'grid', 'round', 'dark'], clean: ['ocean', 'list', 'soft', 'light'], pop: ['sunset', 'grid', 'round', 'light'], luxe: ['gold', 'large', 'sharp', 'dark'], nova: ['sky', 'grid', 'soft', 'dark'], nature: ['emerald', 'list', 'soft', 'light'] }[tpl];
  const now = Date.now(), cur = country === 'SA' ? 'SAR' : 'LYD';
  await fs.tx(async (tx, W) => {
    const [st, sl] = await fs.getMany([`stores/${uid}`, `slugs/${slug}`], { tx });
    if (st) throw new HttpError(409, 'عندك متجر من قبل.');
    if (sl) throw new HttpError(409, 'الرابط هذا مأخوذ، جرّب غيره.');
    W.push(fs.wCreate(`slugs/${slug}`, { storeId: uid }));
    W.push(fs.wCreate(`stores/${uid}`, {
      ownerId: uid, slug, name, country, currency: cur, status: 'active', suspended: false, createdAt: new Date(now), launchedAt: now, updatedAt: now,
      design: { template: tpl, palette: T[0], color: '', font: 'IBM Plex Sans Arabic', card: T[1], corner: T[2], mode: T[3] },
      sections: SECTION_IDS.map(id => ({ id, on: true })), categories: [],
      info: { heroTitle: name, heroSub: '', announce: '', about: '', whatsapp: clean(user.phone || body.phone, 20), floatWa: true, policy: '', faq: [], socials: {} },
      logo: '', logoV: 0, cover: '', coverV: 0
    }));
    W.push(fs.wUpdate(`users/${uid}`, { currency: cur === 'SAR' ? 'ر.س' : 'د.ل' }));
  });
  return { ok: true, slug };
}
async function storeOf(fs, uid) { const s = await fs.get(`stores/${uid}`, { mask: STORE_FIELDS }); if (!s) throw new HttpError(404, 'ما عندكش متجر.'); return s; }
async function storeSave(fs, uid, body) {
  await merchantGate(fs, uid);
  const s = await storeOf(fs, uid);
  const now = Date.now(), upd = { updatedAt: now };
  if ('name' in body) { upd.name = clean(body.name, 40); if (!upd.name) throw new HttpError(400, 'اكتب اسم المتجر.'); }
  if ('design' in body) upd.design = cleanDesign(body.design);
  if ('sections' in body) upd.sections = cleanSections(body.sections);
  if ('info' in body) upd.info = cleanInfo(body.info);
  if ('status' in body) upd.status = body.status === 'paused' ? 'paused' : 'active';
  if ('logo' in body) { upd.logo = imgOrEmpty(body.logo, 120000); upd.logoV = upd.logo ? now : 0; }
  if ('cover' in body) { upd.cover = imgOrEmpty(body.cover, 420000); upd.coverV = upd.cover ? now : 0; }
  if ('payMethods' in body) upd.payMethods = (Array.isArray(body.payMethods) ? body.payMethods : []).map(String).filter(x => ID_RE.test(x)).slice(0, 12);
  await fs.commit([fs.wUpdate(`stores/${uid}`, upd)]);
  await purgeStore(s.slug);
  return { ok: true };
}
async function storeSlug(fs, uid, body) {
  await merchantGate(fs, uid);
  const slug = String(body.slug || '').toLowerCase();
  if (!SLUG_RE.test(slug) || slug.includes('--') || RESERVED.includes(slug)) throw new HttpError(400, 'الرابط غير صالح أو محجوز.');
  const old = await fs.tx(async (tx, W) => {
    const [st, sl] = await fs.getMany([`stores/${uid}`, `slugs/${slug}`], { tx });
    if (!st) throw new HttpError(404, 'ما عندكش متجر.');
    if (st.slug === slug) return st.slug;
    if (sl) throw new HttpError(409, 'الرابط هذا مأخوذ، جرّب غيره.');
    W.push(fs.wCreate(`slugs/${slug}`, { storeId: uid }));
    W.push(fs.wDelete(`slugs/${st.slug}`));
    W.push(fs.wUpdate(`stores/${uid}`, { slug, updatedAt: Date.now() }));
    return st.slug;
  });
  await purgeStore(old); await purgeStore(slug);
  return { ok: true, slug };
}
async function storeCats(fs, uid, body) {
  await merchantGate(fs, uid);
  const s = await storeOf(fs, uid);
  const list = (Array.isArray(body.categories) ? body.categories : []).slice(0, 12).map(c => ({
    id: ID_RE.test(String(c?.id || '')) ? String(c.id) : 'c' + randomStr(8, 'abcdefghijkmnpqrstuvwxyz23456789'),
    name: clean(c?.name, 30), icon: ICON_IDS.includes(c?.icon) ? c.icon : 'star'
  })).filter(c => c.name);
  if (new Set(list.map(c => c.id)).size !== list.length) throw new HttpError(400, 'فيه أقسام مكررة.');
  const items = await fs.query('items', [], { parent: `stores/${uid}`, select: ['cat', 'name'] });
  const gone = items.find(i => i.cat && !list.some(c => c.id === i.cat));
  if (gone) { const c = (s.categories || []).find(x => x.id === gone.cat); throw new HttpError(409, `فيه منتجات في قسم "${c?.name || gone.cat}". انقلها لقسم ثاني قبل ما تحذفه.`); }
  await fs.commit([fs.wUpdate(`stores/${uid}`, { categories: list, updatedAt: Date.now() })]);
  await purgeStore(s.slug);
  return { ok: true, categories: list };
}
const posNum = (v, max = 1e7) => { const n = round2(v); return n > 0 && n <= max ? n : 0; };
function cleanItem(x, cats) {
  const type = ['account', 'code', 'number', 'manual'].includes(x?.type) ? x.type : '';
  if (!type) throw new HttpError(400, 'نوع المنتج غير صحيح.');
  const name = clean(x.name, 80); if (!name) throw new HttpError(400, 'اكتب اسم المنتج.');
  const cat = clean(x.cat, 30);
  if (!cat || !cats.some(c => c.id === cat)) throw new HttpError(400, 'اختار قسم المنتج.');
  const it = {
    type, name, desc: clean(x.desc, 800), cat, image: imgOrEmpty(x.image, 200000), imgV: x.image ? Math.max(0, int(x.imgV)) || Date.now() : 0,
    note: clean(x.note, 300), order: int(x.order), featured: x.featured === true, active: x.active !== false, updatedAt: Date.now()
  };
  if (x.warranty === undefined || x.warranty === null || x.warranty === '' || !/^\d{1,3}$/.test(String(x.warranty))) throw new HttpError(400, 'حدد مدة ضمان المنتج بالأيام، أو اختار «بدون ضمان».');
  it.warranty = Math.min(365, int(x.warranty));
  if (type === 'account') {
    it.productIds = (Array.isArray(x.productIds) ? x.productIds : []).map(String).filter(p => ID_RE.test(p)).slice(0, 10);
    it.durations = (Array.isArray(x.durations) ? x.durations : []).map(d => ({ m: int(d?.m), price: posNum(d?.price) })).filter(d => d.m >= 1 && d.m <= 24 && d.price > 0).slice(0, 8);
    if (!it.productIds.length) throw new HttpError(400, 'اختار حساب واحد على الأقل.');
    if (!it.durations.length) throw new HttpError(400, 'حط سعر لمدة وحدة على الأقل.');
  } else if (type === 'code') {
    it.productId = String(x.productId || ''); it.price = posNum(x.price); it.maxQty = Math.min(10, Math.max(1, int(x.maxQty) || 10));
    if (!ID_RE.test(it.productId)) throw new HttpError(400, 'اختار فئة الأكواد.');
    if (!it.price) throw new HttpError(400, 'حط سعر الكود.');
  } else if (type === 'number') {
    it.mode = x.mode === 'pick' ? 'pick' : 'country';
    it.prices = it.mode === 'pick' ? [] : (Array.isArray(x.prices) ? x.prices : []).map(p => ({ country: clean(p?.country, 40), price: posNum(p?.price) })).filter(p => p.country && p.price).slice(0, 40);
    if (it.mode === 'country' && !it.prices.length) throw new HttpError(400, 'حط سعر لدولة وحدة على الأقل.');
  } else {
    it.packs = (Array.isArray(x.packs) ? x.packs : []).map(p => ({ label: clean(p?.label, 60), price: posNum(p?.price) })).filter(p => p.label && p.price).slice(0, 20);
    it.fields = (Array.isArray(x.fields) ? x.fields : []).map(f => ({ label: clean(f?.label, 40), req: f?.req !== false })).filter(f => f.label).slice(0, 4);
    if (!it.packs.length) throw new HttpError(400, 'أضف باقة وحدة على الأقل (الاسم والسعر).');
  }
  return Object.assign(it, cleanStock(x, type));
}
function cleanStock(x, type) {
  const o = { stock: Math.max(0, Math.min(100000, int(x.stock))) };
  if (type === 'account') o.maxMonths = Math.max(0, Math.min(24, int(x.maxMonths)));
  if (type === 'number') {
    o.countries = (Array.isArray(x.countries) ? x.countries : []).map(c => ({ country: clean(c?.country, 40), n: Math.max(0, int(c?.n)) })).filter(c => c.country).slice(0, 100);
    o.numbers = (Array.isArray(x.numbers) ? x.numbers : []).filter(n => ID_RE.test(String(n?.id || ''))).map(n => ({ id: String(n.id), mask: clean(n.mask, 40), country: clean(n.country, 40), price: posNum(n.price) })).filter(n => n.price).slice(0, 80);
  }
  return o;
}
async function itemSave(fs, uid, body) {
  await merchantGate(fs, uid);
  const s = await storeOf(fs, uid);
  const it = cleanItem(body.item || {}, s.categories || []);
  const id = body.id ? String(body.id) : randomStr(20, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  if (!ID_RE.test(id)) throw new HttpError(400, 'منتج غير صحيح.');
  const ex = body.id ? await fs.get(`stores/${uid}/items/${id}`, { mask: ['createdAt'] }) : null;
  if (body.id && !ex) throw new HttpError(404, 'المنتج مش موجود.');
  await fs.commit([fs.wSet(`stores/${uid}/items/${id}`, { ...it, createdAt: ex?.createdAt || Date.now() })]);
  await purgeStore(s.slug);
  return { ok: true, id };
}
async function itemDelete(fs, uid, body) {
  const s = await storeOf(fs, uid);
  const id = String(body.id || ''); if (!ID_RE.test(id)) throw new HttpError(400, 'منتج غير صحيح.');
  await fs.commit([fs.wDelete(`stores/${uid}/items/${id}`)]);
  await purgeStore(s.slug);
  return { ok: true };
}
async function itemActive(fs, uid, body) {
  await merchantGate(fs, uid);
  const s = await storeOf(fs, uid);
  const id = String(body.id || ''); if (!ID_RE.test(id)) throw new HttpError(400, 'منتج غير صحيح.');
  await fs.commit([fs.wUpdate(`stores/${uid}/items/${id}`, { active: body.active !== false, updatedAt: Date.now() })]);
  await purgeStore(s.slug);
  return { ok: true };
}
async function itemSync(fs, uid, body) {
  const list = (Array.isArray(body.items) ? body.items : []).slice(0, 60);
  if (!list.length) return { ok: true };
  const s = await storeOf(fs, uid);
  const ids = list.map(x => String(x?.id || '')).filter(id => ID_RE.test(id));
  const cur = await fs.getMany(ids.map(id => `stores/${uid}/items/${id}`), { mask: ['type'] });
  const W = [];
  ids.forEach((id, i) => { if (cur[i]) W.push(fs.wUpdate(`stores/${uid}/items/${id}`, cleanStock(list.find(x => x.id === id), cur[i].type))); });
  if (W.length) await fs.commit(W);
  await purgeStore(s.slug);
  return { ok: true, n: W.length };
}

/* ===================== تنبيه الأدمن بطلبات الاشتراك ===================== */
async function notifyRequest(fs, env, uid, body) {
  const id = String(body.id || ''); if (!ID_RE.test(id)) throw new HttpError(400, 'طلب غير صحيح.');
  const r = await fs.get(`subscriptionRequests/${id}`);
  if (!r || r.merchantId !== uid || r.status !== 'pending' || r.notified) return { ok: true };
  await fs.commit([fs.wUpdate(`subscriptionRequests/${id}`, { notified: true })]);
  await pushTo(fs, env, { roles: ['admin'] }, r.type === 'trial'
    ? { title: 'طلب تجربة مجانية', body: `${clean(r.merchantName, 60)} يطلب تجربة مجانية`, link: 'admin.html#requests', tag: 'req' }
    : { title: 'طلب اشتراك جديد', body: `${clean(r.merchantName, 60)}: ${clean(r.planName, 40)} · ${fmtMoney(r.price, r.currency || 'LYD')}`, link: 'admin.html#requests', tag: 'req' });
  return { ok: true };
}
async function mailApproved(fs, env, body) {
  const uid = String(body.uid || ''); if (!ID_RE.test(uid)) throw new HttpError(400, 'تاجر غير صحيح.');
  const u = await fs.get(`users/${uid}`, { mask: ['email', 'displayName', 'plan', 'planExpiresAt'] });
  if (!u?.email) return { ok: false };
  const trial = !!u.plan?.trial;
  await sendMail(env, u.email, trial ? 'تفعّلت تجربتك المجانية في ملفي' : 'تم تفعيل اشتراكك في ملفي ✅', mailHTML({
    title: trial ? 'تجربتك المجانية جاهزة' : 'اشتراكك مفعّل',
    intro: `أهلاً ${clean(u.displayName, 60) || ''}، ${trial ? 'تفعّلت التجربة المجانية لحسابك، وتقدر تبدأ تستعمل لوحتك توا.' : `تم تفعيل اشتراكك (${clean(u.plan?.name, 40)}) ويبقى شغال لين ${fmtDate(num(u.planExpiresAt))}.`}`,
    button: { text: 'افتح لوحتك', url: `${siteOrigin(env)}/app.html` }
  }));
  return { ok: true };
}

/* ===================== التنبيهات اليومية ===================== */
const LY_OFFSET = 2 * 3600e3;
const lyDay = ms => new Date(ms + LY_OFFSET).toISOString().slice(0, 10);
async function dailyJobs(fs, env) {
  const now = Date.now(), p = await platformOf(fs);
  const hour = Math.min(23, Math.max(0, int(p.renewHour ?? 17))), days = Math.min(30, Math.max(1, int(p.renewDays) || 3));
  if (new Date(now + LY_OFFSET).getUTCHours() < hour) return 0;
  const today = lyDay(now);
  let st = await fs.get('system/daily');
  if (st?.day !== today) {
    const toks = await fs.query('pushTokens', [['role', '==', 'merchant']], { limit: 500, select: ['uid'] });
    const subs = await fs.query('users', [['planExpiresAt', '>=', new Date(now)], ['planExpiresAt', '<=', new Date(now + 3 * DAY)]], { limit: 200, select: ['email'] });
    st = { day: today, queue: [...new Set(toks.map(t => t.uid))].slice(0, 400), mail: subs.map(s => s.id).slice(0, 200) };
    await fs.commit([fs.wSet('system/daily', st)]);
  }
  let n = 0;
  const queue = [...(st.queue || [])], mail = [...(st.mail || [])];
  while (queue.length && fs.calls < 38) {
    const uid = queue.shift();
    if (!ID_RE.test(uid)) continue;
    const files = await fs.query('files', [['endDate', '>=', now - 7 * DAY], ['endDate', '<=', now + days * DAY]], { parent: `merchants/${uid}`, limit: 300, select: ['status', 'endDate'] });
    const sold = files.filter(f => f.status === 'sold'), over = sold.filter(f => num(f.endDate) < now).length, soon = sold.length - over;
    if (sold.length) { await pushTo(fs, env, { uids: [uid] }, { title: 'تجديدات اليوم', body: [soon ? `${soon} يحتاج تجديد` : '', over ? `${over} منتهي` : ''].filter(Boolean).join(' و ') + '. ذكّر زباينك قبل ما يروحوا.', link: 'app.html#reminders', tag: 'renew' }); n++; }
  }
  while (mail.length && fs.calls < 40 && env.RESEND_KEY) {
    const uid = mail.shift();
    if (!ID_RE.test(uid)) continue;
    const [u, flag] = await fs.getMany([`users/${uid}`, `mailFlags/${uid}`]);
    if (!u?.email || u.isActive !== true || u.plan?.trial || num(flag?.subExp) === num(u.planExpiresAt)) continue;
    try {
      await sendMail(env, u.email, 'اشتراكك في ملفي قرب ينتهي', mailHTML({ title: 'اشتراكك قرب ينتهي', intro: `أهلاً ${clean(u.displayName, 60)}، اشتراكك في ملفي ينتهي في ${fmtDate(num(u.planExpiresAt))}. جدّده من لوحتك باش ما يتوقفش شغلك، وبياناتك تبقى محفوظة.`, button: { text: 'جدّد الاشتراك', url: `${siteOrigin(env)}/app.html#settings` } }));
      await fs.commit([fs.wSet(`mailFlags/${uid}`, { subExp: num(u.planExpiresAt), at: now })]);
    } catch (e) { console.log('mail', e.message); }
  }
  await fs.commit([fs.wSet('system/daily', { day: today, queue, mail })]);
  return n;
}

/* ===================== الصفحات ===================== */
const SEC_HEADERS = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'strict-transport-security': 'max-age=31536000'
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS, ...headers } });
}
function simplePage(title, msg, status = 404) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title><meta name="robots" content="noindex"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B0F1E;color:#EEF1FA;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;text-align:center;padding:24px}main{max-width:420px}h1{font-size:22px;margin:0 0 10px}p{color:#9AA3BF;line-height:1.8;margin:0}</style></head><body><main><h1>${escHtml(title)}</h1><p>${escHtml(msg)}</p></main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", ...SEC_HEADERS } });
}
let TPL = null, TPL_AT = 0;
async function template(env) {
  if (TPL && Date.now() - TPL_AT < 300e3) return TPL;
  const r = await fetch(`${siteOrigin(env)}/store.html`, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) { if (TPL) return TPL; throw new HttpError(502, 'تعذر تحميل صفحة المتجر.'); }
  TPL = await r.text(); TPL_AT = Date.now();
  return TPL;
}
const siteOrigin = env => (env.SITE_ORIGIN || 'https://malafy.net').replace(/\/+$/, '');
async function storePage(env, fs, slug, host, url) {
  const cat = await catalog(fs, slug);
  if (!cat) return simplePage('المتجر مش موجود', 'تأكد من الرابط، أو تواصل مع صاحب المتجر.');
  const s = cat.store;
  const tpl = await template(env);
  const desc = s.info.heroSub || s.info.about.slice(0, 160) || `متجر ${s.name}`;
  const img = s.logo || s.cover;
  const meta = [
    `<meta name="description" content="${escHtml(desc)}">`,
    `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="${escHtml(s.name)}">`,
    `<meta property="og:title" content="${escHtml(s.name)}">`, `<meta property="og:description" content="${escHtml(desc)}">`,
    `<meta property="og:url" content="https://${escHtml(host)}${escHtml(url.pathname === '/' ? '/' : url.pathname)}">`,
    img ? `<meta property="og:image" content="https://${escHtml(host)}${escHtml(img)}">` : '',
    `<meta name="twitter:card" content="summary">`,
    s.logo ? `<link rel="icon" href="${escHtml(s.logo)}">` : ''
  ].join('');
  const boot = `<script id="boot" type="application/json">${JSON.stringify(cat).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}</script>`;
  const html = tpl.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(s.name)}</title>`).replace('<!--META-->', meta).replace('<!--BOOT-->', boot);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': CSP, ...SEC_HEADERS } });
}
async function imageResponse(fs, sid, field, path) {
  const d = await fs.get(path, { mask: [field] });
  const img = dataUrlBytes(d?.[field]);
  if (!img) return new Response('Not found', { status: 404, headers: { 'cache-control': 'public, max-age=60' } });
  return new Response(img.bytes, { headers: { 'content-type': img.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
}
async function cached(req, ctx, fn) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) { const hit = await cache.match(req); if (hit) return hit; }
  const res = await fn();
  if (cache && res.ok && /max-age=[1-9]/.test(res.headers.get('cache-control') || '')) ctx?.waitUntil?.(cache.put(req, res.clone()));
  return res;
}

/* ===================== التوجيه ===================== */
/* ===================== حساب الزبون في المتجر (إيميل + كود) ===================== */
const CUST_TTL = 90 * DAY;
const custKey = async email => (await sha256hex('cust|' + email)).slice(0, 32);
async function customerOf(fs, req) {
  const t = req.headers.get('x-customer') || '';
  if (!/^[A-Za-z0-9]{32,64}$/.test(t)) return null;
  const s = await fs.get(`custSessions/${await sha256hex(t)}`);
  if (!s || num(s.exp) < Date.now()) return null;
  return { email: s.email, key: s.key };
}
const ipSends = new Map();   // حد بسيط لكل IP داخل نفس النسخة
function ipLimit(req, max = 8) {
  const ip = req.headers.get('cf-connecting-ip') || 'x', now = Date.now();
  const l = (ipSends.get(ip) || []).filter(t => now - t < 3600e3);
  if (l.length >= max) throw new HttpError(429, 'طلبت أكواد كثيرة، جرّب بعد شوية.');
  l.push(now); ipSends.set(ip, l);
  if (ipSends.size > 5000) ipSends.clear();
}
const SUMMARY_FIELDS = ['storeId', 'status', 'createdAt', 'deliveredAt', 'total', 'subtotal', 'fee', 'currency', 'items', 'problem', 'received', 'holdDays', 'wDays', 'claim'];
async function customerRoute(req, env, fs, slug, p, method) {
  const ctx = await storeCtx(fs, slug);
  if (!ctx) throw new HttpError(404, 'المتجر مش موجود.');
  if (method !== 'GET' && method !== 'POST') throw new HttpError(405, 'غير مسموح.');
  const body = method === 'POST' ? await readJson(req, 8000) : {};
  if (p === '/api/auth/send') {
    const email = normEmail(body.email);
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'اكتب إيميل صحيح.');
    ipLimit(req);
    await issueCode(fs, env, 'l_' + await custKey(email), email, 'login', { store: clean(ctx.store.name, 40) });
    return json({ ok: true });
  }
  if (p === '/api/auth/verify') {
    const email = normEmail(body.email);
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'اكتب إيميل صحيح.');
    const key = await custKey(email);
    await checkCode(fs, 'l_' + key, body.code);
    const token = randomStr(40, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789'), now = Date.now();
    await fs.commit([fs.wSet(`custSessions/${await sha256hex(token)}`, { email, key, exp: now + CUST_TTL, at: now })]);
    return json({ ok: true, token, email });
  }
  const tok = req.headers.get('x-customer') || '';
  const c = await customerOf(fs, req);
  if (p === '/api/auth/logout') {
    if (c) await fs.commit([fs.wDelete(`custSessions/${await sha256hex(tok)}`)]);
    return json({ ok: true });
  }
  if (!c) throw new HttpError(401, 'سجّل دخولك من جديد.');
  if (p === '/api/me') return json({ email: c.email });
  if (p === '/api/my/orders') {
    const list = await fs.query('orders', [['customerKey', '==', c.key]], { limit: 60, select: SUMMARY_FIELDS });
    const now = Date.now();
    const out = list.filter(o => o.storeId === ctx.sid).sort((a, b) => num(b.createdAt) - num(a.createdAt)).slice(0, 40).map(o => {
      const dl = num(o.deliveredAt), ch = holdDaysOf(o, ctx.platform) * DAY, md = merchDaysOf(o, ctx.platform);
      const end = dl ? dl + Math.max(ch, md * DAY) : 0;
      return {
        id: o.id, status: o.status, createdAt: num(o.createdAt), deliveredAt: dl, total: o.total, currency: o.currency,
        items: (o.items || []).map(i => ({ name: i.name, opt: i.opt, qty: i.qty })),
        warrantyEnd: end, noWarranty: md === 0, claimOpen: !!o.claim?.open,
        canReport: o.status === 'preparing' || (o.status === 'delivered' && now < dl + ch) || (o.status === 'completed' && md > 0 && now < dl + md * DAY && !o.claim?.open)
      };
    });
    return json({ email: c.email, warrantyDays: warrantyDays(ctx.platform), orders: out });
  }
  if (p === '/api/my/claim') {
    // ربط الطلبات القديمة (اللي على هذا الجهاز) بحساب الزبون
    const want = (Array.isArray(body.orders) ? body.orders : []).slice(0, 20).filter(x => ID_RE.test(String(x?.id || '')) && typeof x?.token === 'string' && x.token.length < 80);
    if (!want.length) return json({ ok: true, n: 0 });
    const docs = await fs.getMany(want.map(x => `orders/${x.id}`), { mask: ['storeId', 'tokenHash', 'customerKey'] });
    const W = [];
    for (let i = 0; i < want.length; i++) {
      const o = docs[i];
      if (!o || o.storeId !== ctx.sid || o.customerKey) continue;
      if (!safeEq(await sha256hex(want[i].token), o.tokenHash)) continue;
      W.push(fs.wUpdate(`orders/${want[i].id}`, { customerKey: c.key, customerEmail: c.email }));
    }
    if (W.length) await fs.commit(W);
    return json({ ok: true, n: W.length });
  }
  throw new HttpError(404, 'غير موجود.');
}

async function storeRoute(req, env, ctx, slug, url, host) {
  const p = url.pathname, method = req.method;
  if (method === 'GET' && ASSETS[p]) {
    return cached(new Request(url.origin + p + '?v=' + (url.searchParams.get('v') || '')), ctx, async () => {
      const r = await fetch(`${siteOrigin(env)}${p}`, { cf: { cacheTtl: 300, cacheEverything: true } });
      if (!r.ok) return new Response('Not found', { status: 404 });
      return new Response(r.body, { headers: { 'content-type': ASSETS[p], 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    });
  }
  if (p === '/robots.txt') return new Response('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /o/\n', { headers: { 'content-type': 'text/plain' } });
  const fs = new FS(env);
  if (method === 'GET' && p.startsWith('/img/')) {
    return cached(new Request(url.href), ctx, async () => {
      const c = await storeCtx(fs, slug);
      if (!c) return new Response('Not found', { status: 404 });
      const m = p.match(/^\/img\/(logo|cover|i\/([A-Za-z0-9_-]{1,40})|m\/([A-Za-z0-9_-]{1,40}))$/);
      if (!m) return new Response('Not found', { status: 404 });
      if (m[1] === 'logo' || m[1] === 'cover') return imageResponse(fs, c.sid, m[1], `stores/${c.sid}`);
      if (m[2]) return imageResponse(fs, c.sid, 'image', `stores/${c.sid}/items/${m[2]}`);
      const ms = await methodsFor(fs, c.store, c.platform);
      if (!ms.some(x => x.id === m[3])) return new Response('Not found', { status: 404 });
      return imageResponse(fs, c.sid, 'image', `paymentMethods/${m[3]}`);
    });
  }
  if (p === '/favicon.ico') { const c = await storeCtx(fs, slug); return c?.store?.logoV ? Response.redirect(`https://${host}/img/logo?v=${int(c.store.logoV)}`, 302) : new Response(null, { status: 204 }); }
  if (p === '/api/store' && method === 'GET') {
    const cat = await catalog(fs, slug);
    if (!cat) throw new HttpError(404, 'المتجر مش موجود.');
    return json(cat, 200, { 'cache-control': 'no-store' });
  }
  if (p === '/api/orders' && method === 'POST') return createOrder(req, env, fs, slug, ctx);
  let m = p.match(/^\/api\/orders\/([A-Za-z0-9]{1,20})$/);
  if (m && method === 'GET') { const o = await orderForCustomer(req, fs, slug, m[1]); return json(await customerView(fs, o, slug)); }
  m = p.match(/^\/api\/orders\/([A-Za-z0-9]{1,20})\/(received|problem)$/);
  if (m && method === 'POST') {
    const o = await orderForCustomer(req, fs, slug, m[1]);
    if (m[2] === 'received') {
      // الزبون أكد إن كل شي تمام (أو إن المشكلة انحلت). الضمان يكمل لين آخر مدته، وبعدها الفلوس تتحول للتاجر
      const ch = holdDaysOf(o, await platformOf(fs)) * DAY;
      await fs.tx(async (tx, W) => {
        const x = await fs.get(`orders/${o.id}`, { tx });
        const now = Date.now();
        if (x.claim?.open) { W.push(fs.wUpdate(`orders/${o.id}`, { claim: { ...x.claim, open: false, solvedAt: now }, open: false, updatedAt: now, log: [...(x.log || []), { s: 'claim-solved', at: now, by: 'customer' }].slice(-30) })); return; }
        if (x.status === 'delivered') { if (!x.received) W.push(fs.wUpdate(`orders/${o.id}`, { received: true, receivedAt: now, updatedAt: now })); return; }
        if (x.status !== 'problem') throw new HttpError(409, 'الطلب لسه ما تسلّمش.');
        const allDone = (x.items || []).every(i => i.status === 'delivered');
        const upd = { problem: { ...x.problem, solvedAt: now }, updatedAt: now, received: true, receivedAt: now, log: [...(x.log || []), { s: 'solved', at: now, by: 'customer' }].slice(-30) };
        if (allDone && x.deliveredAt) Object.assign(upd, { status: 'delivered', autoAt: Math.max(now + 3600e3, num(x.deliveredAt) + ch) });
        else Object.assign(upd, { status: 'preparing', autoAt: null });
        W.push(fs.wUpdate(`orders/${o.id}`, upd));
      });
    } else {
      const body = await readJson(req, 4000);
      const text = clean(body.text, 600);
      if (text.length < 5) throw new HttpError(400, 'اشرح المشكلة باختصار.');
      const pf = await platformOf(fs);
      const kind = await fs.tx(async (tx, W) => {
        const x = await fs.get(`orders/${o.id}`, { tx });
        const now = Date.now(), dl = num(x.deliveredAt), ch = holdDaysOf(x, pf) * DAY, md = merchDaysOf(x, pf);
        if (x.status === 'preparing' || (x.status === 'delivered' && now < dl + ch)) {
          W.push(fs.wUpdate(`orders/${o.id}`, { status: 'problem', autoAt: null, problem: { text, at: now, by: 'customer' }, updatedAt: now, log: [...(x.log || []), { s: 'problem', at: now, by: 'customer' }].slice(-30) }));
          return 'problem';
        }
        // بعد ضمان ملفي: بلاغ على ضمان التاجر (الفلوس اتحولت للتاجر)
        if (x.status === 'completed' && dl && md > 0 && now < dl + md * DAY && !x.claim?.open) {
          W.push(fs.wUpdate(`orders/${o.id}`, { open: true, claim: { text, at: now, open: true }, updatedAt: now, log: [...(x.log || []), { s: 'claim', at: now, by: 'customer' }].slice(-30) }));
          return 'claim';
        }
        if (x.status === 'problem' || x.claim?.open) throw new HttpError(409, 'فيه بلاغ مفتوح على الطلب.');
        if (dl && md === 0) throw new HttpError(409, 'المنتج هذا بدون ضمان.');
        throw new HttpError(409, 'مدة الضمان انتهت.');
      });
      later(ctx, Promise.all([
        pushTo(fs, env, { uids: [o.storeId] }, { title: kind === 'claim' ? 'بلاغ ضمان من زبون' : 'بلاغ من زبون', body: `طلب #${o.id}: ${text.slice(0, 80)}`, link: 'app.html#store/orders', tag: 'problem' }),
        pushTo(fs, env, { roles: ['admin'] }, { title: kind === 'claim' ? 'بلاغ على ضمان متجر' : 'بلاغ على طلب متجر', body: `${clean(o.storeName, 40)} · #${o.id}`, link: 'admin.html#sorders', tag: 'problem' })
      ]));
    }
    return json(await customerView(fs, { ...(await fs.get(`orders/${o.id}`)), id: o.id }, slug));
  }
  if (p.startsWith('/api/auth/') || p.startsWith('/api/my/') || p === '/api/me') return customerRoute(req, env, fs, slug, p, method);
  if (p.startsWith('/api/')) throw new HttpError(404, 'غير موجود.');
  if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  return storePage(env, fs, slug, host, url);
}
function cors(req, env) {
  const o = req.headers.get('origin') || '';
  const root = env.ROOT_DOMAIN || 'malafy.net';
  const allowed = [siteOrigin(env), `https://${root}`, `https://www.${root}`, ...String(env.EXTRA_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)];
  return allowed.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400', vary: 'Origin' } : { vary: 'Origin' };
}
async function apiRoute(req, env, ctx, url) {
  const h = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const send = (d, s = 200) => json(d, s, h);
  try {
    if (url.pathname === '/health') return send({ ok: true });
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const fs = new FS(env);
    const p = url.pathname;
    if (p === '/auth/reset/send' || p === '/auth/reset/confirm') return send(await authRoute(fs, env, p, await readJson(req, 4000), null));
    const auth = req.headers.get('authorization') || '';
    const who = await verifyIdToken(auth.replace(/^Bearer\s+/i, ''), fs.pid);
    if (p === '/auth/verify/send' || p === '/auth/verify/check') return send(await authRoute(fs, env, p, await readJson(req, 4000), who));
    const user = await fs.get(`users/${who.uid}`, { mask: ['role', 'status'] });
    if (!user || user.status === 'deleted') throw new HttpError(403, 'ما عندكش صلاحية.');
    const big = p === '/m/store/save' || p === '/m/items/save' || p === '/m/items/sync';
    const body = await readJson(req, big ? 1_000_000 : 20000);
    let m;
    if ((m = p.match(/^\/m\/orders\/([A-Za-z0-9]{1,20})\/(deliver|reply)$/))) {
      return send(m[2] === 'deliver' ? await merchantDeliver(fs, who.uid, m[1], body) : await merchantReply(fs, who.uid, m[1], body));
    }
    if (p === '/m/push') return send(await pushRegister(fs, who.uid, user.role, body));
    const MER = { '/m/store/create': storeCreate, '/m/store/save': storeSave, '/m/store/slug': storeSlug, '/m/store/cats': storeCats, '/m/items/save': itemSave, '/m/items/delete': itemDelete, '/m/items/active': itemActive, '/m/items/sync': itemSync };
    if (MER[p]) return send(await MER[p](fs, who.uid, body));
    if (p === '/m/notify/request') return send(await notifyRequest(fs, env, who.uid, body));
    if (p === '/m/wallet/withdraw') return send(await requestPayout(fs, who.uid, env, ctx));
    const staff = user.role === 'admin' || user.role === 'staff', admin = user.role === 'admin';
    if (!staff) throw new HttpError(403, 'ما عندكش صلاحية.');
    if ((m = p.match(/^\/a\/orders\/([A-Za-z0-9]{1,20})\/(confirm|reject|resolve)$/))) {
      if (m[2] === 'confirm') return send(await confirmOrder(fs, m[1], who.uid, env, ctx));
      if (m[2] === 'reject') { const slug = await releaseOrder(fs, m[1], 'rejected', clean(body.note, 300) || 'الدفع ما وصلش.', who.uid); purgeStore(slug); return send({ ok: true }); }
      if (!admin) throw new HttpError(403, 'حسم البلاغات للأدمن بس.');
      return send(await resolveOrder(fs, who.uid, m[1], body));
    }
    if (!admin) throw new HttpError(403, 'ما عندكش صلاحية.');
    if ((m = p.match(/^\/a\/payouts\/([A-Za-z0-9_-]{1,60})\/paid$/))) return send(await payoutPaid(fs, who.uid, m[1], body, env, ctx));
    if (p === '/a/maintenance') return send(await maintenance(env));
    if (p === '/a/mail/approved') return send(await mailApproved(fs, env, body));
    if (p === '/a/push/test') return send({ sent: await pushTo(fs, env, { uids: [who.uid] }, { title: 'تجربة الإشعارات ✅', body: 'الإشعارات شغالة على هذا الجهاز.', link: 'admin.html' }) });
    throw new HttpError(404, 'غير موجود.');
  } catch (e) { return errorResponse(e, h); }
}
function errorResponse(e, headers = {}) {
  if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status, headers);
  console.log('error', e?.stack || e);
  return json({ error: 'صار خطأ غير متوقع، جرّب مرة ثانية.' }, 500, headers);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const host = url.hostname.toLowerCase();
    const root = (env.ROOT_DOMAIN || 'malafy.net').toLowerCase();
    try {
      if (host === `api.${root}`) return await apiRoute(req, env, ctx, url);
      if (!host.endsWith('.' + root)) return simplePage('غير موجود', 'الرابط غير صحيح.');
      const slug = host.slice(0, -(root.length + 1));
      if (slug === 'www') return Response.redirect(`https://${root}${url.pathname}`, 301);
      if (!SLUG_RE.test(slug) || slug.includes('--') || RESERVED.includes(slug)) return simplePage('المتجر مش موجود', 'تأكد من الرابط.');
      return await storeRoute(req, env, ctx, slug, url, url.host);
    } catch (e) {
      if (url.pathname.startsWith('/api/')) return errorResponse(e);
      if (e instanceof HttpError) return simplePage('تعذر فتح المتجر', e.message, e.status);
      console.log('page error', e?.stack || e);
      return simplePage('تعذر فتح المتجر', 'صار خطأ، جرّب بعد شوية.', 500);
    }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(maintenance(env)); }
};
