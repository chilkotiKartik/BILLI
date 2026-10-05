// Unit tests for the GATE revision logic (web/js/gate.js) and integrity checks on the syllabus data built from the official PDFs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { learn, review, summarise, partKey, isOptional, addDays, STEPS } from "../web/js/gate.js";

const DIR = new URL("../web/data/gate/", import.meta.url);
const load = n => JSON.parse(readFileSync(new URL(n + ".json", DIR), "utf8"));
const index = load("index");

test("revision cycle: learn, then reviews after 1, 3, 7 and 21 days, then finished", () => {
  let r = { topic_id: "CS:00000001", ...learn("2026-10-05") };
  assert.deepEqual([r.stage, r.next_review], [1, "2026-10-06"]);
  const dates = [];
  for (let i = 0; i < 4; i++) { const today = r.next_review; r = { ...r, ...review(r, true, today) }; dates.push([r.stage, r.next_review]); }
  assert.deepEqual(dates, [[2, "2026-10-09"], [3, "2026-10-16"], [4, "2026-11-06"], [5, null]]);
  assert.deepEqual(STEPS, [1, 3, 7, 21]);
});
test("forgetting sends a topic back to the start, due tomorrow", () => {
  assert.deepEqual(review({ stage: 3, next_review: "2026-10-16" }, false, "2026-10-20"), { stage: 1, next_review: "2026-10-21" });
});
test("addDays crosses month and year ends", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01"); assert.equal(addDays("2027-02-27", 3), "2027-03-02");
});
test("only chosen-between parts can be switched off", () => {
  assert.equal(isOptional("XE3: Thermodynamics"), true); assert.equal(isOptional("Part B2: Planning"), true);
  assert.equal(isOptional("XE0: Engineering Mathematics"), false); assert.equal(isOptional("Part A: Common Section"), false);
  assert.equal(isOptional(null), false); assert.equal(isOptional("General Aptitude"), false);
  assert.equal(partKey("Part B1: Architecture"), "Part B1");
});
test("summary counts learned topics, lists what is due oldest first, and picks the next unlearned topic", () => {
  const cs = load("CS"), ga = load("GA"), all = cs.sections.flatMap(s => s.groups.flatMap(g => g.topics));
  const rows = [{ topic_id: all[0].id, stage: 1, next_review: "2026-10-05" }, { topic_id: all[1].id, stage: 2, next_review: "2026-10-03" }, { topic_id: all[2].id, stage: 1, next_review: "2026-10-09" }, { topic_id: all[3].id, stage: 5, next_review: null }];
  const s = summarise(cs, ga, rows, [], "2026-10-05");
  assert.equal(s.done, 4); assert.equal(s.total, cs.topics + ga.topics);
  assert.deepEqual(s.due.map(d => d.id), [all[1].id, all[0].id]);
  assert.equal(s.next.id, all[4].id);
  assert.equal(s.sections.at(-1).part, "General Aptitude");
});
test("switching a part off removes it from totals, due list and next topic", () => {
  const xe = load("XE"), ga = load("GA");
  const full = summarise(xe, ga, [], [], "2026-10-05");
  const keys = [...new Set(xe.sections.map(s => partKey(s.part)))];
  assert.deepEqual(keys, ["XE0", "XE1", "XE2", "XE3", "XE4", "XE5", "XE6", "XE7", "XE8", "XE9"]);
  const less = summarise(xe, ga, [], keys.filter(k => !["XE0", "XE1", "XE2"].includes(k)), "2026-10-05");
  const kept = xe.sections.filter(s => ["XE0", "XE1", "XE2"].includes(partKey(s.part))).reduce((a, s) => a + s.groups.reduce((b, g) => b + g.topics.length, 0), 0);
  assert.equal(less.total, kept + ga.topics); assert.ok(less.total < full.total);
  const noZero = summarise(xe, ga, [], ["XE0"], "2026-10-05");            // the compulsory part cannot be switched off
  assert.equal(noZero.total, full.total);
});

test("data: exactly the 30 GATE 2027 papers, each with a file", () => {
  assert.equal(index.papers.length, 30);
  const want = "AE AG AR BM BT CE CH CS CY DA EC EE ES EY GE GG IN MA ME MN MT NM PE PH PI RA ST XE XH XL".split(" ");
  assert.deepEqual(index.papers.map(p => p.code), want);
  const files = readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort();
  assert.deepEqual(files, [...want, "GA", "index"].sort());
});
test("data: every paper has sections and topics; ids are unique and fit the database rule; counts match the index", () => {
  const seenAll = new Set();
  for (const code of [...index.papers.map(p => p.code), "GA"]) {
    const d = load(code); let n = 0;
    assert.ok(d.name && d.sections.length >= 3, code + " has too few sections");
    assert.ok(d.sources.length >= 1 && d.sources.every(u => u.startsWith("https://gate2027.iitm.ac.in/")), code + " source");
    for (const s of d.sections) { assert.ok(s.title && s.groups.length, code + " empty section " + s.title);
      for (const g of s.groups) { assert.ok(g.topics.length, code + " empty group");
        for (const t of g.topics) { n++; assert.match(t.id, /^[A-Z]{2}:[0-9a-f]{8}$/); assert.ok(t.id.startsWith(code + ":")); assert.ok(!seenAll.has(t.id), "duplicate id " + t.id); seenAll.add(t.id);
          assert.ok(t.text.length >= 2 && t.text.length < 900 && !/\s{2,}|\n/.test(t.text), code + " odd topic text: " + t.text.slice(0, 60)); } } }
    assert.equal(n, d.topics); if (code !== "GA") assert.equal(index.papers.find(p => p.code === code).topics, n);
  }
});
test("data: known content is where the official syllabus puts it", () => {
  const cs = load("CS"), titles = cs.sections.map(s => s.title);
  assert.deepEqual(titles, ["Engineering Mathematics", "Digital Logic", "Computer Organization and Architecture", "Programming and Data Structures", "Algorithms", "Theory of Computation", "Compiler Design", "Operating System", "Databases", "Computer Networks"]);
  const la = cs.sections[0].groups.find(g => g.title === "Linear Algebra");
  assert.ok(la.topics[0].text.includes("eigenvalues and eigenvectors"));
  assert.ok(cs.sections[8].groups[0].topics.some(t => t.text.includes("B and B+ trees")), "'e.g.' must not split a topic");
  assert.equal(load("GA").sections.length, 4);
  assert.equal(load("GG").sections[0].groups[0].title, "Introduction to Earth and planetary systems");
  assert.ok(load("ME").sections.flatMap(s => s.groups).some(g => g.topics.some(t => t.text.startsWith("I.C. Engines"))));
  assert.match(load("XH").rule, /XH0 is compulsory/); assert.match(load("CS").marks, /Engineering Mathematics 13/); assert.match(load("DA").marks, /Subject 85/);
});
