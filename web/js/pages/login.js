import { sb, $, esc, cat, busy } from "../core.js";
const main = $("#main");
let mode = "in";   // in | up | reset | newpass

const { data: { session } } = await sb.auth.getSession();
const recovering = /type=recovery/.test(location.hash) || new URLSearchParams(location.search).get("type") === "recovery";
if (session && !recovering) location.replace("today.html");
sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") { mode = "newpass"; render(); } });

const COPY = {
  in: ["Welcome back", "Sign in", "New here?", "Create an account", "up"],
  up: ["Create your account", "Create account", "Already have an account?", "Sign in", "in"],
  reset: ["Reset your password", "Send reset link", "Remembered it?", "Sign in", "in"],
  newpass: ["Choose a new password", "Save new password", "", "", "in"]
};
function render(note = "") {
  const [title, cta, q, alt, to] = COPY[mode];
  main.innerHTML = `<a class="wordmark" href="index.html" style="text-decoration:none;color:inherit;text-align:center">Billi</a>
  ${cat(mode === "up" ? "play" : "idle")}
  <h1 style="text-align:center">${title}</h1>
  ${note ? `<p class="card" role="status" style="border-color:var(--ok);background:var(--ok-soft)">${esc(note)}</p>` : ""}
  <form class="card pop stack" novalidate>
    ${mode === "up" ? `<div class="field"><label for="a-name">Your name</label><input id="a-name" type="text" maxlength="40" autocomplete="name"></div>` : ""}
    ${mode !== "newpass" ? `<div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" inputmode="email" required></div>` : ""}
    ${mode !== "reset" ? `<div class="field"><label for="a-pass">${mode === "newpass" ? "New password" : "Password"}</label><input id="a-pass" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" required minlength="8">${mode !== "in" ? '<span class="hint">At least 8 characters.</span>' : ""}</div>` : ""}
    <p class="err" id="a-err" role="alert"></p>
    <button class="btn primary wide" type="submit">${cta}</button>
    ${mode === "in" ? `<button type="button" class="linkbtn" data-to="reset" style="justify-self:center">Forgot your password?</button>` : ""}
    <div style="text-align:center;margin-top:6px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08)">
      <button type="button" class="btn wide sm" id="a-guest" style="background:#242933;color:#d8dee9;border:1px solid #3b4252">⚡ Instant Access (Offline / Guest Mode)</button>
    </div>
  </form>
  ${q ? `<p style="text-align:center">${q} <button class="linkbtn" data-to="${to}">${alt}</button></p>` : ""}`;
  (mode === "up" ? $("#a-name") : mode === "newpass" ? $("#a-pass") : $("#a-email")).focus();
}
const human = m => /Invalid login credentials/i.test(m) ? "That email and password do not match. Check both and try again."
  : /Email not confirmed/i.test(m) ? "Confirm your email first. Open the link we sent you, then sign in."
  : /already registered|already been registered/i.test(m) ? "An account with this email already exists. Sign in instead."
  : /rate limit|too many/i.test(m) ? "Too many tries. Wait a minute and try again."
  : /Failed to fetch|NetworkError|Load failed/i.test(m) ? "No connection. Check your internet and try again."
  : /Password should/i.test(m) ? "Use a longer password, at least 8 characters."
  : "That did not work. Try again.";

main.addEventListener("click", e => {
  const b = e.target.closest("[data-to]");
  if (b) { mode = b.dataset.to; render(); return; }
  if (e.target.id === "a-guest") {
    const guestUser = { id: "guest_local_" + Date.now(), email: "guest@billi.app", user_metadata: { name: "Billi Scholar" } };
    try { localStorage.setItem("billi_local_user", JSON.stringify(guestUser)); } catch {}
    location.replace("today.html");
  }
});
main.addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#a-err"), btn = $("[type=submit]", main), email = $("#a-email")?.value.trim(), password = $("#a-pass")?.value, here = location.origin + location.pathname;
  err.textContent = "";
  if (mode !== "newpass" && !/^\S+@\S+\.\S+$/.test(email || "")) { err.textContent = "Enter your email address, like name@example.com."; $("#a-email").focus(); return; }
  if (mode !== "reset" && mode !== "in" && (password || "").length < 8) { err.textContent = "Use at least 8 characters for the password."; $("#a-pass").focus(); return; }
  if (mode === "in" && !password) { err.textContent = "Enter your password."; $("#a-pass").focus(); return; }
  busy(btn, true);
  try {
    if (mode === "in") { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; location.replace("today.html"); return; }
    if (mode === "up") {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name: $("#a-name").value.trim().slice(0, 40) }, emailRedirectTo: here } });
      if (error) throw error;
      if (data.session) { location.replace("today.html"); return; }
      mode = "in"; render("Almost there. Open the confirmation link we sent to " + email + ", then sign in here."); return;
    }
    if (mode === "reset") { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here }); if (error) throw error; mode = "in"; render("If that email has an account, a reset link is on its way."); return; }
    if (mode === "newpass") { const { error } = await sb.auth.updateUser({ password }); if (error) throw error; location.replace("today.html"); return; }
  } catch (x) { err.textContent = human(String(x.message || "")); busy(btn, false); }
});
if (recovering) mode = "newpass";
render();
