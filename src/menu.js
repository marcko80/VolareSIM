import { t, onLangChange } from './i18n.js';

/**
 * Menù a discesa (☰ in alto a sinistra): velivolo, aeroporto, partenza, camera, qualità, vento, turbolenza, termiche,
 * audio, pannello comandi, lingua. Le scelte si ricordano tra una sessione e l'altra (localStorage).
 * api: { get(key) → valore corrente, set(key, valore) }
 */
const $ = (id) => document.getElementById(id);

export function createMenu({ aircraft, airports, cameras, qualities, get, set, reset }) {
  const root = $('menu'), btn = $('menuBtn');
  const rows = [];

  const row = (label, control, id) => {
    const r = document.createElement('label');
    r.className = 'mrow'; r.dataset.row = id;
    const s = document.createElement('span'); s.dataset.label = label;
    r.append(s, control);
    root.appendChild(r);
    rows.push({ r, s, id });
    return r;
  };
  const select = (id, key, options) => {
    const el = document.createElement('select'); el.id = 'm-' + id;
    el.addEventListener('change', () => { set(key, el.value); el.blur(); });
    el.opts = options;
    return el;
  };
  const range = (id, key, min, max, step, fmt) => {
    const w = document.createElement('div'); w.className = 'mrange';
    const el = document.createElement('input'); el.type = 'range'; el.min = min; el.max = max; el.step = step; el.id = 'm-' + id;
    const v = document.createElement('b');
    el.addEventListener('input', () => { v.textContent = fmt(+el.value); set(key, +el.value); });
    el.addEventListener('change', () => el.blur());
    w.append(el, v); w.el = el; w.v = v; w.fmt = fmt;
    return w;
  };
  const check = (id, key) => {
    const el = document.createElement('input'); el.type = 'checkbox'; el.id = 'm-' + id;
    el.addEventListener('change', () => { set(key, el.checked); el.blur(); });
    return el;
  };
  const button = (id, fn) => {
    const el = document.createElement('button'); el.type = 'button'; el.id = 'm-' + id; el.className = 'mbtn';
    el.addEventListener('click', () => { fn(); el.blur(); });
    return el;
  };
  const head = (labelKey) => { const h = document.createElement('div'); h.className = 'mhead'; h.dataset.t = labelKey; root.appendChild(h); rows.push({ h, id: 'h' }); };

  head('mSecFlight');
  const sAc = select('aircraft', 'aircraft', aircraft); row('mAircraft', sAc, 'aircraft');
  const sApt = select('airport', 'airport', airports); row('mAirport', sApt, 'airport');
  const sStart = select('start', 'start', [['rwy', 'startRwy'], ['500', 'a500'], ['1000', 'a1000'], ['1500', 'a1500'], ['2000', 'a2000'], ['3000', 'a3000']]); row('mStart', sStart, 'start');
  const sCam = select('camera', 'camera', cameras); row('mCamera', sCam, 'camera');
  const bReset = button('reset', reset); row('mReset', bReset, 'reset');
  head('mSecWeather');
  const rW = range('wind', 'windKt', 0, 35, 1, (v) => (v === 0 ? t('calm') : v + ' kt')); row('mWindSpeed', rW, 'wind');
  const rD = range('dir', 'windDir', 0, 359, 5, (v) => String(v).padStart(3, '0') + '°'); row('mWindDir', rD, 'dir');
  const rT = range('turb', 'turb', 0, 100, 5, (v) => v + '%'); row('mTurb', rT, 'turb');
  const cTh = check('thermals', 'thermals'); row('mThermals', cTh, 'thermals');
  head('mSecOptions');
  const sQ = select('quality', 'quality', qualities); row('mQuality', sQ, 'quality');
  const cSnd = check('sound', 'sound'); row('mSound', cSnd, 'sound');
  const cHelp = check('help', 'help'); row('mHelp', cHelp, 'help');
  const bLang = button('lang', () => set('lang', null)); row('mLang', bLang, 'lang');

  function fillSelect(el, cur) {
    const keep = cur ?? el.value;
    el.textContent = '';
    for (const [v, k, raw] of el.opts) { const o = document.createElement('option'); o.value = v; o.textContent = raw ? k : t(k); el.appendChild(o); }
    el.value = keep;
  }
  function sync() {
    fillSelect(sAc, String(get('aircraft'))); fillSelect(sApt, String(get('airport'))); fillSelect(sStart, get('start'));
    fillSelect(sCam, String(get('camera'))); fillSelect(sQ, String(get('quality')));
    rW.el.value = get('windKt'); rW.v.textContent = rW.fmt(+rW.el.value);
    rD.el.value = get('windDir'); rD.v.textContent = rD.fmt(+rD.el.value);
    rT.el.value = get('turb'); rT.v.textContent = rT.fmt(+rT.el.value);
    cTh.checked = !!get('thermals'); cSnd.checked = !!get('sound'); cHelp.checked = !!get('help');
    bLang.textContent = get('langName');
    bReset.textContent = t('mReset');
    for (const o of rows) { if (o.s) o.s.textContent = t(o.s.dataset.label); if (o.h) o.h.textContent = t(o.h.dataset.t); }
    // le termiche contano solo per l'aliante
    rows.find((o) => o.id === 'thermals').r.classList.toggle('dim', get('aircraft') !== 'glider');
    rows.find((o) => o.id === 'start').r.classList.remove('dim');
  }
  function toggle(open) {
    const on = open ?? root.classList.contains('hidden');
    root.classList.toggle('hidden', !on);
    btn.classList.toggle('on', on);
    if (on) sync();
  }
  btn.addEventListener('click', (e) => { toggle(); e.currentTarget.blur(); });
  window.addEventListener('pointerdown', (e) => { if (!root.classList.contains('hidden') && !root.contains(e.target) && e.target !== btn && !btn.contains(e.target)) toggle(false); });
  onLangChange(() => sync());
  sync();
  return { sync, toggle };
}
