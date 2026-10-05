import { sb, $, esc, cat, skyWindow, pawBurst, I, mountShell, pageHead, requireSession, getProfile, pad, fmtDur, daysUntil, toast, fail, DAYS_LONG, dayNum, TRACKS } from "../core.js";
import { loadDay } from "../data.js";
import { loadGate } from "../gate-data.js";
import { startAlarms, setDay } from "../alarm.js";
import { playIntro } from "../intro.js";

mountShell("today");
const { user } = await requireSession();
playIntro();
const main = $("#main");
const t = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
let profile, day, gate = null;

function mood() {
  const gateLeft = profile.gate_min - Math.floor(day.gateDoneMin), h = new Date().getHours();
  const real = day.events.filter(e => e.kind !== "gate");
  const first = profile.name ? profile.name.trim().split(/\s+/)[0] : "";
  if (!real.length && !day.loose.length) return ["sleep", `Nothing is planned${first ? ", " + first : ""}. Add your timetable and I will ring for every class.`];
  if (day.tasksLeft === 0 && gateLeft <= 0) return ["play", "Everything is done for today. I am off to play with my yarn."];
  if (h >= 21 && gateLeft > 0) return ["sulk", `It is late and ${fmtDur(gateLeft)} of GATE study is still left today.`];
  const n = day.next, g = day.gate, now = new Date();
  if (n && n.start <= now) return ["idle", `${n.title} is on now, until ${t(n.end)}.`];
  if (g && g.startsNow) return ["idle", `You are free now. Good time for ${fmtDur(g.minutes)} of GATE study.`];
  if (n) return ["idle", `${n.title} is next, at ${t(n.start)}.`];
  if (g) return ["idle", `Your free time for GATE study starts at ${t(g.start)}.`];
  return ["idle", day.tasksLeft ? `No more classes today. ${day.tasksLeft} ${day.tasksLeft === 1 ? "task is" : "tasks are"} left.` : "No more classes today."];
}

function row(e, now) {
  const live = !e.skipped && !e.done && e.start <= now && e.end > now;
  let sub = "", right = "";
  if (e.kind === "class") {
    sub = [e.room, e.personal ? "My timetable" : e.className, e.skipped ? "Cancelled today" : ""].filter(Boolean).join(", ");
    right = `<span class="tag class">Class</span>${e.canEdit ? `<button class="linkbtn" data-skip="${e.slotId}" data-on="${e.skipped ? 1 : 0}">${e.skipped ? "Undo" : "Cancel"}<span class="sr"> ${esc(e.title)} for today</span></button>` : ""}`;
  } else if (e.kind === "gate") {
    sub = `Suggested, ${fmtDur(e.minutes)} free`;
    right = `<a class="btn gate sm" href="timer.html?track=gate">Start</a>`;
  } else {
    sub = `${fmtDur(e.task.duration_min)}${e.task.alarm ? ", alarm on" : ""}`;
    right = `<span class="tag ${e.track}">${TRACKS[e.track]}</span>${tick(e.task)}`;
  }
  return `<li class="item${e.skipped || e.done ? " off" : ""}${live ? " now" : ""}"><div class="time">${t(e.start)}<small>${t(e.end)}</small></div><div><div class="t">${esc(e.title)}</div><div class="s">${esc(sub)}</div></div><div class="item-r">${right}</div></li>`;
}
const tick = task => `<button class="tick" role="checkbox" aria-checked="${task.done}" data-tick="${task.id}" aria-label="Done: ${esc(task.title)}">${I.check}</button>`;

function render() {
  const now = new Date(), [m, line] = mood();
  const gateDays = daysUntil(profile.gate_exam_date), done = Math.floor(day.gateDoneMin), pct = Math.min(100, Math.round(done / profile.gate_min * 100));
  const n = day.next, real = day.events.filter(e => e.kind !== "gate");
  const empty = !real.length && !day.loose.length;
  main.innerHTML = `${pageHead("Today", `${DAYS_LONG[dayNum(now) - 1]}, ${now.getDate()} ${now.toLocaleString("en-IN", { month: "long" })}`)}
  <div class="stack">
    <section class="scene" aria-label="Billi says"><div class="catbox">${skyWindow()}${cat(m)}</div><p class="bubble">${esc(line)}</p></section>
    <div class="counts">
      <div class="count"><b class="num">${gateDays >= 0 ? gateDays : 0}</b><span>${gateDays === 1 ? "day" : "days"} to GATE</span></div>
      <div class="count"><b class="num">${day.tasksLeft}</b><span>${day.tasksLeft === 1 ? "task" : "tasks"} left today</span></div>
    </div>
    <section class="card" aria-labelledby="gate-h">
      <div class="rowflex between"><h2 id="gate-h" style="font-size:18px">GATE study today</h2><span class="num">${fmtDur(done)} of ${fmtDur(profile.gate_min)}</span></div>
      <div class="bar${pct >= 100 ? " done" : ""}" style="margin:10px 0 12px" role="progressbar" aria-valuemin="0" aria-valuemax="${profile.gate_min}" aria-valuenow="${Math.min(done, profile.gate_min)}" aria-label="GATE study minutes today"><i style="width:${pct}%"></i></div>
      <div class="rowflex between"><span class="muted">${done >= profile.gate_max ? "That is your limit for today. Rest." : pct >= 100 ? "Daily goal reached." : `${fmtDur(profile.gate_min - done)} to go`}</span><a class="btn gate sm" href="timer.html?track=gate">${I.play}Start GATE timer</a></div>
      <p style="margin-top:12px;padding-top:10px;border-top:2px dashed var(--line);overflow-wrap:anywhere">${!profile.gate_paper ? `<a href="gate.html">Choose your GATE paper</a> to see what to study next.`
        : !gate ? `<a href="gate.html">Open your GATE syllabus</a>`
        : `${gate.summary.due.length ? `<a href="gate.html" class="tag gate" style="text-decoration:none;margin-right:6px">${gate.summary.due.length} to revise</a>` : ""}${gate.summary.next ? `Next topic: <a href="gate.html">${esc(gate.summary.next.text)}</a>` : `<a href="gate.html">Every topic is ticked.</a>`}`}</p>
    </section>
    ${n ? `<section class="card pop nextup" aria-label="Next up"><div class="bellwrap">${I.bell}</div><div style="min-width:0"><div class="muted" style="font-size:15px">${n.start <= now ? "Happening now" : n.ringAt && n.ringAt > now ? `Next up, rings at ${t(n.ringAt)}` : "Next up"}</div><div class="t" style="font:700 19px var(--font-d);overflow-wrap:anywhere">${esc(n.title)}, ${t(n.start)}</div></div></section>` : ""}
    ${empty ? `<section class="card empty"><h2>Your day is empty</h2><p class="muted">Add your class timetable once and it repeats every week.</p><div class="rowflex" style="justify-content:center"><a class="btn primary" href="timetable.html">Add timetable</a><a class="btn" href="tasks.html">Add a task</a></div></section>` : `
    <section aria-labelledby="sch-h"><h2 id="sch-h" class="section-t">Schedule</h2><ul class="list" style="list-style:none;padding:0;margin:0">${day.events.map(e => row(e, now)).join("") || `<li class="muted" style="padding:12px 0">No classes or timed tasks today.</li>`}</ul></section>
    ${day.loose.length ? `<section aria-labelledby="any-h"><h2 id="any-h" class="section-t">Any time</h2><ul class="list" style="list-style:none;padding:0;margin:0">${day.loose.map(e => `<li class="item${e.done ? " off" : ""}" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="t">${esc(e.title)}</div><div class="s">${e.overdue ? "From an earlier day" : fmtDur(e.task.duration_min)}</div></div><div class="item-r">${e.overdue ? '<span class="tag bad">Late</span>' : `<span class="tag ${e.track}">${TRACKS[e.track]}</span>`}${tick(e.task)}</div></li>`).join("")}</ul></section>` : ""}`}
  </div>`;
}

async function reload() { day = await loadDay(user, profile); setDay(day); render(); }

main.addEventListener("click", async e => {
  const tk = e.target.closest("[data-tick]"), sk = e.target.closest("[data-skip]");
  try {
    if (tk) {
      const done = tk.getAttribute("aria-checked") !== "true";
      tk.setAttribute("aria-checked", done); tk.disabled = true; if (done) pawBurst(tk);
      const { error } = await sb.from("billi_tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", tk.dataset.tick);
      if (error) throw error;
      await reload();
      if (done) { $(".scene .cat")?.classList.add("pounce"); toast(day.tasksLeft ? "Done. Nice." : "All tasks done.", "ok"); }
      $(`[data-tick="${tk.dataset.tick}"]`)?.focus();
    } else if (sk) {
      sk.disabled = true;
      const r = sk.dataset.on === "1"
        ? await sb.from("billi_slot_skips").delete().eq("slot_id", sk.dataset.skip).eq("on_date", day.iso)
        : await sb.from("billi_slot_skips").insert({ slot_id: sk.dataset.skip, on_date: day.iso });
      if (r.error) throw r.error;
      toast(sk.dataset.on === "1" ? "Class is back on." : "Cancelled for today. Nobody's phone will ring for it.");
      await reload();
      $(`[data-skip="${sk.dataset.skip}"]`)?.focus();
    }
  } catch (err) { fail(err); await reload().catch(() => {}); }
});

try {
  profile = await getProfile(user);
  day = await loadDay(user, profile);
  render();
  loadGate(profile).then(g => { gate = g; if (g) render(); }).catch(e => console.warn("gate summary not loaded", e));
  await startAlarms(user, profile, day);
  setInterval(() => { if (!document.hidden && !document.querySelector("dialog[open]")) reload().catch(() => {}); }, 60000);
} catch (err) { main.innerHTML = `${pageHead("Today")}<div class="card empty"><h2>Could not load your day</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="today.html">Try again</a></div>`; console.error(err); }
