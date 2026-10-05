// Security and data tests against the real Supabase project, signed in as two real test accounts.
// Run: BILLI_TEST_PASSWORD=... npm run test:api
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const URL = "https://nfjxamkjggvpsiuwffrj.supabase.co", KEY = "sb_publishable_IGFsaEd6koFXr3L8HwW8yQ_C2W99UtZ";
const PASS = process.env.BILLI_TEST_PASSWORD;
if (!PASS) { console.error("Set BILLI_TEST_PASSWORD"); process.exit(2); }
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = mk(), member = mk(), anon = mk();
let pass = 0, failN = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("ok   ", name); } catch (e) { failN++; console.log("FAIL ", name, "\n      ", e.message); } };
const ok = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const iso = new Date().toISOString().slice(0, 10);

const a = ok(await owner.auth.signInWithPassword({ email: "billi-test-owner@example.com", password: PASS })).user;
const b = ok(await member.auth.signInWithPassword({ email: "billi-test-member@example.com", password: PASS })).user;

// clean slate for these two accounts
for (const [c, u] of [[owner, a], [member, b]]) {
  await c.from("billi_classes").delete().eq("owner", u.id);
  await c.from("billi_class_members").delete().eq("user_id", u.id);
  await c.from("billi_slots").delete().eq("user_id", u.id);
  await c.from("billi_tasks").delete().eq("user_id", u.id);
  await c.from("billi_focus").delete().eq("user_id", u.id);
  await c.from("billi_gate_progress").delete().eq("user_id", u.id);
  await c.from("billi_mocks").delete().eq("user_id", u.id);
  await c.from("billi_profiles").upsert({ id: u.id, name: u === a ? "Owner Test" : "Member Test" });
}
let cls, slot, pslot, task;

await t("signed-out visitors can read nothing", async () => {
  for (const tb of ["billi_profiles", "billi_classes", "billi_class_members", "billi_slots", "billi_slot_skips", "billi_tasks", "billi_focus"]) {
    const r = await anon.from(tb).select("*").limit(1);
    assert.ok(r.error || r.data.length === 0, tb + " leaked to anon");
  }
  const r = await anon.rpc("billi_join_class", { p_code: "AAAAAA" }); assert.ok(r.error, "anon could call join");
});
await t("a profile is private to its owner and cannot be forged", async () => {
  assert.equal(ok(await member.from("billi_profiles").select("id")).length, 1);
  const r = await member.from("billi_profiles").update({ name: "hacked" }).eq("id", a.id).select(); assert.equal((r.data || []).length, 0);
  assert.ok((await member.from("billi_profiles").insert({ id: a.id, name: "x" })).error);
});
await t("create class returns a 6-character code and makes the creator owner", async () => {
  cls = ok(await owner.rpc("billi_create_class", { p_name: "  CSE 3rd year A  " }));
  assert.match(cls.code, /^[A-Z2-9]{6}$/); assert.equal(cls.name, "CSE 3rd year A"); assert.equal(cls.owner, a.id);
  const m = ok(await owner.from("billi_class_members").select("role").eq("class_id", cls.id)); assert.equal(m[0].role, "owner");
});
await t("class names are validated", async () => {
  assert.ok((await owner.rpc("billi_create_class", { p_name: "   " })).error);
  assert.ok((await owner.rpc("billi_create_class", { p_name: "x".repeat(61) })).error);
});
await t("a class cannot be inserted directly, and members cannot be added directly", async () => {
  assert.ok((await member.from("billi_classes").insert({ name: "x", code: "ABCDEF", owner: b.id })).error);
  assert.ok((await member.from("billi_class_members").insert({ class_id: cls.id, user_id: b.id, role: "owner" })).error);
});
await t("owner adds class slots; bad times are rejected", async () => {
  slot = ok(await owner.from("billi_slots").insert({ class_id: cls.id, subject: "DBMS", room: "LT-2", day: 1, start_time: "10:00", end_time: "11:00" }).select().single());
  assert.ok((await owner.from("billi_slots").insert({ class_id: cls.id, subject: "Bad", day: 1, start_time: "11:00", end_time: "10:00" })).error);
  assert.ok((await owner.from("billi_slots").insert({ class_id: cls.id, subject: "Bad", day: 9, start_time: "10:00", end_time: "11:00" })).error);
  assert.ok((await owner.from("billi_slots").insert({ class_id: cls.id, user_id: a.id, subject: "Both", day: 1, start_time: "10:00", end_time: "11:00" })).error);
});
await t("before joining, a stranger sees neither the class nor its slots nor its roster", async () => {
  assert.equal(ok(await member.from("billi_classes").select("id").eq("id", cls.id)).length, 0);
  assert.equal(ok(await member.from("billi_slots").select("id").eq("class_id", cls.id)).length, 0);
  assert.equal(ok(await member.rpc("billi_class_roster", { p_class: cls.id })).length, 0);
});
await t("a wrong code is refused; the right code (any letter case, with spaces) joins once", async () => {
  const bad = await member.rpc("billi_join_class", { p_code: "ZZZZZ9" }); assert.match(bad.error.message, /No class has that code/);
  assert.equal(ok(await member.rpc("billi_join_class", { p_code: " " + cls.code.toLowerCase() + " " })), cls.id);
  assert.equal(ok(await member.rpc("billi_join_class", { p_code: cls.code })), cls.id);
  assert.equal(ok(await owner.from("billi_class_members").select("user_id").eq("class_id", cls.id)).length, 2);
});
await t("after joining, the member sees the class, its slots and the roster with names", async () => {
  assert.equal(ok(await member.from("billi_classes").select("name").eq("id", cls.id))[0].name, "CSE 3rd year A");
  const s = ok(await member.from("billi_slots").select("subject,billi_classes(name,owner)").eq("class_id", cls.id));
  assert.equal(s[0].subject, "DBMS"); assert.equal(s[0].billi_classes.owner, a.id);
  const r = ok(await member.rpc("billi_class_roster", { p_class: cls.id }));
  assert.deepEqual(r.map(x => [x.name, x.role]), [["Owner Test", "owner"], ["Member Test", "member"]]);
});
await t("a member cannot add, change or delete class slots, rename or delete the class", async () => {
  assert.ok((await member.from("billi_slots").insert({ class_id: cls.id, subject: "Sneak", day: 2, start_time: "10:00", end_time: "11:00" })).error);
  assert.equal(((await member.from("billi_slots").update({ subject: "Hacked" }).eq("id", slot.id).select()).data || []).length, 0);
  assert.equal(((await member.from("billi_slots").delete().eq("id", slot.id).select()).data || []).length, 0);
  assert.equal(((await member.from("billi_classes").update({ name: "Hacked" }).eq("id", cls.id).select()).data || []).length, 0);
  assert.equal(((await member.from("billi_classes").delete().eq("id", cls.id).select()).data || []).length, 0);
  assert.equal(ok(await owner.from("billi_slots").select("subject").eq("id", slot.id))[0].subject, "DBMS");
});
await t("the owner can rename the class but cannot change its code or owner", async () => {
  assert.equal(ok(await owner.from("billi_classes").update({ name: "CSE A" }).eq("id", cls.id).select())[0].name, "CSE A");
  assert.ok((await owner.from("billi_classes").update({ code: "HACKED" }).eq("id", cls.id)).error);
  assert.ok((await owner.from("billi_classes").update({ owner: b.id }).eq("id", cls.id)).error);
});
await t("only the owner can cancel a class for a day; every member sees the cancellation", async () => {
  assert.ok((await member.from("billi_slot_skips").insert({ slot_id: slot.id, on_date: iso })).error);
  ok(await owner.from("billi_slot_skips").insert({ slot_id: slot.id, on_date: iso }));
  assert.equal(ok(await member.from("billi_slot_skips").select("slot_id").eq("on_date", iso)).length, 1);
  assert.equal(((await member.from("billi_slot_skips").delete().eq("slot_id", slot.id).select()).data || []).length, 0);
  assert.equal(ok(await owner.from("billi_slot_skips").delete().eq("slot_id", slot.id).select()).length, 1);
});
await t("personal slots are private and cannot be created for someone else", async () => {
  pslot = ok(await member.from("billi_slots").insert({ user_id: b.id, subject: "Gym", day: 3, start_time: "06:00", end_time: "07:00" }).select().single());
  assert.equal(ok(await owner.from("billi_slots").select("id").eq("id", pslot.id)).length, 0);
  assert.ok((await member.from("billi_slots").insert({ user_id: a.id, subject: "Forged", day: 3, start_time: "06:00", end_time: "07:00" })).error);
  assert.ok((await owner.from("billi_slot_skips").insert({ slot_id: pslot.id, on_date: iso })).error);
});
await t("tasks are private; validation holds", async () => {
  task = ok(await owner.from("billi_tasks").insert({ title: "Assignment 2", track: "college", due_date: iso, due_time: "20:00", alarm: true }).select().single());
  assert.equal(task.user_id, a.id);
  assert.equal(ok(await member.from("billi_tasks").select("id")).length, 0);
  assert.equal(((await member.from("billi_tasks").update({ title: "Hacked" }).eq("id", task.id).select()).data || []).length, 0);
  assert.ok((await member.from("billi_tasks").insert({ user_id: a.id, title: "Forged", due_date: iso })).error);
  assert.ok((await owner.from("billi_tasks").insert({ title: "x", track: "nope", due_date: iso })).error);
  assert.ok((await owner.from("billi_tasks").insert({ title: "   ", due_date: iso })).error);
  assert.ok((await owner.from("billi_tasks").insert({ title: "x", due_date: iso, duration_min: 2 })).error);
});
await t("focus sessions are private, bounded and cannot be edited afterwards", async () => {
  const f = ok(await owner.from("billi_focus").insert({ track: "gate", task_id: task.id, day: iso, started_at: new Date().toISOString(), seconds: 1500 }).select().single());
  assert.equal(ok(await member.from("billi_focus").select("id")).length, 0);
  assert.ok((await owner.from("billi_focus").insert({ track: "gate", day: iso, started_at: new Date().toISOString(), seconds: 99999 })).error);
  assert.ok((await owner.from("billi_focus").update({ seconds: 40000 }).eq("id", f.id)).error);
  assert.ok((await member.from("billi_focus").insert({ user_id: a.id, track: "gate", day: iso, started_at: new Date().toISOString(), seconds: 60 })).error);
});
await t("deleting a task keeps its focus minutes", async () => {
  ok(await owner.from("billi_tasks").delete().eq("id", task.id));
  const f = ok(await owner.from("billi_focus").select("task_id,seconds")); assert.equal(f.length, 1); assert.equal(f[0].task_id, null);
});
await t("an owner cannot simply leave; a member can leave and loses access", async () => {
  assert.equal(((await owner.from("billi_class_members").delete().eq("class_id", cls.id).eq("user_id", a.id).select()).data || []).length, 0);
  assert.equal(ok(await member.from("billi_class_members").delete().eq("class_id", cls.id).eq("user_id", b.id).select()).length, 1);
  assert.equal(ok(await member.from("billi_slots").select("id").eq("class_id", cls.id)).length, 0);
});
await t("deleting the class removes its slots and memberships", async () => {
  ok(await member.rpc("billi_join_class", { p_code: cls.code }));
  assert.equal(ok(await owner.from("billi_classes").delete().eq("id", cls.id).select()).length, 1);
  assert.equal(ok(await owner.from("billi_slots").select("id").eq("class_id", cls.id)).length, 0);
  assert.equal(ok(await member.from("billi_class_members").select("class_id")).length, 0);
});
await t("GATE progress is private, and only well-formed rows are accepted", async () => {
  const row = { topic_id: "CS:0123abcd", stage: 1, learned_on: iso, next_review: iso };
  ok(await owner.from("billi_gate_progress").upsert(row));
  assert.equal(ok(await member.from("billi_gate_progress").select("topic_id")).length, 0);
  assert.equal(((await member.from("billi_gate_progress").update({ stage: 3 }).eq("topic_id", row.topic_id).select()).data || []).length, 0);
  assert.ok((await member.from("billi_gate_progress").insert({ ...row, user_id: a.id })).error);
  assert.ok((await owner.from("billi_gate_progress").insert({ ...row, topic_id: "not-a-topic" })).error);
  assert.ok((await owner.from("billi_gate_progress").insert({ ...row, topic_id: "CS:00000002", stage: 9 })).error);
  assert.ok((await owner.from("billi_gate_progress").insert({ ...row, topic_id: "CS:00000003", stage: 5 })).error, "finished topics must have no next review");
  assert.ok((await owner.from("billi_gate_progress").insert({ ...row, topic_id: "CS:00000004", stage: 2, next_review: null })).error, "unfinished topics must have a next review");
  ok(await owner.from("billi_gate_progress").update({ stage: 5, next_review: null }).eq("topic_id", row.topic_id));
  assert.equal(ok(await anon.from("billi_gate_progress").select("topic_id").limit(1).then(r => r.error ? { data: [] } : r)).length, 0);
  ok(await owner.from("billi_gate_progress").delete().eq("topic_id", row.topic_id));
});
await t("profile settings: ringtone and switched-off parts are validated", async () => {
  ok(await owner.from("billi_profiles").update({ ringtone: "grumpy", gate_parts_off: ["XE3", "XE4"] }).eq("id", a.id));
  assert.ok((await owner.from("billi_profiles").update({ ringtone: "airhorn" }).eq("id", a.id)).error);
  assert.ok((await owner.from("billi_profiles").update({ gate_parts_off: { not: "a list" } }).eq("id", a.id)).error);
  ok(await owner.from("billi_profiles").update({ ringtone: "meow", gate_parts_off: [] }).eq("id", a.id));
});
await t("mock results are private, bounded, and cannot be edited afterwards", async () => {
  const row = { set_id: "2026:CS1", paper: "CS", started_at: new Date().toISOString(), seconds: 5400, answers: { 1: "B", 19: ["A", "C"], 32: "3" }, score: 61.33, max_marks: 100, correct: 40, wrong: 10, skipped: 15 };
  const m = ok(await owner.from("billi_mocks").insert(row).select().single());
  assert.equal(+m.score, 61.33); assert.equal(m.user_id, a.id);
  assert.equal(ok(await member.from("billi_mocks").select("id")).length, 0);
  assert.ok((await owner.from("billi_mocks").update({ score: 100 }).eq("id", m.id)).error, "scores must not be editable");
  assert.ok((await member.from("billi_mocks").insert({ ...row, user_id: a.id })).error);
  assert.ok((await owner.from("billi_mocks").insert({ ...row, score: 140 })).error);
  assert.ok((await owner.from("billi_mocks").insert({ ...row, set_id: "nonsense" })).error);
  assert.ok((await owner.from("billi_mocks").insert({ ...row, answers: "x".repeat(9000) })).error);
  assert.equal(((await member.from("billi_mocks").delete().eq("id", m.id).select()).data || []).length, 0);
  assert.equal(ok(await owner.from("billi_mocks").delete().eq("id", m.id).select()).length, 1);
});
await t("AI usage: students cannot read or change the counter; the counting function enforces the limit", async () => {
  assert.ok((await owner.from("billi_ai_usage").select("*")).error, "usage table must be closed");
  assert.ok((await owner.from("billi_ai_usage").insert({ user_id: a.id, day: iso, n: 0 })).error);
  assert.ok((await anon.rpc("billi_ai_bump", { p_limit: 40 })).error, "anon must not count");
  assert.equal(ok(await owner.rpc("billi_ai_bump", { p_limit: 2 })), true);
  assert.equal(ok(await owner.rpc("billi_ai_bump", { p_limit: 2 })), true);
  assert.equal(ok(await owner.rpc("billi_ai_bump", { p_limit: 2 })), false);
  assert.equal(ok(await member.rpc("billi_ai_bump", { p_limit: 2 })), true, "limits are per student");
});
await t("Ask Billi function: refuses signed-out callers and bad requests; without a Gemini key it says so and spends nothing", async () => {
  const fn = URL + "/functions/v1/billi-ask", body = JSON.stringify({ messages: [{ role: "user", content: "What is an eigenvalue?" }], context: "CS" });
  const call = async (token, b = body) => { const r = await fetch(fn, { method: "POST", headers: { "content-type": "application/json", apikey: KEY, authorization: "Bearer " + token }, body: b }); return [r.status, await r.json().catch(() => ({}))]; };
  const [s0] = await call(KEY); assert.ok(s0 === 401 || s0 === 403, "anon got " + s0);
  const tok = (await member.auth.getSession()).data.session.access_token;
  const [s1, j1] = await call(tok, JSON.stringify({ messages: [] })); assert.equal(s1, 400); assert.equal(j1.code, "bad_request");
  const [s2, j2] = await call(tok, JSON.stringify({ messages: [{ role: "assistant", content: "hi" }] })); assert.equal(s2, 400, JSON.stringify(j2));
  const [s3, j3] = await call(tok);
  if (s3 === 503) { assert.equal(j3.code, "not_configured"); assert.equal(ok(await member.rpc("billi_ai_bump", { p_limit: 2 })), true, "an unconfigured call must not use up the limit"); console.log("       (no GEMINI_API_KEY secret is set, so a real answer could not be tested)"); }
  else { assert.equal(s3, 200, JSON.stringify(j3)); assert.ok(j3.text && j3.text.length > 20); console.log("       (real Gemini answer received: " + j3.text.slice(0, 60).replace(/\n/g, " ") + "...)"); }
});
await t("limits: at most 5 owned classes", async () => {
  for (let i = 0; i < 5; i++) ok(await owner.rpc("billi_create_class", { p_name: "L" + i }));
  const r = await owner.rpc("billi_create_class", { p_name: "L6" }); assert.match(r.error.message, /up to 5 classes/);
  await owner.from("billi_classes").delete().eq("owner", a.id);
});

await member.from("billi_slots").delete().eq("user_id", b.id);
await owner.from("billi_focus").delete().eq("user_id", a.id);
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
