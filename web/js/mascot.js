// Interactive Billi Mascot & Progression System
// Provides dynamic emotions, XP/leveling, witty quips, and interactive animations.

import { $, esc } from "./core.js";

const TITLES = [
  { level: 1, title: "Curious Kitten", minXp: 0, badge: "🐱" },
  { level: 2, title: "Formula Prowler", minXp: 100, badge: "🐾" },
  { level: 3, title: "Syllabus Stalker", minXp: 300, badge: "📚" },
  { level: 4, title: "Concept Hunter", minXp: 600, badge: "⚡" },
  { level: 5, title: "Algorithm Panther", minXp: 1000, badge: "🐆" },
  { level: 6, title: "GATE Tiger", minXp: 1600, badge: "🐅" },
  { level: 7, title: "AIR 1 Billi Don", minXp: 2500, badge: "👑" }
];

const QUIPS = {
  idle: [
    "Padhle bhai, GATE 2027 admit card aate time nahi lagta! 🐱",
    "Ek formula revise karle, main tab tak so leta hoon... zzz",
    "Did you know? Regular revision beats last-night panic every single time.",
    "Billi is watching your study streak. Don't break it!"
  ],
  focusing: [
    "Shhh! Deep work mode active. Instagram will wait, your rank won't. 🤫",
    "Focusing hard! Billi is guarding your brain from distractions.",
    "Keep going! Every minute here adds marks to your GATE scorecard. 🎯"
  ],
  completed: [
    "Wah sher! One more study session crushed! Purrrrr... 🐾✨",
    "XP added! Your Billi is getting stronger. Keep the streak alive! 🔥",
    "Shabash! Take a quick 5-min water break, you earned it!"
  ],
  sassy: [
    "Arre phone rakh de bhai! Social media will give you 0 marks in GATE! 😤",
    "Focus timer was stopped early? Billi is judging you silently... 😾"
  ]
};

export class BilliMascot {
  constructor() {
    this.xp = parseInt(localStorage.getItem("billi_xp") || "0", 10);
    this.streak = parseInt(localStorage.getItem("billi_streak") || "1", 10);
  }

  getRank() {
    let current = TITLES[0];
    for (const t of TITLES) {
      if (this.xp >= t.minXp) current = t;
      else break;
    }
    const nextIdx = TITLES.findIndex(t => t.level === current.level + 1);
    const next = nextIdx !== -1 ? TITLES[nextIdx] : null;
    const progress = next ? Math.min(100, Math.round(((this.xp - current.minXp) / (next.minXp - current.minXp)) * 100)) : 100;
    return { ...current, next, progress, xp: this.xp };
  }

  addXp(amount, reason = "") {
    this.xp += amount;
    localStorage.setItem("billi_xp", this.xp.toString());
    return this.getRank();
  }

  getRandomQuip(state = "idle") {
    const list = QUIPS[state] || QUIPS.idle;
    return list[Math.floor(Math.random() * list.length)];
  }

  renderSvg(state = "idle") {
    // Highly polished SVG Cat character with animated ear/eyes
    const eyePupil = state === "focusing" ? `cx="46" cy="45" r="4"` : state === "completed" ? `cx="48" cy="42" r="5"` : `cx="48" cy="46" r="5"`;
    const rightEyePupil = state === "focusing" ? `cx="74" cy="45" r="4"` : state === "completed" ? `cx="72" cy="42" r="5"` : `cx="72" cy="46" r="5"`;
    const moodColor = state === "focusing" ? "#f59e0b" : state === "completed" ? "#10b981" : "#6366f1";

    return `
      <svg viewBox="0 0 120 120" width="100%" height="100%" class="billi-avatar-svg state-${state}" aria-label="Billi the Cat Mascot">
        <defs>
          <radialGradient id="catGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#3b4252" />
            <stop offset="100%" stop-color="#242933" />
          </radialGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="${moodColor}" flood-opacity="0.35"/>
          </filter>
        </defs>
        <g filter="url(#glow)">
          <!-- Ears -->
          <polygon points="25,48 10,12 48,32" fill="#2e3440" stroke="${moodColor}" stroke-width="2"/>
          <polygon points="28,42 18,20 44,32" fill="#f43f5e" opacity="0.6"/>
          <polygon points="95,48 110,12 72,32" fill="#2e3440" stroke="${moodColor}" stroke-width="2"/>
          <polygon points="92,42 102,20 76,32" fill="#f43f5e" opacity="0.6"/>
          <!-- Head -->
          <circle cx="60" cy="58" r="42" fill="url(#catGrad)" stroke="${moodColor}" stroke-width="2.5"/>
          <!-- Eyes -->
          <ellipse cx="46" cy="48" rx="9" ry="11" fill="#eceff4"/>
          <ellipse cx="74" cy="48" rx="9" ry="11" fill="#eceff4"/>
          <circle ${eyePupil} fill="#1e222a"/>
          <circle ${rightEyePupil} fill="#1e222a"/>
          <circle cx="44" cy="44" r="2" fill="#ffffff"/>
          <circle cx="72" cy="44" r="2" fill="#ffffff"/>
          <!-- Nose & Whiskers -->
          <polygon points="56,60 64,60 60,65" fill="#f43f5e"/>
          <path d="M50,68 Q60,74 70,68" stroke="#eceff4" stroke-width="2" fill="none" stroke-linecap="round"/>
          <line x1="20" y1="56" x2="42" y2="60" stroke="#d8dee9" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="18" y1="66" x2="40" y2="66" stroke="#d8dee9" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="100" y1="56" x2="78" y2="60" stroke="#d8dee9" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="102" y1="66" x2="80" y2="66" stroke="#d8dee9" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Glasses or Badge if higher level -->
          ${this.xp >= 600 ? `<circle cx="46" cy="48" r="13" fill="none" stroke="#ebcb8b" stroke-width="2"/><circle cx="74" cy="48" r="13" fill="none" stroke="#ebcb8b" stroke-width="2"/><line x1="59" y1="48" x2="61" y2="48" stroke="#ebcb8b" stroke-width="2.5"/>` : ""}
        </g>
      </svg>
    `;
  }

  renderWidget(containerEl, state = "idle", customMessage = null) {
    if (!containerEl) return;
    const rank = this.getRank();
    const quip = customMessage || this.getRandomQuip(state);

    containerEl.innerHTML = `
      <div class="billi-mascot-card card" style="display:flex;align-items:center;gap:18px;padding:16px;background:var(--surface,#181c24);border:1px solid var(--border,#2c3240);border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,0.15)">
        <div style="width:72px;height:72px;flex-shrink:0;position:relative">
          ${this.renderSvg(state)}
          <span style="position:absolute;bottom:-4px;right:-4px;background:var(--accent,#f59e0b);color:#000;font-size:11px;font-weight:750;padding:2px 6px;border-radius:10px;box-shadow:0 2px 5px rgba(0,0,0,0.3)">Lvl ${rank.level}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-weight:700;font-size:14px;color:var(--text-bright,#fff);display:flex;align-items:center;gap:5px">${rank.badge} ${esc(rank.title)}</span>
            <span style="font-size:12px;color:var(--muted,#8b949e);font-weight:600">${rank.xp} XP</span>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;margin-bottom:8px">
            <div style="width:${rank.progress}%;height:100%;background:linear-gradient(90deg,#f59e0b,#10b981);border-radius:4px;transition:width 0.4s ease"></div>
          </div>
          <p style="margin:0;font-size:13px;line-height:1.4;color:var(--text,#d8dee9);font-style:italic">"${esc(quip)}"</p>
        </div>
      </div>
    `;
  }
}

export const mascot = new BilliMascot();
