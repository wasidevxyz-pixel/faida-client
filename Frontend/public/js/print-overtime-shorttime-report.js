document.addEventListener('DOMContentLoaded', async () => {
    const params   = new URLSearchParams(window.location.search);
    const fromDate = params.get('from');
    const toDate   = params.get('to');
    const criteria = params.get('criteria') || 'OverTime';
    const viewMode = params.get('viewMode') || 'summary';

    if (!fromDate || !toDate) {
        alert("Invalid Parameters: From and To dates are required.");
        window.close();
        return;
    }

    const container = document.getElementById('reportContainer');
    container.innerHTML = '<div class="text-center p-5"><h4>Generating Official Report...</h4><div class="spinner-border text-primary mt-2"></div></div>';

    try {
        const token = localStorage.getItem('token');

        const apiParams = new URLSearchParams();
        apiParams.append('from',        fromDate);
        apiParams.append('to',          toDate);
        apiParams.append('criteria',    criteria);
        apiParams.append('viewMode',    viewMode);
        apiParams.append('limit',       '5000');
        apiParams.append('holidays',    params.get('holidays') || '4');
        if (params.get('branch'))     apiParams.append('branch',     params.get('branch'));
        if (params.get('department')) apiParams.append('department', params.get('department'));
        if (params.get('employee'))   apiParams.append('employee',   params.get('employee'));

        const res  = await fetch(`/api/v1/reports/overtime-shorttime?${apiParams.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            renderPrint(data, criteria, viewMode, fromDate, toDate, params.get('branch'), params.get('department'));
        } else {
            container.innerHTML = `<div class="alert alert-warning text-center">No data found: ${data.message || ''}</div>`;
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="alert alert-danger text-center">Error: ${e.message}</div>`;
    }
});

function formatDate(d) {
    if (!d) return '-';
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(t) {
    if (!t || t === '-') return '-';
    const parts = t.split(':');
    if (parts.length < 2) return t;
    let h = parseInt(parts[0]);
    let m = parts[1].substring(0, 2);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}

function formatCurrency(val) {
    const num = parseFloat(val) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderPrint(data, criteria, viewMode, from, to, branch, department) {
    const container = document.getElementById('reportContainer');
    container.innerHTML = '';

    const totals = data.totals || {};
    const rows = viewMode === 'summary' ? (data.summaryData || []) : (data.detailData || []);

    if (!rows || rows.length === 0) {
        container.innerHTML = `<div class="alert alert-warning text-center p-5"><h5>No records found for the selected period and criteria.</h5></div>`;
        return;
    }

    const showOT = (criteria === 'OverTime' || criteria === 'Both');
    const showST = (criteria === 'ShortTime' || criteria === 'Both');
    const isBoth = (criteria === 'Both');

    let reportTitle = '';
    if (criteria === 'OverTime') reportTitle = 'EMPLOYEE OVERTIME REPORT';
    else if (criteria === 'ShortTime') reportTitle = 'EMPLOYEE SHORT TIME REPORT';
    else reportTitle = 'EMPLOYEE OVERTIME & SHORT TIME REPORT';

    reportTitle += viewMode === 'summary' ? ' (SUMMARY)' : ' (DETAILED LOGS)';

    const branchLabel = branch ? `Branch: ${branch}` : 'All Branches';
    const periodLabel = `Period: ${formatDate(from)} to ${formatDate(to)}`;

    // Build KPI Summary Boxes HTML
    let kpiBoxesHtml = `
        <div class="summary-boxes">
            <div class="summary-box">
                <div class="summary-box-val">${(totals.totalEmployees || 0).toLocaleString()}</div>
                <div class="summary-box-lbl">Employees</div>
            </div>
            <div class="summary-box">
                <div class="summary-box-val">${totals.totalWorkedHrs || '0:00'}</div>
                <div class="summary-box-lbl">Worked Hours</div>
            </div>`;

    if (showOT) {
        kpiBoxesHtml += `
            <div class="summary-box" style="border-color: #059669; background: #f0fdf4;">
                <div class="summary-box-val text-ot">${totals.totalOTHrs || '0:00'} (Rs. ${formatCurrency(totals.totalOTAmount)})</div>
                <div class="summary-box-lbl">Total Overtime</div>
            </div>`;
    }

    if (showST) {
        kpiBoxesHtml += `
            <div class="summary-box" style="border-color: #dc2626; background: #fef2f2;">
                <div class="summary-box-val text-st">${totals.totalSTHrs || '0:00'} (Rs. ${formatCurrency(totals.totalSTAmount)})</div>
                <div class="summary-box-lbl">Total Short Time</div>
            </div>`;
    }

    if (isBoth) {
        const netAmt = parseFloat(totals.netAmount || 0);
        kpiBoxesHtml += `
            <div class="summary-box" style="border-color: #4f46e5; background: #eef2ff;">
                <div class="summary-box-val" style="color: ${netAmt >= 0 ? '#059669' : '#dc2626'}">Rs. ${formatCurrency(totals.netAmount)}</div>
                <div class="summary-box-lbl">Net (${netAmt >= 0 ? 'Payable' : 'Deductible'})</div>
            </div>`;
    }

    kpiBoxesHtml += `</div>`;

    // Build Table Header & Body
    let tableThead = '';
    let tableTbody = '';
    let tableTfoot = '';

    if (viewMode === 'summary') {
        tableThead = `<tr>
            <th style="width: 30px;">#</th>
            <th style="width: 55px;">Code</th>
            <th>Employee Name</th>
            <th style="width: 90px;">Branch</th>
            <th style="width: 90px;">Department</th>
            <th style="width: 45px;">Duty</th>
            <th style="width: 40px;" title="Working Days">W.Days</th>
            <th style="width: 40px;" title="Present Days">Present</th>
            <th style="width: 55px;">Req (H)</th>
            <th style="width: 70px;">Worked (H:M)</th>
            <th style="width: 70px;">Month Diff</th>`;

        if (showOT) {
            tableThead += `<th style="width: 75px;">OT (H:M)</th>`;
        }
        if (showST) {
            tableThead += `<th style="width: 75px;">ST (H:M)</th>`;
        }

        tableThead += `<th style="width: 55px;">Rate/Hr</th>`;

        if (showOT) {
            tableThead += `<th style="width: 80px;">OT Amount</th>`;
        }
        if (showST) {
            tableThead += `<th style="width: 80px;">ST Amount</th>`;
        }
        if (isBoth) {
            tableThead += `<th style="width: 85px;">Net Amount</th>`;
        }

        tableThead += `</tr>`;

        rows.forEach((r, idx) => {
            const diffMins = r.monthlyDiffMins || 0;
            const diffColor = diffMins > 0 ? '#065f46' : (diffMins < 0 ? '#991b1b' : '#64748b');

            tableTbody += `<tr>
                <td>${idx + 1}</td>
                <td style="font-weight: 700;">${r.code}</td>
                <td class="text-start" style="font-weight: 600;">${r.name}</td>
                <td>${r.branch}</td>
                <td>${r.department}</td>
                <td>${r.dutyHrs}</td>
                <td>${r.workingDays || r.cmDays || '-'}</td>
                <td>${r.presentDays}</td>
                <td style="color: #64748b;">${r.reqHrs || '-'}</td>
                <td style="font-weight: 700;">${r.totalWorkedHrs}</td>
                <td style="font-weight: 700; color: ${diffColor};">${r.monthlyDiffHrs || '0:00'}</td>`;

            if (showOT) {
                tableTbody += `<td class="${r.totalOTMins > 0 ? 'text-ot' : ''}">${r.totalOTHrs}</td>`;
            }
            if (showST) {
                tableTbody += `<td class="${r.totalSTMins > 0 ? 'text-st' : ''}">${r.totalSTHrs}</td>`;
            }

            tableTbody += `<td>${r.perHourSalary}</td>`;

            if (showOT) {
                tableTbody += `<td class="text-end text-ot">${formatCurrency(r.totalOTAmount)}</td>`;
            }
            if (showST) {
                tableTbody += `<td class="text-end text-st">${formatCurrency(r.totalSTAmount)}</td>`;
            }
            if (isBoth) {
                const net = parseFloat(r.netAmount);
                tableTbody += `<td class="text-end" style="font-weight: 700; color: ${net >= 0 ? '#065f46' : '#991b1b'}">${formatCurrency(r.netAmount)}</td>`;
            }

            tableTbody += `</tr>`;
        });

        // Summary Footer
        tableTfoot = `<tr>
            <td colspan="9" class="text-end fw-bold">GRAND TOTAL (${rows.length} Employees)</td>
            <td class="text-center fw-bold">${totals.totalWorkedHrs || '0:00'}</td>
            <td></td>`;

        if (showOT) {
            tableTfoot += `<td class="text-center text-ot fw-bold">${totals.totalOTHrs || '0:00'}</td>`;
        }
        if (showST) {
            tableTfoot += `<td class="text-center text-st fw-bold">${totals.totalSTHrs || '0:00'}</td>`;
        }

        tableTfoot += `<td></td>`;

        if (showOT) {
            tableTfoot += `<td class="text-end text-ot fw-bold">${formatCurrency(totals.totalOTAmount)}</td>`;
        }
        if (showST) {
            tableTfoot += `<td class="text-end text-st fw-bold">${formatCurrency(totals.totalSTAmount)}</td>`;
        }
        if (isBoth) {
            const grandNet = parseFloat(totals.netAmount || 0);
            tableTfoot += `<td class="text-end fw-bold" style="color: ${grandNet >= 0 ? '#065f46' : '#991b1b'}">${formatCurrency(totals.netAmount)}</td>`;
        }

        tableTfoot += `</tr>`;

    } else {
        // Detail View Format
        tableThead = `<tr>
            <th style="width: 30px;">#</th>
            <th style="width: 55px;">Code</th>
            <th>Employee Name</th>
            <th style="width: 75px;">Date</th>
            <th style="width: 45px;">Status</th>
            <th style="width: 65px;">In</th>
            <th style="width: 65px;">Out</th>
            <th style="width: 50px;">Duty (H)</th>
            <th style="width: 70px;">Worked (H)</th>`;

        if (showOT) {
            tableThead += `<th style="width: 75px;">OT (H:M)</th>`;
        }
        if (showST) {
            tableThead += `<th style="width: 75px;">ST (H:M)</th>`;
        }

        tableThead += `<th style="width: 60px;">Rate/Hr</th>`;

        if (showOT) {
            tableThead += `<th style="width: 80px;">OT Amount</th>`;
        }
        if (showST) {
            tableThead += `<th style="width: 80px;">ST Amount</th>`;
        }
        if (isBoth) {
            tableThead += `<th style="width: 85px;">Net Amount</th>`;
        }

        tableThead += `</tr>`;

        rows.forEach((r, idx) => {
            tableTbody += `<tr>
                <td>${idx + 1}</td>
                <td style="font-weight: 700;">${r.code}</td>
                <td class="text-start" style="font-weight: 600;">${r.name}</td>
                <td>${formatDate(r.date)}</td>
                <td>${r.status === 'Absent' ? 'A' : 'P'}</td>
                <td>${formatTime(r.checkIn)}</td>
                <td>${formatTime(r.checkOut)}</td>
                <td>${r.dutyHrs}</td>
                <td style="font-weight: 700;">${r.workedHrs}</td>`;

            if (showOT) {
                tableTbody += `<td class="${r.overtimeMins > 0 ? 'text-ot' : ''}">${r.overtimeHrs}</td>`;
            }
            if (showST) {
                tableTbody += `<td class="${r.shorttimeMins > 0 ? 'text-st' : ''}">${r.shorttimeHrs}</td>`;
            }

            tableTbody += `<td>${r.perHourSalary}</td>`;

            if (showOT) {
                tableTbody += `<td class="text-end text-ot">${formatCurrency(r.otAmount)}</td>`;
            }
            if (showST) {
                tableTbody += `<td class="text-end text-st">${formatCurrency(r.stAmount)}</td>`;
            }
            if (isBoth) {
                const net = parseFloat(r.otAmount) - parseFloat(r.stAmount);
                tableTbody += `<td class="text-end" style="font-weight: 700; color: ${net >= 0 ? '#065f46' : '#991b1b'}">${formatCurrency(net)}</td>`;
            }

            tableTbody += `</tr>`;
        });

        // Detail Footer
        tableTfoot = `<tr>
            <td colspan="8" class="text-end fw-bold">GRAND TOTAL (${rows.length} Entries)</td>
            <td class="text-center fw-bold">${totals.totalWorkedHrs || '0:00'}</td>`;

        if (showOT) {
            tableTfoot += `<td class="text-center text-ot fw-bold">${totals.totalOTHrs || '0:00'}</td>`;
        }
        if (showST) {
            tableTfoot += `<td class="text-center text-st fw-bold">${totals.totalSTHrs || '0:00'}</td>`;
        }

        tableTfoot += `<td></td>`;

        if (showOT) {
            tableTfoot += `<td class="text-end text-ot fw-bold">${formatCurrency(totals.totalOTAmount)}</td>`;
        }
        if (showST) {
            tableTfoot += `<td class="text-end text-st fw-bold">${formatCurrency(totals.totalSTAmount)}</td>`;
        }
        if (isBoth) {
            const grandNet = parseFloat(totals.netAmount || 0);
            tableTfoot += `<td class="text-end fw-bold" style="color: ${grandNet >= 0 ? '#065f46' : '#991b1b'}">${formatCurrency(totals.netAmount)}</td>`;
        }

        tableTfoot += `</tr>`;
    }

    const printHtml = `
        <div class="report-header">
            <h1>D-WATSON GROUP OF PHARMACIES</h1>
            <h2>${reportTitle}</h2>
            <div class="meta-subtitle">${branchLabel} &bull; ${periodLabel}</div>
            <div class="meta-info-bar">
                <span class="meta-pill">Total Days: <strong>${data.totalDays || 0}</strong></span>
                <span class="meta-pill">Holidays: <strong>${data.holidays || 0}</strong></span>
                <span class="meta-pill">Divisor Working Days: <strong>${data.workingDays || 0}</strong></span>
                <span class="meta-pill">Generated: <strong>${new Date().toLocaleString()}</strong></span>
            </div>
        </div>

        ${kpiBoxesHtml}

        <table class="print-table">
            <thead>${tableThead}</thead>
            <tbody>${tableTbody}</tbody>
            <tfoot>${tableTfoot}</tfoot>
        </table>

        <div class="signatures-section">
            <div class="signature-box">Prepared By (Data Entry)</div>
            <div class="signature-box">Checked By (Accountant)</div>
            <div class="signature-box">Branch Manager / HR</div>
            <div class="signature-box">Managing Director / CEO</div>
        </div>
    `;

    container.innerHTML = printHtml;

    setTimeout(() => {
        window.print();
    }, 700);
}
