import { sb, $, cat, I } from "../core.js";
const { data: { session } } = await sb.auth.getSession();
$("#main").innerHTML = `<div class="wordmark">Billi</div>
<div class="heroart"><svg class="books" viewBox="0 0 300 300" aria-hidden="true"><g stroke="#251B3A" stroke-width="4" stroke-linejoin="round">
  <ellipse cx="150" cy="286" rx="132" ry="9" fill="#251B3A" opacity=".13" stroke="none"/>
  <rect x="34" y="246" width="232" height="36" rx="9" fill="#0B7F7F"/><path d="M52 246v36" fill="none"/><rect x="62" y="256" width="150" height="16" rx="5" fill="#D5F2EE"/>
  <rect x="52" y="214" width="204" height="34" rx="9" fill="#5B3FE0"/><path d="M236 214v34" fill="none"/><rect x="70" y="224" width="120" height="14" rx="5" fill="#E8E2FF"/>
  <rect x="42" y="184" width="216" height="32" rx="9" fill="#FFC83D"/><path d="M62 184v32" fill="none"/>
  <g transform="translate(8 150)"><path d="M6 6 18-4M54 6 42-4" stroke-width="5" stroke-linecap="round"/><circle cx="8" cy="2" r="9" fill="#E8456B"/><circle cx="52" cy="2" r="9" fill="#E8456B"/><circle cx="30" cy="30" r="27" fill="#fff"/><path d="M30 14v17l10 7" fill="none" stroke-linecap="round"/><path d="M12 54l-5 8M48 54l5 8" stroke-linecap="round"/></g>
</g></svg>${cat("play", "Billi the ginger cat sitting on a stack of books beside an alarm clock, playing with a ball of yarn")}</div>
<h1>Never miss a class. Never skip GATE.</h1>
<p class="lead">Billi rings for every class in your timetable and keeps two to three hours of GATE study in your day.</p>
<a class="btn primary" href="${session ? "today.html" : "login.html"}" style="min-width:220px">${session ? "Open Billi" : "Start free"}</a>
<ul class="points">
  <li><span class="dot">${I.table}</span><span>Enter the timetable once. It repeats every week.</span></li>
  <li><span class="dot">${I.klass}</span><span>Share one code and your whole class gets the same timetable.</span></li>
  <li><span class="dot">${I.timer}</span><span>Billi finds your free time and starts the GATE timer with you.</span></li>
</ul>`;
