# Engineering Tasks & Roadmap Tracker - Bilal Accounting & Sales (BAS)

## 1. Engineering Work Status Overview

| Status | Count | Priority | Domain Scope |
| :--- | :--- | :--- | :--- |
| **Completed Milestones** | 12 | ✅ Done | POS, Wholesale Scanner Concurrency, Customer Ledgers, Android Security, Biometric Driver |
| **Immediate Action Items** | 2 | 🔴 Critical | Production Server Upgrade Execution (`INV-WS-2026-0401`), Browser Cache Reset |
| **Short-Term Roadmap** | 4 | 🟡 High | Offline Biometric SQLite Queue, Mobile Batch Scan, PDF Delivery Challan Generator |
| **Long-Term Optimization** | 3 | 🟢 Medium | Compound Indexing on Ledgers, Automated Nightly Ledger Reconciliation Cron |

---

## 2. Completed Engineering Milestones

### ✅ TASK-2026-09-01: Wholesale Barcode Scanner Concurrency & Price Overwrite Fix
- **Problem Analysis**:
  - In Wholesale Entry (`wh-sale.js`), scanning barcodes rapidly triggered background requests to `/api/v1/wh-items/:id`.
  - Network response delays caused the response for Item A to resolve *after* the cashier had already scanned Item B.
  - The un-sequenced callback wrote directly to `document.getElementById('itemPrice').value` and `itemRetailPrice.value`, corrupting Item B with Item A's prices.
  - Concretely verified on invoice `INV-WS-2026-0401` where 9 items had prices copied from preceding scanned items.
- **Implementation**:
  - Implemented `currentItemSelectToken` monotonically increasing sequence counter.
  - Added native browser `AbortController` cancellation for all in-flight item lookup requests.
  - Enforced verification check (`currentToken === currentItemSelectToken && document.getElementById('itemSelect').value === itemId`).
  - Populated prices synchronously from the in-memory item catalog cache (`itemsList`).
  - Mirrored this fix in Wholesale Sales Return (`wh-sale-return.js`).
- **Files Modified**: [`Frontend/public/js/wh-sale.js`](file:///Users/bilalshah/BAS-OFFICAL-CODE/BAS-SOFTWARE/Frontend/public/js/wh-sale.js), [`Frontend/public/js/wh-sale-return.js`](file:///Users/bilalshah/BAS-OFFICAL-CODE/BAS-SOFTWARE/Frontend/public/js/wh-sale-return.js).
- **Git Commit**: `0b1dac2`.

### ✅ TASK-2026-09-02: Targeted Wholesale Invoices & Customer Ledgers Reconciliation Engine
- **Problem Analysis**:
  - Invoices generated during scanner race conditions had corrupted item prices and net totals that drifted out of sync with customer ledger debits and customer balances.
- **Implementation**:
  - Created standalone utility [`scripts/reconcile-whsale-ledger.js`](file:///Users/bilalshah/BAS-OFFICAL-CODE/BAS-SOFTWARE/scripts/reconcile-whsale-ledger.js).
  - Configured safe targeting for the specific 4 invoices from 21/09/2026 (`INV-WS-2026-0401`, `INV-WS-2026-0397`, `INV-WS-2026-0396`, `INV-WS-2026-0395`).
  - Corrects line items against master prices, updates invoice net totals, synchronizes `WHLedger` debits, and updates customer `currentBalance`.
  - Guarantees 100% isolation for all other historical invoices in the database.
- **Git Commits**: `62ddb71`, `0b85071`, `f19ddae`.

### ✅ TASK-2026-09-03: Android Mobile App Network Security Configuration
- **Problem Analysis**: Release APK failed to connect over WiFi networks due to Android 9+ default cleartext HTTP traffic restrictions.
- **Implementation**: Configured `network_security_config.xml` and AndroidManifest permissions to support LAN development endpoints while maintaining HTTPS production security.
- **Files Modified**: [`mobile-app/android/app/src/main/res/xml/network_security_config.xml`](file:///Users/bilalshah/BAS-OFFICAL-CODE/BAS-SOFTWARE/mobile-app/android/app/src/main/res/xml/network_security_config.xml), [`mobile-app/android/app/src/main/AndroidManifest.xml`](file:///Users/bilalshah/BAS-OFFICAL-CODE/BAS-SOFTWARE/mobile-app/android/app/src/main/AndroidManifest.xml).

### ✅ TASK-2026-09-04: Enterprise Mobile App Modernization & Biometrics
- **Scope**: Upgraded `mobile-app` to enterprise standard conforming strictly with Expo SDK 57:
  1. **Hardware Biometrics (`expo-local-authentication`)**: Face ID / Fingerprint instant unlock with fallback detection on `LoginScreen.js`.
  2. **Encrypted Hardware Storage (`expo-secure-store`)**: Securely stores JWT authorization tokens in Android Keystore / iOS Keychain.
  3. **Tactile Haptic Feedback (`expo-haptics`)**: Micro-vibrations on button taps, tab navigation, logins, and errors via unified `haptic` utility.
  4. **Enterprise Vector Icons (`@expo/vector-icons`)**: Replaced generic character symbols with crisp vector icon sets.
  5. **Stale-While-Revalidate Offline Caching (`api.js`)**: Background caching for dashboards and ledger reports, serving cached snapshots on weak network or timeout.
  6. **Modular UI Component Suite**: Created `HeaderBar`, `StatCard`, `OfflineBanner`, and `BottomNavBar` with modern corporate theme tokens.
- **Files Modified/Created**:
  - `mobile-app/src/services/biometrics.js`
  - `mobile-app/src/services/haptics.js`
  - `mobile-app/src/theme/colors.js`
  - `mobile-app/src/components/common/HeaderBar.js`
  - `mobile-app/src/components/common/StatCard.js`
  - `mobile-app/src/components/common/OfflineBanner.js`
  - `mobile-app/src/components/common/BottomNavBar.js`
  - `mobile-app/src/services/api.js`
  - `mobile-app/src/screens/LoginScreen.js`
  - `mobile-app/src/screens/DashboardScreen.js`
  - `mobile-app/App.js`

---

## 3. Immediate Action Items (Production Runbook)

### 🔴 ACTION-01: Production Server Deployment & Verification
- **Target Host**: `bas.dwatson.co`
- **Execution Runbook**:

```bash
# 1. SSH into the production server and pull latest code
cd /path/to/BAS-SOFTWARE
git pull origin main

# 2. Run dry-run preview to verify target invoices
node scripts/reconcile-whsale-ledger.js --dry-run

# 3. Apply live reconciliation to MongoDB
node scripts/reconcile-whsale-ledger.js

# 4. Restart backend services via PM2
pm2 restart all

# 5. Client verification
# Instruct cashiers to press Ctrl + F5 (Cmd + Shift + R on Mac) on the Wholesale Entry screen.
```

- **Verification Checklist**:
  - [ ] `INV-WS-2026-0401` shows Net Total `642,549.00` on invoice list.
  - [ ] Customer `DW-BR-G.T (COS)` ledger debit matches `642,549.00`.
  - [ ] Customer `DW-BR-G.T (COS)` balance matches `3,053,598.00`.
  - [ ] Zero changes made to any other invoices or customers.

---

## 4. Short-to-Mid Term Feature Roadmap

### 🟡 ROADMAP-01: Offline Biometric SQLite Queueing Engine
- **Target Codebase**: `/biometric-app` (C# .NET 8 WinForms)
- **Problem**: If the branch network drops, attendance punches fail to push to the backend and remain unrecorded until manually logged.
- **Architecture Plan**:
  1. Add `Microsoft.Data.Sqlite` dependency to `BiometricApp.csproj`.
  2. Create local embedded SQLite table `OfflinePunches (Id, EmployeeId, Timestamp, Synced)`.
  3. When an employee scans a fingerprint, record punch locally in SQLite first.
  4. Background worker polls `POST /api/attendance/punch` with exponential backoff; marks rows as synced upon HTTP 200 response.

### 🟡 ROADMAP-02: Mobile Continuous Batch Scanning Mode
- **Target Codebase**: `/mobile-app` (React Native Expo)
- **Problem**: During warehouse stock counts, operators must tap to scan each item and tap back to resume, which is slow for large inventories.
- **Architecture Plan**:
  1. Implement a dedicated "Batch Count" mode in `ScannerScreen.js`.
  2. Keep camera active continuously, utilizing a 1.5-second debounce on identical barcodes.
  3. Emit audio beep and haptic feedback on each unique scan.
  4. Accumulate counts in local state with instant "Commit to Stock Audit" action.

### 🟡 ROADMAP-03: Server-Side Automated PDF Delivery Challan Generator
- **Target Codebase**: `/Backend` & `/Frontend`
- **Problem**: Wholesale delivery challans currently rely on browser `window.print()`, making it difficult to email or WhatsApp delivery challans automatically.
- **Architecture Plan**:
  1. Implement server-side PDF generator (`pdfkit` or headless Chromium via `puppeteer-core`).
  2. Add endpoint `GET /api/v1/wh-sales/:id/pdf`.
  3. Enable automated dispatch to customer email or WhatsApp business webhook upon invoice posting.

### 🟡 ROADMAP-04: AI Business Brain Local Vector RAG Pipeline
- **Target Codebase**: `/ai-brain` (Python FastAPI)
- **Problem**: The AI microservice relies on basic text matching for ERP screen navigation and ledger questions.
- **Architecture Plan**:
  1. Index ERP product catalog and customer profiles into a local vector store (ChromaDB).
  2. Implement Retrieval-Augmented Generation (RAG) pipeline for complex natural language queries:
     - *"Which supplier provided the best discount on antibiotics this month?"*
     - *"Compare sales performance between Branch 1 and Branch 2 for cosmetics."*

---

## 5. Technical Debt & Optimization Backlog

### 🟢 TECHDEBT-01: Compound Indexing on High-Volume Ledger Collections
- **Target Collections**: `whledgers`, `ledgers`, `transactions`.
- **Action**: Add compound index `{ customer: 1, date: 1, createdAt: 1 }` to optimize customer ledger statement generation when accounts exceed 10,000 transactions.

### 🟢 TECHDEBT-02: Automated Nightly Ledger Reconciliation Daemon
- **Target Codebase**: `/Backend/services/cronService.js`
- **Action**: Add a scheduled daily cron job (running at 03:00 AM) that verifies:
  1. `WHSale.netTotal === WHLedger.debit` for all sales posted during the day.
  2. Customer `currentBalance === sum(debits) - sum(credits)`.
  3. Flags any discrepancies in `SystemLog` for administrator review.
