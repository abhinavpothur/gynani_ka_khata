import re
from rapidfuzz import process, fuzz

UNITS = {"ek": 1, "one": 1, "do": 2, "two": 2, "teen": 3, "three": 3, "char": 4, "chaar": 4,
         "four": 4, "paanch": 5, "panch": 5, "five": 5, "chhe": 6, "che": 6, "chah": 6,
         "six": 6, "saat": 7, "seven": 7, "aath": 8, "eight": 8, "nau": 9, "nine": 9,
         "das": 10, "ten": 10, "gyarah": 11, "eleven": 11, "barah": 12, "twelve": 12,
         "terah": 13, "chaudah": 14, "pandrah": 15, "fifteen": 15, "solah": 16, "satrah": 17,
         "atharah": 18, "unnis": 19, "bees": 20, "twenty": 20, "pachchis": 25, "pachees": 25,
         "tees": 30, "thirty": 30, "chaalis": 40, "chalis": 40, "forty": 40,
         "paintaalis": 45, "pachaas": 50, "pachas": 50, "fifty": 50, "saath": 60,
         "sixty": 60, "sattar": 70, "seventy": 70, "assi": 80, "eighty": 80,
         "nabbe": 90, "ninety": 90, "dedh": 1.5, "dhai": 2.5}
HUNDRED = {"sau", "hundred"}
THOUSAND = {"hazaar", "hajar", "hazar", "thousand"}
MULT = HUNDRED | THOUSAND
AMBIG = {"do"}                        # "likh do" must not become 2
NEG = {"nahi", "nahin", "no", "sorry", "galat"}
YES = {"haan", "han", "ha", "yes", "ok", "okay", "theek", "sahi", "kar", "likh"}
NO = {"nahi", "nahin", "no", "mat", "rehne", "ruko"}
UNDO = {"undo", "cancel", "hata", "delete"}
QUERY = {"kitna", "kitne", "kitni", "total", "balance", "hisaab"}
DATES = {"kal": -1, "parso": -2, "aaj": 0}
STRONG_PAY = {"wapas", "chuka", "chukta", "jama", "paid", "pay", "mile", "mil", "received", "return"}
CREDIT_W = {"udhaar", "udhar", "baaki", "credit", "bakaya"}
END_VERBS = {"udhaar", "udhar", "diya", "diye", "likh", "baaki", "credit", "paid"}
STOP = {"kal", "aaj", "parso", "diya", "diye", "dia", "tha", "hai", "ka", "ko", "ne", "ki",
        "ke", "aur", "udhaar", "udhar", "baaki", "likh", "kar", "nahi", "nahin", "total",
        "kitna", "gaya", "rupaye", "and", "the", "hisaab", "dena", "wapas", "jama", "paid",
        "undo", "cancel", "hata", "delete", "sorry", "galat", "limit"}


def normalize(text):
    t = text.lower().replace("₹", " ").replace("-", " ")
    t = re.sub(r"(?<=\d),(?=\d{3}\b)", "", t)          # FIX: 1,200 -> 1200 (was " ", gave 201)
    t = re.sub(r"\b(rs|rupaye|rupees|rupee|rupay|rupiya)\b\.?", " ", t)
    return t


def is_num(toks, i):
    t = toks[i]
    if t.isdigit():
        return True
    if t in AMBIG:
        return i + 1 < len(toks) and toks[i + 1] in MULT
    return t in UNITS or t in MULT


def run_value(toks):
    total, cur, hundred = 0, 0, False
    for t in toks:
        if t.isdigit():
            cur += int(t)
        elif t in HUNDRED:
            cur = (cur or 1) * 100
            hundred = True
        elif t in THOUSAND:
            total += (cur or 1) * 1000
            cur = 0
            hundred = False
        else:
            v = UNITS[t]
            if not hundred and 1 <= cur < 10 and v >= 20 and v % 10 == 0:
                cur = cur * 100 + v                  # "three forty" = 340
            else:
                cur += v
    return int(total + cur)


def find_runs(toks):
    runs, i = [], 0
    while i < len(toks):
        if is_num(toks, i):
            j = i
            while j < len(toks) and is_num(toks, j):
                j += 1
            runs.append((i, j, run_value(toks[i:j])))
            i = j
        else:
            i += 1
    return runs


def split_clauses(t):
    out = []
    for part in re.split(r"[,;.?!]|\b(?:aur|and|phir|fir)\b", t):
        toks = part.split()
        if not toks:
            continue
        runs = find_runs(toks)
        if len(runs) >= 2:                           # two amounts in one breath: split them
            cut = None
            for i in range(runs[0][1], runs[1][0]):
                if toks[i] in END_VERBS:
                    cut = i + 1
                    break
            if cut is None:
                cut = runs[1][0]
            if cut - 1 >= runs[0][1] and toks[cut - 1] in DATES:
                cut -= 1
            out += [toks[:cut], toks[cut:]]
        else:
            out.append(toks)
    return out


def find_names(toks, known):
    found = []
    for t in toks:
        if len(t) < 3 or t in STOP or t.isdigit() or t in UNITS or t in MULT:
            continue
        m = process.extractOne(t, known, scorer=fuzz.ratio, score_cutoff=80)
        if m and m[0] not in found:
            found.append(m[0])
    return found


def direction(toks):
    s = set(toks)
    if s & STRONG_PAY:
        return "payment"
    if s & CREDIT_W:
        return "credit"
    if "ko" in s and s & {"diya", "diye", "de", "dena"}:
        return "credit"
    if s & {"diya", "diye", "dia", "de"}:
        return "payment"
    return None


def date_offset(toks):
    for t in toks:
        if t in DATES:
            return DATES[t]
    return 0


def parse(text, known):
    t = normalize(text)
    whole = re.sub(r"[,;.?!]", " ", t).split()
    if not whole:
        return [{"intent": "unknown"}]
    s = set(whole)
    if s & UNDO and len(whole) <= 4:
        return [{"intent": "undo"}]
    runs, names = find_runs(whole), find_names(whole, known)
    if s & QUERY:
        if names:
            return [{"intent": "query_total", "name_tokens": names}]
        if "aaj" in s:
            return [{"intent": "query_today"}]
    if whole[0] in NEG and runs and not names:
        return [{"intent": "correction", "amount": runs[0][2]}]
    if not runs and not names and len(whole) <= 4:
        if s & NO:
            return [{"intent": "no"}]
        if s & YES:
            return [{"intent": "yes"}]
    actions, last_names = [], []
    for clause in split_clauses(t):
        cr = find_runs(clause)
        if not cr:
            continue
        nm = find_names(clause, known) or last_names   # 2nd clause reuses the name
        last_names = nm
        actions.append({"intent": "entry", "amount": cr[0][2], "kind": direction(clause),
                        "offset": date_offset(clause), "name_tokens": nm})
    return actions or [{"intent": "unknown"}]