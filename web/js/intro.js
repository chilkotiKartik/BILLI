// The opening: Billi walks in and stretches. Plays once a day, skips on tap or key, and never plays under "reduce motion".
import { cat, isoDate, reducedMotion } from "./core.js";
export function playIntro() {
  const today = isoDate();
  try { if (localStorage.getItem("billi-intro") === today) return Promise.resolve(); localStorage.setItem("billi-intro", today); } catch {}
  if (reducedMotion()) return Promise.resolve();
  return new Promise(res => {
    const el = document.createElement("div");
    el.className = "intro"; el.setAttribute("role", "button"); el.tabIndex = 0; el.setAttribute("aria-label", "Opening animation. Press to skip.");
    el.innerHTML = `${cat("idle", "")}<span class="word" aria-hidden="true">Billi</span>`;
    document.body.appendChild(el);
    let ended = false;
    const end = () => { if (ended) return; ended = true; el.classList.add("leaving"); setTimeout(() => { el.remove(); res(); }, 280); };
    const t = setTimeout(end, 1750);
    el.addEventListener("click", () => { clearTimeout(t); end(); });
    el.addEventListener("keydown", e => { if (["Enter", " ", "Escape"].includes(e.key)) { clearTimeout(t); end(); } });
  });
}
