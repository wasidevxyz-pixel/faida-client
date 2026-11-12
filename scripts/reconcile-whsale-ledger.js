/**
 * Targeted Wholesale Invoices & Customer Ledgers Repair Script
 * 
 * Safety Guarantee:
 * - Operates ONLY on the specified invoices (defaults to the 4 invoices from 21/09/2026):
 *     1. INV-WS-2026-0401
 *     2. INV-WS-2026-0397
 *     3. INV-WS-2026-0396
 *     4. INV-WS-2026-0395
 * - Older or other historical invoices are 100% UNTOUCHED (preventing any impact from weekly item price updates).
 * - Only the customers associated with these invoices have their ledger running balances and currentBalance synchronized.
 * 
 * Usage:
 *   node scripts/reconcile-whsale-ledger.js                       # Reconciles all 4 invoices above
 *   node scripts/reconcile-whsale-ledger.js --dry-run            # Preview changes without modifying database
 *   node scripts/reconcile-whsale-ledger.js --invoices INV-WS-2026-0401,INV-WS-2026-0397
 *   node scripts/reconcile-whsale-ledger.js --invoice INV-WS-2026-0401
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.resolve(__dirname, '../Backend/.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const isDryRun = process.argv.includes('--dry-run');

// Default target invoices (as requested by user)
let targetInvoices = [
  'INV-WS-2026-0401',
  'INV-WS-2026-0397',
  'INV-WS-2026-0396',
  'INV-WS-2026-0395'
];

// Allow CLI override via --invoices or --invoice
const invoicesArgIdx = process.argv.indexOf('--invoices');
const invoiceArgIdx = process.argv.indexOf('--invoice');

if (invoicesArgIdx !== -1 && process.argv[invoicesArgIdx + 1]) {
  targetInvoices = process.argv[invoicesArgIdx + 1].split(',').map(s => s.trim()).filter(Boolean);
} else if (invoiceArgIdx !== -1 && process.argv[invoiceArgIdx + 1]) {
  targetInvoices = [process.argv[invoiceArgIdx + 1].trim()];
}

async function runTargetedReconciliation() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bas-software';

  console.log(`\n======================================================`);
  console.log(` Targeted Wholesale Invoices & Customer Ledgers Repair`);
  console.log(` Mode:            ${isDryRun ? 'DRY-RUN (Preview only, no DB writes)' : 'LIVE (Applying fixes to database)'}`);
  console.log(` Target Invoices: ${targetInvoices.join(', ')}`);
  console.log(` Note:            All other invoices and customers are 100% UNTOUCHED.`);
  console.log(` MongoDB URI:     ${mongoUri.replace(/:([^:@]{4})[^:@]*@/, ':$1***@')}`);
  console.log(`======================================================\n`);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const salesCol = db.collection('whsales');
  const ledgersCol = db.collection('whledgers');
  const customersCol = db.collection('whcustomers');
  const itemsCol = db.collection('whitems');

  let invoicesRepaired = 0;
  let ledgersSynced = 0;
  let affectedCustomerIds = new Set();
  const updatedSaleTotals = new Map(); // saleId -> netTotal

  for (const invNo of targetInvoices) {
    console.log(`\n------------------------------------------------------`);
    console.log(`Checking Invoice: ${invNo}`);
    console.log(`------------------------------------------------------`);

    const query = {
      $or: [
        { invoiceNo: invNo },
        { invoiceNo: { $regex: invNo, $options: 'i' } }
      ]
    };
    const sale = await salesCol.findOne(query);

    if (!sale) {
      console.log(`  ⚠️ Invoice "${invNo}" not found in database. Skipping.`);
      continue;
    }

    if (sale.customer) {
      affectedCustomerIds.add(String(sale.customer));
    }

    // Load master items for this invoice
    const itemIds = (sale.items || []).map(i => i.item).filter(Boolean);
    const masterItems = await itemsCol.find({ _id: { $in: itemIds } }).toArray();
    const itemMap = new Map(masterItems.map(i => [String(i._id), i]));

    let itemsModified = 0;
    let updatedItems = [];
    let calculatedSubTotal = 0;

    for (let i = 0; i < (sale.items || []).length; i++) {
      const it = { ...sale.items[i] };
      const master = itemMap.get(String(it.item));

      if (master) {
        const correctCost = (master.costPrice !== undefined && master.costPrice !== null && master.costPrice > 0)
          ? master.costPrice
          : (master.salePrice || it.pcsPrice);
        const correctRetail = (master.retailPrice !== undefined && master.retailPrice !== null && master.retailPrice > 0)
          ? master.retailPrice
          : it.retailPrice;

        const priceMismatch = (it.pcsPrice !== correctCost);
        const retailMismatch = (it.retailPrice !== correctRetail);

        if (priceMismatch || retailMismatch) {
          console.log(`  [Fixing Item ${i + 1}] ${master.name} (Barcode: ${master.barcode || it.barcode}):`);
          if (priceMismatch) console.log(`    Cost / Pcs Price: ${it.pcsPrice} -> ${correctCost}`);
          if (retailMismatch) console.log(`    Retail Price:     ${it.retailPrice} -> ${correctRetail}`);

          it.pcsPrice = correctCost;
          it.retailPrice = correctRetail;
          itemsModified++;
        }
      }

      // Recalculate row math
      const qty = Number(it.quantity) || 0;
      const price = Number(it.pcsPrice) || 0;
      const rowSub = Math.round(qty * price * 100) / 100;
      it.subTotal = rowSub;
      it.totalBeforeIncentive = rowSub;

      let discAmt = Number(it.discountAmount) || 0;
      if (it.discountPercent && Number(it.discountPercent) > 0) {
        discAmt = Math.round((rowSub * Number(it.discountPercent) / 100) * 100) / 100;
      }
      it.discountAmount = discAmt;

      const taxAmt = Number(it.taxAmount) || 0;
      const rowNet = Math.round((rowSub - discAmt + taxAmt) * 100) / 100;
      it.netTotal = rowNet;

      calculatedSubTotal += rowNet;
      updatedItems.push(it);
    }

    const calculatedNetTotal = Math.round((
      calculatedSubTotal -
      (Number(sale.discount) || 0) +
      (Number(sale.tax) || 0) +
      (Number(sale.freight) || 0)
    ) * 100) / 100;

    const netDiff = Math.round((calculatedNetTotal - (Number(sale.netTotal) || 0)) * 100) / 100;
    updatedSaleTotals.set(String(sale._id), calculatedNetTotal);

    if (itemsModified > 0 || Math.abs(netDiff) > 0.01) {
      console.log(`  Invoice Totals Changed: ${sale.netTotal} -> ${calculatedNetTotal} (diff: ${netDiff > 0 ? '+' : ''}${netDiff})`);
      if (!isDryRun) {
        await salesCol.updateOne(
          { _id: sale._id },
          {
            $set: {
              items: updatedItems,
              subTotal: calculatedSubTotal,
              netTotal: calculatedNetTotal,
              updatedAt: new Date()
            }
          }
        );
        console.log(`  ✅ Invoice ${sale.invoiceNo} items and totals updated in database.`);
      } else {
        console.log(`  [Dry-Run] Invoice ${sale.invoiceNo} would be updated in database.`);
      }
      invoicesRepaired++;
    } else {
      console.log(`  Invoice ${sale.invoiceNo} items and net total are already correct (${calculatedNetTotal}).`);
    }

    // Check WHLedger entry for this sale
    const ledgerEntry = await ledgersCol.findOne({
      refType: 'Sale',
      refId: sale._id
    });

    if (!ledgerEntry) {
      console.log(`  ⚠️ No WHLedger entry found for invoice ${sale.invoiceNo}`);
    } else {
      const currentDebit = Math.round((Number(ledgerEntry.debit) || 0) * 100) / 100;
      if (Math.abs(currentDebit - calculatedNetTotal) > 0.01) {
        console.log(`  Ledger Debit Adjustment: ${currentDebit} -> ${calculatedNetTotal}`);
        if (!isDryRun) {
          await ledgersCol.updateOne(
            { _id: ledgerEntry._id },
            { $set: { debit: calculatedNetTotal, updatedAt: new Date() } }
          );
          console.log(`  ✅ WHLedger entry updated.`);
        } else {
          console.log(`  [Dry-Run] WHLedger entry would be updated.`);
        }
        ledgersSynced++;
      } else {
        console.log(`  WHLedger entry debit (${currentDebit}) matches invoice net total.`);
      }
    }
  }

  // Recalculate customer balances ONLY for the customers belonging to these invoices
  console.log(`\n======================================================`);
  console.log(`Reconciling Customer Ledgers & Balances (Target Customers Only)`);
  console.log(`======================================================\n`);

  let customerBalancesUpdated = 0;

  for (const custIdStr of affectedCustomerIds) {
    const custId = new mongoose.Types.ObjectId(custIdStr);
    const customer = await customersCol.findOne({ _id: custId });

    if (!customer) continue;

    console.log(`Customer: ${customer.customerName} (${customer.code || customer._id})`);

    const customerLedgers = await ledgersCol.find({ customer: custId })
      .sort({ date: 1, createdAt: 1 })
      .toArray();

    let runningBal = 0;
    let ledgerEntriesFixed = 0;

    for (const entry of customerLedgers) {
      // Use updated debit if this entry corresponds to one of our target sales
      const debit = (entry.refType === 'Sale' && updatedSaleTotals.has(String(entry.refId)))
        ? updatedSaleTotals.get(String(entry.refId))
        : (Number(entry.debit) || 0);

      const credit = Number(entry.credit) || 0;
      runningBal = Math.round((runningBal + debit - credit) * 100) / 100;

      if (Math.abs((entry.runningBalance || 0) - runningBal) > 0.01) {
        if (!isDryRun) {
          await ledgersCol.updateOne(
            { _id: entry._id },
            { $set: { runningBalance: runningBal } }
          );
        }
        ledgerEntriesFixed++;
      }
    }

    const currentBal = Math.round((Number(customer.currentBalance) || 0) * 100) / 100;
    const balDiff = Math.round((runningBal - currentBal) * 100) / 100;

    console.log(`  Current Balance in DB: ${currentBal}`);
    console.log(`  Calculated Balance:    ${runningBal}`);
    console.log(`  Adjustment:            ${balDiff > 0 ? '+' : ''}${balDiff}`);
    console.log(`  Ledger rows updated:   ${ledgerEntriesFixed}`);

    if (Math.abs(balDiff) > 0.01) {
      if (!isDryRun) {
        await customersCol.updateOne(
          { _id: customer._id },
          { $set: { currentBalance: runningBal, updatedAt: new Date() } }
        );
        console.log(`  ✅ Customer currentBalance updated in database.`);
      } else {
        console.log(`  [Dry-Run] Customer currentBalance would be updated.`);
      }
      customerBalancesUpdated++;
    } else {
      console.log(`  Customer currentBalance is already 100% in sync.`);
    }
    console.log('');
  }

  console.log(`======================================================`);
  console.log(` Reconciliation Summary`);
  console.log(`======================================================`);
  console.log(` Target Invoices Checked:     ${targetInvoices.length}`);
  console.log(` Invoices Repaired:           ${invoicesRepaired}`);
  console.log(` Ledger Entries Synced:       ${ledgersSynced}`);
  console.log(` Customer Balances Adjusted:  ${customerBalancesUpdated}`);
  console.log(` Mode:                        ${isDryRun ? 'DRY-RUN (No DB changes)' : 'LIVE (All changes applied successfully)'}`);
  console.log(` Isolation:                   ZERO other invoices or customers touched.`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

runTargetedReconciliation().catch(err => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
