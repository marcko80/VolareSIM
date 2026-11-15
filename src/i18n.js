// Traduzioni IT / EN. La lingua è scelta dal browser e ricordata (tasto L o pulsante in alto a sinistra).
const DICT = {
  it: {
    speed: 'VELOCITÀ', alt: 'QUOTA', vs: 'V/S', hdg: 'PRUA', agl: 'AGL', thr: 'MANETTA', flap: 'FLAP', brake: 'FRENI',
    helpTitle: 'COMANDI',
    kPitch: 'Picchia / Cabra', kRoll: 'Rollio sx / dx', kRudder: 'Pedaliera sx / dx', kThrottle: 'Manetta + / −',
    kThrottleDirect: 'Manetta 0–90% (9 = 100%)', kFlaps: 'Flap giù / su', kBrakes: 'Freni / aerofreni in volo',
    kCamera: 'Camera: inseguimento, cockpit, torre, orbita', kMouse: 'Guarda attorno / orbita · rotella: zoom', kQuality: 'Qualità grafica (bassa/media/alta)', kAirport: 'Cambia aeroporto',
    kPause: 'Pausa / riparti', kAudio: 'Audio on / off', kInvert: 'Inverti asse beccheggio joystick',
    kLang: 'Lingua IT / EN', kHelp: 'Mostra / nascondi aiuto', kMouseKey: 'Mouse (trascina)',
    padTitle: 'JOYSTICK / GAMEPAD',
    pad1: 'Stick: beccheggio e rollio · stick dx o torsione: pedaliera',
    pad2: 'Grilletti RT/LT o cursore: manetta · A o grilletto: freni',
    pad3: 'RB/LB: flap · Y: camera · X: riparti · Start: pausa · Back: aeroporto',
    on: 'ON',
    wPause: 'PAUSA', wStall: 'STALLO', wStallWarn: 'ATTENZIONE STALLO', wTerrain: 'TERRENO — TIRA',
    ready: 'Manetta al massimo (9), a 55 kt tira dolcemente (S)',
    landSoft: 'Atterraggio morbido', landGood: 'Atterraggio buono', landHard: 'Atterraggio duro',
    offRunway: 'fuori pista',
    crash: 'INCIDENTE', pressR: 'premi R per ripartire',
    cTerrain: 'Impatto contro il terreno', cHard: 'Impatto violento', cWing: 'Ala toccata a terra', cControl: 'Atterraggio fuori controllo',
    camera: 'Camera', camChase: 'Inseguimento', camCockpit: 'Cockpit', camTower: 'Torre', camOrbit: 'Orbita',
    quality: 'Qualità grafica', qLow: 'Bassa', qMed: 'Media', qHigh: 'Alta', loading: 'Caricamento…',
    audio: 'Audio', audioOff: 'disattivato', audioOn: 'attivo',
    padConnected: 'Joystick collegato', padAxis: 'Asse beccheggio joystick', inverted: 'invertito', normal: 'normale',
    language: 'Lingua', langName: 'Italiano',
    gASI: 'ANEMOMETRO kt', gAI: 'ORIZZONTE', gALT: 'ALTIMETRO ft', gRPM: 'GIRI x100', gHDG: 'PRUA', gVSI: 'V/S ft/min',
    compass: 'NESO', flapShort: 'FLAP',
    menu: 'Menu', mSecFlight: 'VOLO', mSecWeather: 'METEO', mSecOptions: 'OPZIONI',
    mAircraft: 'Velivolo', mAirport: 'Aeroporto', mStart: 'Partenza', mCamera: 'Camera', mReset: 'Riparti', mQuality: 'Qualità grafica',
    mWindSpeed: 'Vento', mWindDir: 'Provenienza', mTurb: 'Turbolenza', mThermals: 'Termiche (aliante)', mSound: 'Audio', mHelp: 'Mostra comandi', mLang: 'Lingua',
    ac_c172: 'Cessna 172', ac_mb339: 'MB-339 Frecce Tricolori', ac_glider: 'Grob G 103C Twin III Acro I-IVVQ',
    startRwy: 'In pista', a500: 'In volo: 500 m', a1000: 'In volo: 1000 m', a1500: 'In volo: 1500 m', a2000: 'In volo: 2000 m', a3000: 'In volo: 3000 m',
    calm: 'calmo', wind: 'VENTO', vario: 'VARIO',
    kTow: 'Aliante: sgancia il traino', kMenu: 'Apri / chiudi il menu',
    readyJet: 'Manetta al massimo (9), a 120 kt tira dolcemente (S); B in volo = aerofreno',
    readyGlider: 'Traino attivo: tieni circa 60 kt, sgancio automatico a 500 m (T). B in volo = aerofreni',
    readyAir: 'In volo sopra il rilievo: cerca le termiche (cumuli) e il vento sui versanti',
    released: 'Traino sganciato', thermalCue: 'Termica', msgAircraft: 'Velivolo',
  },
  en: {
    speed: 'AIRSPEED', alt: 'ALTITUDE', vs: 'V/S', hdg: 'HEADING', agl: 'AGL', thr: 'THROTTLE', flap: 'FLAPS', brake: 'BRAKES',
    helpTitle: 'CONTROLS',
    kPitch: 'Pitch down / up', kRoll: 'Roll left / right', kRudder: 'Rudder left / right', kThrottle: 'Throttle + / −',
    kThrottleDirect: 'Throttle 0–90% (9 = 100%)', kFlaps: 'Flaps down / up', kBrakes: 'Brakes / airbrakes in flight',
    kCamera: 'Camera: chase, cockpit, tower, orbit', kMouse: 'Look around / orbit · wheel: zoom', kQuality: 'Graphics quality (low/medium/high)', kAirport: 'Change airport',
    kPause: 'Pause / restart', kAudio: 'Sound on / off', kInvert: 'Invert joystick pitch axis',
    kLang: 'Language IT / EN', kHelp: 'Show / hide help', kMouseKey: 'Mouse (drag)',
    padTitle: 'JOYSTICK / GAMEPAD',
    pad1: 'Stick: pitch and roll · right stick or twist: rudder',
    pad2: 'RT/LT triggers or slider: throttle · A or trigger: brakes',
    pad3: 'RB/LB: flaps · Y: camera · X: restart · Start: pause · Back: airport',
    on: 'ON',
    wPause: 'PAUSED', wStall: 'STALL', wStallWarn: 'STALL WARNING', wTerrain: 'TERRAIN — PULL UP',
    ready: 'Full throttle (9), at 55 kt pull back gently (S)',
    landSoft: 'Smooth landing', landGood: 'Good landing', landHard: 'Hard landing',
    offRunway: 'off runway',
    crash: 'CRASH', pressR: 'press R to restart',
    cTerrain: 'Flew into terrain', cHard: 'Violent impact', cWing: 'Wing struck the ground', cControl: 'Uncontrolled landing',
    camera: 'Camera', camChase: 'Chase', camCockpit: 'Cockpit', camTower: 'Tower', camOrbit: 'Orbit',
    quality: 'Graphics quality', qLow: 'Low', qMed: 'Medium', qHigh: 'High', loading: 'Loading…',
    audio: 'Sound', audioOff: 'off', audioOn: 'on',
    padConnected: 'Joystick connected', padAxis: 'Joystick pitch axis', inverted: 'inverted', normal: 'normal',
    language: 'Language', langName: 'English',
    gASI: 'AIRSPEED kt', gAI: 'ATTITUDE', gALT: 'ALTIMETER ft', gRPM: 'RPM x100', gHDG: 'HEADING', gVSI: 'V/S ft/min',
    compass: 'NESW', flapShort: 'FLAPS',
    menu: 'Menu', mSecFlight: 'FLIGHT', mSecWeather: 'WEATHER', mSecOptions: 'OPTIONS',
    mAircraft: 'Aircraft', mAirport: 'Airport', mStart: 'Start', mCamera: 'Camera', mReset: 'Restart', mQuality: 'Graphics quality',
    mWindSpeed: 'Wind', mWindDir: 'From', mTurb: 'Turbulence', mThermals: 'Thermals (glider)', mSound: 'Sound', mHelp: 'Show controls', mLang: 'Language',
    ac_c172: 'Cessna 172', ac_mb339: 'MB-339 Frecce Tricolori', ac_glider: 'Grob G 103C Twin III Acro I-IVVQ',
    startRwy: 'On the runway', a500: 'Airborne: 500 m', a1000: 'Airborne: 1000 m', a1500: 'Airborne: 1500 m', a2000: 'Airborne: 2000 m', a3000: 'Airborne: 3000 m',
    calm: 'calm', wind: 'WIND', vario: 'VARIO',
    kTow: 'Glider: release the tow', kMenu: 'Open / close the menu',
    readyJet: 'Full throttle (9), at 120 kt pull back gently (S); B in flight = airbrake',
    readyGlider: 'Tow active: hold about 60 kt, automatic release at 500 m (T). B in flight = airbrakes',
    readyAir: 'Airborne over the ridge: look for thermals (cumulus) and slope wind',
    released: 'Tow released', thermalCue: 'Thermal', msgAircraft: 'Aircraft',
  },
};

let lang = 'en';
try {
  const saved = localStorage.getItem('volaresim.lang');
  lang = saved === 'it' || saved === 'en' ? saved : (navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';
} catch { /* localStorage non disponibile */ }

const listeners = [];

export const t = (key) => DICT[lang][key] ?? DICT.en[key] ?? key;
export const getLang = () => lang;
export const onLangChange = (fn) => listeners.push(fn);

/** applica le traduzioni agli elementi con data-i18n */
export function applyStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  const b = document.getElementById('lang');
  if (b) b.textContent = lang.toUpperCase();
}

export function setLang(l) {
  lang = l;
  try { localStorage.setItem('volaresim.lang', l); } catch { /* ignora */ }
  applyStatic();
  listeners.forEach((fn) => fn(l));
}
export const toggleLang = () => setLang(lang === 'it' ? 'en' : 'it');
