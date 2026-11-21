import re
from datetime import date, timedelta
import nlu

DISCLOSURE = "Namaste, main ek AI voice assistant hoon."

class Dialogue:
    def __init__(self, ledger):
        self.L = ledger
        self.pending = None
        self.first_turn = True

    def known(self):
        return list({tok for n in self.L.customers for tok in n.lower().split()})

    def handle(self, text):
        events = []
        reply, status = self._handle(text, events)
        if self.first_turn:                      # rule: AI disclosure in the first turn
            reply = DISCLOSURE + " " + reply
            self.first_turn = False
        return reply, status, events

    def _cands(self, toks):
        if not toks: return []
        return [n for n in self.L.customers if all(t in n.lower().split() for t in toks)]

    def _handle(self, text, events):
        if self.pending:
            r = self._resolve(text, events)
            if r: return r
        # "Ramesh ka limit 1000" -> set the credit limit by voice
        m = re.search(r"\blimit\b[^0-9]*(\d+)", text.lower())
        if m:
            c = self._cands(nlu.find_names(nlu.normalize(text).split(), self.known()))
            if len(c) == 1:
                self.L.set_limit(c[0], int(m.group(1)))
                events.append({"type": "limit_set", "customer": c[0], "limit": int(m.group(1))})
                return (f"{c[0]} ka limit {m.group(1)} rupaye set kar diya.", "saved")
        return self._run(nlu.parse(text, self.known()), events)

    def _run(self, actions, events):
        if not actions: return ("", "saved")
        a, rest = actions[0], actions[1:]
        k = a["intent"]
        if k == "entry": return self._entry(a, rest, events)
        if k == "correction":
            last = self.L.last()
            if not last: return ("Koi entry nahi mili.", "error")
            self.L.update_last_amount(a["amount"])
            events.append({"type": "correction", "id": last["id"], "amount": a["amount"]})
            return (f"Theek hai, {a['amount']} kar diya.", "saved")
        if k == "undo":
            e = self.L.undo_last()
            if not e: return ("Hatane ke liye kuch nahi hai.", "error")
            events.append({"type": "undo", "id": e["id"]})
            return ("Pichli entry hata di.", "saved")
        if k == "query_total":
            c = self._cands(a["name_tokens"])
            if not c: return ("Customer ka naam samajh nahi aaya.", "error")
            parts = []
            for n in c:
                b = self.L.balance(n)
                parts.append(f"{n} ka {b} rupaye baaki hai." if b > 0 else f"{n} ka kuch baaki nahi.")
            return (" ".join(parts), "saved")
        if k == "query_today":
            return (f"Aaj {self.L.today_credit()} rupaye ka udhaar gaya.", "saved")
        if k in ("yes", "no"):
            return ("Abhi koi sawal pending nahi hai.", "saved")
        return ("Samajh nahi aaya, dobara bolein.", "error")

    def _entry(self, a, rest, events):
        if a["kind"] is None: return ("Udhaar hai ya jama? Dobara bolein.", "error")
        toks = a["name_tokens"]
        if not toks:                       # "kal 200 diya tha" -> same customer as last entry
            last = self.L.last()
            if last:
                toks = last["customer"].lower().split()
        c = self._cands(toks)
        if not c: return ("Customer ka naam samajh nahi aaya. Dobara bolein.", "error")
        if len(c) > 1:                             # two customers share a name: ask
            self.pending = {"type": "pick", "a": a, "rest": rest, "cands": c}
            return ("Kaun sa? " + " ya ".join(c) + "?", "ask")
        return self._commit(c[0], a, rest, events)

    def _commit(self, name, a, rest, events):
        L = self.L
        if a["kind"] == "credit" and not a.get("override"):
            bal, limit = L.balance(name), L.customers[name]["limit"]
            if bal + a["amount"] > limit:          # soft warning, shopkeeper decides
                self.pending = {"type": "limit", "name": name, "a": a, "rest": rest}
                return (f"Limit {limit} rupaye hai. {name} ka {bal + a['amount']} ho jayega. Phir bhi likhun?", "limit")
        day = date.today() + timedelta(days=a["offset"])
        e = L.add(name, a["amount"], a["kind"], day)
        events.append({"type": "entry", **e, "balance": L.balance(name)})
        word = "udhaar" if a["kind"] == "credit" else "jama"
        msg = f"{name} ka {a['amount']} rupaye {word} likh diya."
        if rest:
            for r in rest:
                if r.get("intent") == "entry" and r.get("name_tokens") == a.get("name_tokens"):
                    r["name_tokens"] = name.lower().split()
            r2, s2 = self._run(rest, events)
            if r2: msg += " " + r2               # speak the second clause too
        bal = L.balance(name)                    # balance AFTER all clauses
        tail = f" Ab {bal} rupaye baaki." if bal > 0 else " Ab kuch baaki nahi."
        return (msg + tail, "saved")

    def _resolve(self, text, events):
        p, self.pending = self.pending, None
        words = text.lower().replace(",", " ").split()
        if p["type"] == "pick":
            hit = None
            if any(w in ("pehla", "pehle", "first", "1") for w in words): hit = p["cands"][0]
            elif any(w in ("doosra", "dusra", "second", "2") for w in words) and len(p["cands"]) > 1:
                hit = p["cands"][1]
            else:
                m = [c for c in p["cands"] if any(t in words for t in c.lower().split()[1:])]
                if len(m) == 1: hit = m[0]
            return self._commit(hit, p["a"], p["rest"], events) if hit else None
        if p["type"] == "limit":
            w = set(words)
            if w & nlu.YES and not w & nlu.NO:
                p["a"]["override"] = True
                return self._commit(p["name"], p["a"], p["rest"], events)
            if w & nlu.NO and not any(x.isdigit() for x in words):
                return ("Theek hai, nahi likha.", "saved")
        return None