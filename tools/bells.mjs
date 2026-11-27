// Usage: node tools/bells.mjs   (needs ffmpeg with libopus)
// Draws heirloom's three bells from numbers alone, so there is no recording and no licence to
// carry, and writes each as Opus in Ogg to the web app (client/public/sounds/<id>.ogg) and the
// phone (android/app/src/main/res/raw/bell_<id>.ogg). Run it again after changing a bell here;
// the files are committed so a build needs no ffmpeg.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RATE = 48000;

// A struck mode rings as a sine that dies away: amp * 10^(-4 t / fade) falls 80 dB in `fade` s.
const fall = (t, fade) => Math.pow(10, (-4 * t) / fade);

// Two seeded random streams, so the files come out the same on every run.
function random(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * The school bell: an electric bell, a hammer beating a dome about 18 times a second for 3.4 s,
 * then the dome ringing out. Each blow tops up every mode of the dome (inharmonic, as a bell's are)
 * towards its ceiling, and adds a short metal tick, which is what makes it a bell and not a tone.
 */
function school() {
  const modes = [
    // [Hz, ceiling, seconds to fall 80 dB]
    [1046, 1.0, 1.6],
    [2590, 0.55, 0.9],
    [3720, 0.4, 0.55],
    [5230, 0.28, 0.35],
    [6900, 0.16, 0.2],
  ];
  const ringing = 3.4;
  const out = new Float32Array(Math.round(RATE * (ringing + 0.9)));
  const rnd = random(1903);
  const amp = modes.map(() => 0);
  let next = 0;
  let tick = 0;
  let noise = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    if (t >= next && t < ringing) {
      // A blow: each mode climbs a third of the way to its ceiling, a little unevenly.
      modes.forEach(([, top], m) => (amp[m] += (top - amp[m]) * (0.3 + 0.08 * rnd())));
      tick = 1;
      next += 1 / (18 * (0.97 + 0.06 * rnd()));
    }
    let v = 0;
    modes.forEach(([hz, , fade], m) => {
      v += amp[m] * Math.sin(2 * Math.PI * hz * t);
      amp[m] *= fall(1 / RATE, fade);
    });
    // The tick: 2 ms of noise at each blow, smoothed so it knocks rather than hisses.
    noise += 0.35 * ((rnd() * 2 - 1) - noise);
    v += tick * 0.12 * noise;
    tick *= fall(1 / RATE, 0.002);
    out[i] = v;
  }
  return out;
}

/** The struck bell the web has played since section 8 (client/src/platform/sound.ts), held longer. */
function struck() {
  const partials = [
    [880, 0.16, 2.0],
    [884, 0.08, 1.7],
    [1760, 0.1, 1.3],
    [2429, 0.08, 0.8],
    [3582, 0.05, 0.5],
    [4752, 0.03, 0.3],
  ];
  const out = new Float32Array(Math.round(RATE * 2.1));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const up = Math.min(1, t / 0.003);
    out[i] = partials.reduce((v, [hz, peak, fade]) => v + up * peak * fall(t, fade) * Math.sin(2 * Math.PI * hz * t), 0);
  }
  return out;
}

/** The soft chime: three notes rising (C, E, G an octave above middle), each round and quiet. */
function chime() {
  const notes = [1046.5, 1318.5, 1568.0];
  const apart = 0.22;
  const out = new Float32Array(Math.round(RATE * 2.2));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    let v = 0;
    notes.forEach((hz, n) => {
      const s = t - n * apart;
      if (s < 0) return;
      const up = Math.min(1, s / 0.008);
      const d = fall(s, 1.5);
      v += up * d * (Math.sin(2 * Math.PI * hz * s) + 0.15 * Math.sin(2 * Math.PI * 2 * hz * s) + 0.05 * Math.sin(2 * Math.PI * 2.76 * hz * s));
    });
    out[i] = v;
  }
  return out;
}

// Peaks at -3 dBFS, with 10 ms faded at each end so no file starts or stops on a click.
function finish(x) {
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const edge = Math.round(RATE * 0.01);
  return x.map((v, i) => (v / peak) * 0.708 * Math.min(1, i / edge, (x.length - 1 - i) / edge));
}

function wav(x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + x.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(x.length * 2, 40);
  x.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return b;
}

const web = 'client/public/sounds';
const raw = 'android/app/src/main/res/raw';
fs.mkdirSync(web, { recursive: true });
fs.mkdirSync(raw, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bells-'));
for (const [id, draw] of Object.entries({ school, struck, chime })) {
  const src = path.join(tmp, `${id}.wav`);
  fs.writeFileSync(src, wav(finish(draw())));
  const dst = path.join(web, `${id}.ogg`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-map_metadata', '-1', dst]);
  fs.copyFileSync(dst, path.join(raw, `bell_${id}.ogg`));
  console.log(`${id}: ${(fs.statSync(dst).size / 1024).toFixed(1)} KB`);
}
fs.rmSync(tmp, { recursive: true });
