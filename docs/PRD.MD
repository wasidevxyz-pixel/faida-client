# Product Requirements Document (PRD) - Bilal Accounting & Sales (BAS)

## 1. Executive Summary & Core Mission
**Bilal Accounting & Sales (BAS)** is an enterprise-scale, multi-branch, high-throughput Enterprise Resource Planning (ERP) and business automation platform. Tailored specifically for high-frequency retail chains, pharmaceutical dispensaries, multi-category supermarkets, cosmetics wholesalers, and regional distribution warehouses, BAS bridges physical counter-speed operations with rigorous double-entry accounting governance.

The system's mission is to eliminate transaction latency at retail counters and wholesale loading docks while maintaining mathematical ledger precision, multi-branch data isolation, biometric personnel tracking, and real-time mobile executive oversight.

---

## 2. Product Ecosystem Matrix

BAS operates as a unified polyglot monorepo comprising four primary software applications and two auxiliary services:

| Component | Target Environment | Tech Stack | Primary Responsibilities |
| :--- | :--- | :--- | :--- |
| **Main BAS Web ERP** | Central Web & Cloud | Node.js 20+, Express, MongoDB 6+, Mongoose, EJS, Vanilla JS, CSS3 | Central operational hub: Retail POS, Wholesale, Purchasing, Multi-Store Inventory, General Ledgers, HR/Payroll, Tax Compliance, User RBAC |
| **Barcode Print Desktop** | Windows Workstations | C# 12, .NET 8.0-windows, WinForms, Crystal Reports Runtime | Hardware-connected desktop utility generating thermal barcode labels (38x25mm, 50x25mm) and A4 sticker sheets (24/40/65-up) |
| **Biometric Attendance** | Branch Terminals | C# 12, .NET 8.0-windows, WinForms, DigitalPersona U.are.U SDK | Hardware-connected attendance terminal capturing fingerprint punches, matching local templates, and syncing clock-in/out to backend |
| **BAS Mobile Companion** | iOS & Android | React Native 0.73+, Expo SDK 50+/57, Axios, React Navigation | Executive sales dashboard, store-level inventory lookup, camera barcode scanner, and customer receivable telemetry |
| **AI Brain Microservice** | Local Microservice | Python 3.10+, FastAPI, Uvicorn, Ollama / vLLM (Gemma/Llama) | Conversational natural language assistant querying sales trends, inventory stockouts, debtor aging, and ERP screen routing |
| **System CLI Utilities** | DevOps / Maintenance | Node.js Standalone Scripts (`scripts/`) | Targeted invoice and ledger reconciliation, group permission auditing, stock audit fixes, database backup and recovery |

---

## 3. User Personas & Permissions Hierarchy

The platform implements Granular Role-Based Access Control (RBAC) via the `Group` model with over 150 Boolean permission flags:

```
                                  ┌───────────────────────────┐
                                  │   Super Administrator     │ (Global cross-branch access,
                                  └─────────────┬─────────────┘  full system configuration)
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         │                                      │                                      │
┌────────┴─────────────┐              ┌─────────┴────────────┐               ┌─────────┴────────────┐
│   Branch Manager     │              │  Chief Accountant    │               │  Warehouse Manager   │
│ - Counter approvals  │              │ - Financial statements│              │ - Bulk dispatch      │
│ - Closing sheets     │              │ - Cheque clearance   │               │ - Store transfers    │
│ - Stock adjustments  │              │ - Tax certificates   │               │ - Delivery challans  │
└────────┬─────────────┘              └──────────────────────┘               └──────────────────────┘
         │
┌────────┴─────────────┐
│  POS Retail Cashier  │ (High-speed barcode scanning, receipt generation, cash drawer handover)
└──────────────────────┘
```

### Detailed Persona Descriptions:
1. **Super Administrator (Systems Architect & Executive)**:
   - Needs global visibility across all branches, warehouses, and satellite apps.
   - Manages chart of accounts, user groups, tax rules, branch provisioning, and AI provider integration.
2. **Branch Manager / Floor Supervisor**:
   - Oversees daily store operations, approves price overrides, validates shift closing cash sheets, and authorizes damaged stock write-offs.
3. **Retail Cashier**:
   - Requires sub-second UI response times. Works 100% via keyboard shortcuts (`Enter`, `F2`, `F8`, `F9`). Processes cash, card, and credit sales.
4. **Wholesale Operations Manager**:
   - Handles large volume B2B sales invoices, custom price tiers, customer credit limit validation, gate passes, and delivery tracking.
5. **Procurement & Inventory Officer**:
   - Enters vendor purchase bills, inspects Goods Received Notes (GRN), manages return-to-vendor claims, and tracks batch expiry dates.
6. **Financial Controller & Bookkeeper**:
   - Manages Journal Vouchers, Bank Accounts, Post-Dated Cheques (PDC), Withholding Tax (WHT/CPR), and reconciles customer/supplier subsidiary ledgers.
7. **HR & Payroll Executive**:
   - Configures shifts, overtime rules, loan deductions, sales commissions, and generates monthly salary disbursement sheets.
8. **Field Executive / Store Owner (Mobile User)**:
   - Views real-time sales revenue, inspects store stock levels using phone camera barcode scanning, and checks overdue customer balances.

---

## 4. Comprehensive Functional Modules & User Journeys

### 4.1. Point of Sale (POS) & Counter Billing
- **End-to-End Workflow**:
  1. Cashier logs into terminal (`/sales` or `/cash-counter`). System assigns active shift register (`DailyCash`).
  2. Cashier scans barcode. Input auto-detects SKU, fetches product details, increments quantity, and highlights row.
  3. Cashier applies line-item discount or overall bill discount.
  4. Cashier hits `F9` (or `Enter` through footer) to trigger Payment Modal.
  5. Selects tender type: Cash, Bank Card, Customer Card, or Split Tender.
  6. System commits transaction:
     - Creates `Sale` and `SaleItem` records.
     - Decrements stock in the assigned branch store.
     - Generates 80mm ESC/POS thermal receipt.
     - Pops physical cash drawer via printer kick-pulse (`ESC p 0 25 250`).
- **Shift Reconciliation & Closing**:
  - Cashier enters physical cash count in `/closing-sheet`.
  - System compares physical count with calculated total from recorded sales minus expenses.
  - Variance is flagged; Branch Manager signs off.

### 4.2. Wholesale & Distribution Operations (WHSale)
- **End-to-End Workflow**:
  1. Operator opens `/wh-sale`. System creates new draft invoice with unique sequence number (e.g. `INV-WS-2026-0401`).
  2. Selects customer (`WHCustomer`). System displays customer code, current balance, and credit limit.
  3. Operator scans or types barcode/item name:
     - System immediately populates `pcsPrice` (Cost/Trade Price) and `retailPrice` from local cache.
     - Asynchronous validation queries `/api/v1/wh-items/:id` using `AbortController` to guarantee rapid successive scans never overwrite subsequent items.
  4. Operator specifies dispatch store (e.g., *Shop Floor*, *Central Warehouse*, *Godown B*).
  5. Item incentives, line discounts, and tax percentages are calculated automatically.
  6. Operator clicks **Post**:
     - Status changes from `Draft` to `Posted`.
     - Inventory is deducted from selected stores.
     - Creates double-entry record in `whledgers` with `debit: netTotal`.
     - Atomically increments customer's `currentBalance` via `$inc`.
     - Generates printable A4 Delivery Challan and Tax Invoice with customer acknowledgement sections.

### 4.3. Procurement & Vendor Supply Chain (Purchase & WHPurchase)
- **End-to-End Workflow**:
  1. Goods arrive at loading dock accompanied by vendor delivery challan.
  2. Receiving officer opens `/purchases` or `/wh-purchase`.
  3. Selects vendor (`Party` or `WHSupplier`). Enters vendor bill number and date.
  4. Adds items: records quantity received, bonus units, cost price, trade discount, sales tax, and freight surcharge.
  5. System recalculates item average cost and updates last purchase rate in master catalog.
  6. Stock is incremented in target warehouse store.
  7. Ledger entry is created crediting vendor's balance with bill net total.
  8. If vendor is subject to Income Tax withholding, system calculates WHT deduction and prepares CPR tax entry (`SupplierTaxCPR`).

### 4.4. Financial Accounting, Banking & Double-Entry Ledgers
- **Chart of Accounts Hierarchy**:
  - `AccountGroup`: Level 1-2 classifications (Current Assets, Fixed Assets, Current Liabilities, Operating Expenses).
  - `AccountCategory`: Level 3 functional categories (Cash in Hand, Accounts Receivable, Inventory, Bank Accounts).
  - `Account`: Level 4 transactional accounts where debit and credit transactions reside.
- **Subsidiary Ledgers (`WHLedger` & `LedgerEntry`)**:
  - Immutable chronological ledger containing `date`, `refType` (`Sale`, `Purchase`, `Payment`, `SaleReturn`, `Opening`), `refId`, `debit`, `credit`, and `runningBalance`.
  - Customer Balance Rule: `currentBalance = sum(debits) - sum(credits)`.
  - Supplier Balance Rule: `currentBalance = sum(credits) - sum(debits)`.
- **Bank Operations & Cheque Clearing**:
  - Bank Accounts management with branch-specific IBAN and account numbers.
  - Inter-bank fund transfers with automatic debit/credit journal vouchers.
  - Post-Dated Cheque (PDC) lifecycle: Issued/Received -> Pending Cheque Portfolio -> Deposited -> Cleared / Bounced.

### 4.5. Multi-Store Warehouse & Branch Logistics
- **Store Partitioning**: Each physical branch can contain multiple storage locations (e.g. *Main Retail Counter*, *Upper Floor Store*, *Cold Storage*, *Defective Goods*).
- **Inter-Store Stock Movement**:
  - Source store issues Transfer Out voucher; inventory enters transit state.
  - Destination store verifies physical count and issues Transfer In voucher; inventory enters active stock.
- **Periodic Physical Audits (`StockAudit` & `WHStockAudit`)**:
  - Audit team scans shelf barcodes into tablet/desktop session.
  - System flags discrepancies: Physical Count vs System Book Stock.
  - Manager approves automated `StockAdjustment` voucher reconciling variance and posting profit/loss on inventory shrinkage.

### 4.6. Biometric Personnel Tracking & Multi-Tier Payroll
- **Hardware Capture**: Employee places finger on DigitalPersona scanner at branch counter. The terminal matches the fingerprint template locally and pushes `POST /api/attendance/punch` with employee ID, timestamp, and device identifier.
- **Attendance Rules**:
  - Standard work shifts (Morning, Evening, Full Day, Night).
  - Configurable grace periods (e.g., 15 minutes late allowance).
  - Automated calculation of Overtime hours and Short-Time hours.
- **Monthly Salary Computation (`/payroll`)**:
  - Gross Earnings: $\text{Basic Salary} + \text{Allowances} + \text{Overtime Pay} + \text{Sales Commissions}$.
  - Deductions: $\text{Late Penalties} + \text{Short-time Deductions} + \text{Advance Installments} + \text{Income Tax} + \text{Food Allowances}$.
  - Net Payable: Generates salary payment vouchers for cash payment or direct bank transfer.

### 4.7. Desktop Companion Applications
- **Barcode Printing App**:
  - Windows Form application connecting to BAS API (`GET /api/items`).
  - Allows search by SKU, barcode, or product name.
  - Previews Crystal Reports layout and drives thermal barcode sticker printers (Argox, Zebra, TSC) and standard laser A4 sheets.
- **Biometric Attendance Terminal App**:
  - C# WinForms application interfacing directly with physical fingerprint scanners via native DigitalPersona SDK DLLs.
  - Handles employee biometric enrollment and real-time attendance punching.
  - Operates reliably even during intermittent LAN/WAN dropouts.

### 4.8. Mobile Companion App
- **Real-Time Revenue Telemetry**: Displays today's net sales, cash vs credit breakdown, and comparative metrics against yesterday and last week.
- **Mobile Camera Barcode Scanner**: Uses phone camera to instantly scan shelf barcodes, showing real-time price, stock in hand across all stores, and supplier details.
- **Debtor & Creditor Ledger Lookup**: Allows field managers to view customer receivables and payment histories directly on their phones.

### 4.9. AI Business Brain Service
- **Conversational Analytics**: Natural language query engine powered by FastAPI and local LLM (Ollama/vLLM).
- Examples of handled queries:
  - *"Show me top 5 selling cosmetics this month."*
  - *"Which customers have exceeded their credit limits?"*
  - *"Generate a summary of today's gross margin by department."*
- **ERP Navigation Guide**: Responds with deep links to specific BAS ERP screens to help users navigate complex reports.

---

## 5. Non-Functional & Operational Standards

1. **Sub-Second POS Execution**: Barcode input to row rendering must complete in under 50ms. Payment modal to receipt print must complete in under 300ms.
2. **Deterministic Ledger Consistency**: Ledger entries are append-only. Balance calculations must be mathematically provable with zero floating-point rounding errors.
3. **Weekly Price Update Protection**: Item master price adjustments must never retroactively alter historical invoices.
4. **Data Isolation**: Strict branch data filtering must be enforced at the middleware layer.
5. **Continuous Operation**: Standalone desktop apps must provide offline caching mechanisms when server connectivity drops.
