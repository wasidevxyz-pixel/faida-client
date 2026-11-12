# Core Knowledge, Domain Memory & Incident Postmortems - Bilal Accounting & Sales (BAS)

## 1. Business Domain Lexicon & Terminology

Understanding the distinct domain boundaries within the BAS monorepo is essential for all developers and AI agents:

| Term | Domain Scope | Definition |
| :--- | :--- | :--- |
| **`WHSale`** | Wholesale | Bulk commercial sales invoice billed to registered wholesale customers, often on credit terms with delivery challans. |
| **`Sale` / `CashSale`** | Retail POS | Counter retail sale billed to walk-in retail customers, settled immediately via cash, credit card, or customer card. |
| **`WHItem`** | Wholesale Catalog | Master product definition for wholesale operations containing `itemsCode`, `barcode`, `costPrice`, `salePrice`, `retailPrice`, `incentive`, and store-level stock. |
| **`Item`** | Retail Catalog | Master product definition for retail POS operations with department, subBranch, and purchase/retail rate structures. |
| **`WHCustomer`** | Wholesale Debtors | Registered corporate/trade buyers with assigned credit limits, credit terms, customer categories, and subsidiary ledgers. |
| **`Party` / `Supplier`** | Procurement | Commercial trade vendors from whom retail or warehouse inventory is purchased. |
| **`WHLedger`** | Wholesale Ledgers | Immutable subsidiary double-entry ledger tracking all debits (sales), credits (payments, returns), and running balances for a wholesale customer. |
| **`ClosingSheet`** | Cash Management | Shift-end reconciliation sheet where cashier counts physical drawer cash against recorded POS counter totals. |
| **`Store`** | Multi-Warehouse | A physical or virtual storage compartment (e.g., *Main Shop Floor*, *Warehouse A*, *Damage Rack*) within a specific branch. |

---

## 2. Fundamental Financial & Inventory Formulas

All calculations across backend controllers, frontend scripts, and maintenance utilities must adhere strictly to these mathematical rules:

### 2.1. Invoice Line Item Math
$$\text{SubTotal} = \text{Quantity} \times \text{PcsPrice}$$
$$\text{DiscountAmount} = \text{SubTotal} \times \left(\frac{\text{DiscountPercent}}{100}\right)$$
$$\text{LineNetTotal} = \text{SubTotal} - \text{DiscountAmount} + \text{TaxAmount}$$

### 2.2. Master Invoice Net Total
$$\text{InvoiceSubTotal} = \sum \text{LineNetTotal}$$
$$\text{InvoiceNetTotal} = \text{InvoiceSubTotal} - \text{BillDiscount} + \text{SalesTax} + \text{FreightCharges}$$

### 2.3. Double-Entry Ledger Running Balance
For transactions ordered chronologically by `{ date: 1, createdAt: 1 }`:
$$\text{RunningBalance}_0 = \text{OpeningDebit} - \text{OpeningCredit}$$
$$\text{RunningBalance}_n = \text{RunningBalance}_{n-1} + \text{Debit}_n - \text{Credit}_n$$
$$\text{WHCustomer.currentBalance} = \sum \text{AllDebits} - \sum \text{AllCredits}$$

---

## 3. Critical Architectural Quirks & Hardware Gotchas

### 3.1. Optical Barcode Scanners Emulate Rapid Keystrokes
- Handheld barcode scanners act as USB Human Interface Devices (HID), dumping up to 13 characters in under 50 milliseconds followed by `Enter` (KeyCode 13).
- **Gotcha**: If an asynchronous HTTP request is triggered on each scan event, rapid scanning causes the responses to return out of order.
- **Rule**: Always utilize `AbortController` cancellation and sequence tokens (`currentItemSelectToken`) before binding data to form inputs.

### 3.2. Master Catalog Prices Update Weekly
- In pharmaceutical and consumer goods distribution, master item prices in `whitems` and `items` are updated weekly as new vendor consignments arrive.
- **Gotcha**: Historical sales invoices must preserve the exact price that was active at the time of sale.
- **Rule**: Never run scripts that update past invoices with current catalog prices. Invoices must store immutable snapshots of prices at the moment of posting.

### 3.3. DigitalPersona Fingerprint Hardware Native DLLs
- The directory `biometric-app/Lib/` contains native unmanaged C++ COM wrappers (`DPFPDevNET.dll`, `DPFPEngNET.dll`).
- **Gotcha**: If these DLLs are moved, deleted, or built against an incompatible platform target (e.g. AnyCPU instead of x64/x86), the fingerprint scanner fails silently with `COMException` (0x80040154).
- **Rule**: Never alter or relocate files in `/biometric-app/Lib/`.

### 3.4. Crystal Reports Runtime for Barcode Printing
- The Windows desktop app `barcode-printing-app` requires the 64-bit Crystal Reports runtime engine for .NET (`CRRuntime_64bit_13_0_34.msi`) installed on the host PC. Without this runtime, the report previewer crashes with `TypeInitializationException`.

### 3.5. Android Network Security & Cleartext HTTP
- Android API 28+ blocks non-HTTPS network requests by default. When the mobile app runs on a local WiFi LAN during development, requests to `http://192.168.x.x:5001` fail unless explicitly exempted in `network_security_config.xml`.

---

## 4. Historical Incident Postmortems & Solutions

### Incident 1: Scanner Price Overwrite in Wholesale Entry
- **Date**: 21/09/2026
- **Symptoms**: Invoice `INV-WS-2026-0401` was generated with 9 items showing prices from preceding scanned items (e.g., MondSub Face Mask showed `1100 / 1550` copied from Elence Shower Gel).
- **Root Cause**: `handleItemSelect()` in `wh-sale.js` triggered asynchronous `fetch('/api/v1/wh-items/${itemId}')` without checking if the selection had changed before writing to `itemPrice.value` and `itemRetailPrice.value`.
- **Permanent Resolution**: Added `AbortController` request cancellation and request sequence tokens in commit `0b1dac2`. Created targeted repair utility in `scripts/reconcile-whsale-ledger.js`.

### Incident 2: Ledger Balance Drift After Wholesale Invoice Modification
- **Date**: 22/09/2026
- **Symptoms**: After updating items on wholesale sales invoice `INV-WS-2026-0401`, the invoice total (`642,549.00`) did not match the customer ledger debit (`642,357.00`), causing customer `DW-BR-G.T (COS)`'s balance to be off by `192.00`.
- **Root Cause**: Modifying invoice items in the database did not update the corresponding `WHLedger` record.
- **Permanent Resolution**: Updated `scripts/reconcile-whsale-ledger.js` to automatically sync invoice net totals with `WHLedger.debit`, recompute running balances chronologically, and synchronize `whcustomers.currentBalance`.

---

## 5. Deployment & Environment Cheat Sheet

### 5.1. Standard Port Assignments
- **Backend Web Server**: Port `5001` (or `5000`)
- **MongoDB Instance**: Port `27017`
- **AI Brain Microservice**: Port `8000`

### 5.2. Environment Variables (`Backend/.env`)
```ini
PORT=5001
NODE_ENV=production
MONGO_URI=mongodb://127.0.0.1:27017/bas-software
JWT_SECRET=bas_secret_jwt_key_2026_super_secure_production
JWT_EXPIRE=30d
AI_TIMEZONE=Asia/Karachi
```

### 5.3. Production Service Management (PM2)
```bash
# Check status of running backend services
pm2 status

# Restart backend after pulling code
pm2 restart all
# or: pm2 restart bas-backend

# View live application logs
pm2 logs bas-backend --lines 100
```

---

## 6. MongoDB Diagnostic Cheat Sheet

Useful diagnostic queries for verifying data integrity in the `bas-software` database:

```javascript
// 1. Verify invoice netTotal matches customer ledger debit
const sale = await db.collection('whsales').findOne({ invoiceNo: 'INV-WS-2026-0401' });
const ledger = await db.collection('whledgers').findOne({ refType: 'Sale', refId: sale._id });
console.log({ saleNetTotal: sale.netTotal, ledgerDebit: ledger.debit, matches: sale.netTotal === ledger.debit });

// 2. Audit customer balance against sum of ledger transactions
const customerId = new ObjectId('69727ad231e6a78112fee941');
const ledgers = await db.collection('whledgers').find({ customer: customerId }).toArray();
const calculatedBalance = ledgers.reduce((acc, curr) => acc + (curr.debit || 0) - (curr.credit || 0), 0);
const customer = await db.collection('whcustomers').findOne({ _id: customerId });
console.log({ currentBalance: customer.currentBalance, calculatedBalance, drift: customer.currentBalance - calculatedBalance });

// 3. Inspect stock levels for a specific wholesale SKU across all stores
const item = await db.collection('whitems').findOne({ itemsCode: '900786098' });
console.log('Stock distribution for', item.name, item.stock);
```
