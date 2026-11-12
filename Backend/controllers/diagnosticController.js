const Bank = require('../models/Bank');
const Ledger = require('../models/Ledger');
const BankTransaction = require('../models/BankTransaction');
const DailyCash = require('../models/DailyCash');
const BankTransfer = require('../models/BankTransfer');

exports.checkBankLedgerData = async (req, res) => {
    try {
        // 1. Get all banks
        const banks = await Bank.find().select('bankName branch isActive').lean();

        // 2. Get all bank ledgers
        const ledgers = await Ledger.find({ ledgerType: 'bank' }).select('ledgerName ledgerType isActive').lean();

        // 3. Get unique bank names from BankTransactions
        const transactionBankNames = await BankTransaction.distinct('bankName');

        // 4. Get unique bank IDs from DailyCash
        const dailyCashBankIds = await DailyCash.distinct('bank');
        const dailyCashBanks = await Bank.find({ _id: { $in: dailyCashBankIds } }).select('bankName').lean();
        const dailyCashBankNames = dailyCashBanks.map(b => b.bankName);

        // 5. Get unique bank names from BankTransfer
        const transferFromBankNames = await BankTransfer.distinct('fromBank');
        const transferToBankNames = await BankTransfer.distinct('toBank');
        const allTransferBankNames = [...new Set([...transferFromBankNames, ...transferToBankNames])];

        // 6. Check which banks have ledgers
        const bankNames = banks.map(b => b.bankName);
        const ledgerNames = ledgers.map(l => l.ledgerName);

        const banksWithoutLedgers = bankNames.filter(bn => !ledgerNames.includes(bn));
        const ledgersWithoutBanks = ledgerNames.filter(ln => !bankNames.includes(ln));

        // 7. Check which ledgers have transactions
        const ledgersWithTransactions = ledgerNames.filter(ln => transactionBankNames.includes(ln));
        const ledgersWithoutTransactions = ledgerNames.filter(ln => !transactionBankNames.includes(ln));

        // 8. Get transaction counts per bank
        const transactionCounts = await BankTransaction.aggregate([
            {
                $group: {
                    _id: '$bankName',
                    count: { $sum: 1 }
                }
            }
        ]);

        // 9. Get DailyCash counts per bank
        const dailyCashCounts = await DailyCash.aggregate([
            {
                $lookup: {
                    from: 'banks',
                    localField: 'bank',
                    foreignField: '_id',
                    as: 'bankInfo'
                }
            },
            { $unwind: '$bankInfo' },
            {
                $group: {
                    _id: '$bankInfo.bankName',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalBanks: banks.length,
                    totalLedgers: ledgers.length,
                    totalUniqueBankNamesInTransactions: transactionBankNames.length,
                    totalUniqueBankNamesInDailyCash: dailyCashBankNames.length,
                    totalUniqueBankNamesInTransfers: allTransferBankNames.length,
                    banksWithoutLedgers: banksWithoutLedgers.length,
                    ledgersWithoutBanks: ledgersWithoutBanks.length,
                    ledgersWithTransactions: ledgersWithTransactions.length,
                    ledgersWithoutTransactions: ledgersWithoutTransactions.length
                },
                banks: banks,
                ledgers: ledgers,
                transactionBankNames: transactionBankNames,
                dailyCashBankNames: dailyCashBankNames,
                transferBankNames: allTransferBankNames,
                transactionCounts: transactionCounts,
                dailyCashCounts: dailyCashCounts,
                issues: {
                    banksWithoutLedgers: banksWithoutLedgers,
                    ledgersWithoutBanks: ledgersWithoutBanks,
                    ledgersWithoutTransactions: ledgersWithoutTransactions
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.fixBankLedgerNames = async (req, res) => {
    try {
        // Get all unique bank names from transactions
        const transactionBankNames = await BankTransaction.distinct('bankName');

        // Get all bank ledgers
        const ledgers = await Ledger.find({ ledgerType: 'bank' });

        const created = [];

        // For each transaction bank name, ensure there's a matching ledger
        for (const bankName of transactionBankNames) {
            const existingLedger = ledgers.find(l => l.ledgerName === bankName);

            if (!existingLedger) {
                // Create new ledger with the exact transaction bank name
                try {
                    await Ledger.create({
                        ledgerName: bankName,
                        ledgerType: 'bank',
                        openingBalance: 0,
                        currentBalance: 0,
                        isActive: true,
                        createdBy: req.user ? req.user._id : null
                    });
                    created.push(bankName);
                    console.log(`✓ Created ledger for transaction bank: ${bankName}`);
                } catch (error) {
                    console.error(`✗ Failed to create ledger for ${bankName}:`, error.message);
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Created ${created.length} ledgers to match transaction bank names`,
            data: {
                transactionBankNames,
                created,
                existingLedgers: ledgers.map(l => l.ledgerName)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
