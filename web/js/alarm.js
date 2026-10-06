// Rings for classes, tasks and the GATE block while the app is open in the browser.
// A website cannot ring after its tab is closed; that needs the phone app. Settings says so plainly.
import { $, cat, esc, isoDate, pad, reducedMotion } from "./core.js";
import { loadDay } from "./data.js";

const FIRED = "billi-fired", SNOOZE = "billi-snooze", LATE_MS = 10 * 60000;
let who = null, events = [], current = null, queue = [], actx = null, beepTimer = null;

const read = k => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
function markFired(id) { const iso = isoDate(), all = read(FIRED), today = all[iso] || {}; today[id] = Date.now(); write(FIRED, { [iso]: today }); }
const wasFired = id => !!(read(FIRED)[isoDate()] || {})[id];

/* ---------- sound: four ringtones, all made in the browser, so there are no audio files to load or license ----------
   A meow is a sawtooth "voice" whose pitch rises then falls, pushed through two moving band-pass filters (the mouth
   opening and closing: "mi-a-ow"). Changing pitch, length and roughness gives the grumpy cat and the kittens. */
function unlock() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch {} }
["pointerdown", "keydown"].forEach(ev => addEventListener(ev, unlock, { once: true, passive: true }));

function meow(ctx, t, { lo = 520, hi = 800, end = 400, dur = 0.62, gain = 0.5, growl = 0 } = {}) {
  const voice = ctx.createOscillator(), out = ctx.createGain(), wob = ctx.createOscillator(), wobAmt = ctx.createGain();
  voice.type = "sawtooth";
  voice.frequency.setValueAtTime(lo, t); voice.frequency.linearRampToValueAtTime(hi, t + dur * 0.3); voice.frequency.exponentialRampToValueAtTime(end, t + dur);
  wob.frequency.value = growl ? 31 : 6.5; wobAmt.gain.value = growl ? lo * 0.22 : 9; wob.connect(wobAmt).connect(voice.frequency);
  const mouth = [[320, 900, 430, 5], [2400, 1500, 850, 7]].map(([a, m, z, q]) => {       // two formants sweeping i -> a -> u
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
    f.frequency.setValueAtTime(a, t); f.frequency.linearRampToValueAtTime(m, t + dur * 0.35); f.frequency.linearRampToValueAtTime(z, t + dur);
    voice.connect(f).connect(out); return f;
  });
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(gain * 2.2, t + 0.06);
  out.gain.setValueAtTime(gain * 2.2, t + dur * 0.55); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(ctx.destination);
  voice.start(t); wob.start(t); voice.stop(t + dur + 0.02); wob.stop(t + dur + 0.02);
  return mouth.length;
}
function ding(ctx, t, f, gain = 0.3) {
  [1, 2.76].forEach((mult, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f * mult;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain / (i + 1), t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.72); });
}
// Each ringtone plays one "round" starting at time t and says how long to wait before the next round (seconds).
// n counts the rounds, so the cat gets louder and more dramatic the longer you ignore it.
export const TONES = {
  meow(ctx, t, n) { const push = Math.min(n, 6) / 6, big = n % 4 === 3;
    meow(ctx, t, { gain: 0.3 + 0.2 * push, dur: big ? 1.05 : 0.6, hi: big ? 930 : 800 + 60 * push }); return big ? 1.6 : 1.15; },
  grumpy(ctx, t, n) { const push = Math.min(n, 6) / 6;
    meow(ctx, t, { lo: 250, hi: 330 + 30 * push, end: 170, dur: 0.95, gain: 0.34 + 0.2 * push, growl: 1 }); return 1.5; },
  kitten(ctx, t, n) { const k = 2 + (n % 3);
    for (let i = 0; i < k; i++) meow(ctx, t + i * 0.27, { lo: 950, hi: 1400 + 50 * i, end: 900, dur: 0.21, gain: 0.3 }); return k * 0.27 + 0.6; },
  bell(ctx, t, n) { ding(ctx, t, 880); ding(ctx, t + 0.22, 1174.7); return 1.1; }
};
export const AUDIO_FILES = {
  uncle_ji: "sounds/uncle_ji_pani.mp3",
  funny_meme: "sounds/funny_meme.mp3",
  comedy_twinkle: "sounds/comedy_twinkle.mp3",
  tenge_tenge: "sounds/tenge_tenge.mp3",
  lululu: "sounds/lululu.mp3"
};

export const TONE_NAMES = {
  uncle_ji: "Uncle Ji Paani Pila Dijiye",
  funny_meme: "Funny Meme Alarm",
  comedy_twinkle: "Comedy Twinkle",
  tenge_tenge: "Tenge Tenge",
  lululu: "Lululu Lululu",
  meow: "Meow",
  grumpy: "Grumpy cat",
  kitten: "Kittens",
  bell: "Bell"
};

const audioCache = new Map();
function getAudio(src) {
  if (!audioCache.has(src)) {
    const a = new Audio(src);
    a.preload = "auto";
    audioCache.set(src, a);
  }
  return audioCache.get(src);
}

function preloadAll() {
  try {
    Object.values(AUDIO_FILES).forEach(src => getAudio(src));
  } catch {}
}
["pointerdown", "keydown"].forEach(ev => addEventListener(ev, preloadAll, { once: true, passive: true }));

let activeAudio = null;

const toneOf = () => {
  if (who && who.profile && (AUDIO_FILES[who.profile.ringtone] || TONES[who.profile.ringtone])) return who.profile.ringtone;
  try {
    const saved = localStorage.getItem("billi_ringtone");
    if (saved && (AUDIO_FILES[saved] || TONES[saved])) return saved;
  } catch {}
  return "uncle_ji";
};

function startSound() {
  stopSound(); if (!who || !who.profile || who.profile.sound === false) return;
  const tKey = toneOf();
  if (AUDIO_FILES[tKey]) {
    try {
      activeAudio = getAudio(AUDIO_FILES[tKey]);
      activeAudio.currentTime = 0;
      activeAudio.loop = true;
      activeAudio.play().catch(() => {});
    } catch {}
    return;
  }
  unlock();
  let n = 0; const tone = TONES[tKey] || TONES.meow;
  const round = () => { let wait = 1.2; if (actx && actx.state === "running") wait = tone(actx, actx.currentTime + 0.02, n++); beepTimer = setTimeout(round, wait * 1000); };
  round();
}

function stopSound() {
  if (beepTimer) clearTimeout(beepTimer); beepTimer = null;
  if (activeAudio) {
    try { activeAudio.pause(); activeAudio.currentTime = 0; } catch {}
    activeAudio = null;
  }
}

export function preview(name) {
  stopSound();
  if (AUDIO_FILES[name]) {
    try {
      activeAudio = getAudio(AUDIO_FILES[name]);
      activeAudio.currentTime = 0;
      activeAudio.loop = false;
      activeAudio.play().catch(() => {});
    } catch {}
    return;
  }
  unlock();
  if (actx && actx.state === "running" && TONES[name]) TONES[name](actx, actx.currentTime + 0.02, 3);
}
// Renders one ringtone silently and measures it. The tests use this to prove each one makes real, different, unclipped sound.
export async function measureTone(name, rounds = 2) {
  const sr = 22050, ctx = new OfflineAudioContext(1, sr * 4, sr);
  let t = 0.05; for (let n = 0; n < rounds; n++) t += TONES[name](ctx, t, n);
  const d = (await ctx.startRendering()).getChannelData(0);
  let sum = 0, peak = 0, at = 0;
  for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; if (Math.abs(d[i]) > peak) { peak = Math.abs(d[i]); at = i; } }
  // pitch of the loudest moment, by autocorrelation: the shortest lag at which the wave lines up with itself
  const N = 2048, s0 = Math.max(0, Math.min(d.length - N - 160, at - N / 2)), score = [];
  for (let lag = 12; lag <= 150; lag++) { let c = 0; for (let i = 0; i < N; i++) c += d[s0 + i] * d[s0 + i + lag]; score.push([lag, c]); }
  const best = Math.max(...score.map(x => x[1])), first = score.find((x, i) => x[1] >= 0.85 * best && (i === 0 || x[1] >= score[i - 1][1]) && (i === score.length - 1 || x[1] >= score[i + 1][1])) || score[0];
  // how much of the sound sits below about 350 Hz: a deep, grumpy voice scores high, a squeaky kitten low
  let y = 0, lowSum = 0; const k = 1 - Math.exp(-2 * Math.PI * 350 / sr);
  for (let i = 0; i < d.length; i++) { y += k * (d[i] - y); lowSum += y * y; }
  return { rms: Math.sqrt(sum / d.length), peak, pitch: sr / first[0], low: lowSum / sum };
}

/* ---------- the ringing screen ---------- */
function label(ev) {
  const time = `${pad(ev.start.getHours())}:${pad(ev.start.getMinutes())}`;
  if (ev.kind === "class") return { title: ev.title, line: `Class at ${time}${ev.room ? ", " + ev.room : ""}` };
  if (ev.kind === "gate") return { title: "GATE study time", line: `${ev.minutes} minutes are free now` };
  return { title: ev.title, line: `Task at ${time}` };
}

function generatePuzzle() {
  const types = ["add_mult", "mod", "algebra", "hex_bin"];
  const pick = types[Math.floor(Math.random() * types.length)];
  if (pick === "add_mult") {
    const a = 12 + Math.floor(Math.random() * 25), b = 3 + Math.floor(Math.random() * 7), c = 10 + Math.floor(Math.random() * 30);
    return { q: `${a} × ${b} + ${c}`, ans: a * b + c };
  } else if (pick === "mod") {
    const a = 100 + Math.floor(Math.random() * 150), b = 7 + Math.floor(Math.random() * 9);
    return { q: `${a} mod ${b}`, ans: a % b };
  } else if (pick === "algebra") {
    const x = 3 + Math.floor(Math.random() * 15), k = 2 + Math.floor(Math.random() * 5), m = 5 + Math.floor(Math.random() * 20);
    const rhs = k * x + m;
    return { q: `Find x: ${k}x + ${m} = ${rhs}`, ans: x };
  } else {
    const a = 15 + Math.floor(Math.random() * 35), b = 10 + Math.floor(Math.random() * 30);
    return { q: `${a} + ${b}`, ans: a + b };
  }
}

function ring(ev) {
  if (current) { queue.push(ev); return; }
  current = ev; markFired(ev.id);
  const { title, line } = label(ev);
  const p = generatePuzzle();
  const d = document.createElement("dialog");
  d.className = "ring"; d.setAttribute("role", "alertdialog"); d.setAttribute("aria-labelledby", "ring-t"); d.setAttribute("aria-describedby", "ring-l");
  d.innerHTML = `<div class="ring-cat">${cat("yowl", "Billi is calling you")}</div>
    <h2 id="ring-t">${esc(title)}</h2><p id="ring-l">${esc(line)}</p>
    ${ev.strict ? `<form class="ring-sum" novalidate><label for="ring-a">🧠 <b>Wake-Up Challenge</b>: Solve to stop audio:<br><span style="font-size:18px;color:#f59e0b;font-weight:700">${esc(p.q)}</span></label><div class="ring-sumrow" style="margin-top:8px"><input id="ring-a" inputmode="numeric" autocomplete="off" placeholder="Enter answer" aria-describedby="ring-e"><button class="btn primary" type="submit">Unlock & Stop</button></div><p id="ring-e" class="err" role="alert"></p></form>` : ""}
    <div class="ring-actions"><button class="btn primary" id="ring-stop" ${ev.strict ? "hidden" : ""}>Stop Alarm</button><button class="btn" id="ring-snooze">Snooze 5 min</button></div>`;
  document.body.appendChild(d);
  const done = () => { stopSound(); if (navigator.vibrate) navigator.vibrate(0); d.close(); d.remove(); current = null; const n = queue.shift(); if (n) ring(n); };
  d.addEventListener("cancel", e => { if (ev.strict && $("#ring-stop", d).hidden) e.preventDefault(); else { e.preventDefault(); done(); } });
  $("#ring-stop", d).addEventListener("click", done);
  $("#ring-snooze", d).addEventListener("click", () => { const s = read(SNOOZE); s[ev.id] = { at: Date.now() + 5 * 60000, ev: { ...ev, start: ev.start.getTime(), end: ev.end.getTime(), ringAt: null, task: undefined } }; write(SNOOZE, s); done(); });
  if (ev.strict) {
    let tries = 0;
    const escape = setTimeout(() => { $("#ring-stop", d).hidden = false; }, 120000);     // never trap the phone
    $(".ring-sum", d).addEventListener("submit", e => {
      e.preventDefault();
      if (Number($("#ring-a", d).value.trim()) === p.ans) {
        clearTimeout(escape);
        try {
          const curXp = parseInt(localStorage.getItem("billi_xp") || "0", 10);
          localStorage.setItem("billi_xp", (curXp + 20).toString());
        } catch {}
        done();
        return;
      }
      tries++; $("#ring-e", d).textContent = tries >= 3 ? "Incorrect. You can also use Stop below." : "Incorrect. Try again!";
      if (tries >= 3) $("#ring-stop", d).hidden = false;
      $("#ring-a", d).select();
    });
  }
  d.showModal();
  if (ev.strict) $("#ring-a", d).focus();
  startSound();
  if (navigator.vibrate && !reducedMotion()) navigator.vibrate([300, 150, 300, 150, 300]);
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body: line, tag: ev.id, icon: "icon.svg" }); } catch {}
  }
}

function check() {
  const now = Date.now();
  for (const ev of events) {
    if (!ev.ringAt) continue;
    const due = ev.ringAt.getTime();
    if (due <= now && now - due < LATE_MS && !wasFired(ev.id)) ring(ev);
  }
  const s = read(SNOOZE); let changed = false;
  for (const [id, v] of Object.entries(s)) {
    if (v.at <= now) { delete s[id]; changed = true; if (now - v.at < LATE_MS) { ring({ ...v.ev, id: id + ":z" + v.at, start: new Date(v.ev.start), end: new Date(v.ev.end) }); } }
  }
  if (changed) write(SNOOZE, s);
}

async function refresh() {
  try { events = (await loadDay(who.user, who.profile)).events; check(); } catch (e) { console.warn("alarm refresh failed", e); }
}
export async function refreshAlarms() { if (who) await refresh(); }                // call after anything that changes the schedule
export function setDay(day) { events = day.events; check(); }                 // pages that already loaded the day pass it in
export function nextRing() { const now = Date.now(); return events.filter(e => e.ringAt && e.ringAt.getTime() > now).sort((a, b) => a.ringAt - b.ringAt)[0] || null; }
export function testRing(strict = false) { const n = new Date(); ring({ id: "test:" + n.getTime(), kind: "task", title: "Test alarm", start: n, end: n, strict }); }
export async function startAlarms(user, profile, day) {
  who = { user, profile };
  if (day) setDay(day); else await refresh();
  setInterval(check, 10000);
  setInterval(refresh, 180000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}
export function ping() { unlock(); if (actx && actx.state === "running") { ding(actx, actx.currentTime + 0.02, 880); ding(actx, actx.currentTime + 0.24, 1318.5); } }
