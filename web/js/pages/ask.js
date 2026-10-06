import { sb, $, esc, cat, I, mountShell, pageHead, requireSession, getProfile, toast } from "../core.js";
import { loadGate } from "../gate-data.js";
import { startAlarms } from "../alarm.js";
import { mascot } from "../mascot.js";

mountShell("gate");
const { user } = await requireSession();
const main = $("#main"), KEY = "billi-ask", C = window.BILLI_CONFIG;
let profile, gate = null, msgs = [], busy = false, off = false;
try { const s = JSON.parse(sessionStorage.getItem(KEY) || "[]"); if (Array.isArray(s)) msgs = s.filter(m => m && typeof m.content === "string").slice(-24); } catch {}
const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-24))); } catch {} };

// Rich Markdown and Math block formatting
function rich(text) {
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\$([^$]+)\$/g, `<span class="math-inline" style="font-family:'Courier New',monospace;background:rgba(245,158,11,0.12);color:#f59e0b;padding:2px 6px;border-radius:4px;font-weight:600">$1</span>`);

  const out = []; let list = null;
  for (const raw of String(text).split("\n")) {
    // Block Math $$...$$
    if (raw.trim().startsWith("$$") && raw.trim().endsWith("$$")) {
      const mathContent = raw.trim().slice(2, -2).trim();
      out.push(`<div class="math-block" style="background:#13171f;border:1px solid #2d3342;padding:10px 14px;border-radius:8px;margin:8px 0;font-family:'Courier New',monospace;color:#38bdf8;font-size:14.5px;overflow-x:auto;text-align:center"><b>${esc(mathContent)}</b></div>`);
      continue;
    }

    const m = raw.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/), ordered = /^\s*\d+[.)]\s/.test(raw);
    if (m) { const tag = ordered ? "ol" : "ul"; if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}>`); list = tag; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if (list) { out.push(`</${list}>`); list = null; }
    const h = raw.match(/^\s*#{1,4}\s+(.*)$/);
    if (h) out.push(`<p style="margin-top:10px"><b>${inline(h[1])}</b></p>`); else if (raw.trim()) out.push(`<p>${inline(raw)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join("");
}

const context = () => { const sel = $("#a-sec"); const sec = sel && sel.value ? sel.value : ""; return gate ? `${gate.paper.code} ${gate.paper.name}${sec ? ", section: " + sec : ""}` : ""; };

function ideas() {
  const n = gate && gate.summary.next, topic = n ? n.text.split(/[,:(]/)[0].trim().slice(0, 60) : "Eigenvalues and Linear Algebra", sec = n ? n.section : "Engineering Mathematics";
  return [
    `📐 Give me every key formula for ${topic}`,
    `⚡ Explain ${topic} with a step-by-step solved GATE PYQ`,
    `📝 5 GATE-level practice questions on ${sec} with solutions`,
    `⚠️ Common traps & mistakes students make in ${sec}`
  ];
}

function render() {
  const secs = gate ? [...new Set(gate.summary.sections.filter(s => !s.off).map(s => s.title))] : [];
  main.innerHTML = `${pageHead("Ask Billi AI Super-Tutor", gate ? `${gate.paper.code} doubts, formulas, and PYQ solver` : "GATE Doubts & PYQ Solver", `<a class="linkbtn" href="gate.html">Syllabus</a>`)}
  <div class="stack">
    <div id="mascot-bar"></div>
    ${secs.length ? `<div class="field"><label for="a-sec">Subject focus</label><select id="a-sec"><option value="">Whole ${esc(gate.paper.code)} Paper</option>${secs.map(s => `<option>${esc(s)}</option>`).join("")}</select></div>` : ""}
    <div class="chat" id="chat" aria-live="polite">${msgs.length ? msgs.map(bubble).join("") : `<div class="empty">${cat("idle", "Billi in a graduation cap", { cap: true })}<p class="muted">Ask any GATE question, formula derivation, or doubt. Billi breaks it down step-by-step.</p></div>`}${busy ? `<div class="msg bot"><span class="who">Billi AI</span><div class="txt typing" role="status">Solving step-by-step…</div></div>` : ""}</div>
    ${msgs.length ? "" : `<div class="chips" role="group" aria-label="Ideas" style="flex-wrap:wrap">${ideas().map(q => `<button class="chip" data-idea="${esc(q)}" style="white-space:normal;text-align:left;height:auto;padding:8px 14px">${esc(q)}</button>`).join("")}</div>`}
    <form class="askbar" id="a-form" novalidate><label class="sr" for="a-in">Your question</label><textarea id="a-in" rows="2" maxlength="4000" placeholder="Ask any doubt or paste a GATE question..." ${busy ? "disabled" : ""}></textarea><button class="btn primary" type="submit" ${busy ? "disabled" : ""}>Ask Billi</button></form>
    <div class="rowflex between"><p class="muted" style="font-size:13.5px">💡 Solves with step-by-step derivations, official GATE formulas, and common trap warnings.</p>${msgs.length ? `<button class="linkbtn" id="a-clear">Clear chat</button>` : ""}</div>
  </div>`;
  mascot.renderWidget($("#mascot-bar"), busy ? "focusing" : msgs.length ? "completed" : "idle");
  const q = new URLSearchParams(location.search).get("q"); if (q && !msgs.length && !$("#a-in").value) $("#a-in").value = q.slice(0, 400);
  const chat = $("#chat"); chat.lastElementChild?.scrollIntoView({ block: "nearest" });
}

const bubble = m => m.role === "user" ? `<div class="msg me"><span class="who sr">You</span><div class="txt">${esc(m.content).replace(/\n/g, "<br>")}</div></div>`
  : `<div class="msg bot"><span class="who">Billi AI</span><div class="txt${m.err ? " err" : ""}">${m.err ? esc(m.content) : rich(m.content)}</div></div>`;

// Offline semantic search fallback for GATE syllabus
function offlineGateSearch(query) {
  if (!gate) return null;
  const q = query.toLowerCase();
  const hits = [];
  for (const s of gate.sections) {
    for (const t of s.topics) {
      if (t.text.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)) {
        hits.push(`• **${s.title}** ➔ ${t.text}`);
      }
    }
  }
  if (hits.length) {
    return `### Offline GATE Syllabus Match for "${query}":\n\n` + hits.slice(0, 8).join("\n") + `\n\n*(Connected to local syllabus. To enable full AI derivations, enter your free Google Gemini API Key in Settings).*`;
  }
  return null;
}

async function ask(text) {
  text = text.trim(); if (!text || busy) return;
  const ctx = context();
  msgs.push({ role: "user", content: text }); busy = true; keep(); render();
  let reply;

  // Check direct Gemini Key from user settings if Edge function is not deployed
  const customKey = localStorage.getItem("billi_gemini_key") || localStorage.getItem("gemini_api_key");

  try {
    if (customKey) {
      const prompt = `You are Billi, an expert GATE 2027 AI Tutor. Context: ${ctx}.
Provide a clear, highly structured, step-by-step explanation for: "${text}".
Include:
1. Core Concept & Principles
2. Key Mathematical Formulas (use standard readable LaTeX or $...$ format)
3. Step-by-Step Derivation / Solution
4. Common Mistakes & GATE Traps
5. 1 Practice Problem with quick answer.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${customKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (aiText) {
        reply = { role: "assistant", content: aiText };
        mascot.addXp(15);
      } else {
        throw new Error("No Gemini response");
      }
    } else {
      // Supabase Edge Function Gateway
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch(`${C.supabaseUrl}/functions/v1/billi-ask`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: C.supabaseKey, authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ messages: msgs.filter(m => !m.err).map(m => ({ role: m.role, content: m.content })), context: ctx })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.text) {
        reply = { role: "assistant", content: j.text + (j.truncated ? "\n\n(The answer was cut short. Ask me to continue.)" : "") };
        mascot.addXp(15);
      } else {
        // Fallback to offline local search engine
        const offlineAns = offlineGateSearch(text);
        if (offlineAns) {
          reply = { role: "assistant", content: offlineAns };
        } else {
          reply = { role: "assistant", err: true, content: "Could not connect to AI gateway. Add a free Google Gemini API Key in Settings to get unlimited instant step-by-step solutions!" };
        }
      }
    }
  } catch {
    const offlineAns = offlineGateSearch(text);
    reply = offlineAns ? { role: "assistant", content: offlineAns } : { role: "assistant", err: true, content: "Offline mode active. Check your internet connection or add a Gemini API Key in Settings." };
  }

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
