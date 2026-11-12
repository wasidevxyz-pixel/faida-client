const WHLedger = require('../models/WHLedger');
const WHCustomer = require('../models/WHCustomer');

/**
 * Update Customer Ledger and Balance
 * @param {Object} data - Ledger entry data
 * @param {string} data.customer - Customer ID
 * @param {Date} data.date - Transaction date
 * @param {string} data.description - Narration
 * @param {string} data.refType - Sale, SaleReturn, Payment
 * @param {string} data.refId - Reference Document ID
 * @param {number} data.debit - Debit amount
 * @param {number} data.credit - Credit amount
 * @param {string} data.createdBy - User ID
 */
exports.addLedgerEntry = async (data) => {
    try {
        const session = data.session;
        const { session: _session, ...ledgerData } = data;
        // Update Customer Record using atomic $inc to prevent race conditions
        const change = (ledgerData.debit || 0) - (ledgerData.credit || 0);
        const updatedCustomer = await WHCustomer.findByIdAndUpdate(
            ledgerData.customer,
            { $inc: { currentBalance: change } },
            { returnDocument: 'after', ...(session ? { session } : {}) }
        );

        if (!updatedCustomer) throw new Error('Failed to update customer balance');

        const ledgerDataToCreate = {
            ...ledgerData,
            runningBalance: updatedCustomer.currentBalance
        };
        const ledgerEntry = session
            ? (await WHLedger.create([ledgerDataToCreate], { session }))[0]
            : await WHLedger.create(ledgerDataToCreate);

        return ledgerEntry;
    } catch (error) {
        console.error('Ledger Error:', error);
        throw error;
    }
};

/**
 * Delete Ledger Entry and Reverse Balance
 * @param {string} refId - Reference ID of the document being deleted
 * @param {Object} fallback - Optional data for manual reversal if ledger entry not found
 * @param {string} fallback.customer - Customer ID
 * @param {number} fallback.debit - Amount to subtract from balance
 * @param {number} fallback.credit - Amount to add to balance
 */
exports.deleteLedgerEntry = async (refId, fallback = null, session = null) => {
    try {
        const query = WHLedger.findOne({ refId });
        if (session) query.session(session);
        const entry = await query;

        if (entry) {
            // Reverse balance: $inc with negative of original change
            const change = (entry.debit || 0) - (entry.credit || 0);
            await WHCustomer.findByIdAndUpdate(
                entry.customer,
                { $inc: { currentBalance: -change } },
                session ? { session } : undefined
            );
            await WHLedger.deleteOne({ _id: entry._id }, session ? { session } : undefined);
            console.log(`Ledger entry found for ${refId}. Reversed customer balance.`);
        } else if (fallback && fallback.customer) {
            // If No ledger entry found (old data), do manual reversal
            const change = (fallback.debit || 0) - (fallback.credit || 0);
            await WHCustomer.findByIdAndUpdate(
                fallback.customer,
                { $inc: { currentBalance: -change } },
                session ? { session } : undefined
            );
            console.log(`No ledger entry for ${refId}. Performed manual fallback reversal.`);
        }
    } catch (error) {
        console.error('Delete Ledger Error:', error);
        throw error;
    }
};
