import { sb, $, $$, esc, cat, pawBurst, I, mountShell, pageHead, requireSession, getProfile, hm, isoDate, fmtDur, toast, fail, TRACKS, openDialog, confirmDialog, busy } from "../core.js";
import { startAlarms, refreshAlarms } from "../alarm.js";

mountShell("tasks");
const { user } = await requireSession();
const main = $("#main");
let tasks = [];

async function load() {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data, error } = await sb.from("billi_tasks").select("*").or(`done.eq.false,done_at.gte.${weekAgo}`).order("due_date").order("due_time", { nullsFirst: false });
  if (error) throw error;
  tasks = data;
}
const niceDate = iso => { const t = isoDate(); if (iso === t) return "Today"; const d = new Date(iso + "T12:00:00"); const diff = Math.round((d - new Date(t + "T12:00:00")) / 864e5); if (diff === 1) return "Tomorrow"; if (diff === -1) return "Yesterday"; return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };

function item(t) {
  const meta = `${niceDate(t.due_date)}${t.due_time ? ", " + hm(t.due_time) : ""}, ${fmtDur(t.duration_min)}${t.alarm ? ", alarm on" : ""}${t.strict ? ", solve to stop" : ""}`;
  return `<li class="item task${t.done ? " off" : ""}">
    <button class="tick" role="checkbox" aria-checked="${t.done}" data-tick="${t.id}" aria-label="Done: ${esc(t.title)}">${I.check}</button>
    <button class="rowbtn" data-edit="${t.id}"><span class="sr">Edit task: </span><span class="t">${esc(t.title)}</span><span class="s">${meta}</span></button>
    <div class="item-r"><span class="tag ${t.track}">${TRACKS[t.track]}</span>${t.done ? "" : `<a class="iconbtn" href="timer.html?track=${t.track}&task=${t.id}" aria-label="Start timer for ${esc(t.title)}">${I.play}</a>`}</div></li>`;
}
function group(title, list, id) {
  return list.length ? `<section aria-labelledby="${id}"><h2 id="${id}" class="section-t">${title}</h2><ul class="list" style="list-style:none;padding:0;margin:0">${list.map(item).join("")}</ul></section>` : "";
}
function render() {
  const today = isoDate(), open = tasks.filter(t => !t.done);
  const late = open.filter(t => t.due_date < today), now = open.filter(t => t.due_date === today), later = open.filter(t => t.due_date > today), done = tasks.filter(t => t.done).reverse();
  main.innerHTML = `${pageHead("Tasks", open.length ? `${open.length} to do` : "Nothing to do", `<button class="btn primary sm" id="add">${I.plus}Add task</button>`)}
  <div class="stack">
    ${tasks.length ? "" : `<div class="card empty">${cat("idle")}<h2>No tasks yet</h2><p class="muted">Add an assignment, a GATE topic or anything you must not forget.</p></div>`}
    ${group("Late", late, "g-late")}${group("Today", now, "g-today")}${group("Later", later, "g-later")}${group("Done this week", done, "g-done")}
  </div>`;
}

function taskDialog(t) {
  const d = openDialog(`<h2>${t ? "Edit task" : "Add task"}</h2>
  <form class="stack" novalidate>
    <div class="field"><label for="t-title">What do you need to do?</label><input id="t-title" type="text" maxlength="120" required value="${esc(t?.title || "")}" autocomplete="off"></div>
    <fieldset><legend>This is for</legend><div class="seg" style="margin-top:6px">
      ${Object.entries(TRACKS).map(([k, l]) => `<label><input type="radio" name="track" value="${k}" ${(t?.track || "college") === k ? "checked" : ""}><span>${l}</span></label>`).join("")}
    </div></fieldset>
    <div class="grid2">
      <div class="field"><label for="t-date">Date</label><input id="t-date" type="date" required value="${t?.due_date || isoDate()}"></div>
      <div class="field"><label for="t-time">Time <span class="muted" style="font-weight:400">(optional)</span></label><input id="t-time" type="time" value="${hm(t?.due_time)}"></div>
    </div>
    <div class="field"><label for="t-dur">How long, in minutes</label><input id="t-dur" type="number" inputmode="numeric" min="5" max="600" step="5" value="${t?.duration_min || 30}"></div>
    <label class="switch"><span><b>Ring an alarm at that time</b><br><span class="muted" style="font-size:15px">Needs a time.</span></span><input type="checkbox" id="t-alarm" ${t?.alarm ? "checked" : ""}></label>
    <label class="switch"><span><b>Make me solve a sum to stop it</b><br><span class="muted" style="font-size:15px">For things you keep snoozing.</span></span><input type="checkbox" id="t-strict" ${t?.strict ? "checked" : ""}></label>
    <p class="err" id="t-err" role="alert"></p>
    <div class="dlg-actions">${t ? '<button type="button" class="linkbtn" id="t-del" style="color:var(--bad);margin-right:auto">Delete task</button>' : ""}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${t ? "Save task" : "Add task"}</button></div>
  </form>`);
  $("#t-title", d).focus();
  $("#t-del", d)?.addEventListener("click", async () => {
    if (!(await confirmDialog("Delete this task?", t.title))) return;
    try { const { error } = await sb.from("billi_tasks").delete().eq("id", t.id); if (error) throw error; d.close(); await load(); render(); toast("Task deleted."); refreshAlarms(); } catch (x) { fail(x); }
  });
  $("form", d).addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#t-err", d), title = $("#t-title", d).value.trim(), due_date = $("#t-date", d).value, due_time = $("#t-time", d).value || null;
    const duration_min = Math.round(Number($("#t-dur", d).value)), alarm = $("#t-alarm", d).checked, strict = $("#t-strict", d).checked;
    if (!title) { err.textContent = "Write what the task is."; $("#t-title", d).focus(); return; }
    if (!due_date) { err.textContent = "Pick a date."; $("#t-date", d).focus(); return; }
    if (!(duration_min >= 5 && duration_min <= 600)) { err.textContent = "Length must be between 5 and 600 minutes."; $("#t-dur", d).focus(); return; }
    if (alarm && !due_time) { err.textContent = "Set a time so the alarm knows when to ring."; $("#t-time", d).focus(); return; }
    if (strict && !alarm) { err.textContent = "Turn the alarm on to use solve to stop."; $("#t-alarm", d).focus(); return; }
    const row = { title, track: $("[name=track]:checked", d).value, due_date, due_time, duration_min, alarm, strict };
    const btn = $("[type=submit]", d); busy(btn, true);
    try {
      const r = t ? await sb.from("billi_tasks").update(row).eq("id", t.id) : await sb.from("billi_tasks").insert(row);
      if (r.error) throw r.error;
      d.close(); await load(); render(); toast(t ? "Task saved." : "Task added.", "ok"); refreshAlarms();
    } catch (x) { busy(btn, false); fail(x); }
  });
}

main.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.id === "add") taskDialog(null);
    else if (b.dataset.edit) taskDialog(tasks.find(t => t.id === b.dataset.edit));
    else if (b.dataset.tick) {
      const done = b.getAttribute("aria-checked") !== "true"; b.disabled = true; if (done) pawBurst(b);
      const { error } = await sb.from("billi_tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", b.dataset.tick);
      if (error) throw error;
      await load(); render(); $(`[data-tick="${b.dataset.tick}"]`)?.focus(); refreshAlarms();
    }
  } catch (x) { fail(x); }
});

try {
  const profile = await getProfile(user);
  await load(); render();
  startAlarms(user, profile);
} catch (x) { main.innerHTML = `${pageHead("Tasks")}<div class="card empty"><h2>Could not load your tasks</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="tasks.html">Try again</a></div>`; console.error(x); }
