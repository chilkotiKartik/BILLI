import { sb, $, esc, cat, I, mountShell, pageHead, requireSession, getProfile, toast, fail, openDialog, confirmDialog, busy } from "../core.js";
import { myClasses } from "../data.js";
import { startAlarms, refreshAlarms } from "../alarm.js";

mountShell("klass");
const { user } = await requireSession();
const main = $("#main");
let classes = [];

function render() {
  main.innerHTML = `${pageHead("Class", "One timetable for everyone in your class.")}
  <div class="stack">
    <div class="rowflex"><button class="btn primary" id="create">${I.plus}Create a class</button><button class="btn" id="join">Join with a code</button></div>
    ${classes.length ? classes.map(c => { const own = c.owner === user.id; return `<section class="card" aria-labelledby="c-${c.id}">
      <div class="rowflex between"><h2 id="c-${c.id}" style="overflow-wrap:anywhere">${esc(c.name)}</h2><span class="tag ${own ? "gate" : "plain"}">${own ? "You own this" : "Member"}</span></div>
      <div class="rowflex" style="margin:12px 0"><span class="code" aria-label="Invite code ${c.code.split("").join(" ")}">${c.code}</span><button class="btn sm" data-copy="${c.code}">${I.copy}Copy code</button></div>
      <p class="muted" style="font-size:15px">${own ? "Share this code. Everyone who joins gets your class timetable and its alarms." : "You get this class's timetable and alarms. Only the owner can change them."}</p>
      <div class="rowflex" style="margin-top:12px"><a class="btn sm" href="timetable.html?class=${c.id}">${I.table}${own ? "Edit timetable" : "See timetable"}</a><button class="btn sm" data-roster="${c.id}">${I.klass}Members</button>
      ${own ? `<button class="linkbtn" data-rename="${c.id}">Rename</button><button class="linkbtn" data-delete="${c.id}" style="color:var(--bad)">Delete class</button>` : `<button class="linkbtn" data-leave="${c.id}" style="color:var(--bad)">Leave class</button>`}</div>
    </section>`; }).join("") : `<div class="card empty">${cat("idle")}<h2>You are not in a class yet</h2><p class="muted">Create one and share its code, or join with a code from a classmate.</p></div>`}
  </div>`;
}

function nameDialog(title, label, value, okLabel, submit) {
  const d = openDialog(`<h2>${title}</h2><form class="stack" novalidate><div class="field"><label for="n-in">${label}</label><input id="n-in" type="text" maxlength="60" value="${esc(value)}" autocomplete="off"></div><p class="err" id="n-err" role="alert"></p><div class="dlg-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${okLabel}</button></div></form>`);
  $("#n-in", d).focus(); $("#n-in", d).select();
  $("form", d).addEventListener("submit", async e => {
    e.preventDefault();
    const v = $("#n-in", d).value.trim(), btn = $("[type=submit]", d);
    const msg = submit.check(v); if (msg) { $("#n-err", d).textContent = msg; $("#n-in", d).focus(); return; }
    busy(btn, true);
    try { await submit.run(v); d.close(); classes = await myClasses(user.id); render(); refreshAlarms(); }
    catch (x) { busy(btn, false); const m = String(x.message || ""); if (/^(No class has|This class is full|You can be in|You can own|Give the class)/.test(m)) $("#n-err", d).textContent = m + "."; else fail(x); }
  });
}

main.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const cls = id => classes.find(c => c.id === id);
  try {
    if (b.id === "create") nameDialog("Create a class", "Class name, for example CSE 3rd year A", "", "Create class", {
      check: v => (v ? "" : "Give the class a name."),
      run: async v => { const { error } = await sb.rpc("billi_create_class", { p_name: v }); if (error) throw error; toast("Class created. Share the code with your classmates.", "ok"); }
    });
    else if (b.id === "join") nameDialog("Join a class", "Invite code (6 letters and numbers)", "", "Join class", {
      check: v => (/^[A-Za-z0-9]{6}$/.test(v) ? "" : "The code has 6 letters and numbers."),
      run: async v => { const { error } = await sb.rpc("billi_join_class", { p_code: v }); if (error) throw error; toast("You joined. The class timetable is now in your Today.", "ok"); }
    });
    else if (b.dataset.copy) { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Code copied."); } catch { toast("Copy did not work. The code is " + b.dataset.copy); } }
    else if (b.dataset.rename) nameDialog("Rename class", "Class name", cls(b.dataset.rename).name, "Save name", {
      check: v => (v ? "" : "Give the class a name."),
      run: async v => { const { error } = await sb.from("billi_classes").update({ name: v }).eq("id", b.dataset.rename); if (error) throw error; toast("Name saved.", "ok"); }
    });
    else if (b.dataset.roster) {
      const { data, error } = await sb.rpc("billi_class_roster", { p_class: b.dataset.roster });
      if (error) throw error;
      openDialog(`<h2>${esc(cls(b.dataset.roster).name)}</h2><p class="muted">${data.length} ${data.length === 1 ? "member" : "members"}</p><ul class="list" style="list-style:none;padding:0;margin:8px 0 0">${data.map(m => `<li class="item" style="grid-template-columns:minmax(0,1fr) auto"><span class="t">${esc(m.name)}${m.user_id === user.id ? " (you)" : ""}</span>${m.role === "owner" ? '<span class="tag gate">Owner</span>' : ""}</li>`).join("")}</ul><div class="dlg-actions"><button class="btn primary" data-close>Close</button></div>`);
    }
    else if (b.dataset.delete) {
      const c = cls(b.dataset.delete);
      if (!(await confirmDialog("Delete this class?", `${c.name} and its timetable will be removed for every member. This cannot be undone.`, "Delete class"))) return;
      const { error } = await sb.from("billi_classes").delete().eq("id", c.id); if (error) throw error;
      classes = await myClasses(user.id); render(); toast("Class deleted."); refreshAlarms();
    }
    else if (b.dataset.leave) {
      const c = cls(b.dataset.leave);
      if (!(await confirmDialog("Leave this class?", `${c.name} will stop ringing on your phone. You can join again with the code.`, "Leave class"))) return;
      const { error } = await sb.from("billi_class_members").delete().eq("class_id", c.id).eq("user_id", user.id); if (error) throw error;
      classes = await myClasses(user.id); render(); toast("You left the class."); refreshAlarms();
    }
  } catch (x) { fail(x); }
});

try {
  const profile = await getProfile(user);
  classes = await myClasses(user.id); render();
  startAlarms(user, profile);
} catch (x) { main.innerHTML = `${pageHead("Class")}<div class="card empty"><h2>Could not load your classes</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="class.html">Try again</a></div>`; console.error(x); }
