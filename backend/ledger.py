import os, json, uuid
from datetime import date, datetime
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
load_dotenv()

DATA_FILE = "ledger.enc"

# Synthetic demo data — matches the frontend profiles exactly
SEED = {
    "Ramesh Sharma": {"limit": 500,  "opted_in": True,  "address": "42, MG Road, Near Trinity Metro Station, Bengaluru, Karnataka 560001."},
    "Suresh Patel":  {"limit": 1000, "opted_in": True,  "address": "Plot 15, 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038."},
    "Geeta Reddy":   {"limit": 300,  "opted_in": False, "address": "H.No 8-2-34, 80 Feet Road, Koramangala 4th Block, Bengaluru, Karnataka 560034."},
    "Ramesh Verma":  {"limit": 400,  "opted_in": True,  "address": "104, 9th Main, Jayanagar 4th Block, Bengaluru, Karnataka 560011."},
    "Anjali Iyer":   {"limit": 1000, "opted_in": True,  "address": "Flat 3B, Shanti Apartments, Basavanagudi, Bengaluru, Karnataka 560004."},
    "Vikram Singh":  {"limit": 1500, "opted_in": True,  "address": "House 45, 12th Cross, Malleshwaram, Bengaluru, Karnataka 560003."},
    "Priya Das":     {"limit": 600,  "opted_in": True,  "address": "22/B, Residency Road, Near Shanthi Nagar, Bengaluru, Karnataka 560025."},
    "Arjun Nair":    {"limit": 500,  "opted_in": False, "address": "Villa 12, Lavelle Road, Ashok Nagar, Bengaluru, Karnataka 560001."},
    "Meena Gupta":   {"limit": 2000, "opted_in": True,  "address": "Shop 4, Commercial Street, Shivaji Nagar, Bengaluru, Karnataka 560001."},
    "Karthik Rao":   {"limit": 800,  "opted_in": True,  "address": "501, Skyline Towers, Whitefield Main Road, Bengaluru, Karnataka 560066."},
}

def _key():
    k = os.getenv("LEDGER_KEY")
    if not k:
        k = Fernet.generate_key().decode()
        with open(".env", "a") as f:
            f.write(f"\nLEDGER_KEY={k}\n")
        os.environ["LEDGER_KEY"] = k
    return k.encode()

class Ledger:
    def __init__(self):
        self.fernet = Fernet(_key())
        self.customers, self.entries = {}, []
        self.load()

    def _seed(self):
        self.customers = {n: dict(c) for n, c in SEED.items()}
        self.entries = []

    def load(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, "rb") as f:
                    d = json.loads(self.fernet.decrypt(f.read()))
                self.customers, self.entries = d["customers"], d["entries"]
                # merge any new seed customers without touching existing entries
                for n, c in SEED.items():
                    self.customers.setdefault(n, dict(c))
                return
            except InvalidToken:
                print("Ledger key changed. Old ledger.enc can't be read, starting fresh.")
                os.replace(DATA_FILE, DATA_FILE + ".old")
        self._seed()
        self.save()

    def save(self):
        raw = json.dumps({"customers": self.customers, "entries": self.entries}).encode()
        with open(DATA_FILE, "wb") as f:
            f.write(self.fernet.encrypt(raw))

    def reset(self):
        self._seed()
        self.save()

    def balance(self, name):
        return sum(e["amount"] if e["kind"] == "credit" else -e["amount"]
                   for e in self.entries if e["customer"] == name)

    def add(self, name, amount, kind, day):
        e = {"id": uuid.uuid4().hex[:8], "customer": name, "amount": int(amount),
             "kind": kind, "date": day.isoformat(), "ts": datetime.now().isoformat()}
        self.entries.append(e)
        self.save()
        return e

    def last(self):
        return self.entries[-1] if self.entries else None

    def update_last_amount(self, amount):
        self.entries[-1]["amount"] = int(amount)
        self.save()

    def undo_last(self):
        e = self.entries.pop() if self.entries else None
        self.save()
        return e

    def set_limit(self, name, limit):
        self.customers[name]["limit"] = int(limit)
        self.save()

    def set_optin(self, name, value=True):
        self.customers[name]["opted_in"] = bool(value)
        self.save()

    def today_credit(self):
        today = date.today().isoformat()
        return sum(e["amount"] for e in self.entries
                   if e["kind"] == "credit" and e["date"] == today)

    def snapshot(self):
        return {
            "customers": [{"name": n, "balance": self.balance(n), "limit": c["limit"],
                           "opted_in": c["opted_in"], "address": c.get("address", "")}
                          for n, c in self.customers.items()],
            "entries": self.entries[-50:],
            "today_credit": self.today_credit(),
        }