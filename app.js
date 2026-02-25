// ── Audio context ──────────────────────────────────────────────────────────

let ctx;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ── FX chain ───────────────────────────────────────────────────────────────
// All synths → insertBus → [dry] + [reverb wet] + [delay wet] → masterGain

let insertBus, masterGain, reverbNode, reverbWet, delayNode, delayFeedback, delayWet;
let chainReady = false;

function makeImpulse(c, secs = 2.4, decay = 2) {
  const len = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function setupChain() {
  if (chainReady) return;
  const c = getCtx();

  masterGain = c.createGain();
  masterGain.gain.value = params.volume.value * 0.85;
  masterGain.connect(c.destination);

  insertBus = c.createGain();

  // Dry path
  insertBus.connect(masterGain);

  // Reverb
  reverbNode = c.createConvolver();
  reverbNode.buffer = makeImpulse(c);
  reverbWet = c.createGain();
  reverbWet.gain.value = 0;
  insertBus.connect(reverbNode);
  reverbNode.connect(reverbWet);
  reverbWet.connect(masterGain);

  // Delay with feedback
  delayNode    = c.createDelay(1.0);
  delayNode.delayTime.value = 0.25;
  delayFeedback = c.createGain();
  delayFeedback.gain.value = 0.38;
  delayWet = c.createGain();
  delayWet.gain.value = 0;
  insertBus.connect(delayNode);
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(delayWet);
  delayWet.connect(masterGain);

  chainReady = true;
}

function getDest() {
  setupChain();
  return insertBus;
}

// ── Params ─────────────────────────────────────────────────────────────────

const params = {
  volume: { value: 0.75 },
  reverb: { value: 0    },
  loop:   { value: 0    }, // toggle: 0 off, 1 on
  delay:  { value: 0    },
};

function applyParam(key) {
  if (!chainReady) return;
  const v = params[key].value;
  const t = getCtx().currentTime;
  if (key === 'volume') masterGain.gain.setTargetAtTime(v * 0.85, t, 0.02);
  if (key === 'reverb') reverbWet.gain.setTargetAtTime(v * 0.72,  t, 0.02);
  if (key === 'delay')  delayWet.gain.setTargetAtTime(v * 0.55,   t, 0.02);
}

// ── Encoder visual config ──────────────────────────────────────────────────

const encoderCfg = {
  volume: { label: 'VOL',    color: '#00E013', light: '#44FF55', dark: '#009A0D', isToggle: false },
  reverb: { label: 'REVERB', color: '#D4FF00', light: '#E3FF55', dark: '#94B300', isToggle: false },
  loop:   { label: 'LOOP',   color: '#27802F', light: '#33A33C', dark: '#1A5520', isToggle: true  },
  delay:  { label: 'DELAY',  color: '#7F9900', light: '#A0C000', dark: '#556600', isToggle: false },
};

// ── Synths ─────────────────────────────────────────────────────────────────

const synths = {

  // Synth drum pad: sub thud + square wave tick for machine-like attack
  tap() {
    const c = getCtx(), t = c.currentTime, dest = getDest();

    const sub = c.createOscillator(), subG = c.createGain();
    sub.connect(subG); subG.connect(dest);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(105, t);
    sub.frequency.exponentialRampToValueAtTime(42, t + 0.04);
    subG.gain.setValueAtTime(0.62, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    sub.start(t); sub.stop(t + 0.055);

    // Square tick gives the synth-drum machine snap
    const sq = c.createOscillator(), sqG = c.createGain();
    sq.connect(sqG); sqG.connect(dest);
    sq.type = 'square';
    sq.frequency.setValueAtTime(1100, t);
    sqG.gain.setValueAtTime(0.16, t);
    sqG.gain.exponentialRampToValueAtTime(0.001, t + 0.013);
    sq.start(t); sq.stop(t + 0.015);

    return 0.055;
  },

  // Resonant filter ping: noise burst through ultra-high-Q bandpass = Moog self-oscillation
  ping() {
    const c = getCtx(), t = c.currentTime, dest = getDest();

    const bufSize = Math.floor(c.sampleRate * 0.005);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const noise = c.createBufferSource();
    noise.buffer = buf;

    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(1350, t);
    flt.Q.setValueAtTime(55, t);

    const g = c.createGain();
    noise.connect(flt); flt.connect(g); g.connect(dest);
    g.gain.setValueAtTime(9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    noise.start(t);
    return 0.42;
  },

  // Double filter stab: two angular sawtooth sweeps in quick succession
  alert() {
    const c = getCtx(), t = c.currentTime, dest = getDest();
    [0, 0.1].forEach((offset, i) => {
      const osc = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain();
      osc.connect(flt); flt.connect(g); g.connect(dest);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220 + i * 55, t + offset);
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(200, t + offset);
      flt.frequency.exponentialRampToValueAtTime(5500, t + offset + 0.03);
      flt.frequency.exponentialRampToValueAtTime(150, t + offset + 0.17);
      flt.Q.setValueAtTime(9, t + offset);
      g.gain.setValueAtTime(0.001, t + offset);
      g.gain.linearRampToValueAtTime(0.38, t + offset + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18);
      osc.start(t + offset); osc.stop(t + offset + 0.2);
    });
    return 0.3;
  },

  // Minimoog-style warm pluck: two detuned sawtooths through a decaying lowpass
  remind() {
    const c = getCtx(), t = c.currentTime, dest = getDest();
    [392, 394.2].forEach(freq => {
      const osc = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain();
      osc.connect(flt); flt.connect(g); g.connect(dest);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(3200, t);
      flt.frequency.exponentialRampToValueAtTime(380, t + 0.32);
      flt.Q.setValueAtTime(2.5, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.19, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      osc.start(t); osc.stop(t + 0.38);
    });
    return 0.36;
  },

  // Fat power chord: detuned sawtooth pairs (A/E/A) with filter crack — confident, not cheesy
  success() {
    const c = getCtx(), t = c.currentTime, dest = getDest();
    [220, 330, 440].forEach(base => {
      [-2, +2].forEach(cents => {
        const osc = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain();
        osc.connect(flt); flt.connect(g); g.connect(dest);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(base * Math.pow(2, cents / 1200), t);
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(400, t);
        flt.frequency.exponentialRampToValueAtTime(4000, t + 0.04);
        flt.Q.setValueAtTime(2, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.08, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t); osc.stop(t + 0.32);
      });
    });
    return 0.3;
  },

  // Square wave through a rapidly closing resonant filter — mechanical "nope"
  error() {
    const c = getCtx(), t = c.currentTime, dest = getDest();
    const osc = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain();
    osc.connect(flt); flt.connect(g); g.connect(dest);
    osc.type = 'square';
    osc.frequency.setValueAtTime(155, t);
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(4500, t);
    flt.frequency.exponentialRampToValueAtTime(70, t + 0.22);
    flt.Q.setValueAtTime(6, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.48, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.start(t); osc.stop(t + 0.25);
    return 0.24;
  },

  // Three-phase Devo fanfare: angular arpeggio → FM chord hit → ring-mod shimmer
  celebration() {
    const c = getCtx(), t = c.currentTime, dest = getDest();

    // Phase 1 (0–0.4s): rising square-wave arpeggio through resonant filter
    [220, 277, 330, 415, 440].forEach((freq, i) => {
      const osc = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain();
      osc.connect(flt); flt.connect(g); g.connect(dest);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + i * 0.08);
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(600, t + i * 0.08);
      flt.frequency.exponentialRampToValueAtTime(3500, t + i * 0.08 + 0.018);
      flt.frequency.exponentialRampToValueAtTime(400, t + i * 0.08 + 0.072);
      flt.Q.setValueAtTime(6, t + i * 0.08);
      g.gain.setValueAtTime(0.001, t + i * 0.08);
      g.gain.linearRampToValueAtTime(0.24, t + i * 0.08 + 0.007);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.072);
      osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.08);
    });

    // Phase 2 (0.45–0.95s): FM synthesis chord — metallic, complex harmonics
    const t2 = t + 0.45;
    [220, 330, 440].forEach(freq => {
      const mod = c.createOscillator(), modG = c.createGain();
      const car = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain();
      mod.type = 'sine';
      mod.frequency.setValueAtTime(freq, t2);
      modG.gain.setValueAtTime(freq * 2.5, t2);
      modG.gain.exponentialRampToValueAtTime(freq * 0.2, t2 + 0.3);
      car.type = 'sawtooth';
      car.frequency.setValueAtTime(freq, t2);
      mod.connect(modG); modG.connect(car.frequency);
      car.connect(flt); flt.connect(g); g.connect(dest);
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(400, t2);
      flt.frequency.exponentialRampToValueAtTime(5000, t2 + 0.04);
      flt.Q.setValueAtTime(3, t2);
      g.gain.setValueAtTime(0.001, t2);
      g.gain.linearRampToValueAtTime(0.11, t2 + 0.014);
      g.gain.exponentialRampToValueAtTime(0.001, t2 + 0.48);
      car.start(t2); car.stop(t2 + 0.5);
      mod.start(t2); mod.stop(t2 + 0.5);
    });

    // Phase 3 (0.65–1.1s): ring modulation shimmer — carrier × modulator = sum/difference tones
    const t3 = t + 0.65;
    const carrier = c.createOscillator();
    const modOsc  = c.createOscillator();
    const ringG   = c.createGain();
    const outG    = c.createGain();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(880, t3);
    carrier.frequency.exponentialRampToValueAtTime(1320, t3 + 0.38);
    modOsc.type = 'sine';
    modOsc.frequency.setValueAtTime(220, t3);
    ringG.gain.value = 0;
    modOsc.connect(ringG.gain); // modulator controls carrier amplitude = ring mod
    carrier.connect(ringG);
    ringG.connect(outG); outG.connect(dest);
    outG.gain.setValueAtTime(0.3, t3);
    outG.gain.setValueAtTime(0.3, t3 + 0.1);
    outG.gain.exponentialRampToValueAtTime(0.001, t3 + 0.42);
    carrier.start(t3); carrier.stop(t3 + 0.44);
    modOsc.start(t3); modOsc.stop(t3 + 0.44);

    return 1.1;
  },

  // Short square wave melodic blip — 8-bit sequencer note, Game Boy by way of Kraftwerk
  blip() {
    const c = getCtx(), t = c.currentTime, dest = getDest();
    const osc = c.createOscillator(), g = c.createGain();
    osc.connect(g); g.connect(dest);
    osc.type = 'square';
    osc.frequency.setValueAtTime(1047, t); // C6
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.26, t + 0.004);
    g.gain.setValueAtTime(0.26, t + 0.032);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.start(t); osc.stop(t + 0.11);
    return 0.1;
  },

  // FM electric zap: sawtooth carrier frequency-modulated by square wave — buzzy, angular
  zapp() {
    const c = getCtx(), t = c.currentTime, dest = getDest();
    const mod  = c.createOscillator(), modG = c.createGain();
    const car  = c.createOscillator(), flt  = c.createBiquadFilter(), g = c.createGain();
    mod.type = 'square';
    mod.frequency.setValueAtTime(110, t);
    modG.gain.setValueAtTime(700, t);
    modG.gain.exponentialRampToValueAtTime(40, t + 0.16);
    car.type = 'sawtooth';
    car.frequency.setValueAtTime(360, t);
    car.frequency.exponentialRampToValueAtTime(110, t + 0.16);
    mod.connect(modG); modG.connect(car.frequency);
    car.connect(flt); flt.connect(g); g.connect(dest);
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(1400, t);
    flt.Q.setValueAtTime(1.8, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.007);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    car.start(t); car.stop(t + 0.2);
    mod.start(t); mod.stop(t + 0.2);
    return 0.19;
  },

  // Resonant square chunk: square wave + high-Q filter closing fast — industrial thud
  chunk() {
    const c = getCtx(), t = c.currentTime, dest = getDest();
    const osc = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain();
    osc.connect(flt); flt.connect(g); g.connect(dest);
    osc.type = 'square';
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(58, t + 0.12);
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(4200, t);
    flt.frequency.exponentialRampToValueAtTime(110, t + 0.12);
    flt.Q.setValueAtTime(7, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.start(t); osc.stop(t + 0.15);
    return 0.14;
  },

  // Inharmonic sine partials (metal pipe ratios) + noise transient — industrial ring
  klang() {
    const c = getCtx(), t = c.currentTime, dest = getDest();
    [[1.0, 0.20, 0.28], [1.41, 0.12, 0.20], [1.73, 0.07, 0.15], [2.30, 0.04, 0.11], [2.76, 0.02, 0.08]]
      .forEach(([ratio, amp, decay]) => {
        const osc = c.createOscillator(), g = c.createGain();
        osc.connect(g); g.connect(dest);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(195 * ratio, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, t + decay);
        osc.start(t); osc.stop(t + decay + 0.01);
      });
    const bufSize = Math.floor(c.sampleRate * 0.012);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const noise = c.createBufferSource(); noise.buffer = buf;
    const nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2200;
    const ng = c.createGain();
    noise.connect(nf); nf.connect(ng); ng.connect(dest);
    ng.gain.setValueAtTime(0.22, t);
    noise.start(t);
    return 0.3;
  },

};

// ── Sound catalog ──────────────────────────────────────────────────────────

// Token names and platform-specific code snippets for each sound
const snippets = {
  success:     { token: 'sl1.success',     ios: 'SL1Sound.success.play()',     android: 'SL1.play(Sound.SUCCESS)',     web: "sl1.play('success')"     },
  error:       { token: 'sl1.error',       ios: 'SL1Sound.error.play()',       android: 'SL1.play(Sound.ERROR)',       web: "sl1.play('error')"       },
  alert:       { token: 'sl1.alert',       ios: 'SL1Sound.alert.play()',       android: 'SL1.play(Sound.ALERT)',       web: "sl1.play('alert')"       },
  remind:      { token: 'sl1.remind',      ios: 'SL1Sound.remind.play()',      android: 'SL1.play(Sound.REMIND)',      web: "sl1.play('remind')"      },
  celebration: { token: 'sl1.celebrate',   ios: 'SL1Sound.celebrate.play()',   android: 'SL1.play(Sound.CELEBRATE)',   web: "sl1.play('celebrate')"   },
  ping:        { token: 'sl1.ping',        ios: 'SL1Sound.ping.play()',        android: 'SL1.play(Sound.PING)',        web: "sl1.play('ping')"        },
  tap:         { token: 'sl1.tap',         ios: 'SL1Sound.tap.play()',         android: 'SL1.play(Sound.TAP)',         web: "sl1.play('tap')"         },
};

let currentPlatform = 'ios';

const sounds = [
  { id: 'success',     name: 'SUCCESS', synth: synths.success     },
  { id: 'error',       name: 'ERROR',   synth: synths.error       },
  { id: 'alert',       name: 'ALERT',   synth: synths.alert       },
  { id: 'remind',      name: 'REMIND',  synth: synths.remind      },
  { id: 'celebration', name: 'CELEBR.', synth: synths.celebration },
  { id: 'ping',        name: 'PING',    synth: synths.ping        },
  { id: 'tap',         name: 'TAP',     synth: synths.tap         },
];

// ── Mood synth sets ────────────────────────────────────────────────────────
// Each mood maps to 7 sounds in the same key positions as the default set.
// Order: SUCCESS ERROR ALERT REMIND CELEBR. PING TAP

let currentMood = 'default';

const moodSets = {

  // ── Vibes Only — smooth, lofi, jazz-adjacent ──────────────────────────────
  // Order: SUCCESS ERROR ALERT REMIND CELEBR. PING TAP
  vibes: [
    /* SUCCESS */ { synth() {
      // FLOAT — lush Fmaj9 chord: the reward sound for getting it right
      const c = getCtx(), t = c.currentTime, d = getDest();
      [174.61, 220, 261.63, 329.63, 392].forEach(freq => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(d);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t+0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.72); o.start(t); o.stop(t+0.74);
      }); return 0.72; } },

    /* ERROR   */ { synth() {
      // SOUL — low moody bass: something went wrong but keep it cool
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(87.31, t); o.frequency.exponentialRampToValueAtTime(82.41, t+0.1);
      f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 3;
      o.connect(f); f.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.58, t+0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.32); o.start(t); o.stop(t+0.34); return 0.32; } },

    /* ALERT   */ { synth() {
      // DRIFT — slow filter sweep: a gentle heads-up, not a klaxon
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 110;
      f.type = 'lowpass'; f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(900, t+0.3); f.Q.value = 4;
      o.connect(f); f.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.28, t+0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.38); o.start(t); o.stop(t+0.4); return 0.38; } },

    /* REMIND  */ { synth() {
      // MELLOW — soft triangle tone: a patient tap on the shoulder
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = 196;
      o.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.38, t+0.022);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.52); o.start(t); o.stop(t+0.54); return 0.52; } },

    /* CELEBR. */ { synth() {
      // JAZZ — Cm7 chord bloom: understated milestone, taste over hype
      const c = getCtx(), t = c.currentTime, d = getDest();
      [130.81, 155.56, 196, 233.08].forEach((freq, i) => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = freq;
        f.type = 'lowpass'; f.frequency.value = 1800;
        o.connect(f); f.connect(g); g.connect(d);
        g.gain.setValueAtTime(0, t + i*0.04); g.gain.linearRampToValueAtTime(0.1, t+i*0.04+0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t+i*0.04+0.52); o.start(t+i*0.04); o.stop(t+i*0.04+0.54);
      }); return 0.72; } },

    /* PING    */ { synth() {
      // GLASS — pure crystal sine: someone just said something
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 1318;
      o.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.3, t+0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.6); o.start(t); o.stop(t+0.62); return 0.6; } },

    /* TAP     */ { synth() {
      // BRUSH — soft noise hit: just enough to confirm contact
      const c = getCtx(), t = c.currentTime, d = getDest();
      const sz = Math.floor(c.sampleRate * 0.09);
      const buf = c.createBuffer(1, sz, c.sampleRate);
      const da = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) da[i] = (Math.random()*2-1)*(1-i/sz)*0.5;
      const n = c.createBufferSource(); n.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t+0.07);
      const g = c.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.09);
      n.connect(f); f.connect(g); g.connect(d); n.start(t); return 0.09; } },
  ],

  // ── Cash Money — hip-hop, hard hitting ───────────────────────────────────
  // Order: SUCCESS ERROR ALERT REMIND CELEBR. PING TAP
  cash: [
    /* SUCCESS */ { synth() {
      // DROP — big sine sub: the money hit, transaction confirmed
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(28, t+0.38);
      o.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.85, t); g.gain.setValueAtTime(0.85, t+0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.55); o.start(t); o.stop(t+0.57); return 0.55; } },

    /* ERROR   */ { synth() {
      // BASS THUD — square sub cut short: nope, try again
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(82, t); o.frequency.exponentialRampToValueAtTime(40, t+0.09);
      f.type = 'lowpass'; f.frequency.setValueAtTime(2000, t); f.frequency.exponentialRampToValueAtTime(80, t+0.11); f.Q.value = 4;
      o.connect(f); f.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.62, t+0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.13); o.start(t); o.stop(t+0.15); return 0.13; } },

    /* ALERT   */ { synth() {
      // STAB — sawtooth filter crack: attention, now
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 220;
      f.type = 'lowpass'; f.frequency.setValueAtTime(280, t); f.frequency.exponentialRampToValueAtTime(3200, t+0.018); f.frequency.exponentialRampToValueAtTime(180, t+0.14); f.Q.value = 6;
      o.connect(f); f.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.52, t+0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.15); o.start(t); o.stop(t+0.17); return 0.15; } },

    /* REMIND  */ { synth() {
      // SNARE — triangle body + noise: sidestick reminder, respectful
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'triangle'; o.frequency.value = 180; o.connect(og); og.connect(d);
      og.gain.setValueAtTime(0.38, t); og.gain.exponentialRampToValueAtTime(0.001, t+0.09); o.start(t); o.stop(t+0.1);
      const sz = Math.floor(c.sampleRate * 0.12);
      const buf = c.createBuffer(1, sz, c.sampleRate); const da = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) da[i] = Math.random()*2-1;
      const n = c.createBufferSource(); n.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      const ng = c.createGain(); ng.gain.setValueAtTime(0.28, t); ng.gain.exponentialRampToValueAtTime(0.001, t+0.12);
      n.connect(f); f.connect(ng); ng.connect(d); n.start(t); return 0.12; } },

    /* CELEBR. */ { synth() {
      // HYPE — noise sweep rise: crowd going up, big moment energy
      const c = getCtx(), t = c.currentTime, d = getDest();
      const sz = Math.floor(c.sampleRate * 0.5);
      const buf = c.createBuffer(1, sz, c.sampleRate); const da = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) da[i] = Math.random()*2-1;
      const n = c.createBufferSource(); n.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(4500, t+0.42);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.38, t+0.38); g.gain.exponentialRampToValueAtTime(0.001, t+0.52);
      n.connect(f); f.connect(g); g.connect(d); n.start(t); return 0.52; } },

    /* PING    */ { synth() {
      // HIHAT — crisp high noise tick: message landed
      const c = getCtx(), t = c.currentTime, d = getDest();
      const sz = Math.floor(c.sampleRate * 0.04);
      const buf = c.createBuffer(1, sz, c.sampleRate); const da = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) da[i] = (Math.random()*2-1)*(1-i/sz);
      const n = c.createBufferSource(); n.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
      const g = c.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.04);
      n.connect(f); f.connect(g); g.connect(d); n.start(t); return 0.04; } },

    /* TAP     */ { synth() {
      // 808 — sine sub thud: the tap that hits
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(38, t+0.55);
      o.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.92, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.72); o.start(t); o.stop(t+0.74); return 0.72; } },
  ],

  // ── Friday Afternoon — warm, uplifting, bright ────────────────────────────
  // Order: SUCCESS ERROR ALERT REMIND CELEBR. PING TAP
  friday: [
    /* SUCCESS */ { synth() {
      // CHIME — cascading sine bells: yes! it worked, feel good
      const c = getCtx(), t = c.currentTime, d = getDest();
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(d);
        g.gain.setValueAtTime(0.001, t+i*0.055); g.gain.linearRampToValueAtTime(0.22, t+i*0.055+0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t+i*0.055+0.52); o.start(t+i*0.055); o.stop(t+i*0.055+0.54);
      }); return 0.68; } },

    /* ERROR   */ { synth() {
      // GLOW — soft triangle minor: something's off, warm not harsh
      const c = getCtx(), t = c.currentTime, d = getDest();
      [196, 233.08, 293.66].forEach(freq => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 2200;
        o.connect(f); f.connect(g); g.connect(d);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t+0.09);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.44); o.start(t); o.stop(t+0.46);
      }); return 0.44; } },

    /* ALERT   */ { synth() {
      // SPARK — resonant bandpass ping: bright, sharp, pays attention
      const c = getCtx(), t = c.currentTime, d = getDest();
      const sz = Math.floor(c.sampleRate * 0.004);
      const buf = c.createBuffer(1, sz, c.sampleRate); const da = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) da[i] = (Math.random()*2-1)*(1-i/sz);
      const n = c.createBufferSource(); n.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2900; f.Q.value = 42;
      const g = c.createGain(); g.gain.setValueAtTime(8, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.3);
      n.connect(f); f.connect(g); g.connect(d); n.start(t); return 0.3; } },

    /* REMIND  */ { synth() {
      // CHORD — sawtooth C major: a bright, friendly nudge
      const c = getCtx(), t = c.currentTime, d = getDest();
      [261.63, 329.63, 392].forEach(freq => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq;
        f.type = 'lowpass'; f.frequency.setValueAtTime(480, t); f.frequency.exponentialRampToValueAtTime(3000, t+0.03); f.Q.value = 2;
        o.connect(f); f.connect(g); g.connect(d);
        g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.11, t+0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.32); o.start(t); o.stop(t+0.34);
      }); return 0.32; } },

    /* CELEBR. */ { synth() {
      // CHEER — ascending sawtooth stagger: a proper moment, earned
      const c = getCtx(), t = c.currentTime, d = getDest();
      [261.63, 329.63, 392, 523.25].forEach((freq, i) => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq;
        f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t+0.03); f.Q.value = 2;
        o.connect(f); f.connect(g); g.connect(d);
        g.gain.setValueAtTime(0.001, t+i*0.06); g.gain.linearRampToValueAtTime(0.13, t+i*0.06+0.01);
        g.gain.exponentialRampToValueAtTime(0.04, t+i*0.06+0.16);
        g.gain.setValueAtTime(0.04, t+0.32); g.gain.exponentialRampToValueAtTime(0.001, t+0.64);
        o.start(t); o.stop(t+0.66);
      }); return 0.64; } },

    /* PING    */ { synth() {
      // BELL — FM sine: a warm knock, someone's there
      const c = getCtx(), t = c.currentTime, d = getDest();
      const mod = c.createOscillator(), mG = c.createGain();
      const car = c.createOscillator(), g = c.createGain();
      mod.type = 'sine'; mod.frequency.value = 880;
      mG.gain.setValueAtTime(880*2.8, t); mG.gain.exponentialRampToValueAtTime(12, t+0.6);
      car.type = 'sine'; car.frequency.value = 880;
      mod.connect(mG); mG.connect(car.frequency); car.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.42, t+0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.72); car.start(t); car.stop(t+0.74); mod.start(t); mod.stop(t+0.74); return 0.72; } },

    /* TAP     */ { synth() {
      // SHIMMER — cascading high sines: light, delightful touch feedback
      const c = getCtx(), t = c.currentTime, d = getDest();
      [1318, 1568, 1760].forEach((freq, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(d);
        g.gain.setValueAtTime(0, t+i*0.018); g.gain.linearRampToValueAtTime(0.14, t+i*0.018+0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t+i*0.018+0.22); o.start(t+i*0.018); o.stop(t+i*0.018+0.24);
      }); return 0.3; } },
  ],

  // ── Chill Wave — retrowave, dreamy, synth ─────────────────────────────────
  // Order: SUCCESS ERROR ALERT REMIND CELEBR. PING TAP
  chill: [
    /* SUCCESS */ { synth() {
      // HOLO — FM chorus chord: dreamy win, shimmer of completion
      const c = getCtx(), t = c.currentTime, d = getDest();
      [329.63, 330.22, 329.04].forEach(freq => {
        const mod = c.createOscillator(), mG = c.createGain();
        const car = c.createOscillator(), g = c.createGain();
        mod.type = 'sine'; mod.frequency.value = freq*2;
        mG.gain.setValueAtTime(freq*0.8, t); mG.gain.exponentialRampToValueAtTime(5, t+0.32);
        car.type = 'sine'; car.frequency.value = freq;
        mod.connect(mG); mG.connect(car.frequency); car.connect(g); g.connect(d);
        g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.11, t+0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.42); car.start(t); car.stop(t+0.44); mod.start(t); mod.stop(t+0.44);
      }); return 0.42; } },

    /* ERROR   */ { synth() {
      // FADE — dark sawtooth minor: something slipped away, muted
      const c = getCtx(), t = c.currentTime, d = getDest();
      [164.81, 207.65, 246.94].forEach(freq => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 880; f.Q.value = 1;
        o.connect(f); f.connect(g); g.connect(d);
        g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.1, t+0.044);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.66); o.start(t); o.stop(t+0.68);
      }); return 0.66; } },

    /* ALERT   */ { synth() {
      // RETRO — detuned sawtooth stab: an 80s alarm, cinematic urgency
      const c = getCtx(), t = c.currentTime, d = getDest();
      [220, 221.6, 218.4].forEach(freq => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq;
        f.type = 'lowpass'; f.frequency.setValueAtTime(280, t); f.frequency.exponentialRampToValueAtTime(3600, t+0.024); f.frequency.exponentialRampToValueAtTime(380, t+0.21); f.Q.value = 8;
        o.connect(f); f.connect(g); g.connect(d);
        g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.13, t+0.006);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.23); o.start(t); o.stop(t+0.25);
      }); return 0.23; } },

    /* REMIND  */ { synth() {
      // VAPOR — dreamy sawtooth chord: a slow drift into your awareness
      const c = getCtx(), t = c.currentTime, d = getDest();
      [220, 277.18, 329.63].forEach(freq => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 1;
        o.connect(f); f.connect(g); g.connect(d);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1, t+0.14);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.58); o.start(t); o.stop(t+0.6);
      }); return 0.58; } },

    /* CELEBR. */ { synth() {
      // DREAM — detuned synth pad swell: a slow-motion milestone
      const c = getCtx(), t = c.currentTime, d = getDest();
      [[220,221.3],[277.18,278.1],[329.63,330.6],[440,441.3]].forEach(([f1,f2], i) => {
        [f1, f2].forEach(freq => {
          const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
          o.type = 'sawtooth'; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 1350; f.Q.value = 0.8;
          o.connect(f); f.connect(g); g.connect(d);
          g.gain.setValueAtTime(0, t+i*0.06); g.gain.linearRampToValueAtTime(0.044, t+i*0.06+0.09);
          g.gain.exponentialRampToValueAtTime(0.001, t+i*0.06+0.72); o.start(t+i*0.06); o.stop(t+i*0.06+0.74);
        });
      }); return 0.9; } },

    /* PING    */ { synth() {
      // NEON — FM pluck: a signal from the grid, clean and electric
      const c = getCtx(), t = c.currentTime, d = getDest();
      const mod = c.createOscillator(), mG = c.createGain();
      const car = c.createOscillator(), g = c.createGain();
      mod.type = 'sine'; mod.frequency.value = 440;
      mG.gain.setValueAtTime(660, t); mG.gain.exponentialRampToValueAtTime(18, t+0.26);
      car.type = 'sine'; car.frequency.value = 440;
      mod.connect(mG); mG.connect(car.frequency); car.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.4, t+0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.3); car.start(t); car.stop(t+0.32); mod.start(t); mod.stop(t+0.32); return 0.3; } },

    /* TAP     */ { synth() {
      // PULSE — square lowpass thud: a synth-age button press
      const c = getCtx(), t = c.currentTime, d = getDest();
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'square'; o.frequency.value = 110;
      f.type = 'lowpass'; f.frequency.setValueAtTime(650, t); f.frequency.exponentialRampToValueAtTime(190, t+0.16); f.Q.value = 6;
      o.connect(f); f.connect(g); g.connect(d);
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.36, t+0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.2); o.start(t); o.stop(t+0.22); return 0.2; } },
  ],
};


// Snapshot of default synths for restoration (labels never change)
const defaultSounds = sounds.map(s => ({ synth: s.synth }));

function switchMood(mood) {
  if (playing) stopPlaying();
  currentMood = mood;

  const set = mood === 'default' ? defaultSounds : moodSets[mood];
  sounds.forEach((s, i) => { s.synth = set[i].synth; });

  // Reset screen (labels stay the same — only synth functions swap)
  resetScreen();
}

function setupMoodButtons() {
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchMood(btn.dataset.mood);
    });
  });
}

// ── Screen ─────────────────────────────────────────────────────────────────

const WAVES = [
  '▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇',
  '▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█',
  '▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇',
  '▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆',
  '▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅',
  '▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄',
];
const FLAT = '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁';

let waveFrame = 0, waveTimer = null;

function startWave() {
  waveTimer = setInterval(() => {
    document.getElementById('screen-wave').textContent = WAVES[waveFrame++ % WAVES.length];
  }, 80);
}

function stopWave() {
  clearInterval(waveTimer); waveTimer = null;
  document.getElementById('screen-wave').textContent = FLAT;
}

function flashScreen(name, soundId) {
  const el = document.getElementById('screen');
  el.classList.add('flash');
  setTimeout(() => {
    document.getElementById('screen-name').textContent   = name;
    document.getElementById('screen-status').textContent = 'PLAY';
    const snip = soundId && snippets[soundId];
    document.getElementById('screen-token').textContent = snip ? snip.token : '—————————';
    document.getElementById('screen-code').textContent  = snip ? snip[currentPlatform] : '————————————————';
    el.classList.remove('flash');
  }, 55);
}

function resetScreen() {
  const el = document.getElementById('screen');
  el.classList.add('flash');
  setTimeout(() => {
    document.getElementById('screen-name').textContent   = '——————';
    document.getElementById('screen-status').textContent = 'READY';
    document.getElementById('screen-token').textContent  = '—————————';
    document.getElementById('screen-code').textContent   = '————————————————';
    el.classList.remove('flash');
  }, 55);
}

// ── Playback ───────────────────────────────────────────────────────────────

let playing   = null;
let playTimer = null;
let loopTimer = null;

function scheduleLoop(id, duration) {
  clearTimeout(loopTimer);
  if (!params.loop.value || playing !== id) return;
  loopTimer = setTimeout(() => {
    if (!params.loop.value || playing !== id) return;
    const sound = sounds.find(s => s.id === id);
    if (sound) scheduleLoop(id, sound.synth());
  }, duration * 1000 - 15);
}

function stopPlaying() {
  clearTimeout(playTimer);
  clearTimeout(loopTimer);
  if (playing) {
    document.querySelector(`.key[data-id="${playing}"]`)?.classList.remove('pressed');
    document.querySelector(`.pip-dot[data-id="${playing}"]`)?.classList.remove('active');
  }
  document.getElementById('led').classList.remove('on');
  stopWave();
  resetScreen();
  playing = null;
}

function triggerSound(id) {
  const prev = playing;
  if (prev) {
    stopPlaying();
    if (prev === id) return; // toggle off
  }

  const sound = sounds.find(s => s.id === id);
  if (!sound) return;

  playing = id;
  document.querySelector(`.key[data-id="${id}"]`).classList.add('pressed');
  document.querySelector(`.pip-dot[data-id="${id}"]`)?.classList.add('active');
  document.getElementById('led').classList.add('on');
  flashScreen(sound.name, currentMood === 'default' ? sound.id : null);
  startWave();

  const duration = sound.synth();

  if (params.loop.value) {
    scheduleLoop(id, duration);
  } else {
    playTimer = setTimeout(() => {
      // If loop was enabled mid-play, start looping instead of stopping
      if (params.loop.value && playing === id) {
        scheduleLoop(id, sound.synth());
        return;
      }
      if (playing === id) stopPlaying();
    }, duration * 1000 + 80);
  }
}

// ── Encoders ───────────────────────────────────────────────────────────────

function dotAngle(value) {
  return -135 + value * 270; // -135° (min) to +135° (max)
}

function updateEncoderVisual(key) {
  const unit = document.querySelector(`.encoder-unit[data-param="${key}"]`);
  if (!unit) return;
  const arm  = unit.querySelector('.encoder-dot-arm');
  const knob = unit.querySelector('.encoder-knob');
  const cfg  = encoderCfg[key];
  const v    = params[key].value;

  arm.style.transform = `rotate(${dotAngle(v)}deg)`;

  if (key === 'loop') {
    const on = v > 0.5;
    unit.classList.toggle('loop-on', on);
    knob.style.boxShadow = on
      ? [
          `0 0 0 1px rgba(0,0,0,0.32)`,
          `0 0 0 2.5px rgba(210,205,198,0.42)`,
          `0 5px 0 ${cfg.dark}`,
          `0 6px 0 rgba(0,0,0,0.22)`,
          `0 7px 18px rgba(0,0,0,0.36)`,
          `0 0 14px rgba(158,154,148,0.5)`,
          `inset 0 1px 0 rgba(255,255,255,0.14)`,
          `inset 0 -2px 4px rgba(0,0,0,0.22)`
        ].join(', ')
      : [
          `0 0 0 1px rgba(0,0,0,0.32)`,
          `0 0 0 2.5px rgba(210,205,198,0.42)`,
          `0 5px 0 ${cfg.dark}`,
          `0 6px 0 rgba(0,0,0,0.22)`,
          `0 7px 18px rgba(0,0,0,0.36)`,
          `inset 0 1px 0 rgba(255,255,255,0.14)`,
          `inset 0 -2px 4px rgba(0,0,0,0.22)`
        ].join(', ');
  }
}

function setupEncoders() {
  document.querySelectorAll('.encoder-unit').forEach(unit => {
    const key  = unit.dataset.param;
    const cfg  = encoderCfg[key];
    const knob = unit.querySelector('.encoder-knob');

    // Apply knob color — flat-top cylinder, like the OP-1 dials.
    // Depth comes from the hard bottom edge, not from the top surface gradient.
    knob.style.background = [
      // Very faint overhead sheen — centered, barely perceptible (lit from above, flat surface)
      `radial-gradient(ellipse 72% 55% at 50% 22%, rgba(255,255,255,0.16) 0%, transparent 100%)`,
      // Slight rim darkening on the outer edge of the flat top
      `radial-gradient(circle at 50% 50%, ${cfg.light} 0%, ${cfg.color} 58%, ${cfg.dark} 100%)`
    ].join(', ');
    knob.style.boxShadow = [
      // Groove ring — where the knob base meets the panel surface
      `0 0 0 1px rgba(0,0,0,0.32)`,
      // Panel-color seating ring just outside
      `0 0 0 2.5px rgba(210,205,198,0.42)`,
      // Hard colored step — the visible cylinder side wall (key OP-1 detail)
      `0 5px 0 ${cfg.dark}`,
      `0 6px 0 rgba(0,0,0,0.22)`,
      // Elevation drop shadow
      `0 7px 18px rgba(0,0,0,0.36)`,
      // Very subtle inner rim — the edge where flat top meets the cylinder side
      `inset 0 1px 0 rgba(255,255,255,0.14)`,
      `inset 0 -2px 4px rgba(0,0,0,0.22)`
    ].join(', ');
    knob.style.borderRadius = '50%';

    updateEncoderVisual(key);

    if (cfg.isToggle) {
      knob.style.cursor = 'pointer';
      knob.addEventListener('click', () => {
        params[key].value = params[key].value > 0.5 ? 0 : 1;
        applyParam(key);
        updateEncoderVisual(key);
        // Turning loop off while looping → stop
        if (key === 'loop' && !params.loop.value && playing) {
          stopPlaying();
        }
      });
    } else {
      let startY = null, startVal = null;

      const onStart = (clientY) => { startY = clientY; startVal = params[key].value; };
      const onMove  = (clientY) => {
        if (startY === null) return;
        params[key].value = Math.max(0, Math.min(1, startVal + (startY - clientY) / 140));
        applyParam(key);
        updateEncoderVisual(key);
      };
      const onEnd   = () => { startY = null; startVal = null; };

      knob.addEventListener('mousedown',  e => { onStart(e.clientY); e.preventDefault(); });
      knob.addEventListener('touchstart', e => { onStart(e.touches[0].clientY); e.preventDefault(); }, { passive: false });
      document.addEventListener('mousemove',  e => onMove(e.clientY));
      document.addEventListener('touchmove',  e => { onMove(e.touches[0].clientY); e.preventDefault(); }, { passive: false });
      document.addEventListener('mouseup',  onEnd);
      document.addEventListener('touchend', onEnd);
    }
  });
}

// ── Render ─────────────────────────────────────────────────────────────────

function render() {
  const pipsRow   = document.getElementById('pips-row');
  const keysRow   = document.getElementById('keys-row');
  const labelsRow = document.getElementById('labels-row');

  sounds.forEach(s => {
    // Pip
    const pip = document.createElement('div');
    pip.className = 'pip';
    const dot = document.createElement('div');
    dot.className = 'pip-dot';
    dot.dataset.id = s.id;
    pip.appendChild(dot);
    pipsRow.appendChild(pip);

    // Key
    const key = document.createElement('button');
    key.className = 'key';
    key.dataset.id = s.id;
    key.setAttribute('aria-label', s.name);
    key.addEventListener('click', () => triggerSound(s.id));
    keysRow.appendChild(key);

    // Label
    const label = document.createElement('span');
    label.className = 'key-label';
    label.textContent = s.name;
    labelsRow.appendChild(label);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

function setupPlatformButtons() {
  document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPlatform = btn.dataset.platform;
      document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Update code line live if a sound is currently displayed
      if (playing) {
        const snip = snippets[playing];
        if (snip) document.getElementById('screen-code').textContent = snip[currentPlatform];
      }
    });
  });
}

// ── Mobile layout ───────────────────────────────────────────────────────────
// On narrow viewports (<500px), rotate the device -90deg so the keyboard
// fits within the phone's portrait window.

function applyMobileLayout() {
  const device = document.querySelector('.device');
  if (!device) return;

  if (window.innerWidth <= 499) {
    // Measure natural dimensions — offsetWidth/Height force synchronous layout
    const dw = device.offsetWidth  || 620;
    const dh = device.offsetHeight || 350;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // After -90deg rotation: visual width = dh, visual height = dw
    // 30px padding on each side = 60px off each axis
    const pad = 60;
    const scale = Math.min((vw - pad) / dh, (vh - pad) / dw);

    // left:50% top:50% puts the top-left at viewport center.
    // translate(-50%,-50%) then shifts the element so its own center sits there.
    // rotate(-90deg) spins around that center. scale(N) shrinks to fit.
    device.style.position        = 'fixed';
    device.style.left            = '50%';
    device.style.top             = '50%';
    device.style.margin          = '0';
    device.style.transformOrigin = 'center';
    device.style.transform       = `translate(-50%, -50%) rotate(-90deg) scale(${scale})`;
  } else {
    device.style.cssText = '';
  }
}

render();
setupEncoders();
setupPlatformButtons();
setupMoodButtons();

// Run immediately (dimensions available synchronously after render),
// then again on load so font-driven layout shifts are captured.
applyMobileLayout();
window.addEventListener('load',   applyMobileLayout);
window.addEventListener('resize', applyMobileLayout);
