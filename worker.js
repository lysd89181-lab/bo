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
const STORE_FIELDS = ['ownerId', 'slug', 'name', 'country', 'currency', 'status', 'suspended', 'design', 'sections', 'info', 'categories', 'logoV', 'coverV', 'launchedAt', 'updatedAt'];
const ITEM_FIELDS = ['type', 'name', 'desc', 'cat', 'active', 'featured', 'order', 'imgV', 'note', 'productIds', 'durations', 'productId', 'price', 'maxQty', 'mode', 'prices', 'packs', 'fields', 'stock', 'maxMonths', 'countries', 'numbers', 'updatedAt'];
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
    const body = b64urlStr(JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
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
  return { uid: pay.sub, email: pay.email || '' };
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
  return all.filter(m => m.active !== false && Array.isArray(m.useFor) && m.useFor.includes('store'))
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
  const o = { id: it.id, type: it.type, name: clean(it.name, 80), desc: clean(it.desc, 800), cat: clean(it.cat, 30), featured: it.featured === true, order: num(it.order), note: clean(it.note, 300), img: it.imgV ? `/img/i/${it.id}?v=${int(it.imgV)}` : '' };
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
      pay: { methods, fees: (ctx.platform.storeFees?.[cur] || DEFAULT_FEES).map(t => ({ upTo: num(t.upTo), rate: num(t.rate) })), completeHours: completeHours(ctx.platform) }
    };
  });
}
const completeHours = p => Math.min(168, Math.max(1, int(p?.completeHours) || 24));
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
async function createOrder(req, env, fs, slug) {
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
      outLines.push({ itemId: it.id, type: it.type, name: nm, opt, qty: l.qty, unit, total: round2(unit * l.qty), status: 'pending', ...extra });
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
      tokenHash, ipHash, log: [{ s: 'awaiting', at: now }]
    };
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
  return json({ ok: true, id: result.id, token, total: result.total, payAmount: result.payAmount, payCurrency: result.payCurrency }, 201);
}

/* ===================== الطلبات: عرض الزبون ===================== */
async function orderForCustomer(req, fs, slug, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, 'الطلب مش موجود.');
  const tok = req.headers.get('x-order-token') || '';
  const o = await fs.get(`orders/${id}`);
  if (!o || !tok || !safeEq(await sha256hex(tok), o.tokenHash)) throw new HttpError(404, 'الطلب مش موجود أو الرابط ناقص.');
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
  const ch = completeHours(p) * 3600e3;
  return {
    id: o.id, status: o.status, createdAt: o.createdAt, paidAt: o.paidAt || 0, deliveredAt: o.deliveredAt || 0, completedAt: o.completedAt || 0,
    currency: o.currency, subtotal: o.subtotal, fee: o.fee, feeRate: o.feeRate, total: o.total, payCurrency: o.payCurrency, payAmount: o.payAmount,
    method: o.method?.name || '', reference: o.reference, customer: { name: o.customer?.name || '' },
    items: o.items.map((x, i) => ({ name: x.name, opt: x.opt, qty: x.qty, total: x.total, type: x.type, status: x.status, input: x.input || [], lines: (lines.find(l => l.line === i)?.items || []).map(y => ({ l: y.l, v: y.v })) })),
    note: o.status === 'rejected' || o.status === 'cancelled' ? (o.adminNote || '') : '',
    problem: o.problem ? { text: o.problem.text, reply: o.problem.reply || '', at: o.problem.at } : null,
    resolution: o.resolution ? { action: o.resolution.action, note: o.resolution.note || '' } : null,
    autoAt: o.status === 'delivered' ? (o.autoAt || (o.deliveredAt + ch)) : 0,
    canReceive: ['delivered', 'problem'].includes(o.status),
    canReport: o.status === 'preparing' || (o.status === 'delivered' && Date.now() < (o.deliveredAt || 0) + ch),
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
async function confirmOrder(fs, id, by) {
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
      deliveredAt: allDone ? now : null, autoAt: allDone ? now + completeHours(p) * 3600e3 : null,
      log: [...(o.log || []), { s: 'paid', at: now, by }, ...(status !== 'preparing' ? [{ s: status, at: now, by: 'system' }] : [])].slice(-30)
    };
    if (failed) upd.problem = { text: 'تعذر تسليم بعض المنتجات تلقائياً (المخزون تغيّر). المتجر يسلّمها يدوياً أو الإدارة ترجع المبلغ.', at: now, by: 'system' };
    W.push(fs.wUpdate(`orders/${id}`, upd));
    if (secrets.length) W.push(fs.wSet(`orderSecrets/${id}`, { storeId: sid, lines: secrets, updatedAt: now }));
    const wal = w || walletInit(sid, store || { currency: o.currency }, now);
    const nw = { pending: round2(num(wal.pending) + o.subtotal), updatedAt: now };
    W.push(w ? fs.wUpdate(`wallets/${sid}`, nw) : fs.wCreate(`wallets/${sid}`, { ...wal, ...nw }));
    ledger(fs, W, o, 'hold', o.subtotal, 'طلب مدفوع (معلّق لين الاستلام)', now);
    return { status, slug: o.slug, pending, failed };
  });
  await purgeStore(out.slug);
  return out;
}

/* ===================== التاجر: تسليم يدوي ورد على البلاغ ===================== */
async function merchantDeliver(fs, uid, id, body) {
  const idx = int(body.idx), text = clean(body.text, 1500);
  if (!text) throw new HttpError(400, 'اكتب رسالة التسليم (مثلاً: تم الشحن، أو الكود).');
  return fs.tx(async (tx, W) => {
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
      Object.assign(upd, { status: 'delivered', deliveredAt: now, autoAt: now + completeHours(p) * 3600e3, log: [...(o.log || []), { s: 'delivered', at: now, by: uid }].slice(-30) });
    }
    W.push(fs.wUpdate(`orders/${id}`, upd));
    return { status: upd.status || o.status };
  });
}
async function merchantReply(fs, uid, id, body) {
  const text = clean(body.text, 800);
  if (!text) throw new HttpError(400, 'اكتب ردك.');
  return fs.tx(async (tx, W) => {
    const o = await fs.get(`orders/${id}`, { tx });
    if (!o || o.storeId !== uid) throw new HttpError(404, 'الطلب مش موجود.');
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
    if (amount > 0) {
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
async function payoutPaid(fs, uid, id, body) {
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
  return done;
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
  if (p === '/api/orders' && method === 'POST') return createOrder(req, env, fs, slug);
  let m = p.match(/^\/api\/orders\/([A-Za-z0-9]{1,20})$/);
  if (m && method === 'GET') { const o = await orderForCustomer(req, fs, slug, m[1]); return json(await customerView(fs, o, slug)); }
  m = p.match(/^\/api\/orders\/([A-Za-z0-9]{1,20})\/(received|problem)$/);
  if (m && method === 'POST') {
    const o = await orderForCustomer(req, fs, slug, m[1]);
    if (m[2] === 'received') {
      if (!['delivered', 'problem'].includes(o.status)) throw new HttpError(409, 'الطلب لسه ما تسلّمش.');
      await completeOrder(fs, o.id, 'customer');
    } else {
      const body = await readJson(req, 4000);
      const text = clean(body.text, 600);
      if (text.length < 5) throw new HttpError(400, 'اشرح المشكلة باختصار.');
      const ch = completeHours(await platformOf(fs)) * 3600e3;
      await fs.tx(async (tx, W) => {
        const x = await fs.get(`orders/${o.id}`, { tx });
        const can = x.status === 'preparing' || (x.status === 'delivered' && Date.now() < num(x.deliveredAt) + ch);
        if (!can) throw new HttpError(409, x.status === 'problem' ? 'فيه بلاغ مفتوح على الطلب.' : 'مدة البلاغ انتهت.');
        const now = Date.now();
        W.push(fs.wUpdate(`orders/${o.id}`, { status: 'problem', autoAt: null, problem: { text, at: now, by: 'customer' }, updatedAt: now, log: [...(x.log || []), { s: 'problem', at: now, by: 'customer' }].slice(-30) }));
      });
    }
    return json(await customerView(fs, { ...(await fs.get(`orders/${o.id}`)), id: o.id }, slug));
  }
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
    const auth = req.headers.get('authorization') || '';
    const who = await verifyIdToken(auth.replace(/^Bearer\s+/i, ''), fs.pid);
    const user = await fs.get(`users/${who.uid}`, { mask: ['role', 'status'] });
    if (!user || user.status === 'deleted') throw new HttpError(403, 'ما عندكش صلاحية.');
    const body = await readJson(req, 20000);
    const p = url.pathname;
    let m;
    if ((m = p.match(/^\/m\/orders\/([A-Za-z0-9]{1,20})\/(deliver|reply)$/))) {
      return send(m[2] === 'deliver' ? await merchantDeliver(fs, who.uid, m[1], body) : await merchantReply(fs, who.uid, m[1], body));
    }
    const staff = user.role === 'admin' || user.role === 'staff', admin = user.role === 'admin';
    if (!staff) throw new HttpError(403, 'ما عندكش صلاحية.');
    if ((m = p.match(/^\/a\/orders\/([A-Za-z0-9]{1,20})\/(confirm|reject|resolve)$/))) {
      if (m[2] === 'confirm') return send(await confirmOrder(fs, m[1], who.uid));
      if (m[2] === 'reject') { const slug = await releaseOrder(fs, m[1], 'rejected', clean(body.note, 300) || 'الدفع ما وصلش.', who.uid); purgeStore(slug); return send({ ok: true }); }
      if (!admin) throw new HttpError(403, 'حسم البلاغات للأدمن بس.');
      return send(await resolveOrder(fs, who.uid, m[1], body));
    }
    if (!admin) throw new HttpError(403, 'ما عندكش صلاحية.');
    if ((m = p.match(/^\/a\/payouts\/([A-Za-z0-9_-]{1,60})\/paid$/))) return send(await payoutPaid(fs, who.uid, m[1], body));
    if (p === '/a/maintenance') return send(await maintenance(env));
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
