"""
api.py — FastAPI backend for SSS Billing Desktop App
Serves the React frontend as static files + all API routes.
"""
import os
import sys
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import jwt
import datetime
import database as db

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="SSS Billing")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()

# ── Auth ──────────────────────────────────────────────────────────────────────
SECRET_KEY = "sss_desktop_secret_2024"
ALGORITHM  = "HS256"
CREDENTIALS = {"username": "saravanabhava_traders", "password": "mathi2005*"}
security = HTTPBearer()

def create_token():
    payload = {
        "sub": "admin",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=30)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(cred: HTTPAuthorizationCredentials = Depends(security)):
    try:
        jwt.decode(cred.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# ── Models ────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class BillCreate(BaseModel):
    customerName: str
    date: str
    tons: float
    particular: str
    rate: float
    purchaseRate: float
    dutyPerKg: float
    vehicleNo: Optional[str] = ""
    billNo: Optional[int] = None
    prevBalance: Optional[float] = 0.0

class BillUpdate(BaseModel):
    customerName: str
    date: str
    tons: float
    particular: str
    rate: float
    purchaseRate: float
    dutyPerKg: float
    vehicleNo: Optional[str] = ""

class PaymentCreate(BaseModel):
    customerId: int
    customerName: str
    amount: float
    description: str
    date: str

class ExpenseCreate(BaseModel):
    date: str
    description: str
    amount: float

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}

# ── Auth routes ───────────────────────────────────────────────────────────────
@app.post("/api/login")
def login(req: LoginRequest):
    if req.username != CREDENTIALS["username"] or req.password != CREDENTIALS["password"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token()}

# ── Bill routes ───────────────────────────────────────────────────────────────
@app.get("/api/bills")
def get_bills(_=Depends(verify_token)):
    return db.get_bills()

@app.get("/api/fy-info")
def get_fy_info(_=Depends(verify_token)):
    return db.get_current_fy_info()

@app.post("/api/bills")
def create_bill(bill: BillCreate, _=Depends(verify_token)):
    return db.create_bill(bill.dict())

@app.put("/api/bills/{bill_id}")
def update_bill(bill_id: int, bill: BillUpdate, _=Depends(verify_token)):
    result = db.update_bill(bill_id, bill.dict())
    if not result:
        raise HTTPException(status_code=404, detail="Bill not found")
    return result

@app.delete("/api/bills/{bill_id}")
def delete_bill(bill_id: int, _=Depends(verify_token)):
    db.delete_bill(bill_id)
    return {"ok": True}

# ── Customer routes ───────────────────────────────────────────────────────────
@app.get("/api/customers")
def get_customers(_=Depends(verify_token)):
    return db.get_customers_with_balance()

@app.get("/api/customers/{customer_id}/transactions")
def get_transactions(customer_id: int, _=Depends(verify_token)):
    return db.get_transactions(customer_id)

class TransactionUpdate(BaseModel):
    amount: float
    description: str
    date: str
    type: str

@app.put("/api/transactions/{txn_id}")
def update_transaction(txn_id: int, txn: TransactionUpdate, _=Depends(verify_token)):
    return db.update_transaction(txn_id, txn.dict())

@app.delete("/api/transactions/{txn_id}")
def delete_transaction(txn_id: int, _=Depends(verify_token)):
    db.delete_transaction(txn_id)
    return {"ok": True}

@app.get("/api/customers/{customer_id}/bills")
def get_customer_bills(customer_id: int, _=Depends(verify_token)):
    return db.get_customer_bills(customer_id)

@app.post("/api/payments")
def record_payment(payment: PaymentCreate, _=Depends(verify_token)):
    db.record_payment(payment.dict())
    return {"ok": True}

# ── Expense routes ────────────────────────────────────────────────────────────
@app.get("/api/expenses")
def get_expenses(_=Depends(verify_token)):
    return db.get_expenses()

@app.post("/api/expenses")
def create_expense(expense: ExpenseCreate, _=Depends(verify_token)):
    return db.create_expense(expense.dict())

@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int, _=Depends(verify_token)):
    db.delete_expense(expense_id)
    return {"ok": True}

# ── Dashboard & Reports ───────────────────────────────────────────────────────
@app.get("/api/dashboard")
def get_dashboard(_=Depends(verify_token)):
    return db.get_dashboard_data()

@app.get("/api/reports/sales")
def sales_report(_=Depends(verify_token)):
    return db.get_sales_report()

@app.get("/api/reports/income-expense")
def income_expense_report(_=Depends(verify_token)):
    return db.get_income_expense_report()

# ── Serve React frontend (static files) ──────────────────────────────────────
def get_frontend_dir():
    """Find the built frontend — works in dev and in PyInstaller bundle."""
    if getattr(sys, 'frozen', False):
        return os.path.join(sys._MEIPASS, "frontend_dist")
    else:
        # Dev: look for dist relative to app/ folder
        here = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(here, "..", "frontend", "dist")

# ── Mill Management routes ────────────────────────────────────────────────────
class MillTxnCreate(BaseModel):
    millId: int
    type: str
    amount: float
    description: str
    date: str

class MillTxnUpdate(BaseModel):
    type: str
    amount: float
    description: str
    date: str

@app.get("/api/mills")
def get_mills(_=Depends(verify_token)):
    return db.get_mills()

@app.get("/api/mills/{mill_id}/transactions")
def get_mill_transactions(mill_id: int, _=Depends(verify_token)):
    return db.get_mill_transactions(mill_id)

@app.post("/api/mill-transactions")
def add_mill_transaction(txn: MillTxnCreate, _=Depends(verify_token)):
    return db.add_mill_transaction(txn.dict())

@app.put("/api/mill-transactions/{txn_id}")
def update_mill_transaction(txn_id: int, txn: MillTxnUpdate, _=Depends(verify_token)):
    return db.update_mill_transaction(txn_id, txn.dict())

@app.delete("/api/mill-transactions/{txn_id}")
def delete_mill_transaction(txn_id: int, _=Depends(verify_token)):
    db.delete_mill_transaction(txn_id)
    return {"ok": True}

frontend_dir = get_frontend_dir()

if os.path.isdir(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # For any non-API route, serve the React app
        file_path = os.path.join(frontend_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dir, "index.html"))