// Pure GATE logic: the revision cycle and the progress summary. No browser or network code, so it is unit-tested directly.
export const STEPS = [1, 3, 7, 21];                         // days until each review after learning a topic
const pad = n => String(n).padStart(2, "0");
export const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const learn = today => ({ stage: 1, learned_on: today, next_review: addDays(today, STEPS[0]) });
// A remembered review moves the topic on; after the fourth it is finished. A forgotten one starts the cycle again.
export function review(row, remembered, today) {
  if (!remembered) return { stage: 1, next_review: addDays(today, STEPS[0]) };
  const stage = Math.min(5, row.stage + 1);
  return { stage, next_review: stage === 5 ? null : addDays(today, STEPS[stage - 1]) };
}

export const partKey = part => (part ? part.split(":")[0].trim() : "");
// Only the parts a student actually chooses between can be switched off: XE1..XE9, XH1..XH6, XL1..XL5 and Part B1 / B2.
export const isOptional = part => /^(X[EHL][1-9]|Part B\d)$/.test(partKey(part));

export function summarise(paper, ga, rows, partsOff, today) {
  const byId = new Map(rows.map(r => [r.topic_id, r]));
  const off = new Set(partsOff || []);
  const gaSections = ga ? ga.sections.map(s => ({ ...s, part: "General Aptitude" })) : [];
  const sections = [...paper.sections, ...gaSections].map((s, i) => {
    const topics = s.groups.flatMap(g => g.topics);
    const isOff = isOptional(s.part) && off.has(partKey(s.part));
    return { ...s, index: i, off: isOff, total: topics.length, done: topics.filter(t => byId.has(t.id)).length };
  });
  const active = sections.filter(s => !s.off);
  const due = [], seen = new Set();
  let next = null;
  for (const s of active) for (const g of s.groups) for (const t of g.topics) {
    const r = byId.get(t.id);
    if (!r) { if (!next) next = { id: t.id, text: t.text, section: s.title }; continue; }
    if (r.next_review && r.next_review <= today && !seen.has(t.id)) { seen.add(t.id); due.push({ id: t.id, text: t.text, section: s.title, row: r }); }
  }
  due.sort((a, b) => (a.row.next_review < b.row.next_review ? -1 : a.row.next_review > b.row.next_review ? 1 : 0));
  return { sections, total: active.reduce((a, s) => a + s.total, 0), done: active.reduce((a, s) => a + s.done, 0), due, next, byId };
}
