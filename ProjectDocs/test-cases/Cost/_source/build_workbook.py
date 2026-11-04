"""Fill a copy of VSBCloud-Functional-Test-Case-Template.xlsx with one screen's cases.

usage: python -I build_workbook.py <template.xlsx> <cases.json> <screen name> <screen code> <out.xlsx>

Keeps every formula, data validation, conditional format and named range of the template. Removes the
template's SAMPLE rows (Test Cases rows 4-13, Execution Log rows 4-5), writes the cases from row 4, sets
Status = Not Run, and checks every row against the template's catalogue rules before saving.
"""
import json, re, sys
import openpyxl
from openpyxl.styles import Alignment

sys.stdout.reconfigure(encoding="utf-8")
tpl, cases_path, screen, code, out = sys.argv[1:6]

wb = openpyxl.load_workbook(tpl)
tc, log, lk = wb["Test Cases"], wb["Execution Log"], wb["Lookups"]

def col_values(ws, col, first=4):
    vals = []
    for r in range(first, ws.max_row + 1):
        v = ws[f"{col}{r}"].value
        if v not in (None, ""):
            vals.append(str(v))
    return vals

allowed = {
    "screen": col_values(lk, "A"), "suite": col_values(lk, "I"), "role": col_values(lk, "J"),
    "category": col_values(lk, "K"), "priority": col_values(lk, "L"), "expectation_source": col_values(lk, "M"),
    "server_enforcement": col_values(lk, "N"), "exec_mode": col_values(lk, "O"), "auto_status": col_values(lk, "P"),
}
codes = dict(zip(col_values(lk, "A"), col_values(lk, "B")))
assert screen in allowed["screen"], f"screen '{screen}' not on Lookups"
assert codes[screen] == code, f"code {code} != Lookups {codes[screen]}"

# Column map: JSON key -> Test Cases column (D and E stay formulas).
COLS = {"case_id": "A", "suite": "B", "title": "F", "category": "G", "role": "H", "priority": "I",
        "preconditions": "J", "test_data": "K", "steps": "L", "expected": "M", "acceptance": "N",
        "expectation_source": "O", "canvas_ref": "P", "rule_function": "Q", "pinned_by": "R",
        "server_enforcement": "S", "exec_mode": "T", "auto_status": "U", "auto_ref": "V",
        "known_defect_ref": "W", "divergence_ref": "X", "comments": "AH"}
REQUIRED = ["case_id", "suite", "title", "category", "role", "priority", "preconditions", "steps", "expected",
            "acceptance", "expectation_source", "exec_mode", "auto_status"]

cases = json.load(open(cases_path, encoding="utf-8-sig"))
problems = []
seen = set()
GUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
for i, c in enumerate(cases):
    cid = c.get("case_id", f"<row {i}>")
    for k in REQUIRED:
        if not str(c.get(k, "")).strip():
            problems.append(f"{cid}: '{k}' empty")
    for k, lst in allowed.items():
        if k in c and c[k] and k != "screen" and c[k] not in lst:
            problems.append(f"{cid}: {k} '{c[k]}' not in the Lookups list")
    if cid in seen:
        problems.append(f"{cid}: duplicate id")
    seen.add(cid)
    if c.get("suite") == "FT-BR" and not cid.startswith(f"FT-BR-{code}-"):
        problems.append(f"{cid}: FT-BR id does not carry {code}")
    if c.get("suite") == "FT-ACC" and not re.fullmatch(r"FT-ACC-\d{3}", cid):
        problems.append(f"{cid}: bad FT-ACC id")
    if not cid.startswith(c.get("suite", "?") + "-"):
        problems.append(f"{cid}: suite does not match prefix")
    if c.get("pinned_by") and not str(c["pinned_by"]).startswith("UT-"):
        problems.append(f"{cid}: pinned_by must start with UT-")
    if len(c.get("title", "")) > 120:
        problems.append(f"{cid}: title {len(c['title'])} chars > 120")
    blob = json.dumps(c, ensure_ascii=False)
    if GUID.search(blob):
        problems.append(f"{cid}: contains a GUID")
if len(cases) > 600:
    problems.append(f"{len(cases)} cases > 600 rows")

# Clear the template's sample rows (input cells only; D/E formulas stay).
for r in range(4, 604):
    for col in list(COLS.values()) + ["C", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG"]:
        tc[f"{col}{r}"].value = None
for r in range(4, 1004):
    for col in "ABCEFGHIJKLMN":
        log[f"{col}{r}"].value = None

wrap = Alignment(wrap_text=True, vertical="top")
for i, c in enumerate(cases):
    r = 4 + i
    tc[f"C{r}"].value = screen
    for k, col in COLS.items():
        v = c.get(k, "")
        tc[f"{col}{r}"].value = v if v != "" else None
    tc[f"AD{r}"].value = "Not Run"
    for col in ["F", "J", "K", "L", "M", "N", "P", "Q", "V", "W", "X", "AH"]:
        tc[f"{col}{r}"].alignment = wrap

tc["A1"].value = f"VSBCloud Code App — Functional Test Cases — {screen} ({code})"
wb.calculation.fullCalcOnLoad = True
wb.save(out)

by_suite = {}
by_cat = {}
for c in cases:
    by_suite[c.get("suite")] = by_suite.get(c.get("suite"), 0) + 1
    by_cat[c.get("category")] = by_cat.get(c.get("category"), 0) + 1
pinned = sum(1 for c in cases if c.get("suite") == "FT-BR" and c.get("pinned_by"))
print(json.dumps({"out": out, "rows": len(cases), "suite": by_suite, "category": by_cat,
                  "ft_br_pinned": pinned, "problems": problems}, ensure_ascii=False, indent=1))
