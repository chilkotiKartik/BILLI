"""End-to-end test in a real browser (Chromium) against the real Supabase project.
Two signed-in students (a class owner and a member) use the app the way real people would.
Run:  BILLI_TEST_PASSWORD=... python3 tests/e2e.py      (serves web/ on port 4173 by itself)
"""
import json, os, subprocess, sys, time, datetime
from playwright.sync_api import sync_playwright, expect

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "http://localhost:4173/"
PASS = os.environ.get("BILLI_TEST_PASSWORD") or sys.exit("Set BILLI_TEST_PASSWORD")
SHOTS = os.path.join(ROOT, "tests", "shots"); os.makedirs(SHOTS, exist_ok=True)
GD = lambda c: json.load(open(os.path.join(ROOT, "web", "data", "gate", c + ".json")))
CS1 = next(x for x in json.load(open(os.path.join(ROOT, "web", "data", "papers", "CS.json")))["sets"] if x["id"] == "2026:CS1")["questions"]
CS_TOTAL = GD("CS")["topics"] + GD("GA")["topics"]                 # the page counts the paper plus General Aptitude
AXE = open(os.path.join(ROOT, "node_modules", "axe-core", "axe.min.js")).read()
results, console_errors, axe_findings, bad_responses = [], [], {}, []
# The only failed requests a correct run may produce: the deliberate wrong password and the deliberate wrong invite code.
EXPECTED_FAILS = {("POST", "/auth/v1/token", 400): 1, ("POST", "/rest/v1/rpc/billi_join_class", 400): 1, ("POST", "/functions/v1/billi-ask", 503): 1}   # 503 = no Gemini key set yet
CLEAN = """async () => {
  const C = window.BILLI_CONFIG, sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  const { data: { user } } = await sb.auth.getUser();
  await sb.from('billi_classes').delete().eq('owner', user.id);
  await sb.from('billi_class_members').delete().eq('user_id', user.id);
  for (const t of ['billi_slots', 'billi_tasks', 'billi_focus', 'billi_gate_progress', 'billi_mocks']) await sb.from(t).delete().eq('user_id', user.id);
  await sb.from('billi_profiles').update({ name: 'Test student', gate_paper: null, gate_parts_off: [], ringtone: 'meow', gate_min: 120, gate_max: 180, lead_min: 5, sound: true }).eq('id', user.id);
  ['billi-timer', 'billi-fired', 'billi-snooze', 'billi-mock', 'billi-water'].forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('billi-ask');
}"""

def check(name, fn):
    try:
        fn(); results.append((True, name)); print("ok   ", name)
    except Exception as e:
        results.append((False, name)); print("FAIL ", name, "\n      ", str(e).split("\n")[0][:300])

def watch(page, who):
    page.on("console", lambda m: console_errors.append(f"{who}: {m.text}") if m.type == "error" and not m.text.startswith("Failed to load resource") else None)
    page.on("response", lambda r: bad_responses.append((r.request.method, r.url.split("?")[0].split(".co")[-1], r.status)) if r.status >= 400 else None)
    page.on("pageerror", lambda e: console_errors.append(f"{who}: PAGEERROR {e}"))

def sign_in(page, email):
    page.goto(BASE + "login.html")
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill(PASS)
    page.get_by_role("button", name="Sign in", exact=True).click()
    page.wait_for_url("**/today.html")
    page.get_by_role("heading", name="Today", exact=True).wait_for()

def axe(page, name):
    page.evaluate(AXE)
    r = page.evaluate("axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}).then(r => r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].html.slice(0,140), why: v.nodes[0].failureSummary.slice(0,200)})))")
    axe_findings[name] = r

def shot(page, name, full=True):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=full)

server = subprocess.Popen([sys.executable, "-m", "http.server", "4173", "--directory", os.path.join(ROOT, "web")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        ctxA = browser.new_context(**phone); ctxB = browser.new_context(**phone)
        for c in (ctxA, ctxB): c.set_default_timeout(12000)
        A = ctxA.new_page(); B = ctxB.new_page(); watch(A, "owner"); watch(B, "member")
        now = datetime.datetime.now()
        hhmm = lambda d: d.strftime("%H:%M")
        state = {}
        globals()["state"] = state

        # start from a clean slate so the test can be run again and again
        sign_in(A, "billi-test-owner@example.com"); A.evaluate(CLEAN); A.evaluate("localStorage.clear()"); ctxA.clear_cookies()

        # ---------- signed out ----------
        def signed_out_redirect():
            A.goto(BASE + "today.html"); A.wait_for_url("**/login.html")
        check("opening the app signed out sends you to sign in", signed_out_redirect)

        def landing():
            A.goto(BASE + "index.html")
            expect(A.get_by_role("heading", level=1)).to_contain_text("Never miss a class")
            expect(A.get_by_role("link", name="Start free")).to_be_visible()
            shot(A, "01-landing"); axe(A, "landing")
        check("landing page shows the pitch and a start button", landing)

        def wrong_password():
            A.goto(BASE + "login.html")
            A.get_by_label("Email").fill("billi-test-owner@example.com"); A.get_by_label("Password").fill("definitely-wrong")
            A.get_by_role("button", name="Sign in", exact=True).click()
            expect(A.get_by_role("alert")).to_contain_text("do not match")
            shot(A, "02-login-error"); axe(A, "login")
        check("a wrong password gives a clear message, not a crash", wrong_password)

        def bad_email():
            A.get_by_label("Email").fill("not-an-email"); A.get_by_role("button", name="Sign in", exact=True).click()
            expect(A.get_by_role("alert")).to_contain_text("email address")
        check("a malformed email is caught before anything is sent", bad_email)

        # ---------- owner signs in ----------
        def owner_in():
            sign_in(A, "billi-test-owner@example.com")
            intro = A.locator(".intro")
            if intro.count(): intro.click()
            expect(A.locator(".intro")).to_have_count(0)
            expect(A.get_by_text("Your day is empty")).to_be_visible()
            shot(A, "03-today-empty"); axe(A, "today-empty")
        check("owner signs in; opening animation is skippable; empty day invites action", owner_in)

        def create_class():
            A.goto(BASE + "class.html"); A.get_by_role("button", name="Create a class").click()
            A.get_by_role("button", name="Create class").click()
            expect(A.get_by_role("alert")).to_contain_text("Give the class a name")
            A.get_by_label("Class name").fill("E2E CSE 3rd year A"); A.get_by_role("button", name="Create class").click()
            expect(A.get_by_role("heading", name="E2E CSE 3rd year A")).to_be_visible()
            state["code"] = A.locator(".code").inner_text().strip()
            assert len(state["code"]) == 6, state["code"]
            shot(A, "04-class"); axe(A, "class")
        check("owner creates a class and gets a 6-character invite code", create_class)

        def add_slots():
            A.get_by_role("link", name="Edit timetable").click(); A.wait_for_url("**/timetable.html?class=*")
            expect(A.get_by_role("button", name="E2E CSE 3rd year A")).to_have_attribute("aria-pressed", "true")
            A.get_by_role("button", name="Add class").click()
            dlg = A.get_by_role("dialog")
            dlg.get_by_role("button", name="Add class").click()
            expect(dlg.get_by_role("alert")).to_contain_text("subject")
            dlg.get_by_label("Subject").fill("DBMS"); dlg.get_by_label("Room").fill("LT-2")
            start = now + datetime.timedelta(hours=2); end = start + datetime.timedelta(hours=1)
            state["class_start"] = hhmm(start)
            dlg.get_by_label("Starts").fill(hhmm(end)); dlg.get_by_label("Ends").fill(hhmm(start))
            dlg.get_by_role("button", name="Add class").click()
            expect(dlg.get_by_role("alert")).to_contain_text("after the start")
            dlg.get_by_label("Starts").fill(hhmm(start)); dlg.get_by_label("Ends").fill(hhmm(end))
            shot(A, "05-timetable-dialog", full=False); axe(A, "timetable-dialog")
            dlg.get_by_role("button", name="Add class").click()
            expect(A.get_by_role("listitem").filter(has_text="DBMS")).to_be_visible()
            shot(A, "06-timetable"); axe(A, "timetable")
        check("owner adds a class slot; missing subject and backwards times are refused", add_slots)

        def today_shows_class():
            A.goto(BASE + "today.html")
            row = A.get_by_role("listitem").filter(has_text="DBMS")
            expect(row).to_contain_text(state["class_start"]); expect(row).to_contain_text("LT-2")
            expect(A.get_by_label("Next up")).to_contain_text("DBMS")
        check("the class appears on the owner's Today with its time and room", today_shows_class)

        # ---------- member joins ----------
        def member_join():
            sign_in(B, "billi-test-member@example.com")
            if B.locator(".intro").count(): B.locator(".intro").click()
            B.evaluate(CLEAN)
            B.goto(BASE + "class.html"); B.get_by_role("button", name="Join with a code").click()
            B.get_by_label("Invite code").fill("ZZZZZ9"); B.get_by_role("button", name="Join class").click()
            expect(B.get_by_role("alert")).to_contain_text("No class has that code")
            B.get_by_label("Invite code").fill(state["code"].lower()); B.get_by_role("button", name="Join class").click()
            expect(B.get_by_role("heading", name="E2E CSE 3rd year A")).to_be_visible()
            expect(B.get_by_text("Member", exact=True)).to_be_visible()
        check("member: wrong code is refused, right code (typed in lower case) joins", member_join)

        def member_sees():
            B.goto(BASE + "today.html")
            row = B.get_by_role("listitem").filter(has_text="DBMS")
            expect(row).to_be_visible()
            expect(row.get_by_role("button", name="Cancel")).to_have_count(0)
            B.goto(BASE + "timetable.html"); B.get_by_role("button", name="E2E CSE 3rd year A").click()
            expect(B.get_by_role("listitem").filter(has_text="DBMS")).to_be_visible()
            expect(B.get_by_role("button", name="Add class")).to_have_count(0)
            expect(B.get_by_text("Only the class owner can change it")).to_be_visible()
        check("member gets the class timetable but no edit or cancel controls", member_sees)

        def roster():
            A.goto(BASE + "class.html"); A.get_by_role("button", name="Members").click()
            dlg = A.get_by_role("dialog"); expect(dlg).to_contain_text("2 members"); expect(dlg).to_contain_text("(you)")
            A.keyboard.press("Escape"); expect(A.get_by_role("dialog")).to_have_count(0)
        check("owner sees both people in the member list; Escape closes it", roster)

        def cancel_class():
            A.goto(BASE + "today.html")
            A.get_by_role("listitem").filter(has_text="DBMS").get_by_role("button", name="Cancel").click()
            expect(A.get_by_role("listitem").filter(has_text="DBMS")).to_contain_text("Cancelled today")
            B.goto(BASE + "today.html")
            expect(B.get_by_role("listitem").filter(has_text="DBMS")).to_contain_text("Cancelled today")
            A.get_by_role("listitem").filter(has_text="DBMS").get_by_role("button", name="Undo").click()
            expect(A.get_by_role("listitem").filter(has_text="DBMS")).not_to_contain_text("Cancelled today")
        check("owner cancels today's class; the member sees it cancelled; undo restores it", cancel_class)

        # ---------- tasks and the alarm ----------
        def task_validation_and_alarm():
            A.goto(BASE + "tasks.html"); A.get_by_role("button", name="Add task").click()
            dlg = A.get_by_role("dialog")
            dlg.get_by_role("button", name="Add task").click(); expect(dlg.get_by_role("alert")).to_contain_text("what the task is")
            dlg.get_by_label("What do you need to do?").fill("Revise normalisation")
            dlg.locator("label").filter(has_text="GATE").click()
            dlg.get_by_label("Ring an alarm at that time").check()
            dlg.get_by_role("button", name="Add task").click(); expect(dlg.get_by_role("alert")).to_contain_text("Set a time")
            dlg.locator("#t-time").fill(datetime.datetime.now().strftime("%H:%M"))
            dlg.get_by_label("Make me solve a sum to stop it").check()
            shot(A, "07-task-dialog", full=False); axe(A, "task-dialog")
            dlg.get_by_role("button", name="Add task").click()
            expect(A.get_by_role("listitem").filter(has_text="Revise normalisation")).to_be_visible()
            ring = A.get_by_role("alertdialog"); ring.wait_for(timeout=15000)
            expect(ring).to_contain_text("Revise normalisation")
            shot(A, "08-ring", full=False); axe(A, "ring")
            expect(ring.get_by_role("button", name="Stop", exact=True)).to_have_count(1)           # only the sum's Stop is shown
            label = ring.locator("label[for=ring-a]").inner_text()
            a, b = [int(x) for x in label.split(":")[1].split("+")]
            ring.get_by_role("textbox").fill(str(a + b + 1)); ring.get_by_role("button", name="Stop", exact=True).click()
            expect(ring.get_by_role("alert")).to_contain_text("Not right")
            A.keyboard.press("Escape"); expect(A.get_by_role("alertdialog")).to_be_visible()        # Escape cannot dodge the sum
            ring.get_by_role("textbox").fill(str(a + b)); ring.get_by_role("button", name="Stop", exact=True).click()
            expect(A.get_by_role("alertdialog")).to_have_count(0)
        check("task form validates; the alarm rings on time; solve-to-stop refuses a wrong answer and Escape", task_validation_and_alarm)

        def no_double_ring():
            A.reload(); A.get_by_role("heading", name="Tasks", exact=True).wait_for(); A.wait_for_timeout(2500)
            expect(A.get_by_role("alertdialog")).to_have_count(0)
        check("an alarm that already rang does not ring again after a reload", no_double_ring)

        def tick_task():
            A.goto(BASE + "today.html")
            box = A.get_by_role("checkbox", name="Done: Revise normalisation"); box.click()
            expect(A.locator("#toasts")).to_contain_text("done")                                    # saved, not just ticked on screen
            expect(A.get_by_role("checkbox", name="Done: Revise normalisation")).to_have_attribute("aria-checked", "true")
            A.goto(BASE + "tasks.html"); expect(A.get_by_role("heading", name="Done this week")).to_be_visible()
            shot(A, "09-tasks"); axe(A, "tasks")
        check("ticking a task on Today marks it done everywhere", tick_task)

        # ---------- timer ----------
        def timer_short():
            A.goto(BASE + "timer.html?track=gate"); A.get_by_role("button", name="Start").click()
            expect(A.locator("#lab")).to_contain_text("GATE focus"); A.wait_for_timeout(1300)
            expect(A.locator("#clock")).not_to_have_text("25:00")
            shot(A, "10-timer"); axe(A, "timer")
            A.get_by_role("button", name="Pause").click(); t1 = A.locator("#clock").inner_text(); A.wait_for_timeout(1200)
            assert A.locator("#clock").inner_text() == t1, "clock kept moving while paused"
            A.get_by_role("button", name="Resume").click(); A.get_by_role("button", name="Finish").click()
            expect(A.locator("#toasts")).to_contain_text("Under a minute")
        check("timer starts, pauses, resumes; under a minute is not saved", timer_short)

        def timer_complete():
            ms = int(time.time() * 1000)
            st = dict(preset="25", track="gate", taskId=None, taskTitle="", phase="focus", began=ms - 26 * 60000, startedAt=ms - 26 * 60000, acc=0, running=True, target=25 * 60000)
            A.evaluate("s => localStorage.setItem('billi-timer', s)", json.dumps(st)); A.reload()
            expect(A.locator("#toasts")).to_contain_text("Saved 25m of GATE study")
            expect(A.locator("#lab")).to_have_text("Break")
            expect(A.locator("#tot")).to_contain_text("25m of GATE study")
            A.get_by_role("button", name="Skip break").click(); expect(A.get_by_role("button", name="Start")).to_be_visible()
            A.goto(BASE + "today.html"); expect(A.get_by_label("GATE study minutes today")).to_have_attribute("aria-valuenow", "25")
            expect(A.get_by_text("25m of 2h")).to_be_visible()
            shot(A, "11-today-full"); axe(A, "today-full")
        check("a 25-minute session that finished while the tab was away is saved once and shows on Today", timer_complete)

        def water_and_study():
            ms = int(time.time() * 1000) - 46 * 60000
            st = dict(preset="watch", track="personal", taskId=None, taskTitle="", phase="focus", began=ms, startedAt=ms, acc=0, running=True, target=None, water=0, away=0)
            A.goto(BASE + "timer.html"); A.evaluate("s => localStorage.setItem('billi-timer', s)", json.dumps(st)); A.reload()
            dlg = A.get_by_role("dialog", name="Water break"); expect(dlg).to_be_visible(); expect(dlg.get_by_role("img", name="Billi is dancing")).to_be_visible()
            shot(A, "23-water", full=False); axe(A, "water")
            dlg.get_by_role("button", name="Done, I drank").click(); A.reload(); A.wait_for_timeout(1200); expect(A.get_by_role("dialog")).to_have_count(0)   # once per 45 minutes
            A.get_by_role("button", name="Study mode").click()
            assert A.evaluate("document.body.classList.contains('study')"); expect(A.get_by_role("navigation", name="Main")).to_be_hidden()
            expect(A.locator("#snote")).to_be_visible(); shot(A, "24-study-mode", full=False)
            A.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))"); A.wait_for_timeout(5300)
            A.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
            away = A.get_by_role("dialog"); expect(away).to_contain_text("You left for"); expect(away).to_contain_text("1 time this session"); away.get_by_role("button", name="Back to work").click()
            expect(A.locator("#snote")).to_contain_text("1 so far")
            A.get_by_role("button", name="Leave study mode").click(); assert not A.evaluate("document.body.classList.contains('study')")
            A.get_by_role("switch", name="Water reminder").or_(A.get_by_label("Water reminder every 45 minutes")).first.uncheck()
            assert A.evaluate("localStorage.getItem('billi-water')") == "0"; A.get_by_label("Water reminder every 45 minutes").check()
            A.get_by_role("button", name="Finish").click(); expect(A.locator("#toasts")).to_contain_text("Saved 46m of Personal study")
        check("timer: the dancing cat calls a water break at 45 minutes, once; study mode hides everything else and counts when you leave", water_and_study)

        def no_double_save():
            A.goto(BASE + "timer.html"); expect(A.locator("#tot")).to_contain_text("25m of GATE study"); A.reload()
            expect(A.locator("#tot")).to_contain_text("25m of GATE study")
        check("reloading the timer does not save the session twice", no_double_save)

        # ---------- settings ----------
        def settings():
            A.goto(BASE + "settings.html")
            A.get_by_label("Your name").fill("Asha Owner"); A.get_by_label("Your GATE paper").select_option("CS")
            A.get_by_label("Daily goal").select_option("180"); A.get_by_label("Daily limit").select_option("120")
            A.get_by_role("button", name="Save settings").click(); expect(A.get_by_role("alert")).to_contain_text("cannot be smaller")
            A.get_by_label("Daily goal").select_option("90"); A.get_by_role("button", name="Save settings").click()
            expect(A.locator("#toasts")).to_contain_text("Settings saved"); A.reload()
            expect(A.get_by_label("Your name")).to_have_value("Asha Owner"); expect(A.get_by_label("Your GATE paper")).to_have_value("CS")
            expect(A.get_by_label("Daily goal")).to_have_value("90")
            shot(A, "12-settings"); axe(A, "settings")
            A.get_by_role("button", name="Test alarm").click(); ring = A.get_by_role("alertdialog"); expect(ring).to_contain_text("Test alarm")
            ring.get_by_role("button", name="Stop").click(); expect(A.get_by_role("alertdialog")).to_have_count(0)
            A.goto(BASE + "today.html"); expect(A.get_by_text("25m of 1h 30m")).to_be_visible()
        check("settings validate, save, survive a reload and change Today; test alarm rings and stops", settings)

        # ---------- GATE ----------
        def gate_pick():
            A.goto(BASE + "gate.html"); expect(A.get_by_role("heading", name="GATE", exact=True)).to_be_visible()
            A.get_by_role("button", name="Change paper").click()                                       # Settings already chose CS earlier in this run
            expect(A.locator(".paper")).to_have_count(30)
            A.get_by_label("Search the 30 papers").fill("mech"); expect(A.locator(".paper")).to_have_count(1); expect(A.locator(".paper")).to_contain_text("Mechanical Engineering")
            shot(A, "16-gate-picker"); axe(A, "gate-picker")
            A.get_by_label("Search the 30 papers").fill("computer"); A.locator(".paper").filter(has_text="CS").click()
            expect(A.locator(".head .sub")).to_have_text("CS, Computer Science and Information Technology")
            expect(A.locator("#g-done")).to_have_text(f"0 of {CS_TOTAL}")
            expect(A.locator("details.sec")).to_have_count(14)
        check("GATE: all 30 papers are listed, search narrows them, choosing CS loads its 10 sections plus General Aptitude", gate_pick)

        def gate_tick():
            sec = A.locator("details.sec").filter(has_text="Digital Logic"); sec.locator("summary").click()
            box = sec.get_by_role("checkbox").first; box.check()
            expect(A.locator("#toasts")).to_contain_text("Learned"); expect(sec.locator(".sn")).to_have_text("1/3"); expect(A.locator("#g-done")).to_have_text(f"1 of {CS_TOTAL}")
            expect(sec.locator(".rv").first).to_have_text("Review 1 of 4 tomorrow")
            expect(sec).to_have_attribute("open", "")                                                  # the section stays open after a tick
            A.reload(); sec = A.locator("details.sec").filter(has_text="Digital Logic"); expect(sec.locator(".sn")).to_have_text("1/3")
            sec.locator("summary").click(); expect(sec.get_by_role("checkbox").first).to_be_checked()
            expect(A.get_by_role("heading", name="Revise today")).to_have_count(0)
            shot(A, "17-gate"); axe(A, "gate")
        check("GATE: ticking a topic saves it, updates the counts in place and survives a reload", gate_tick)

        def gate_review():
            due = "async (d) => { const C = window.BILLI_CONFIG, sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey); const r = await sb.from('billi_gate_progress').update({ next_review: d }).neq('stage', 5).select(); return r.data.length; }"
            today = datetime.date.today().isoformat()
            assert A.evaluate(due, today) == 1
            A.reload(); card = A.locator("#g-due"); expect(card.get_by_role("heading", name="Revise today")).to_be_visible(); expect(card).to_contain_text("Boolean algebra")
            shot(A, "18-gate-due")
            card.get_by_role("button", name="I remembered").click(); expect(A.locator("#toasts")).to_contain_text("Next review in 3 days")
            expect(A.get_by_role("heading", name="Revise today")).to_have_count(0)
            assert A.evaluate(due, today) == 1; A.reload()
            A.locator("#g-due").get_by_role("button", name="I forgot").click(); expect(A.locator("#toasts")).to_contain_text("comes back tomorrow")
            A.goto(BASE + "today.html"); expect(A.get_by_text("Next topic:")).to_be_visible()
        check("GATE: a due topic appears under Revise today; remembered moves it to 3 days, forgot to tomorrow; Today shows the next topic", gate_review)

        def gate_links():
            A.goto(BASE + "gate.html"); sec = A.locator("details.sec").filter(has_text="Operating System"); sec.locator("summary").click()
            href = sec.get_by_role("link", name="IIT lectures").get_attribute("href")
            assert href.startswith("https://www.youtube.com/results?search_query=") and "Operating%20System" in href and "NPTEL" in href, href
            assert "previous%20year%20questions" in sec.get_by_role("link", name="Solved past questions").get_attribute("href")
            expect(A.get_by_role("link", name="Mock tests and past papers")).to_be_visible()
        check("GATE: every section links to IIT lectures and solved past questions for that section", gate_links)

        def mock_run():
            A.goto(BASE + "mock.html"); expect(A.get_by_role("heading", name="Mock tests", exact=True)).to_be_visible()
            cards = A.locator("section[aria-labelledby=pp-h] .card"); assert cards.count() >= 8, cards.count()
            first = cards.first; expect(first.get_by_role("link", name="Question paper")).to_have_attribute("href", "https://gate2027.iitm.ac.in/static/doc/download/2026/QPs/CS1.pdf")
            shot(A, "19-mock-list"); axe(A, "mock-list")
            first.get_by_role("button", name="Start mock").click(); A.get_by_role("dialog").get_by_role("button", name="Start the clock").click()
            expect(A.locator(".qrow")).to_have_count(65); expect(A.locator("#m-count")).to_have_text("0 of 65 answered")
            mcqs = [q for q in CS1 if q["t"] == "MCQ" and "k" in q]; msq = next(q for q in CS1 if q["t"] == "MSQ" and "s" in q); nat = next(q for q in CS1 if q["t"] == "NAT" and "r" in q)
            wrong_q, right_q, undo_q = mcqs[0], mcqs[1], mcqs[2]
            wrong_letter = next(l for l in "ABCD" if l not in wrong_q["k"])
            row = lambda q: A.locator(f'.qrow[data-q="{q["n"]}"]')
            row(wrong_q).locator("label").filter(has_text=wrong_letter).click()
            row(right_q).locator("label").filter(has_text=right_q["k"][0]).click()
            row(undo_q).locator("label").filter(has_text="A").click(); row(undo_q).locator("label").filter(has_text="A").click()      # second tap clears a guess
            for l in msq["s"][0]: row(msq).locator("label").filter(has_text=l).click()
            row(nat).get_by_role("textbox").fill(str(nat["r"][0][0]))
            row(mcqs[3]).get_by_role("button", name=f'Mark question {mcqs[3]["n"]} for review').click()
            expect(A.locator("#m-count")).to_have_text("4 of 65 answered, 1 to review")
            shot(A, "20-mock-sheet", full=False); axe(A, "mock-sheet")
            A.reload(); expect(A.locator(".qrow")).to_have_count(65); expect(A.locator("#m-count")).to_have_text("4 of 65 answered, 1 to review")   # survives a reload
            expect(row(right_q).get_by_role("radio", name=right_q["k"][0])).to_be_checked()
            A.get_by_role("button", name="Submit and mark").click(); A.get_by_role("dialog").get_by_role("button", name="Submit", exact=True).click()
            mta = sum(q["m"] for q in CS1 if q.get("mta"))
            want = round(right_q["m"] + msq["m"] + nat["m"] + mta - wrong_q["m"] / 3, 2)
            expect(A.locator("#r-score")).to_contain_text(f"{want:g}")
            expect(A.get_by_text("3 right, 1 wrong, 61 skipped") if not mta else A.locator(".scene")).to_be_visible()
            expect(A.locator("#an-h + p")).to_contain_text("cost you")
            assert A.locator("table.res tbody tr").count() == 65
            shot(A, "21-mock-result"); axe(A, "mock-result")
            A.get_by_role("button", name="All papers").click(); expect(A.get_by_role("heading", name="Your attempts")).to_be_visible()
            expect(A.locator("section[aria-labelledby=pp-h] .card").first).to_contain_text(f"Best {want:g}")
            state["mock"] = want
        check("mock: start a real past paper, answer on the sheet, reload safely, submit, and get the score the official key gives", mock_run)

        def mock_timeup():
            ms = int(time.time() * 1000) - 181 * 60000
            uid = A.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')))).user.id")
            A.evaluate("s => localStorage.setItem('billi-mock', s)", json.dumps({"user": uid, "setId": "2025:CS1", "startedAt": ms, "answers": {}, "flags": {}}))
            A.reload(); expect(A.get_by_text("Time is up. Your sheet was submitted.")).to_be_visible()
            A.reload(); expect(A.get_by_role("heading", name="Your attempts")).to_be_visible()                  # not submitted twice, back on the list
            assert A.locator("#att-h + ul li").count() == 2
        check("mock: when the 3 hours run out the sheet is submitted by itself, once", mock_timeup)

        def ask_page():
            A.goto(BASE + "ask.html"); expect(A.get_by_role("heading", name="Ask Billi", exact=True)).to_be_visible()
            expect(A.get_by_label("Ask about")).to_be_visible(); assert A.locator(".chip[data-idea]").count() == 4
            A.get_by_role("button", name="Ask", exact=True).click(); expect(A.locator("#toasts")).to_contain_text("Type a question first")
            A.get_by_label("Your question").fill("What is an eigenvalue?"); A.get_by_role("button", name="Ask", exact=True).click()
            expect(A.get_by_role("heading", name="Ask Billi is not switched on yet")).to_be_visible()
            expect(A.get_by_label("Your question")).to_have_value("What is an eigenvalue?")                    # the question is not lost
            shot(A, "22-ask"); axe(A, "ask")
        check("Ask Billi: the page works end to end; with no Gemini key it explains how to switch it on and keeps your question", ask_page)

        def gate_parts():
            A.goto(BASE + "gate.html"); A.get_by_role("button", name="Change paper").click(); A.locator(".paper").filter(has_text="Engineering Sciences").click()
            expect(A.locator(".head .sub")).to_have_text("XE, Engineering Sciences")
            before = A.locator("#g-done").inner_text()
            A.locator(".part-h").filter(has_text="XE9").get_by_role("checkbox").uncheck()
            expect(A.locator("#g-done")).not_to_have_text(before)
            expect(A.locator(".part-h").filter(has_text="XE0").get_by_role("checkbox")).to_have_count(0)   # the compulsory part has no switch
            A.reload(); expect(A.locator(".part-h").filter(has_text="XE9").get_by_role("checkbox")).not_to_be_checked()
            expect(A.locator("#g-done")).not_to_have_text(before)
        check("GATE: papers with a choice (XE) let you switch off sections you are not taking, and remember it", gate_parts)

        def ringtones():
            A.goto(BASE + "settings.html"); A.get_by_role("heading", name="Settings").wait_for()
            m = A.evaluate("async () => { const a = await import('./js/alarm.js'); const out = {}; for (const k of Object.keys(a.TONES)) out[k] = await a.measureTone(k, 3); return out; }")
            assert set(m) == {"meow", "grumpy", "kitten", "bell"}, m
            for k, v in m.items():
                assert v["rms"] > 0.02, f"{k} is silent: {v}"
                assert v["peak"] < 1.0, f"{k} would clip: {v}"
            assert m["grumpy"]["low"] > m["meow"]["low"] > m["kitten"]["low"], m           # share of the sound below 350 Hz
            assert m["kitten"]["pitch"] > m["meow"]["pitch"] * 1.3, m
            state["tones"] = {k: {"rms": round(v["rms"], 3), "peak": round(v["peak"], 2), "low": round(v["low"], 3)} for k, v in m.items()}
            A.locator("label").filter(has_text="Grumpy cat").click(); A.get_by_role("button", name="Save settings").click()
            expect(A.locator("#toasts")).to_contain_text("Settings saved"); A.reload(); expect(A.get_by_role("radio", name="Grumpy cat")).to_be_checked()
        check("ringtones: all four make real, unclipped sound; grumpy is lowest and kittens highest; the choice is saved", ringtones)

        def keyboard_only():
            A.goto(BASE + "tasks.html"); A.get_by_role("heading", name="Tasks", exact=True).wait_for()
            A.keyboard.press("Tab"); expect(A.get_by_role("link", name="Skip to content")).to_be_focused()
            A.get_by_role("button", name="Add task").focus(); A.keyboard.press("Enter")
            expect(A.get_by_label("What do you need to do?")).to_be_focused()
            A.keyboard.type("Keyboard task"); A.keyboard.press("Enter")
            expect(A.get_by_role("listitem").filter(has_text="Keyboard task")).to_be_visible()
        check("keyboard only: skip link is first, dialog takes focus, Enter submits", keyboard_only)

        def edit_delete_task():
            A.get_by_role("button", name="Edit task: Keyboard task").click()
            dlg = A.get_by_role("dialog", name="Edit task"); dlg.get_by_label("What do you need to do?").fill("Renamed task")
            dlg.get_by_role("button", name="Save task").click()
            expect(A.get_by_role("listitem").filter(has_text="Renamed task")).to_be_visible()
            A.get_by_role("button", name="Edit task: Renamed task").click()
            A.get_by_role("dialog", name="Edit task").get_by_role("button", name="Delete task").click()
            A.get_by_role("dialog", name="Delete this task?").get_by_role("button", name="Delete", exact=True).click()
            expect(A.get_by_role("listitem").filter(has_text="Renamed task")).to_have_count(0)
        check("a task can be renamed and deleted from its own dialog", edit_delete_task)

        def reflow():
            S = browser.new_context(viewport={"width": 320, "height": 640}, storage_state=ctxA.storage_state()).new_page(); watch(S, "small")
            for pg in ["today", "timetable", "tasks", "timer", "class", "settings"]:
                S.goto(BASE + pg + ".html"); S.locator("h1").wait_for(); S.wait_for_timeout(300)
                over = S.evaluate("document.scrollingElement.scrollWidth - window.innerWidth")
                assert over <= 0, f"{pg} scrolls sideways by {over}px at 320px wide"
            shot(S, "14-settings-320"); S.goto(BASE + "timetable.html"); S.locator("h1").wait_for(); shot(S, "15-timetable-320"); S.context.close()
        check("no page scrolls sideways on a 320px-wide screen (same as 400% zoom on desktop)", reflow)

        def desktop():
            D = browser.new_context(viewport={"width": 1280, "height": 800}, storage_state=ctxA.storage_state()).new_page(); watch(D, "desktop")
            D.goto(BASE + "today.html"); D.get_by_role("heading", name="Today", exact=True).wait_for()
            expect(D.get_by_role("navigation", name="Main").get_by_role("link", name="Settings")).to_be_visible()
            shot(D, "13-today-desktop"); D.context.close()
        check("desktop layout shows the side rail with Settings", desktop)

        def sign_out():
            A.goto(BASE + "settings.html"); A.get_by_role("button", name="Sign out").click(); A.wait_for_url("**/login.html")
            A.goto(BASE + "today.html"); A.wait_for_url("**/login.html")
        check("sign out works and the app is locked again", sign_out)

        def cleanup():
            sign_in(A, "billi-test-owner@example.com"); A.evaluate(CLEAN); B.goto(BASE + "today.html"); B.evaluate(CLEAN)
        check("test data is removed again", cleanup)
        browser.close()
finally:
    server.terminate()

print("\n--- accessibility scan (axe-core, WCAG 2.1 A + AA) ---")
total = 0
for page, v in axe_findings.items():
    total += len(v)
    print(f"{page}: {'no violations' if not v else ''}")
    for x in v: print(f"   [{x['impact']}] {x['id']} x{x['n']}: {x['sample']}\n      {x['why']}")
from collections import Counter
unexpected = dict(Counter(bad_responses) - Counter(EXPECTED_FAILS)); missing = dict(Counter(EXPECTED_FAILS) - Counter(bad_responses))
print("\n--- failed network requests ---")
print("only the two deliberate ones (wrong password, wrong invite code)" if not unexpected and not missing else f"unexpected: {unexpected}  missing: {missing}")
print("\n--- ringtone measurements ---"); print(state.get("tones") if "state" in dir() else "not measured")
print("\n--- browser console errors ---")
print("\n".join(console_errors) if console_errors else "none")
ok = sum(1 for r in results if r[0]); bad = len(results) - ok
print(f"\n{ok} passed, {bad} failed, {total} accessibility violations, {len(console_errors)} console errors, {sum(unexpected.values())} unexpected failed requests")
sys.exit(1 if bad or total or console_errors or unexpected else 0)
