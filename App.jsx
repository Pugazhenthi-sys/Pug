import { useState, useEffect, useRef } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const BAG_WEIGHT_KG = 50;

// Normalize API (snake_case) or in-memory (camelCase) bill to one consistent shape
function nb(bill) {
  if (!bill) return {};
  const wkg  = bill.weight_kg     ?? bill.weightKg     ?? (bill.tons * 1000) ?? 0;
  const fb   = bill.final_bill    ?? bill.finalBill    ?? 0;
  const paid = bill.paid_amount   ?? bill.paidAmount   ?? 0;
  return {
    id:           bill.id,
    billNo:       bill.bill_no        ?? bill.billNo       ?? 0,
    customerName: bill.customer_name  ?? bill.customerName ?? "",
    date:         bill.date           ?? "",
    tons:         bill.tons           ?? 0,
    weightKg:     wkg,
    bags:         bill.bags           ?? (wkg / BAG_WEIGHT_KG),
    particular:   bill.particular     ?? "",
    rate:         bill.rate           ?? 0,
    purchaseRate: bill.purchase_rate  ?? bill.purchaseRate ?? 0,
    dutyPerKg:    bill.duty_per_kg    ?? bill.dutyPerKg    ?? 0,
    vehicleNo:    bill.vehicle_no     ?? bill.vehicleNo    ?? "",
    amount:         bill.amount         ?? 0,
    lorryRent:      bill.lorry_rent     ?? bill.lorryRent    ?? 0,
    finalBill:      fb,
    prevBalance:    bill.prev_balance   ?? bill.prevBalance  ?? 0,
    totalBalance:   bill.total_balance  ?? bill.totalBalance ?? 0,
    profit:         bill.profit         ?? 0,
    paidAmount:     paid,
    status:         bill.status         ?? "Pending",
    outstanding:    fb - paid,
    financialYear:  bill.financial_year ?? bill.financialYear ?? "",
  };
}
const COMPANY = {
  name: "SHREE SAI SARAVANABHAVA TRADERS",
  sub: "Rice Merchants",
  gstin: "33BFIPM8973G1Z1",
  phone: "7904434418",
  bank_ac: "614305008545",
  bank_ifsc: "ICICI0006143",
  bank_branch: "ICICI Bank, VELLORE",
  owner: "Mathivanan",
};

// ─── API LAYER ───────────────────────────────────────────────────────────────
let _token = localStorage.getItem("sss_token") || "";

function calcBill({ tons, rate, purchaseRate, dutyPerKg }) {
  const weightKg = tons * 1000;
  const bags = weightKg / BAG_WEIGHT_KG;
  const amount = weightKg * rate;
  const lorryRent = weightKg * dutyPerKg;
  const finalBill = amount + lorryRent;
  const profit = weightKg * (rate - purchaseRate);
  return { weightKg, bags, amount, lorryRent, finalBill, profit };
}

const API_BASE = window.location.port === "5173"
  ? "http://127.0.0.1:18432"   // dev mode
  : "";                          // production: same origin

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { _token = ""; localStorage.removeItem("sss_token"); window.location.reload(); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiLogin(username, password) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  const data = await res.json();
  _token = data.token;
  localStorage.setItem("sss_token", _token);
  return true;
}



function apiLogout() {
  _token = "";
  localStorage.removeItem("sss_token");
}

function isLoggedIn() { return !!_token; }

// ─── PDF GENERATOR ───────────────────────────────────────────────────────────
function generatePDFContent(rawBill) {
  const n = v => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const b = nb(rawBill);
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #000; background: #fff; padding: 28px 36px; }

  /* ── HEADER ── */
  .header { text-align: center; margin-bottom: 6px; }
  .header h1 { font-size: 18px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; }
  .header .sub { font-size: 13px; margin-top: 2px; }
  .header .gstin { font-size: 12px; margin-top: 2px; color: #222; }
  .divider { border: none; border-top: 2px solid #000; margin: 8px 0; }

  /* ── BILL META ── */
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
  .meta-row .label { font-weight: bold; }
  .to-row { font-size: 13px; margin-bottom: 10px; }
  .to-row .label { font-weight: bold; }

  /* ── MAIN TABLE ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  th, td { border: 1px solid #000; padding: 6px 10px; font-size: 13px; }
  thead th { font-weight: bold; text-align: center; background: #f0f0f0; }
  td.num { text-align: right; }
  td.center { text-align: center; }

  /* ── SUMMARY (right-aligned, no outer border) ── */
  .summary-wrap { display: flex; justify-content: flex-end; margin-top: 2px; }
  .summary { width: 300px; border-collapse: collapse; }
  .summary td { border: 1px solid #000; padding: 5px 10px; font-size: 13px; }
  .summary td.s-label { font-weight: bold; width: 170px; }
  .summary td.s-val { text-align: right; }
  .summary tr.total-row td { font-weight: bold; background: #f0f0f0; }

  /* ── FOOTER ── */
  .footer { margin-top: 18px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
  .bank-box { line-height: 1.8; }
  .sig-box { text-align: center; font-size: 13px; }
  .sig-line { margin-top: 4px; font-weight: bold; font-size: 14px; }
  .vehicle-row { margin-top: 10px; font-size: 13px; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <h1>${COMPANY.name}</h1>
  <div class="sub">${COMPANY.sub}</div>
  <div class="gstin">GSTIN: ${COMPANY.gstin} &nbsp;|&nbsp; Phone: ${COMPANY.phone}</div>
</div>
<hr class="divider"/>

<!-- BILL NO & DATE -->
<div class="meta-row">
  <div><span class="label">Bill No:</span> &nbsp;&nbsp;&nbsp;&nbsp; ${b.billNo} &nbsp; <span style="font-size:11px;color:#666;">(FY ${b.financialYear || ""})</span></div>
  <div><span class="label">Date:</span> &nbsp;&nbsp; ${b.date}</div>
</div>

<!-- TO -->
<div class="to-row">
  <span class="label">To:</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${b.customerName}
</div>

<hr class="divider" style="margin-bottom:8px"/>

<!-- MAIN TABLE -->
<table>
  <thead>
    <tr>
      <th>Bags (${BAG_WEIGHT_KG}.0kg)</th>
      <th>Particular</th>
      <th>Qty (kg)</th>
      <th>Rate</th>
      <th>Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="center">${b.bags}</td>
      <td>${b.particular}</td>
      <td class="num">${n(b.weightKg)}</td>
      <td class="num">${b.rate}</td>
      <td class="num">${n(b.amount)}</td>
    </tr>
    <!-- empty rows to match Excel spacing -->
    <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>

<!-- SUMMARY -->
<div class="summary-wrap">
  <table class="summary">
    <tr>
      <td class="s-label">Previous Balance:</td>
      <td class="s-val">${n(b.prevBalance)}</td>
    </tr>
    <tr>
      <td class="s-label">Lorry Rent:</td>
      <td class="s-val">${n(b.lorryRent)}</td>
    </tr>
    <tr>
      <td class="s-label">Final Bill:</td>
      <td class="s-val">${n(b.finalBill)}</td>
    </tr>
    <tr class="total-row">
      <td class="s-label">Total Balance:</td>
      <td class="s-val">${n(b.totalBalance)}</td>
    </tr>
  </table>
</div>

<!-- FOOTER -->
<div class="footer">
  <div class="bank-box">
    A/c No: ${COMPANY.bank_ac}<br>
    IFSC: ${COMPANY.bank_ifsc}<br>
    BRANCH: ${COMPANY.bank_branch}
  </div>
  <div class="sig-box">
    <div style="font-size:11px;color:#555;">Authorized Signature</div>
    <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAImBTkDASIAAhEBAxEB/8QAHgABAAICAwEBAQAAAAAAAAAAAAgJBQcBBAYDAgr/xABKEAEAAQMEAAQDBgMEBgYJBQAAAQIDBAUGBxEIEiExCRNBFCJRYXGBMkKRFSNSoSQzYnKCwRYXJVNjsRg0Q0SSk6Kywhl0o6W0/8QAHAEBAAIDAQEBAAAAAAAAAAAAAAQFAwYHAgEI/8QAPBEBAAEDAgQCBwUGBgMBAAAAAAECAwQFEQYSITFBUQcTYXGBkaEUIjLB8CNCUrHR4RUWJDNi8UNykqL/2gAMAwEAAhEDEQA/ALUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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" style="height:58px;width:auto;display:block;margin:0 auto;" />
    <div class="sig-line">${COMPANY.owner}</div>
  </div>
</div>

<!-- VEHICLE -->
<div class="vehicle-row">
  <strong>VEHICLE NO:</strong> &nbsp; ${b.vehicleNo || "nil"}
</div>

</body>
</html>`;
}

function printBill(bill) { showReportPreview(generatePDFContent(bill)); }

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = {
  bill: "🧾", dashboard: "📊", customers: "👥", expenses: "💸",
  reports: "📋", logout: "🚪", add: "➕", edit: "✏️", del: "🗑️",
  print: "🖨️", search: "🔍", money: "₹", check: "✅", clock: "🕐",
  back: "←", eye: "👁", close: "✕", pay: "💳", filter: "⚡",
};

// ─── THEME ───────────────────────────────────────────────────────────────────
const T = {
  bg: "#0f1117",
  surface: "#1a1d27",
  surfaceHigh: "#22263a",
  border: "#2e3248",
  green: "#22c55e",
  greenDark: "#16a34a",
  greenGlow: "rgba(34,197,94,0.15)",
  text: "#f0f4ff",
  textMuted: "#8b92b0",
  textDim: "#5a6080",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
  card: "#1e2235",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; color: ${T.text}; font-family: 'Inter', sans-serif; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: ${T.surface}; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
  input, select, textarea { outline: none; }
  button { cursor: pointer; border: none; outline: none; }
  .fade-in { animation: fadeIn 0.25s ease; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .slide-in { animation: slideIn 0.3s ease; }
  @keyframes slideIn { from { opacity:0; transform:translateX(-16px); } to { opacity:1; transform:translateX(0); } }
`;

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────
function Btn({ onClick, children, variant = "primary", size = "md", style: s = {}, disabled }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif",
    fontWeight: 600, borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
    transition: "all .18s", border: "none", opacity: disabled ? 0.5 : 1,
    fontSize: size === "sm" ? 12 : size === "lg" ? 15 : 13,
    padding: size === "sm" ? "6px 12px" : size === "lg" ? "13px 28px" : "9px 18px",
  };
  const vars = {
    primary: { background: T.green, color: "#000" },
    danger: { background: T.red, color: "#fff" },
    ghost: { background: "transparent", color: T.textMuted, border: `1px solid ${T.border}` },
    amber: { background: T.amber, color: "#000" },
    blue: { background: T.blue, color: "#fff" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...vars[variant], ...s }}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", step, min, required, style: s = {} }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 12, color: T.textMuted, fontWeight: 500, letterSpacing: ".4px" }}>{label}{required && <span style={{ color: T.red }}> *</span>}</label>}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} step={step} min={min}
        style={{
          background: T.surfaceHigh, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: "10px 14px", color: T.text, fontSize: 14, width: "100%",
          transition: "border .15s", ...s
        }}
        onFocus={e => e.target.style.borderColor = T.green}
        onBlur={e => e.target.style.borderColor = T.border}
      />
    </div>
  );
}

// ─── DATE PICKER ─────────────────────────────────────────────────────────────
function DatePicker({ label, value, onChange, required }) {
  // value is DD-MM-YYYY, we convert to/from YYYY-MM-DD for the native picker
  const toNative = v => {
    if (!v) return "";
    const p = v.split("-");
    if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1]}-${p[0]}`; // DD-MM-YYYY → YYYY-MM-DD
    return v;
  };
  const fromNative = v => {
    if (!v) return "";
    const p = v.split("-");
    if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`; // YYYY-MM-DD → DD-MM-YYYY
    return v;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{ fontSize: 12, color: T.textMuted, fontWeight: 500, letterSpacing: ".4px" }}>
          {label}{required && <span style={{ color: T.red }}> *</span>}
        </label>
      )}
      <input
        type="date"
        value={toNative(value)}
        onChange={e => onChange(fromNative(e.target.value))}
        style={{
          background: T.surfaceHigh, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: "10px 14px", color: T.text, fontSize: 14, width: "100%",
          transition: "border .15s", colorScheme: "dark",
        }}
        onFocus={e => e.target.style.borderColor = T.green}
        onBlur={e => e.target.style.borderColor = T.border}
      />
    </div>
  );
}

function Card({ children, style: s = {} }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: 20, ...s
    }}>
      {children}
    </div>
  );
}

function Badge({ label, type = "pending" }) {
  const colors = {
    pending: { bg: "rgba(245,158,11,.15)", color: T.amber },
    completed: { bg: "rgba(34,197,94,.15)", color: T.green },
    info: { bg: "rgba(59,130,246,.15)", color: T.blue },
  };
  return (
    <span style={{
      background: colors[type].bg, color: colors[type].color,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    }}>{label}</span>
  );
}

function Modal({ open, onClose, title, children, width = 560 }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fade-in" style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16,
        width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: `1px solid ${T.border}` }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 18, cursor: "pointer" }}>{Icon.close}</button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 500, letterSpacing: ".5px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || T.green, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
    </Card>
  );
}

function fmt(n) { return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── BILL FORM ────────────────────────────────────────────────────────────────
function BillForm({ initial = {}, onSave, onCancel, title = "Generate Bill" }) {
  const isEdit = !!initial.billNo;
  const [f, setF] = useState({
    billNo: initial.billNo || "",
    customerName: initial.customerName || "",
    date: initial.date || (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`; })(),
    tons: initial.tons || "",
    particular: initial.particular || "",
    rate: initial.rate || "",
    purchaseRate: initial.purchaseRate || initial.purchase_rate || "",
    dutyPerKg: initial.dutyPerKg || initial.duty_per_kg || "",
    vehicleNo: initial.vehicleNo || initial.vehicle_no || "",
    prevBalance: "",
  });
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState("");
  const [customers, setCustomers] = useState([]);
  const [fyInfo, setFyInfo] = useState(null);

  const [allCustomers, setAllCustomers] = useState([]);
  useEffect(() => {
    api("GET", "/customers").then(list => {
      setAllCustomers(list);
      setCustomers(list.map(c => c.name));
    }).catch(() => {});
    if (!isEdit) {
      api("GET", "/fy-info").then(info => {
        setFyInfo(info);
        setF(p => p.billNo ? p : { ...p, billNo: String(info.nextBillNo) });
      }).catch(() => {});
    }
  }, []);

  // Check if customer is new when name is typed
  useEffect(() => {
    if (!f.customerName.trim() || isEdit) { setIsNewCustomer(false); return; }
    const match = allCustomers.find(c => c.name.toLowerCase() === f.customerName.trim().toLowerCase());
    if (!match) {
      setIsNewCustomer(true);
    } else {
      setIsNewCustomer(false);
      setF(p => ({ ...p, prevBalance: "" }));
    }
  }, [f.customerName]);

  // Recompute FY label whenever date changes
  function computeFY(dateStr) {
    try {
      const parts = dateStr.split("-");
      const month = parseInt(parts[1]);
      const year  = parseInt(parts[2]);
      const fyStart = month >= 4 ? year : year - 1;
      return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
    } catch { return fyInfo ? fyInfo.financialYear : ""; }
  }
  const displayFY = f.date ? computeFY(f.date) : (fyInfo ? fyInfo.financialYear : "");

  const up = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const tons = parseFloat(f.tons);
    const rate = parseFloat(f.rate);
    const purchaseRate = parseFloat(f.purchaseRate);
    const dutyPerKg = parseFloat(f.dutyPerKg);
    if (tons > 0 && rate > 0 && purchaseRate > 0 && dutyPerKg >= 0) {
      setPreview(calcBill({ tons, rate, purchaseRate, dutyPerKg }));
    } else setPreview(null);
  }, [f.tons, f.rate, f.purchaseRate, f.dutyPerKg]);

  function submit() {
    if (!f.customerName.trim()) return setErr("Customer name is required.");
    if (!f.date.trim()) return setErr("Date is required.");
    const tons = parseFloat(f.tons);
    if (!tons || tons <= 0) return setErr("Tons must be a positive number.");
    if (!f.particular.trim()) return setErr("Particular (rice brand) is required.");
    const rate = parseFloat(f.rate);
    if (!rate || rate <= 0) return setErr("Selling rate is required.");
    const purchaseRate = parseFloat(f.purchaseRate);
    if (!purchaseRate || purchaseRate <= 0) return setErr("Purchase rate is required.");
    const dutyPerKg = parseFloat(f.dutyPerKg);
    if (isNaN(dutyPerKg) || dutyPerKg < 0) return setErr("Duty per kg is required.");
    setErr("");
    onSave({
      ...f, tons, rate, purchaseRate, dutyPerKg,
      billNo: f.billNo ? parseInt(f.billNo) : undefined,
      prevBalance: f.prevBalance !== "" && f.prevBalance !== null ? parseFloat(f.prevBalance) : null,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.green }}>{title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Bill No — editable only on new bill */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: ".5px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
            Bill No
            {!isEdit && displayFY && (
              <span style={{ background: T.greenGlow, color: T.green, border: `1px solid ${T.green}40`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, letterSpacing: ".3px" }}>
                FY {displayFY}
              </span>
            )}
          </label>
          <input
            type="number" min="1" step="1"
            value={f.billNo}
            onChange={e => up("billNo", e.target.value)}
            disabled={isEdit}
            placeholder="Auto"
            style={{
              background: isEdit ? T.surfaceHigh : T.surface,
              border: `1px solid ${T.border}`, borderRadius: 8,
              padding: "10px 12px", color: isEdit ? T.textDim : T.text,
              fontSize: 14, outline: "none", fontFamily: "JetBrains Mono",
              cursor: isEdit ? "not-allowed" : "text",
            }}
          />
        </div>
        <DatePicker label="Date" value={f.date} onChange={v => up("date", v)} required />

        {/* Customer Name with autocomplete datalist */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: ".5px", textTransform: "uppercase" }}>
            Customer Name <span style={{ color: T.red }}>*</span>
          </label>
          <input
            list="customer-list"
            value={f.customerName}
            onChange={e => up("customerName", e.target.value)}
            placeholder="Type or select customer"
            style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 8, padding: "10px 12px", color: T.text,
              fontSize: 14, outline: "none",
            }}
          />
          <datalist id="customer-list">
            {customers.map(n => <option key={n} value={n} />)}
          </datalist>
        </div>

        <Input label="Tons" type="number" step="0.01" min="0.01" value={f.tons} onChange={v => up("tons", v)} required placeholder="e.g. 2.5" />
        <Input label="Particular (Rice Brand)" value={f.particular} onChange={v => up("particular", v)} required />
        <Input label="Selling Rate per kg (₹)" type="number" step="0.01" value={f.rate} onChange={v => up("rate", v)} required />
        <Input label="Purchase Rate per kg (₹)" type="number" step="0.01" value={f.purchaseRate} onChange={v => up("purchaseRate", v)} required />
        <Input label="Lorry Duty per kg (₹)" type="number" step="0.01" value={f.dutyPerKg} onChange={v => up("dutyPerKg", v)} required />
        <Input label="Vehicle Number" value={f.vehicleNo} onChange={v => up("vehicleNo", v)} />
        {!isEdit && (
          <div style={{ gridColumn: "1 / -1" }}>
            <Input
              label="Previous Balance (₹)"
              type="number" step="0.01" min="0"
              value={f.prevBalance}
              onChange={v => up("prevBalance", v)}
              placeholder="Auto-calculated from outstanding (override if needed)"
            />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              💡 Leave blank to auto-calculate from customer outstanding. Enter a value to override.
            </div>
          </div>
        )}
      </div>

      {preview && (
        <Card style={{ background: T.greenGlow, border: `1px solid ${T.green}30` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.green, marginBottom: 10, letterSpacing: ".5px" }}>LIVE PREVIEW</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              ["Weight", `${preview.weightKg.toLocaleString()} kg`],
              ["Bags (50kg)", preview.bags],
              ["Rice Amount", `₹${fmt(preview.amount)}`],
              ["Lorry Rent", `₹${fmt(preview.lorryRent)}`],
              ["Final Bill", `₹${fmt(preview.finalBill)}`],
              ["Profit", `₹${fmt(preview.profit)}`],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "JetBrains Mono", color: T.text }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {err && <div style={{ color: T.red, fontSize: 13, background: "rgba(239,68,68,.1)", padding: "10px 14px", borderRadius: 8 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn onClick={submit}>{Icon.check} Save Bill</Btn>
      </div>
    </div>
  );
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────
function BillsView({ refresh, setRefresh }) {
  const [bills, setBills] = useState([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [viewBill, setViewBill] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payDesc, setPayDesc] = useState("");
  const [toast, setToast] = useState("");

  async function load() {
    try {
      const b = await api("GET", "/bills");
      setBills(b.map(nb).sort((a, z) => a.billNo - z.billNo));
    } catch(e) { console.error(e); }
  }
  useEffect(() => { load(); }, [refresh]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  async function handleSave(form) {
    try {
      await api("POST", "/bills", form);
      setShowForm(false);
      load();
      setRefresh(r => r + 1);
      showToast("Bill generated successfully!");
    } catch(e) { showToast("Error: " + e.message); }
  }

  async function handleUpdate(form) {
    try {
      await api("PUT", `/bills/${editBill.id}`, form);
      setEditBill(null);
      load();
      setRefresh(r => r + 1);
      showToast("Bill updated successfully!");
    } catch(e) { showToast("Error: " + e.message); }
  }

  async function handleDelete() {
    try {
      await api("DELETE", `/bills/${confirmDel.id}`);
      setConfirmDel(null);
      load();
      setRefresh(r => r + 1);
      showToast("Bill deleted.");
    } catch(e) { showToast("Error: " + e.message); }
  }

  async function handlePay() {
    if (!payAmt || parseFloat(payAmt) <= 0) return;
    try {
      await api("POST", "/payments", {
        customerId: payModal.customer_id ?? payModal.customerId,
        customerName: payModal.customerName ?? payModal.customer_name,
        amount: parseFloat(payAmt),
        description: payDesc || "Payment",
        date: payDate || payModal.date,
      });
      setPayModal(null); setPayAmt(""); setPayDate(""); setPayDesc("");
      load();
      setRefresh(r => r + 1);
      showToast("Payment recorded!");
    } catch(e) { showToast("Error: " + e.message); }
  }

  const filtered = bills.filter(b => {
    const s = filter.toLowerCase();
    const cname = (b.customerName).toLowerCase();
    const match = !s || cname.includes(s) || b.particular.toLowerCase().includes(s) || String(b.billNo).includes(s);
    const st = statusFilter === "all" || b.status.toLowerCase() === statusFilter;
    return match && st;
  });

  return (
    <div className="fade-in">
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, background: T.green, color: "#000", padding: "12px 22px", borderRadius: 10, fontWeight: 600, zIndex: 2000, fontSize: 14 }}>
          {Icon.check} {toast}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{Icon.bill} Bills</h1>
          <div style={{ fontSize: 13, color: T.textMuted, marginTop: 3 }}>{bills.length} total bills</div>
        </div>
        <Btn onClick={() => setShowForm(true)} size="lg">{Icon.add} New Bill</Btn>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textMuted, fontSize: 14 }}>{Icon.search}</span>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search customer, product, bill no…"
            style={{ width: "100%", background: T.surfaceHigh, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px 10px 36px", color: T.text, fontSize: 13 }} />
        </div>
        {["all", "pending", "completed"].map(s => (
          <Btn key={s} variant={statusFilter === s ? "primary" : "ghost"} size="sm" onClick={() => setStatusFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Btn>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <Card style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <div style={{ color: T.textMuted }}>No bills found</div>
          </Card>
        )}
        {filtered.map(b => (
          <Card key={b.id} style={{ padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 16, color: T.green }}>
                  #{String(b.billNo).padStart(3, "0")}
                  {b.financial_year && <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, marginLeft: 5 }}>{b.financial_year}</span>}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{b.customerName || "—"}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{b.particular} · {(b.tons)}T · {b.date}</div>
                </div>
                <Badge label={b.status} type={b.status === "Completed" ? "completed" : "pending"} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ textAlign: "right", marginRight: 8 }}>
                  <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 15 }}>₹{fmt(b.finalBill)}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>Balance: ₹{fmt(b.outstanding)}</div>
                </div>
                <Btn variant="ghost" size="sm" onClick={() => setViewBill(b)}>{Icon.eye}</Btn>
                <Btn variant="ghost" size="sm" onClick={() => printBill(b)}>{Icon.print}</Btn>
                <Btn variant="amber" size="sm" onClick={() => setEditBill(b)}>{Icon.edit}</Btn>
                {b.status !== "Completed" && <Btn variant="blue" size="sm" onClick={() => { setPayModal(b); setPayDate(b.date); }}>{Icon.pay} Pay</Btn>}
                <Btn variant="danger" size="sm" onClick={() => setConfirmDel(b)}>{Icon.del}</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* New Bill Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Bill" width={700}>
        <BillForm onSave={handleSave} onCancel={() => setShowForm(false)} />
      </Modal>

      {/* Edit Bill Modal */}
      <Modal open={!!editBill} onClose={() => setEditBill(null)} title={`Edit Bill #${editBill ? String(editBill?.billNo ?? 0).padStart(3,"0") : ""}`} width={700}>
        {editBill && <BillForm initial={editBill} title="Edit Bill" onSave={handleUpdate} onCancel={() => setEditBill(null)} />}
      </Modal>

      {/* View Bill Modal */}
      <Modal open={!!viewBill} onClose={() => setViewBill(null)} title={`Bill #${viewBill ? String(viewBill?.billNo ?? 0).padStart(3,"0") : ""}`} width={620}>
        {viewBill && (() => {
          const vb = nb(viewBill);
          const { weightKg, bags, amount, lorryRent, finalBill, prevBalance,
                  totalBalance, paidAmount, purchaseRate, dutyPerKg, profit } = vb;

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Header info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  ["Customer", vb.customerName],
                  ["Date", vb.date],
                  ["Particular", vb.particular],
                  ["Vehicle No", vb.vehicleNo || "—"],
                  ["Tons", `${vb.tons} T`],
                  ["Weight", `${Number(weightKg).toLocaleString()} kg`],
                  ["Bags (50kg)", bags],
                  ["Selling Rate", `₹${vb.rate}/kg`],
                  ["Purchase Rate", `₹${purchaseRate}/kg`],
                  ["Lorry Duty", `₹${dutyPerKg}/kg`],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: T.surfaceHigh, padding: "10px 14px", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 3 }}>{k}</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Financials */}
              <Card style={{ background: T.greenGlow, border: `1px solid ${T.green}30` }}>
                {[
                  ["Rice Amount", `₹${fmt(amount)}`],
                  ["Lorry Rent", `₹${fmt(lorryRent)}`],
                  ["Previous Balance", `₹${fmt(prevBalance)}`],
                  ["Final Bill", `₹${fmt(finalBill)}`],
                  ["Total Balance", `₹${fmt(totalBalance)}`],
                  ["Paid Amount", `₹${fmt(paidAmount)}`],
                  ["Outstanding", `₹${fmt(finalBill - paidAmount)}`],
                  ["Profit", `₹${fmt(profit)}`],
                ].map(([k, v], i, arr) => (
                  <div key={k} style={{
                    display: "flex", justifyContent: "space-between", padding: "7px 0",
                    borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none",
                  }}>
                    <span style={{ color: T.textMuted, fontSize: 13 }}>{k}</span>
                    <span style={{ fontWeight: 600, fontFamily: "JetBrains Mono", fontSize: 13, color: k === "Outstanding" && (finalBill - paidAmount) > 0 ? T.amber : k === "Profit" ? T.green : T.text }}>{v}</span>
                  </div>
                ))}
              </Card>

              {/* Status badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Badge label={vb.status} type={vb.status === "Completed" ? "completed" : "pending"} />
                <Btn onClick={() => printBill(vb)} size="lg">
                  {Icon.print} Print / Download PDF
                </Btn>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Confirm Delete */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete Bill?" width={400}>
        <p style={{ color: T.textMuted, marginBottom: 20 }}>
          This will permanently delete Bill #{confirmDel ? String(confirmDel?.billNo ?? 0).padStart(3,"0") : ""} and remove its transaction. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Btn>
          <Btn variant="danger" onClick={handleDelete}>{Icon.del} Delete</Btn>
        </div>
      </Modal>

      {/* Pay Modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Record Payment" width={420}>
        {payModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: T.surfaceHigh, borderRadius: 8, padding: "12px 16px", fontSize: 14 }}>
              Outstanding: <strong style={{ color: T.green }}>₹{fmt(payModal.outstanding ?? 0)}</strong>
            </div>
            <Input label="Amount Paid (₹)" type="number" value={payAmt} onChange={setPayAmt} required />
            <DatePicker label="Date" value={payDate} onChange={setPayDate} required />
            <Input label="Description (optional)" value={payDesc} onChange={setPayDesc} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setPayModal(null)}>Cancel</Btn>
              <Btn onClick={handlePay}>{Icon.check} Save Payment</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
function DashboardView({ refresh }) {
  const [data, setData] = useState({});

  useEffect(() => {
    api("GET", "/dashboard").then(d => {
      const monthly = {};
      (d.monthlyProfit || []).forEach(m => { monthly[m.month] = m.profit; });
      const topCustomers = (d.topCustomers || []).map(c => [c.name, c.sales]);
      setData({
        totalSales: d.totalSales, totalProfit: d.totalProfit,
        pendingProfit: d.pendingProfit, realizedProfit: d.realizedProfit,
        totalExpenses: d.totalExpenses, outstandings: d.outstandings || [],
        totalOutstanding: d.totalOutstanding, monthly, topCustomers,
        bills: d.totalBills, customers: d.totalCustomers,
      });
    }).catch(console.error);
  }, [refresh]);

  const monthEntries = Object.entries(data.monthly || {}).slice(-6);

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>{Icon.dashboard} Dashboard</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat label="Total Bills" value={data.bills || 0} />
        <Stat label="Customers" value={data.customers || 0} />
        <Stat label="Total Sales" value={`₹${fmt(data.totalSales)}`} />
        <Stat label="Outstanding" value={`₹${fmt(data.totalOutstanding)}`} accent={T.amber} />
        <Stat label="Realized Profit" value={`₹${fmt(data.realizedProfit)}`} />
        <Stat label="Pending Profit" value={`₹${fmt(data.pendingProfit)}`} accent={T.amber} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Monthly Profit */}
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>Monthly Profit</div>
          {monthEntries.length === 0 ? (
            <div style={{ color: T.textMuted, textAlign: "center", padding: 20 }}>No data yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {monthEntries.map(([m, p]) => {
                const max = Math.max(...monthEntries.map(e => e[1]));
                const pct = max > 0 ? (p / max) * 100 : 0;
                return (
                  <div key={m}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: T.textMuted }}>{m}</span>
                      <span style={{ fontFamily: "JetBrains Mono", color: T.green }}>₹{fmt(p)}</span>
                    </div>
                    <div style={{ background: T.border, borderRadius: 4, height: 6 }}>
                      <div style={{ background: T.green, width: `${pct}%`, height: "100%", borderRadius: 4, transition: "width .5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Top Customers */}
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>Top Customers by Sales</div>
          {(data.topCustomers || []).length === 0 ? (
            <div style={{ color: T.textMuted, textAlign: "center", padding: 20 }}>No data yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(data.topCustomers || []).map(([name, sales], i) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.surfaceHigh, borderRadius: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: T.greenGlow, color: T.green, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{name}</span>
                  </div>
                  <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, color: T.green }}>₹{fmt(sales)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Pending customers */}
        <Card style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>Outstanding Balances</div>
          {(data.outstandings || []).length === 0 ? (
            <div style={{ color: T.textMuted, textAlign: "center", padding: 20 }}>All cleared! No outstanding balances.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 10 }}>
              {(data.outstandings || []).map(c => (
                <div key={c.name} style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{c.name}</div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 16, fontWeight: 700, color: T.amber }}>₹{fmt(c.balance)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── CUSTOMERS VIEW ───────────────────────────────────────────────────────────
function CustomersView({ refresh, setRefresh }) {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [payAmt, setPayAmt] = useState("");
  const [payDate, setPayDate] = useState(() => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`; });
  const [payDesc, setPayDesc] = useState("");

  const [history, setHistory] = useState([]);
  const [editTxn, setEditTxn] = useState(null);
  const [confirmDelTxn, setConfirmDelTxn] = useState(null);
  const [custBills, setCustBills] = useState([]);

  async function load() {
    try {
      const c = await api("GET", "/customers");
      setCustomers(c);
      if (selected) setSelected(c.find(x => x.id === selected.id) || null);
    } catch(e) { console.error(e); }
  }
  useEffect(() => { load(); }, [refresh]);

  useEffect(() => {
    if (!selected) { setHistory([]); setCustBills([]); return; }
    api("GET", `/customers/${selected.id}/transactions`).then(setHistory).catch(console.error);
    api("GET", `/customers/${selected.id}/bills`).then(b => setCustBills(b.map(nb).sort((a,z) => a.billNo - z.billNo))).catch(console.error);
  }, [selected?.id, refresh]);

  async function handlePay() {
    if (!selected || !payAmt || parseFloat(payAmt) <= 0) return;
    try {
      await api("POST", "/payments", {
        customerId: selected.id, customerName: selected.name,
        amount: parseFloat(payAmt), description: payDesc || "Payment", date: payDate,
      });
      setShowPay(false); setPayAmt(""); setPayDesc("");
      const d = new Date();
      setPayDate(`${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`);
      load();
      setRefresh(r => r + 1);
    } catch(e) { console.error("Payment error:", e); alert("Payment failed: " + e.message); }
  }

  async function handleDeleteTxn(txn) {
    try {
      await api("DELETE", `/transactions/${txn.id}`);
      setConfirmDelTxn(null);
      load(); setRefresh(r => r + 1);
    } catch(e) { console.error(e); }
  }

  async function handleUpdateTxn() {
    if (!editTxn) return;
    try {
      await api("PUT", `/transactions/${editTxn.id}`, {
        amount: parseFloat(editTxn.amount),
        description: editTxn.description,
        date: editTxn.date,
        type: editTxn.type,
      });
      setEditTxn(null);
      load(); setRefresh(r => r + 1);
    } catch(e) { console.error(e); }
  }

  const filtered = customers.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  const history2 = history;
  const bills = custBills;
  const balance = selected ? (selected.balance ?? 0) : 0;

  return (
    <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, minHeight: "70vh" }}>
      {/* Left */}
      <Card style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textMuted, fontSize: 13 }}>{Icon.search}</span>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search…"
            style={{ width: "100%", background: T.surfaceHigh, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px 8px 30px", color: T.text, fontSize: 13 }} />
        </div>
        <div style={{ fontWeight: 600, fontSize: 12, color: T.textMuted, letterSpacing: ".5px", padding: "4px 8px" }}>CUSTOMERS ({filtered.length})</div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map(c => {
            const bal = c.balance ?? 0;
            const isSelected = selected?.id === c.id;
            return (
              <div key={c.id} onClick={() => setSelected(c)} style={{
                padding: "10px 12px", borderRadius: 8, cursor: "pointer", transition: "all .15s",
                background: isSelected ? T.greenGlow : "transparent",
                border: `1px solid ${isSelected ? T.green + "40" : "transparent"}`,
              }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: bal > 0 ? T.amber : T.green, fontFamily: "JetBrains Mono" }}>
                  {(c.balance??0) > 0 ? `₹${fmt(c.balance??0)} due` : (c.balance??0) === 0 ? "Settled" : `+₹${fmt(Math.abs(c.balance??0))}`}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ color: T.textMuted, textAlign: "center", padding: 20, fontSize: 13 }}>No customers found</div>}
        </div>
      </Card>

      {/* Right */}
      {!selected ? (
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: T.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div>Select a customer to view details</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card style={{ padding: "14px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</h2>
                <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{bills.length} bills · {history2.length} transactions</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: T.textMuted }}>BALANCE</div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, fontWeight: 700, color: balance > 0 ? T.amber : T.green }}>₹{fmt(balance)}</div>
                </div>
                <Btn variant="blue" onClick={() => setShowPay(true)}>{Icon.pay} Record Payment</Btn>
              </div>
            </div>
          </Card>

          {/* Bills */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Bills</div>
            {bills.length === 0 ? <div style={{ color: T.textMuted, fontSize: 13 }}>No bills.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bills.map(b => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: T.surfaceHigh, borderRadius: 8 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: T.green, fontSize: 13 }}>#{String(b.billNo).padStart(3,"0")}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{b.particular} · {b.tons}T</div>
                        <div style={{ fontSize: 11, color: T.textMuted }}>{b.date}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Badge label={b.status} type={b.status === "Completed" ? "completed" : "pending"} />
                      <span style={{ fontFamily: "JetBrains Mono", fontSize: 13 }}>₹{fmt(b.finalBill)}</span>
                      <Btn variant="ghost" size="sm" onClick={() => printBill(b)}>{Icon.print}</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Transaction history */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
              <span>Transaction History</span>
              <span style={{ fontSize: 11, color: T.textMuted }}>{history2.length} entries</span>
            </div>
            {history2.length === 0 ? <div style={{ color: T.textMuted, fontSize: 13 }}>No transactions.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 340, overflowY: "auto" }}>
                {history2.map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.surfaceHigh, borderRadius: 8, gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{t.description}</span>
                      <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{t.date}</span>
                    </div>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, fontWeight: 600, color: t.type === "credit" ? T.amber : T.green, whiteSpace: "nowrap" }}>
                      {t.type === "credit" ? "+" : "−"}₹{fmt(t.amount)}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setEditTxn({...t})} style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, color: "#3b82f6", cursor: "pointer", padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>Edit</button>
                      <button onClick={() => setConfirmDelTxn(t)} style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: T.red, cursor: "pointer", padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>Del</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal open={showPay} onClose={() => setShowPay(false)} title="Record Payment" width={400}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {selected && (
            <div style={{ background: T.surfaceHigh, borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
              Outstanding: <strong style={{ color: T.amber }}>₹{fmt(balance)}</strong>
            </div>
          )}
          <Input label="Amount (₹)" type="number" value={payAmt} onChange={setPayAmt} required />
          <DatePicker label="Date" value={payDate} onChange={setPayDate} required />
          <Input label="Description" value={payDesc} onChange={setPayDesc} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowPay(false)}>Cancel</Btn>
            <Btn onClick={handlePay}>{Icon.check} Save</Btn>
          </div>
        </div>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal open={!!editTxn} onClose={() => setEditTxn(null)} title="Edit Transaction" width={400}>
        {editTxn && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: ".5px", textTransform: "uppercase" }}>Type</label>
              <select value={editTxn.type} onChange={e => setEditTxn(p => ({...p, type: e.target.value}))}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", color: T.text, fontSize: 14, outline: "none" }}>
                <option value="credit">Credit (Bill / Charge)</option>
                <option value="debit">Debit (Payment received)</option>
              </select>
            </div>
            <Input label="Amount (₹)" type="number" value={editTxn.amount} onChange={v => setEditTxn(p => ({...p, amount: v}))} required />
            <DatePicker label="Date" value={editTxn.date} onChange={v => setEditTxn(p => ({...p, date: v}))} required />
            <Input label="Description" value={editTxn.description} onChange={v => setEditTxn(p => ({...p, description: v}))} />
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: T.textMuted }}>
              ✅ Bill status and balance will auto-update after saving.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setEditTxn(null)}>Cancel</Btn>
              <Btn onClick={handleUpdateTxn}>{Icon.check} Save Changes</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Transaction Confirm */}
      <Modal open={!!confirmDelTxn} onClose={() => setConfirmDelTxn(null)} title="Delete Transaction" width={380}>
        {confirmDelTxn && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>
              Delete transaction <strong style={{ color: T.amber }}>{confirmDelTxn.description}</strong> of <strong style={{ color: T.red }}>₹{fmt(confirmDelTxn.amount)}</strong>?
              <br /><span style={{ fontSize: 12, color: T.textMuted }}>This will affect the customer balance. Cannot be undone.</span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setConfirmDelTxn(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleDeleteTxn(confirmDelTxn)}>Delete</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── EXPENSES VIEW ────────────────────────────────────────────────────────────
function ExpensesView({ refresh, setRefresh }) {
  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ date: "", description: "", amount: "" });

  async function load() {
    try {
      const e = await api("GET", "/expenses");
      setExpenses(e);
    } catch(err) { console.error(err); }
  }
  useEffect(() => { load(); }, [refresh]);

  async function save() {
    if (!f.date || !f.description || !f.amount) return;
    try {
      await api("POST", "/expenses", { ...f, amount: parseFloat(f.amount) });
      setF({ date: "", description: "", amount: "" });
      setShowForm(false);
      load();
      setRefresh(r => r + 1);
    } catch(err) { console.error(err); }
  }

  async function del(id) {
    try {
      await api("DELETE", `/expenses/${id}`);
      load();
      setRefresh(r => r + 1);
    } catch(err) { console.error(err); }
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{Icon.expenses} Expenses</h1>
          <div style={{ fontSize: 13, color: T.textMuted, marginTop: 3 }}>Total: <span style={{ color: T.red }}>₹{fmt(total)}</span></div>
        </div>
        <Btn onClick={() => setShowForm(true)} size="lg">{Icon.add} Add Expense</Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {expenses.length === 0 && <Card style={{ textAlign: "center", padding: 40, color: T.textMuted }}>No expenses recorded.</Card>}
        {expenses.map(e => (
          <Card key={e.id} style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{e.description}</div>
              <div style={{ fontSize: 12, color: T.textMuted }}>{e.date}</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 15, fontWeight: 700, color: T.red }}>₹{fmt(e.amount)}</span>
              <Btn variant="danger" size="sm" onClick={() => del(e.id)}>{Icon.del}</Btn>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Expense" width={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DatePicker label="Date" value={f.date} onChange={v => setF(p => ({ ...p, date: v }))} required />
          <Input label="Description" value={f.description} onChange={v => setF(p => ({ ...p, description: v }))} required />
          <Input label="Amount (₹)" type="number" value={f.amount} onChange={v => setF(p => ({ ...p, amount: v }))} required />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
            <Btn onClick={save}>{Icon.check} Save</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}


// ─── MILL MANAGEMENT VIEW ────────────────────────────────────────────────────
function MillsView({ refresh, setRefresh }) {
  const todayStr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`; };

  const [mills, setMills] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const [history, setHistory] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ type: "credit", amount: "", description: "", date: todayStr() });
  const [editTxn, setEditTxn] = useState(null);
  const [confirmDelTxn, setConfirmDelTxn] = useState(null);
  const balance = selected ? (selected.balance ?? 0) : 0;

  const [millErr, setMillErr] = useState("");
  function loadMills() {
    setMillErr("");
    api("GET", "/mills").then(list => {
      setMills(list);
      if (selected) {
        const updated = list.find(m => m.id === selected.id);
        if (updated) setSelected(updated);
      }
    }).catch(e => {
      console.error("Mill load error:", e);
      setMillErr(String(e));
      // If token expired, force re-login
      if (String(e).includes("401") || String(e).includes("Unauthorized")) {
        localStorage.removeItem("sss_token");
        window.location.reload();
      }
    });
  }

  function loadTxns(millId) {
    api("GET", `/mills/${millId}/transactions`).then(txns => {
      setHistory(txns);
      setPurchases(txns.filter(t => t.type === "debit" && t.description && t.description.includes("Bill No")));
    }).catch(console.error);
  }

  useEffect(() => { loadMills(); }, [refresh]);
  useEffect(() => {
    if (selected) loadTxns(selected.id);
    else { setHistory([]); setPurchases([]); }
  }, [selected?.id]);

  async function handleAddTxn() {
    if (!addForm.amount || parseFloat(addForm.amount) <= 0) return;
    try {
      await api("POST", "/mill-transactions", {
        millId: selected.id,
        type: addForm.type,
        amount: parseFloat(addForm.amount),
        description: addForm.description || (addForm.type === "credit" ? "Payment to mill" : "Purchase from mill"),
        date: addForm.date,
      });
      setShowAdd(false);
      setAddForm({ type: "credit", amount: "", description: "", date: todayStr() });
      loadMills();
      loadTxns(selected.id);
      setRefresh(r => r + 1);
    } catch(e) { console.error(e); }
  }

  async function handleUpdateTxn() {
    if (!editTxn) return;
    try {
      await api("PUT", `/mill-transactions/${editTxn.id}`, {
        type: editTxn.type,
        amount: parseFloat(editTxn.amount),
        description: editTxn.description,
        date: editTxn.date,
      });
      setEditTxn(null);
      loadMills();
      loadTxns(selected.id);
      setRefresh(r => r + 1);
    } catch(e) { console.error(e); }
  }

  async function handleDeleteTxn(txn) {
    try {
      await api("DELETE", `/mill-transactions/${txn.id}`);
      setConfirmDelTxn(null);
      loadMills();
      loadTxns(selected.id);
      setRefresh(r => r + 1);
    } catch(e) { console.error(e); }
  }

  const filtered = mills.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, minHeight: "70vh" }}>
      {/* Left — Mill List */}
      <Card style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textMuted, fontSize: 13 }}>{Icon.search}</span>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search mills…"
            style={{ width: "100%", background: T.surfaceHigh, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px 8px 30px", color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ fontWeight: 600, fontSize: 12, color: T.textMuted, letterSpacing: ".5px", padding: "4px 8px" }}>MILLS ({filtered.length})</div>
        {millErr && <div style={{ fontSize: 11, color: T.red, padding: "4px 8px", background: "rgba(239,68,68,0.1)", borderRadius: 6 }}>Error: {millErr}</div>}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map(m => {
            const bal = m.balance ?? 0;
            const isSel = selected?.id === m.id;
            return (
              <div key={m.id} onClick={() => setSelected(m)} style={{
                padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                background: isSel ? T.greenGlow : "transparent",
                border: `1px solid ${isSel ? T.green + "40" : "transparent"}`,
              }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: bal > 0 ? T.amber : T.green, fontFamily: "JetBrains Mono" }}>
                  {bal > 0 ? `₹${fmt(bal)} we owe` : "Cleared"}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ color: T.textMuted, textAlign: "center", padding: 20, fontSize: 13 }}>
              {mills.length === 0 ? "Mills appear here automatically when you create bills." : "No mills found"}
            </div>
          )}
        </div>
      </Card>

      {/* Right — Detail */}
      {!selected ? (
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: T.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
            <div>Select a mill to view details</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Header */}
          <Card style={{ padding: "14px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{selected.name}</h2>
                <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>{purchases.length} purchases · {history.length} transactions</div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1 }}>WE OWE</div>
                  <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, fontWeight: 700, color: balance > 0 ? T.amber : T.green }}>
                    ₹{fmt(balance)}
                  </div>
                </div>
                <Btn variant="blue" onClick={() => setShowAdd(true)}>{Icon.pay} Record Transaction</Btn>
              </div>
            </div>
          </Card>

          {/* Purchases */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Purchases</div>
            {purchases.length === 0 ? (
              <div style={{ color: T.textMuted, fontSize: 13 }}>No purchases yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {purchases.map(t => {
                  const tonsM = t.description.match(/(\d+\.?\d*)T/);
                  const rateM = t.description.match(/(\d+\.?\d*)\/kg/);
                  const billM = t.description.match(/Bill No (\d+) \(([^)]+)\)/);
                  return (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: T.surfaceHigh, borderRadius: 8 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        {billM && <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: T.green, fontSize: 13 }}>#{String(billM[1]).padStart(3,"0")}</span>}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {tonsM ? `${tonsM[1]} T` : ""}{rateM ? ` @ ₹${rateM[1]}/kg` : ""}
                          </div>
                          <div style={{ fontSize: 11, color: T.textMuted }}>
                            {t.date}{billM ? ` · FY ${billM[2]}` : ""}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, fontWeight: 600, color: T.amber }}>₹{fmt(t.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Transaction History */}
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
              <span>Transaction History</span>
              <span style={{ fontSize: 11, color: T.textMuted }}>{history.length} entries</span>
            </div>
            {history.length === 0 ? (
              <div style={{ color: T.textMuted, fontSize: 13 }}>No transactions.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 340, overflowY: "auto" }}>
                {history.map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.surfaceHigh, borderRadius: 8, gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{t.description}</span>
                      <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{t.date}</span>
                    </div>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: t.type === "debit" ? T.amber : T.green }}>
                      {t.type === "debit" ? "+" : "−"}₹{fmt(t.amount)}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setEditTxn({...t})}
                        style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 6, color: "#3b82f6", cursor: "pointer", padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>Edit</button>
                      <button onClick={() => setConfirmDelTxn(t)}
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: T.red, cursor: "pointer", padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>Del</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Add Transaction Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Record Transaction" width={400}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {selected && (
            <div style={{ background: T.surfaceHigh, borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
              We owe: <strong style={{ color: T.amber, fontFamily: "JetBrains Mono" }}>₹{fmt(balance)}</strong> to {selected.name}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: ".5px", textTransform: "uppercase" }}>Type</label>
            <select value={addForm.type} onChange={e => setAddForm(p => ({...p, type: e.target.value}))}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", color: T.text, fontSize: 14, outline: "none" }}>
              <option value="credit">Credit — We paid the mill</option>
              <option value="debit">Debit — We owe the mill</option>
            </select>
          </div>
          <Input label="Amount (₹)" type="number" step="0.01" value={addForm.amount} onChange={v => setAddForm(p => ({...p, amount: v}))} required />
          <DatePicker label="Date" value={addForm.date} onChange={v => setAddForm(p => ({...p, date: v}))} required />
          <Input label="Description" value={addForm.description} onChange={v => setAddForm(p => ({...p, description: v}))} placeholder="e.g. Cash, NEFT, UPI" />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={handleAddTxn}>{Icon.check} Save</Btn>
          </div>
        </div>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal open={!!editTxn} onClose={() => setEditTxn(null)} title="Edit Transaction" width={400}>
        {editTxn && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: ".5px", textTransform: "uppercase" }}>Type</label>
              <select value={editTxn.type} onChange={e => setEditTxn(p => ({...p, type: e.target.value}))}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", color: T.text, fontSize: 14, outline: "none" }}>
                <option value="credit">Credit — We paid the mill</option>
                <option value="debit">Debit — We owe the mill</option>
              </select>
            </div>
            <Input label="Amount (₹)" type="number" value={String(editTxn.amount)} onChange={v => setEditTxn(p => ({...p, amount: v}))} required />
            <DatePicker label="Date" value={editTxn.date} onChange={v => setEditTxn(p => ({...p, date: v}))} required />
            <Input label="Description" value={editTxn.description} onChange={v => setEditTxn(p => ({...p, description: v}))} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setEditTxn(null)}>Cancel</Btn>
              <Btn onClick={handleUpdateTxn}>{Icon.check} Save Changes</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!confirmDelTxn} onClose={() => setConfirmDelTxn(null)} title="Delete Transaction" width={380}>
        {confirmDelTxn && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6 }}>
              Delete <strong style={{ color: T.amber }}>{confirmDelTxn.description}</strong> of <strong style={{ color: T.red }}>₹{fmt(confirmDelTxn.amount)}</strong>?
              <br /><span style={{ fontSize: 12, color: T.textMuted }}>Cannot be undone.</span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setConfirmDelTxn(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleDeleteTxn(confirmDelTxn)}>Delete</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


// ─── REPORTS VIEW ─────────────────────────────────────────────────────────────
// ─── REPORT HTML GENERATORS ──────────────────────────────────────────────────
function generateBusinessReportHTML(rawBills, expenses) {
  const bills = rawBills.map(nb);
  const n = v => Number(v||0).toLocaleString("en-IN");

  // Group bills by month+year
  const monthMap = {};
  bills.forEach(b => {
    const parts = b.date.split("-"); // DD-MM-YYYY
    const key = parts.length === 3 ? `${parts[1]}-${parts[2]}` : b.date.slice(3,10);
    const label = parts.length === 3
      ? new Date(`${parts[2]}-${parts[1]}-01`).toLocaleString("en-IN", { month:"long", year:"numeric" }).toUpperCase()
      : key;
    if (!monthMap[key]) monthMap[key] = { label, bills: [] };
    monthMap[key].bills.push(b);
  });

  // Totals
  const totalBills = bills.length;
  const totalCustomers = new Set(bills.map(b => b.customerName)).size;
  const totalBags = bills.reduce((s,b) => s + (b.bags||0), 0);
  const totalWeight = bills.reduce((s,b) => s + (b.weightKg||0), 0);
  const totalSales = bills.reduce((s,b) => s + (b.finalBill||0), 0);
  const totalCost = bills.reduce((s,b) => s + (b.purchaseRate||0)*(b.weightKg||0), 0);
  const realizedProfit = bills.filter(b=>b.status==="Completed").reduce((s,b)=>s+(b.profit||0),0);
  const pendingProfit = bills.filter(b=>b.status!=="Completed").reduce((s,b)=>s+(b.profit||0),0);
  const totalProfit = bills.reduce((s,b)=>s+(b.profit||0),0);
  const outstanding = bills.reduce((s,b)=>s+((b.finalBill||0)-(b.paidAmount||0)),0);

  let monthSections = "";
  Object.values(monthMap).forEach(({ label, bills: mBills }) => {
    const mBags = mBills.reduce((s,b)=>s+(b.bags||0),0);
    const mWeight = mBills.reduce((s,b)=>s+(b.weightKg||0),0);
    const mCost = mBills.reduce((s,b)=>s+(b.purchaseRate||0)*(b.weightKg||0),0);
    const mSales = mBills.reduce((s,b)=>s+(b.finalBill||0),0);
    const mProfit = mBills.reduce((s,b)=>s+(b.profit||0),0);

    const rows = mBills.map(b => {
      const wkg = b.weightKg||0;
      const cost = (b.purchaseRate||0)*wkg;
      const sale = b.finalBill||0;
      return `<tr>
        <td>${b.billNo}</td>
        <td style="font-size:11px;color:#666;">${b.financial_year||b.financialYear||""}</td>
        <td>${b.date}</td>
        <td>${b.customerName}</td>
        <td>${b.particular}</td>
        <td class="num">${n(b.bags||0)}</td>
        <td class="num">${n(wkg)}</td>
        <td class="num">${n(cost)}</td>
        <td class="num">${n(sale)}</td>
        <td class="num">${n(b.profit||0)}</td>
      </tr>`;
    }).join("");

    monthSections += `
      <tr class="month-header"><td colspan="10">${label}</td></tr>
      <tr class="col-header">
        <td>Bill No</td><td>FY</td><td>Date</td><td>Customer</td><td>Product</td>
        <td class="num">Bags</td><td class="num">Weight</td>
        <td class="num">Cost</td><td class="num">Sales</td><td class="num">Profit</td>
      </tr>
      ${rows}
      <tr class="month-total">
        <td colspan="5">MONTH TOTAL - ${label}</td>
        <td class="num">${n(mBags)}</td><td class="num">${n(mWeight)}</td>
        <td class="num">${n(mCost)}</td><td class="num">${n(mSales)}</td><td class="num">${n(mProfit)}</td>
      </tr>
      <tr><td colspan="9" style="height:14px"></td></tr>`;
  });

  // Year totals
  const yearMap = {};
  bills.forEach(b => {
    const parts = b.date.split("-");
    const yr = parts.length===3 ? parts[2] : "—";
    if (!yearMap[yr]) yearMap[yr] = [];
    yearMap[yr].push(b);
  });
  let yearSections = "";
  Object.entries(yearMap).forEach(([yr, yBills]) => {
    const yBags = yBills.reduce((s,b)=>s+(b.bags||0),0);
    const yWeight = yBills.reduce((s,b)=>s+(b.weightKg||0),0);
    const yCost = yBills.reduce((s,b)=>s+(b.purchaseRate||0)*(b.weightKg||0),0);
    const ySales = yBills.reduce((s,b)=>s+(b.finalBill||0),0);
    const yProfit = yBills.reduce((s,b)=>s+(b.profit||0),0);
    yearSections += `
      <tr class="year-header"><td colspan="9">YEAR TOTAL - ${yr}</td></tr>
      <tr class="col-header">
        <td>Bills</td><td></td><td></td><td></td>
        <td class="num">Bags</td><td class="num">Weight</td>
        <td class="num">Cost</td><td class="num">Sales</td><td class="num">Profit</td>
      </tr>
      <tr>
        <td>${yBills.length}</td><td></td><td></td><td></td>
        <td class="num">${n(yBags)}</td><td class="num">${n(yWeight)}</td>
        <td class="num">${n(yCost)}</td><td class="num">${n(ySales)}</td><td class="num">${n(yProfit)}</td>
      </tr>
      <tr><td colspan="9" style="height:14px"></td></tr>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;font-size:12px;color:#000;padding:28px 36px;}
    h1{font-size:16px;font-weight:900;margin-bottom:18px;border-bottom:2px solid #000;padding-bottom:6px;}
    h2{font-size:13px;font-weight:700;margin:18px 0 6px;}
    table{width:100%;border-collapse:collapse;margin-bottom:4px;}
    td,th{padding:4px 8px;font-size:12px;}
    .num{text-align:right;}
    .month-header td{background:#d0e0d0;font-weight:700;font-size:13px;padding:6px 8px;border-top:2px solid #000;}
    .col-header td{font-weight:700;background:#f0f0f0;border-bottom:1px solid #999;}
    .month-total td{font-weight:700;border-top:1px solid #999;background:#f8f8f8;}
    .year-header td{background:#b0c8b0;font-weight:700;font-size:13px;padding:6px 8px;border-top:2px solid #000;margin-top:10px;}
    .summary-section{margin-top:18px;border-top:2px solid #000;padding-top:12px;}
    .summary-table{width:260px;}
    .summary-table td{padding:4px 8px;}
    .summary-table .val{text-align:right;font-weight:600;}
    .summary-table tr.sep td{border-top:1px solid #999;}
    @media print{body{padding:14px 20px;}}
  </style></head><body>
  <h1>BUSINESS TRANSACTION REPORT</h1>
  <table>${monthSections}${yearSections}</table>
  <div class="summary-section">
    <h2>OVERALL BUSINESS SUMMARY</h2>
    <table class="summary-table">
      <tr><td>Total Bills</td><td class="val">${n(totalBills)}</td></tr>
      <tr><td>Total Customers</td><td class="val">${n(totalCustomers)}</td></tr>
      <tr><td>Total Bags</td><td class="val">${n(totalBags)}</td></tr>
      <tr><td>Total Weight</td><td class="val">${n(totalWeight)}</td></tr>
      <tr><td>Total Sales</td><td class="val">${n(totalSales)}</td></tr>
      <tr><td>Realized Profit</td><td class="val">${n(realizedProfit)}</td></tr>
      <tr><td>Pending Profit</td><td class="val">${n(pendingProfit)}</td></tr>
      <tr class="sep"><td>Total Profit</td><td class="val">${n(totalProfit)}</td></tr>
      <tr><td>Overall Outstanding</td><td class="val">${n(outstanding)}</td></tr>
    </table>
  </div>
  </body></html>`;
}

function generateIncomeReportHTML(rawBills, expenses) {
  const bills = rawBills.map(nb);
  const n = v => Number(v||0).toLocaleString("en-IN");
  const realizedProfit = bills.filter(b=>b.status==="Completed").reduce((s,b)=>s+(b.profit||0),0);
  const totalIncome = realizedProfit;
  const totalExpenses = expenses.reduce((s,e)=>s+e.amount,0);
  const netIncome = realizedProfit - totalExpenses;
  const pendingProfit = bills.filter(b=>b.status!=="Completed").reduce((s,b)=>s+(b.profit||0),0);
  const totalProfit = bills.reduce((s,b)=>s+(b.profit||0),0);

  const expRows = expenses.map(e =>
    `<tr><td>${e.date}</td><td>${e.description}</td><td class="num">${n(e.amount)}</td></tr>`
  ).join("") || `<tr><td colspan="3" style="color:#888;text-align:center;padding:8px">No expenses recorded</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;font-size:12px;color:#000;padding:28px 36px;}
    h1{font-size:16px;font-weight:900;margin-bottom:18px;border-bottom:2px solid #000;padding-bottom:6px;}
    h2{font-size:13px;font-weight:700;margin:18px 0 6px;}
    table{border-collapse:collapse;margin-bottom:4px;}
    td{padding:5px 10px;font-size:12px;}
    .num{text-align:right;}
    .val{text-align:right;font-weight:600;min-width:120px;}
    .summary-table{width:300px;}
    .summary-table tr.sep td{border-top:1px solid #999;padding-top:6px;}
    .exp-table{width:400px;}
    .exp-table th{font-weight:700;background:#f0f0f0;padding:5px 10px;text-align:left;border-bottom:1px solid #999;}
    .section{margin-top:22px;border-top:2px solid #000;padding-top:12px;}
    @media print{body{padding:14px 20px;}}
  </style></head><body>
  <h1>INCOME &amp; EXPENSES REPORT</h1>

  <div class="section">
    <h2>OVERALL INCOME &amp; EXPENSES SUMMARY</h2>
    <table class="summary-table">
      <tr><td>Total Income (Profit)</td><td class="val">${n(totalIncome)}</td></tr>
      <tr><td>Total Expenses</td><td class="val">${n(totalExpenses)}</td></tr>
      <tr class="sep"><td>Net Income (Profit - Expenses)</td><td class="val">${n(netIncome)}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>PROFIT SUMMARY</h2>
    <table class="summary-table">
      <tr><td>Realized Profit</td><td class="val">${n(realizedProfit)}</td></tr>
      <tr><td>Pending Profit</td><td class="val">${n(pendingProfit)}</td></tr>
      <tr class="sep"><td>Total Profit</td><td class="val">${n(totalProfit)}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>EXPENSES DETAIL</h2>
    <table class="exp-table">
      <tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr>
      ${expRows}
      <tr style="border-top:1px solid #999;font-weight:700">
        <td colspan="2">TOTAL</td><td class="num">${n(totalExpenses)}</td>
      </tr>
    </table>
  </div>
  </body></html>`;
}

function showReportPreview(html, filename) {
  ["__sss_print_frame","__sss_close_btn","__sss_print_btn"].forEach(id => {
    const el = document.getElementById(id); if (el) el.remove();
  });
  const iframe = document.createElement("iframe");
  iframe.id = "__sss_print_frame";
  iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:9999;background:#fff;";
  document.body.appendChild(iframe);

  const closeBtn = document.createElement("button");
  closeBtn.id = "__sss_close_btn";
  closeBtn.innerText = "✕ Close";
  closeBtn.style.cssText = "position:fixed;top:12px;right:16px;z-index:10000;background:#ef4444;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3);";
  closeBtn.onclick = () => ["__sss_print_frame","__sss_close_btn","__sss_print_btn"].forEach(id => { const el = document.getElementById(id); if(el) el.remove(); });
  document.body.appendChild(closeBtn);

  const printBtn = document.createElement("button");
  printBtn.id = "__sss_print_btn";
  printBtn.innerText = "🖨️ Print / Save PDF";
  printBtn.style.cssText = "position:fixed;top:12px;right:150px;z-index:10000;background:#22c55e;color:#000;border:none;padding:9px 20px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3);";
  printBtn.onclick = () => { const f = document.getElementById("__sss_print_frame"); if(f){ f.contentWindow.focus(); f.contentWindow.print(); } };
  document.body.appendChild(printBtn);

  iframe.srcdoc = html;
}

function ReportsView({ refresh }) {
  const [tab, setTab] = useState("sales");
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    Promise.all([
      api("GET", "/bills"),
      api("GET", "/expenses"),
    ]).then(([b, e]) => {
      setBills(b.map(nb).sort((a,z) => a.billNo - z.billNo));
      setExpenses(e);
    }).catch(console.error);
  }, [refresh]);

  const fv = (b, ...keys) => { for (const k of keys) { if (b[k] !== undefined) return b[k]; } return 0; };
  const totalSales = bills.reduce((s,b) => s + b.finalBill||0, 0);
  const totalProfit = bills.reduce((s,b) => s + (b.profit||0), 0);
  const realizedProfit = bills.filter(b=>b.status==="Completed").reduce((s,b)=>s+(b.profit||0),0);
  const pendingProfit = bills.filter(b=>b.status!=="Completed").reduce((s,b)=>s+(b.profit||0),0);
  const totalExpenses = expenses.reduce((s,e) => s + e.amount, 0);
  const totalIncome = realizedProfit;
  const netIncome = realizedProfit - totalExpenses;
  const totalBags = bills.reduce((s,b)=>s+(b.bags||0),0);
  const totalWeight = bills.reduce((s,b)=>s+b.weightKg||0,0);
  const outstanding = bills.reduce((s,b)=>s+(b.outstanding||0),0);

  return (
    <div className="fade-in">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700 }}>{Icon.reports} Reports</h1>
        <div style={{ display:"flex", gap:10 }}>
          <Btn variant="blue" onClick={() => showReportPreview(generateBusinessReportHTML(bills, expenses), "business-report")}>
            📄 Business Report
          </Btn>
          <Btn variant="ghost" onClick={() => showReportPreview(generateIncomeReportHTML(bills, expenses), "income-report")}>
            📄 Income Report
          </Btn>
        </div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[["sales","Sales Register"],["income","Income & Expenses"]].map(([k,l]) => (
          <Btn key={k} variant={tab===k?"primary":"ghost"} onClick={() => setTab(k)}>{l}</Btn>
        ))}
      </div>

      {tab === "sales" && (
        <div>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:16 }}>
            <Stat label="Total Bills" value={bills.length} />
            <Stat label="Total Bags" value={totalBags} />
            <Stat label="Total Weight" value={`${Number(totalWeight).toLocaleString()} kg`} />
            <Stat label="Total Sales" value={`₹${fmt(totalSales)}`} />
            <Stat label="Realized Profit" value={`₹${fmt(realizedProfit)}`} />
            <Stat label="Pending Profit" value={`₹${fmt(pendingProfit)}`} accent={T.amber} />
            <Stat label="Total Profit" value={`₹${fmt(totalProfit)}`} />
            <Stat label="Outstanding" value={`₹${fmt(outstanding)}`} accent={T.amber} />
          </div>
          <Card>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:T.surfaceHigh }}>
                    {["Bill No","FY","Date","Customer","Product","Bags","Weight (kg)","Cost","Sales","Profit","Status"].map(h => (
                      <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:T.textMuted, fontWeight:600, fontSize:12, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bills.map(b => {
                    const wkg = b.weightKg||0;
                    const fb = b.finalBill||0;
                    const cost = (b.purchaseRate||0)*wkg;
                    return (
                      <tr key={b.id} style={{ borderBottom:`1px solid ${T.border}` }}>
                        <td style={{ padding:"9px 12px", fontFamily:"JetBrains Mono", fontWeight:700, color:T.green }}>#{String(b.billNo).padStart(3,"0")}</td>
                        <td style={{ padding:"9px 12px", fontSize:11, color:T.textMuted }}>{b.financial_year||b.financialYear||""}</td>
                        <td style={{ padding:"9px 12px", color:T.textMuted }}>{b.date}</td>
                        <td style={{ padding:"9px 12px", fontWeight:500 }}>{b.customerName}</td>
                        <td style={{ padding:"9px 12px" }}>{b.particular}</td>
                        <td style={{ padding:"9px 12px", fontFamily:"JetBrains Mono" }}>{b.bags||0}</td>
                        <td style={{ padding:"9px 12px", fontFamily:"JetBrains Mono" }}>{Number(wkg).toLocaleString()}</td>
                        <td style={{ padding:"9px 12px", fontFamily:"JetBrains Mono" }}>₹{fmt(cost)}</td>
                        <td style={{ padding:"9px 12px", fontFamily:"JetBrains Mono" }}>₹{fmt(fb)}</td>
                        <td style={{ padding:"9px 12px", fontFamily:"JetBrains Mono", color:T.green }}>₹{fmt(b.profit||0)}</td>
                        <td style={{ padding:"9px 12px" }}><Badge label={b.status} type={b.status==="Completed"?"completed":"pending"} /></td>
                      </tr>
                    );
                  })}
                  {bills.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign:"center", padding:32, color:T.textMuted }}>No bills yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "income" && (
        <div>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:16 }}>
            <Stat label="Total Income (Profit)" value={`₹${fmt(totalIncome)}`} />
            <Stat label="Total Expenses" value={`₹${fmt(totalExpenses)}`} accent={T.red} />
            <Stat label="Net Income (Profit - Expenses)" value={`₹${fmt(netIncome)}`} accent={netIncome>=0?T.green:T.red} />
            <Stat label="Realized Profit" value={`₹${fmt(realizedProfit)}`} />
            <Stat label="Pending Profit" value={`₹${fmt(pendingProfit)}`} accent={T.amber} />
            <Stat label="Total Profit" value={`₹${fmt(totalProfit)}`} />
          </div>
          <Card>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>Expenses Detail</div>
            {expenses.length === 0
              ? <div style={{ color:T.textMuted, textAlign:"center", padding:20 }}>No expenses recorded.</div>
              : (
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ background:T.surfaceHigh }}>
                      {["Date","Description","Amount"].map(h => (
                        <th key={h} style={{ padding:"9px 12px", textAlign:"left", color:T.textMuted, fontWeight:600, fontSize:12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id} style={{ borderBottom:`1px solid ${T.border}` }}>
                        <td style={{ padding:"9px 12px", color:T.textMuted }}>{e.date}</td>
                        <td style={{ padding:"9px 12px" }}>{e.description}</td>
                        <td style={{ padding:"9px 12px", fontFamily:"JetBrains Mono", color:T.red }}>₹{fmt(e.amount)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop:`2px solid ${T.border}` }}>
                      <td colSpan={2} style={{ padding:"9px 12px", fontWeight:700 }}>TOTAL</td>
                      <td style={{ padding:"9px 12px", fontFamily:"JetBrains Mono", fontWeight:700, color:T.red }}>₹{fmt(totalExpenses)}</td>
                    </tr>
                  </tbody>
                </table>
              )
            }
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginView({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      await apiLogin(user, pass);
      onLogin();
    } catch {
      setErr("Invalid username or password.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `radial-gradient(ellipse at 50% 0%, rgba(34,197,94,.12) 0%, ${T.bg} 70%)`,
    }}>
      <div className="fade-in" style={{ width: "100%", maxWidth: 420, padding: 16 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🌾</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".5px" }}>SHREE SAI SARAVANABHAVA</h1>
          <div style={{ fontSize: 14, color: T.textMuted, marginTop: 4 }}>Rice Traders · Billing System</div>
        </div>

        <Card style={{ padding: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Username" value={user} onChange={setUser} placeholder="admin" required />
            <Input label="Password" type="password" value={pass} onChange={setPass} placeholder="••••••••" required />
            {err && <div style={{ color: T.red, fontSize: 13, background: "rgba(239,68,68,.1)", padding: "10px 14px", borderRadius: 8 }}>{err}</div>}
            <Btn onClick={submit} size="lg" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} disabled={loading}>
              {loading ? "Signing in…" : "Sign In →"}
            </Btn>
          </div>

        </Card>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ current, onChange, onLogout }) {
  const items = [
    ["dashboard", Icon.dashboard, "Dashboard"],
    ["bills", Icon.bill, "Bills"],
    ["customers", Icon.customers, "Customers"],
    ["mills", "🏭", "Mill Management"],
    ["expenses", Icon.expenses, "Expenses"],
    ["reports", Icon.reports, "Reports"],
  ];

  return (
    <div style={{
      width: 220, background: T.surface, borderRight: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column", minHeight: "100vh", padding: "20px 12px",
    }}>
      <div style={{ marginBottom: 28, paddingLeft: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: 1.5, marginBottom: 2 }}>SSS TRADERS</div>
        <div style={{ fontSize: 10, color: T.textDim }}>Billing System v8</div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map(([k, icon, label]) => (
          <div key={k} onClick={() => onChange(k)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            borderRadius: 10, cursor: "pointer", transition: "all .15s",
            background: current === k ? T.greenGlow : "transparent",
            color: current === k ? T.green : T.textMuted,
            fontWeight: current === k ? 600 : 400, fontSize: 14,
            border: `1px solid ${current === k ? T.green + "30" : "transparent"}`,
          }}>
            <span style={{ fontSize: 16 }}>{icon}</span> {label}
          </div>
        ))}
      </div>
      <div onClick={onLogout} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        borderRadius: 10, cursor: "pointer", color: T.textMuted, fontSize: 14,
        transition: "color .15s",
      }} onMouseEnter={e => e.currentTarget.style.color = T.red}
        onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>
        {Icon.logout} Logout
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [view, setView] = useState("dashboard");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    document.body.style.background = T.bg;
    document.body.style.margin = "0";
  }, []);

  if (!loggedIn) return <LoginView onLogin={() => setLoggedIn(true)} />;

  const views = {
    dashboard: <DashboardView refresh={refresh} />,
    bills: <BillsView refresh={refresh} setRefresh={setRefresh} />,
    customers: <CustomersView refresh={refresh} setRefresh={setRefresh} />,
    mills: <MillsView refresh={refresh} setRefresh={setRefresh} />,
    expenses: <ExpensesView refresh={refresh} setRefresh={setRefresh} />,
    reports: <ReportsView refresh={refresh} />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg }}>
      <Sidebar current={view} onChange={setView} onLogout={() => { apiLogout(); setLoggedIn(false); }} />
      <main style={{ flex: 1, padding: 28, overflowY: "auto" }}>
        {views[view]}
      </main>
    </div>
  );
}
