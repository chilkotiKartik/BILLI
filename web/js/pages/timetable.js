import { sb, $, $$, esc, cat, I, mountShell, pageHead, requireSession, getProfile, hm, toast, fail, DAYS, DAYS_LONG, dayNum, openDialog, confirmDialog, busy } from "../core.js";
import { myClasses } from "../data.js";
import { startAlarms, refreshAlarms } from "../alarm.js";

mountShell("table");
const { user } = await requireSession();
const main = $("#main");
let classes = [], slots = [], source = new URLSearchParams(location.search).get("class") || "me", day = dayNum();

const editable = () => source === "me" || classes.some(c => c.id === source && c.owner === user.id);
const sourceName = () => (source === "me" ? "My own timetable" : (classes.find(c => c.id === source) || {}).name || "Class");

async function load() {
  let q = sb.from("billi_slots").select("id,subject,room,day,start_time,end_time").order("day").order("start_time");
  q = source === "me" ? q.eq("user_id", user.id) : q.eq("class_id", source);
  const { data, error } = await q;
  if (error) throw error;
  slots = data;
}

function render() {
  const list = slots.filter(s => s.day === day), can = editable();
  main.innerHTML = `${pageHead("Timetable", "Set it once. It repeats every week.")}
  <div class="stack">
    <div class="chips" role="group" aria-label="Which timetable">
      <button class="chip" data-src="me" aria-pressed="${source === "me"}">Mine</button>
      ${classes.map(c => `<button class="chip" data-src="${c.id}" aria-pressed="${source === c.id}">${esc(c.name)}</button>`).join("")}
      <a class="chip" href="class.html" style="text-decoration:none;color:var(--violet-ink)">${I.klass}${classes.length ? "Classes" : "Create or join a class"}</a>
    </div>
    <div class="days" role="group" aria-label="Day of the week">
      ${DAYS.map((d, i) => `<button class="chip" data-day="${i + 1}" aria-pressed="${day === i + 1}" aria-label="${DAYS_LONG[i]}, ${slots.filter(s => s.day === i + 1).length} classes">${d}<span class="n">${slots.filter(s => s.day === i + 1).length || ""}</span></button>`).join("")}
    </div>
    <section class="card" aria-labelledby="day-h">
      <div class="rowflex between" style="margin-bottom:6px"><h2 id="day-h">${DAYS_LONG[day - 1]}</h2>${can ? `<button class="btn primary sm" id="add">${I.plus}Add class</button>` : ""}</div>
      <p class="muted" style="font-size:15px">${esc(sourceName())}${can ? "" : ". Only the class owner can change it."}</p>
      ${list.length ? `<ul class="list" style="list-style:none;padding:0;margin:6px 0 0">${list.map(s => `<li class="item"><div class="time">${hm(s.start_time)}<small>${hm(s.end_time)}</small></div><div><div class="t">${esc(s.subject)}</div><div class="s">${esc(s.room)}</div></div><div class="item-r">${can ? `<button class="iconbtn" data-edit="${s.id}" aria-label="Edit ${esc(s.subject)}">${I.edit}</button><button class="iconbtn" data-del="${s.id}" aria-label="Delete ${esc(s.subject)}">${I.trash}</button>` : ""}</div></li>`).join("")}</ul>`
        : `<div class="empty">${cat("sleep", "Billi is asleep")}<p class="muted">No classes on ${DAYS_LONG[day - 1]}.</p></div>`}
    </section>
  </div>`;
}

function slotDialog(slot) {
  const d = openDialog(`<h2>${slot ? "Edit class" : "Add class"}</h2>
  <form class="stack" novalidate>
    <div class="field"><label for="f-sub">Subject</label><input id="f-sub" type="text" maxlength="60" required value="${esc(slot?.subject || "")}" autocomplete="off"></div>
    <div class="field"><label for="f-room">Room <span class="muted" style="font-weight:400">(optional)</span></label><input id="f-room" type="text" maxlength="40" value="${esc(slot?.room || "")}" autocomplete="off"></div>
    <div class="grid2">
      <div class="field"><label for="f-st">Starts</label><input id="f-st" type="time" required value="${hm(slot?.start_time) || "09:00"}"></div>
      <div class="field"><label for="f-en">Ends</label><input id="f-en" type="time" required value="${hm(slot?.end_time) || "10:00"}"></div>
    </div>
    <fieldset><legend>${slot ? "Day" : "Days"}</legend><div class="seg" style="margin-top:6px">
      ${DAYS.map((n, i) => `<label><input type="${slot ? "radio" : "checkbox"}" name="days" value="${i + 1}" ${(slot ? slot.day : day) === i + 1 ? "checked" : ""}><span>${n}<span class="sr">, ${DAYS_LONG[i]}</span></span></label>`).join("")}
    </div></fieldset>
    <p class="err" id="f-err" role="alert"></p>
    <div class="dlg-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${slot ? "Save class" : "Add class"}</button></div>
  </form>`);
  $("#f-sub", d).focus();
  $("form", d).addEventListener("submit", async e => {
    e.preventDefault();
    const subject = $("#f-sub", d).value.trim(), room = $("#f-room", d).value.trim(), st = $("#f-st", d).value, en = $("#f-en", d).value;
    const days = $$("[name=days]:checked", d).map(i => +i.value), err = $("#f-err", d);
    if (!subject) { err.textContent = "Enter the subject name."; $("#f-sub", d).focus(); return; }
    if (!st || !en) { err.textContent = "Set both the start and end time."; return; }
    if (en <= st) { err.textContent = "The end time must be after the start time."; $("#f-en", d).focus(); return; }
    if (!days.length) { err.textContent = "Pick at least one day."; return; }
    const btn = $("[type=submit]", d); busy(btn, true);
    try {
      const owner = source === "me" ? { user_id: user.id } : { class_id: source };
      const r = slot
        ? await sb.from("billi_slots").update({ subject, room, start_time: st, end_time: en, day: days[0] }).eq("id", slot.id)
        : await sb.from("billi_slots").insert(days.map(dn => ({ ...owner, subject, room, start_time: st, end_time: en, day: dn })));
      if (r.error) throw r.error;
      d.close(); await load(); if (!slot) day = days.includes(day) ? day : days[0]; else day = days[0]; render();
      toast(slot ? "Class saved." : days.length > 1 ? `Added on ${days.length} days.` : "Class added.", "ok"); refreshAlarms();
    } catch (x) { busy(btn, false); fail(x); }
  });
}

main.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.dataset.src) { source = b.dataset.src; await load(); render(); $(`[data-src="${source}"]`)?.focus(); }
    else if (b.dataset.day) { day = +b.dataset.day; render(); $(`[data-day="${day}"]`)?.focus(); }
    else if (b.id === "add") slotDialog(null);
    else if (b.dataset.edit) slotDialog(slots.find(s => s.id === b.dataset.edit));
    else if (b.dataset.del) {
      const s = slots.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog("Delete this class?", `${s.subject} on ${DAYS_LONG[s.day - 1]} at ${hm(s.start_time)} will stop ringing for everyone who has this timetable.`))) return;
      const { error } = await sb.from("billi_slots").delete().eq("id", s.id);
      if (error) throw error;
      await load(); render(); toast("Class deleted."); refreshAlarms();
    }
  } catch (x) { fail(x); }
});

try {
  const profile = await getProfile(user);
  classes = await myClasses(user.id);
  if (source !== "me" && !classes.some(c => c.id === source)) source = "me";
  await load(); render();
  startAlarms(user, profile);
} catch (x) { main.innerHTML = `${pageHead("Timetable")}<div class="card empty"><h2>Could not load the timetable</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="timetable.html">Try again</a></div>`; console.error(x); }
