// Unit tests for the pure day-building logic (web/js/day.js). Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { buildDay, suggestGate } from "../web/js/day.js";

const iso = "2026-10-05";                                   // a Monday
const at = hhmm => new Date(`${iso}T${hhmm}:00`);
const profile = { gate_min: 120, gate_max: 180, lead_min: 5 };
const slot = (id, st, en, extra = {}) => ({ id, class_id: "c1", user_id: null, subject: "S" + id, room: "", day: 1, start_time: st + ":00", end_time: en + ":00", billi_classes: { name: "CSE A", owner: "owner" }, ...extra });
const task = (id, extra = {}) => ({ id, title: "T" + id, track: "college", due_date: iso, due_time: null, duration_min: 30, alarm: false, strict: false, done: false, ...extra });
const base = { userId: "me", profile, iso, slots: [], skips: [], tasks: [], focus: [] };
const hm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

test("class rings lead_min before the start, in time order", () => {
  const d = buildDay({ ...base, slots: [slot("b", "11:00", "12:00"), slot("a", "09:00", "10:00")] }, at("07:00"));
  const classes = d.events.filter(e => e.kind === "class");
  assert.deepEqual(classes.map(e => e.title), ["Sa", "Sb"]);
  assert.equal(hm(classes[0].ringAt), "08:55");
});

test("a cancelled class does not ring and is not 'next'", () => {
  const d = buildDay({ ...base, slots: [slot("a", "09:00", "10:00"), slot("b", "11:00", "12:00")], skips: [{ slot_id: "a" }] }, at("08:00"));
  const a = d.events.find(e => e.slotId === "a");
  assert.equal(a.skipped, true); assert.equal(a.ringAt, null);
  assert.equal(d.events.filter(e => e.kind !== "gate" && !e.skipped)[0].slotId, "b");
});

test("only the owner or the personal-slot owner can edit", () => {
  const d = buildDay({ ...base, userId: "owner", slots: [slot("a", "09:00", "10:00"), slot("p", "10:00", "11:00", { class_id: null, user_id: "owner", billi_classes: null })] }, at("07:00"));
  assert.ok(d.events.filter(e => e.kind === "class").every(e => e.canEdit));
  const m = buildDay({ ...base, userId: "member", slots: [slot("a", "09:00", "10:00")] }, at("07:00"));
  assert.equal(m.events.find(e => e.kind === "class").canEdit, false);
});

test("task alarms: timed + alarm on rings at its time; done or untimed never rings", () => {
  const d = buildDay({ ...base, tasks: [task("1", { due_time: "18:00:00", alarm: true, strict: true }), task("2", { due_time: "19:00:00", alarm: true, done: true }), task("3")] }, at("07:00"));
  const t1 = d.events.find(e => e.id.startsWith("task:1")), t2 = d.events.find(e => e.id.startsWith("task:2"));
  assert.equal(hm(t1.ringAt), "18:00"); assert.equal(t1.strict, true);
  assert.equal(t2.ringAt, null);
  assert.equal(d.loose.length, 1);
  assert.equal(d.tasksLeft, 2);
});

test("overdue undone tasks go to the loose list marked overdue, never into today's timeline", () => {
  const d = buildDay({ ...base, tasks: [task("old", { due_date: "2026-10-03", due_time: "10:00:00", alarm: true })] }, at("07:00"));
  assert.equal(d.events.filter(e => e.kind === "task").length, 0);
  assert.equal(d.loose[0].overdue, true);
});

test("GATE block goes into the first free gap of 30+ minutes and is capped at what is still needed", () => {
  const ev = buildDay({ ...base, slots: [slot("a", "09:00", "12:00"), slot("b", "12:10", "13:00"), slot("c", "16:00", "17:00")] }, at("09:30"));
  const g = ev.events.find(e => e.kind === "gate");
  assert.equal(hm(g.start), "13:00"); assert.equal(hm(g.end), "15:00"); assert.equal(g.minutes, 120);
  assert.equal(hm(g.ringAt), "13:00");
});

test("GATE block shrinks to fit the gap and to the minutes still owed", () => {
  const d = buildDay({ ...base, slots: [slot("a", "10:00", "11:00"), slot("b", "12:00", "13:00")], focus: [{ track: "gate", seconds: 90 * 60 }, { track: "college", seconds: 600 }] }, at("10:30"));
  const g = d.events.find(e => e.kind === "gate");
  assert.equal(hm(g.start), "11:00"); assert.equal(g.minutes, 30);           // owes 30 of 120
  assert.equal(Math.round(d.gateDoneMin), 90); assert.equal(Math.round(d.focusMin), 100);
});

test("no GATE block once the daily goal is met, or after 23:00, or when no gap fits", () => {
  assert.equal(buildDay({ ...base, focus: [{ track: "gate", seconds: 7200 }] }, at("10:00")).events.length, 0);
  assert.equal(suggestGate([], profile, 0, iso, at("23:10")), null);
  const packed = [{ start: at("06:00"), end: at("22:45"), skipped: false, done: false }];
  assert.equal(suggestGate(packed, profile, 0, iso, at("06:00")), null);
});

test("when free right now, the block starts now (rounded up to 5 min) and does not ring", () => {
  const g = suggestGate([], profile, 0, iso, at("14:02"));
  assert.equal(hm(g.start), "14:05"); assert.equal(g.ringAt !== null, true);   // 3 minutes away: still rings
  const g2 = suggestGate([], profile, 0, iso, at("14:05"));
  assert.equal(g2.startsNow, true); assert.equal(g2.ringAt, null);
});

test("'next' skips finished, cancelled and done items", () => {
  const d = buildDay({ ...base, slots: [slot("a", "08:00", "09:00"), slot("b", "10:00", "11:00")], skips: [{ slot_id: "b" }], tasks: [task("1", { due_time: "12:00:00" })], focus: [{ track: "gate", seconds: 7200 }] }, at("09:30"));
  assert.equal(d.next.id.startsWith("task:1"), true);
});

test("'next' is always a class or task, never the suggested GATE block, which is reported separately", () => {
  const d = buildDay({ ...base, slots: [slot("a", "15:00", "16:00")] }, at("09:00"));
  assert.equal(d.events[0].kind, "gate");
  assert.equal(d.next.slotId, "a");
  assert.equal(d.gate.startsNow, true);
});
