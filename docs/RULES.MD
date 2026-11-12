# Engineering & Operational Rules - Bilal Accounting & Sales (BAS)

> **CRITICAL MANDATE FOR ALL ENGINEERS & AI AGENTS**:
> These rules govern all codebases within the BAS repository. Every code modification, database migration, and architecture decision must comply with these guidelines. Violations risk financial data corruption, double-entry imbalances, and physical hardware communication failures.

---

## 1. Monorepo Boundary & Isolation Rules

### 1.1. Absolute Codebase Boundary Matrix

| Codebase Directory | Allowed Technologies | Strictly Forbidden Technologies |
| :--- | :--- | :--- |
| **`/Backend`** | Node.js, Express, Mongoose, Socket.io, JWT, Vanilla JS | C#, .NET libraries, React, React Native, Python |
| **`/Frontend`** | Vanilla JavaScript (ES6+), EJS templates, CSS3, HTML5 | React, React Native, Vue, C#, Mongoose, direct MongoDB calls |
| **`/barcode-printing-app`** | C# 12, .NET 8.0-windows, WinForms, Crystal Reports | Node.js, npm packages, Python, direct MongoDB drivers |
| **`/biometric-app`** | C# 12, .NET 8.0-windows, WinForms, DigitalPersona SDK (`Lib/`) | Node.js, npm packages, Python, direct MongoDB drivers |
| **`/mobile-app`** | React Native, Expo SDK, React Navigation, Axios | C#, WinForms, EJS templates, Mongoose, direct MongoDB calls |
| **`/ai-brain`** | Python 3.10+, FastAPI, Uvicorn, Pydantic, Ollama/vLLM | Node.js, Express, C#, React Native, direct MongoDB mutation |
| **`/scripts`** | Standalone Node.js scripts connecting via Mongoose | Client UI code, WinForms code, React Native packages |

---

## 2. Package Management & Dependency Rules

### 2.1. Dependency Installation Directory Map
- **Backend Packages**: Always navigate to `/Backend` before running `npm install <package>`. Never run backend installs in the root folder.
- **Mobile Packages**: Always navigate to `/mobile-app` before running `npx expo install <package>`. Never run mobile installs in the root or `/Backend`.
- **Desktop Dependencies**: Manage NuGet dependencies exclusively inside `BarcodePrintingApp.csproj` and `BiometricApp.csproj`.

```bash
# ✅ CORRECT: Installing a backend library
cd Backend
npm install jsonwebtoken

# ❌ WRONG: Running npm install in repository root
npm install jsonwebtoken # Violates monorepo isolation!

# ✅ CORRECT: Installing a mobile library
cd mobile-app
npx expo install expo-camera

# ❌ WRONG: Installing mobile library in Backend
cd Backend
npm install expo-camera # Corrupts backend dependencies!
```

---

## 3. Database Access & Financial Ledger Invariants

### 3.1. Database Privacy
- **MongoDB is Private to Backend**: Only `/Backend` and `/scripts` may connect directly to MongoDB via Mongoose.
- **Zero Direct Database Connections in Clients**: Desktop C# apps and the React Native mobile app must interact with the system **exclusively** via the Backend HTTP REST API (`/api/v1/...`).

### 3.2. Double-Entry Accounting & Atomic Ledger Mutations
- **Atomic Customer/Supplier Balances**: Customer balances (`WHCustomer.currentBalance`) and vendor balances (`Party.currentBalance`) must **ALWAYS** be updated using atomic `$inc` operators:

```javascript
// ✅ CORRECT: Atomic MongoDB $inc update (Prevents race conditions)
await WHCustomer.findByIdAndUpdate(
    customerId,
    { $inc: { currentBalance: changeAmount } },
    { returnDocument: 'after' }
);

// ❌ WRONG: In-memory read-modify-write (Causes balance drift under concurrency!)
const customer = await WHCustomer.findById(customerId);
customer.currentBalance += changeAmount;
await customer.save();
```

- **Chronological Running Balances**: Running balances in `whledgers` must always be ordered chronologically by `{ date: 1, createdAt: 1 }`.
- **Mandatory Reversal on Deletion**: When an invoice, payment voucher, or sales return is deleted or modified, its corresponding ledger entry must be removed and the party's balance adjusted by `-changeAmount`. Never leave dangling balance drift.

---

## 4. Barcode Scanning Concurrency & Form Handling Rules

### 4.1. Rapid Barcode Scanner Race-Condition Prevention
Optical barcode scanners dump characters at over 30 characters per second followed by `Enter`.
- **Mandatory Sequence Tokens & AbortController**: Every asynchronous fetch triggered by item selection or barcode input must cancel previous in-flight requests and verify request sequence tokens before mutating the DOM:

```javascript
// ✅ CORRECT: Request cancellation & sequence tokenization
let currentItemSelectToken = 0;
let itemFetchAbortController = null;

async function handleItemSelect() {
    const currentToken = ++currentItemSelectToken;
    if (itemFetchAbortController) {
        itemFetchAbortController.abort(); // Cancel previous slow request
    }
    itemFetchAbortController = new AbortController();

    // 1. Immediately populate prices from local in-memory cache
    const cachedItem = itemsList.find(i => i._id === itemId);
    if (cachedItem) {
        document.getElementById('itemPrice').value = cachedItem.costPrice || 0;
        document.getElementById('itemRetailPrice').value = cachedItem.retailPrice || 0;
    }

    // 2. Fetch supplementary data with abort protection
    try {
        const res = await fetch(`/api/v1/wh-items/${itemId}`, { signal: itemFetchAbortController.signal });
        const data = await res.json();
        // Discard response if user has already scanned the next item
        if (currentToken !== currentItemSelectToken) return;
        if (document.getElementById('itemSelect').value !== itemId) return;

        // Apply validated data
    } catch (err) {
        if (err.name === 'AbortError') return; // Cleanly ignore aborted fetches
        console.error(err);
    }
}

// ❌ WRONG: Unprotected asynchronous fetch (Causes price-copying bug!)
fetch(`/api/v1/wh-items/${itemId}`)
    .then(res => res.json())
    .then(data => {
        // Blindly overwriting inputs without checking active item selection!
        document.getElementById('itemPrice').value = data.data.costPrice;
    });
```

---

## 5. Master Catalog Prices & Historical Invoice Protection

### 5.1. The Weekly Master Price Rule
- In distribution and pharmacy retail, master prices in `whitems` and `items` are updated weekly as new vendor consignments arrive.
- **Invoices Store Snapshot Pricing**: Invoices must preserve the exact `pcsPrice`, `retailPrice`, and `costPrice` active at the time the invoice was posted.
- **Never Run Mass Price Overwrites**: When writing maintenance or reconciliation scripts, **NEVER** overwrite prices on historical invoices with current master prices.
- **Targeted Scope Only**: Scripts must strictly target specific invoice numbers (e.g. `--invoice INV-WS-2026-0401` or specific date windows). Blanket mass updates across the entire collection are strictly prohibited.
- **Mandatory Dry-Run Mode**: Every database maintenance script must support `--dry-run` to preview changes before mutating database documents.

---

## 6. Multi-Branch Isolation & Security Governance

### 6.1. Enforcement of `applyBranchFilter`
- All database queries for sales, cash counters, inventory, and ledgers must respect the `applyBranchFilter` middleware:

```javascript
// ✅ CORRECT: Branch filtering applied
const query = applyBranchFilter(req, {});
const sales = await Sale.find(query);

// ❌ WRONG: Unscoped cross-branch query (Security vulnerability!)
const sales = await Sale.find({}); // Exposes data from other branches!
```

- **SuperAdmin Scoping**: Only users with `role === 'SuperAdmin'` or `branch: null` may query across all branches. All other branch operators are strictly scoped to their assigned `branch`.

---

## 7. Hardware SDK Preservation & Native Driver Rules

### 7.1. DigitalPersona SDK Library Integrity
- The directory `/biometric-app/Lib/` contains native unmanaged and managed SDK DLLs:
  - `DPFPDevNET.dll`
  - `DPFPEngNET.dll`
  - `DPFPGatNET.dll`
  - `DPFPShrNET.dll`
  - `DPFPVerNET.dll`
- **NEVER delete, move, rename, or recompile these DLLs.** They are pre-compiled COM interop wrappers required by physical DigitalPersona fingerprint scanners.

---

## 8. Git Hygiene & Artifact Staging Standards

### 8.1. Prohibited Staging Files
The following files and directories must **NEVER** be committed to Git:
- Binaries and compiled outputs: `*.exe`, `*.dll`, `*.pdb`, `bin/`, `obj/`, `publish_out*/`.
- Mobile build outputs: `.expo/`, `android/app/build/`, `ios/Pods/`, `*.apk`, `*.aab`.
- Build and execution logs: `*build_error*.txt`, `*build_log*.txt`, `*.log`, `npm-debug.log*`.
- Temporary scratch and backup files: `scripts/*audit*.js`, `scripts/*check*.js`, `*.bak`, `*.tmp`.
- Local environment files: `Backend/.env`, `.env.local` (only `.env.example` may be tracked).

### 8.2. Pre-Commit Checklist
Before running `git commit` or `git push`:
1. Run `git status` to verify that only intended source files are staged.
2. Confirm that no build logs, temporary scripts, or binary outputs are tracked.
3. Test changes locally to ensure the server starts without syntax or runtime errors.
