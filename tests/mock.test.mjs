// Unit tests for mock scoring (web/js/mock.js) and integrity checks on the parsed official answer keys.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { scoreQuestion, scoreSet, keyText, answered } from "../web/js/mock.js";

const DIR = new URL("../web/data/papers/", import.meta.url);
const load = n => JSON.parse(readFileSync(new URL(n + ".json", DIR), "utf8"));
const mcq = (m = 1, k = ["B"]) => ({ n: 1, t: "MCQ", sec: "GA", m, k });

test("MCQ: right gets the marks, wrong loses one third, blank gets zero", () => {
  assert.deepEqual(scoreQuestion(mcq(1), "B"), { state: "correct", marks: 1 });
  assert.equal(scoreQuestion(mcq(1), "A").marks, -1 / 3);
  assert.equal(scoreQuestion(mcq(2), "A").marks, -2 / 3);
  assert.deepEqual(scoreQuestion(mcq(2), ""), { state: "skipped", marks: 0 });
  assert.equal(scoreQuestion(mcq(1, ["B", "C"]), "C").state, "correct");          // key lists two accepted options
});
test("MSQ: only the exact set scores; no negative, no partial", () => {
  const q = { n: 2, t: "MSQ", sec: "CS", m: 2, s: [["A", "C", "D"]] };
  assert.equal(scoreQuestion(q, ["D", "A", "C"]).marks, 2);
  assert.deepEqual(scoreQuestion(q, ["A", "C"]), { state: "wrong", marks: 0 });
  assert.deepEqual(scoreQuestion(q, ["A", "B", "C", "D"]), { state: "wrong", marks: 0 });
  assert.deepEqual(scoreQuestion(q, []), { state: "skipped", marks: 0 });
  assert.equal(scoreQuestion({ ...q, s: [["A", "B"], ["A", "B", "D"]] }, ["A", "B", "D"]).state, "correct");
});
test("NAT: inside the official range (ends included) scores; outside or not a number gets zero, never negative", () => {
  const q = { n: 3, t: "NAT", sec: "CS", m: 2, r: [[12.5, 12.7]] };
  for (const a of ["12.5", "12.6", "12.7", " 12.60 "]) assert.equal(scoreQuestion(q, a).marks, 2, a);
  for (const a of ["12.49", "12.71", "abc", "-12.6"]) assert.deepEqual(scoreQuestion(q, a), { state: "wrong", marks: 0 }, a);
  assert.equal(scoreQuestion({ ...q, r: [[-5, -5], [5, 5]] }, "-5").state, "correct");
  assert.equal(scoreQuestion({ ...q, r: [[0, 0]] }, "0").state, "correct");
});
test("marks-to-all gives the marks even when left blank; an unreadable key is left out of the score", () => {
  assert.deepEqual(scoreQuestion({ n: 4, t: "MCQ", sec: "GA", m: 2, mta: true }, ""), { state: "correct", marks: 2 });
  assert.deepEqual(scoreQuestion({ n: 5, t: "NAT", sec: "CS", m: 1, u: true }, "7"), { state: "unscored", marks: 0 });
  assert.equal(keyText({ t: "NAT", r: [[3, 3]] }), "3"); assert.equal(keyText({ t: "MSQ", s: [["A", "C"]] }), "A, C"); assert.equal(keyText({ mta: true }), "Marks to all");
});
test("a whole paper: an all-correct sheet scores 100, a blank sheet scores what marks-to-all gives, an all-wrong MCQ sheet goes negative", () => {
  const qs = load("CS").sets.find(s => s.id === "2026:CS1").questions;
  const right = Object.fromEntries(qs.map(q => [q.n, q.t === "MCQ" ? q.k?.[0] : q.t === "MSQ" ? q.s?.[0] : q.r ? String(q.r[0][0]) : ""]));
  const full = scoreSet(qs, right);
  assert.equal(full.score, 100); assert.equal(full.max, 100); assert.equal(full.correct, 65); assert.equal(full.lost, 0);
  assert.equal(full.bySection["General Aptitude"].max, 15); assert.equal(full.bySection["Subject"].max, 85);
  const blank = scoreSet(qs, {});
  assert.equal(blank.score, qs.filter(q => q.mta).reduce((a, q) => a + q.m, 0)); assert.equal(blank.skipped + blank.correct, 65);
  const wrong = Object.fromEntries(qs.filter(q => q.t === "MCQ" && q.k).map(q => [q.n, ["A", "B", "C", "D"].find(x => !q.k.includes(x))]));
  const bad = scoreSet(qs, wrong);
  const expect = -qs.filter(q => q.t === "MCQ" && q.k).reduce((a, q) => a + q.m / 3, 0) + qs.filter(q => q.mta).reduce((a, q) => a + q.m, 0);
  assert.ok(Math.abs(bad.score - Math.round(expect * 100) / 100) < 0.011); assert.ok(bad.score < 0); assert.ok(Math.abs(bad.lost + bad.score - blank.score) < 0.02);
  assert.equal(answered(wrong), Object.keys(wrong).length); assert.equal(answered({ 1: "", 2: [], 3: "A" }), 1);
});

test("data: every parsed key is a real 65-question, 100-mark GATE paper with 10 aptitude questions worth 15", () => {
  const idx = load("index"); let sets = 0, scorable = 0;
  assert.equal(idx.papers.length, 30);
  for (const p of idx.papers) for (const s of load(p).sets) {
    sets++;
    assert.match(s.id, /^20\d\d:[A-Z0-9]{2,5}$/); assert.ok(s.qp.startsWith("https://gate2027.iitm.ac.in/static/doc/download/") && s.qp.endsWith(".pdf")); assert.ok(s.key.endsWith(".pdf"));
    if (!s.questions) continue;
    scorable++;
    const q = s.questions;
    assert.deepEqual(q.map(x => x.n), Array.from({ length: 65 }, (_, i) => i + 1), s.id);
    assert.equal(q.reduce((a, x) => a + x.m, 0), 100, s.id);
    const ga = q.filter(x => x.sec === "GA"); assert.equal(ga.length, 10, s.id + " GA count"); assert.equal(ga.reduce((a, x) => a + x.m, 0), 15, s.id + " GA marks");
    for (const x of q) {
      assert.ok(["MCQ", "MSQ", "NAT"].includes(x.t) && [1, 2].includes(x.m));
      assert.equal([x.k, x.s, x.r, x.mta, x.u].filter(Boolean).length, 1, s.id + " Q" + x.n + " must have exactly one kind of key");
      if (x.k) assert.ok(x.t === "MCQ" && x.k.every(l => "ABCD".includes(l)));
      if (x.s) assert.ok(x.t === "MSQ" && x.s.every(set => set.length >= 1 && set.every(l => "ABCD".includes(l))));
      if (x.r) assert.ok(x.t === "NAT" && x.r.every(([lo, hi]) => Number.isFinite(lo) && lo <= hi));
    }
  }
  assert.ok(sets >= 195 && scorable >= 140, `sets=${sets} scorable=${scorable}`);
});
