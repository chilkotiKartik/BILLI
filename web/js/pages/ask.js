import { sb, $, esc, cat, I, mountShell, pageHead, requireSession, getProfile, toast } from "../core.js";
import { loadGate } from "../gate-data.js";
import { startAlarms } from "../alarm.js";

mountShell("gate");
const { user } = await requireSession();
const main = $("#main"), KEY = "billi-ask", C = window.BILLI_CONFIG;
let profile, gate = null, msgs = [], busy = false, off = false;
try { const s = JSON.parse(sessionStorage.getItem(KEY) || "[]"); if (Array.isArray(s)) msgs = s.filter(m => m && typeof m.content === "string").slice(-24); } catch {}
const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-24))); } catch {} };

// Safe formatting: everything is escaped first, then a few plain patterns become bold, code and lists.
function rich(text) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = []; let list = null;
  for (const raw of String(text).split("\n")) {
    const m = raw.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/), ordered = /^\s*\d+[.)]\s/.test(raw);
    if (m) { const tag = ordered ? "ol" : "ul"; if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}>`); list = tag; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if (list) { out.push(`</${list}>`); list = null; }
    const h = raw.match(/^\s*#{1,4}\s+(.*)$/);
    if (h) out.push(`<p><b>${inline(h[1])}</b></p>`); else if (raw.trim()) out.push(`<p>${inline(raw)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join("");
}
const context = () => { const sel = $("#a-sec"); const sec = sel && sel.value ? sel.value : ""; return gate ? `${gate.paper.code} ${gate.paper.name}${sec ? ", section: " + sec : ""}` : ""; };

function ideas() {
  const n = gate && gate.summary.next, topic = n ? n.text.split(/[,:(]/)[0].trim().slice(0, 60) : "eigenvalues and eigenvectors", sec = n ? n.section : "Engineering Mathematics";
  return [`Give me every key formula for ${topic}`, `Explain ${topic} with one solved GATE-level example`, `Write 5 GATE-style questions on ${sec}, answers at the end`, `What mistakes do students make in ${sec}?`];
}
function render() {
  const secs = gate ? [...new Set(gate.summary.sections.filter(s => !s.off).map(s => s.title))] : [];
  main.innerHTML = `${pageHead("Ask Billi", gate ? `${gate.paper.code} doubts, formulas and practice` : "Doubts, formulas and practice", `<a class="linkbtn" href="gate.html">Syllabus</a>`)}
  <div class="stack">
    ${off ? `<section class="card pop"><h2 style="font-size:18px">Ask Billi is not switched on yet</h2><p style="margin-top:6px">The app owner needs to add a Gemini key once. In Supabase, open Edge Functions, then Secrets, and add <code>GEMINI_API_KEY</code>. Keys are free to create at aistudio.google.com.</p></section>` : ""}
    ${secs.length ? `<div class="field"><label for="a-sec">Ask about</label><select id="a-sec"><option value="">The whole ${esc(gate.paper.code)} paper</option>${secs.map(s => `<option>${esc(s)}</option>`).join("")}</select></div>` : ""}
    <div class="chat" id="chat" aria-live="polite">${msgs.length ? msgs.map(bubble).join("") : `<div class="empty">${cat("idle", "Billi in a graduation cap", { cap: true })}<p class="muted">Ask a doubt, ask for formulas, or ask for practice questions.</p></div>`}${busy ? `<div class="msg bot"><span class="who">Billi</span><div class="txt typing" role="status">Thinking…</div></div>` : ""}</div>
    ${msgs.length ? "" : `<div class="chips" role="group" aria-label="Ideas" style="flex-wrap:wrap">${ideas().map(q => `<button class="chip" data-idea="${esc(q)}" style="white-space:normal;text-align:left;height:auto;padding:8px 14px">${esc(q)}</button>`).join("")}</div>`}
    <form class="askbar" id="a-form" novalidate><label class="sr" for="a-in">Your question</label><textarea id="a-in" rows="2" maxlength="4000" placeholder="Type your question" ${busy ? "disabled" : ""}></textarea><button class="btn primary" type="submit" ${busy ? "disabled" : ""}>Ask</button></form>
    <div class="rowflex between"><p class="muted" style="font-size:14.5px">Answers come from Google Gemini and can be wrong. Check anything important against your book.</p>${msgs.length ? `<button class="linkbtn" id="a-clear">Clear chat</button>` : ""}</div>
  </div>`;
  const q = new URLSearchParams(location.search).get("q"); if (q && !msgs.length && !$("#a-in").value) $("#a-in").value = q.slice(0, 400);
  const chat = $("#chat"); chat.lastElementChild?.scrollIntoView({ block: "nearest" });
}
const bubble = m => m.role === "user" ? `<div class="msg me"><span class="who sr">You</span><div class="txt">${esc(m.content).replace(/\n/g, "<br>")}</div></div>`
  : `<div class="msg bot"><span class="who">Billi</span><div class="txt${m.err ? " err" : ""}">${m.err ? esc(m.content) : rich(m.content)}</div></div>`;

const WHY = { not_signed_in: "Your sign-in has expired. Sign in again.", daily_limit: "You have used today's questions. The limit resets at midnight.", busy: "Gemini is busy right now. Try again in a minute.",
  limiter_unavailable: "Could not check your daily limit. Try again in a moment.", upstream_error: "Gemini had a problem. Try again.", empty: "Gemini gave no answer to that. Try asking it another way.", bad_request: "That question could not be sent. Try again." };
async function ask(text) {
  text = text.trim(); if (!text || busy) return;
  const ctx = context();
  msgs.push({ role: "user", content: text }); busy = true; keep(); render();
  let reply;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(`${C.supabaseUrl}/functions/v1/billi-ask`, { method: "POST", headers: { "content-type": "application/json", apikey: C.supabaseKey, authorization: `Bearer ${session?.access_token || ""}` },
      body: JSON.stringify({ messages: msgs.filter(m => !m.err).map(m => ({ role: m.role, content: m.content })), context: ctx }) });
    const j = await r.json().catch(() => ({}));
    if (j.code === "not_configured") { off = true; msgs.pop(); busy = false; keep(); render(); $("#a-in").value = text; return; }
    reply = r.ok && j.text ? { role: "assistant", content: j.text + (j.truncated ? "\n\n(The answer was cut short. Ask me to continue.)" : "") } : { role: "assistant", err: true, content: WHY[j.code] || "That did not work. Try again." };
  } catch { reply = { role: "assistant", err: true, content: "No connection. Check your internet and try again." }; }
  msgs.push(reply); busy = false; keep(); render(); $("#a-in").focus();
}
main.addEventListener("submit", e => { e.preventDefault(); const v = $("#a-in").value; if (!v.trim()) { toast("Type a question first."); $("#a-in").focus(); return; } ask(v); });
main.addEventListener("keydown", e => { if (e.target.id === "a-in" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#a-form").requestSubmit(); } });
main.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.idea) ask(b.dataset.idea);
  else if (b.id === "a-clear") { msgs = []; keep(); render(); $("#a-in").focus(); }
});

try { profile = await getProfile(user); gate = await loadGate(profile).catch(() => null); render(); startAlarms(user, profile); }
catch (x) { main.innerHTML = `${pageHead("Ask Billi")}<div class="card empty"><h2>Could not load Ask Billi</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="ask.html">Try again</a></div>`; console.error(x); }
