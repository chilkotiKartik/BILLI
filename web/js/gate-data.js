// Loads a GATE paper's syllabus (static files built from the official PDFs) and the student's progress.
import { sb, isoDate } from "./core.js";
import { summarise } from "./gate.js";

const cache = new Map();
const file = name => { if (!cache.has(name)) cache.set(name, fetch(`data/gate/${name}.json`).then(r => { if (!r.ok) throw new Error("Could not load " + name); return r.json(); })); return cache.get(name); };
export const gateIndex = () => file("index");

export async function loadGate(profile) {
  if (!profile.gate_paper) return null;
  const [paper, ga, prog] = await Promise.all([file(profile.gate_paper), file("GA"), sb.from("billi_gate_progress").select("topic_id,stage,learned_on,next_review")]);
  if (prog.error) throw prog.error;
  const mine = prog.data.filter(r => r.topic_id.startsWith(profile.gate_paper + ":") || r.topic_id.startsWith("GA:"));
  return { paper, ga, rows: mine, summary: summarise(paper, ga, mine, profile.gate_parts_off, isoDate()) };
}
