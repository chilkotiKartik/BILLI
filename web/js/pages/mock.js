import { sb, $, $$, esc, cat, pawBurst, I, mountShell, pageHead, requireSession, getProfile, pad, toast, fail, confirmDialog } from "../core.js";
import { scoreSet, answered } from "../mock.js";
import { startAlarms, ping } from "../alarm.js";
import { mascot } from "../mascot.js";

mountShell("gate");
const { user } = await requireSession();
const main = $("#main"), KEY = "billi-mock", LIMIT = 180 * 60;
let profile, data = null, attempts = [], run = null, ticker = null;

const file = n => fetch(`data/papers/${n}.json`).then(r => { if (!r.ok) throw new Error("no papers"); return r.json(); });
const setOf = id => data.sets.find(s => s.id === id);
const label = s => `${s.year}${/\d$/.test(s.set) ? ", set " + s.set.slice(-1) : ""}`;
const clock = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const left = () => LIMIT - (Date.now() - run.startedAt) / 1000;
const saveRun = () => { try { run ? localStorage.setItem(KEY, JSON.stringify(run)) : localStorage.removeItem(KEY); } catch {} };
try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r && r.setId && r.startedAt && r.user === user.id) run = r; } catch {}

async function loadAttempts() {
  const { data: rows, error } = await sb.from("billi_mocks").select("*").eq("paper", profile.gate_paper).order("created_at", { ascending: false });
  if (error) throw error;
  attempts = rows;
}

/* ---------- list of papers ---------- */
function renderList() {
  clearInterval(ticker); document.title = "Mock tests | Billi";
  const best = id => { const a = attempts.filter(x => x.set_id === id); return a.length ? Math.max(...a.map(x => +x.score)) : null; };
  main.innerHTML = `${pageHead("GATE 2027 Mock Tests", `${profile.gate_paper} official past papers with auto-marking`, `<a class="linkbtn" href="gate.html">Syllabus</a>`)}
  <div class="stack">
    <div id="mock-mascot-bar"></div>
    ${attempts.length ? `<section class="card" aria-labelledby="att-h"><h2 id="att-h" style="font-size:18px">Your attempts</h2><ul class="list" style="list-style:none;padding:0;margin:6px 0 0">${attempts.slice(0, 6).map(a => { const s = setOf(a.set_id);
      return `<li class="item" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="t">${s ? esc(label(s)) : esc(a.set_id)}</div><div class="s">${new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${a.correct} right, ${a.wrong} wrong, ${a.skipped} skipped</div></div><div class="item-r"><b class="num" style="font-size:20px">${+a.score}</b><button class="btn sm" data-view="${a.id}">Review<span class="sr"> attempt on ${s ? esc(label(s)) : ""}</span></button></div></li>`; }).join("")}</ul></section>` : ""}
    <section aria-labelledby="pp-h"><h2 id="pp-h" class="section-t">Official Past Papers (65 Questions, 3 Hours)</h2>
      <div class="stack" style="gap:8px;margin-top:8px">${data.sets.map(s => { const b = best(s.id); return `<div class="card" style="padding:12px 14px">
        <div class="rowflex between"><h3>${esc(label(s))}</h3>${b != null ? `<span class="tag ok">Best ${b} Marks</span>` : s.questions ? "" : `<span class="tag plain">No auto-marking</span>`}</div>
        <div class="rowflex" style="margin-top:8px"><a class="btn sm" href="${esc(s.qp)}" target="_blank" rel="noopener">Question paper PDF</a><a class="btn sm" href="${esc(s.key)}" target="_blank" rel="noopener">Answer key</a>${s.questions ? `<button class="btn gate sm" data-start="${s.id}">${I.play}Start 3-Hour Mock<span class="sr"> ${esc(label(s))}</span></button>` : ""}</div>
        ${s.questions ? "" : `<p class="muted" style="font-size:14.5px;margin-top:8px">This key could not be read by the app, so check your answers against the official key yourself.</p>`}</div>`; }).join("")}</div>
      <p class="muted" style="font-size:14.5px;margin-top:10px">Questions are evaluated using authentic GATE marking rules (+1/-0.33, +2/-0.66, MSQ/NAT full accuracy).</p></section>
  </div>`;
  mascot.renderWidget($("#mock-mascot-bar"), "idle", "Take a 3-hour full mock test under real exam conditions!");
}

/* ---------- running a mock ---------- */
function control(q) {
  const a = run.answers[q.n];
  if (q.t === "NAT") return `<input type="text" inputmode="decimal" autocomplete="off" data-nat="${q.n}" value="${esc(a ?? "")}" aria-label="Question ${q.n}, numerical answer" style="max-width:150px">`;
  const type = q.t === "MCQ" ? "radio" : "checkbox", cur = q.t === "MCQ" ? [a] : a || [];
  return `<div class="seg opts" role="group" aria-label="Question ${q.n}, ${q.t === "MCQ" ? "choose one" : "choose all that apply"}">${["A", "B", "C", "D"].map(l => `<label><input type="${type}" name="q${q.n}" value="${l}" data-opt="${q.n}" ${cur.includes(l) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>`;
}
function renderRun() {
  const s = setOf(run.setId), qs = s.questions;
  main.innerHTML = `<header class="mockbar" aria-label="Mock test"><div><div class="muted" style="font-size:14px">${esc(profile.gate_paper)} ${esc(label(s))}</div><div class="num" id="m-clock" role="timer" style="font-size:30px;line-height:1">${clock(left())}</div></div>
    <div class="rowflex"><span class="muted" id="m-count" style="font-size:14.5px"></span><button class="btn primary sm" id="m-submit">Submit</button></div></header>
  <div class="stack" style="margin-top:12px">
    <div class="card rowflex between"><span style="font-weight:500">The questions are in the official paper.</span><a class="btn sm" href="${esc(s.qp)}" target="_blank" rel="noopener">Open question paper</a></div>
    <p class="muted" style="font-size:14.5px">65 questions, 3 hours. A wrong multiple-choice answer loses a third of its marks, so leave it blank if you are guessing. Tap a chosen option again to clear it.</p>
    <ol class="sheet">${qs.map(q => `<li class="qrow${run.flags[q.n] ? " flag" : ""}" data-q="${q.n}"><div class="qn"><b class="num">${q.n}</b><span class="tag ${q.sec === "GA" ? "plain" : "gate"}">${q.t}, ${q.m} ${q.m === 1 ? "mark" : "marks"}</span></div>
      <div class="qc">${control(q)}<button class="iconbtn flagbtn" data-flag="${q.n}" aria-pressed="${!!run.flags[q.n]}" aria-label="Mark question ${q.n} for review">${I.flag}</button></div></li>`).join("")}</ol>
    <div class="rowflex between"><button class="linkbtn" id="m-quit" style="color:var(--bad)">Leave without marking</button><button class="btn primary" id="m-submit2">Submit and mark</button></div>
  </div>`;
  count(); clearInterval(ticker); ticker = setInterval(tick, 500); tick();
}
function count() { const el = $("#m-count"); if (el) el.textContent = `${answered(run.answers)} of 65 answered${Object.values(run.flags).filter(Boolean).length ? `, ${Object.values(run.flags).filter(Boolean).length} to review` : ""}`; }
function tick() {
  if (!run) return;
  const l = left(), el = $("#m-clock");
  if (el) { el.textContent = clock(l); el.style.color = l < 600 ? "var(--bad)" : ""; }
  document.title = `${clock(l)} mock | Billi`;
  if (l <= 0) finish(true);
}
async function finish(timeUp) {
  if (!run || run.submitting) return;
  run.submitting = true; clearInterval(ticker);
  const s = setOf(run.setId), r = scoreSet(s.questions, run.answers), seconds = Math.min(LIMIT, Math.round((Date.now() - run.startedAt) / 1000));
  try {
    const { data: row, error } = await sb.from("billi_mocks").insert({ set_id: s.id, paper: profile.gate_paper, started_at: new Date(run.startedAt).toISOString(), seconds, answers: run.answers,
      score: r.score, max_marks: r.max, correct: r.correct, wrong: r.wrong, skipped: r.skipped }).select().single();
    if (error) throw error;
    run = null; saveRun(); attempts.unshift(row); ping();
    const gainedXp = 100 + Math.max(0, Math.round(r.score));
    mascot.addXp(gainedXp);
    toast(`Mock test submitted! +${gainedXp} XP earned.`, "ok");
    renderResult(row, timeUp ? "Time is up. Your sheet was submitted." : "");
  } catch (x) { run.submitting = false; ticker = setInterval(tick, 500); fail(x, "Could not save your mock. Check your internet and submit again."); }
}

/* ---------- result ---------- */
function renderResult(a, note = "") {
  clearInterval(ticker); document.title = "Mock result | Billi";
  const s = setOf(a.set_id);
  if (!s || !s.questions) { main.innerHTML = `${pageHead("Mock result")}<div class="card empty"><h2>This paper is no longer available</h2><button class="btn primary" id="back">Back to papers</button></div>`; return; }
  const r = scoreSet(s.questions, a.answers), mood = r.score >= 60 ? "play" : r.score >= 30 ? "idle" : "sulk";
  const tbl = (title, map) => `<h3 style="margin-top:14px">${title}</h3><ul class="list" style="list-style:none;padding:0;margin:4px 0 0">${Object.entries(map).map(([k, v]) => `<li class="item" style="grid-template-columns:minmax(0,1fr) auto;padding:8px 0"><span class="t">${esc(k)}</span><span class="num">${v.score} of ${v.max}<span class="muted" style="font-weight:400;font-size:14.5px">, ${v.correct}/${v.n} right</span></span></li>`).join("")}</ul>`;
  
  let rankEstimate = "AIR < 200";
  if (r.score < 25) rankEstimate = "Below Qualifying (Target: 30+)";
  else if (r.score < 40) rankEstimate = "AIR 4,000 - 8,000";
  else if (r.score < 60) rankEstimate = "AIR 1,000 - 3,000";
  else if (r.score < 75) rankEstimate = "AIR 200 - 1,000";

  main.innerHTML = `${pageHead("Mock result", `${profile.gate_paper} ${label(s)}`, `<button class="linkbtn" id="back">All papers</button>`)}
  <div class="stack">
    <div id="mock-res-mascot"></div>
    ${note ? `<p class="card" role="status" style="border-color:var(--ink)">${esc(note)}</p>` : ""}
    <section class="scene" aria-label="Your score">${cat(mood, "Billi", { cap: true })}<div><div class="num" id="r-score" style="font-size:40px;line-height:1">${r.score}<span class="muted" style="font-size:20px"> of ${r.max}</span></div>
      <div class="muted" style="margin-top:4px">${r.correct} right, ${r.wrong} wrong, ${r.skipped} skipped, in ${clock(a.seconds)}</div></div></section>
    <section class="card" aria-labelledby="pred-mock"><h2 id="pred-mock" style="font-size:18px">Projected GATE Rank</h2>
      <p style="margin-top:4px;font-size:16px;font-weight:700;color:#10b981">Estimated Rank: ${rankEstimate}</p>
      <p class="muted" style="font-size:13.5px;margin-top:2px">Based on official normalized GATE score distributions.</p></section>
    <section class="card" aria-labelledby="an-h"><h2 id="an-h" style="font-size:18px">Where the marks went</h2>
      <p style="margin-top:6px">${r.lost > 0 ? `Wrong multiple-choice answers cost you <b>${r.lost} marks</b>. Without those guesses your score would be ${Math.round((r.score + r.lost) * 100) / 100}.` : "You lost nothing to negative marking."}</p>
      ${r.unscored ? `<p class="muted" style="font-size:15px;margin-top:6px">${r.unscored} ${r.unscored === 1 ? "question has" : "questions have"} a key the app could not read. Check ${r.unscored === 1 ? "it" : "them"} against the official key.</p>` : ""}
      ${tbl("By part", r.bySection)}${tbl("By question type", r.byType)}</section>
    <section class="card" aria-labelledby="qs-h"><div class="rowflex between"><h2 id="qs-h" style="font-size:18px">Every question</h2><a class="linkbtn" href="${esc(s.qp)}" target="_blank" rel="noopener">Open the paper</a></div>
      <div style="overflow-x:auto;margin-top:6px"><table class="res"><thead><tr><th scope="col">Q</th><th scope="col">Yours</th><th scope="col">Key</th><th scope="col">Marks</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr class="${x.state}"><th scope="row">${x.n}</th><td>${esc(x.your) || "<span class='muted'>blank</span>"}</td><td>${esc(x.key)}</td><td class="num">${x.state === "unscored" ? "check" : x.marks > 0 ? "+" + x.marks : x.marks}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted" style="font-size:14.5px;margin-top:10px">Marked against the official final answer key. For the wrong ones, redo the question before you look at any solution.</p></section>
  </div>`;
  mascot.renderWidget($("#mock-res-mascot"), r.score >= 50 ? "completed" : "idle", r.score >= 50 ? "Bohot badhiya score! Purrrr! Keep revising!" : "Review your mistakes and re-attempt the weak topics.");
  if (!note) scrollTo(0, 0);
  if (r.score >= 60) pawBurst($("#r-score"));
}

main.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.dataset.start) {
      const s = setOf(b.dataset.start);
      if (!(await confirmDialog("Start this mock?", `${profile.gate_paper} ${label(s)}. The 3-hour clock starts now and keeps running if you leave the page. Open the question paper in another tab or on another screen.`, "Start the clock"))) return;
      run = { user: user.id, setId: s.id, startedAt: Date.now(), answers: {}, flags: {} }; saveRun(); renderRun(); scrollTo(0, 0);
    } else if (b.id === "m-submit" || b.id === "m-submit2") {
      const n = answered(run.answers);
      if (await confirmDialog("Submit and mark?", `You answered ${n} of 65. You cannot change answers after this.`, "Submit")) finish(false);
    } else if (b.id === "m-quit") {
      if (await confirmDialog("Leave this mock?", "Your answers will be thrown away and nothing is saved.", "Leave")) { run = null; saveRun(); renderList(); }
    } else if (b.dataset.flag) {
      const n = b.dataset.flag; run.flags[n] = !run.flags[n]; saveRun();
      b.setAttribute("aria-pressed", run.flags[n]); b.closest(".qrow").classList.toggle("flag", run.flags[n]); count();
    } else if (b.dataset.view) { renderResult(attempts.find(a => a.id === b.dataset.view)); }
    else if (b.id === "back") renderList();
  } catch (x) { fail(x); }
});
// A second tap on a chosen MCQ option clears it, so a guess can be withdrawn.
main.addEventListener("click", e => {
  const i = e.target.closest("input[type=radio][data-opt]"); if (!i || !run) return;
  if (run.answers[i.dataset.opt] === i.value && i.dataset.was === "1") { i.checked = false; delete run.answers[i.dataset.opt]; i.dataset.was = ""; saveRun(); count(); return; }
  $$(`input[name="${i.name}"]`).forEach(x => (x.dataset.was = "")); i.dataset.was = "1";
});
main.addEventListener("input", e => {
  const t = e.target; if (!run) return;
  if (t.dataset.nat) { const v = t.value.trim(); if (v) run.answers[t.dataset.nat] = v.slice(0, 20); else delete run.answers[t.dataset.nat]; }
  else if (t.dataset.opt) {
    if (t.type === "radio") run.answers[t.dataset.opt] = t.value;
    else { const set = $$(`input[name="${t.name}"]:checked`).map(x => x.value); if (set.length) run.answers[t.dataset.opt] = set; else delete run.answers[t.dataset.opt]; }
  } else return;
  saveRun(); count();
});

try {
  profile = await getProfile(user);
  if (!profile.gate_paper) { main.innerHTML = `${pageHead("Mock tests")}<div class="card empty">${cat("idle")}<h2>Choose your GATE paper first</h2><a class="btn primary" href="gate.html">Choose a paper</a></div>`; }
  else {
    try { data = await file(profile.gate_paper); } catch { data = { sets: [] }; }
    await loadAttempts();
    if (run && (!setOf(run.setId) || !setOf(run.setId).questions)) { run = null; saveRun(); }
    if (!data.sets.length) main.innerHTML = `${pageHead("Mock tests", "", `<a class="linkbtn" href="gate.html">Syllabus</a>`)}<div class="card empty">${cat("idle")}<h2>No past papers for ${esc(profile.gate_paper)} yet</h2><p class="muted">This is a new paper, so IIT has not published earlier question papers. The official site has a sample paper.</p><a class="btn" href="https://gate2027.iitm.ac.in/download" target="_blank" rel="noopener">Open the official downloads</a></div>`;
    else if (run) renderRun(); else renderList();
  }
  startAlarms(user, profile);
} catch (x) { main.innerHTML = `${pageHead("Mock tests")}<div class="card empty"><h2>Could not load the mock tests</h2><p class="muted">Check your internet connection.</p><a class="btn primary" href="mock.html">Try again</a></div>`; console.error(x); }
