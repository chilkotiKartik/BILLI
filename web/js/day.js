// Pure logic that turns raw rows into one day's schedule. No browser or network code here, so it is unit-tested directly.
const pad = n => String(n).padStart(2, "0");
const at = (iso, hhmm) => new Date(`${iso}T${String(hhmm).slice(0, 5)}:00`);
const MIN = 60000;

// Finds the first free stretch of at least 30 minutes between now and 23:00 and sizes a GATE block to fit it.
export function suggestGate(events, profile, gateDoneMin, iso, now) {
  const need = profile.gate_min - Math.floor(gateDoneMin);
  if (need <= 0) return null;
  const dayStart = at(iso, "06:00").getTime(), dayEnd = at(iso, "23:00").getTime();
  let cursor = Math.max(dayStart, Math.ceil(now.getTime() / (5 * MIN)) * 5 * MIN);
  if (cursor >= dayEnd) return null;
  const busy = events.filter(e => !e.skipped && !e.done).map(e => [e.start.getTime(), e.end.getTime()]).sort((a, b) => a[0] - b[0]);
  for (const [s, e] of busy) {
    if (e <= cursor) continue;
    if (s - cursor >= 30 * MIN) break;
    cursor = Math.max(cursor, e);
  }
  const nextBusy = busy.find(([s]) => s >= cursor);
  const gapEnd = Math.min(nextBusy ? nextBusy[0] : dayEnd, dayEnd);
  if (gapEnd - cursor < 30 * MIN) return null;
  const len = Math.min(need * MIN, gapEnd - cursor);
  const start = new Date(cursor), end = new Date(cursor + len);
  return {
    id: `gate:${iso}:${pad(start.getHours())}${pad(start.getMinutes())}`, kind: "gate", title: "GATE study",
    start, end, minutes: Math.round(len / MIN), startsNow: start.getTime() - now.getTime() <= MIN,
    ringAt: start.getTime() - now.getTime() > MIN ? start : null, strict: false
  };
}

export function buildDay({ userId, profile, iso, slots, skips, tasks, focus }, now = new Date()) {
  const skipSet = new Set(skips.map(s => s.slot_id));
  const events = [], loose = [];
  for (const s of slots) {
    const start = at(iso, s.start_time), end = at(iso, s.end_time), skipped = skipSet.has(s.id);
    const cls = s.billi_classes || null;
    events.push({
      id: `slot:${s.id}:${iso}`, kind: "class", slotId: s.id, title: s.subject, room: s.room || "",
      className: cls ? cls.name : "", personal: !s.class_id, canEdit: s.user_id === userId || (cls && cls.owner === userId) || false,
      start, end, skipped, done: false, strict: false,
      ringAt: skipped ? null : new Date(start.getTime() - profile.lead_min * MIN)
    });
  }
  for (const t of tasks) {
    const overdue = t.due_date < iso;
    if (t.due_time && !overdue) {
      const start = at(iso, t.due_time), end = new Date(start.getTime() + t.duration_min * MIN);
      events.push({
        id: `task:${t.id}:${String(t.due_time).slice(0, 5)}`, kind: "task", task: t, title: t.title, track: t.track,
        start, end, skipped: false, done: t.done, strict: t.strict, ringAt: t.alarm && !t.done ? start : null
      });
    } else {
      loose.push({ id: `task:${t.id}`, kind: "task", task: t, title: t.title, track: t.track, done: t.done, overdue });
    }
  }
  const sum = tr => focus.filter(f => !tr || f.track === tr).reduce((a, f) => a + f.seconds, 0) / 60;
  const gateDoneMin = sum("gate"), focusMin = sum(null);
  const gate = suggestGate(events, profile, gateDoneMin, iso, now);
  if (gate) events.push(gate);
  events.sort((a, b) => a.start - b.start || (a.kind === "gate") - (b.kind === "gate"));
  const next = events.find(e => e.kind !== "gate" && !e.skipped && !e.done && e.end > now) || null;
  const tasksLeft = tasks.filter(t => !t.done).length;
  return { iso, events, loose, gateDoneMin, focusMin, next, gate, tasksLeft, tasksTotal: tasks.length };
}
