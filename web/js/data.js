// Fetches one day's rows from Supabase and hands them to the pure builder in day.js.
import { sb, isoDate, dayNum } from "./core.js";
import { buildDay } from "./day.js";

export async function loadDay(user, profile, date = new Date()) {
  const iso = isoDate(date), dn = dayNum(date);
  const [slots, skips, tasks, focus] = await Promise.all([
    sb.from("billi_slots").select("id,class_id,user_id,subject,room,day,start_time,end_time,billi_classes(name,owner)").eq("day", dn).order("start_time"),
    sb.from("billi_slot_skips").select("slot_id").eq("on_date", iso),
    sb.from("billi_tasks").select("*").or(`due_date.eq.${iso},and(due_date.lt.${iso},done.eq.false)`).order("due_time", { nullsFirst: false }),
    sb.from("billi_focus").select("track,seconds").eq("day", iso)
  ]);
  for (const r of [slots, skips, tasks, focus]) if (r.error) throw r.error;
  return buildDay({ userId: user.id, profile, iso, slots: slots.data, skips: skips.data, tasks: tasks.data, focus: focus.data });
}

export async function myClasses(userId) {
  const { data, error } = await sb.from("billi_class_members").select("role,billi_classes(id,name,code,owner)").eq("user_id", userId).order("joined_at");
  if (error) throw error;
  return data.filter(r => r.billi_classes).map(r => ({ ...r.billi_classes, role: r.role }));
}
