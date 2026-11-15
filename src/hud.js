import { t, getLang } from './i18n.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      ias: $('v-ias'), alt: $('v-alt'), vs: $('v-vs'), hdg: $('v-hdg'), agl: $('v-agl'),
      thr: $('v-thr'), bthr: $('b-thr'), flap: $('v-flap'), brake: $('v-brake'),
      warnings: $('warnings'), message: $('message'), help: $('help'), dest: $('v-dest'), apt: $('v-apt'),
    };
    this.adi = $('adi').getContext('2d');
    this.msgTimer = 0;
    this.warnKey = '';
  }

  toggleHelp() { this.el.help.classList.toggle('hidden'); }

  message(text, detail, kind, seconds = 4) {
    const m = this.el.message;
    m.className = `show ${kind || ''}`;
    m.innerHTML = `${text}${detail ? `<small>${detail}</small>` : ''}`;
    this.msgTimer = seconds;
  }

  setNav(airport, dest) {
    if (this.el.apt.textContent !== airport) this.el.apt.textContent = airport;
    if (this.el.dest.textContent !== dest) this.el.dest.textContent = dest;
  }

  hideMessage() { this.el.message.className = ''; this.msgTimer = 0; }

  update(f, dt, paused) {
    const e = this.el;
    e.ias.textContent = Math.round(f.ias);
    e.alt.textContent = Math.round(f.altFt);
    e.vs.textContent = Math.round(f.vsFpm / 10) * 10;
    e.hdg.textContent = String(Math.round(f.heading) % 360).padStart(3, '0');
    e.agl.textContent = Math.max(0, Math.round(f.agl));
    e.thr.textContent = Math.round(f.throttle * 100) + '%';
    e.bthr.style.width = f.throttle * 100 + '%';
    e.flap.textContent = Math.round(f.flapDeg);
    e.brake.textContent = f.input.brake ? t('on') : '-';

    // avvisi / warnings
    const w = [];
    if (paused) w.push(['wPause', 'amber']);
    if (f.stalled && !f.onGround) w.push(['wStall', '']);
    else if (!f.onGround && f.aoa > 0.24 && f.ias > 20) w.push(['wStallWarn', 'amber']);
    if (!f.onGround && f.agl < 150 && f.vsFpm < -900) w.push(['wTerrain', '']);
    const key = getLang() + w.map((x) => x.join(':')).join('|');
    if (key !== this.warnKey) {
      this.warnKey = key;
      e.warnings.innerHTML = w.map(([k, c]) => `<div class="warn ${c}">${t(k)}</div>`).join('');
    }

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.hideMessage();
    }
    this.drawAdi(f);
  }

  drawAdi(f) {
    const g = this.adi, S = 180, c = S / 2;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.clip();
    g.translate(c, c);
    g.rotate(-f.bank);
    const k = 170 / (Math.PI / 2) * 0.9; // px per rad
    g.translate(0, f.pitch * k);
    g.fillStyle = '#3d8fd6'; g.fillRect(-300, -600, 600, 600);
    g.fillStyle = '#7a5a36'; g.fillRect(-300, 0, 600, 600);
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-300, 0); g.lineTo(300, 0); g.stroke();
    g.font = '10px sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center';
    for (let d = -30; d <= 30; d += 5) {
      if (d === 0) continue;
      const y = -d * Math.PI / 180 * k;
      const half = d % 10 === 0 ? 22 : 11;
      g.beginPath(); g.moveTo(-half, y); g.lineTo(half, y); g.stroke();
      if (d % 10 === 0) { g.fillText(Math.abs(d), -half - 12, y + 3); g.fillText(Math.abs(d), half + 12, y + 3); }
    }
    g.restore();

    // simbolo aereo fisso
    g.save();
    g.translate(c, c);
    g.strokeStyle = '#ffd23a'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-48, 0); g.lineTo(-16, 0); g.lineTo(-16, 8);
    g.moveTo(48, 0); g.lineTo(16, 0); g.lineTo(16, 8);
    g.stroke();
    g.fillStyle = '#ffd23a'; g.fillRect(-2, -2, 4, 4);
    g.restore();
  }
}
