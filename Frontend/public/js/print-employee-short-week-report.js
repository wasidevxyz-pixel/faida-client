// Print Employee Short Week Report Controller
function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return Number(num).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatMonthLabel(monthStr) {
    if (!monthStr || !monthStr.includes('-')) return monthStr || 'All Months';
    const [y, m] = monthStr.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const month = urlParams.get('monthYear') || '';
    const branch = urlParams.get('branch') || '';
    const dept = urlParams.get('department') || '';
    const designation = urlParams.get('designation') || '';
    const employee = urlParams.get('employee') || '';
    const tswFilter = urlParams.get('tswFilter') || 'only_short_week';
    const groupBy = urlParams.get('groupBy') || 'none';

    // Update Header
    document.getElementById('reportSubtitle').textContent = `Month: ${month ? formatMonthLabel(month) : 'All Months'}`;
    document.getElementById('pillBranch').textContent = `Branch: ${branch || 'All Branches'}`;
    document.getElementById('pillDept').textContent = `Department: ${dept || 'All Departments'}`;
    document.getElementById('pillDesig').textContent = `Designation: ${designation || 'All Designations'}`;

    let criteriaText = 'Only Short Week Applied (TSW > 0)';
    if (tswFilter === '1') criteriaText = 'Filter: Exactly +1 Day TSW';
    else if (tswFilter === '2') criteriaText = 'Filter: Exactly +2 Days TSW';
    else if (tswFilter === '3') criteriaText = 'Filter: Exactly +3 Days TSW';
    else if (tswFilter === '4_plus') criteriaText = 'Filter: +4 Days or More TSW';
    else if (tswFilter === 'all') criteriaText = 'Filter: All Employees';
    document.getElementById('pillCriteria').textContent = criteriaText;

    document.getElementById('pillPrintDate').textContent = `Printed: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

    const token = localStorage.getItem('token');
    const tableBody = document.getElementById('printTableBody');
    const tableFoot = document.getElementById('printTableFoot');

    try {
        const res = await fetch(`/api/v1/reports/short-week?${urlParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
            tableBody.innerHTML = `<tr><td colspan="20" class="text-center text-danger py-4">Error: ${result.message}</td></tr>`;
            return;
        }

        const totals = result.totals || {};
        const rows = result.data || [];
        const groupedData = result.groupedData;

        // Fill KPI Boxes
        document.getElementById('boxEmployees').textContent = formatNumber(totals.totalEmployeesWithShortWeek || 0);
        document.getElementById('boxDays').textContent = `${formatNumber(totals.totalShortWeekDays || 0)} Days`;
        document.getElementById('boxExtraHrs').textContent = totals.totalExtraShortHrsStr || '0:00';
        const boxAllowed = document.getElementById('boxAllowedHolidays');
        if (boxAllowed) boxAllowed.textContent = `${formatNumber(totals.totalAllowedHolidays || totals.totalHolidays || 0)} Days`;
        const boxAbsEl = document.getElementById('boxAbsents');
        if (boxAbsEl) boxAbsEl.textContent = `${formatNumber(totals.totalAbsents || 0)} Days`;
        document.getElementById('boxExtraDed').textContent = `Rs. ${formatNumber(totals.totalExtraShortDeduction || 0)}`;
        document.getElementById('boxGrandTotalDed').textContent = `Rs. ${formatNumber(totals.grandTotalShortDeduction || 0)}`;

        if (rows.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="21" class="text-center py-4">No records found matching criteria.</td></tr>`;
            return;
        }

        let tbodyHtml = '';
        let sumBasic = 0;
        let sumAllowed = 0;
        let sumAbsents = 0;
        let sumReq = 0;
        let sumWorked = 0;
        let sumBase = 0;
        let sumDays = 0;
        let sumExtraHrs = 0;
        let sumTotalHrs = 0;
        let sumExtraDed = 0;
        let sumTotalDed = 0;
        let sumNet = 0;

        const renderRowHtml = (r, idx) => {
            const tswText = (r.shortWeekDays > 0) ? `+${r.shortWeekDays} Day${r.shortWeekDays > 1 ? 's' : ''}` : '0';
            const allowedCount = (r.allowedHolidays !== undefined) ? r.allowedHolidays : (r.holidays || 0);
            const absentsCount = (r.absents !== undefined) ? r.absents : (r.totalAbsents || 0);
            return `
                <tr>
                    <td>${idx}</td>
                    <td>${r.monthYear || '-'}</td>
                    <td><strong>${r.code || '-'}</strong></td>
                    <td class="td-left">${r.employeeName || '-'}</td>
                    <td class="td-left">${r.branch || '-'}</td>
                    <td class="td-left">${r.department || '-'}</td>
                    <td class="td-left">${r.designation || '-'}</td>
                    <td class="td-right">${formatNumber(r.basicSalary)}</td>
                    <td>${r.dutyHrs || 8}h</td>
                    <td>${allowedCount}</td>
                    <td>${absentsCount}</td>
                    <td class="badge-tsw">${tswText}</td>
                    <td>${r.requiredHrsStr || '0:00'}</td>
                    <td>${r.workedHrsStr || '0:00'}</td>
                    <td>${r.baseShortHrsStr || '0:00'}</td>
                    <td class="badge-tsw">${r.extraShortHrsStr || '0:00'}</td>
                    <td>${r.actualShortHrsStr || '0:00'}</td>
                    <td class="td-right">${formatNumber(r.hourlyRate, 2)}</td>
                    <td class="td-right badge-tsw">${formatNumber(r.extraShortDeduction)}</td>
                    <td class="td-right">${formatNumber(r.totalShortDeduction)}</td>
                    <td class="td-right fw-bold">${formatNumber(r.netTotal)}</td>
                </tr>
            `;
        };

        if (groupBy && groupBy !== 'none' && groupedData) {
            let overallIdx = 1;
            Object.keys(groupedData).sort().forEach(groupKey => {
                const groupObj = groupedData[groupKey];
                const gTotals = groupObj.groupTotals || {};

                tbodyHtml += `
                    <tr class="group-header-row">
                        <td colspan="21">
                            <strong>${groupKey.toUpperCase()}</strong> (${groupObj.items.length} employees, ${gTotals.totalAllowedHolidays || 0} Allowed Holidays, ${gTotals.totalAbsents || 0} Absents, ${gTotals.totalTSWDays || 0} TSW Days, Extra Ded: Rs. ${formatNumber(gTotals.totalExtraDeduction)})
                        </td>
                    </tr>
                `;

                groupObj.items.forEach(r => {
                    sumBasic += (r.basicSalary || 0);
                    sumAllowed += ((r.allowedHolidays !== undefined) ? r.allowedHolidays : (r.holidays || 0));
                    sumAbsents += ((r.absents !== undefined) ? r.absents : (r.totalAbsents || 0));
                    sumReq += (r.requiredHrs || 0);
                    sumWorked += (r.workedHrs || 0);
                    sumBase += (r.baseShortHrs || 0);
                    sumDays += (r.shortWeekDays || 0);
                    sumExtraHrs += (r.extraShortHrs || 0);
                    sumTotalHrs += (r.actualShortHrs || 0);
                    sumExtraDed += (r.extraShortDeduction || 0);
                    sumTotalDed += (r.totalShortDeduction || 0);
                    sumNet += (r.netTotal || 0);

                    tbodyHtml += renderRowHtml(r, overallIdx++);
                });

                tbodyHtml += `
                    <tr class="group-subtotal-row">
                        <td colspan="7" class="text-start ps-2 fw-bold">Subtotal [${groupKey}]:</td>
                        <td class="td-right fw-bold">${formatNumber(gTotals.totalBasic)}</td>
                        <td>-</td>
                        <td class="fw-bold">${formatNumber(gTotals.totalAllowedHolidays || 0)}</td>
                        <td class="fw-bold text-danger">${formatNumber(gTotals.totalAbsents || 0)}</td>
                        <td class="badge-tsw">${formatNumber(gTotals.totalTSWDays)} Days</td>
                        <td colspan="3">-</td>
                        <td class="badge-tsw">${formatNumber(gTotals.totalExtraShortHrs, 1)}h</td>
                        <td>-</td>
                        <td>-</td>
                        <td class="td-right badge-tsw">${formatNumber(gTotals.totalExtraDeduction)}</td>
                        <td class="td-right fw-bold">${formatNumber(gTotals.totalShortDeduction)}</td>
                        <td class="td-right fw-bold">${formatNumber(gTotals.totalNet)}</td>
                    </tr>
                `;
            });
        } else {
            rows.forEach((r, idx) => {
                sumBasic += (r.basicSalary || 0);
                sumAllowed += ((r.allowedHolidays !== undefined) ? r.allowedHolidays : (r.holidays || 0));
                sumAbsents += ((r.absents !== undefined) ? r.absents : (r.totalAbsents || 0));
                sumReq += (r.requiredHrs || 0);
                sumWorked += (r.workedHrs || 0);
                sumBase += (r.baseShortHrs || 0);
                sumDays += (r.shortWeekDays || 0);
                sumExtraHrs += (r.extraShortHrs || 0);
                sumTotalHrs += (r.actualShortHrs || 0);
                sumExtraDed += (r.extraShortDeduction || 0);
                sumTotalDed += (r.totalShortDeduction || 0);
                sumNet += (r.netTotal || 0);

                tbodyHtml += renderRowHtml(r, idx + 1);
            });
        }

        tableBody.innerHTML = tbodyHtml;

        if (tableFoot) {
            tableFoot.style.display = 'table-footer-group';
            document.getElementById('footBasic').textContent = formatNumber(sumBasic);
            const footAllowedEl = document.getElementById('footAllowedHolidays');
            if (footAllowedEl) footAllowedEl.textContent = formatNumber(sumAllowed);
            const footAbsEl = document.getElementById('footAbsents');
            if (footAbsEl) footAbsEl.textContent = formatNumber(sumAbsents);
            document.getElementById('footDays').textContent = `${formatNumber(sumDays)} Days`;
            document.getElementById('footReq').textContent = `${formatNumber(sumReq, 1)}h`;
            document.getElementById('footWorked').textContent = `${formatNumber(sumWorked, 1)}h`;
            document.getElementById('footBase').textContent = `${formatNumber(sumBase, 1)}h`;
            document.getElementById('footDays').textContent = `${formatNumber(sumDays)} Days`;
            document.getElementById('footExtraHrs').textContent = `${formatNumber(sumExtraHrs, 1)}h`;
            document.getElementById('footTotalHrs').textContent = `${formatNumber(sumTotalHrs, 1)}h`;
            document.getElementById('footExtraDed').textContent = formatNumber(sumExtraDed);
            document.getElementById('footTotalDed').textContent = formatNumber(sumTotalDed);
            document.getElementById('footNet').textContent = formatNumber(sumNet);
        }

        // Auto print prompt after render
        setTimeout(() => {
            window.print();
        }, 500);

    } catch (err) {
        console.error('Print load error:', err);
        tableBody.innerHTML = `<tr><td colspan="20" class="text-center text-danger py-4">Network error: ${err.message}</td></tr>`;
    }
});
