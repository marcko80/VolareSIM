const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyG', 'KeyB', 'KeyC', 'KeyP', 'KeyR', 'KeyH', 'KeyZ',
  'KeyK', 'KeyM', 'KeyI', 'KeyL',
  'Space', 'ShiftLeft', 'ShiftRight', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
]);

function approach(v, target, rate) {
  return v < target ? Math.min(v + rate, target) : Math.max(v - rate, target);
}

/** zona morta + curva esponenziale per assi analogici */
function shape(v, dead = 0.08, expo = 1.5) {
  const a = Math.abs(v);
  if (a < dead) return 0;
  return Math.sign(v) * Math.pow((a - dead) / (1 - dead), expo);
}

export class Controls {
  /** actions: { camera, pause, reset, help, airport, mute, notify(text, detail) } */
  constructor(flight, actions) {
    this.flight = flight;
    this.actions = actions;
    this.keys = new Set();
    this.invertPitch = false;
    this.pad = null;
    this.prevButtons = [];
    this.prevThrAxis = null;

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!GAME_KEYS.has(e.code)) return;
      e.preventDefault();
      if (!this.keys.has(e.code)) this.keys.add(e.code);
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyF': flight.setFlaps(+1); break;
        case 'KeyG': flight.setFlaps(-1); break;
        case 'KeyC': actions.camera(); break;
        case 'KeyP': actions.pause(); break;
        case 'KeyR': actions.reset(); break;
        case 'KeyH': actions.help(); break;
        case 'KeyK': actions.airport(); break;
        case 'KeyM': actions.mute(); break;
        case 'KeyL': actions.lang(); break;
        case 'KeyI':
          this.invertPitch = !this.invertPitch;
          actions.notify('padAxis', this.invertPitch ? 'inverted' : 'normal');
          break;
        default:
          if (e.code.startsWith('Digit')) {
            const d = +e.code.slice(5);
            flight.throttle = d === 9 ? 1 : d / 10;
          }
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('gamepadconnected', (e) => {
      actions.notify('padConnected', e.gamepad.id.slice(0, 48), true);
    });
    window.addEventListener('gamepaddisconnected', () => { this.pad = null; });
  }

  /** legge il primo gamepad/joystick; ritorna { pitch, roll, rudder } o null */
  pollPad(dt) {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const gp = Array.from(pads).find((p) => p && p.connected);
    if (!gp) { this.pad = null; return null; }
    this.pad = gp;
    const f = this.flight;
    const ax = (i) => (gp.axes[i] !== undefined ? gp.axes[i] : 0);
    const btn = (i) => (gp.buttons[i] ? gp.buttons[i].pressed : false);
    const val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const edge = (i) => {
      const now = btn(i), was = !!this.prevButtons[i];
      this.prevButtons[i] = now;
      return now && !was;
    };
    const standard = gp.mapping === 'standard';
    const inv = this.invertPitch ? -1 : 1;
    const out = { pitch: 0, roll: 0, rudder: 0 };
    out.roll = shape(ax(0));
    out.pitch = shape(ax(1)) * inv; // barra indietro (+1) = cabra

    if (standard) {
      out.rudder = shape(ax(2));
      f.throttle += (val(7) - val(6)) * 0.5 * dt;                 // grilletti
      if (edge(12)) f.throttle += 0.1;                            // croce su/giù
      if (edge(13)) f.throttle -= 0.1;
      f.input.brake = f.input.brake || btn(0);                    // A
      if (edge(5)) f.setFlaps(+1);                                // RB / LB
      if (edge(4)) f.setFlaps(-1);
      if (edge(3)) this.actions.camera();                         // Y
      if (edge(2)) this.actions.reset();                          // X
      if (edge(9)) this.actions.pause();                          // Start
      if (edge(8)) this.actions.airport();                        // Back
    } else {
      // joystick classico (es. Logitech Extreme 3D): X, Y, torsione, manetta a cursore
      if (gp.axes.length >= 3) out.rudder = shape(ax(2));
      if (gp.axes.length >= 4) {
        const t = ax(3);
        if (this.prevThrAxis === null) this.prevThrAxis = t;
        if (Math.abs(t - this.prevThrAxis) > 0.02) {              // solo se mosso: non sovrascrive la tastiera
          f.throttle = (1 - t) / 2;
          this.prevThrAxis = t;
        }
      }
      f.input.brake = f.input.brake || btn(0);                    // grilletto
      if (edge(1)) this.actions.camera();
      if (edge(2)) f.setFlaps(+1);
      if (edge(3)) f.setFlaps(-1);
      if (edge(4)) f.throttle += 0.1;
      if (edge(5)) f.throttle -= 0.1;
      if (edge(8)) this.actions.pause();
      if (edge(9)) this.actions.reset();
      if (edge(10)) this.actions.airport();
    }
    return out;
  }

  update(dt) {
    const k = this.keys, f = this.flight, inp = f.input;
    const any = (...c) => c.some((x) => k.has(x));
    const tp = (any('KeyS', 'ArrowDown') ? 1 : 0) - (any('KeyW', 'ArrowUp') ? 1 : 0);
    const tr = (any('KeyD', 'ArrowRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft') ? 1 : 0);
    const ty = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    const rate = (t, v) => dt * (t === 0 ? 5 : (Math.sign(t) === Math.sign(v) || v === 0 ? 3 : 7));
    this.kp = approach(this.kp || 0, tp, rate(tp, this.kp || 0));
    this.kr = approach(this.kr || 0, tr, rate(tr, this.kr || 0));
    this.ky = approach(this.ky || 0, ty, rate(ty, this.ky || 0));
    inp.brake = k.has('KeyB') || k.has('Space');

    if (any('ShiftLeft', 'ShiftRight', 'PageUp')) f.throttle += 0.4 * dt;
    if (any('KeyZ', 'PageDown')) f.throttle -= 0.4 * dt;

    const pad = this.pollPad(dt);
    inp.pitch = pad && pad.pitch !== 0 ? pad.pitch : this.kp;
    inp.roll = pad && pad.roll !== 0 ? pad.roll : this.kr;
    inp.rudder = pad && pad.rudder !== 0 ? pad.rudder : this.ky;
    f.throttle = Math.min(1, Math.max(0, f.throttle));
  }
}
