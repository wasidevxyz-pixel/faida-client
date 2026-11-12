// Dashboard JavaScript - Professional Upgrade
let currentDateFilter = 'month';
let currentFromDate = '';
let currentToDate = '';
let salesChart = null;

// Helper: Format Currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

// Init Logic
const initDashboard = () => {
    console.log('Dashboard Initializing...');

    // Check auth
    if (window.pageAccess && typeof window.pageAccess.checkAuthentication === 'function') {
        if (!window.pageAccess.checkAuthentication()) return;
    } else {
        console.warn('pageAccess not loaded');
    }

    // Set user name
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (document.getElementById('userName')) {
        document.getElementById('userName').textContent = user.name || 'User';
    }

    // Initialize with Month filter (Force Jan Data)
    setDateFilter('month');
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

function setDateFilter(filter) {
    currentDateFilter = filter;

    // Update UI
    document.querySelectorAll('.date-filter-pills .nav-link').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.date-filter-pills .nav-link[data-filter="${filter}"]`).classList.add('active');

    const today = new Date();
    let fromDate, toDate;

    switch (filter) {
        case 'today':
            fromDate = new Date(today);
            toDate = new Date(today);
            console.log('Filter Today:', fromDate);
            break;
        case 'yesterday':
            fromDate = new Date(today);
            fromDate.setDate(today.getDate() - 1);
            toDate = new Date(fromDate);
            console.log('Filter Yesterday:', fromDate);
            break;
        case 'week':
            // Start of week (Monday)
            const day = today.getDay();
            const diff = today.getDate() - day + (day === 0 ? -6 : 1);
            fromDate = new Date(today.setDate(diff));
            toDate = new Date(); // Up to now
            break;
        case 'month':
            fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
            toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'custom':
            document.getElementById('customDateRange').classList.remove('d-none');
            return; // Wait for apply
    }

    if (filter !== 'custom') {
        document.getElementById('customDateRange').classList.add('d-none');
        currentFromDate = formatDateForAPI(fromDate);
        currentToDate = formatDateForAPI(toDate);
        refreshDashboard();
    }
}

function applyCustomDateFilter() {
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;
    if (!from || !to) {
        alert('Please select both dates');
        return;
    }
    currentFromDate = from;
    currentToDate = to;
    refreshDashboard();
}

function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}



function updateDashboardHeaders(fromDate, toDate) {
    // 1. Format Date Text
    let text = '';
    const fDate = new Date(fromDate);
    if (currentDateFilter === 'month') {
        text = fDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (currentDateFilter === 'today') {
        text = `Today (${fDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
    } else if (currentDateFilter === 'yesterday') {
        text = `Yesterday (${fDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
    } else {
        const tDate = new Date(toDate);
        text = `${fDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${tDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    // 2. Update Payment Report Subtitle
    const subtitle = document.getElementById('paymentReportSubtitle');
    if (subtitle) {
        subtitle.textContent = text;
        // Visual feedback
        subtitle.style.fontWeight = 'bold';
        subtitle.classList.remove('text-muted');
        subtitle.classList.add('text-primary');
    }

    // 3. Update Main Title (Executive Board)
    const mainTitle = document.querySelector('.dashboard-section-title h3');
    if (mainTitle) {
        mainTitle.innerHTML = `<i class="fas fa-chart-pie me-2"></i>Executive Board <span class="fs-6 text-muted ms-2 fw-normal">(${text})</span>`;
    }

    // 4. Hide conflicting local Payment Period Filter
    const pf = document.getElementById('paymentPeriodFilter');
    if (pf && pf.parentElement) pf.parentElement.style.display = 'none';
}

// Shared State for Dashboard Data
let globalSheets = [];
let globalPurchases = [];
let globalExpenses = [];
let globalVouchers = [];
let globalBranchMap = null;
let globalDepartmentsMap = null;
let globalWarehouseCatsMap = null;
let globalEnabledStores = [];

async function refreshDashboard() {
    // Reset State
    globalSheets = [];
    globalPurchases = [];
    globalExpenses = [];
    globalVouchers = [];
    globalBranchMap = null;
    globalDepartmentsMap = null;
    globalWarehouseCatsMap = null;
    globalEnabledStores = [];

    // Set Loading Indicators
    updateDashboardHeaders(currentFromDate, currentToDate); // Update UI Text
    const containerA = document.getElementById('categoryBreakdownContainer');
    const cardsA = document.getElementById('categoryCardsContainer');
    const paymentA = document.getElementById('paymentCategoryBreakdown');
    const containerB = document.getElementById('branchCardsContainer');
    const tableB = document.getElementById('branchTableBody');
    const containerC = document.getElementById('branchDeptBreakdownContainer');

    const loadingHtml = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Loading Dashboard Data...</p></div>';

    if (containerA) containerA.innerHTML = loadingHtml;
    if (cardsA) cardsA.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-primary"></div></div>';
    if (paymentA) paymentA.innerHTML = loadingHtml;
    if (containerB) containerB.innerHTML = loadingHtml;
    if (tableB) tableB.innerHTML = '';
    if (containerC) containerC.innerHTML = loadingHtml;

    try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const limit = 10000;

        console.time('Dashboard Parallel Fetch');

        // Initiate all requests in parallel
        const [
            storeRes,
            deptRes,
            catRes,
            sheetsRes,
            vouchRes,
            purchRes,
            expRes,
            csRes
        ] = await Promise.all([
            fetch('/api/v1/stores', { headers }),
            fetch('/api/v1/departments', { headers }),
            fetch('/api/v1/customer-categories', { headers }),
            fetch(`/api/v1/closing-sheets/report?startDate=${currentFromDate}&endDate=${currentToDate}&branch=all`, { headers }),
            // Use 'select' to only fetch required fields for vouchers, purchases, and expenses
            fetch(`/api/v1/vouchers?startDate=${currentFromDate}&endDate=${currentToDate}&limit=${limit}&select=branch,voucherNo,entries,date`, { headers }),
            fetch(`/api/v1/purchases?startDate=${currentFromDate}&endDate=${currentToDate}&limit=${limit}&select=branch,grandTotal,date`, { headers }),
            fetch(`/api/v1/expenses?startDate=${currentFromDate}&endDate=${currentToDate}&limit=${limit}&select=branch,amount,date`, { headers }),
            fetch(`/api/v1/cash-sales?startDate=${currentFromDate}&endDate=${currentToDate}&branch=all&select=branch,totalAmount,department,cashCounter,date`, { headers })
        ]);

        // Parse all responses
        const [
            storeData,
            deptData,
            catData,
            sheetsData,
            vouchData,
            purchData,
            expData,
            csData
        ] = await Promise.all([
            storeRes.json(),
            deptRes.json(),
            catRes.json(),
            sheetsRes.json(),
            vouchRes.json(),
            purchRes.json(),
            expRes.json(),
            csRes.json()
        ]);

        console.timeEnd('Dashboard Parallel Fetch');

        // Process Metadata
        // Process Metadata - Filtered by User Access
        const user = JSON.parse(localStorage.getItem('user')) || {};
        // Fix: Ensure branch is a string to prevent "not a function" error
        const rawBranch = user.branch;
        const userBranch = (typeof rawBranch === 'string' ? rawBranch : String(rawBranch || '')).toLowerCase();

        globalEnabledStores = (storeData.data || []).filter(s => {
            if (!s.showOnDashboard) return false;
            if (!userBranch || userBranch.includes('all branches')) return true;
            return userBranch.includes((s.name || '').toLowerCase());
        });

        // Populate branch filter
        const branchFilter = document.getElementById('dashboardBranchFilter');
        if (branchFilter && branchFilter.options.length <= 1) { // Populate if not already populated
            branchFilter.innerHTML = '';

            if (globalEnabledStores.length > 1) {
                const allOpt = document.createElement('option');
                allOpt.value = 'all';
                allOpt.textContent = 'All Branches';
                branchFilter.appendChild(allOpt);
            }

            globalEnabledStores.forEach(store => {
                const option = document.createElement('option');
                option.value = store.name;
                option.textContent = store.name;
                branchFilter.appendChild(option);
            });

            if (globalEnabledStores.length === 1) {
                branchFilter.value = globalEnabledStores[0].name;
            }
        }

        const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        globalBranchMap = new Map();
        const selectedBranch = branchFilter ? branchFilter.value : 'all';
        if (selectedBranch !== 'all') {
            const selectedStore = globalEnabledStores.find(s => s.name === selectedBranch);
            if (selectedStore) globalBranchMap.set(normalize(selectedStore.name), selectedStore.name);
        } else {
            globalEnabledStores.forEach(s => globalBranchMap.set(normalize(s.name), s.name));
        }

        globalDepartmentsMap = {};
        window.globalFullDepartments = deptData.data || [];
        (deptData.data || []).forEach(d => globalDepartmentsMap[d._id] = d.name);

        globalWarehouseCatsMap = {};
        (catData.data || []).forEach(c => globalWarehouseCatsMap[c._id] = c.name);

        // Store data to global state
        globalSheets = sheetsData.data || [];
        globalVouchers = vouchData.data || [];
        globalPurchases = purchData.data || [];
        globalExpenses = expData.data || [];
        const cashSales = csData.data || [];

        // Processing and Rendering Section A
        if (containerA) {
            processAndRenderCategoryBreakdown(globalSheets, globalWarehouseCatsMap, globalBranchMap);
            processPaymentSection(globalSheets, [], globalWarehouseCatsMap, globalBranchMap, globalVouchers);
        }

        // Processing and Rendering Section B
        processSectionBLogic(globalSheets, globalPurchases, globalExpenses, globalBranchMap, globalDepartmentsMap, cashSales);

        // Processing and Rendering Section C
        processAndRenderBranchDeptBreakdown(globalSheets, cashSales, globalBranchMap, globalDepartmentsMap);

    } catch (error) {
        console.error("Dashboard Loading Error", error);
        if (containerA) containerA.innerHTML = `<div class="alert alert-danger">Error loading dashboard: ${error.message}</div>`;
    }
}

// Extracted Section B logic for cleaner flow
function processSectionBLogic(sheets, purchases, expenses, branchMap, departmentsMap, cashSales) {
    const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const branchStats = {};
    const getBranchObj = (name) => {
        if (!branchStats[name]) {
            branchStats[name] = {
                name: name,
                grossSale: 0, showOnDashboard: true, discountVal: 0, returnVal: 0, gst: 0, netSale: 0, cost: 0, daysCount: new Set()
            };
        }
        return branchStats[name];
    };

    // Init Branches (Only those in the active map)
    const activeBranches = new Set(branchMap.values());
    const storesToInit = activeBranches.size > 0 ?
        globalEnabledStores.filter(s => activeBranches.has(s.name)) :
        globalEnabledStores; // Fallback to all if empty (shouldn't happen)

    storesToInit.forEach(store => {
        getBranchObj(store.name);
    });

    // Sales Data
    sheets.forEach(sheet => {
        const targetBranchName = branchMap.get(normalize(sheet.branch));
        if (!targetBranchName) return;

        const b = getBranchObj(targetBranchName);
        b.daysCount.add(sheet.date.split('T')[0]);

        if (sheet.closing02) {
            const dataObj = sheet.closing02.data || sheet.closing02;
            if (!dataObj) return;

            Object.entries(dataObj).forEach(([deptId, val]) => {
                if (val && typeof val === 'object') {
                    // 1. Sales Calculation (Standard)
                    const sale = parseFloat(val.totalSaleComputer || val.grossSale || val.netSale || 0);
                    const disc = parseFloat(val.discountValue || 0);
                    b.netSale += sale;
                    b.discountVal += disc;

                    if (val.grossSale) b.grossSale += parseFloat(val.grossSale);
                    else b.grossSale += (sale + disc);

                    // 2. Cost Calculation (From Sales Breakdown - Plus Button)
                    if (val.salesBreakdown && typeof val.salesBreakdown === 'object') {
                        Object.values(val.salesBreakdown).forEach(breakdownItem => {
                            b.cost += parseFloat(breakdownItem.cost || 0);
                        });
                    }
                }
            });

            // Note: Legacy Warehouse Sale popup cost logic removed as per user request to use "Plus button cash Closing_2_Comp_Sale"
        }
    });

    // Sales Data from Cash Sales API (Optics / Counter Sales)
    if (cashSales && Array.isArray(cashSales)) {
        cashSales.forEach(s => {
            // if (s.mode === 'Bank') return; // User requested to INCLUDE Bank value as well


            const targetBranchName = branchMap.get(normalize(s.branch));
            if (!targetBranchName) return;

            const b = getBranchObj(targetBranchName);
            const amount = parseFloat(s.totalAmount || 0);

            // Add to totals
            b.netSale += amount;
            b.grossSale += amount;
        });
    }

    const finalBranchData = Object.values(branchStats).map(b => {
        const profit = b.netSale - b.cost;
        return {
            ...b,
            profit: profit,
            margin: b.netSale > 0 ? (profit / b.netSale) * 100 : 0,
            discPct: b.grossSale > 0 ? (b.discountVal / b.grossSale) * 100 : 0,
            avgDailySale: b.netSale / (b.daysCount.size || 1)
        };
    }).sort((a, b) => b.netSale - a.netSale);

    renderBranchCards(finalBranchData);
    renderBranchTable(finalBranchData);
}

let paymentDataCache = []; // Store calculated data for filtering

function processPaymentSection(sheets, expenses, categoriesMap, branchNameMap, vouchers) {
    const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const allowedBranchList = Array.from(new Set(branchNameMap.values()));

    // Structure: Map<CategoryName, Map<BranchName, {sale, cost, payment}>>
    const stats = {};

    // Initialize with warehouse categories (customer categories) only
    Object.values(categoriesMap).forEach(catName => {
        stats[catName] = {};
        allowedBranchList.forEach(b => {
            stats[catName][b] = { branch: b, sale: 0, cost: 0, payment: 0 };
        });
    });

    // Fill Sale/Cost from warehouse categories
    sheets.forEach(sheet => {
        const rawName = sheet.branch || 'Unknown';
        const targetBranchName = branchNameMap.get(normalize(rawName));
        if (!targetBranchName) return;

        const dataObj = sheet.closing02?.data || sheet.closing02;
        if (dataObj && dataObj.warehouseSale && Array.isArray(dataObj.warehouseSale)) {
            dataObj.warehouseSale.forEach(item => {
                const catName = categoriesMap[item.category];
                if (!catName) return;

                if (!stats[catName]) {
                    stats[catName] = {};
                    allowedBranchList.forEach(b => {
                        stats[catName][b] = { branch: b, sale: 0, cost: 0, payment: 0 };
                    });
                }

                if (!stats[catName][targetBranchName]) {
                    stats[catName][targetBranchName] = { branch: targetBranchName, sale: 0, cost: 0, payment: 0 };
                }

                stats[catName][targetBranchName].sale += parseFloat(item.sale || 0);
                stats[catName][targetBranchName].cost += parseFloat(item.cost || 0);
            });
        }
    });

    // Process Category Vouchers (Using pre-fetched vouchers)
    processCategoryVoucherPayments(vouchers, stats, categoriesMap, branchNameMap, allowedBranchList);
}

// Process Category Voucher payments (No Fetching)
function processCategoryVoucherPayments(vouchers, stats, categoriesMap, branchNameMap, allowedBranchList) {
    const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
        console.log('=== Processing Category Voucher Payments ===');
        console.log('Total vouchers available:', vouchers.length);

        // Filter to only Category Vouchers (entry with detail 'Category Wise Payment')
        vouchers.forEach(v => {
            if (!v || !v.entries || !Array.isArray(v.entries)) return;

            const rawBranch = v.branch || 'Unknown';
            const targetBranchName = branchNameMap.get(normalize(rawBranch));
            if (!targetBranchName) return;

            // Find the main entry that is a Category Wise Payment
            const categoryEntry = v.entries.find(e => e.detail === 'Category Wise Payment');
            if (!categoryEntry) {
                // Not a category voucher, skip
                return;
            }

            const categoryName = categoryEntry.account; // The account is the category name
            const amount = parseFloat(categoryEntry.debit || 0);

            console.log(`Category Voucher: ${v.voucherNo} - Category: ${categoryName}, Amount: ${amount}, Branch: ${targetBranchName}`);

            // Find matching category in our stats
            const matchingCategory = Object.keys(stats).find(catName => {
                return normalize(catName) === normalize(categoryName) ||
                    normalize(categoryName).includes(normalize(catName)) ||
                    normalize(catName).includes(normalize(categoryName));
            });

            if (matchingCategory && stats[matchingCategory] && stats[matchingCategory][targetBranchName]) {
                console.log(`✓ Matched to category: "${matchingCategory}"`);
                stats[matchingCategory][targetBranchName].payment += amount;
            } else {
                // If no exact match, try to add it under the exact category name
                if (!stats[categoryName]) {
                    stats[categoryName] = {};
                    allowedBranchList.forEach(b => {
                        stats[categoryName][b] = { branch: b, sale: 0, cost: 0, payment: 0 };
                    });
                }
                if (!stats[categoryName][targetBranchName]) {
                    stats[categoryName][targetBranchName] = { branch: targetBranchName, sale: 0, cost: 0, payment: 0 };
                }
                stats[categoryName][targetBranchName].payment += amount;
                console.log(`✓ Added new category: "${categoryName}"`);
            }
        });

        console.log('=== Payment Stats After Processing Category Vouchers ===', stats);

        paymentDataCache = stats;

    } catch (err) {
        console.error('Error processing category vouchers:', err);
    } finally {
        // Populate Dropdowns and render UI regardless of errors
        try {
            populatePaymentFilters(paymentDataCache || stats, allowedBranchList);
            renderPaymentUI();
        } catch (renderErr) {
            console.error('Error rendering payment UI:', renderErr);
            const container = document.getElementById('paymentCategoryBreakdown');
            if (container) container.innerHTML = '<div class="text-center text-danger py-3">Error rendering payment data</div>';
        }
    }
}

function populatePaymentFilters(stats, branches) {
    // Populate Branch Filter
    const branchFilter = document.getElementById('paymentBranchFilter');
    if (branchFilter) {
        const currentBranch = branchFilter.value;
        branchFilter.innerHTML = '<option value="all">All Branches</option>';
        branches.forEach(b => {
            branchFilter.innerHTML += `<option value="${b}">${b}</option>`;
        });
        if (currentBranch) branchFilter.value = currentBranch;
        branchFilter.onchange = renderPaymentUI;
    }

    // Populate Category Filter
    const categoryFilter = document.getElementById('paymentCategoryFilter');
    if (categoryFilter) {
        const currentCat = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="all">All Categories</option>';
        Object.keys(stats).sort().forEach(c => {
            categoryFilter.innerHTML += `<option value="${c}">${c}</option>`;
        });
        if (currentCat && stats[currentCat]) categoryFilter.value = currentCat;
        categoryFilter.onchange = renderPaymentUI;
    }
}

function renderPaymentUI() {
    const branchFilter = document.getElementById('paymentBranchFilter');
    const categoryFilter = document.getElementById('paymentCategoryFilter');
    const container = document.getElementById('paymentCategoryBreakdown');

    if (!container || !paymentDataCache || Object.keys(paymentDataCache).length === 0) {
        if (container) container.innerHTML = '<div class="text-center text-muted py-3">No payment data available</div>';
        return;
    }

    const selectedBranch = branchFilter ? branchFilter.value : 'all';
    const selectedCategory = categoryFilter ? categoryFilter.value : 'all';

    let totalSale = 0, totalCost = 0, totalPayment = 0;
    let html = '';

    // Filter categories
    const categoriesToShow = selectedCategory === 'all' ?
        Object.keys(paymentDataCache).sort() :
        [selectedCategory];

    categoriesToShow.forEach(catName => {
        const branchMap = paymentDataCache[catName];
        if (!branchMap) return;

        let catSale = 0, catCost = 0, catPayment = 0;
        let branchRows = '';

        // Filter and aggregate branches
        const branchesToShow = selectedBranch === 'all' ?
            Object.values(branchMap) :
            Object.values(branchMap).filter(b => b.branch === selectedBranch);

        const sortedBranches = branchesToShow.sort((a, b) => b.sale - a.sale);

        sortedBranches.forEach((b, idx) => {
            if (b.sale === 0 && b.cost === 0 && b.payment === 0) return; // Skip empty rows

            catSale += b.sale;
            catCost += b.cost;
            catPayment += b.payment;

            const balance = b.cost - b.payment;

            branchRows += `
                <tr>
                    <td class="text-center fw-bold d-none d-md-table-cell">${idx + 1}</td>
                    <td>${b.branch}</td>
                    <td class="text-end">${formatCurrency(b.sale)}</td>
                    <td class="text-end">${formatCurrency(b.cost)}</td>
                    <td class="text-end">${formatCurrency(b.payment)}</td>
                    <td class="text-end fw-bold ${balance > 0 ? 'text-danger' : 'text-success'}">${formatCurrency(balance)}</td>
                </tr>
            `;
        });

        if (branchRows) {
            totalSale += catSale;
            totalCost += catCost;
            totalPayment += catPayment;

            const catBalance = catCost - catPayment;

            html += `
                <div class="category-detail-card mb-3">
                    <div class="category-header" style="background-color: #0288d1;">
                        <i class="fas fa-box me-2"></i> ${catName}
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover table-sm mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th style="width: 5%;" class="text-center d-none d-md-table-cell">Rank</th>
                                    <th style="width: 25%;">Branch</th>
                                    <th style="width: 17.5%;" class="text-end">Sale</th>
                                    <th style="width: 17.5%;" class="text-end">Cost</th>
                                    <th style="width: 17.5%;" class="text-end">
                                        <span class="d-md-none">Paid</span>
                                        <span class="d-none d-md-inline">Category Payments</span>
                                    </th>
                                    <th style="width: 17.5%;" class="text-end">
                                        <span class="d-md-none">Bal</span>
                                        <span class="d-none d-md-inline">Balance Payment</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                ${branchRows}
                                <tr class="grand-total-row">
                                    <td class="d-none d-md-table-cell"></td>
                                    <td class="text-end fw-bold d-none d-md-table-cell">Grand Total</td>
                                    <td class="text-center d-md-none">Total</td>
                                    <td class="text-end fw-bold">${formatCurrency(catSale)}</td>
                                    <td class="text-end fw-bold">${formatCurrency(catCost)}</td>
                                    <td class="text-end fw-bold">${formatCurrency(catPayment)}</td>
                                    <td class="text-end fw-bold">${formatCurrency(catBalance)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    });

    if (!html) {
        html = '<div class="text-center text-muted py-3">No data for selected filters</div>';
    }

    container.innerHTML = html;

    // Update stat cards
    const totalBalance = totalCost - totalPayment;
    document.getElementById('payStatSale').textContent = formatCurrency(totalSale);
    document.getElementById('payStatCost').textContent = formatCurrency(totalCost);
    document.getElementById('payStatPayment').textContent = formatCurrency(totalPayment);
    document.getElementById('payStatBalance').textContent = formatCurrency(totalBalance);
}

function refreshPaymentData() {
    refreshDashboard();
}

function processAndRenderCategoryBreakdown(sheets, categoriesMap, branchNameMap) {
    // Normalization Logic
    const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    console.log('=== Processing Category Breakdown ===');
    console.log('Total closing sheets:', sheets.length);
    console.log('Available categories:', Object.values(categoriesMap));

    // Map<CategoryName, Map<BranchName, {netSale, cost}>>
    const catStats = {};

    // 1. Initialize stats for all known Categories and allowed branches
    const allowedBranchList = Array.from(new Set(branchNameMap.values()));

    Object.values(categoriesMap).forEach(catName => {
        catStats[catName] = {};
        allowedBranchList.forEach(branchName => {
            catStats[catName][branchName] = {
                branch: branchName,
                netSale: 0,
                cost: 0
            };
        });
    });

    // 2. Populate with Data from Warehouse Sale
    sheets.forEach(sheet => {
        const rawName = sheet.branch || 'Unknown';
        const targetBranchName = branchNameMap.get(normalize(rawName));

        if (!targetBranchName) return; // Filter check

        // Check for warehouseSale data in closing02.data
        const dataObj = sheet.closing02?.data || sheet.closing02;

        console.log(`Sheet for branch ${rawName}:`, {
            hasClosing02: !!sheet.closing02,
            hasData: !!dataObj,
            hasWarehouseSale: !!(dataObj && dataObj.warehouseSale),
            warehouseSaleLength: dataObj?.warehouseSale?.length || 0,
            warehouseSale: dataObj?.warehouseSale
        });

        if (dataObj && dataObj.warehouseSale && Array.isArray(dataObj.warehouseSale)) {
            console.log(`Processing ${dataObj.warehouseSale.length} warehouse sale items for ${targetBranchName}`);

            dataObj.warehouseSale.forEach(item => {
                const catName = categoriesMap[item.category];
                console.log(`Warehouse item:`, {
                    categoryId: item.category,
                    categoryName: catName,
                    sale: item.sale,
                    cost: item.cost
                });

                if (!catName) return; // Unknown category

                // Initialize if missing (e.g. if category list changed)
                if (!catStats[catName]) {
                    catStats[catName] = {};
                    allowedBranchList.forEach(b => {
                        catStats[catName][b] = { branch: b, netSale: 0, cost: 0 };
                    });
                }

                if (catStats[catName][targetBranchName]) {
                    catStats[catName][targetBranchName].netSale += parseFloat(item.sale || 0);
                    catStats[catName][targetBranchName].cost += parseFloat(item.cost || 0);
                    console.log(`Added to ${catName} - ${targetBranchName}: Sale ${item.sale}, Cost ${item.cost}`);
                }
            });
        } else {
            console.log(`No warehouse sale data found for ${rawName}`);
        }
    });

    console.log('=== Final Category Stats ===', catStats);

    // Departments/Categories to display
    const sortedCats = Object.entries(catStats).map(([name, branches]) => {
        const totalSale = Object.values(branches).reduce((sum, b) => sum + b.netSale, 0);
        return { name, branches, totalSale };
    }).sort((a, b) => b.totalSale - a.totalSale);


    renderCategoryCards(sortedCats);
    renderCategoryBreakdown(sortedCats);
}

function renderCategoryCards(categories) {
    const container = document.getElementById('categoryCardsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (categories.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted">No category data</div>';
        return;
    }

    categories.forEach(cat => {
        // Aggregate totals for the card
        let tSale = 0, tCost = 0;
        Object.values(cat.branches).forEach(b => {
            tSale += b.netSale;
            tCost += b.cost;
        });
        const tProfit = tSale - tCost;
        const margin = tSale > 0 ? (tProfit / tSale) * 100 : 0;

        const cardHtml = `
            <div class="col-xl-3 col-md-6 mb-4">
                <div class="branch-card">
                    <div class="branch-card-header" style="background: linear-gradient(45deg, #0288d1, #26c6da);">
                        ${cat.name}
                    </div>
                    <div class="branch-card-body">
                        <div class="stat-box red">
                            <span class="stat-label"><i class="fas fa-shopping-cart"></i> TOTAL SALE</span>
                            <span class="stat-value">${formatCurrency(tSale)}</span>
                        </div>
                        <div class="stat-box blue">
                            <span class="stat-label"><i class="fas fa-money-bill-wave"></i> TOTAL COST</span>
                            <span class="stat-value">${formatCurrency(tCost)}</span>
                        </div>
                        <div class="stat-box green">
                            <span class="stat-label"><i class="fas fa-chart-line"></i> TOTAL PROFIT</span>
                            <span class="stat-value">${formatCurrency(tProfit)}</span>
                        </div>
                         <div class="stat-box dark">
                            <span class="stat-label"><i class="fas fa-percentage"></i> MARGIN</span>
                            <span class="stat-value">${margin.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += cardHtml;
    });
}

// --- REPLACEMENT FOR renderCategoryBreakdown ---
// --- REPLACEMENT FOR renderCategoryBreakdown ---
function renderCategoryBreakdown(categories) {
    const container = document.getElementById('categoryBreakdownContainer');
    if (!container) return;
    container.innerHTML = '';

    if (categories.length === 0) {
        container.innerHTML = '<div class="text-center text-muted">No category data available</div>';
        return;
    }

    categories.forEach(cat => {
        // Prepare branch list for this category
        const branchList = Object.values(cat.branches).sort((a, b) => b.netSale - a.netSale);

        let tableRows = '';
        let mobileCards = '';
        let tSale = 0, tCost = 0, tProfit = 0;

        let rank = 1;
        branchList.forEach((b) => {
            if (b.netSale === 0 && b.cost === 0) return; // Skip empty rows

            const profit = b.netSale - b.cost;
            const margin = b.netSale > 0 ? (profit / b.netSale) * 100 : 0;

            tSale += b.netSale;
            tCost += b.cost;
            tProfit += profit;

            // Desktop Table Row
            tableRows += `
                <tr>
                    <td class="fw-bold text-center">${rank}</td>
                    <td>${b.branch}</td>
                    <td class="text-end">${formatCurrency(b.netSale)}</td>
                    <td class="text-end">${b.cost > 0 ? formatCurrency(b.cost) : '-'}</td>
                    <td class="text-end text-success">${formatCurrency(profit)}</td>
                    <td class="text-end"><span class="badge bg-success">${margin.toFixed(1)}%</span></td>
                </tr>
            `;

            // Mobile Card View
            mobileCards += `
                <div class="p-3 border-bottom bg-white">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="fw-bold text-dark">
                            <span class="badge bg-secondary me-2">#${rank}</span> ${b.branch}
                        </div>
                        <span class="badge bg-success">${margin.toFixed(1)}%</span>
                    </div>
                    <div class="row g-2 text-center">
                        <div class="col-4">
                            <div class="small text-muted text-uppercase" style="font-size: 10px;">Sales</div>
                            <div class="fw-bold text-dark" style="font-size: 12px;">${formatCurrency(b.netSale)}</div>
                        </div>
                        <div class="col-4">
                            <div class="small text-muted text-uppercase" style="font-size: 10px;">Cost</div>
                            <div class="fw-bold text-dark" style="font-size: 12px;">${b.cost > 0 ? formatCurrency(b.cost) : '-'}</div>
                        </div>
                        <div class="col-4">
                            <div class="small text-muted text-uppercase" style="font-size: 10px;">Profit</div>
                            <div class="fw-bold text-success" style="font-size: 12px;">${formatCurrency(profit)}</div>
                        </div>
                    </div>
                </div>
            `;

            rank++;
        });

        // Grand total for Category
        const totalMargin = tSale > 0 ? (tProfit / tSale) * 100 : 0;

        // Combined Container
        const sectionHtml = `
            <div class="category-detail-card mb-4 shadow-sm border-0" style="overflow: hidden; border-radius: 8px;">
                <!-- Category Title Bar (Professional Teal Theme) -->
                <div class="category-title-bar" style="background: linear-gradient(135deg, #17a2b8, #138496); color: white; padding: 12px 20px; display: flex; align-items: center; justify-content: center; font-weight: 700;">
                     <i class="fas fa-folder me-2"></i> ${cat.name}
                </div>

                <!-- Desktop Table View (Hidden on Mobile) -->
                <div class="d-none d-md-block">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0 align-middle">
                            <thead class="bg-light text-dark">
                                <tr>
                                    <th style="width: 60px;" class="text-center">RANK</th>
                                    <th>BRANCH</th>
                                    <th class="text-end">TOTAL SALES</th>
                                    <th class="text-end">TOTAL COST</th>
                                    <th class="text-end">TOTAL PROFIT</th>
                                    <th class="text-end" style="width: 120px;">PROFIT MARGIN</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                                <tr class="grand-total-row" style="background-color: #343a40 !important; color: white;">
                                    <td colspan="2" class="text-end fw-bold text-white ps-3">CATEGORY TOTAL:</td>
                                    <td class="text-end fw-bold text-white">${formatCurrency(tSale)}</td>
                                    <td class="text-end fw-bold text-white">${tCost > 0 ? formatCurrency(tCost) : '-'}</td>
                                    <td class="text-end fw-bold text-white">${formatCurrency(tProfit)}</td>
                                    <td class="text-end"><span class="badge bg-success">${totalMargin.toFixed(1)}%</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Mobile List View (Hidden on Desktop) -->
                <div class="d-md-none">
                    ${mobileCards}
                    <div class="p-3" style="background-color: #343a40; color: white;">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                             <div class="fw-bold">CATEGORY TOTAL</div>
                             <span class="badge bg-success">${totalMargin.toFixed(1)}%</span>
                        </div>
                         <div class="row g-2 text-center">
                            <div class="col-4">
                                <div class="small text-white-50 text-uppercase" style="font-size: 10px;">Sales</div>
                                <div class="fw-bold text-white" style="font-size: 12px;">${formatCurrency(tSale)}</div>
                            </div>
                            <div class="col-4">
                                <div class="small text-white-50 text-uppercase" style="font-size: 10px;">Cost</div>
                                <div class="fw-bold text-white" style="font-size: 12px;">${formatCurrency(tCost)}</div>
                            </div>
                            <div class="col-4">
                                <div class="small text-white-50 text-uppercase" style="font-size: 10px;">Profit</div>
                                <div class="fw-bold text-white" style="font-size: 12px;">${formatCurrency(tProfit)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += sectionHtml;
    });
}

function renderBranchCards(data) {
    const container = document.getElementById('branchCardsContainer');
    container.innerHTML = '';

    data.forEach(b => {
        const cardHtml = `
            <div class="col-xl-3 col-md-6 mb-4">
                <div class="branch-card">
                    <div class="branch-card-header">
                        ${b.name}
                    </div>
                    <div class="branch-card-body">
                        <div class="stat-box red">
                            <span class="stat-label"><i class="fas fa-shopping-cart"></i> TOTAL SALE</span>
                            <span class="stat-value">${formatCurrency(b.netSale)}</span>
                        </div>
                        <div class="stat-box blue">
                            <span class="stat-label"><i class="fas fa-money-bill-wave"></i> TOTAL COST</span>
                            <span class="stat-value">${formatCurrency(b.cost)}</span>
                        </div>
                        <div class="stat-box green">
                            <span class="stat-label"><i class="fas fa-chart-line"></i> TOTAL PROFIT</span>
                            <span class="stat-value">${formatCurrency(b.profit)}</span>
                        </div>
                        <div class="stat-box yellow">
                            <span class="stat-label"><i class="fas fa-tags"></i> BRANCH DISC %</span>
                            <span class="stat-value">${b.discPct.toFixed(1)}%</span>
                        </div>
                        <div class="stat-box dark">
                            <span class="stat-label"><i class="fas fa-percentage"></i> MARGIN</span>
                            <span class="stat-value">${b.margin.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += cardHtml;
    });
}

function renderSalesChart(data) {
    const ctx = document.getElementById('salesChart').getContext('2d');

    const labels = data.map(d => d.name);
    const sales = data.map(d => d.netSale);

    // Colorful bars
    const colors = [
        '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796', '#5a5c69'
    ];
    const bgColors = labels.map((_, i) => colors[i % colors.length]);

    if (salesChart) {
        salesChart.destroy();
    }

    salesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Net Sale',
                data: sales,
                backgroundColor: bgColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}
// ----------------------------------------------------------------

// --- REPLACEMENT FOR renderBranchTable ---
function renderBranchTable(data) {
    const tbody = document.getElementById('branchTableBody');
    let html = '';

    // Totals
    let tGross = 0, tDiscVal = 0, tRet = 0, tSaleVal = 0, tGst = 0, tNet = 0, tAvg = 0;

    data.forEach((b, index) => {
        tGross += b.grossSale;
        tDiscVal += b.discountVal;
        tRet += b.returnVal;
        tGst += b.gst;
        tNet += b.netSale;
        tAvg += b.avgDailySale;

        html += `
            <tr>
                <td class="fw-bold">
                    <span class="text-muted small me-1">#${index + 1}</span>
                    <span class="d-inline-block text-wrap" style="min-width: 80px;">${b.name}</span>
                </td>
                <td class="text-end">${b.discPct.toFixed(2)}%</td>
                <td class="text-end fw-bold text-success">${formatCurrency(b.netSale)}</td>
                <td class="text-end fw-bold">${formatCurrency(b.avgDailySale)}</td>
            </tr>
        `;
    });

    // Grand Total
    const totalDiscPct = tGross > 0 ? (tDiscVal / tGross) * 100 : 0;

    html += `
        <tr class="grand-total-row">
            <td class="fw-bold ps-3">
                <span class="d-md-none">Total</span>
                <span class="d-none d-md-inline">Grand Total</span>
            </td>
            <td class="text-end">${totalDiscPct.toFixed(2)}%</td>
            <td class="text-end fw-bold">${formatCurrency(tNet)}</td>
            <td class="text-end fw-bold">${formatCurrency(tAvg)}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}
// ----------------------------------------------------------------

// --- REPLACEMENT FOR processAndRenderBranchDeptBreakdown ---
function processAndRenderBranchDeptBreakdown(sheets, cashSales, branchNameMap, departmentsMap) {
    const container = document.getElementById('branchDeptBreakdownContainer');
    if (!container) return;

    const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const stats = {};

    // Helper to get or create branch stats
    const getBStat = (branchName) => {
        const targetBranchName = branchNameMap.get(normalize(branchName));
        if (!targetBranchName) return null;
        if (!stats[targetBranchName]) {
            stats[targetBranchName] = { name: targetBranchName, totalNet: 0, depts: {} };
        }
        return stats[targetBranchName];
    };

    // Helper to check filter logic (shared between Closing 2 and Cash Sales)
    const shouldHideDept = (deptId, dName) => {
        // Find configuration
        const deptConfig = window.globalFullDepartments?.find(d => d._id === deptId) ||
            window.globalFullDepartments?.find(d => d.name === dName);

        if (deptConfig) {

            // Explicitly FORCE SHOW for critical departments
            if (deptConfig.combineDepSales) return false; // Always Show
            if (deptConfig.isCashCounter) return false; // Always Show

            const hasClosing2CompSale = deptConfig.closing2CompSale === true;

            // Check if ANY other functional flag is true to determine if it's a "Only Closing 2" dept
            const hasOtherChecks =
                deptConfig.combineDepSales ||
                deptConfig.receivingForward ||
                deptConfig.deductUgSale ||
                deptConfig.deductUgSaleFromAllDep ||
                deptConfig.openingForward ||
                deptConfig.bigCashForward ||
                deptConfig.deductOptSale ||
                deptConfig.closing ||
                deptConfig.isCashCounter ||
                deptConfig.closing2DeptDropDown;

            // HIDE CONDITION:
            // 1. It MUST have Closing_2_Comp_Sale
            // 2. It must have NO other important checks.
            // 3. Critically, we ensure we do NOT hide if it's explicitly one of the "Cash Counter Tab" depts (isCashCounter / deductUg / deductOpt)

            if (hasClosing2CompSale && !hasOtherChecks) {
                // console.log(`Hiding ${dName} because it is PURELY Closing 2 Comp Sale`);
                return true; // HIDE
            }
        }
        return false; // SHOW
    };

    sheets.forEach(sheet => {
        const bStat = getBStat(sheet.branch || 'Unknown');
        if (!bStat) return;

        const dData = sheet.closing02 && (sheet.closing02.data || sheet.closing02);

        if (dData && typeof dData === 'object') {
            Object.entries(dData).forEach(([key, val]) => {
                if (!val || typeof val !== 'object') return;
                const dName = departmentsMap[key] || val.name || val.deptName || 'Unknown Dept';
                const deptId = key;

                if (shouldHideDept(deptId, dName)) return;
                if (shouldHideDept(deptId, dName)) return;

                if (!bStat.depts[dName]) {
                    bStat.depts[dName] = { name: dName, gross: 0, disc: 0, ret: 0, gst: 0, net: 0, days: new Set() };
                }
                const dStat = bStat.depts[dName];

                // Data Extraction based on Closing Sheet 2
                const net = parseFloat(val.totalSaleComputer || val.netSale || 0);
                const gross = parseFloat(val.grossSale || val.totalSaleComputer || 0);
                const disc = parseFloat(val.discountValue || 0);

                const ret = parseFloat(val.returnAmount || val.returnVal || 0);
                const gst = parseFloat(val.gst || val.gstValue || 0);

                dStat.gross += gross;
                dStat.disc += disc;
                dStat.ret += ret;
                dStat.gst += gst;
                dStat.net += net;
                dStat.days.add(sheet.date.split('T')[0]);
                bStat.totalNet += net;
            });
        }
    });

    // 2. Process Cash Sales (Manual / Cash Counter Sales e.g. Optics, Undergarments)
    if (cashSales && Array.isArray(cashSales)) {
        cashSales.forEach(sale => {
            const bStat = getBStat(sale.branch || 'Unknown');
            if (!bStat) return;

            // Sale object structure: { branch, department: ID/Obj, amount, date, ... }
            const deptId = (sale.department && sale.department._id) ? sale.department._id : sale.department;
            const dName = departmentsMap[deptId] || 'Unknown Dept';

            if (shouldHideDept(deptId, dName)) return;

            if (!bStat.depts[dName]) {
                bStat.depts[dName] = { name: dName, gross: 0, disc: 0, ret: 0, gst: 0, net: 0, days: new Set() };
            }
            const dStat = bStat.depts[dName];

            const amount = parseFloat(sale.sales || sale.totalAmount || sale.amount || 0); // "sales" or "totalAmount" in CashSale model

            // Cash Sales usually don't have separate discount/gross fields in this simple model, 
            // but if they do, map them. Assuming 'amount' is the Net Sale.

            dStat.net += amount;
            dStat.gross += amount; // Assuming gross = net for simple cash sales if no disc
            // If cash sale has discount, handle it. Usually it's just 'amount'.

            dStat.days.add(sale.date ? sale.date.split('T')[0] : 'UnknownDate');
            bStat.totalNet += amount;
        });
    }

    const sortedBranches = Object.values(stats).sort((a, b) => b.totalNet - a.totalNet);
    let html = '';

    if (sortedBranches.length === 0) {
        html = '<div class="text-center py-3 text-muted">No branch sales data available.</div>';
    } else {
        sortedBranches.forEach(b => {
            // Main Card Container with Overflow Hidden
            html += `<div class="mb-5 bg-white shadow-sm" style="border-radius: 8px; overflow: hidden; border: 1px solid #dee2e6;">
                <div class="p-2 text-white text-center fw-bold text-uppercase d-flex align-items-center justify-content-center" style="background-color: #2c5364; font-size: 1.1rem; letter-spacing: 0.5px;">${b.name}</div>
                <div class="table-responsive">
                    <table class="table table-hover table-striped mb-0 text-nowrap" style="font-size: 0.85rem;">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-3">Department</th>
                                <th class="text-end">
                                    <span class="d-md-none">Disc%</span>
                                    <span class="d-none d-md-inline">Discount %</span>
                                </th>
                                <th class="text-end fw-bold">Net Sale</th>
                                <th class="text-end pe-3">
                                    <span class="d-md-none">Avg</span>
                                    <span class="d-none d-md-inline">Daily Sale Average</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>`;

            const deptList = Object.values(b.depts);
            deptList.sort((d1, d2) => d2.net - d1.net);

            let tGross = 0, tDisc = 0, tRet = 0, tSaleVal = 0, tGst = 0, tNet = 0, tAvgSum = 0;

            deptList.forEach(d => {
                const discPct = d.gross > 0 ? (d.disc / d.gross) * 100 : 0;

                // Filter 0 sales?
                if (d.net === 0 && d.gross === 0) return;

                const avg = d.net / (d.days.size || 1);
                tGross += d.gross; tDisc += d.disc; tRet += d.ret; tNet += d.net; tAvgSum += avg;

                html += `<tr>
                    <td class="ps-3 fw-bold text-secondary">${d.name}</td>
                    <td class="text-end">${discPct.toFixed(2)}%</td>
                    <td class="text-end fw-bold text-dark">${formatCurrency(d.net)}</td>
                    <td class="text-end pe-3 text-muted">${formatCurrency(avg)}</td>
                </tr>`;
            });

            const tDiscPct = tGross > 0 ? (tDisc / tGross) * 100 : 0;
            html += `<tr class="grand-total-row fw-bold shadow-sm">
                <td class="ps-3 fw-bold">Grand Total</td>
                <td class="text-end">${tDiscPct.toFixed(2)}%</td>
                <td class="text-end">${formatCurrency(tNet)}</td>
                <td class="text-end pe-3">${formatCurrency(tAvgSum)}</td>
            </tr>`;
            html += `</tbody></table></div></div>`;
        });
    }
    container.innerHTML = html;
}

