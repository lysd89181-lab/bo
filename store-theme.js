// ملفي — نظام تصميم المتاجر (مشترك بين المتجر ومحرر التاجر)

export const TEMPLATES = {
  pulse: { name: 'Pulse', desc: 'ألعاب، داكن ونيون', mode: 'dark', palette: 'royal', card: 'grid', corner: 'round' },
  clean: { name: 'Clean', desc: 'بسيط وفاتح', mode: 'light', palette: 'ocean', card: 'list', corner: 'soft' },
  pop: { name: 'Pop', desc: 'جريء وملوّن', mode: 'light', palette: 'sunset', card: 'grid', corner: 'round' },
  luxe: { name: 'Luxe', desc: 'فاخر، أسود وذهبي', mode: 'dark', palette: 'gold', card: 'large', corner: 'sharp' },
  nova: { name: 'Nova', desc: 'عصري بتدرجات', mode: 'dark', palette: 'sky', card: 'grid', corner: 'soft' },
  nature: { name: 'Nature', desc: 'هادئ وطبيعي', mode: 'light', palette: 'emerald', card: 'list', corner: 'soft' }
};
export const PALETTES = {
  malafy: ['#F59E0B', '#2BB3A8', 'ذهبي فيروزي'], ocean: ['#0EA5E9', '#22D3EE', 'محيط'], emerald: ['#10B981', '#14B8A6', 'زمرد'], royal: ['#7C5CFF', '#22D3EE', 'ملكي'], sunset: ['#F97316', '#EC4899', 'غروب'],
  ruby: ['#E11D48', '#9F1239', 'ياقوت'], sky: ['#60A5FA', '#6366F1', 'سماء'], mint: ['#34D399', '#0EA5E9', 'نعناع'], gold: ['#D4AF37', '#8B6B1F', 'ذهبي'], mono: ['#111827', '#6B7280', 'أبيض وأسود']
};
export const FONTS = [['IBM Plex Sans Arabic', 'IBM Plex'], ['Cairo', 'Cairo'], ['Tajawal', 'Tajawal'], ['Almarai', 'Almarai'], ['Noto Kufi Arabic', 'Noto Kufi'], ['Readex Pro', 'Readex']];
export const CARDS = [['grid', 'شبكة'], ['list', 'قائمة'], ['large', 'كبيرة']];
export const CORNERS = [['sharp', 'حاد'], ['soft', 'ناعم'], ['round', 'دائري']];
export const SECTIONS = [['announce', 'شريط الإعلان'], ['hero', 'الغلاف'], ['cats', 'الأقسام'], ['featured', 'المميزة'], ['all', 'كل المنتجات'], ['about', 'من نحن'], ['faq', 'أسئلة شائعة'], ['policy', 'سياسة الاسترجاع']];
export const CAT_ICONS = [['tv', 'اشتراكات'], ['pad', 'ألعاب'], ['gem', 'شحن'], ['card', 'بطاقات'], ['sim', 'أرقام'], ['bolt', 'خدمات'], ['star', 'مميز'], ['gift', 'هدايا']];
const MODES = {
  dark: { bg: '#0B0F1E', surface: '#141A2E', surface2: '#1C2440', text: '#EEF1FA', muted: '#9AA3BF', line: 'rgba(255,255,255,.09)' },
  light: { bg: '#F6F7FB', surface: '#FFFFFF', surface2: '#EEF0F6', text: '#141829', muted: '#5B6380', line: 'rgba(20,24,41,.10)' }
};
const TPL_MODE = { luxe: { dark: { bg: '#0A0A0A', surface: '#151515', surface2: '#1F1F1F' } }, nature: { light: { bg: '#F2F5EF', surface: '#FFFFFF', surface2: '#E8EEE3' } }, pop: { light: { bg: '#FFF7EE', surface: '#FFFFFF', surface2: '#FFEBD6' } } };

// يكمّل التصميم بالقيم الافتراضية ويرفض أي قيمة غريبة
export function normDesign(d = {}) {
  const t = TEMPLATES[d.template] ? d.template : 'pulse', T = TEMPLATES[t];
  return {
    template: t,
    palette: PALETTES[d.palette] ? d.palette : T.palette,
    color: /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : '',
    font: FONTS.some(f => f[0] === d.font) ? d.font : 'IBM Plex Sans Arabic',
    card: CARDS.some(c => c[0] === d.card) ? d.card : T.card,
    corner: CORNERS.some(c => c[0] === d.corner) ? d.corner : T.corner,
    mode: d.mode === 'light' || d.mode === 'dark' ? d.mode : T.mode
  };
}
export function normSections(list) {
  const out = [], seen = new Set();
  (Array.isArray(list) ? list : []).forEach(x => { if (SECTIONS.some(s => s[0] === x?.id) && !seen.has(x.id)) { seen.add(x.id); out.push({ id: x.id, on: x.on !== false }); } });
  SECTIONS.forEach(([id]) => { if (!seen.has(id)) out.push({ id, on: true }); });
  return out;
}
const hex2rgb = h => { h = h.replace('#', ''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = h => { const [r, g, b] = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
export const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
export function colorsOf(design) {
  const s = normDesign(design);
  const m = { ...MODES[s.mode], ...(TPL_MODE[s.template]?.[s.mode] || {}) };
  let [pri, sec] = s.color ? [s.color, mix(s.color, s.mode === 'dark' ? '#FFFFFF' : '#000000', .35)] : PALETTES[s.palette];
  if (s.palette === 'mono' && !s.color && s.mode === 'dark') { pri = '#F3F4F6'; sec = '#9CA3AF'; }
  const ink = contrast(pri, '#FFFFFF') >= 3 ? '#FFFFFF' : '#14110A';
  let priT = pri, k = 0;
  while (contrast(priT, m.bg) < 4.5 && k < 12) { priT = mix(priT, s.mode === 'dark' ? '#FFFFFF' : '#000000', .15); k++; }
  return { ...m, pri, sec, ink, priT, s };
}
// متغيرات CSS للمتجر: أي لون يختاره التاجر يطلع مقروء
export function storeTokens(design) {
  const c = colorsOf(design), s = c.s, dark = s.mode === 'dark';
  return `--s-bg:${c.bg};--s-surface:${c.surface};--s-surface2:${c.surface2};--s-text:${c.text};--s-muted:${c.muted};--s-line:${c.line};--s-pri:${c.pri};--s-sec:${c.sec};--s-ink:${c.ink};--s-pri-t:${c.priT};--s-ok-t:${dark ? '#4ADE80' : '#15803D'};--s-warn-t:${dark ? '#FCD34D' : '#B45309'};--s-bad-t:${dark ? '#FCA5A5' : '#B91C1C'};--s-font:'${s.font}',system-ui,-apple-system,'Segoe UI',sans-serif;--s-r:${{ sharp: '6px', soft: '14px', round: '20px' }[s.corner]};--s-br:${{ sharp: '6px', soft: '12px', round: '999px' }[s.corner]};color-scheme:${s.mode};`;
}
export const fontHref = f => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;

export const PATHS = {
  back: '<path d="M9 6l6 6-6 6"/>', cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.3"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4M10 9l4 2-4 2z"/>', pad: '<path d="M7 9h4M9 7v4M15 10h.01M17.5 8.5h.01"/><path d="M6.5 5h11A4.5 4.5 0 0 1 22 9.5v4A4.5 4.5 0 0 1 17.5 18c-1.4 0-2.3-.7-3-1.6l-.6-.8H10l-.6.8C8.8 17.3 7.9 18 6.5 18A4.5 4.5 0 0 1 2 13.5v-4A4.5 4.5 0 0 1 6.5 5Z"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/>', card: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
  sim: '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><rect x="8.5" y="11" width="7" height="6.5" rx="1"/><path d="M12 11v6.5M8.5 14.2h7"/>', bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>', gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-4-5-1.5S10 8 12 8Zm0 0c1.5-3 5-4 5-1.5S14 8 12 8Z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>', wa: '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20l1.2-4.2A8.5 8.5 0 1 1 20.5 11.5Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>', shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>', receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>', share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  insta: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>', tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.5 2.5 4.5 5 4.5"/>',
  fb: '<path d="M14 21v-8h3l.5-3.5H14V7.8c0-1 .3-1.8 1.8-1.8H18V3a24 24 0 0 0-2.7-.1C12.6 2.9 11 4.5 11 7.4v2.1H8V13h3v8"/>', tg: '<path d="m21 4-18 7 6 2 2 6 3-4 5 4z"/><path d="m9 13 9-6"/>',
  snap: '<path d="M12 3c3 0 5 2.2 5 5v3l2 1-2 1c0 1 1.5 2 3 2.5-1 1-2.5 1-3 1.5L16 20c-1.5-.5-2.5 0-4 0s-2.5-.5-4 0l-1-3c-.5-.5-2-.5-3-1.5C5.5 15 7 14 7 13l-2-1 2-1V8c0-2.8 2-5 5-5Z"/>', xs: '<path d="M4 4l16 16M20 4 4 20"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>'
};
export const ic = (n, sw = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n] || ''}</svg>`;
export const TYPE_ICON = { account: 'tv', code: 'gem', number: 'sim', manual: 'bolt' };
