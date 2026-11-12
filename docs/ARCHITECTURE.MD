# System Architecture Document - Bilal Accounting & Sales (BAS)

## 1. Architectural Overview & System Topography

**BAS** is architected as an enterprise distributed polyglot monorepo. It combines a centralized Node.js/MongoDB application server with native Windows C# desktop utilities for specialized hardware (fingerprint scanners, thermal barcode printers), a React Native mobile application, and a local Python FastAPI AI analytics microservice.

### Complete System Topology Diagram

```mermaid
graph TD
    subgraph Client Workstations & Devices
        WebBrowser["Web UI (Desktop / Mobile Browsers)<br/>Vanilla JS + EJS + CSS<br/>Port: 5001 / 5000"]
        MobileClient["Mobile App (iOS / Android)<br/>React Native 0.73+ / Expo SDK 50+<br/>Camera Barcode Scanner"]
        BarcodePC["Barcode Workstation (Windows)<br/>C# .NET 8 WinForms + Crystal Reports<br/>Thermal Label & A4 Sheet Printing"]
        BiometricPC["Biometric Terminal (Windows)<br/>C# .NET 8 WinForms + DigitalPersona SDK<br/>Native Fingerprint Driver Lib/"]
    end

    subgraph Central Application Server [Node.js Express]
        HTTPRouter["Express HTTP Router & Route Guards"]
        AuthMiddleware["JWT Authentication Middleware<br/>(protect & authorize)"]
        BranchFilter["Branch Isolation Middleware<br/>(applyBranchFilter)"]
        
        subgraph Domain Controllers
            POSCtrl["POS & Retail Billing Controllers"]
            WHCtrl["Wholesale & Dispatch Controllers"]
            PurchCtrl["Purchasing & Vendor Controllers"]
            LedgerCtrl["Accounting & General Ledger Controllers"]
            HRCtrl["HR, Biometric & Payroll Controllers"]
            StockCtrl["Inventory, Store & Audit Controllers"]
        end

        subgraph Core Services
            LedgerService["whLedgerUtils & double-entry Engine"]
            AIProxyService["aiDataAgentService (Query Parser)"]
            RealtimeSocket["Socket.io Real-Time Event Hub"]
        end
    end

    subgraph Data Persistence & Microservices
        MongoDBCluster[("MongoDB 6.0+ Database<br/>Database: bas-software<br/>WiredTiger Engine (Port: 27017)<br/>103 Mongoose Data Models")]
        AIBrainMicroservice["AI Brain Microservice (Python FastAPI)<br/>Uvicorn Server (Port: 8000)<br/>Ollama / vLLM Local LLM"]
    end

    WebBrowser -->|HTTP REST / EJS SSR / WebSocket| HTTPRouter
    MobileClient -->|HTTP REST / JSON (Axios Client)| HTTPRouter
    BarcodePC -->|HTTP REST / JSON (HttpClient)| HTTPRouter
    BiometricPC -->|HTTP REST / JSON (Attendance Punches)| HTTPRouter

    HTTPRouter --> AuthMiddleware
    AuthMiddleware --> BranchFilter
    BranchFilter --> POSCtrl & WHCtrl & PurchCtrl & LedgerCtrl & HRCtrl & StockCtrl

    POSCtrl & WHCtrl & PurchCtrl & LedgerCtrl & HRCtrl & StockCtrl --> LedgerService
    WHCtrl & POSCtrl --> RealtimeSocket
    POSCtrl & WHCtrl & LedgerCtrl <-->|Safe Read Queries| AIProxyService

    LedgerService --> MongoDBCluster
    AIProxyService <-->|HTTP POST /api/v1/query| AIBrainMicroservice
```

---

## 2. Monorepo Structural Breakdown

```
BAS-SOFTWARE/
├── Backend/                   # Central Node.js / Express Web Server & REST API
│   ├── config/                # Database connection, AI catalog, roles, permissions
│   ├── controllers/           # HTTP Request handlers (100+ business controllers)
│   ├── middleware/            # JWT Auth, Branch Filter, Error Handling, Async Handlers
│   ├── models/                # Mongoose Database Models (103 domain models)
│   ├── routes/                # Express API & View Route Declarations
│   ├── services/              # Double-Entry Ledger, Inventory & AI Proxy services
│   ├── utils/                 # Accounting helpers, calculators, formatters
│   ├── server.js              # Application entry point & server bootstrapper
│   └── package.json           # Node.js backend dependencies
│
├── Frontend/                  # Web Client Presentation Layer
│   ├── public/                # Static assets served by Express
│   │   ├── css/               # ERP theme stylesheets & print layouts
│   │   ├── js/                # Client controllers (wh-sale.js, pos.js, etc.)
│   │   └── images/            # UI icons, logos, avatars
│   └── views/                 # EJS HTML page templates (145 view screens)
│
├── barcode-printing-app/      # C# WinForms .NET 8 Desktop Barcode Application
│   ├── BarcodePrintingApp.csproj
│   ├── Program.cs             # Desktop entry point
│   ├── MainForm.cs            # Barcode design, preview, and print workflow
│   ├── LoginForm.cs           # Desktop auth screen (calls BAS API)
│   ├── SearchForm.cs          # Item search dialog
│   ├── Models.cs              # C# DTOs (ItemDto, BarcodeItem)
│   ├── Config.cs              # API endpoints, printer configurations
│   ├── BarcodeReport.rpt      # Crystal Reports label template
│   └── appsettings.json       # App configuration settings
│
├── biometric-app/             # C# WinForms .NET 8 Desktop Biometric Attendance Application
│   ├── BiometricApp.csproj
│   ├── Lib/                   # ⚠️ Unmanaged DigitalPersona SDK DLLs (DPFPDevNET.dll)
│   ├── Program.cs             # Application entry point & hardware initialization
│   ├── Form1.cs / MainForm.cs # Attendance punch monitoring screen
│   ├── EnrollmentForm.cs      # Biometric fingerprint enrollment screen
│   ├── LoginForm.cs           # Desktop authentication screen
│   ├── Models.cs              # Employee and Attendance DTOs
│   ├── Config.cs              # API endpoint and branch settings
│   └── appsettings.json       # App configuration settings
│
├── mobile-app/                # React Native / Expo Companion Mobile App
│   ├── src/
│   │   ├── api/               # Axios client instance with dynamic baseURL
│   │   ├── components/        # Reusable mobile UI components
│   │   ├── navigation/        # React Navigation Stacks & Bottom Tabs
│   │   ├── screens/           # Dashboard, Inventory, Scanner, Sales, Settings
│   │   └── utils/             # Mobile utilities and SecureStore helpers
│   ├── App.js                 # Root mobile component & providers
│   ├── app.json               # Expo configuration (camera permissions, bundle ID)
│   └── package.json           # React Native / Expo dependencies
│
├── ai-brain/                  # Python FastAPI AI Analytics Microservice
│   ├── app/                   # FastAPI routes, schemas, prompt templates
│   ├── requirements.txt       # Python dependencies (fastapi, uvicorn, pydantic)
│   └── README.md              # Local AI setup guide
│
├── scripts/                   # Standalone Maintenance & Reconciliation Scripts
│   ├── reconcile-whsale-ledger.js # Targeted invoice/ledger synchronization
│   ├── fix-permissions.js         # Role permissions repairing
│   ├── audit-permissions.js       # Access control verification
│   └── check_stock.js             # Inventory discrepancy auditor
│
├── docs/                      # Architectural, PRD, and Engineering Documentation
├── AGENTS.md                  # Master AI agent instructions & boundaries
└── PROJECT_STRUCTURE.md       # Architectural overview documentation
```

---

## 3. Comprehensive Database Models & Schema Graph (103 Models)

The database `bas-software` contains 103 models organized into eight discrete functional clusters:

### 3.1. Wholesale & Distribution Cluster (17 Models)
- **`WHSale`**: Master wholesale invoice header (`invoiceNo`, `customer`, `date`, `subTotal`, `discount`, `tax`, `freight`, `netTotal`, `status`, `items` array).
- **`WHSaleReturn`**: Return credit note header, return items, reason, and customer credit adjustment.
- **`WHPurchase` & `WHPurchaseReturn`**: Warehouse vendor shipment bills, cost prices, trade terms, and vendor return debit notes.
- **`WHItem`**: Wholesale master catalog SKU (`itemsCode`, `barcode`, `name`, `costPrice`, `salePrice`, `retailPrice`, `incentive`, `company`, `category`, `itemClass`, `subClass`, `supplier`, `stock` array per store).
- **`WHCustomer`**: Wholesale debtor record (`customerName`, `code`, `phone`, `currentBalance`, `creditLimit`, `customerCategory`, `branch`).
- **`WHLedger`**: Wholesale customer double-entry ledger (`customer`, `date`, `description`, `refType` ['Sale', 'Payment', 'SaleReturn', 'Opening'], `refId`, `debit`, `credit`, `runningBalance`).
- **`WHCustomerPayment`**: Receipt of cash, bank transfer, or cheque from a wholesale customer.
- **`WHSupplier` & `WHSupplierCategory`**: Wholesale trade vendor records and supplier categorization.
- **`WHStockAudit` & `WHStockLog`**: Warehouse inventory audit sessions and historical stock transaction logs.
- **`WHCity`, `WHItemCategory`, `WHItemClass`, `WHItemCompany`, `WHItemSubClass`, `WHCustomerType`, `WHCustomerCategory`**: Dimension and lookup tables.

### 3.2. Retail Point of Sale (POS) Cluster (7 Models)
- **`Sale` & `SaleItem`**: Retail POS sales invoice headers and itemized transaction rows.
- **`SalesReturn`**: Counter sales returns with original bill reference and cash drawer refunds.
- **`CashSale`**: High-speed counter cash transactions.
- **`DailyCash`**: Cash register shift assignments, opening balances, and shift records.
- **`ClosingSheet`**: End-of-day register cash count declarations, expense deductions, and variance calculations.
- **`CustomerDemand`**: Counter customer demand tracking for out-of-stock items.

### 3.3. Inventory & Multi-Branch Logistics Cluster (10 Models)
- **`Item`**: Master retail inventory item with department, subBranch, purchase price, and retail sale price.
- **`Store`**: Storage compartments (e.g., *Shop Floor*, *Basement*, *Main Warehouse*).
- **`Department` & `BranchDepartment`**: High-level classification (e.g., Pharmacy, Cosmetics, General).
- **`SubBranch`**: Sub-location within a main branch.
- **`StockAdjustment` & `StockAudit`**: Physical count adjustments and audit sessions.
- **`StockLog`**: Audit record of every stock increment or decrement across branches.
- **`Unit`**: Packaging units (Pieces, Packs, Cartons, Bottles).
- **`ItemClass` & `SubClass`**: Granular item category hierarchies.

### 3.4. Financial Accounting & Banking Cluster (15 Models)
- **`AccountGroup`**: Level 1-2 classifications (Assets, Liabilities, Equity, Revenue, Expenses).
- **`AccountCategory`**: Level 3 categories (Cash in Hand, Accounts Receivable, Inventory, Banks).
- **`Account`**: Level 4 transactional general ledger accounts.
- **`Ledger` & `LedgerEntry`**: Core double-entry general ledger transaction records.
- **`Voucher`**: Multi-purpose financial vouchers (Journal, Cash Payment, Cash Receipt, Bank Payment, Bank Receipt).
- **`Bank` & `BankTransaction` & `BankTransfer`**: Bank accounts, deposits, withdrawals, and bank-to-bank transfers.
- **`CashTransaction`**: Petty cash and drawer cash movements.
- **`MonthlyBalance`**: Pre-calculated monthly financial closing balances.
- **`PendingCheque` & `PendingChequeDetail`**: Post-dated cheque clearing lifecycle management.
- **`SavedIncomeStatement`**: Snapshots of quarterly or annual P&L statements.

### 3.5. Procurement & Vendor Accounts Cluster (8 Models)
- **`Purchase` & `PurchaseItem` & `PurchaseReturn`**: Retail vendor purchase invoices and return memos.
- **`Party` & `PartyCategory`**: Vendor profiles, credit limits, and current balances.
- **`SupplierPayment` & `Payment`**: Vendor payment disbursements and cheque assignments.
- **`SupplierTax` & `SupplierTaxCPR`**: Withholding tax deductions and FBR Computerized Payment Receipts.

### 3.6. Human Resources & Payroll Cluster (19 Models)
- **`Employee`**: Master staff profiles, CNIC, basic salary, department, designation, branch, biometric ID.
- **`Attendance`**: Daily clock-in/out timestamps, overtime hours, short-time hours, late flags.
- **`Payroll` & `LegacyPayroll`**: Monthly computed salary sheets with gross pay, deductions, and net salary.
- **`EmployeeAdvance` & `EmployeeAdvanceInstallmentPlan`**: Employee loans and monthly installment recovery plans.
- **`EmployeeCommission`**: Individual or group sales commission computations.
- **`EmployeeAdjustment` & `EmployeePenalty` & `EmployeeClearance`**: Salary adjustments, disciplinary deductions, and final settlements.
- **`EmployeeDepartment`, `Designation`, `HolyDay`**: HR lookup and schedule tables.

### 3.7. Governance, Security & System Administration Cluster (7 Models)
- **`User`**: System user credentials, branch affiliation, active status, last login.
- **`Group`**: Role profiles with granular Boolean permission flags across every ERP view and action.
- **`AuditLog` & `SystemLog`**: Security audit trails capturing who modified what document at what timestamp.
- **`Notification`**: Real-time system alerts pushed to user sessions.
- **`Settings`**: Global company configurations, invoice receipt headers, currency formatting, and feature toggles.
- **`DownloadCenterFile`**: Repository of downloadable documents, templates, and drivers.

### 3.8. Artificial Intelligence & Tax Compliance Cluster (10 Models)
- **`AiConversation`**: Historical conversational threads between users and the AI Assistant.
- **`AiInsight`**: Automated business anomaly alerts generated by background analytical passes.
- **`AiProvider` & `AiProviderLog`**: AI engine connection metadata (Ollama, vLLM, OpenAI compatibility).
- **`AiPreference`**: User-specific AI assistant preferences.
- **`Tax`**: Standardized Sales Tax and GST tax rates.
- **`Zakat`**: Annual Islamic asset evaluation and Zakat assessment calculator.
- **`ExemptionInvoice`, `FoodInvoice`, `GeneratedFoodInvoice`**: Specialized branch billing and exemption models.

---

## 4. Concurrency, Race Conditions & Ledger Integrity

### 4.1. The Barcode Scanner Concurrency Engine
In high-frequency counter environments, optical barcode scanners emit rapid bursts of keystrokes terminated by `Enter`. When an operator scans multiple items in under one second:
1. Each scan triggers an asynchronous HTTP request (`fetch('/api/v1/wh-items/:id')`).
2. Without concurrency management, network jitter causes responses to arrive out of sequence. If Item A's response resolves after Item B has already been scanned, Item B's price fields are overwritten with Item A's data.
3. **BAS Mitigation Architecture**:
   - **Request Sequence Token**: A monotonically increasing integer (`currentItemSelectToken`) is incremented on every scan event.
   - **AbortController Cancellation**: Any active in-flight fetch request is immediately cancelled using `itemFetchAbortController.abort()`.
   - **Stale Response Discarding**: When a fetch completes, it verifies `currentToken === currentItemSelectToken` and checks that `document.getElementById('itemSelect').value === itemId`. Any mismatch results in immediate discard.
   - **Synchronous Cache Population**: Prices and unit details are populated synchronously from the in-memory item catalog (`itemsList`) before network resolution.

### 4.2. Atomic Ledger State Machine
- **Atomic Mutation Rule**: Customer balances (`whcustomers.currentBalance`) and supplier balances (`parties.currentBalance`) are mutated exclusively via atomic `$inc` operations:
  ```javascript
  const change = (data.debit || 0) - (data.credit || 0);
  await WHCustomer.findByIdAndUpdate(
      data.customer,
      { $inc: { currentBalance: change } },
      { returnDocument: 'after' }
  );
  ```
- **Append-Only Chronological Ledger**: Ledger entries in `whledgers` are immutable audit events. When balance synchronization or reconciliation is performed, running balances are recalculated strictly in `{ date: 1, createdAt: 1 }` sequence.
- **Snapshot Invoice Pricing**: Invoices store immutable price copies (`pcsPrice`, `retailPrice`, `costPrice`). When master product prices update weekly in `whitems`, historical sales invoices preserve their transactional snapshot rates.

---

## 5. Client Subsystem Architectures

### 5.1. C# .NET 8 WinForms Barcode Printing Application
- **Architecture**: Windows Forms on .NET 8.0-windows (`BarcodePrintingApp.csproj`).
- **Data Source**: Authenticates with BAS Backend REST API via `HttpClient` using JWT token storage (`Config.cs`, `LoginForm.cs`).
- **Report Engine**: Integrates 64-bit Crystal Reports runtime (`CRRuntime_64bit_13_0_34.msi`) compiling `BarcodeReport.rpt`.
- **Output Hardware**: Connects directly to the Windows Spooler subsystem, driving thermal transfer printers (Argox, TSC, Zebra, Xprinter) via native ESC/Label commands, as well as laser A4 sheets.
- **Workflow**:
  1. `LoginForm.cs` calls `POST /api/users/login` on BAS Backend.
  2. `MainForm.cs` allows search by SKU, barcode, or item name via `SearchForm.cs` querying `GET /api/items`.
  3. Form binds data into Crystal Report parameters (item title, Code 128 barcode, retail MRP) and executes print spooler job.

### 5.2. C# .NET 8 WinForms Biometric Attendance Terminal
- **Architecture**: Windows Forms on .NET 8.0-windows (`BiometricApp.csproj`).
- **Hardware Integration**: Directly interfaces with physical DigitalPersona U.are.U 4500 / 5100 USB fingerprint readers via native C++ COM SDK wrappers residing in `/biometric-app/Lib/` (`DPFPDevNET.dll`, `DPFPEngNET.dll`).
- **Biometric Matching**: Extracts 512-byte feature templates during enrollment (`EnrollmentForm.cs`) and syncs via `POST /api/attendance/enroll`.
- **Punch Operation**: In operational punch mode (`Form1.cs` / `MainForm.cs`), matches scanned prints 1:N in memory and pushes punch records to `POST /api/attendance/punch`.
- **Offline Resilience**: Caches punches locally if backend connection drops, syncing queued events via `POST /api/attendance/sync` upon network recovery.

### 5.3. React Native Mobile Companion Application
- **Architecture**: React Native 0.73+ with Expo SDK 50+/57 (`mobile-app/package.json`).
- **Network Stack**: Configured Axios client with dynamic base URL support (`src/api/`). Includes Android Network Security Config (`network_security_config.xml`) allowing local HTTP development endpoints while enforcing HTTPS for production.
- **Screens & Navigation**:
  - `LoginScreen.js`: User authentication storing JWT token in SecureStore.
  - `DashboardScreen.js`: Real-time executive dashboard (gross sales, cash/credit split, branch rankings).
  - `WHReportsScreen.js`: Wholesale stock position and customer balance reports.
  - `EmpSalaryReportsScreen.js`: Salary summaries, paid bank/cash reports, and deductions.
  - `EmployeeFinancialsScreen.js`: Staff advances, loan installment plans, and employee ledgers.
  - `AttendanceScreen.js`: Real-time branch employee attendance status.
  - `BranchEmployeesScreen.js` & `EmployeeDirectoryScreen.js`: Employee directory by branch.
  - `BranchStatusScreen.js`: Live branch operational status.
  - `CreateEmployeeScreen.js`: On-the-go employee onboarding.
  - `HolidaysScreen.js` & `MarkLeaveScreen.js`: Leave application and official holiday schedule.
  - `ScheduleScreen.js`: Shift schedules and roster view.
- **Scanner Engine**: Utilizes `expo-camera` hardware scanning with high-contrast viewfinder UI and haptic audio feedback.

### 5.4. Python FastAPI AI Business Brain Microservice
- **Architecture**: Python 3.10+ microservice powered by FastAPI and Uvicorn (`ai-brain/`).
- **Language Models**: Integrates with local inference engines (Ollama / vLLM) executing quantized models (Gemma 2, Llama 3) on host hardware without cloud API dependencies.
- **API Endpoints**:
  - `POST /query`: Receives natural language prompts from `Backend/services/aiDataAgentService.js`.
  - `POST /diagnose`: Evaluates accounting discrepancies and returns corrective recommendations.
- **Security Guardrails**: Translates natural language questions into safe, read-only Mongoose/MongoDB aggregation pipelines. Never executes destructive mutations (`delete`, `drop`, `update`).

---

## 6. Master Cross-Subsystem Map (Views <-> Controllers <-> Models)

This dictionary provides 100% mapping of user interactions to code execution across all modules:

| Functional Area | Web View (`Frontend/views/`) | Client JS (`Frontend/public/js/`) | Express Route (`Backend/routes/`) | Backend Controller (`Backend/controllers/`) | Primary Mongoose Models (`Backend/models/`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Wholesale Sales Entry** | `wh-sale.html` | `wh-sale.js` | `whSaleRoutes.js` (`/api/v1/wh-sales`) | `whSaleController.js` | `WHSale`, `WHItem`, `WHCustomer`, `WHLedger` |
| **Wholesale Sales Return** | `wh-sale-return.html` | `wh-sale-return.js` | `whSaleReturnRoutes.js` (`/api/v1/wh-sale-returns`) | `whSaleReturnController.js` | `WHSaleReturn`, `WHItem`, `WHCustomer`, `WHLedger` |
| **Wholesale Purchases** | `wh-purchase.html` | `wh-purchase.js` | `whPurchaseRoutes.js` (`/api/v1/wh-purchases`) | `whPurchaseController.js` | `WHPurchase`, `WHItem`, `WHSupplier` |
| **Wholesale Item Catalog** | `wh-item.html` | `wh-item.js` | `whItems.js` (`/api/v1/wh-items`) | `whItemController.js` | `WHItem`, `Store`, `WHItemCategory`, `WHItemCompany` |
| **Wholesale Customer Ledger** | `wh-customer-ledger-report.html` | `wh-customer-ledger.js` | `whLedgerRoutes.js` (`/api/v1/wh-ledger`) | `whLedgerController.js` | `WHLedger`, `WHCustomer` |
| **Wholesale Stock Audit** | `wh-stock-audit.html` | `wh-stock-audit.js` | `whStockAuditRoutes.js` (`/api/v1/wh-stock-audits`) | `whStockAuditController.js` | `WHStockAudit`, `WHStockLog`, `WHItem` |
| **Retail POS Billing** | `sales.html` | `pos.js` / `sales.js` | `sales.js` (`/api/v1/sales`) | `saleController.js` | `Sale`, `SaleItem`, `Item`, `DailyCash` |
| **Retail Sales Return** | `sale-returns.html` | `sale-returns.js` | `salesReturns.js` (`/api/v1/sales-returns`) | `salesReturnController.js` | `SalesReturn`, `Sale`, `Item`, `DailyCash` |
| **Cash Counter & Shifts** | `cash-counter.html` | `cash-counter.js` | `dailyCash.js` (`/api/v1/daily-cash`) | `dailyCashController.js` | `DailyCash`, `User` |
| **Shift Closing Sheets** | `closing-sheet.html` | `closing-sheet.js` | `closingSheets.js` (`/api/v1/closing-sheets`) | `closingSheetController.js` | `ClosingSheet`, `DailyCash`, `Expense` |
| **Retail Item Catalog** | `items.html` | `items.js` | `items.js` (`/api/v1/items`) | `itemController.js` | `Item`, `Department`, `SubBranch`, `Store` |
| **Procurement Bills** | `purchases.html` | `purchases.js` | `purchases.js` (`/api/v1/purchases`) | `purchaseController.js` | `Purchase`, `PurchaseItem`, `Party` |
| **Supplier Payments** | `supplier-payments.html` | `supplier-payments.js` | `supplierPayments.js` (`/api/v1/supplier-payments`) | `supplierPaymentController.js` | `SupplierPayment`, `Party`, `Account`, `Bank` |
| **Withholding Tax & CPR** | `supplier-tax-report.html` | `supplier-tax.js` | `supplierTaxes.js` / `supplierTaxCPRs.js` | `supplierTaxController.js`, `supplierTaxCPR.js` | `SupplierTax`, `SupplierTaxCPR`, `Party` |
| **Chart of Accounts** | `accounts.html` | `accounts.js` | `accounts.js` (`/api/v1/accounts`) | `accountSetupController.js` | `Account`, `AccountCategory`, `AccountGroup` |
| **General Ledger Statements** | `ledger-report.html` | `ledger-report.js` | `reports.js` (`/api/v1/reports/ledger`) | `ledgerController.js` | `Ledger`, `LedgerEntry`, `Account` |
| **Bank Book & Transfers** | `bank-management.html` | `bank-management.js` | `bankTransactions.js` / `bankTransfers.js` | `bankTransactionController.js`, `bankTransferController.js` | `Bank`, `BankTransaction`, `BankTransfer` |
| **Cheque Clearing (PDC)** | `pending-cheque-v2.html` | `pending-cheques.js` | `pendingCheques.js` / `pendingChequeDetails.js` | `pendingChequeController.js`, `pendingChequeDetailController.js` | `PendingCheque`, `PendingChequeDetail`, `Bank` |
| **HR Biometric Attendance** | `attendance-list.html` | `attendance.js` | `attendance.js` / `biometric.js` | `attendanceController.js`, `biometricController.js` | `Attendance`, `Employee`, `SubBranch` |
| **Employee Payroll** | `payroll.html` | `payroll.js` | `payrolls.js` (`/api/v1/payrolls`) | `payrollController.js` | `Payroll`, `Employee`, `EmployeeAdvance`, `EmployeePenalty` |
| **Salary Advances & Loans** | `employee-advance.html` | `employee-advance.js` | `employeeAdvances.js` | `employeeAdvanceController.js` | `EmployeeAdvance`, `EmployeeAdvanceInstallmentPlan` |
| **Sales Commissions** | `employee-commission.html`| `employee-commission.js`| `employeeCommissions.js` | `employeeCommissionController.js` | `EmployeeCommission`, `Employee`, `Sale` |
| **User Roles & Permissions**| `groups.html` | `groups.js` | `groups.js` (`/api/v1/groups`) | `groupController.js` | `Group`, `User` |
| **AI Business Brain Chat** | `ai-provider-settings.html`| `ai.js` | `aiBrain.js` (`/api/v1/ai`) | `aiBrainController.js`, `aiProviderController.js` | `AiConversation`, `AiInsight`, `AiProvider` |
| **System Security Logs** | `system-logs.html` | `system-logs.js` | `systemLogs.js` (`/api/v1/system-logs`) | `systemLogs.js` (controller) | `SystemLog`, `AuditLog`, `User` |

