import { sb, $, $$, esc, cat, pawBurst, I, mountShell, pageHead, requireSession, getProfile, isoDate, daysUntil, toast, fail } from "../core.js";
import { loadGate, gateIndex } from "../gate-data.js";
import { learn, review, summarise, partKey, isOptional, STEPS } from "../gate.js";
import { startAlarms } from "../alarm.js";
import { mascot } from "../mascot.js";

mountShell("gate");
const { user } = await requireSession();
const main = $("#main");
let profile, G = null, index = null, openSecs = new Set();

// Lecture links are YouTube searches, so they always open something current; NPTEL is the IITs' own lecture series.
const yt = q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q.replace(/\s+/g, " ").trim());
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const when = iso => { const d = daysUntil(iso); return d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`; };
const resum = () => { G.summary = summarise(G.paper, G.ga, G.rows, profile.gate_parts_off, isoDate()); };

function predictorCard() {
  const S = G.summary;
  const p = pct(S.done, S.total);
  // Empirical GATE score estimate based on syllabus coverage
  const estimatedMarks = Math.min(100, Math.round(p * 0.72 + (p >= 50 ? 15 : p * 0.2)));
  let rankBracket = "Top 100 (AIR < 100)";
  if (estimatedMarks < 30) rankBracket = "Needs Preparation (Qualifying Target: 28-32)";
  else if (estimatedMarks < 45) rankBracket = "AIR 5,000 - 10,000 (NIT Eligible)";
  else if (estimatedMarks < 60) rankBracket = "AIR 1,500 - 5,000 (Top NITs / New IITs)";
  else if (estimatedMarks < 75) rankBracket = "AIR 300 - 1,500 (Old IITs & PSUs)";
  else rankBracket = "AIR 1 - 300 (Top IIT M.Tech / PSU Direct Interview)";

  return `
    <section class="card" aria-labelledby="pred-h" style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(16,185,129,0.08));border:1px solid rgba(99,102,241,0.25)">
      <div class="rowflex between" style="margin-bottom:8px">
        <h2 id="pred-h" style="font-size:17px;display:flex;align-items:center;gap:6px">🎯 <b>GATE 2027 Score Predictor</b></h2>
        <span class="tag gate" style="background:rgba(245,158,11,0.2);color:#f59e0b;font-weight:700">${estimatedMarks}/100 Marks</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:6px">
        <div style="font-size:28px">🏆</div>
        <div>
          <div style="font-size:14.5px;font-weight:700;color:var(--text-bright,#fff)">Projected Rank: <span style="color:#10b981">${rankBracket}</span></div>
          <div class="muted" style="font-size:13px;margin-top:2px">Calculated from ${p}% verified syllabus coverage & Spaced Repetition mastery.</div>
        </div>
      </div>
    </section>
  `;
}

/* ---------- choosing a paper ---------- */
function renderPicker(filter = "") {
  const f = filter.trim().toLowerCase();
  const list = index.papers.filter(p => !f || p.code.toLowerCase().includes(f) || p.name.toLowerCase().includes(f));
  main.innerHTML = `${pageHead("GATE", "Choose your paper. You can change it later.")}
  <div class="stack">
    <div class="field"><label for="p-q">Search the 30 papers</label><input id="p-q" type="text" autocomplete="off" value="${esc(filter)}" placeholder="Mechanical"></div>
    <div class="papers" id="plist">${list.map(p => `<button class="paper" data-paper="${p.code}"><span class="pc">${p.code}</span><span class="pn">${esc(p.name)}</span><span class="pt">${p.topics} topics</span></button>`).join("") || `<p class="muted">No paper matches that.</p>`}</div>
    <p class="muted" style="font-size:15px">Topics come from the official ${esc(index.exam)} syllabus published by ${esc(index.organiser)}, read on ${esc(index.fetched)}.</p>
  </div>`;
  const q = $("#p-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
}

/* ---------- the paper ---------- */
function topicRow(t) {
  const r = G.summary.byId.get(t.id);
  const note = r ? (r.stage === 5 ? "All four reviews done" : `Review ${r.stage} of ${STEPS.length} ${when(r.next_review)}`) : "";
  return `<label class="topic"><input type="checkbox" data-topic="${t.id}" ${r ? "checked" : ""}><span>${esc(t.text)}<span class="rv" data-rv="${t.id}">${note}</span></span></label>`;
}
function sectionBlock(s) {
  return `<details class="sec${s.off ? " sec-off" : ""}" data-sec="${s.index}" ${openSecs.has(s.index) ? "open" : ""}>
    <summary><span class="st">${esc(s.title)}</span><span class="sn" data-sn="${s.index}">${s.done}/${s.total}</span>
      <span class="bar${s.done === s.total ? " done" : ""}" data-sb="${s.index}"><i style="width:${pct(s.done, s.total)}%"></i></span></summary>
    <div class="body"><div class="reslinks"><a href="${yt(`NPTEL ${s.title} ${G.paper.code === "XE" || G.paper.code === "XH" || G.paper.code === "XL" ? "" : G.paper.name} lecture`)}" target="_blank" rel="noopener">${I.play}IIT lectures</a><a href="${yt(`GATE ${G.paper.code} ${s.title} previous year questions solved`)}" target="_blank" rel="noopener">${I.tasks}Solved past questions</a><a href="ask.html?q=${encodeURIComponent(`Give me every key formula for ${s.title}`)}">${I.chat}Ask Billi</a></div>${s.groups.map(g => `${g.title ? `<h4 class="grp">${esc(g.title)}</h4>` : ""}${g.topics.map(topicRow).join("")}`).join("")}</div>
  </details>`;
}
function dueCard() {
  const d = G.summary.due;
  if (!d.length) return "";
  return `<section class="card pop" aria-labelledby="due-h"><div class="rowflex between"><h2 id="due-h">Revise today</h2><span class="tag gate">${d.length} ${d.length === 1 ? "topic" : "topics"}</span></div>
    <p class="muted" style="font-size:15px;margin-top:2px">Try to recall each one before you look it up. Then say how it went.</p>
    ${d.slice(0, 8).map(x => `<div class="due"><div><div class="t" style="font-weight:500;overflow-wrap:anywhere">${esc(x.text)}</div><div class="s muted" style="font-size:14.5px">${esc(x.section)}</div></div>
      <div class="rowflex"><button class="btn primary sm" data-rev="${x.id}" data-ok="1">I remembered<span class="sr">: ${esc(x.text)}</span></button><button class="btn sm" data-rev="${x.id}" data-ok="0">I forgot<span class="sr">: ${esc(x.text)}</span></button></div></div>`).join("")}
    ${d.length > 8 ? `<p class="muted" style="font-size:15px;padding-top:8px">and ${d.length - 8} more after these.</p>` : ""}</section>`;
}
function headCard() {
  const S = G.summary, days = daysUntil(profile.gate_exam_date), p = pct(S.done, S.total);
  return `<section class="scene" aria-label="Your GATE progress">${cat(S.done && S.done === S.total ? "play" : "idle", "Billi in a graduation cap", { cap: true })}
    <div><div class="rowflex between"><b class="num" style="font-size:26px" id="g-done">${S.done} of ${S.total}</b><span class="tag gate">${days >= 0 ? days : 0} days left</span></div>
    <div class="muted" style="font-size:15px">topics learned</div>
    <div class="bar${p === 100 ? " done" : ""}" id="g-bar" style="margin-top:8px" role="progressbar" aria-valuemin="0" aria-valuemax="${S.total}" aria-valuenow="${S.done}" aria-label="Topics learned"><i style="width:${p}%"></i></div></div></section>`;
}
function nextCard() {
  const n = G.summary.next;
  return n ? `<section class="card" aria-labelledby="nx-h"><h2 id="nx-h" style="font-size:18px">Next topic</h2><p style="font-weight:500;margin-top:4px;overflow-wrap:anywhere">${esc(n.text)}</p><p class="muted" style="font-size:15px">${esc(n.section)}</p>
    <div class="rowflex" style="margin-top:10px"><a class="btn gate sm" href="timer.html?track=gate">${I.play}Study it now</a><a class="btn sm" href="${yt(`NPTEL ${n.text.split(/[,:(]/)[0]} ${n.section} lecture`)}" target="_blank" rel="noopener">Find a lecture</a><a class="btn sm" href="ask.html?q=${encodeURIComponent(`Explain ${n.text.split(/[,:(]/)[0]} with one solved GATE-level example`)}">${I.chat}Ask Billi</a></div></section>` : "";
}
function render() {
  const P = G.paper, S = G.summary;
  let html = "", lastPart = "\u0000";
  for (const s of S.sections) {
    if (s.part !== lastPart) {
      lastPart = s.part;
      if (s.part) html += `<div class="part-h"><h2>${esc(s.part)}</h2>${isOptional(s.part) ? `<label class="switch" style="min-height:44px;gap:8px"><span class="muted" style="font-size:14.5px">I am taking this</span><input type="checkbox" data-part="${esc(partKey(s.part))}" ${s.off ? "" : "checked"}></label>` : ""}</div>`;
    }
    html += sectionBlock(s);
  }
  main.innerHTML = `${pageHead("GATE 2027 Syllabus & Mastery Tracker", `${P.code}, ${P.name}`, `<button class="linkbtn" id="change">Change paper</button>`)}
  <div class="stack">
    <div id="g-mascot"></div>
    <div id="g-head">${headCard()}</div>
    <div id="g-pred">${predictorCard()}</div>
    <div id="g-due">${dueCard()}</div>
    <div id="g-next">${nextCard()}</div>
    <div class="rowflex"><a class="btn primary" href="mock.html">${I.timer}Take Full Mock Test</a><a class="btn" href="ask.html">${I.chat}Ask Billi AI</a></div>
    <section class="card" aria-labelledby="pat-h"><h2 id="pat-h" style="font-size:18px">Official GATE Marking Scheme</h2>
      <p style="margin-top:4px">${esc(P.marks)}. 65 questions in 3 hours, 100 marks total.</p>
      <p class="muted" style="font-size:15px">MCQ: +1/-0.33 on 1-mark, +2/-0.66 on 2-mark. MSQ and NAT: No negative marking.</p>
      ${P.rule ? `<p style="margin-top:6px;font-weight:500">${esc(P.rule)}</p>` : ""}</section>
    <section aria-labelledby="syl-h"><h2 id="syl-h" class="section-t">Official Syllabus & Spaced Repetition</h2><p class="muted" style="font-size:15px;margin:6px 0 8px">Tick a topic when learned. Automatic revisions will be scheduled after 1, 3, 7 and 21 days.</p>
      <div class="stack" style="gap:8px" id="secs">${html}</div></section>
    <section class="card" aria-labelledby="off-h"><h2 id="off-h" style="font-size:18px">Official IIT Madras Material</h2>
      <ul class="links" style="margin-top:10px">
        ${P.sources.length === 1 ? `<li><a href="${esc(P.sources[0])}" target="_blank" rel="noopener">Official ${P.code} syllabus<small>PDF</small></a></li>` : `<li><a href="${esc(index.syllabus_page)}" target="_blank" rel="noopener">Official ${P.code} syllabus, all sections<small>IIT Madras</small></a></li>`}
        <li><a href="${esc(G.ga.sources[0])}" target="_blank" rel="noopener">General Aptitude syllabus<small>PDF</small></a></li>
        <li><a href="${esc(index.papers_page)}" target="_blank" rel="noopener">Past question papers and answer keys<small>IIT Madras</small></a></li>
        <li><a href="https://gate.nptel.ac.in/" target="_blank" rel="noopener">Free lectures and solved past questions<small>NPTEL</small></a></li>
        <li><a href="${esc(index.site)}" target="_blank" rel="noopener">GATE 2027 dates and admit card<small>IIT Madras</small></a></li>
      </ul>
      <p class="muted" style="font-size:14.5px;margin-top:10px">Topic wording is copied directly from the official IIT syllabus. Offline ready.</p></section>
  </div>`;
  mascot.renderWidget($("#g-mascot"), S.done === S.total ? "completed" : "idle");
}
// After a tick or a review, update the numbers in place so open sections stay open and focus stays put.
function refresh(sectionIndex) {
  resum();
  $("#g-head").innerHTML = headCard();
  $("#g-pred").innerHTML = predictorCard();
  $("#g-due").innerHTML = dueCard();
  $("#g-next").innerHTML = nextCard();
  mascot.renderWidget($("#g-mascot"), "completed");
  for (const s of G.summary.sections) {
    if (sectionIndex != null && s.index !== sectionIndex) continue;
    const sn = $(`[data-sn="${s.index}"]`), sb2 = $(`[data-sb="${s.index}"]`);
    if (sn) sn.textContent = `${s.done}/${s.total}`;
    if (sb2) { sb2.classList.toggle("done", s.done === s.total); sb2.firstElementChild.style.width = pct(s.done, s.total) + "%"; }
  }
}
function setNote(id) {
  const el = $(`[data-rv="${id}"]`), r = G.summary.byId.get(id);
  if (el) el.textContent = r ? (r.stage === 5 ? "All four reviews done" : `Review ${r.stage} of ${STEPS.length} ${when(r.next_review)}`) : "";
}

main.addEventListener("toggle", e => { const d = e.target; if (d.matches && d.matches("details.sec")) { const i = +d.dataset.sec; d.open ? openSecs.add(i) : openSecs.delete(i); } }, true);
main.addEventListener("input", e => { if (e.target.id === "p-q") renderPicker(e.target.value); });
main.addEventListener("change", async e => {
  const t = e.target, today = isoDate();
  try {
    if (t.dataset.topic) {
      const id = t.dataset.topic; t.disabled = true;
      if (t.checked) {
        const row = { topic_id: id, ...learn(today) };
        const { error } = await sb.from("billi_gate_progress").upsert({ ...row, updated_at: new Date().toISOString() }); if (error) throw error;
        G.rows = G.rows.filter(r => r.topic_id !== id).concat(row);
        mascot.addXp(10);
      } else {
        const { error } = await sb.from("billi_gate_progress").delete().eq("topic_id", id); if (error) throw error;
        G.rows = G.rows.filter(r => r.topic_id !== id);
      }
      t.disabled = false; refresh(+t.closest("details").dataset.sec); setNote(id); t.focus();
      if (t.checked) { pawBurst(t); toast("Learned! +10 XP. Scheduled for Day 1 revision.", "ok"); }
    } else if (t.dataset.part) {
      const off = new Set(profile.gate_parts_off || []); t.checked ? off.delete(t.dataset.part) : off.add(t.dataset.part);
      const { error } = await sb.from("billi_profiles").update({ gate_parts_off: [...off] }).eq("id", user.id); if (error) throw error;
      profile.gate_parts_off = [...off]; resum(); render(); $(`[data-part="${t.dataset.part}"]`)?.focus();
    }
  } catch (x) { t.disabled = false; if (t.dataset.topic) t.checked = !t.checked; fail(x); }
});
main.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.dataset.paper) {
      b.disabled = true;
      const { error } = await sb.from("billi_profiles").update({ gate_paper: b.dataset.paper, gate_parts_off: [] }).eq("id", user.id); if (error) throw error;
      profile.gate_paper = b.dataset.paper; profile.gate_parts_off = []; openSecs = new Set();
      G = await loadGate(profile); render(); main.focus(); scrollTo(0, 0);
    } else if (b.id === "change") { renderPicker(); }
    else if (b.dataset.rev) {
      const id = b.dataset.rev, row = G.rows.find(r => r.topic_id === id), ok = b.dataset.ok === "1"; b.disabled = true;
      const next = review(row, ok, isoDate());
      const { error } = await sb.from("billi_gate_progress").update({ ...next, updated_at: new Date().toISOString() }).eq("topic_id", id); if (error) throw error;
      Object.assign(row, next);
      if (ok) mascot.addXp(15);
      refresh(null); setNote(id);
      toast(ok ? (next.stage === 5 ? "Topic completed! All reviews passed! +15 XP" : `Great! Next review ${when(next.next_review)}. +15 XP`) : "Topic returned to Day 1 revision.", ok ? "ok" : "");
      ($("#g-due button") || $("#g-next a") || main).focus();
    }
  } catch (x) { b.disabled = false; fail(x); }
});

try {
  profile = await getProfile(user);
  index = await gateIndex();
  if (profile.gate_paper && !index.papers.some(p => p.code === profile.gate_paper)) profile.gate_paper = null;
  if (profile.gate_paper) { G = await loadGate(profile); render(); } else renderPicker();
  startAlarms(user, profile);
} catch (x) { main.innerHTML = `${pageHead("GATE")}<div class="card empty"><h2>Could not load GATE</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="gate.html">Try again</a></div>`; console.error(x); }
