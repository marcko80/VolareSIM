/**
 * Suoni sintetizzati con WebAudio: motore a 4 cilindri (frequenza legata ai giri),
 * elica, vento, rotolamento sulle ruote, cicalino di stallo, tonfo dell'atterraggio.
 * Il contesto audio parte alla prima interazione (richiesto dai browser).
 */
export class SimAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.rpm = 700;
    this.inside = false;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.room = ctx.createBiquadFilter(); // più cupo fuori dall'abitacolo
    this.room.type = 'lowpass';
    this.room.frequency.value = 1800;
    this.room.connect(this.master);
    this.master.connect(ctx.destination);

    // rumore bianco
    const len = ctx.sampleRate * 2;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    const noise = (type, freq, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = nb; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.room);
      src.start();
      return { f, g };
    };

    // motore: tre oscillatori -> passa basso
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600; this.engFilter.Q.value = 1.2;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0.2;
    this.engFilter.connect(this.engGain); this.engGain.connect(this.room);
    this.oscs = [['sawtooth', 1, 0.5], ['sawtooth', 2.004, 0.28], ['square', 0.5, 0.45]].map(([type, mul, gain]) => {
      const o = ctx.createOscillator(); o.type = type;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g); g.connect(this.engFilter); o.start();
      return { o, mul };
    });
    // lieve variazione di combustione (tremolo)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5;
    const lg = ctx.createGain(); lg.gain.value = 0.04;
    lfo.connect(lg); lg.connect(this.engGain.gain); lfo.start();

    this.prop = noise('bandpass', 900, 0.8);
    this.wind = noise('lowpass', 500, 0.5);
    this.roll = noise('lowpass', 220, 0.7);
    this.jet = noise('bandpass', 900, 0.5);
    // sibilo della turbina e variometro dell'aliante
    this.whine = ctx.createOscillator(); this.whine.type = 'sine'; this.whine.frequency.value = 1500;
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain); this.whineGain.connect(this.room); this.whine.start();
    this.vOsc = ctx.createOscillator(); this.vOsc.type = 'sine'; this.vOsc.frequency.value = 600;
    this.vGain = ctx.createGain(); this.vGain.gain.value = 0;
    this.vOsc.connect(this.vGain); this.vGain.connect(this.master); this.vOsc.start();

    // cicalino di stallo
    this.horn = ctx.createOscillator(); this.horn.type = 'square'; this.horn.frequency.value = 880;
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    this.horn.connect(this.hornGain); this.hornGain.connect(this.master); this.horn.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  update(f, dt, paused, inside) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const silent = paused || f.crashed;
    const kind = f.spec?.kind || 'prop';
    const thr = f.throttle;
    const speed = f.ias / 1.944;

    // giri con inerzia
    const target = silent ? 0 : 700 + thr * 2000;
    this.rpm += (target - this.rpm) * Math.min(1, dt * 2.5);
    const fire = (this.rpm / 60) * 2; // 4 cilindri a 4 tempi
    for (const { o, mul } of this.oscs) o.frequency.setTargetAtTime(Math.max(fire * mul, 1), t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + thr * 900 + (inside ? 200 : 0), t, 0.1);
    const isProp = kind === 'prop';
    this.engGain.gain.setTargetAtTime(silent || !isProp ? 0 : (0.16 + thr * 0.3) * (inside ? 1.2 : 0.8), t, 0.1);
    // turbina: soffio a banda larga + sibilo che sale con la spinta
    const isJet = kind === 'jet';
    this.jet.f.frequency.setTargetAtTime(500 + thr * 1700, t, 0.15);
    this.jet.g.gain.setTargetAtTime(silent || !isJet ? 0 : (0.05 + thr * 0.28) * (inside ? 0.8 : 1.1), t, 0.15);
    this.whine.frequency.setTargetAtTime(1300 + thr * 2600, t, 0.15);
    this.whineGain.gain.setTargetAtTime(silent || !isJet ? 0 : 0.004 + thr * 0.02, t, 0.15);
    // variometro acustico: bip più rapidi e acuti con la salita, tono grave in discesa forte
    const vs = f.vsMs || 0;
    let vg = 0;
    if (!silent && kind === 'glider' && !f.onGround) {
      if (vs > 0.3) { const rate = 2 + vs * 1.6; vg = Math.sin(t * rate * Math.PI * 2) > 0 ? 0.06 : 0; this.vOsc.frequency.setTargetAtTime(520 + vs * 110, t, 0.02); }
      else if (vs < -2.5) { vg = 0.04; this.vOsc.frequency.setTargetAtTime(210, t, 0.05); }
    }
    this.vGain.gain.setTargetAtTime(vg, t, 0.01);

    this.prop.f.frequency.setTargetAtTime(600 + thr * 1100, t, 0.1);
    this.prop.g.gain.setTargetAtTime(silent || !isProp ? 0 : 0.015 + thr * 0.07, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(350 + speed * 12, t, 0.2);
    this.wind.g.gain.setTargetAtTime(silent ? 0 : Math.min(0.5, (speed / 75) ** 2 * 0.5), t, 0.2);
    this.roll.g.gain.setTargetAtTime(!silent && f.onGround ? Math.min(speed / 25, 1) * 0.22 : 0, t, 0.1);
    this.room.frequency.setTargetAtTime(inside ? 3500 : 1500, t, 0.2);

    // cicalino di stallo: pulsa quando l'incidenza è alta
    const warn = !silent && !f.onGround && f.aoa > 0.24 && f.ias > 20;
    this.hornGain.gain.setTargetAtTime(warn && Math.sin(t * 16) > 0 ? 0.07 : 0, t, 0.01);
  }

  thump(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400 + 300 * strength;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * Math.min(strength, 2), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + 0.3 * strength);
    src.connect(f); f.connect(g); g.connect(this.room);
    src.start(t); src.stop(t + 1);
  }
}
