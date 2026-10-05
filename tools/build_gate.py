"""Turns the official GATE 2027 syllabus PDFs (text already extracted with pdftotext -layout) into one JSON file per paper.
Topic wording is kept exactly as published; this script only finds the structure (parts, sections, groups, topics).
Usage: python3 tools/build_gate.py <folder with CODE.txt files> web/data/gate
"""
import sys, os, re, json, hashlib

SRC, OUT = sys.argv[1], sys.argv[2]
BASE = "https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/%s_GATE2027_Syllabus.pdf"
SUB_FALLBACK = {"XE0": "Engineering Mathematics", "XH0": "Reasoning and Comprehension", "XL0": "Chemistry"}
MATHS_PAPERS = "AE AG BM BT CE CH CS EC EE ES IN ME MN MT NM PE PI".split()
MARKS = {"AR": "General Aptitude 15, Part A 60, Part B 25", "GE": "General Aptitude 15, Part A 55, Part B 30", "GG": "General Aptitude 15, Part A 25, Part B 60",
         "RA": "General Aptitude 15, Part A 60, Part B 25", "XE": "General Aptitude 15, XE0 15, two other sections 35 each",
         "XH": "General Aptitude 15, XH0 25, one other section 60", "XL": "General Aptitude 15, XL0 25, two other sections 30 each"}
RULE = {"AR": "Part A is common. You pick Part B1 or B2 during the exam.", "GE": "Part A is common. You pick Part B1 or B2 during the exam.",
        "GG": "Part A is common. You choose Part B1 or B2 when you apply.", "RA": "Part A is common. You pick Part B1 or B2 during the exam.",
        "XE": "XE0 is compulsory. You pick any two other sections during the exam.", "XH": "XH0 is compulsory. You choose one other section when you apply.",
        "XL": "XL0 is compulsory. You pick any two other sections during the exam."}
ABBR = re.compile(r"\b(e\.g|i\.e|etc|vs|viz|cf|approx|Fig|No|Eq|Dr|St)\.")

def clean_lines(text):
    out = []
    for ln in text.replace("\f", "\n").split("\n"):
        if "Organizing Institute" in ln: continue
        out.append(ln.replace("\u2010", "-").replace("\u2011", "-").replace("\u00a0", " ").rstrip())
    return out

def join(par):
    s = ""
    for ln in par:
        ln = ln.strip()
        if s.endswith("-") and ln[:1].islower() and not s.endswith(" -"): s += ln       # word broken across a line
        else: s += (" " if s else "") + ln
    return re.sub(r"\s+", " ", s).strip()

def split_topics(body):
    body = ABBR.sub(lambda m: m.group(0).replace(".", "\u2024"), body)
    parts, cur, depth = [], "", 0
    for i, ch in enumerate(body):
        if ch in "([": depth += 1
        elif ch in ")]": depth = max(0, depth - 1)
        if depth == 0 and ch == ";": parts.append(cur); cur = ""; continue
        if depth == 0 and ch == "." and (i + 1 == len(body) or body[i + 1] == " "):
            nxt = body[i + 1:].lstrip()[:1]
            initial = i >= 2 and body[i - 1].isupper() and body[i - 2] == "."                       # the second dot in "I.C. Engines", "P.F. Strawson"; not "Programming in C. Recursion"
            if not initial and (nxt == "" or nxt.isupper() or nxt.isdigit()): parts.append(cur); cur = ""; continue
        cur += ch
    parts.append(cur)
    res = []
    for p in parts:
        p = p.replace("\u2024", ".").strip().strip(";,").strip()
        if p.endswith(".") and not ABBR.search(p[-6:]): p = p[:-1].strip()
        if len(p) >= 2: res.append(p)
    return res

def parse(code, text):
    lines = clean_lines(text)
    name, sub, sections, part, sec, par, notes = None, None, [], None, None, [], []
    def flush():
        nonlocal par, sec
        if not par: return
        s = join(par); par = []
        if not s: return
        if re.match(r"^This (part|section|paper)\b", s):
            # an introduction sentence, sometimes run straight into the first "Title: topics" paragraph
            m = re.match(r"^(This [^.]*\.)\s+([A-Z][^:.;]{2,80}:\s+.+)$", s)
            if not m: notes.append(s); return
            notes.append(m.group(1)); s = m.group(2)
        if sec is None:
            sec = {"part": part, "title": part or sub or name, "groups": []}; sections.append(sec)
        m = re.match(r"^([^:.;]{3,80}):\s+(.+)$", s)
        title, body = (m.group(1).strip(), m.group(2)) if m and len(m.group(1).split()) <= 9 else (None, s)
        topics = split_topics(body)
        if topics: sec["groups"].append({"title": title, "topics": topics})
    for ln in lines:
        st = ln.strip()
        if not st: flush(); continue
        if name is None:
            m = re.match(r"^([A-Z]{2})\s+(.+)$", st)
            if m: name = m.group(2).strip(); continue
        m = re.match(r"^(X[EHL]\d):\s*(.+)$", st)
        if m and sub is None: flush(); sub = re.sub(r"\s*\(Compulsory.*$", "", m.group(2)).strip(); continue
        m = re.match(r"^Part\s+([A-Z]\d?)\s*[:\-–]\s*(.+)$", st, re.I)
        if m: flush(); part = "Part %s: %s" % (m.group(1).upper(), m.group(2).strip()); sec = None; continue
        m = re.match(r"^Section\s+([A-Za-z0-9.]+?)[:.]?\s{2,}(.+)$", ln.strip()) or re.match(r"^Section\s+([A-Za-z0-9.]+):\s*(.+)$", st)
        if m: flush(); sec = {"part": part, "title": m.group(2).strip(), "groups": []}; sections.append(sec); continue
        par.append(ln)
    flush()
    return name, sub, [s for s in sections if s["groups"]], notes

def tid(code, sec_title, text, seen):
    h = hashlib.sha1((sec_title + "|" + text).encode()).hexdigest()[:8]
    while h in seen: h = hashlib.sha1((h + "x").encode()).hexdigest()[:8]
    seen.add(h); return code + ":" + h

def finish(code, name, sections, sources, extra=None):
    seen, n = set(), 0
    for s in sections:
        for g in s["groups"]:
            g["topics"] = [{"id": tid(code, s["title"], t, seen), "text": t} for t in g["topics"]]; n += len(g["topics"])
    doc = {"code": code, "name": name, "sources": sources, "marks": MARKS.get(code, "General Aptitude 15, Engineering Mathematics 13, Subject 72" if code in MATHS_PAPERS else "General Aptitude 15, Subject 85"),
           "rule": RULE.get(code), "sections": sections, "topics": n}
    if extra: doc.update(extra)
    json.dump(doc, open(os.path.join(OUT, code + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    return n

os.makedirs(OUT, exist_ok=True)
codes = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith(".txt"))
index, report = [], []
for code in [c for c in codes if len(c) == 2]:
    name, _, sections, notes = parse(code, open(os.path.join(SRC, code + ".txt"), encoding="utf-8").read())
    n = finish(code, name, sections, [BASE % code])
    if code != "GA": index.append({"code": code, "name": name, "topics": n})
    report.append((code, name, len(sections), n))
for fam in ["XE", "XH", "XL"]:
    sections, sources, fam_name = [], [], None
    for code in [c for c in codes if c.startswith(fam) and len(c) == 3]:
        name, sub, secs, notes = parse(code, open(os.path.join(SRC, code + ".txt"), encoding="utf-8").read())
        fam_name = name; sub = sub or SUB_FALLBACK.get(code, code)
        for s in secs: s["part"] = "%s: %s" % (code, sub)
        sections += secs; sources.append(BASE % code)
    n = finish(fam, fam_name, sections, sources)
    index.append({"code": fam, "name": fam_name, "topics": n}); report.append((fam, fam_name, len(sections), n))
index.sort(key=lambda p: p["code"])
json.dump({"exam": "GATE 2027", "organiser": "IIT Madras", "site": "https://gate2027.iitm.ac.in/", "syllabus_page": "https://gate2027.iitm.ac.in/exam_papers_and_syllabus",
           "papers_page": "https://gate2027.iitm.ac.in/download", "fetched": "2026-10-04", "papers": index}, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, indent=1)
for r in report: print("%-3s %-48s sections=%-3d topics=%d" % r)
print("papers:", len(index), " total topics:", sum(p["topics"] for p in index))
