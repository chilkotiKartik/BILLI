import { sb, $, esc, I, mountShell, pageHead, requireSession, getProfile, toast, fail, busy, fmtDur } from "../core.js";
import { startAlarms, testRing, preview, TONE_NAMES } from "../alarm.js";
import { BilliNative } from "../native.js";


mountShell("gear");
const { user } = await requireSession();
const main = $("#main");
// The 30 GATE 2027 test papers, as listed on the official question paper pattern page.
const PAPERS = { AE: "Aerospace Engineering", AG: "Agricultural Engineering", AR: "Architecture and Planning", BM: "Biomedical Engineering", BT: "Biotechnology", CE: "Civil Engineering", CH: "Chemical Engineering", CS: "Computer Science and Information Technology", CY: "Chemistry", DA: "Data Science and Artificial Intelligence", EC: "Electronics and Communication Engineering", EE: "Electrical Engineering", ES: "Environmental Science and Engineering", EY: "Ecology and Evolution", GE: "Geomatics Engineering", GG: "Geology and Geophysics", IN: "Instrumentation Engineering", MA: "Mathematics", ME: "Mechanical Engineering", MN: "Mining Engineering", MT: "Metallurgical Engineering", NM: "Naval Architecture and Marine Engineering", PE: "Petroleum Engineering", PH: "Physics", PI: "Production and Industrial Engineering", RA: "Robotics and Automation", ST: "Statistics", XE: "Engineering Sciences", XH: "Humanities and Social Sciences", XL: "Life Sciences" };
const MINS = [30, 60, 90, 120, 150, 180, 210, 240, 300, 360];
let profile;

const notifState = () => (!("Notification" in window) ? "This browser cannot show notifications." : Notification.permission === "granted" ? "Notifications are allowed." : Notification.permission === "denied" ? "Notifications are blocked. Allow them in your browser's site settings." : "Notifications are not allowed yet.");

function render() {
  const opt = (list, cur, fmt) => list.map(v => `<option value="${v}" ${v === cur ? "selected" : ""}>${fmt(v)}</option>`).join("");
  main.innerHTML = `${pageHead("Settings", user.email)}
  <form class="stack" id="form" novalidate>
    <section class="card stack" aria-labelledby="s-you"><h2 id="s-you">You</h2>
      <div class="field"><label for="s-name">Your name</label><input id="s-name" type="text" maxlength="40" autocomplete="name" value="${esc(profile.name)}"><span class="hint">Classmates see this in the class members list.</span></div>
    </section>
    <section class="card stack" aria-labelledby="s-gate"><h2 id="s-gate">GATE</h2>
      <div class="field"><label for="s-paper">Your GATE paper</label><select id="s-paper"><option value="">Not chosen yet</option>${Object.entries(PAPERS).map(([k, n]) => `<option value="${k}" ${profile.gate_paper === k ? "selected" : ""}>${k}, ${n}</option>`).join("")}</select></div>
      <div class="field"><label for="s-date">Exam date</label><input id="s-date" type="date" value="${profile.gate_exam_date}"><span class="hint">GATE 2027 runs on 6, 7, 13, 14, 20 and 21 February 2027. Your own day comes with the admit card.</span></div>
      <div class="grid2">
        <div class="field"><label for="s-min">Daily goal</label><select id="s-min">${opt(MINS, profile.gate_min, fmtDur)}</select></div>
        <div class="field"><label for="s-max">Daily limit</label><select id="s-max">${opt(MINS, profile.gate_max, fmtDur)}</select></div>
      </div>
    </section>
    <section class="card stack" aria-labelledby="s-al"><h2 id="s-al">Alarms</h2>
      <div class="field"><label for="s-lead">Ring before each class</label><select id="s-lead">${opt([0, 5, 10, 15], profile.lead_min, v => (v ? `${v} minutes before` : "At the start time"))}</select></div>
      <label class="switch"><span><b>Alarm sound</b></span><input type="checkbox" id="s-sound" ${profile.sound ? "checked" : ""}></label>
      <fieldset><legend>Ringtone</legend><div class="seg" style="margin-top:6px">
        ${Object.entries(TONE_NAMES).map(([k, l]) => `<label><input type="radio" name="tone" value="${k}" ${profile.ringtone === k ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </div><span class="hint" style="display:block;margin-top:6px;font-size:14.5px;color:var(--muted)">Tap one to hear it. The cat gets louder the longer you ignore it.</span></fieldset>
      <p class="muted" style="font-size:15.5px">In a browser, Billi rings only while it is open in a tab. Ringing with the app closed needs the Android app, which is the next step.</p>
      <p id="s-nstate" class="muted" style="font-size:15.5px">${notifState()}</p>
      <div class="rowflex"><button type="button" class="btn sm" id="s-notif">${I.bell}Allow notifications</button><button type="button" class="btn sm" id="s-test">Test alarm</button><button type="button" class="btn sm" id="s-test2">Test solve to stop</button></div>
    </section>
    <section class="card stack" aria-labelledby="s-locker"><h2 id="s-locker">App Locker & Distraction Shield</h2>
      <p class="muted" style="font-size:15px">Block distracting apps on Android while your study timer is running.</p>
      <div id="locker-list" class="stack" style="gap:8px">
        ${[
          { id: "com.instagram.android", label: "Instagram" },
          { id: "com.google.android.youtube", label: "YouTube" },
          { id: "com.twitter.android", label: "X / Twitter" },
          { id: "com.reddit.frontpage", label: "Reddit" },
          { id: "com.zhiliaoapp.musically", label: "TikTok / Reels" },
          { id: "com.facebook.katana", label: "Facebook" },
          { id: "com.discord", label: "Discord" }
        ].map(app => {
          const currentBlocked = JSON.parse(localStorage.getItem("billi_blocked_apps") || '["com.instagram.android","com.google.android.youtube","com.twitter.android","com.reddit.frontpage"]');
          const isChecked = currentBlocked.includes(app.id);
          return `<label class="switch"><span><b>${esc(app.label)}</b></span><input type="checkbox" class="s-app-block" data-pkg="${esc(app.id)}" ${isChecked ? "checked" : ""}></label>`;
        }).join("")}
      </div>
      <div class="rowflex" style="margin-top:8px">
        <button type="button" class="btn sm" id="s-access">Open Android Accessibility Settings</button>
      </div>
    </section>
    <p class="err" id="s-err" role="alert"></p>
    <div class="rowflex between"><button class="btn primary" type="submit">Save settings</button><button type="button" class="btn" id="s-out">${I.out}Sign out</button></div>
  </form>`;
}


main.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "s-test") testRing(false);
  else if (b.id === "s-test2") testRing(true);
  else if (b.id === "s-access") {
    await BilliNative.openAccessibilitySettings();
  }
  else if (b.id === "s-notif") {
    if (!("Notification" in window)) { toast("This browser cannot show notifications."); return; }
    try { await Notification.requestPermission(); } catch {}
    $("#s-nstate").textContent = notifState();
  } else if (b.id === "s-out") { await sb.auth.signOut(); location.replace("login.html"); }
});
main.addEventListener("change", e => {
  if (e.target.name === "tone") preview(e.target.value);
  if (e.target.classList.contains("s-app-block")) {
    const checked = [...document.querySelectorAll(".s-app-block:checked")].map(el => el.dataset.pkg);
    try { localStorage.setItem("billi_blocked_apps", JSON.stringify(checked)); } catch {}
  }
});

main.addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#s-err"), btn = $("[type=submit]", main);
  const row = { name: $("#s-name").value.trim(), gate_paper: $("#s-paper").value || null, gate_exam_date: $("#s-date").value, gate_min: +$("#s-min").value, gate_max: +$("#s-max").value, lead_min: +$("#s-lead").value, sound: $("#s-sound").checked, ringtone: $("[name=tone]:checked").value };
  err.textContent = "";
  if (!row.gate_exam_date) { err.textContent = "Pick the exam date."; $("#s-date").focus(); return; }
  if (row.gate_max < row.gate_min) { err.textContent = "The daily limit cannot be smaller than the daily goal."; $("#s-max").focus(); return; }
  busy(btn, true);
  try {
    const { data, error } = await sb.from("billi_profiles").update(row).eq("id", user.id).select().single();
    if (error) throw error;
    profile = Object.assign(profile, data); toast("Settings saved.", "ok");
  } catch (x) { fail(x); } finally { busy(btn, false); }
});

try { profile = await getProfile(user); render(); startAlarms(user, profile); }
catch (x) { main.innerHTML = `${pageHead("Settings")}<div class="card empty"><h2>Could not load your settings</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="settings.html">Try again</a></div>`; console.error(x); }
