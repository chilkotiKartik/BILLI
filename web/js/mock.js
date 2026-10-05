// Pure mock-test scoring against the official answer key. No browser or network code, so it is unit-tested directly.
// GATE rules: a wrong MCQ loses one third of its marks; MSQ and NAT have no negative marking and no partial marks.
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function keyText(q) {
  if (q.u) return "See the official key";
  if (q.mta) return "Marks to all";
  if (q.t === "MCQ") return q.k.join(" or ");
  if (q.t === "MSQ") return q.s.map(s => s.join(", ")).join(" or ");
  return q.r.map(([lo, hi]) => (lo === hi ? String(lo) : `${lo} to ${hi}`)).join(" or ");
}
export function answerText(q, a) {
  if (a == null || a === "" || (Array.isArray(a) && !a.length)) return "";
  return Array.isArray(a) ? [...a].sort().join(", ") : String(a);
}
export function scoreQuestion(q, a) {
  const blank = a == null || a === "" || (Array.isArray(a) && !a.length);
  if (q.u) return { state: "unscored", marks: 0 };
  if (q.mta) return { state: "correct", marks: q.m };                       // the official key gives everyone the marks
  if (blank) return { state: "skipped", marks: 0 };
  if (q.t === "MCQ") return q.k.includes(a) ? { state: "correct", marks: q.m } : { state: "wrong", marks: -q.m / 3 };
  if (q.t === "MSQ") { const mine = [...a].sort(); return q.s.some(s => same(s, mine)) ? { state: "correct", marks: q.m } : { state: "wrong", marks: 0 }; }
  const v = Number(String(a).trim());
  if (!Number.isFinite(v)) return { state: "wrong", marks: 0 };
  return q.r.some(([lo, hi]) => v >= lo - 1e-9 && v <= hi + 1e-9) ? { state: "correct", marks: q.m } : { state: "wrong", marks: 0 };
}
export function scoreSet(questions, answers) {
  const out = { score: 0, max: 0, correct: 0, wrong: 0, skipped: 0, unscored: 0, lost: 0, bySection: {}, byType: {}, rows: [] };
  const add = (map, k, r, q) => { const b = (map[k] = map[k] || { score: 0, max: 0, correct: 0, n: 0 }); b.n++; b.score += r.marks; if (!q.u) b.max += q.m; if (r.state === "correct") b.correct++; };
  for (const q of questions) {
    const a = answers[q.n], r = scoreQuestion(q, a);
    out.score += r.marks; if (!q.u) out.max += q.m;
    out[r.state]++; if (r.marks < 0) out.lost -= r.marks;
    add(out.bySection, q.sec === "GA" ? "General Aptitude" : "Subject", r, q); add(out.byType, q.t, r, q);
    out.rows.push({ n: q.n, t: q.t, m: q.m, sec: q.sec, your: answerText(q, a), key: keyText(q), state: r.state, marks: Math.round(r.marks * 100) / 100 });
  }
  const r2 = x => Math.round(x * 100) / 100;
  out.score = r2(out.score); out.lost = r2(out.lost);
  for (const m of [out.bySection, out.byType]) for (const k of Object.keys(m)) m[k].score = r2(m[k].score);
  return out;
}
export const answered = answers => Object.values(answers).filter(a => !(a == null || a === "" || (Array.isArray(a) && !a.length))).length;
