# Design System & UI/UX Standards - Bilal Accounting & Sales (BAS)

## 1. Design Philosophy & High-Density ERP Architecture

**BAS** is engineered as a high-density, keyboard-first enterprise desktop application. Built for fast-paced retail pharmacies, supermarkets, and wholesale distribution warehouses, the UI prioritizes transactional speed, visual clarity, and sub-second feedback over decorative ornamentation.

### Core Pillars:
1. **Keyboard-First Ergonomics**: Every transactional screen can be operated 100% via keyboard (`Enter`, `Tab`, `F-keys`, `Esc`), eliminating mouse latency at billing counters.
2. **Tabular Precision**: Financial tables utilize compact row padding, right-aligned monetary numbers, and tabular figures (`tnum`) for effortless vertical visual scanning.
3. **Information Density**: Compact whitespace maximizes visible rows without cluttering, allowing operators to review 50+ invoice items on a single screen without scrolling fatigue.
4. **Predictable Status Semantics**: Distinct status badges (Posted, Draft, Cancelled) provide immediate operational confirmation.

---

## 2. Design Tokens & CSS Variable System

The ERP theme uses a curated grayish-blue corporate palette defined in `Frontend/public/css/`:

```css
:root {
  /* Brand Colors */
  --primary-navy: #1e3a8a;       /* Main top navbar, brand headers */
  --primary-blue: #2563eb;       /* Primary action buttons, active links */
  --primary-blue-hover: #1d4ed8; /* Button hover state */
  --primary-dark: #0f172a;       /* Text primary, high-contrast headings */

  /* Neutral Backgrounds & Surfaces */
  --bg-app: #f8fafc;             /* Global application canvas background */
  --bg-surface: #ffffff;         /* Cards, modals, data tables */
  --bg-subtle: #f1f5f9;          /* Table zebra striping, input disabled */
  --border-color: #e2e8f0;       /* Table borders, card outlines */
  --border-focus: #3b82f6;       /* Input focus ring */

  /* Typography Colors */
  --text-primary: #0f172a;       /* Body text, table data */
  --text-secondary: #475569;     /* Labels, subtitles */
  --text-muted: #94a3b8;         /* Placeholders, disabled text */
  --text-inverse: #ffffff;       /* Text on dark navy backgrounds */

  /* Semantic Status Tokens */
  --status-posted: #059669;      /* Green - Posted invoices, cleared cheques */
  --status-posted-bg: #d1fae5;
  --status-pending: #d97706;     /* Amber - Draft sales, unverified attendance */
  --status-pending-bg: #fef3c7;
  --status-cancelled: #dc2626;   /* Red - Cancelled bills, negative stock, alerts */
  --status-cancelled-bg: #fee2e2;
  --status-info: #2563eb;        /* Blue - Informational notices, active items */
  --status-info-bg: #dbeafe;

  /* Shadows & Elevations */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}
```

---

## 3. Typography & Numerical Alignment

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  background-color: var(--bg-app);
}

/* Tabular figures for financial numbers */
.text-numeric, .table-amount, .invoice-total {
  font-family: "SF Mono", Consolas, "Liberation Mono", Menlo, Courier, monospace;
  font-feature-settings: "tnum" 1;
  text-align: right;
  letter-spacing: -0.02em;
}
```

### Type Scale Hierarchy
- **Page Titles**: 22px / Bold (700)
- **Section Headers & Card Titles**: 16px / Semi-Bold (600)
- **Input Labels & Field Names**: 12px / Medium (500)
- **Table Data Cells**: 13px / Regular (400)
- **Badge Indicators**: 11px / Semi-Bold (600) / Uppercase
- **Prominent Totals (Grand Total)**: 24px - 32px / Bold (700) / Monospace

---

## 4. Layout Architecture & Component Patterns

### 4.1. The Standard ERP Shell
```html
<div class="app-layout">
  <!-- Top Navigation Bar -->
  <header class="navbar">
    <div class="nav-brand">
      <img src="/images/logo.png" alt="BAS Logo" class="brand-logo" />
      <span class="brand-title">BAS ERP</span>
    </div>
    <div class="nav-menu">
      <button class="nav-btn"><i class="fas fa-bars"></i> MENU</button>
    </div>
    <div class="nav-right">
      <span class="branch-badge"><i class="fas fa-building"></i> Head Office</span>
      <span class="user-profile"><i class="fas fa-user-circle"></i> Bilal Sh</span>
    </div>
  </header>

  <div class="app-body">
    <!-- Main Content Canvas -->
    <main class="main-content">
      <!-- Injected EJS View Content -->
    </main>
  </div>
</div>
```

### 4.2. Master-Detail Transaction Grid (Wholesale & POS)
```html
<div class="transaction-container">
  <!-- Header Bar -->
  <div class="form-header-card">
    <div class="row">
      <div class="col-3">
        <label>Invoice #</label>
        <input type="text" id="invoiceNo" readonly class="form-control-readonly" />
      </div>
      <div class="col-3">
        <label>Date</label>
        <input type="date" id="invoiceDate" class="form-control" />
      </div>
      <div class="col-6">
        <label>Customer (Alt + C)</label>
        <select id="customerSelect" class="form-control select2"></select>
      </div>
    </div>
  </div>

  <!-- Barcode Scanner & Line Item Entry Row -->
  <div class="scanner-entry-card">
    <div class="scanner-row">
      <input type="text" id="barcodeInput" placeholder="Scan Barcode / SKU..." autofocus />
      <select id="itemSelect" class="item-dropdown"></select>
      <input type="number" id="itemQty" placeholder="Qty" min="1" value="1" />
      <input type="number" id="itemPrice" placeholder="Rate" step="0.01" />
      <input type="number" id="itemDiscount" placeholder="Disc %" min="0" max="100" />
      <input type="text" id="itemLineTotal" readonly placeholder="Total" class="text-numeric" />
      <button id="addItemBtn" class="btn btn-primary"><i class="fas fa-plus"></i> Add</button>
    </div>
  </div>

  <!-- High-Density Transaction Table -->
  <div class="grid-table-card">
    <table class="table-erp">
      <thead>
        <tr>
          <th width="40">#</th>
          <th width="130">Barcode</th>
          <th>Item Description</th>
          <th width="80" class="text-center">Qty</th>
          <th width="100" class="text-right">Price</th>
          <th width="90" class="text-right">Retail</th>
          <th width="80" class="text-right">Disc %</th>
          <th width="120" class="text-right">Net Total</th>
          <th width="60" class="text-center">Action</th>
        </tr>
      </thead>
      <tbody id="invoiceTableBody">
        <!-- Dynamically rendered line item rows -->
      </tbody>
    </table>
  </div>

  <!-- Settlement Footer -->
  <div class="settlement-footer">
    <div class="settlement-notes">
      <textarea id="remarks" placeholder="Enter transaction remarks..."></textarea>
    </div>
    <div class="settlement-totals">
      <div class="summary-row">
        <span>Sub Total:</span>
        <span id="subTotalDisplay" class="text-numeric">0.00</span>
      </div>
      <div class="summary-row">
        <span>Total Discount:</span>
        <span id="discountDisplay" class="text-numeric">0.00</span>
      </div>
      <div class="summary-row grand-total-row">
        <span>NET TOTAL:</span>
        <span id="netTotalDisplay" class="text-numeric font-bold">0.00</span>
      </div>
      <div class="action-buttons">
        <button id="btnHold" class="btn btn-warning"><i class="fas fa-pause"></i> Hold (F8)</button>
        <button id="btnPost" class="btn btn-success"><i class="fas fa-check"></i> Post (F9)</button>
      </div>
    </div>
  </div>
</div>
```

---

## 5. Keyboard Navigation Standards

To guarantee fast transaction entry:
- **Auto-Focus**: Every transactional page automatically focuses `#barcodeInput` on load.
- **Enter Progression**:
  - Scanning a barcode populates the item fields and moves focus directly to `#itemQty`.
  - Pressing `Enter` on `#itemQty` calculates line math and advances to `#itemDiscount`.
  - Pressing `Enter` on `#itemDiscount` triggers `addItemToGrid()` and returns focus to `#barcodeInput`.
- **Global Function Keys**:
  - `F2`: Instant Search Modal (Fuzzy search by item name or supplier).
  - `F4`: Customer/Vendor Lookup Dialog.
  - `F8`: Hold active transaction.
  - `F9`: Post transaction / Open payment modal.
  - `Escape`: Clear current input fields or dismiss modal.

---

## 6. Print Output Layout Specifications

### 6.1. Thermal POS Receipts (80mm & 58mm ESC/POS)
- **Paper Width**: 80mm (exact printable width: 72mm / 576 dots) or 58mm (exact printable width: 48mm / 384 dots).
- **Line Length**: 48 characters for 80mm; 32 characters for 58mm in standard Font A (12x24 dots).
- **Control Sequences**:
  - Initialize: `ESC @` (`\x1b\x40`)
  - Center Align: `ESC a 1` (`\x1b\x61\x01`)
  - Bold On: `ESC E 1` (`\x1b\x45\x01`)
  - Double Height/Width: `GS ! 17` (`\x1d\x21\x11`)
  - Cut Paper: `GS V 66 0` (`\x1d\x56\x42\x00`)
  - Cash Drawer Pulse: `ESC p 0 25 250` (`\x1b\x70\x00\x19\xfa`)

### 6.2. A4 Wholesale Delivery Challans & Tax Invoices
- **Page Dimensions**: Standard A4 (210mm x 297mm) with 10mm margins.
- **Table Design**: Formal borders (`1px solid #000`), itemized columns, sub-totals per product category, and corporate NTN/STRN tax registration blocks.
- **Dual Sign-off Blocks**: Explicit printed lines for *"Prepared By"*, *"Dispatched By"*, and *"Customer Acknowledgement & Stamp"*.

### 6.3. Crystal Reports Thermal Barcode Stickers (Desktop App)
- **Label Dimensions**:
  - 38mm (width) x 25mm (height) thermal transfer.
  - 50mm (width) x 25mm (height) thermal transfer.
- **Content Formatting**:
  - Store Name: 7pt Bold Centered.
  - Product Description: 8pt Regular (Truncated to 24 characters).
  - Barcode Graphic: Code 128 symbology, narrow bar width 2 mils, height 12mm.
  - Human-Readable SKU: 8pt Monospace below barcode.
  - Retail MRP: 9pt Bold (e.g. `Rs. 650.00`).
