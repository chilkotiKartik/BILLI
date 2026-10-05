// Shared pieces every page uses: the Supabase client, small helpers, icons, the cat, the page shell.
const C = window.BILLI_CONFIG;
// Writes are sent with keepalive so a tick or a save still reaches the database if the person taps to another page straight away.
const keepWrites = (url, opts = {}) => fetch(url, opts.method && opts.method !== "GET" && opts.method !== "HEAD" ? { ...opts, keepalive: true } : opts);
export const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: keepWrites }
});

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pad = n => String(n).padStart(2, "0");
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayNum = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;          // 1 = Monday ... 7 = Sunday
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const hm = t => (t ? String(t).slice(0, 5) : "");
export const toMin = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
export const minToHm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const at = (iso, hhmm) => new Date(`${iso}T${hm(hhmm)}:00`);
export const fmtDur = mins => { mins = Math.max(0, Math.round(mins)); const h = Math.floor(mins / 60), m = mins % 60; return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; };
export const daysUntil = iso => Math.round((new Date(iso + "T12:00:00") - new Date(isoDate() + "T12:00:00")) / 864e5);
export const TRACKS = { college: "College", gate: "GATE", personal: "Personal" };
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- sign-in guard and profile ---------- */
export async function requireSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace("login.html"); return new Promise(() => {}); }
  return session;
}
export async function getProfile(user) {
  let { data, error } = await sb.from("billi_profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) {
    const name = String(user.user_metadata?.name || "").slice(0, 40);
    const r = await sb.from("billi_profiles").insert({ id: user.id, name }).select().single();
    if (r.error) throw r.error;
    data = r.data;
  }
  return data;
}

/* ---------- icons (drawn for this app) ---------- */
const ic = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const I = {
  today: ic('<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9h11v-9"/>'),
  table: ic('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>'),
  tasks: ic('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>'),
  timer: ic('<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M9.5 3.5h5"/>'),
  klass: ic('<circle cx="9" cy="9" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M16 6.2a3 3 0 0 1 0 5.6M18 14.5c1.7.7 2.7 2.2 3 4.5"/>'),
  gate: ic('<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11.2V16c1.5 1.4 3.3 2.1 5.5 2.1s4-.7 5.5-2.1v-4.8M21.5 9v5"/>'),
  flag: ic('<path d="M6 21V4M6 5h11.5l-2.5 4 2.5 4H6"/>'),
  chat: ic('<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z"/>'),
  gear: ic('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>'),
  bell: ic('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  trash: ic('<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12h8.4L17 7"/>'),
  edit: ic('<path d="M5 19l1-4L16.5 4.5l3 3L9 18z"/>'),
  x: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
  copy: ic('<rect x="8" y="8" width="11" height="12" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>'),
  play: ic('<path d="M8 5.5v13l10.5-6.5z"/>'),
  pause: ic('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  stop: ic('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>'),
  check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  out: ic('<path d="M14 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19H14M10.5 12H20M17 8.5l3.5 3.5-3.5 3.5"/>')
};

/* ---------- Billi the cat (original character for this app) ----------
   moods: idle, play, sleep, yowl, sulk. Options: cap (a graduation cap, for GATE). app.css animates the parts.
   Drawn like a sticker: flat colour, one ink outline, a soft shadow on the ground. */
const INK = "#251B3A";
export function cat(mood = "idle", label = "Billi the cat", { cap = false } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  const o = `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
  return `<svg class="cat cat--${mood}" viewBox="0 -16 220 226" ${a11y}>
  <ellipse cx="112" cy="198" rx="74" ry="9" fill="${INK}" opacity=".13"/>
  <g class="cat-tail"><path d="M152 158c34 4 50-22 36-56" fill="none" stroke="${INK}" stroke-width="25" stroke-linecap="round"/><path d="M152 158c34 4 50-22 36-56" fill="none" stroke="#E8730C" stroke-width="17" stroke-linecap="round"/><path d="M189 107c-1.5-3-2-4-1.5-5" fill="none" stroke="#FFE1BD" stroke-width="17" stroke-linecap="round"/></g>
  <g class="cat-bodywrap">
    <ellipse cx="110" cy="152" rx="56" ry="42" fill="#FF8A1F" ${o}/>
    <path d="M70 134c8-4 12-4 18 0M132 134c6-4 10-4 18 0" stroke="#D96A00" stroke-width="5" stroke-linecap="round" fill="none"/>
    <ellipse cx="110" cy="164" rx="30" ry="25" fill="#FFE1BD"/>
    <g class="cat-paws"><ellipse class="paw-l" cx="88" cy="189" rx="17" ry="10" fill="#FFB866" ${o}/><ellipse class="paw-r" cx="132" cy="189" rx="17" ry="10" fill="#FFB866" ${o}/></g>
  </g>
  <g class="cat-head">
    <g class="ear ear-l"><path d="M62 68 68 18l40 30z" fill="#FF8A1F" ${o}/><path d="M73 55l3-22 17 14z" fill="#FFB3C1"/></g>
    <g class="ear ear-r"><path d="M158 68l-6-50-40 30z" fill="#FF8A1F" ${o}/><path d="M147 55l-3-22-17 14z" fill="#FFB3C1"/></g>
    <ellipse cx="110" cy="84" rx="56" ry="46" fill="#FF8A1F" ${o}/>
    <path d="M110 44v12M96 47l3 11M124 47l-3 11" stroke="#D96A00" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="110" cy="102" rx="26" ry="17" fill="#FFE1BD"/>
    <ellipse cx="70" cy="101" rx="9" ry="6" fill="#FF6F91" opacity=".42"/><ellipse cx="150" cy="101" rx="9" ry="6" fill="#FF6F91" opacity=".42"/>
    <g class="eyes eyes-open"><ellipse cx="89" cy="82" rx="8.5" ry="10.5" fill="${INK}"/><circle cx="92" cy="78" r="3.4" fill="#fff"/><circle cx="86.5" cy="86" r="1.5" fill="#fff" opacity=".8"/><ellipse cx="131" cy="82" rx="8.5" ry="10.5" fill="${INK}"/><circle cx="134" cy="78" r="3.4" fill="#fff"/><circle cx="128.5" cy="86" r="1.5" fill="#fff" opacity=".8"/></g>
    <g class="eyes eyes-closed"><path d="M80 83q9 7 18 0M122 83q9 7 18 0" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/></g>
    <g class="eyes eyes-wide"><circle cx="89" cy="81" r="12.5" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="89" cy="82" r="5.5" fill="${INK}"/><circle cx="131" cy="81" r="12.5" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="131" cy="82" r="5.5" fill="${INK}"/></g>
    <g class="eyes eyes-low"><path d="M79 79l20 4M141 79l-20 4" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><ellipse cx="89" cy="87" rx="7" ry="5" fill="${INK}"/><ellipse cx="131" cy="87" rx="7" ry="5" fill="${INK}"/></g>
    <path d="M104 94h12l-6 7z" fill="#E8456B" stroke="#E8456B" stroke-width="2" stroke-linejoin="round"/>
    <g class="mouth mouth-smile"><path d="M110 101q-5 9-13 4M110 101q5 9 13 4" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/></g>
    <g class="mouth mouth-open"><ellipse cx="110" cy="111" rx="10" ry="11" fill="#7A1230" stroke="${INK}" stroke-width="3"/><ellipse cx="110" cy="116" rx="5.5" ry="4" fill="#F27A93"/><path d="M103 103l2 5M117 103l-2 5" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>
    <g class="mouth mouth-flat"><path d="M101 108q9-5 18 0" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/></g>
    <path d="M60 96l-24-5M60 104l-24 4M160 96l24-5M160 104l24 4" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
    ${cap ? `<g class="cat-cap"><path d="M84 30v14c8 6 44 6 52 0V30z" fill="${INK}"/><path d="M110 4 162 24 110 44 58 24z" fill="#3B2F5C" ${o}/><path d="M110 24h44v22" fill="none" stroke="#FFC83D" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="154" cy="50" r="5.5" fill="#FFC83D" stroke="${INK}" stroke-width="2.5"/></g>` : ""}
  </g>
  <g class="cat-noise" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"><path d="M22 60q-10 14 0 28M8 50q-16 24 0 48"/><path d="M198 60q10 14 0 28M212 50q16 24 0 48"/></g>
  <g class="cat-notes" fill="#E8456B" font-family="sans-serif" font-weight="700"><text x="6" y="52" font-size="32">♪</text><text x="184" y="40" font-size="26">♫</text></g>
  <g class="cat-zzz" fill="#5B3FE0" font-family="'Baloo 2',sans-serif" font-weight="800"><text x="170" y="48" font-size="28">z</text><text x="192" y="26" font-size="20">z</text></g>
  <g class="cat-yarn"><circle cx="192" cy="181" r="17" fill="#5B3FE0" ${o}/><path d="M180 175q12-8 24 2M178 185q14-6 27 4M186 167q8 12 4 30" stroke="#C9BEFF" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M176 192q-16 9-32 3" stroke="#5B3FE0" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
</svg>`;
}

// A small window behind the cat: morning sun, evening glow or night moon, by the clock.
export function skyWindow(hour = new Date().getHours()) {
  const t = hour >= 6 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "dusk" : "night";
  const sky = { day: "#BFE8FF", dusk: "#FFC9A3", night: "#2E2559" }[t];
  const body = t === "night" ? `<circle cx="78" cy="34" r="13" fill="#FFF3C4"/><circle cx="84" cy="30" r="11" fill="${sky}"/><g fill="#FFF3C4"><circle cx="34" cy="26" r="2"/><circle cx="52" cy="44" r="1.5"/><circle cx="98" cy="58" r="1.5"/><circle cx="28" cy="56" r="1.5"/></g>`
    : `<circle cx="80" cy="${t === "dusk" ? 62 : 34}" r="14" fill="${t === "dusk" ? "#FF7A45" : "#FFD23F"}"/><g fill="#fff" opacity=".9"><ellipse cx="38" cy="36" rx="16" ry="7"/><ellipse cx="48" cy="30" rx="10" ry="7"/></g>`;
  return `<svg class="win" viewBox="0 0 120 100" aria-hidden="true"><rect x="8" y="6" width="104" height="88" rx="16" fill="${sky}" stroke="${INK}" stroke-width="4"/><clipPath id="wc"><rect x="10" y="8" width="100" height="84" rx="14"/></clipPath><g clip-path="url(#wc)">${body}</g><path d="M60 6v88M8 52h104" stroke="${INK}" stroke-width="3" opacity=".85"/></svg>`;
}

// Paw prints that pop out from a spot on the page when something is finished.
export function pawBurst(el) {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect(), box = document.createElement("div");
  box.className = "pawburst"; box.setAttribute("aria-hidden", "true"); box.style.left = r.left + r.width / 2 + "px"; box.style.top = r.top + r.height / 2 + "px";
  box.innerHTML = Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5, d = 46 + Math.random() * 34;
    return `<svg viewBox="0 0 24 24" style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px;--rot:${Math.round(a * 57 + 90)}deg;color:${["#FF8A1F", "#5B3FE0", "#0B7F7F"][i % 3]}"><g fill="currentColor"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="5.5" cy="10" r="2.3"/><circle cx="9.5" cy="6.5" r="2.3"/><circle cx="14.5" cy="6.5" r="2.3"/><circle cx="18.5" cy="10" r="2.3"/></g></svg>`; }).join("");
  document.body.appendChild(box); setTimeout(() => box.remove(), 900);
}

/* ---------- page shell: navigation on every signed-in page ---------- */
// Class is set up once and then rarely opened, so on a phone it lives behind Timetable; the desktop rail shows everything.
const NAV = [["today", "Today", "today.html"], ["table", "Timetable", "timetable.html"], ["gate", "GATE", "gate.html"], ["tasks", "Tasks", "tasks.html"], ["timer", "Timer", "timer.html"], ["klass", "Class", "class.html", "desk"]];
export function mountShell(active) {
  const cur = k => (k === active ? ' aria-current="page"' : "");
  const links = NAV.map(([k, label, href, only]) => `<a href="${href}" class="tab${k === active ? " on" : ""}${only ? " tab-" + only : ""}"${cur(k)}>${I[k]}<span>${label}</span></a>`).join("");
  document.body.insertAdjacentHTML("afterbegin", `<a class="skip" href="#main">Skip to content</a>
<nav class="tabs" aria-label="Main"><a class="brand" href="today.html" aria-label="Billi, go to Today"><span class="brand-cat">${cat("idle", "")}</span><span>Billi</span></a>${links}<a href="settings.html" class="tab tab-settings${active === "gear" ? " on" : ""}"${cur("gear")}>${I.gear}<span>Settings</span></a></nav>
<div id="toasts" class="toasts" role="status" aria-live="polite"></div>`);
}
export function pageHead(title, sub = "", right = "") {
  return `<header class="head"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}</div><div class="head-r">${right}<a class="iconbtn only-mobile" href="settings.html" aria-label="Settings">${I.gear}</a></div></header>`;
}

/* ---------- feedback ---------- */
export function toast(msg, kind = "") {
  let box = $("#toasts");
  if (!box) { box = Object.assign(document.createElement("div"), { id: "toasts", className: "toasts" }); box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  const el = document.createElement("div");
  el.className = "toast " + kind; el.textContent = msg; box.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
export function fail(e, fallback = "Something went wrong. Try again.") {
  console.error(e);
  const m = e && e.message ? String(e.message) : "";
  // Messages raised by our own database functions are written for people; everything else gets the plain fallback.
  const friendly = /^(Sign in first|Give the class|You can own|No class has|This class is full|You can be in|A class timetable|A personal timetable)/.test(m);
  toast(friendly ? m : (/Failed to fetch|NetworkError|Load failed/i.test(m) ? "No connection. Check your internet and try again." : fallback), "bad");
}

/* ---------- dialogs (native <dialog>: focus trap and Escape come built in) ---------- */
export function openDialog(html, { onOpen } = {}) {
  const d = document.createElement("dialog");
  d.className = "dlg"; d.innerHTML = html; document.body.appendChild(d);
  const h = $("h2", d); if (h) { h.id = h.id || "dlg-" + Math.random().toString(36).slice(2, 8); d.setAttribute("aria-labelledby", h.id); }
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", e => { if (e.target === d) d.close(); });
  d.addEventListener("input", () => { const e = $(".err", d); if (e) e.textContent = ""; });      // an old error should not sit beside corrected input
  $$("[data-close]", d).forEach(b => b.addEventListener("click", () => d.close()));
  d.showModal();
  if (onOpen) onOpen(d);
  return d;
}
export function confirmDialog(title, body, okLabel = "Delete") {
  return new Promise(res => {
    const d = openDialog(`<h2>${esc(title)}</h2><p class="muted">${esc(body)}</p><div class="dlg-actions"><button class="btn" data-close>Keep it</button><button class="btn danger" id="ok">${esc(okLabel)}</button></div>`);
    let ok = false;
    $("#ok", d).addEventListener("click", () => { ok = true; d.close(); });
    d.addEventListener("close", () => res(ok));
  });
}
export function busy(btn, on) { if (!btn) return; btn.disabled = on; btn.classList.toggle("is-busy", on); }
