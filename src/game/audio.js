// All sounds are synthesised with WebAudio, so there are no audio files to ship.
export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.lastBrush = 0;
    this.nextBird = 4;
    this.nextCricket = 2;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this._noise = this._makeNoise();
      this._startWind();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  get ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(gain, t, a, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  _tone(type, f0, f1, dur, vol, when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    this._env(g, t, 0.008, vol, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noiseBurst(f0, f1, q, dur, vol, type = 'bandpass') {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this._noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this._env(g, t, 0.01, vol, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  pop(pitch = 1) {
    if (!this.ready) return;
    const p = pitch * (0.9 + Math.random() * 0.2);
    this._tone('sine', 420 * p, 880 * p, 0.16, 0.22);
    this._tone('triangle', 840 * p, 1500 * p, 0.09, 0.06);
  }

  poof() {
    if (!this.ready) return;
    this._noiseBurst(1400, 260, 1.2, 0.28, 0.22);
    this._tone('sine', 380, 160, 0.16, 0.08);
  }

  click() {
    if (!this.ready) return;
    this._tone('sine', 1100, 1300, 0.05, 0.05);
  }

  brush(kind) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBrush < 0.11) return;
    this.lastBrush = now;
    if (kind === 'water') {
      this._tone('sine', 300 + Math.random() * 300, 700 + Math.random() * 500, 0.1, 0.05);
    } else {
      this._noiseBurst(500 + Math.random() * 300, 300, 0.8, 0.12, 0.05, 'lowpass');
    }
  }

  _startWind() {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = c.createGain();
    g.gain.value = 0.018;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(f.frequency);
    s.connect(f).connect(g).connect(this.master);
    s.start();
    lfo.start();
    this.windGain = g;
  }

  // Ambient birdsong by day, crickets at night.
  ambient(dt, night) {
    if (!this.ready) return;
    this.nextBird -= dt;
    this.nextCricket -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 3 + Math.random() * 8;
      if (night < 0.4) {
        const base = 2200 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const w = i * (0.09 + Math.random() * 0.05);
          this._tone('sine', base * (0.9 + Math.random() * 0.2), base * (1.25 + Math.random() * 0.3), 0.08, 0.025, w);
        }
      }
    }
    if (this.nextCricket <= 0) {
      this.nextCricket = 0.6 + Math.random() * 1.6;
      if (night > 0.5) {
        const f = 4200 + Math.random() * 500;
        for (let i = 0; i < 3; i++) this._tone('sine', f, f * 1.02, 0.035, 0.012, i * 0.06);
      }
    }
  }
}
