import { sb, $, $$, esc, cat, I, mountShell, pageHead, requireSession, getProfile, pad, isoDate, fmtDur, toast, fail, TRACKS, openDialog } from "../core.js";
import { startAlarms, ping } from "../alarm.js";
import { BilliNative } from "../native.js";


mountShell("timer");
const { user } = await requireSession();
const main = $("#main"), KEY = "billi-timer", MIN = 60000;
const PRESETS = { "25": [25, 5], "50": [50, 10], "90": [90, 20], watch: null };
const q = new URLSearchParams(location.search);
let profile, totals = { gate: 0, all: 0 }, wake = null;

const WATER_EVERY = 45 * MIN;
const blank = () => ({ preset: "25", track: "gate", taskId: null, taskTitle: "", phase: "idle", began: 0, startedAt: 0, acc: 0, running: false, target: null, water: 0, away: 0 });
const waterOn = () => { try { return localStorage.getItem("billi-water") !== "0"; } catch { return true; } };
let awayAt = 0;
let S = blank();
try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved && PRESETS[saved.preset] !== undefined && TRACKS[saved.track]) S = { ...blank(), ...saved }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const elapsed = () => S.acc + (S.running ? Date.now() - S.startedAt : 0);
const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`; };

async function loadTotals() {
  const { data, error } = await sb.from("billi_focus").select("track,seconds").eq("day", isoDate());
  if (error) throw error;
  totals = { gate: data.filter(f => f.track === "gate").reduce((a, f) => a + f.seconds, 0) / 60, all: data.reduce((a, f) => a + f.seconds, 0) / 60 };
}
async function record(seconds) {
  seconds = Math.min(43200, Math.floor(seconds));
  const { error } = await sb.from("billi_focus").insert({ track: S.track, task_id: S.taskId, day: isoDate(new Date(S.began)), started_at: new Date(S.began).toISOString(), seconds });
  if (error) throw error;
  await loadTotals();
}
async function lock(on) {
  try { if (on && "wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } else if (!on && wake) { await wake.release(); wake = null; } } catch {}
}

function render() {
  const busy = S.phase !== "idle";
  main.innerHTML = `${pageHead("Timer", "Minutes you study here count toward today.")}
  <div class="stack">
    <fieldset class="study-hide" ${busy ? "disabled" : ""}><legend>I am studying for</legend><div class="seg" style="margin-top:6px">
      ${Object.entries(TRACKS).map(([k, l]) => `<label><input type="radio" name="track" value="${k}" ${S.track === k ? "checked" : ""}><span>${l}</span></label>`).join("")}
    </div></fieldset>
    <fieldset class="study-hide" ${busy ? "disabled" : ""}><legend>Length</legend><div class="seg" style="margin-top:6px">
      ${[["25", "25 min, 5 break"], ["50", "50 min, 10 break"], ["90", "90 min, 20 break"], ["watch", "Stopwatch"]].map(([k, l]) => `<label><input type="radio" name="preset" value="${k}" ${S.preset === k ? "checked" : ""}><span>${l}</span></label>`).join("")}
    </div></fieldset>
    ${S.taskTitle ? `<p class="card" style="padding:10px 14px">Task: <b>${esc(S.taskTitle)}</b></p>` : ""}
    <section class="card pop" aria-label="Timer" style="text-align:center">
      <div class="timer-cat" id="tcat"></div>
      <div class="dial" id="dial"><svg viewBox="0 0 260 260" aria-hidden="true"><circle class="track" cx="130" cy="130" r="116" fill="none" stroke-width="16"/><circle class="prog" id="prog" cx="130" cy="130" r="116" fill="none" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * 116).toFixed(1)}" stroke-dashoffset="${(2 * Math.PI * 116).toFixed(1)}"/></svg>
        <div class="dial-in"><div class="clock" id="clock" role="timer" aria-live="off">00:00</div><div class="lab" id="lab"></div></div></div>
      <div class="rowflex" id="ctl" style="justify-content:center;margin-top:8px"></div>
    </section>
    <p class="study-note" id="snote">A website cannot block other apps. I count every time you leave this screen.</p>
    <p class="muted study-hide" id="tot" style="text-align:center"></p>
    <label class="switch study-hide"><span><b>Water reminder every 45 minutes</b><br><span class="muted" style="font-size:15px">Billi dances until you drink.</span></span><input type="checkbox" id="water" ${waterOn() ? "checked" : ""}></label>
  </div>`;
  paint(true);
}

function paint(full) {
  const C = 2 * Math.PI * 116, e = elapsed(), dial = $("#dial");
  if (!dial) return;
  let shown, frac, lab;
  if (S.phase === "idle") { const p = PRESETS[S.preset]; shown = p ? p[0] * MIN : 0; frac = 0; lab = p ? "Ready" : "Stopwatch"; }
  else if (S.target) { shown = S.target - e; frac = Math.min(1, e / S.target); lab = S.phase === "break" ? "Break" : S.running ? `${TRACKS[S.track]} focus` : "Paused"; }
  else { shown = e; frac = (e % 3600000) / 3600000; lab = S.running ? `${TRACKS[S.track]} stopwatch` : "Paused"; }
  $("#clock").textContent = clock(shown); $("#lab").textContent = lab;
  $("#prog").style.strokeDashoffset = (C * (1 - frac)).toFixed(1);
  $("#prog").style.visibility = frac < 0.003 ? "hidden" : "visible";
  dial.className = `dial ${S.phase === "break" ? "break" : S.track}`;
  document.title = S.phase === "idle" ? "Timer | Billi" : `${clock(shown)} ${lab} | Billi`;
  if (full) {
    $("#tcat").innerHTML = cat(S.phase === "focus" && S.running ? "sleep" : S.phase === "break" ? "play" : "idle", S.phase === "focus" && S.running ? "Billi naps while you study" : "Billi");
    $("#ctl").innerHTML = S.phase === "idle" ? `<button class="btn primary" id="go" style="min-width:180px">${I.play}Start</button>`
      : S.phase === "break" ? `<button class="btn" id="skip">Skip break</button>`
      : `${S.running ? `<button class="btn" id="pause">${I.pause}Pause</button>` : `<button class="btn primary" id="resume">${I.play}Resume</button>`}<button class="btn" id="finish">${I.stop}Finish</button><button class="btn sm" id="study" aria-pressed="${document.body.classList.contains("study")}">${document.body.classList.contains("study") ? "Leave study mode" : "Study mode"}</button>`;
    if (S.phase !== "focus") studyMode(false);
    const sn = $("#snote"); if (sn) sn.textContent = `A website cannot block other apps. I count every time you leave this screen${S.away ? `: ${S.away} so far` : ""}.`;
    $("#tot").textContent = `Today: ${fmtDur(totals.gate)} of GATE study (goal ${fmtDur(profile.gate_min)}), ${fmtDur(totals.all)} in total.`;
  }
}

// Study mode: full screen, nothing but the clock. The browser decides whether full screen is allowed; the layout works either way.
function studyMode(on) {
  if (document.body.classList.contains("study") === on) return;
  document.body.classList.toggle("study", on);
  try { if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch {}
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("study")) { document.body.classList.remove("study"); paint(true); } });
function waterBreak() {
  ping();
  if (document.hidden && "Notification" in window && Notification.permission === "granted") { try { new Notification("Water break", { body: "Drink a glass of water, then carry on.", tag: "billi-water", icon: "icon.svg" }); } catch {} }
  if ($("dialog.water")) return;
  const d = openDialog(`<div class="water">${cat("dance", "Billi is dancing")}<h2>Water break</h2><p class="muted">You have studied 45 minutes. Drink a glass of water. The clock keeps running.</p><div class="dlg-actions" style="justify-content:center"><button class="btn primary" data-close>Done, I drank</button></div></div>`);
  d.classList.add("water");
}
function startBreak(from) {
  const p = PRESETS[S.preset];
  S = { ...S, phase: "break", target: p[1] * MIN, acc: 0, startedAt: from, running: true };
}
async function completeFocus(endedAt) {
  const secs = S.target / 1000;
  try { await record(secs); toast(`Saved ${fmtDur(secs / 60)} of ${TRACKS[S.track]} study. Break time.`, "ok"); } catch (x) { fail(x, "Could not save this session. Check your internet."); }
  ping(); startBreak(endedAt); save(); render(); lock(false);
}
async function tick() {
  if (S.phase === "focus" && S.running && S.target && elapsed() >= S.target) { const endedAt = S.startedAt + (S.target - S.acc); S.running = false; await completeFocus(endedAt); }
  if (S.phase === "break" && elapsed() >= S.target) { S = { ...blank(), preset: S.preset, track: S.track }; save(); ping(); toast("Break is over."); render(); return; }
  if (S.phase === "focus" && S.running && waterOn()) { const due = Math.floor(elapsed() / WATER_EVERY); if (due > (S.water || 0)) { S.water = due; save(); waterBreak(); } }
  paint(false);
}

main.addEventListener("change", e => {
  if (e.target.id === "water") { try { localStorage.setItem("billi-water", e.target.checked ? "1" : "0"); } catch {} return; }
  if (e.target.name === "track") { S.track = e.target.value; save(); paint(true); }
  if (e.target.name === "preset") { S.preset = e.target.value; save(); paint(true); }
});
main.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const now = Date.now();
  const getBlocked = () => {
    try { return JSON.parse(localStorage.getItem("billi_blocked_apps") || '["com.instagram.android","com.google.android.youtube","com.zhiliaoapp.musically","com.twitter.android","com.reddit.frontpage","com.facebook.katana"]'); }
    catch { return ["com.instagram.android","com.google.android.youtube"]; }
  };

  if (b.id === "go") {
    const p = PRESETS[S.preset];
    S = { ...S, phase: "focus", began: now, startedAt: now, acc: 0, running: true, target: p ? p[0] * MIN : null };
    lock(true);
    BilliNative.startFocus(getBlocked());
    if (S.target) BilliNative.scheduleExactAlarm(101, now + S.target, "Focus session complete", "Time for your break!");
  }
  else if (b.id === "pause") {
    S.acc = elapsed(); S.running = false; lock(false);
    BilliNative.stopFocus();
  }
  else if (b.id === "resume") {
    S.startedAt = now; S.running = true; lock(true);
    BilliNative.startFocus(getBlocked());
    if (S.target) BilliNative.scheduleExactAlarm(101, now + (S.target - S.acc), "Focus session complete", "Time for your break!");
  }
  else if (b.id === "skip") {
    S = { ...blank(), preset: S.preset, track: S.track };
    BilliNative.stopFocus();
  }
  else if (b.id === "study") { studyMode(!document.body.classList.contains("study")); paint(true); $("#study")?.focus(); return; }
  else if (b.id === "finish") {
    const secs = Math.floor(elapsed() / 1000); b.disabled = true;
    BilliNative.stopFocus();
    if (secs >= 60) { try { await record(secs); toast(`Saved ${fmtDur(secs / 60)} of ${TRACKS[S.track]} study.`, "ok"); } catch (x) { b.disabled = false; fail(x, "Could not save this session. Check your internet."); return; } }
    else toast("Under a minute, so nothing was saved.");
    S = { ...blank(), preset: S.preset, track: S.track }; lock(false);
  } else return;
  save(); render(); $("#ctl button")?.focus();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (S.phase === "focus" && S.running) awayAt = Date.now(); return; }
  tick(); if (S.running && S.phase === "focus") lock(true);
  if (awayAt && S.phase === "focus") {                       // left the page in the middle of a focus session
    const gone = Math.round((Date.now() - awayAt) / 1000); awayAt = 0;
    if (gone >= 5) { S.away = (S.away || 0) + 1; save(); paint(true);
      if (!$("dialog[open]")) openDialog(`<div class="water">${cat("sulk", "Billi is sulking")}<h2>You left for ${gone >= 60 ? fmtDur(gone / 60) : gone + " seconds"}</h2><p class="muted">That is ${S.away} ${S.away === 1 ? "time" : "times"} this session. The clock kept running.</p><div class="dlg-actions" style="justify-content:center"><button class="btn primary" data-close>Back to work</button></div></div>`); }
  }
});

try {
  profile = await getProfile(user);
  if (S.phase === "idle") {
    if (TRACKS[q.get("track")]) S.track = q.get("track");
    const tid = q.get("task");
    if (tid) { const { data } = await sb.from("billi_tasks").select("id,title,track").eq("id", tid).maybeSingle(); if (data) { S.taskId = data.id; S.taskTitle = data.title; S.track = data.track; } }
    else { S.taskId = null; S.taskTitle = ""; }
    save();
  }
  await loadTotals();
  render(); await tick();
  setInterval(tick, 500);
  startAlarms(user, profile);
} catch (x) { main.innerHTML = `${pageHead("Timer")}<div class="card empty"><h2>Could not load the timer</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="timer.html">Try again</a></div>`; console.error(x); }
