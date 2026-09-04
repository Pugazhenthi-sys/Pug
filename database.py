import sqlite3
import os
from datetime import date as dt_date

DB_PATH = os.environ.get("SSS_DB_PATH", os.path.join(os.path.dirname(__file__), "billing.db"))
BAG_WEIGHT_KG = 50

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

# ─── FINANCIAL YEAR ──────────────────────────────────────────────────────────
def _get_fy(date_str=None):
    if date_str:
        try:
            parts = str(date_str).split("-")
            day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
        except Exception:
            today = dt_date.today()
            day, month, year = today.day, today.month, today.year
    else:
        today = dt_date.today()
        day, month, year = today.day, today.month, today.year
    fy_start = year if month >= 4 else year - 1
    return f"{fy_start}-{str(fy_start + 1)[-2:]}"

# ─── INIT ────────────────────────────────────────────────────────────────────
def init_db():
    conn = get_conn()

    # Create all tables
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS customers (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bill_counter (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        financial_year  TEXT NOT NULL UNIQUE,
        current_bill_no INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bills (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_no        INTEGER NOT NULL,
        financial_year TEXT NOT NULL DEFAULT '',
        customer_id    INTEGER NOT NULL,
        customer_name  TEXT NOT NULL,
        date           TEXT NOT NULL,
        tons           REAL NOT NULL,
        weight_kg      REAL NOT NULL,
        bags           REAL NOT NULL,
        particular     TEXT NOT NULL,
        rate           REAL NOT NULL,
        purchase_rate  REAL NOT NULL,
        duty_per_kg    REAL NOT NULL,
        vehicle_no     TEXT,
        amount         REAL NOT NULL,
        lorry_rent     REAL NOT NULL,
        final_bill     REAL NOT NULL,
        prev_balance   REAL NOT NULL DEFAULT 0,
        total_balance  REAL NOT NULL DEFAULT 0,
        profit         REAL NOT NULL,
        paid_amount    REAL NOT NULL DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'Pending'
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        type        TEXT NOT NULL CHECK(type IN ('credit','debit')),
        amount      REAL NOT NULL,
        description TEXT,
        date        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT NOT NULL,
        description TEXT NOT NULL,
        amount      REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mills (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mill_transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        mill_id     INTEGER NOT NULL,
        type        TEXT NOT NULL CHECK(type IN ('debit','credit')),
        amount      REAL NOT NULL,
        description TEXT,
        date        TEXT NOT NULL
    );
    """)

    # ── Migrations ────────────────────────────────────────────────────────────
    # bill_counter: add financial_year if missing
    cols = [r[1] for r in conn.execute("PRAGMA table_info(bill_counter)").fetchall()]
    if "financial_year" not in cols:
        old_row = conn.execute("SELECT current_bill_no FROM bill_counter WHERE id=1").fetchone()
        old_no = old_row[0] if old_row else 0
        conn.execute("DROP TABLE bill_counter")
        conn.execute("""
            CREATE TABLE bill_counter (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                financial_year TEXT NOT NULL UNIQUE,
                current_bill_no INTEGER NOT NULL DEFAULT 0
            )
        """)
        if old_no > 0:
            conn.execute(
                "INSERT OR IGNORE INTO bill_counter (financial_year, current_bill_no) VALUES (?,?)",
                (_get_fy(), old_no)
            )

    # bills: add financial_year if missing
    bill_cols = [r[1] for r in conn.execute("PRAGMA table_info(bills)").fetchall()]
    if "financial_year" not in bill_cols:
        conn.execute("ALTER TABLE bills ADD COLUMN financial_year TEXT NOT NULL DEFAULT ''")
        for r in conn.execute("SELECT id, date FROM bills").fetchall():
            conn.execute("UPDATE bills SET financial_year=? WHERE id=?", (_get_fy(r["date"]), r["id"]))

    # Add UNIQUE constraint on bills if missing (recreate table)
    idx_names = [r[1] for r in conn.execute("PRAGMA index_list(bills)").fetchall()]
    has_unique = any("bill_no" in n and "financial" in n for n in idx_names)
    if not has_unique:
        try:
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_no_fy ON bills(bill_no, financial_year)")
        except Exception:
            pass

    conn.commit()

    # ── Backfill mills from existing bills ───────────────────────────────────
    bills = conn.execute("SELECT id, bill_no, financial_year, particular, tons, weight_kg, purchase_rate, date FROM bills").fetchall()
    for b in bills:
        mill_name = (b["particular"] or "").strip()
        if not mill_name:
            continue
        # Create mill if not exists
        mill_row = conn.execute("SELECT id FROM mills WHERE LOWER(name)=LOWER(?)", (mill_name,)).fetchone()
        if mill_row:
            mill_id = mill_row["id"]
        else:
            conn.execute("INSERT INTO mills(name) VALUES(?)", (mill_name,))
            mill_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Create mill transaction if not exists for this bill
        fy = b["financial_year"] or _get_fy(b["date"])
        desc = f"Bill No {b['bill_no']} ({fy})"
        exists = conn.execute(
            "SELECT id FROM mill_transactions WHERE mill_id=? AND description LIKE ?",
            (mill_id, desc + "%")
        ).fetchone()
        if not exists:
            mill_amount = float(b["weight_kg"]) * float(b["purchase_rate"])
            conn.execute(
                "INSERT INTO mill_transactions (mill_id, type, amount, description, date) VALUES (?, 'debit', ?, ?, ?)",
                (mill_id, mill_amount, f"{desc} - {b['tons']}T @ ₹{b['purchase_rate']}/kg", b["date"])
            )

    conn.commit()

    # ── Fix bill paid_amount/status from debit transactions ──────────────────
    for cid_row in conn.execute("SELECT id FROM customers").fetchall():
        cid = cid_row["id"]
        debits = conn.execute(
            "SELECT amount FROM transactions WHERE customer_id=? AND type='debit' ORDER BY id ASC", (cid,)
        ).fetchall()
        total_paid = sum(float(d["amount"]) for d in debits)
        bills_c = conn.execute(
            "SELECT id, final_bill FROM bills WHERE customer_id=? ORDER BY financial_year ASC, bill_no ASC", (cid,)
        ).fetchall()
        remaining = total_paid
        for b in bills_c:
            pay = min(remaining, float(b["final_bill"]))
            remaining = max(0.0, remaining - pay)
            status = "Completed" if pay >= float(b["final_bill"]) else "Pending"
            conn.execute("UPDATE bills SET paid_amount=?, status=? WHERE id=?", (pay, status, b["id"]))

    conn.commit()
    conn.close()

# ─── HELPERS ─────────────────────────────────────────────────────────────────
def _calc(tons, rate, purchase_rate, duty_per_kg):
    weight_kg  = float(tons) * 1000
    bags       = weight_kg / BAG_WEIGHT_KG
    amount     = weight_kg * float(rate)
    lorry_rent = weight_kg * float(duty_per_kg)
    final_bill = amount + lorry_rent
    profit     = weight_kg * (float(rate) - float(purchase_rate))
    return weight_kg, bags, amount, lorry_rent, final_bill, profit

def _get_or_create_customer(conn, name):
    name = name.strip()
    row = conn.execute("SELECT id, name FROM customers WHERE LOWER(name)=LOWER(?)", (name,)).fetchone()
    if row:
        return row["id"], row["name"]
    conn.execute("INSERT INTO customers(name) VALUES(?)", (name,))
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0], name

def _get_balance(conn, customer_id):
    """Net balance = outstanding on pending bills minus any advance (overpayment).
    Positive = customer owes us. Negative = we owe customer (advance paid)."""
    # Total of all debit transactions (payments received from customer)
    debits = conn.execute(
        "SELECT IFNULL(SUM(amount),0) as t FROM transactions WHERE customer_id=? AND type='debit'",
        (customer_id,)
    ).fetchone()["t"]
    # Total bill amount (all bills)
    total_billed = conn.execute(
        "SELECT IFNULL(SUM(final_bill),0) as t FROM bills WHERE customer_id=?",
        (customer_id,)
    ).fetchone()["t"]
    # Net = what they owe us (negative means advance)
    return float(total_billed) - float(debits)

def _next_bill_no(conn, fy):
    conn.execute("INSERT OR IGNORE INTO bill_counter (financial_year, current_bill_no) VALUES (?, 0)", (fy,))
    conn.execute("UPDATE bill_counter SET current_bill_no = current_bill_no + 1 WHERE financial_year=?", (fy,))
    return conn.execute("SELECT current_bill_no FROM bill_counter WHERE financial_year=?", (fy,)).fetchone()[0]

def _row_to_dict(row):
    return dict(row) if row else None

def _rows_to_list(rows):
    return [dict(r) for r in rows]

def _get_or_create_mill(conn, name):
    name = name.strip()
    row = conn.execute("SELECT id, name FROM mills WHERE LOWER(name)=LOWER(?)", (name,)).fetchone()
    if row:
        return row["id"], row["name"]
    conn.execute("INSERT INTO mills(name) VALUES(?)", (name,))
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0], name

def _get_mill_balance(conn, mill_id):
    rows = conn.execute("SELECT type, amount FROM mill_transactions WHERE mill_id=?", (mill_id,)).fetchall()
    return sum(float(r["amount"]) if r["type"] == "debit" else -float(r["amount"]) for r in rows)

# ─── BILLS ───────────────────────────────────────────────────────────────────
def get_bills():
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM bills ORDER BY
        CAST(substr(date,7,4) AS INTEGER) DESC,
        CAST(substr(date,4,2) AS INTEGER) DESC,
        CAST(substr(date,1,2) AS INTEGER) DESC,
        bill_no ASC
    """).fetchall()
    conn.close()
    return _rows_to_list(rows)

def get_current_fy_info():
    fy = _get_fy()
    conn = get_conn()
    row = conn.execute("SELECT current_bill_no FROM bill_counter WHERE financial_year=?", (fy,)).fetchone()
    conn.close()
    return {"financialYear": fy, "nextBillNo": (row["current_bill_no"] + 1) if row else 1}

def create_bill(data):
    conn = get_conn()
    try:
        cid, cname = _get_or_create_customer(conn, data["customerName"])

        # prev_balance: use manual if provided (new customer), else auto-calculate
        # _get_balance returns negative if customer has advance (overpaid before)
        manual_prev = data.get("prevBalance")
        if manual_prev is not None and str(manual_prev).strip() not in ("", "None"):
            try:
                prev_balance = float(manual_prev)
            except:
                prev_balance = _get_balance(conn, cid)
        else:
            prev_balance = _get_balance(conn, cid)
            # prev_balance can be negative (advance) — this correctly reduces total_balance

        fy = _get_fy(data.get("date"))
        manual_no = data.get("billNo")
        if manual_no and int(manual_no) > 0:
            bill_no = int(manual_no)
            conn.execute("INSERT OR IGNORE INTO bill_counter (financial_year, current_bill_no) VALUES (?, 0)", (fy,))
            current = conn.execute("SELECT current_bill_no FROM bill_counter WHERE financial_year=?", (fy,)).fetchone()[0]
            if bill_no > current:
                conn.execute("UPDATE bill_counter SET current_bill_no=? WHERE financial_year=?", (bill_no, fy))
        else:
            bill_no = _next_bill_no(conn, fy)

        weight_kg, bags, amount, lorry_rent, final_bill, profit = _calc(
            data["tons"], data["rate"], data["purchaseRate"], data["dutyPerKg"]
        )
        total_balance = prev_balance + final_bill

        conn.execute("""
            INSERT INTO bills
            (bill_no, financial_year, customer_id, customer_name, date, tons, weight_kg, bags,
             particular, rate, purchase_rate, duty_per_kg, vehicle_no,
             amount, lorry_rent, final_bill, prev_balance, total_balance,
             profit, paid_amount, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'Pending')
        """, (bill_no, fy, cid, cname, data["date"], data["tons"], weight_kg, bags,
              data["particular"], data["rate"], data["purchaseRate"], data["dutyPerKg"],
              data.get("vehicleNo", ""), amount, lorry_rent, final_bill,
              prev_balance, total_balance, profit))

        conn.execute("""
            INSERT INTO transactions (customer_id, type, amount, description, date)
            VALUES (?, 'credit', ?, ?, ?)
        """, (cid, final_bill, f"Bill No {bill_no} ({fy})", data["date"]))

        # Mill Ledger — particular = mill name
        mill_name = str(data.get("particular") or "").strip()
        purchase_rate_val = float(data.get("purchaseRate") or 0)
        if mill_name and purchase_rate_val > 0:
            mid, _ = _get_or_create_mill(conn, mill_name)
            mill_amount = weight_kg * purchase_rate_val
            conn.execute("""
                INSERT INTO mill_transactions (mill_id, type, amount, description, date)
                VALUES (?, 'debit', ?, ?, ?)
            """, (mid, mill_amount,
                  f"Bill No {bill_no} ({fy}) - {data['tons']}T @ ₹{purchase_rate_val}/kg",
                  data["date"]))

        conn.commit()
        bill = _row_to_dict(conn.execute(
            "SELECT * FROM bills WHERE bill_no=? AND financial_year=?", (bill_no, fy)
        ).fetchone())
        return bill
    finally:
        conn.close()

def update_bill(bill_id, data):
    conn = get_conn()
    try:
        old = dict(conn.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone())
        fy = old.get("financial_year") or _get_fy(old["date"])

        conn.execute("DELETE FROM transactions WHERE customer_id=? AND description=?",
                     (old["customer_id"], f"Bill No {old['bill_no']} ({fy})"))

        cid, cname = _get_or_create_customer(conn, data["customerName"])
        weight_kg, bags, amount, lorry_rent, final_bill, profit = _calc(
            data["tons"], data["rate"], data["purchaseRate"], data["dutyPerKg"]
        )
        prev_balance = _get_balance(conn, cid)
        total_balance = prev_balance + final_bill
        paid = float(old["paid_amount"])
        status = "Completed" if paid >= final_bill else "Pending"

        conn.execute("""
            UPDATE bills SET
                customer_id=?, customer_name=?, date=?, tons=?, weight_kg=?, bags=?,
                particular=?, rate=?, purchase_rate=?, duty_per_kg=?, vehicle_no=?,
                amount=?, lorry_rent=?, final_bill=?, prev_balance=?, total_balance=?,
                profit=?, status=?
            WHERE id=?
        """, (cid, cname, data["date"], data["tons"], weight_kg, bags,
              data["particular"], data["rate"], data["purchaseRate"], data["dutyPerKg"],
              data.get("vehicleNo", ""), amount, lorry_rent, final_bill,
              prev_balance, total_balance, profit, status, bill_id))

        conn.execute("""
            INSERT INTO transactions (customer_id, type, amount, description, date)
            VALUES (?, 'credit', ?, ?, ?)
        """, (cid, final_bill, f"Bill No {old['bill_no']} ({fy})", data["date"]))

        # Update mill transaction
        old_mill = str(old.get("particular") or "").strip()
        new_mill  = str(data.get("particular") or "").strip()
        old_fy_desc = f"Bill No {old['bill_no']} ({fy})"
        if old_mill:
            old_mid_row = conn.execute("SELECT id FROM mills WHERE LOWER(name)=LOWER(?)", (old_mill,)).fetchone()
            if old_mid_row:
                conn.execute("DELETE FROM mill_transactions WHERE mill_id=? AND description LIKE ?",
                             (old_mid_row["id"], old_fy_desc + "%"))
        if new_mill and float(data.get("purchaseRate") or 0) > 0:
            mid, _ = _get_or_create_mill(conn, new_mill)
            conn.execute("""
                INSERT INTO mill_transactions (mill_id, type, amount, description, date)
                VALUES (?, 'debit', ?, ?, ?)
            """, (mid, weight_kg * float(data["purchaseRate"]),
                  f"{old_fy_desc} - {data['tons']}T @ ₹{data['purchaseRate']}/kg",
                  data["date"]))

        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone())
    finally:
        conn.close()

def delete_bill(bill_id):
    conn = get_conn()
    try:
        bill = conn.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
        if bill:
            fy = bill["financial_year"] or _get_fy(bill["date"])
            conn.execute("DELETE FROM transactions WHERE customer_id=? AND description=?",
                         (bill["customer_id"], f"Bill No {bill['bill_no']} ({fy})"))
            # Delete mill transaction too
            mill_name = (bill["particular"] or "").strip()
            if mill_name:
                mill_row = conn.execute("SELECT id FROM mills WHERE LOWER(name)=LOWER(?)", (mill_name,)).fetchone()
                if mill_row:
                    conn.execute("DELETE FROM mill_transactions WHERE mill_id=? AND description LIKE ?",
                                 (mill_row["id"], f"Bill No {bill['bill_no']} ({fy})%"))
            conn.execute("DELETE FROM bills WHERE id=?", (bill_id,))
            conn.commit()
    finally:
        conn.close()

# ─── CUSTOMERS ───────────────────────────────────────────────────────────────
def get_customers_with_balance():
    conn = get_conn()
    customers = _rows_to_list(conn.execute("SELECT * FROM customers ORDER BY name ASC").fetchall())
    for c in customers:
        c["balance"] = _get_balance(conn, c["id"])
    conn.close()
    return customers

def get_transactions(customer_id):
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM transactions WHERE customer_id=? ORDER BY
        CAST(substr(date,7,4) AS INTEGER) ASC,
        CAST(substr(date,4,2) AS INTEGER) ASC,
        CAST(substr(date,1,2) AS INTEGER) ASC,
        id ASC
    """, (customer_id,)).fetchall()
    conn.close()
    return _rows_to_list(rows)

def get_customer_bills(customer_id):
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM bills WHERE customer_id=? ORDER BY
        CAST(substr(date,7,4) AS INTEGER) DESC,
        CAST(substr(date,4,2) AS INTEGER) DESC,
        CAST(substr(date,1,2) AS INTEGER) DESC,
        bill_no ASC
    """, (customer_id,)).fetchall()
    conn.close()
    return _rows_to_list(rows)

def sync_bill_payments(conn, customer_id):
    """Apply all payments FIFO across bills. Advance = overpayment carried forward."""
    conn.execute("UPDATE bills SET paid_amount=0, status='Pending' WHERE customer_id=?", (customer_id,))
    debits = conn.execute(
        "SELECT amount FROM transactions WHERE customer_id=? AND type='debit' ORDER BY id ASC",
        (customer_id,)
    ).fetchall()
    total_paid = sum(float(d["amount"]) for d in debits)
    bills = conn.execute(
        "SELECT id, final_bill FROM bills WHERE customer_id=? ORDER BY financial_year ASC, bill_no ASC",
        (customer_id,)
    ).fetchall()
    remaining = total_paid
    for b in bills:
        if remaining <= 0:
            break
        pay = min(remaining, float(b["final_bill"]))
        remaining -= pay
        conn.execute("UPDATE bills SET paid_amount=?, status=? WHERE id=?",
                     (pay, "Completed" if pay >= float(b["final_bill"]) else "Pending", b["id"]))
    # remaining > 0 means advance — stored implicitly via _get_balance calculation


def record_payment(data):
    conn = get_conn()
    try:
        cid = data["customerId"]
        conn.execute("""
            INSERT INTO transactions (customer_id, type, amount, description, date)
            VALUES (?, 'debit', ?, ?, ?)
        """, (cid, float(data["amount"]), data["description"], data["date"]))
        sync_bill_payments(conn, cid)
        conn.commit()
    finally:
        conn.close()

# ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
def update_transaction(txn_id, data):
    conn = get_conn()
    try:
        row = conn.execute("SELECT customer_id FROM transactions WHERE id=?", (txn_id,)).fetchone()
        conn.execute("""
            UPDATE transactions SET amount=?, description=?, date=?, type=? WHERE id=?
        """, (float(data["amount"]), data["description"], data["date"], data["type"], txn_id))
        if row:
            sync_bill_payments(conn, row["customer_id"])
        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM transactions WHERE id=?", (txn_id,)).fetchone())
    finally:
        conn.close()

def delete_transaction(txn_id):
    conn = get_conn()
    try:
        row = conn.execute("SELECT customer_id FROM transactions WHERE id=?", (txn_id,)).fetchone()
        conn.execute("DELETE FROM transactions WHERE id=?", (txn_id,))
        if row:
            sync_bill_payments(conn, row["customer_id"])
        conn.commit()
    finally:
        conn.close()

# ─── EXPENSES ────────────────────────────────────────────────────────────────
def get_expenses():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM expenses ORDER BY id DESC").fetchall()
    conn.close()
    return _rows_to_list(rows)

def create_expense(data):
    conn = get_conn()
    conn.execute("INSERT INTO expenses(date, description, amount) VALUES(?,?,?)",
                 (data["date"], data["description"], data["amount"]))
    conn.commit()
    row = conn.execute("SELECT * FROM expenses WHERE id=last_insert_rowid()").fetchone()
    conn.close()
    return _row_to_dict(row)

def delete_expense(expense_id):
    conn = get_conn()
    conn.execute("DELETE FROM expenses WHERE id=?", (expense_id,))
    conn.commit()
    conn.close()

# ─── DASHBOARD ───────────────────────────────────────────────────────────────
def get_dashboard_data():
    conn = get_conn()
    total_bills     = conn.execute("SELECT COUNT(*) as n FROM bills").fetchone()["n"]
    total_customers = conn.execute("SELECT COUNT(*) as n FROM customers").fetchone()["n"]
    total_sales     = conn.execute("SELECT IFNULL(SUM(final_bill),0) as n FROM bills").fetchone()["n"]
    realized_profit = conn.execute("SELECT IFNULL(SUM(profit),0) as n FROM bills WHERE status='Completed'").fetchone()["n"]
    pending_profit  = conn.execute("SELECT IFNULL(SUM(profit),0) as n FROM bills WHERE status='Pending'").fetchone()["n"]
    total_expenses  = conn.execute("SELECT IFNULL(SUM(amount),0) as n FROM expenses").fetchone()["n"]
    # Outstanding = sum of what customers owe us (exclude advances)
    all_customers = conn.execute("SELECT id FROM customers").fetchall()
    total_outstanding = sum(
        max(0, _get_balance(conn, c["id"])) for c in all_customers
    )

    # Outstanding per customer = total billed - total paid (negative = advance)
    customers_raw = _rows_to_list(conn.execute("SELECT id, name FROM customers").fetchall())
    outstandings = []
    for c in customers_raw:
        bal = _get_balance(conn, c["id"])
        if bal != 0:
            outstandings.append({"name": c["name"], "balance": bal, "isAdvance": bal < 0})
    outstandings.sort(key=lambda x: abs(x["balance"]), reverse=True)

    # Monthly profit — group by MM-YYYY sorted properly
    monthly = _rows_to_list(conn.execute("""
        SELECT substr(date,4,2)||'-'||substr(date,7,4) as month, SUM(profit) as profit
        FROM bills GROUP BY substr(date,4,2)||'-'||substr(date,7,4)
        ORDER BY CAST(substr(date,7,4) AS INTEGER) ASC,
                 CAST(substr(date,4,2) AS INTEGER) ASC
    """).fetchall())

    top_customers = _rows_to_list(conn.execute("""
        SELECT customer_name as name, SUM(final_bill) as sales
        FROM bills GROUP BY customer_name ORDER BY sales DESC LIMIT 5
    """).fetchall())

    conn.close()
    return {
        "totalBills": total_bills, "totalCustomers": total_customers,
        "totalSales": total_sales, "totalProfit": realized_profit + pending_profit,
        "realizedProfit": realized_profit, "pendingProfit": pending_profit,
        "totalExpenses": total_expenses, "totalOutstanding": total_outstanding,
        "outstandings": outstandings, "monthlyProfit": monthly, "topCustomers": top_customers,
    }

# ─── REPORTS ─────────────────────────────────────────────────────────────────
def get_sales_report():
    conn = get_conn()
    bills = _rows_to_list(conn.execute("""
        SELECT * FROM bills ORDER BY
        CAST(substr(date,7,4) AS INTEGER) ASC,
        CAST(substr(date,4,2) AS INTEGER) ASC,
        bill_no ASC
    """).fetchall())
    totals = {
        "totalBills": len(bills),
        "totalSales": sum(b["final_bill"] for b in bills),
        "totalProfit": sum(b["profit"] for b in bills),
        "realizedProfit": sum(b["profit"] for b in bills if b["status"] == "Completed"),
        "pendingProfit": sum(b["profit"] for b in bills if b["status"] == "Pending"),
    }
    conn.close()
    return {"bills": bills, "totals": totals}

def get_income_expense_report():
    conn = get_conn()
    realized_profit = conn.execute("SELECT IFNULL(SUM(profit),0) as n FROM bills WHERE status='Completed'").fetchone()["n"]
    total_income    = conn.execute("SELECT IFNULL(SUM(final_bill),0) as n FROM bills WHERE status='Completed'").fetchone()["n"]
    expenses = _rows_to_list(conn.execute("SELECT * FROM expenses ORDER BY date ASC").fetchall())
    total_expenses = sum(e["amount"] for e in expenses)
    conn.close()
    return {
        "realizedProfit": realized_profit, "totalIncome": total_income,
        "totalExpenses": total_expenses, "netIncome": total_income - total_expenses,
        "expenses": expenses,
    }

# ─── MILL MANAGEMENT ─────────────────────────────────────────────────────────
def get_mills():
    conn = get_conn()
    mills = _rows_to_list(conn.execute("SELECT * FROM mills ORDER BY name ASC").fetchall())
    for m in mills:
        bal = _get_mill_balance(conn, m["id"])
        m["balance"] = bal
        # Positive = we owe mill, Negative = mill owes us (advance paid)
        m["isAdvance"] = bal < 0
    conn.close()
    return mills

def get_mill_transactions(mill_id):
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM mill_transactions WHERE mill_id=? ORDER BY
        CAST(substr(date,7,4) AS INTEGER) ASC,
        CAST(substr(date,4,2) AS INTEGER) ASC,
        CAST(substr(date,1,2) AS INTEGER) ASC,
        id ASC
    """, (mill_id,)).fetchall()
    conn.close()
    return _rows_to_list(rows)

def add_mill_transaction(data):
    conn = get_conn()
    try:
        conn.execute("""
            INSERT INTO mill_transactions (mill_id, type, amount, description, date)
            VALUES (?, ?, ?, ?, ?)
        """, (data["millId"], data["type"], float(data["amount"]), data["description"], data["date"]))
        conn.commit()
        row = conn.execute("SELECT * FROM mill_transactions WHERE id=last_insert_rowid()").fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()

def update_mill_transaction(txn_id, data):
    conn = get_conn()
    try:
        conn.execute("""
            UPDATE mill_transactions SET amount=?, description=?, date=?, type=? WHERE id=?
        """, (float(data["amount"]), data["description"], data["date"], data["type"], txn_id))
        conn.commit()
        return _row_to_dict(conn.execute("SELECT * FROM mill_transactions WHERE id=?", (txn_id,)).fetchone())
    finally:
        conn.close()

def delete_mill_transaction(txn_id):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM mill_transactions WHERE id=?", (txn_id,))
        conn.commit()
    finally:
        conn.close()
