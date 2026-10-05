"""Builds the past-paper list and the machine-readable official answer keys.
Input: the saved official downloads page and a folder of answer-key text files (pdftotext -layout), named by the key URL with / replaced by _.
Output: web/data/papers/<PAPER>.json, one entry per year and set, with links to the official question paper and key, and the parsed key when
it is a clean 65-question, 100-mark paper. Nothing but question numbers, types, marks and keys is stored: no question text.
Usage: python3 tools/build_papers.py download.html keys_txt web/data/papers
"""
import sys, os, re, json

PAGE, KEYS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
BASE = "https://gate2027.iitm.ac.in/"
html = open(PAGE, encoding="utf-8").read()
pair = re.compile(r'<a\s+href="(static/doc/download/[^"]+\.pdf)"[^>]*>\s*([^<]+?)\s*</a>\s*</span>\s*</td>\s*<td>\s*<span[^>]*>\s*<a\s+href="(static/doc/download/[^"]+\.pdf)"[^>]*>\s*([A-Za-z0-9\- ]+?)\s*</a>', re.S)
# 2021 keys carry an extra "negative marks" column and the odd typo "MCO"; later years do not.
ROW = re.compile(r"^\s*(\d{1,2})\s+(\d{1,2})\s+(MCQ|MCO|MSQ|NAT)\s+(\S+)\s+(.*?)\s+(\d)(?:\s+(?:\d/\d|0|-|–|NA|Nil))?\s*$")
num = r"[-+]?\d+(?:\.\d+)?"

def parse_key(kind, raw):
    raw = re.sub(r"[–−]\s*", "-", raw.strip())                                    # typeset minus signs, sometimes followed by a space
    if re.fullmatch(r"MTA\*?|Marks? to All", raw, re.I): return {"mta": True}
    alts = [a.strip() for a in re.split(r"\s+OR\s+|\s+or\s+", raw)]
    if kind == "NAT":
        out = []
        for a in alts:
            m = re.fullmatch(r"(%s)\s*(?:to|TO|-|–)\s*(%s)" % (num, num), a) or re.fullmatch(r"(%s)" % num, a)
            if not m: return None
            lo = float(m.group(1)); hi = float(m.group(2)) if m.lastindex == 2 else lo
            out.append([min(lo, hi), max(lo, hi)])
        return {"r": out}
    sets = []
    for a in alts:
        letters = re.findall(r"[A-D]", a.upper())
        if not letters or re.sub(r"[A-Da-d;,/\s]", "", a): return None
        sets.append(sorted(set(letters)))
    if kind == "MCQ": return {"k": sorted({l for s in sets for l in s})}          # any listed option is accepted
    return {"s": sets}

def read_key(path):
    if not os.path.exists(path): return None
    qs = []
    for ln in open(path, encoding="utf-8", errors="ignore"):
        m = ROW.match(ln)
        if not m: continue
        kind = "MCQ" if m.group(3) == "MCO" else m.group(3)
        k = parse_key(kind, m.group(5))
        if k is None: k = {"u": True}                                             # a key we cannot read safely: left for the student to check
        qs.append({"n": int(m.group(1)), "t": kind, "sec": m.group(4), "m": int(m.group(6)), **k})
    ok = len(qs) == 65 and [q["n"] for q in qs] == list(range(1, 66)) and sum(q["m"] for q in qs) == 100 and sum(1 for q in qs if q.get("u")) <= 3
    return qs if ok else None

papers, urls = {}, []
for qp, name, key, code in pair.findall(html):
    year = int(re.search(r"/(20\d\d)", qp).group(1)); code = code.strip().upper().replace(" ", "").replace("-", "")
    name = re.sub(r"\s+", " ", name.replace("&amp;", "&")).strip()
    paper = code[:2]
    urls.append(key)
    qs = read_key(os.path.join(KEYS, key.replace("/", "_")[:-4] + ".txt"))
    papers.setdefault(paper, []).append({"id": "%d:%s" % (year, code), "year": year, "set": code, "name": name, "qp": BASE + qp, "key": BASE + key, "questions": qs})

if "--urls" in sys.argv: print("\n".join(BASE + u for u in sorted(set(urls)))); sys.exit()
os.makedirs(OUT, exist_ok=True)
total = scorable = 0
for paper, sets in sorted(papers.items()):
    sets.sort(key=lambda s: (-s["year"], s["set"]))
    json.dump({"paper": paper, "sets": sets}, open(os.path.join(OUT, paper + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
    n = sum(1 for s in sets if s["questions"]); total += len(sets); scorable += n
    print("%-3s sets=%-2d scorable=%-2d years=%s" % (paper, len(sets), n, sorted({s["year"] for s in sets})))
json.dump({"source": BASE + "download", "fetched": "2026-10-04", "papers": sorted(papers)}, open(os.path.join(OUT, "index.json"), "w"))
print("papers:", len(papers), "sets:", total, "with machine-readable key:", scorable)
