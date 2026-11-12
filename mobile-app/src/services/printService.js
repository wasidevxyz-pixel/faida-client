import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';
import api, { getAuthToken } from './api';
import { STAMP_BANK_DATA_URI, STAMP_ADVANCE_DATA_URI, STAMP_CASH_DATA_URI } from './payrollStamps';
import { DWATSON_LOGO_BASE64 } from './dwatsonLogo';

const getBaseStyles = () => `
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 24px;
      font-size: 13px;
      line-height: 1.5;
    }
    .header-container {
      text-align: center;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .company-title {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .report-subtitle {
      font-size: 14px;
      font-weight: 600;
      color: #0284c7;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-grid {
      display: flex;
      justify-content: space-between;
      margin-bottom: 18px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
    }
    .meta-col {
      flex: 1;
    }
    .meta-row {
      margin-bottom: 4px;
    }
    .meta-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }
    .meta-val {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }
    .summary-cards {
      display: flex;
      gap: 10px;
      margin-bottom: 18px;
    }
    .sum-card {
      flex: 1;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .sum-card.green {
      background: #f0fdf4;
      border-color: #86efac;
    }
    .sum-card.red {
      background: #fef2f2;
      border-color: #fca5a5;
    }
    .sum-card.blue {
      background: #f0f9ff;
      border-color: #7dd3fc;
    }
    .sum-card-num {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
    }
    .sum-card.green .sum-card-num { color: #15803d; }
    .sum-card.red .sum-card-num { color: #b91c1c; }
    .sum-card.blue .sum-card-num { color: #0369a1; }
    .sum-card-label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      margin-bottom: 16px;
    }
    th {
      background-color: #0f172a;
      color: #ffffff;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      text-align: left;
      padding: 8px 10px;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12px;
    }
    tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
    }
    .badge-pay { background: #fee2e2; color: #991b1b; }
    .badge-rec { background: #dcfce7; color: #166534; }
    .badge-pres { background: #dcfce7; color: #166534; }
    .badge-abs { background: #fee2e2; color: #991b1b; }
    .badge-leave { background: #fef3c7; color: #92400e; }
    .badge-half { background: #ffedd5; color: #9a3412; }
    .net-banner {
      background: #0f172a;
      color: #ffffff;
      padding: 14px 18px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 18px 0;
    }
    .net-banner-label {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .net-banner-val {
      font-size: 24px;
      font-weight: 800;
      color: #38bdf8;
    }
    .footer-signatures {
      margin-top: 36px;
      display: flex;
      justify-content: space-between;
    }
    .sig-box {
      width: 40%;
      border-top: 1px dashed #94a3b8;
      text-align: center;
      padding-top: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
    }
    .print-date {
      margin-top: 24px;
      font-size: 10px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
`;

/**
 * Print & Share Salary Pay Slip (Exact match of Web App layout)
 */
/**
 * Open Original Salary Slip directly on Web ERP
 */
export async function openOriginalSlipWeb(payrollId) {
  if (!payrollId) {
    Alert.alert('Link Unavailable', 'No Payroll ID found for this record.');
    return;
  }
  const token = await getAuthToken();
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  const url = `https://bas.dwatson.co/print-payroll?id=${payrollId}${tokenParam}&v=20260617-8`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Cannot Open Browser', `URL: ${url}`);
    }
  } catch (err) {
    Alert.alert('Link Error', err.message);
  }
}

/**
 * Print & Share Salary Pay Slip (Authoritative Data from MongoDB & 100% Web ERP Match)
 */
export async function generateSalarySlipHtml(employee, slip) {
  try {
    let p = { ...slip };
    const payrollId = slip._id || slip.id || slip.payrollId;

  // Fetch authoritative payroll record directly from MongoDB via REST API if ID is available
  if (payrollId) {
    try {
      const res = await api.get(`/payrolls/${payrollId}`);
      if (res && res.success && res.data) {
        p = { ...p, ...res.data };
      }
    } catch (err) {
      console.warn('Direct payroll API fetch notice, using provided payload:', err.message);
    }
  }

  const fmt = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return Number(num).toLocaleString('en-US');
  };

  const monthNames = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];
  const [year, month] = (p.monthYear || '2026-07').split('-');
  const displayDate = month ? `${monthNames[parseInt(month, 10) - 1] || ''} ${year}` : (p.monthYear || 'Current Month');

  const basicSalary = Number(p.perMonth ?? p.basicSalary ?? 0);
  const overTime = Number(p.overTime ?? p.earnings?.overtime ?? 0);
  const fixAllow = Number(p.natin ?? p.fixAllowance ?? p.earnings?.fixAllowance ?? 0);
  const monthlyComm = Number(p.monthlyComm ?? p.commission ?? p.earnings?.commission ?? 0);
  const ugComm = Number(p.ugComm ?? p.earnings?.ugComm ?? 0);
  const warehouseComm = Number(p.warehouseComm ?? p.earnings?.warehouseComm ?? 0);
  const otherAllow = Number(p.otherAllow ?? p.otherAllowance ?? p.earnings?.otherAllowance ?? 0);
  const rentVal = Number(p.rent ?? p.earnings?.rent ?? 0);
  const teaVal = Number(p.teaAllowance ?? p.earnings?.teaAllowance ?? 0);
  const breakfastRoti = Number(p.breakfastRoti ?? (rentVal + teaVal));
  const stLateAllow = Number(p.stLateAllow ?? p.earnings?.stLateAllow ?? 0);

  const earningsSub = overTime + fixAllow + monthlyComm + ugComm + warehouseComm + otherAllow + breakfastRoti + stLateAllow;
  let totalEarnings = basicSalary + earningsSub;
  if (!totalEarnings && p.grossTotal) {
    totalEarnings = Number(p.grossTotal);
  }

  const shortTimeAmt = Number(p.shortWeek || p.shortTimeAmount || p.shortTime || p.deductions?.shortTime || 0);
  const mess = Number(p.ebDeduction ?? p.food ?? p.mess ?? p.deductions?.food ?? 0);
  const preMonthBal = Number(p.pAAdv ?? p.deductions?.preMonthBalance ?? 0);
  const currentAdv = Number(p.csMale ?? p.deductions?.currentAdvance ?? 0);

  // CRITICAL FIX: Advance deduction is strictly the installment recovery amount.
  const advanceDed = (p.pmAdvRec !== undefined || p.cmAdvRec !== undefined)
    ? (Number(p.pmAdvRec || 0) + Number(p.cmAdvRec || 0))
    : Number(p.totalAdv ?? p.advanceDed ?? p.deductions?.advanceDeduction ?? p.totalAdvRec ?? 0);
  const balance = (preMonthBal + currentAdv) - advanceDed;

  const otherDed = Number(p.otherDeduction || p.deductions?.otherDeduction || 0);
  const penalty = Number((p.penalty || 0) + (p.umrahDeduction || 0) || p.deductions?.penalty || 0);
  const otherPenalty = otherDed + penalty;
  const wht = Number(p.wht ?? p.whtAmount ?? p.deductions?.wht ?? 0);
  const securityDeposit = Number(p.securityDeposit ?? p.deductions?.securityDeposit ?? 0);

  // EXACT TOTAL DEDUCTIONS: Must sum all items including advance installment deduction (matches Web ERP line 506)
  // NEVER overwrite with legacy pre-advance deductionsTotal
  const totalDeductions = shortTimeAmt + advanceDed + otherPenalty + wht + securityDeposit + Number(p.ttw || 0) + Number(p.fund || 0) + Number(p.ugrm || 0) + mess;

  const grossSalary = totalEarnings;
  const computedNet = Math.max(0, grossSalary - totalDeductions);
  const bankPaid = Number(p.bankPaid || 0);
  const cashPaid = Number(p.cashPaid || 0);
  const storedNet = Number(p.netTotal || 0);

  // Web ERP standard: If paid by bank, Bank Paid row has amount & bottom NET bar displays 0. If cash paid, shows cash.
    let netSalaryDisplay = 0;
    if (bankPaid > 0) {
      netSalaryDisplay = 0;
    } else if (cashPaid > 0) {
      netSalaryDisplay = cashPaid;
    } else {
      netSalaryDisplay = storedNet || computedNet;
    }

    const isBank = bankPaid > 0 || (p.bankCash === 'Bank');
    const rawBranch = p.branch || employee?.branch || 'PWD-1';
    const cleanBranch = String(rawBranch).replace(/^[\s(]+|[\s)]+$/g, '').trim();
    const displayBranch = `(${cleanBranch})`;

    const dutyHrs = p.totalHrsPerDay || p.dutyHrs || employee?.dutyHrs || employee?.totalHrs || 12;
    const designation = p.designation?.name || p.designation || employee?.designation?.name || employee?.designation || 'Staff';
    const department = p.department?.name || p.department || employee?.department?.name || employee?.department || 'General';
    const employeeName = p.employee?.name || p.employeeName || employee?.name || 'Staff';
    const employeeCode = p.code || p.employee?.code || employee?.code || '--';
    const preparedBy = p.createdBy?.name || p.createdBy || 'Bilal Sh';

    // Determine Stamp Image & Classification (100% reliable offline Base64)
    let stampImgUri = '';
    let stampAlt = '';
    let stampClass = '';
    let stampText = '';

    const isAdvance = Boolean(p.payAdvSalary || p.isAdvanceSalary || p.advanceSalary || p.payAdv);
    if (bankPaid > 0 || (p.bankCash === 'Bank')) {
      stampImgUri = STAMP_BANK_DATA_URI;
      stampAlt = 'Bank Paid';
      stampClass = 'stamp-bank';
      stampText = 'BANK<br>ACCOUNT';
    } else if (isAdvance) {
      stampImgUri = STAMP_ADVANCE_DATA_URI;
      stampAlt = 'Advance Paid';
      stampClass = 'stamp-adv';
      stampText = 'ADVANCE<br>PAID';
    } else if (cashPaid > 0 || netSalaryDisplay > 0 || (p.bankCash === 'Cash')) {
      stampImgUri = STAMP_CASH_DATA_URI;
      stampAlt = 'Cash Paid';
      stampClass = 'stamp-cash';
      stampText = 'CASH<br>PAID';
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&family=Mrs+Saint+Delafield&display=swap');

            .signature-font {
                font-family: 'Mrs Saint Delafield', cursive;
                font-size: 1.6rem;
                font-weight: bold;
                color: #1a237e;
                display: block;
                line-height: 1;
            }

            body {
                font-family: 'Times New Roman', Times, serif;
                margin: 0; padding: 12px;
                background-color: #ffffff;
                color: #000000;
            }

            .slip-container {
                width: 100%;
                border: 1.5px solid #000;
                padding: 10px 14px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                background: white;
            }

            .header-section {
                text-align: center;
                margin-bottom: 8px;
            }
            .branch-title {
                font-size: 1.3rem;
                font-weight: 900;
                font-family: 'Roboto', sans-serif;
                color: #1a1a1a;
                margin-bottom: 2px;
            }
            .slip-title {
                font-size: 1.05rem;
                font-weight: bold;
                text-decoration: underline;
                text-transform: uppercase;
                letter-spacing: 2px;
                color: #000;
            }

            .info-section {
                display: flex;
                justify-content: space-between;
                margin-bottom: 10px;
                font-size: 0.85rem;
            }
            .info-col-left {
                flex: 0 0 46%;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .info-col-right {
                flex: 0 0 46%;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .info-row {
                display: flex;
                align-items: flex-end;
                gap: 4px;
            }
            .info-right-row {
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
            }
            .info-right-main {
                display: flex;
                align-items: flex-end;
                flex: 1;
                gap: 4px;
            }
            .info-label {
                font-weight: bold;
                color: #000;
                white-space: nowrap;
                min-width: 80px;
            }
            .info-value {
                border-bottom: 1px solid #000;
                padding-left: 4px;
                color: #000;
                font-weight: bold;
                flex: 1;
            }
            .info-value-plain {
                border-bottom: 1px solid #000;
                padding-left: 4px;
                margin-right: 8px;
                color: #000;
                font-weight: bold;
                flex: 1;
            }
            .duty-col {
                flex-shrink: 0;
                width: 60px;
                text-align: center;
                padding: 0 4px;
                font-weight: bold;
                font-size: 0.85rem;
                color: #000;
                border-bottom: 1px solid #000;
            }

            .main-columns {
                display: flex;
                border: 1.5px solid #000;
                width: 100%;
                box-sizing: border-box;
            }
            .col-earnings {
                flex: 0 0 40%;
                display: flex;
                flex-direction: column;
                border-right: 1.5px solid #000;
                box-sizing: border-box;
            }
            .col-center {
                flex: 0 0 20%;
                display: flex;
                align-items: center;
                justify-content: center;
                border-right: 1.5px solid #000;
                box-sizing: border-box;
                background: #fafafa;
            }
            .col-deductions {
                flex: 1;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
            }

            .col-header {
                background-color: #555;
                color: white;
                text-align: center;
                padding: 5px 2px;
                font-weight: bold;
                font-size: 0.85rem;
                border-bottom: 1.5px solid #000;
            }
            .row {
                display: flex;
                justify-content: space-between;
                border-bottom: 1px solid #000;
                font-size: 0.78rem;
                min-height: 23px;
                align-items: stretch;
            }
            .row:last-child { border-bottom: none; }
            .label {
                padding: 2px 6px;
                border-right: 1px solid #000;
                color: #000;
                flex: 1;
                display: flex;
                align-items: center;
            }
            .value {
                padding: 2px 6px;
                text-align: right;
                font-weight: bold;
                color: #000;
                width: 80px;
                display: flex;
                align-items: center;
                justify-content: flex-end;
            }
            .row-grey { background-color: #ccc; font-weight: bold; }
            .row-light { background-color: #e8e8e8; }
            .paid-badge {
                background-color: #d0d0d0;
                display: block;
                padding: 0 4px;
                text-align: right;
                font-weight: bold;
            }

            .net-earnings-cell {
                background: #000;
                color: white;
                font-size: 0.98rem;
                font-weight: 900;
                text-align: center;
                padding: 6px 5px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .net-deductions-cell {
                background: #000;
                color: white;
                font-size: 0.98rem;
                font-weight: 900;
                text-align: right;
                padding: 6px 8px;
                display: flex;
                align-items: center;
                justify-content: flex-end;
            }

            .stamp-wrap {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
            }
            .stamp-img {
                width: 120px;
                height: 120px;
                max-width: 95%;
                object-fit: contain;
                opacity: 0.85;
            }
            .stamp {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                border: 4px solid;
                border-radius: 50%;
                width: 84px;
                height: 84px;
                font-size: 0.65rem;
                font-weight: 900;
                text-transform: uppercase;
                font-family: 'Arial Black', Impact, sans-serif;
                opacity: 0.6;
                transform: rotate(-12deg);
                line-height: 1.2;
                padding: 4px;
                box-sizing: border-box;
                letter-spacing: 0.5px;
            }
            .stamp-bank { color: #1f569b; border-color: #1f569b; }
            .stamp-cash { color: #2e7d32; border-color: #2e7d32; }
            .stamp-adv  { color: #ed6c02; border-color: #ed6c02; }

            .signature-section {
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                padding: 22px 28px 8px 28px;
            }
            .sig-box {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .sig-name-area {
                height: 30px;
                display: flex;
                align-items: flex-end;
            }
            .sig-line {
                border-top: 1.5px solid #000;
                width: 150px;
                margin: 2px 0;
            }
            .sig-label {
                font-size: 0.82rem;
                font-weight: bold;
                color: #000;
            }
          </style>
        </head>
        <body>
          <div class="slip-container">
            <div class="header-section">
              <div class="branch-title">${displayBranch}</div>
              <div class="slip-title">SALARY SLIP</div>
            </div>

            <div class="info-section">
              <div class="info-col-left">
                <div class="info-row">
                  <span class="info-label">Emp Code:</span>
                  <span class="info-value">${employeeCode}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Date:</span>
                  <span class="info-value">${displayDate}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Employee:</span>
                  <span class="info-value">${employeeName}</span>
                </div>
              </div>

              <div class="info-col-right">
                <div class="info-right-row">
                  <div class="info-right-main">
                    <span class="info-label">Department:</span>
                    <span class="info-value-plain">${department}</span>
                  </div>
                  <div class="duty-col">Duty Hrs</div>
                </div>
                <div class="info-right-row">
                  <div class="info-right-main">
                    <span class="info-label">Designation:</span>
                    <span class="info-value-plain">${designation}</span>
                  </div>
                  <div class="duty-col">${dutyHrs}</div>
                </div>
              </div>
            </div>

            <div class="main-columns">
              <!-- Earnings -->
              <div class="col-earnings">
                <div class="col-header">Earnings</div>
                <div class="row"><div class="label">Basic Salary</div><div class="value">${fmt(basicSalary)}</div></div>
                <div class="row row-light"><div class="label">Over Time</div><div class="value">${fmt(overTime)}</div></div>
                <div class="row"><div class="label">Allowance</div><div class="value">0</div></div>
                <div class="row"><div class="label">Fix Allowance</div><div class="value">${fmt(fixAllow)}</div></div>
                <div class="row"><div class="label">Monthly Commission</div><div class="value">${fmt(monthlyComm)}</div></div>
                <div class="row"><div class="label">UG Commission</div><div class="value">${fmt(ugComm)}</div></div>
                <div class="row"><div class="label">WareHouse Comm</div><div class="value">${fmt(warehouseComm)}</div></div>
                <div class="row"><div class="label">Other Allowance</div><div class="value">${fmt(otherAllow)}</div></div>
                <div class="row"><div class="label">Breakfast &amp; Roti</div><div class="value">${fmt(breakfastRoti)}</div></div>
                <div class="row"><div class="label">ST.Less Allowance</div><div class="value">${fmt(stLateAllow)}</div></div>
                <div class="row row-grey"><div class="label">Gross Salary</div><div class="value">${fmt(grossSalary)}</div></div>
                <div class="row"><div class="label">Bank Paid</div><div class="value">${bankPaid > 0 ? `<span class="paid-badge">${fmt(bankPaid)}</span>` : fmt(bankPaid)}</div></div>
                <div class="net-earnings-cell">NET Salary</div>
              </div>

              <!-- Center Stamp -->
              <div class="col-center">
                <div class="stamp-wrap">
                  ${stampImgUri ? `
                    <img class="stamp-img"
                         src="${stampImgUri}"
                         alt="${stampAlt}" />
                  ` : (stampText ? `
                    <div class="stamp ${stampClass}">
                      <div style="font-size: 0.55rem; letter-spacing: 1px; margin-bottom: 2px;">★ ★ ★</div>
                      <div>${stampText}</div>
                      <div style="font-size: 0.55rem; letter-spacing: 1px; margin-top: 2px;">★ ★ ★</div>
                    </div>
                  ` : '')}
                </div>
              </div>

              <!-- Deductions -->
              <div class="col-deductions">
                <div class="col-header">Deductions</div>
                <div class="row"><div class="label">Short Time</div><div class="value">${fmt(shortTimeAmt)}</div></div>
                <div class="row"><div class="label">Mess</div><div class="value">${fmt(mess)}</div></div>
                <div class="row"><div class="label">Pre_Month_Balance</div><div class="value">${fmt(preMonthBal)}</div></div>
                <div class="row"><div class="label">Current_Advance</div><div class="value">${fmt(currentAdv)}</div></div>
                <div class="row"><div class="label">Advance Deduction</div><div class="value">${fmt(advanceDed)}</div></div>
                <div class="row row-grey"><div class="label">Balance</div><div class="value">${fmt(balance)}</div></div>
                <div class="row"><div class="label">Other Deduction</div><div class="value">${fmt(otherDed)}</div></div>
                <div class="row"><div class="label">Penalty</div><div class="value">${fmt(penalty)}</div></div>
                <div class="row"><div class="label">Salary WHT</div><div class="value">${fmt(wht)}</div></div>
                <div class="row"><div class="label">Security Deposit</div><div class="value">${fmt(securityDeposit)}</div></div>
                <div class="row row-grey"><div class="label">Total Deduction</div><div class="value">${fmt(totalDeductions)}</div></div>
                <div class="row"><div class="label">Cash_Paid</div><div class="value">${cashPaid > 0 ? `<span class="paid-badge">${fmt(cashPaid)}</span>` : fmt(cashPaid)}</div></div>
                <div class="net-deductions-cell">${fmt(netSalaryDisplay)}</div>
              </div>
            </div>

            <div class="signature-section">
              <div class="sig-box">
                <div class="sig-name-area">
                  <span class="signature-font">${preparedBy}</span>
                </div>
                <div class="sig-line"></div>
                <div class="sig-label">Prepared By</div>
              </div>
              <div class="sig-box">
                <div class="sig-name-area"></div>
                <div class="sig-line"></div>
                <div class="sig-label">Approved By</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    return html;
  } catch (error) {
    console.error('Error constructing salary slip HTML:', error);
    throw error;
  }
}

/**
 * Print & Share Salary Pay Slip (Generates Official PDF with Stamp)
 */
export async function printSalarySlip(employee, slip) {
  try {
    const html = await generateSalarySlipHtml(employee, slip);
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (error) {
    console.error('Error generating salary slip PDF:', error);
    Alert.alert('Print Error', 'Could not generate Salary Slip PDF: ' + error.message);
  }
}

/**
 * Preview Salary Pay Slip In-App (Native Visual Screen Preview with Pinch/Zoom & Print Options)
 */
export async function previewSalarySlip(employee, slip) {
  try {
    const html = await generateSalarySlipHtml(employee, slip);
    await Print.printAsync({ html });
  } catch (error) {
    console.error('Error previewing salary slip:', error);
    Alert.alert('Preview Error', 'Could not preview Salary Slip: ' + error.message);
  }
}

/**
 * Prompt Salary Slip Actions (In-App Preview, Download PDF, or Open Web Slip)
 */
export function promptSalarySlipActions(employee, slip) {
  const payrollId = slip._id || slip.id || slip.payrollId;
  const empName = slip.employeeName || employee?.name || 'Staff';
  const monthStr = slip.monthYear || 'Selected Month';

  Alert.alert(
    'Salary Slip Options',
    `Employee: ${empName}\nPeriod: ${monthStr}`,
    [
      {
        text: '💬 Send via WhatsApp (1-Tap)',
        onPress: () => shareSalarySlipViaWhatsApp(employee, slip)
      },
      {
        text: '🖨️ Thermal Slip (58mm / 80mm POS)',
        onPress: () => promptThermalSalarySlipOptions(employee, slip)
      },
      {
        text: '👁️ View Slip Preview (In-App)',
        onPress: () => previewSalarySlip(employee, slip)
      },
      {
        text: '📥 Official PDF (Download / Share)',
        onPress: () => printSalarySlip(employee, slip)
      },
      {
        text: 'Cancel',
        style: 'cancel'
      }
    ],
    { cancelable: true }
  );
}

/**
 * Print & Share Employee Advance Ledger
 */
export async function printAdvanceLedger(employee, financials, transactions, isPreview = false) {
  try {
    const rowsHtml = transactions.map(item => {
      const isPay = (item.transactionType || 'Pay').toLowerCase() === 'pay';
      return `
        <tr>
          <td>${item.date}</td>
          <td><span class="badge ${isPay ? 'badge-pay' : 'badge-rec'}">${isPay ? 'ADVANCE GIVEN' : 'DEDUCTED / RECEIVED'}</span></td>
          <td>${item.docMode || 'Cash'}</td>
          <td class="text-right" style="font-weight: 700; color: ${isPay ? '#b91c1c' : '#166534'};">
            ${isPay ? '+' : '-'} Rs. ${(item.amount || 0).toLocaleString()}
          </td>
          <td class="text-right" style="font-weight: 800;">Rs. ${(item.balance || 0).toLocaleString()}</td>
          <td>${item.remarks || '-'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Employee Advance & Loan Ledger Statement</div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Employee Name: </span><span class="meta-val">${employee.name}</span></div>
              <div class="meta-row"><span class="meta-label">Employee Code: </span><span class="meta-val">${employee.code}</span></div>
            </div>
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Branch Store: </span><span class="meta-val">${employee.branch || 'Central Store'}</span></div>
              <div class="meta-row"><span class="meta-label">Designation: </span><span class="meta-val">${employee.designation || 'Staff'}</span></div>
            </div>
          </div>

          <div class="summary-cards">
            ${financials.openingBalance !== undefined ? `
            <div class="sum-card" style="border-left: 4px solid #f59e0b;">
              <div class="sum-card-num">Rs. ${(financials.openingBalance || 0).toLocaleString()}</div>
              <div class="sum-card-label">Opening Balance (B/F)</div>
            </div>` : ''}
            <div class="sum-card red">
              <div class="sum-card-num">Rs. ${(financials.totalAdvancePaid || financials.totalAdvancesTaken || 0).toLocaleString()}</div>
              <div class="sum-card-label">Advances Issued in Period</div>
            </div>
            <div class="sum-card green">
              <div class="sum-card-num">Rs. ${(financials.totalAdvanceRecovered || financials.totalAdvancesDeducted || 0).toLocaleString()}</div>
              <div class="sum-card-label">Total Recovered in Period</div>
            </div>
            <div class="sum-card blue">
              <div class="sum-card-num">Rs. ${(financials.advanceBalance || 0).toLocaleString()}</div>
              <div class="sum-card-label">Current Outstanding Balance</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction Type</th>
                <th>Payment Mode</th>
                <th class="text-right">Amount</th>
                <th class="text-right">Remaining Balance</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6" class="text-center">No advance ledger records found</td></tr>'}
            </tbody>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Employee Signature</div>
            <div class="sig-box">Accounts / Finance Verification</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error generating advance ledger PDF:', error);
    Alert.alert('Print Error', 'Could not generate Advance Ledger PDF: ' + error.message);
  }
}

/**
 * Prompt Options for Employee Advance Ledger
 */
export function promptAdvanceLedgerActions(employee, financials, transactions) {
  Alert.alert(
    'Employee Advance Ledger',
    `${employee?.name || 'Staff'} (#${employee?.code || '--'})`,
    [
      {
        text: '👁️ View PDF (In-App Preview)',
        onPress: () => printAdvanceLedger(employee, financials, transactions, false)
      },
      {
        text: '📥 Download / Share PDF',
        onPress: () => printAdvanceLedger(employee, financials, transactions, true)
      },
      { text: 'Cancel', style: 'cancel' }
    ]
  );
}

/**
 * Print & Share Branch-Wise Advances Overview
 */
export async function printBranchAdvancesOverview(branch, monthYear, summary, transactions, isPreview = false) {
  try {
    const rowsHtml = transactions.map((item, idx) => {
      const isPay = (item.transactionType || 'Pay').toLowerCase() === 'pay';
      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${item.employeeName}</strong></td>
          <td>${item.employeeCode}</td>
          <td>${item.branch}</td>
          <td>${item.date}</td>
          <td><span class="badge ${isPay ? 'badge-pay' : 'badge-rec'}">${item.transactionType}</span></td>
          <td class="text-right" style="font-weight: 700; color: ${isPay ? '#b91c1c' : '#166534'};">Rs. ${(item.amount || 0).toLocaleString()}</td>
          <td class="text-right" style="font-weight: 800;">Rs. ${(item.balance || 0).toLocaleString()}</td>
          <td>${item.remarks || '-'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Branch Advances Report • ${branch || 'All Branches'} (${monthYear})</div>
          </div>

          <div class="summary-cards">
            <div class="sum-card red">
              <div class="sum-card-num">Rs. ${(summary.totalPaid || 0).toLocaleString()}</div>
              <div class="sum-card-label">Advances Issued This Month</div>
            </div>
            <div class="sum-card green">
              <div class="sum-card-num">Rs. ${(summary.totalReceived || 0).toLocaleString()}</div>
              <div class="sum-card-label">Recovered This Month</div>
            </div>
            <div class="sum-card blue">
              <div class="sum-card-num">${summary.count || 0}</div>
              <div class="sum-card-label">Total Transactions</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th>Code</th>
                <th>Branch</th>
                <th>Date</th>
                <th>Type</th>
                <th class="text-right">Amount</th>
                <th class="text-right">Balance</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="9" class="text-center">No advance records recorded for this branch this month</td></tr>'}
            </tbody>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Prepared By</div>
            <div class="sig-box">Admin / Branch Manager Signature</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error generating branch advances PDF:', error);
    Alert.alert('Print Error', 'Could not generate Branch Advances PDF: ' + error.message);
  }
}

/**
 * Prompt Options for Branch Advances Overview
 */
export function promptBranchAdvancesActions(branch, monthYear, summary, transactions) {
  Alert.alert(
    'Branch Advances Overview',
    `Branch: ${branch || 'All Branches'} (${monthYear})`,
    [
      {
        text: '👁️ View PDF (In-App Preview)',
        onPress: () => printBranchAdvancesOverview(branch, monthYear, summary, transactions, false)
      },
      {
        text: '📥 Download / Share PDF',
        onPress: () => printBranchAdvancesOverview(branch, monthYear, summary, transactions, true)
      },
      { text: 'Cancel', style: 'cancel' }
    ]
  );
}

/**
 * Helper to safely parse worked hours from string or number
 */
const parseWorkedHoursNumber = (val) => {
  if (!val || val === '-' || val === '--:--') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim().toLowerCase().replace('hrs', '').replace('hr', '').trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    return (parts[0] || 0) + ((parts[1] || 0) / 60);
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Print & Share Monthly Attendance Report
 */
export async function printAttendanceReport(employee, monthTitle, summary, logs, isPreview = false) {
  try {
    let computedHours = 0;
    if (summary && summary.totalWorkedHours && typeof summary.totalWorkedHours === 'number' && summary.totalWorkedHours > 0) {
      computedHours = summary.totalWorkedHours;
    } else if (summary && summary.totalWorkedHrs) {
      computedHours = parseWorkedHoursNumber(summary.totalWorkedHrs);
    } else if (summary && summary.totalHrs) {
      computedHours = parseWorkedHoursNumber(summary.totalHrs);
    }

    if (computedHours === 0 && logs && logs.length > 0) {
      computedHours = logs.reduce((acc, item) => {
        return acc + parseWorkedHoursNumber(item.workedHrs || item.totalHrs);
      }, 0);
    }

    const rowsHtml = (logs || []).map(item => {
      const s = (item.status || item.displayStatus || '').toLowerCase();
      let badgeClass = 'badge-abs';
      if (s.includes('present') || s === 'p') badgeClass = 'badge-pres';
      else if (s.includes('leave')) badgeClass = 'badge-leave';
      else if (s.includes('half') || s.includes('short')) badgeClass = 'badge-half';

      const rowHrs = item.workedHrs || (item.totalHrs ? `${item.totalHrs} hrs` : '--');

      return `
        <tr>
          <td>${item.date}</td>
          <td>${item.day || '-'}</td>
          <td class="text-center">${item.checkIn || '--:--'}</td>
          <td class="text-center">${item.checkOut || '--:--'}</td>
          <td class="text-center" style="font-weight: 700;">${rowHrs}</td>
          <td class="text-center"><span class="badge ${badgeClass}">${item.status || item.displayStatus || 'Present'}</span></td>
          <td>${item.remarks || '-'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Monthly Employee Attendance Timeline • ${monthTitle}</div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Employee: </span><span class="meta-val">${employee?.name || employee?.employeeName || 'Staff'}</span></div>
              <div class="meta-row"><span class="meta-label">Code: </span><span class="meta-val">${employee?.code || employee?.employeeCode || '--'}</span></div>
            </div>
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Branch Store: </span><span class="meta-val">${employee?.branch || 'Central Store'}</span></div>
              <div class="meta-row"><span class="meta-label">Month / Year: </span><span class="meta-val">${monthTitle}</span></div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="sum-card green">
              <div class="sum-card-num">${summary.presentDays || 0} Days</div>
              <div class="sum-card-label">Present</div>
            </div>
            <div class="sum-card red">
              <div class="sum-card-num">${summary.absentDays || 0} Days</div>
              <div class="sum-card-label">Absent</div>
            </div>
            <div class="sum-card yellow">
              <div class="sum-card-num">${summary.leavesDays || 0} Days</div>
              <div class="sum-card-label">Approved Leaves</div>
            </div>
            <div class="sum-card blue">
              <div class="sum-card-num">${computedHours.toFixed(1)} hrs</div>
              <div class="sum-card-label">Total Worked Duty</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th class="text-center">Check-In</th>
                <th class="text-center">Check-Out</th>
                <th class="text-center">Worked (Hrs)</th>
                <th class="text-center">Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="7" class="text-center">No attendance logs found for this period</td></tr>'}
            </tbody>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Employee Signature</div>
            <div class="sig-box">Branch Manager / HR Signature</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error generating attendance PDF:', error);
    Alert.alert('Print Error', 'Could not generate Attendance Sheet PDF: ' + error.message);
  }
}

/**
 * Prompt Options for Monthly Attendance Report
 */
export function promptAttendanceReportActions(employee, monthTitle, summary, logs) {
  Alert.alert(
    'Monthly Attendance Sheet',
    `${employee?.name || 'My Attendance'} • ${monthTitle}`,
    [
      {
        text: '👁️ View PDF (In-App Preview)',
        onPress: () => printAttendanceReport(employee, monthTitle, summary, logs, false)
      },
      {
        text: '📥 Download / Share PDF',
        onPress: () => printAttendanceReport(employee, monthTitle, summary, logs, true)
      },
      { text: 'Cancel', style: 'cancel' }
    ]
  );
}

/**
 * 1. WH Customer Ledger Report Print & Preview
 */
export async function printWHCustomerLedger(ledgerData, meta = {}, isPreview = false) {
  try {
    const fmt = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0.00';
      return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const entries = ledgerData?.entries || [];
    let runningBalance = ledgerData?.openingBalance || 0;
    let totalDebit = 0;
    let totalCredit = 0;

    let rowsHtml = `
      <tr style="background: #f8fafc; font-weight: bold;">
        <td colspan="3" style="text-align: right;">Opening Balance</td>
        <td style="text-align: right;">-</td>
        <td style="text-align: right;">-</td>
        <td style="text-align: right;">${fmt(runningBalance)}</td>
      </tr>
    `;

    entries.forEach(e => {
      runningBalance += (e.debit || 0) - (e.credit || 0);
      totalDebit += (e.debit || 0);
      totalCredit += (e.credit || 0);

      rowsHtml += `
        <tr>
          <td>${new Date(e.date).toLocaleDateString('en-GB')}</td>
          <td><b>${e.refId ? (e.refId.substring(e.refId.length - 8)) : '-'}</b></td>
          <td>${e.description || '-'}</td>
          <td style="text-align: right; color: #b91c1c;">${e.debit > 0 ? fmt(e.debit) : '-'}</td>
          <td style="text-align: right; color: #15803d;">${e.credit > 0 ? fmt(e.credit) : '-'}</td>
          <td style="text-align: right; font-weight: bold; color: ${runningBalance >= 0 ? '#1e40af' : '#b91c1c'};">${fmt(runningBalance)}</td>
        </tr>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Warehouse Customer Statement / Ledger</div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Customer: </span><span class="meta-val">${meta.customerName || 'All Customers'}</span></div>
              <div class="meta-row"><span class="meta-label">Code: </span><span class="meta-val">${meta.customerCode || '--'}</span></div>
              <div class="meta-row"><span class="meta-label">Phone: </span><span class="meta-val">${meta.customerPhone || '--'}</span></div>
            </div>
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Period From: </span><span class="meta-val">${meta.from || 'Beginning'}</span></div>
              <div class="meta-row"><span class="meta-label">Period To: </span><span class="meta-val">${meta.to || 'Present'}</span></div>
              <div class="meta-row"><span class="meta-label">Print Date: </span><span class="meta-val">${new Date().toLocaleDateString()}</span></div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="sum-card blue">
              <div class="sum-card-num">${fmt(ledgerData?.openingBalance || 0)}</div>
              <div class="sum-card-label">Opening Balance</div>
            </div>
            <div class="sum-card red">
              <div class="sum-card-num">${fmt(totalDebit)}</div>
              <div class="sum-card-label">Total Debit (+)</div>
            </div>
            <div class="sum-card green">
              <div class="sum-card-num">${fmt(totalCredit)}</div>
              <div class="sum-card-label">Total Credit (-)</div>
            </div>
            <div class="sum-card ${runningBalance >= 0 ? 'blue' : 'red'}">
              <div class="sum-card-num">${fmt(runningBalance)}</div>
              <div class="sum-card-label">Closing Balance</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 15%;">Date</th>
                <th style="width: 15%;">Ref #</th>
                <th style="width: 34%;">Description</th>
                <th style="width: 12%; text-align: right;">Debit (Rs.)</th>
                <th style="width: 12%; text-align: right;">Credit (Rs.)</th>
                <th style="width: 12%; text-align: right;">Balance (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #333;">
                <td colspan="3" style="text-align: right;">TOTALS:</td>
                <td style="text-align: right; color: #b91c1c;">${fmt(totalDebit)}</td>
                <td style="text-align: right; color: #15803d;">${fmt(totalCredit)}</td>
                <td style="text-align: right;">${fmt(runningBalance)}</td>
              </tr>
            </tfoot>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Prepared By (Accounts)</div>
            <div class="sig-box">Customer / Receiver Signature</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error printing WH Customer Ledger:', error);
    Alert.alert('Print Error', 'Could not process WH Customer Ledger: ' + error.message);
  }
}

/**
 * 2. WH Customer Balances Report Print & Preview
 */
export async function printWHCustomerBalances(balancesList = [], meta = {}, isPreview = false) {
  try {
    const fmt = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0.00';
      return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    let totalBalance = 0;
    let nonZeroCount = 0;

    const rowsHtml = balancesList.map((c, idx) => {
      const bal = c.balance || 0;
      totalBalance += bal;
      if (bal !== 0) nonZeroCount++;

      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><b>${c.code || '--'}</b></td>
          <td><b>${c.customerName || '--'}</b></td>
          <td>${c.categoryName || '--'}</td>
          <td>${c.phone || '--'}</td>
          <td style="text-align: right; font-weight: bold; color: ${bal > 0 ? '#1e40af' : (bal < 0 ? '#b91c1c' : '#64748b')};">${fmt(bal)}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Warehouse Customer Balances Summary</div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Category Filter: </span><span class="meta-val">${meta.categoryName || 'All Categories'}</span></div>
              <div class="meta-row"><span class="meta-label">Filter Mode: </span><span class="meta-val">${meta.balanceOnly ? 'Non-Zero Balance Only' : 'All Customers'}</span></div>
            </div>
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Total Listed: </span><span class="meta-val">${balancesList.length} Customers</span></div>
              <div class="meta-row"><span class="meta-label">Print Date: </span><span class="meta-val">${new Date().toLocaleDateString()}</span></div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="sum-card blue">
              <div class="sum-card-num">${balancesList.length}</div>
              <div class="sum-card-label">Total Customers</div>
            </div>
            <div class="sum-card green">
              <div class="sum-card-num">${nonZeroCount}</div>
              <div class="sum-card-label">Active Balances</div>
            </div>
            <div class="sum-card ${totalBalance >= 0 ? 'blue' : 'red'}">
              <div class="sum-card-num">${fmt(totalBalance)}</div>
              <div class="sum-card-label">Total Net Receivable (Rs.)</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 6%; text-align: center;">Sr#</th>
                <th style="width: 14%;">Code</th>
                <th style="width: 32%;">Customer Name</th>
                <th style="width: 18%;">Category</th>
                <th style="width: 14%;">Phone</th>
                <th style="width: 16%; text-align: right;">Balance (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6" class="text-center">No customer records found</td></tr>'}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #333;">
                <td colspan="5" style="text-align: right;">GRAND TOTAL RECEIVABLE:</td>
                <td style="text-align: right; color: #1e40af;">${fmt(totalBalance)}</td>
              </tr>
            </tfoot>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Accounts In-charge</div>
            <div class="sig-box">Managing Director Signature</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error printing WH Customer Balances:', error);
    Alert.alert('Print Error', 'Could not process WH Customer Balances: ' + error.message);
  }
}

/**
 * 3. WH Stock Position Report Print & Preview
 */
export async function printWHStockPosition(itemsList = [], meta = {}, isPreview = false) {
  try {
    const fmt = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0';
      return Number(num).toLocaleString('en-US');
    };
    const fmtDec = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0.00';
      return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    let totalStockQty = 0;
    let totalCostVal = 0;
    let totalSaleVal = 0;
    let inStockCount = 0;

    const rowsHtml = itemsList.map((item, idx) => {
      const stock = item.currentStock || 0;
      const cost = item.costPrice || 0;
      const sale = item.salePrice || 0;
      
      totalStockQty += stock;
      totalCostVal += (stock * cost);
      totalSaleVal += (stock * sale);
      if (stock > 0) inStockCount++;

      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><b>${item.code || item.itemsCode || item.barcode || '--'}</b></td>
          <td><b>${item.name || '--'}</b></td>
          <td>${item.category?.name || item.categoryName || '--'}${item.itemClass?.name ? ` / ${item.itemClass.name}` : ''}${item.subClass?.name ? ` / ${item.subClass.name}` : ''}</td>
          <td>${item.company?.name || item.companyName || '--'}</td>
          <td style="text-align: right;">${fmtDec(cost)}</td>
          <td style="text-align: right;">${fmtDec(sale)}</td>
          <td style="text-align: right; font-weight: bold; color: ${stock > 0 ? '#15803d' : (stock < 0 ? '#b91c1c' : '#64748b')};">${fmt(stock)}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Warehouse Stock Position Report</div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Criteria: </span><span class="meta-val">${meta.criteria || 'All Stock'}</span></div>
              <div class="meta-row"><span class="meta-label">Category: </span><span class="meta-val">${meta.categoryName || 'All Categories'}</span></div>
              <div class="meta-row"><span class="meta-label">Class: </span><span class="meta-val">${meta.className || 'All Classes'}</span></div>
              <div class="meta-row"><span class="meta-label">Sub-Class: </span><span class="meta-val">${meta.subClassName || 'All Sub-Classes'}</span></div>
            </div>
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Total Items: </span><span class="meta-val">${itemsList.length} SKUs (${inStockCount} In Stock)</span></div>
              <div class="meta-row"><span class="meta-label">Print Date: </span><span class="meta-val">${new Date().toLocaleDateString()}</span></div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="sum-card blue">
              <div class="sum-card-num">${fmt(totalStockQty)}</div>
              <div class="sum-card-label">Total Stock Units</div>
            </div>
            <div class="sum-card green">
              <div class="sum-card-num">${fmtDec(totalCostVal)}</div>
              <div class="sum-card-label">Total Cost Value (Rs.)</div>
            </div>
            <div class="sum-card">
              <div class="sum-card-num">${fmtDec(totalSaleVal)}</div>
              <div class="sum-card-label">Total Sale Value (Rs.)</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 5%; text-align: center;">Sr#</th>
                <th style="width: 15%;">Barcode/SKU</th>
                <th style="width: 32%;">Item Description</th>
                <th style="width: 14%;">Category</th>
                <th style="width: 12%;">Company</th>
                <th style="width: 8%; text-align: right;">Cost</th>
                <th style="width: 8%; text-align: right;">Sale</th>
                <th style="width: 6%; text-align: right;">Stock</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="8" class="text-center">No stock items found matching filters</td></tr>'}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #333;">
                <td colspan="7" style="text-align: right;">TOTAL AVAILABLE STOCK:</td>
                <td style="text-align: right; color: #15803d;">${fmt(totalStockQty)}</td>
              </tr>
            </tfoot>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Warehouse Store In-charge</div>
            <div class="sig-box">Inventory Auditor Signature</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error printing WH Stock Position:', error);
    Alert.alert('Print Error', 'Could not process WH Stock Position: ' + error.message);
  }
}

/**
 * 4. WH Item Ledger / Stock Movement Timeline Print & Preview
 */
export async function printWHItemLedger(ledgerData, meta = {}, isPreview = false) {
  try {
    const fmt = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0';
      return Number(num).toLocaleString('en-US');
    };

    const entries = ledgerData?.entries || [];
    let runningQty = ledgerData?.openingBalance || 0;
    let totalIn = 0;
    let totalOut = 0;

    let rowsHtml = `
      <tr style="background: #f8fafc; font-weight: bold;">
        <td colspan="3" style="text-align: right;">Opening Stock</td>
        <td style="text-align: right;">-</td>
        <td style="text-align: right;">-</td>
        <td style="text-align: right;">${fmt(runningQty)}</td>
      </tr>
    `;

    entries.forEach(e => {
      const inQty = e.type === 'in' ? (e.quantity || 0) : 0;
      const outQty = e.type === 'out' ? (e.quantity || 0) : 0;
      
      runningQty += (inQty - outQty);
      totalIn += inQty;
      totalOut += outQty;

      rowsHtml += `
        <tr>
          <td>${new Date(e.date).toLocaleDateString('en-GB')}</td>
          <td><b>${(e.refType || 'log').toUpperCase()}</b></td>
          <td>${e.description || '-'}</td>
          <td style="text-align: right; color: #15803d;">${inQty > 0 ? ('+' + fmt(inQty)) : '-'}</td>
          <td style="text-align: right; color: #b91c1c;">${outQty > 0 ? ('-' + fmt(outQty)) : '-'}</td>
          <td style="text-align: right; font-weight: bold; color: ${runningQty > 0 ? '#1e40af' : (runningQty < 0 ? '#b91c1c' : '#64748b')};">${fmt(runningQty)}</td>
        </tr>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Warehouse Item Stock Ledger / Movement Log</div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Item Name: </span><span class="meta-val">${meta.itemName || 'Selected Item'}</span></div>
              <div class="meta-row"><span class="meta-label">Barcode / Code: </span><span class="meta-val">${meta.itemCode || '--'}</span></div>
            </div>
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Period From: </span><span class="meta-val">${meta.from || 'Beginning'}</span></div>
              <div class="meta-row"><span class="meta-label">Period To: </span><span class="meta-val">${meta.to || 'Present'}</span></div>
              <div class="meta-row"><span class="meta-label">Print Date: </span><span class="meta-val">${new Date().toLocaleDateString()}</span></div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="sum-card blue">
              <div class="sum-card-num">${fmt(ledgerData?.openingBalance || 0)}</div>
              <div class="sum-card-label">Opening Stock</div>
            </div>
            <div class="sum-card green">
              <div class="sum-card-num">+${fmt(totalIn)}</div>
              <div class="sum-card-label">Total Inwards (In)</div>
            </div>
            <div class="sum-card red">
              <div class="sum-card-num">-${fmt(totalOut)}</div>
              <div class="sum-card-label">Total Outwards (Out)</div>
            </div>
            <div class="sum-card ${runningQty > 0 ? 'blue' : (runningQty < 0 ? 'red' : '')}">
              <div class="sum-card-num">${fmt(runningQty)}</div>
              <div class="sum-card-label">Current Closing Stock</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 14%;">Date</th>
                <th style="width: 14%;">Movement Type</th>
                <th style="width: 36%;">Details / Party / Remarks</th>
                <th style="width: 12%; text-align: right;">In (+)</th>
                <th style="width: 12%; text-align: right;">Out (-)</th>
                <th style="width: 12%; text-align: right;">Stock (Balance)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #333;">
                <td colspan="3" style="text-align: right;">TOTAL TRANSACTIONS:</td>
                <td style="text-align: right; color: #15803d;">+${fmt(totalIn)}</td>
                <td style="text-align: right; color: #b91c1c;">-${fmt(totalOut)}</td>
                <td style="text-align: right;">${fmt(runningQty)}</td>
              </tr>
            </tfoot>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Store Keeper Signature</div>
            <div class="sig-box">Warehouse Manager Signature</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error printing WH Item Ledger:', error);
    Alert.alert('Print Error', 'Could not process WH Item Ledger: ' + error.message);
  }
}

/**
 * 5. WH Stock Activity Report Print & Preview
 */
export async function printWHStockActivity(activityList = [], meta = {}, isPreview = false) {
  try {
    const fmt = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0';
      return Number(num).toLocaleString('en-US');
    };

    let totalOpening = 0;
    let totalPurchases = 0;
    let totalSales = 0;
    let totalReturns = 0;
    let totalAdjustments = 0;
    let totalClosing = 0;

    const rowsHtml = activityList.map((item) => {
      totalOpening += (item.opening || 0);
      totalPurchases += (item.purchases || 0);
      totalSales += (item.sales || 0);
      totalReturns += (item.returns || 0);
      totalAdjustments += (item.adjustments || 0);
      totalClosing += (item.closing || 0);

      return `
        <tr>
          <td><b>${item.code || '--'}</b></td>
          <td><b>${item.name || '--'}</b></td>
          <td style="text-align: right;">${fmt(item.opening || 0)}</td>
          <td style="text-align: right; color: #15803d;">${item.purchases ? ('+' + fmt(item.purchases)) : '-'}</td>
          <td style="text-align: right; color: #b91c1c;">${item.sales ? ('-' + fmt(item.sales)) : '-'}</td>
          <td style="text-align: right;">${item.returns ? fmt(item.returns) : '-'}</td>
          <td style="text-align: right;">${item.adjustments ? fmt(item.adjustments) : '-'}</td>
          <td style="text-align: right; font-weight: bold; color: ${item.closing > 0 ? '#1e40af' : (item.closing < 0 ? '#b91c1c' : '#64748b')};">${fmt(item.closing || 0)}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Warehouse Stock Activity & Movement Matrix</div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Period From: </span><span class="meta-val">${meta.from || 'Beginning'}</span></div>
              <div class="meta-row"><span class="meta-label">Period To: </span><span class="meta-val">${meta.to || 'Present'}</span></div>
            </div>
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Total SKUs: </span><span class="meta-val">${activityList.length} Items</span></div>
              <div class="meta-row"><span class="meta-label">Print Date: </span><span class="meta-val">${new Date().toLocaleDateString()}</span></div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="sum-card blue">
              <div class="sum-card-num">${fmt(totalOpening)}</div>
              <div class="sum-card-label">Opening Units</div>
            </div>
            <div class="sum-card green">
              <div class="sum-card-num">+${fmt(totalPurchases)}</div>
              <div class="sum-card-label">Purchases (In)</div>
            </div>
            <div class="sum-card red">
              <div class="sum-card-num">-${fmt(totalSales)}</div>
              <div class="sum-card-label">Sales (Out)</div>
            </div>
            <div class="sum-card">
              <div class="sum-card-num">${fmt(totalClosing)}</div>
              <div class="sum-card-label">Closing Units</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Code</th>
                <th style="width: 28%;">Item Name</th>
                <th style="width: 10%; text-align: right;">Opening</th>
                <th style="width: 10%; text-align: right;">Purchases</th>
                <th style="width: 10%; text-align: right;">Sales</th>
                <th style="width: 10%; text-align: right;">Returns</th>
                <th style="width: 10%; text-align: right;">Aud/Adj</th>
                <th style="width: 10%; text-align: right;">Closing</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="8" class="text-center">No stock activity logged for this period</td></tr>'}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #333;">
                <td colspan="2" style="text-align: right;">TOTAL ACTIVITY SUMMARY:</td>
                <td style="text-align: right;">${fmt(totalOpening)}</td>
                <td style="text-align: right; color: #15803d;">+${fmt(totalPurchases)}</td>
                <td style="text-align: right; color: #b91c1c;">-${fmt(totalSales)}</td>
                <td style="text-align: right;">${fmt(totalReturns)}</td>
                <td style="text-align: right;">${fmt(totalAdjustments)}</td>
                <td style="text-align: right; color: #1e40af;">${fmt(totalClosing)}</td>
              </tr>
            </tfoot>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Store Supervisor</div>
            <div class="sig-box">Inventory Controller</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error printing WH Stock Activity:', error);
    Alert.alert('Print Error', 'Could not process WH Stock Activity: ' + error.message);
  }
}

/**
 * 6. WH Stock Audit Report Print & Preview
 */
export async function printWHStockAudit(auditDetail, meta = {}, isPreview = false) {
  try {
    const fmt = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0';
      return Number(num).toLocaleString('en-US');
    };
    const fmtDec = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0.00';
      return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const items = auditDetail?.items || [];
    let totalSysStock = 0;
    let totalPhysicalStock = 0;
    let totalDiffQty = 0;
    let totalDiffVal = 0;
    let matchedCount = 0;

    const rowsHtml = items.map((entry, idx) => {
      const itm = entry.item || {};
      const sysStock = entry.systemStock ?? entry.systemQty ?? 0;
      const physStock = entry.physicalStock ?? entry.physicalQty ?? 0;
      const diff = physStock - sysStock;
      const cost = itm.costPrice || 0;
      const diffVal = diff * cost;

      totalSysStock += sysStock;
      totalPhysicalStock += physStock;
      totalDiffQty += diff;
      totalDiffVal += diffVal;
      if (diff === 0) matchedCount++;

      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><b>${itm.barcode || itm.itemsCode || '--'}</b></td>
          <td><b>${itm.name || '--'}</b></td>
          <td style="text-align: right;">${fmt(sysStock)}</td>
          <td style="text-align: right; font-weight: bold;">${fmt(physStock)}</td>
          <td style="text-align: right; font-weight: bold; color: ${diff > 0 ? '#15803d' : (diff < 0 ? '#b91c1c' : '#64748b')};">${diff > 0 ? ('+' + fmt(diff)) : fmt(diff)}</td>
          <td style="text-align: right;">${fmtDec(cost)}</td>
          <td style="text-align: right; font-weight: bold; color: ${diffVal > 0 ? '#15803d' : (diffVal < 0 ? '#b91c1c' : '#64748b')};">${fmtDec(diffVal)}</td>
        </tr>
      `;
    }).join('');

    const auditDateStr = auditDetail?.date ? new Date(auditDetail.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${getBaseStyles()}
        </head>
        <body>
          <div class="header-container">
            <h1 class="company-title">BAS - BILAL ACCESSORIES SYSTEM</h1>
            <div class="report-subtitle">Warehouse Stock Physical Audit Report</div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Audit #: </span><span class="meta-val">${auditDetail?.auditNumber || auditDetail?._id?.substring(auditDetail._id.length - 8) || '--'}</span></div>
              <div class="meta-row"><span class="meta-label">Audit Date: </span><span class="meta-val">${auditDateStr}</span></div>
              <div class="meta-row"><span class="meta-label">Status: </span><span class="meta-val">${(auditDetail?.status || 'Draft').toUpperCase()}</span></div>
            </div>
            <div class="meta-col">
              <div class="meta-row"><span class="meta-label">Auditor / Created By: </span><span class="meta-val">${auditDetail?.createdBy?.name || 'Store Auditor'}</span></div>
              <div class="meta-row"><span class="meta-label">Total Items Audited: </span><span class="meta-val">${items.length} SKUs</span></div>
              <div class="meta-row"><span class="meta-label">Print Date: </span><span class="meta-val">${new Date().toLocaleString()}</span></div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="sum-card blue">
              <div class="sum-card-num">${items.length}</div>
              <div class="sum-card-label">Total Items</div>
            </div>
            <div class="sum-card green">
              <div class="sum-card-num">${matchedCount}</div>
              <div class="sum-card-label">Accurate Matches</div>
            </div>
            <div class="sum-card ${totalDiffQty === 0 ? 'green' : (totalDiffQty > 0 ? 'blue' : 'red')}">
              <div class="sum-card-num">${totalDiffQty > 0 ? ('+' + fmt(totalDiffQty)) : fmt(totalDiffQty)}</div>
              <div class="sum-card-label">Net Qty Discrepancy</div>
            </div>
            <div class="sum-card ${totalDiffVal === 0 ? 'green' : (totalDiffVal > 0 ? 'blue' : 'red')}">
              <div class="sum-card-num">${fmtDec(totalDiffVal)}</div>
              <div class="sum-card-label">Discrepancy Value (Rs.)</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 5%; text-align: center;">Sr#</th>
                <th style="width: 15%;">Barcode</th>
                <th style="width: 32%;">Item Description</th>
                <th style="width: 10%; text-align: right;">System</th>
                <th style="width: 10%; text-align: right;">Physical</th>
                <th style="width: 10%; text-align: right;">Diff Qty</th>
                <th style="width: 8%; text-align: right;">Unit Cost</th>
                <th style="width: 10%; text-align: right;">Diff Value</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="8" class="text-center">No audited items found in this record</td></tr>'}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #333;">
                <td colspan="3" style="text-align: right;">AUDIT DISCREPANCY TOTALS:</td>
                <td style="text-align: right;">${fmt(totalSysStock)}</td>
                <td style="text-align: right;">${fmt(totalPhysicalStock)}</td>
                <td style="text-align: right; color: ${totalDiffQty > 0 ? '#15803d' : (totalDiffQty < 0 ? '#b91c1c' : '#64748b')};">${fmt(totalDiffQty)}</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right; color: ${totalDiffVal > 0 ? '#15803d' : (totalDiffVal < 0 ? '#b91c1c' : '#64748b')};">${fmtDec(totalDiffVal)}</td>
              </tr>
            </tfoot>
          </table>

          <div class="footer-signatures">
            <div class="sig-box">Physical Auditor Signature</div>
            <div class="sig-box">Warehouse Head Approval</div>
          </div>

          <div class="print-date">Generated via BAS Mobile App on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error printing WH Stock Audit:', error);
    Alert.alert('Print Error', 'Could not process WH Stock Audit: ' + error.message);
  }
}

// =========================================================================
// EMPLOYEE & SALARY REPORTS PRINTING ENGINE
// =========================================================================

/**
 * Universal print handler for all Employee, Salary, Payroll, and HR reports
 */
export async function printGenericSalaryReport(reportConfig, isPreview = false) {
  try {
    const {
      title = 'Employee Salary Report',
      subtitle = 'Official HR & Payroll Document',
      meta = {},
      summaryCards = [],
      columns = [],
      rows = [],
      footerTotals = null,
      signatures = ['Prepared By', 'Checked By (HR)', 'Approved By (Management)']
    } = reportConfig;

    const baseStyles = getBaseStyles();

    // Summary Cards HTML
    const summaryCardsHtml = summaryCards.length > 0 ? `
      <div class="summary-cards">
        ${summaryCards.map(c => `
          <div class="sum-card ${c.type || ''}">
            <div class="sum-card-num">${c.value}</div>
            <div class="sum-card-label">${c.label}</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    // Meta Grid HTML
    const metaKeys = Object.keys(meta);
    const metaHtml = metaKeys.length > 0 ? `
      <div class="meta-grid">
        <div class="meta-col">
          ${metaKeys.slice(0, Math.ceil(metaKeys.length / 2)).map(k => `
            <div class="meta-row">
              <span class="meta-label">${k}:</span>
              <span class="meta-val">${meta[k]}</span>
            </div>
          `).join('')}
        </div>
        <div class="meta-col" style="text-align: right;">
          ${metaKeys.slice(Math.ceil(metaKeys.length / 2)).map(k => `
            <div class="meta-row">
              <span class="meta-label">${k}:</span>
              <span class="meta-val">${meta[k]}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    // Table Header
    const tableHeaderHtml = `
      <tr>
        ${columns.map(col => `
          <th style="${col.style || ''} text-align: ${col.align || 'left'};">${col.header}</th>
        `).join('')}
      </tr>
    `;

    // Table Rows
    const tableRowsHtml = rows.length > 0 ? rows.map((r, rIdx) => `
      <tr class="${rIdx % 2 === 1 ? 'even' : ''}">
        ${columns.map(col => {
          const val = typeof col.render === 'function' ? col.render(r, rIdx) : (r[col.key] ?? '-');
          return `<td style="${col.style || ''} text-align: ${col.align || 'left'};">${val}</td>`;
        }).join('')}
      </tr>
    `).join('') : `<tr><td colspan="${columns.length}" class="text-center" style="padding: 20px; color: #64748b;">No records found for the selected criteria</td></tr>`;

    // Table Footer Totals
    const tableFooterHtml = footerTotals ? `
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: bold; border-top: 2px solid #333;">
          ${footerTotals.map(f => `
            <td ${f.colspan ? `colspan="${f.colspan}"` : ''} style="${f.style || ''} text-align: ${f.align || 'left'};">
              ${f.value}
            </td>
          `).join('')}
        </tr>
      </tfoot>
    ` : '';

    // Signatures
    const signaturesHtml = signatures.length > 0 ? `
      <div class="footer-signatures" style="display: flex; justify-content: space-between; margin-top: 35px;">
        ${signatures.map(s => `
          <div class="sig-box" style="border-top: 1px solid #94a3b8; width: 28%; text-align: center; padding-top: 6px; font-size: 11px; font-weight: bold; color: #475569;">
            ${s}
          </div>
        `).join('')}
      </div>
    ` : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          ${baseStyles}
        </head>
        <body>
          <div class="header-container">
            <div class="company-title">D.WATSON GROUP OF PHARMACIES &amp; SUPERSTORES</div>
            <div class="report-subtitle">${title}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${subtitle}</div>
          </div>

          ${metaHtml}
          ${summaryCardsHtml}

          <table>
            <thead>
              ${tableHeaderHtml}
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
            ${tableFooterHtml}
          </table>

          ${signaturesHtml}

          <div class="print-date" style="margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: right;">
            Generated via BAS ERP Mobile on ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `;

    if (isPreview) {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } else {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('Error in printGenericSalaryReport:', error);
    Alert.alert('Print Error', 'Could not generate report PDF: ' + error.message);
  }
}

/**
 * Generate Employee PayRoll Summary HTML (100% Match with Web ERP employee-payroll-summary-report.html)
 */
export function generatePayrollSummaryReportHtml({ payrolls = [], monthYear = '', branch = 'All Branches' }) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const [y, m] = (monthYear || '2026-07').split('-');
  const monthName = monthNames[parseInt(m, 10) - 1] || 'July';

  const decimalToHHMM = (decimalHrs) => {
    if (!decimalHrs || isNaN(decimalHrs)) return "0";
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    if (mins === 0) return hrs.toString();
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const fmt = (v) => {
    if (v === null || v === undefined || isNaN(v)) return '0';
    return Math.round(Number(v)).toLocaleString('en-US');
  };

  const globals = {
    reqHrs: 0, wrkHrs: 0, otHrs: 0, stHrs: 0,
    basic: 0, ot: 0, rotti: 0, nashta: 0, mComm: 0, wComm: 0, allow: 0, eTotal: 0,
    st: 0, penalty: 0, food: 0, sec: 0, otherDed: 0, wht: 0, dTotal: 0,
    gross: 0, prevAdv: 0, currentAdv: 0, totalBal: 0, recov: 0, remAdv: 0, net: 0,
    bankPaid: 0, cashPaid: 0
  };

  // Group by department
  const groups = payrolls.reduce((acc, p) => {
    let dept = p.department?.name || p.department || p.employee?.department?.name || p.employee?.department || 'General';
    if (!dept || dept === 'undefined' || dept === 'null') dept = 'General';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(p);
    return acc;
  }, {});

  let rowsHtml = '';
  let rowCounter = 0;

  Object.keys(groups).forEach(dept => {
    const deptList = groups[dept];
    const deptTotals = {
      reqHrs: 0, wrkHrs: 0, otHrs: 0, stHrs: 0,
      basic: 0, ot: 0, rotti: 0, nashta: 0, mComm: 0, wComm: 0, allow: 0, eTotal: 0,
      st: 0, penalty: 0, food: 0, sec: 0, otherDed: 0, wht: 0, dTotal: 0,
      gross: 0, prevAdv: 0, currentAdv: 0, totalBal: 0, recov: 0, remAdv: 0, net: 0,
      bankPaid: 0, cashPaid: 0
    };

    rowsHtml += `
      <tr class="dept-header-row">
        <td colspan="29" style="text-align: left; font-weight: bold; background: #e2e8f0; font-size: 7.5px; padding: 3px 6px;">
          DEPARTMENT: ${dept.toUpperCase()} (${deptList.length} Staff)
        </td>
      </tr>
    `;

    deptList.forEach(p => {
      rowCounter++;
      const reqHrs = Number(p.totalHrsPerMonth || 0);
      const otHrs = Number(p.overTimeHrs || 0);
      const wrkHrs = Number(p.workedHrs || 0) + otHrs;

      const basic = Number(p.perMonth || p.basicSalary || 0);
      const ot = Number(p.overTime || 0);
      const rent = Number(p.rent || 0);
      const tea = Number(p.teaAllowance || 0);
      const mComm = Number(p.monthlyComm || 0);
      const wComm = Number(p.warehouseComm || 0);
      const allow = Number(p.natin || 0) + Number(p.stLateAllow || 0) + Number(p.otherAllow || 0);
      const eTotal = basic + ot + rent + tea + mComm + wComm + allow;

      const shortTime = Number(p.shortTimeAmount || p.shortWeek || 0);
      const stHrs = Number(p.shortTimeHrs || 0);
      const penalty = Number(p.penalty || 0);
      const food = Number(p.ebDeduction || p.food || 0);
      const sec = Number(p.securityDeposit || 0);
      const otherDed = Number(p.otherDeduction || 0) + Number(p.umrahDeduction || 0);
      const whtDed = Number(p.wht || 0);
      const dTotal = shortTime + penalty + food + sec + otherDed + Number(p.fund || 0) + Number(p.ttw || 0) + whtDed;

      const grossTotal = Math.max(0, p.grossTotal != null ? Number(p.grossTotal) : (eTotal - dTotal));

      const prevAdv = Number(p.pAAdv || 0);
      const currentAdv = Number(p.csMale || 0);
      const recov = (p.pmAdvRec !== undefined || p.cmAdvRec !== undefined)
        ? (Number(p.pmAdvRec || 0) + Number(p.cmAdvRec || 0))
        : Number(p.totalAdv ?? p.advanceDed ?? p.totalAdvRec ?? 0);
      const remBal = totalBal - recov;
      const netTotal = p.netTotal != null ? Number(p.netTotal) : Math.max(0, grossTotal - recov);
      const bankPaid = Number(p.bankPaid || 0);
      const cashPaid = Number(p.cashPaid || (p.paymentMethod === 'Cash' || (!p.bankPaid && netTotal > 0) ? netTotal : 0));

      // Dept Totals
      deptTotals.reqHrs += reqHrs;
      deptTotals.wrkHrs += wrkHrs;
      deptTotals.otHrs += otHrs;
      deptTotals.stHrs += stHrs;
      deptTotals.basic += basic;
      deptTotals.ot += ot;
      deptTotals.rotti += rent;
      deptTotals.nashta += tea;
      deptTotals.mComm += mComm;
      deptTotals.wComm += wComm;
      deptTotals.allow += allow;
      deptTotals.eTotal += eTotal;
      deptTotals.st += shortTime;
      deptTotals.penalty += penalty;
      deptTotals.food += food;
      deptTotals.sec += sec;
      deptTotals.otherDed += otherDed;
      deptTotals.wht += whtDed;
      deptTotals.dTotal += dTotal;
      deptTotals.gross += grossTotal;
      deptTotals.prevAdv += prevAdv;
      deptTotals.currentAdv += currentAdv;
      deptTotals.totalBal += totalBal;
      deptTotals.recov += recov;
      deptTotals.remAdv += remBal;
      deptTotals.net += netTotal;
      deptTotals.bankPaid += bankPaid;
      deptTotals.cashPaid += cashPaid;

      // Global Totals
      globals.reqHrs += reqHrs;
      globals.wrkHrs += wrkHrs;
      globals.otHrs += otHrs;
      globals.stHrs += stHrs;
      globals.basic += basic;
      globals.ot += ot;
      globals.rotti += rent;
      globals.nashta += tea;
      globals.mComm += mComm;
      globals.wComm += wComm;
      globals.allow += allow;
      globals.eTotal += eTotal;
      globals.st += shortTime;
      globals.penalty += penalty;
      globals.food += food;
      globals.sec += sec;
      globals.otherDed += otherDed;
      globals.wht += whtDed;
      globals.dTotal += dTotal;
      globals.gross += grossTotal;
      globals.prevAdv += prevAdv;
      globals.currentAdv += currentAdv;
      globals.totalBal += totalBal;
      globals.recov += recov;
      globals.remAdv += remBal;
      globals.net += netTotal;
      globals.bankPaid += bankPaid;
      globals.cashPaid += cashPaid;

      const empName = p.employee?.name || p.employeeName || p.name || 'Staff';
      const empCode = p.code || p.employee?.code || '-';

      rowsHtml += `
        <tr>
          <td class="text-center">${rowCounter}</td>
          <td class="text-center font-mono">${empCode}</td>
          <td class="emp-name" style="text-align: left; font-weight: 600;">${empName}</td>
          <td class="text-center">${decimalToHHMM(reqHrs)}</td>
          <td class="text-center fw-bold">${decimalToHHMM(wrkHrs)}</td>
          <td class="text-end">${fmt(basic)}</td>
          <td class="text-center bg-blue-tint">${decimalToHHMM(otHrs)}</td>
          <td class="text-end bg-blue-tint">${fmt(ot)}</td>
          <td class="text-end">${fmt(rent)}</td>
          <td class="text-end">${fmt(tea)}</td>
          <td class="text-end">${fmt(mComm)}</td>
          <td class="text-end">${fmt(wComm)}</td>
          <td class="text-end">${fmt(allow)}</td>
          <td class="text-end fw-bold">${fmt(eTotal)}</td>

          <td class="text-center bg-red-tint">${decimalToHHMM(stHrs)}</td>
          <td class="text-end bg-red-tint">${fmt(shortTime)}</td>
          <td class="text-end">${fmt(penalty)}</td>
          <td class="text-end">${fmt(food)}</td>
          <td class="text-end">${fmt(sec)}</td>
          <td class="text-end">${fmt(otherDed)}</td>
          <td class="text-end">${fmt(whtDed)}</td>
          <td class="text-end fw-bold">${fmt(dTotal)}</td>
          <td class="text-end fw-bold bg-grey-tint">${fmt(grossTotal)}</td>

          <td class="text-end">${fmt(prevAdv)}</td>
          <td class="text-end">${fmt(currentAdv)}</td>
          <td class="text-end">${fmt(totalBal)}</td>
          <td class="text-end" style="color: #b91c1c; font-weight: 600;">${fmt(recov)}</td>
          <td class="text-end">${fmt(remBal)}</td>
          <td class="text-end fw-bold highlight-net">${fmt(netTotal)}</td>
        </tr>
      `;
    });

    // Department Sub-Total Row
    rowsHtml += `
      <tr class="dept-total-row">
        <td colspan="3" style="text-align: right; font-weight: bold;">${dept} Total</td>
        <td class="text-center">${decimalToHHMM(deptTotals.reqHrs)}</td>
        <td class="text-center">${decimalToHHMM(deptTotals.wrkHrs)}</td>
        <td class="text-end">${fmt(deptTotals.basic)}</td>
        <td class="text-center">${decimalToHHMM(deptTotals.otHrs)}</td>
        <td class="text-end">${fmt(deptTotals.ot)}</td>
        <td class="text-end">${fmt(deptTotals.rotti)}</td>
        <td class="text-end">${fmt(deptTotals.nashta)}</td>
        <td class="text-end">${fmt(deptTotals.mComm)}</td>
        <td class="text-end">${fmt(deptTotals.wComm)}</td>
        <td class="text-end">${fmt(deptTotals.allow)}</td>
        <td class="text-end fw-bold">${fmt(deptTotals.eTotal)}</td>
        <td class="text-center">${decimalToHHMM(deptTotals.stHrs)}</td>
        <td class="text-end">${fmt(deptTotals.st)}</td>
        <td class="text-end">${fmt(deptTotals.penalty)}</td>
        <td class="text-end">${fmt(deptTotals.food)}</td>
        <td class="text-end">${fmt(deptTotals.sec)}</td>
        <td class="text-end">${fmt(deptTotals.otherDed)}</td>
        <td class="text-end">${fmt(deptTotals.wht)}</td>
        <td class="text-end fw-bold">${fmt(deptTotals.dTotal)}</td>
        <td class="text-end fw-bold">${fmt(deptTotals.gross)}</td>
        <td class="text-end">${fmt(deptTotals.prevAdv)}</td>
        <td class="text-end">${fmt(deptTotals.currentAdv)}</td>
        <td class="text-end">${fmt(deptTotals.totalBal)}</td>
        <td class="text-end" style="color: #b91c1c;">${fmt(deptTotals.recov)}</td>
        <td class="text-end">${fmt(deptTotals.remAdv)}</td>
        <td class="text-end fw-bold">${fmt(deptTotals.net)}</td>
      </tr>
    `;
  });

  // Grand Total Row
  const grandTotalRowHtml = `
    <tr class="grand-total-row">
      <td colspan="3" style="text-align: right; font-weight: 900; font-size: 7.5px;">GRAND TOTAL (${rowCounter} Staff)</td>
      <td class="text-center">${decimalToHHMM(globals.reqHrs)}</td>
      <td class="text-center">${decimalToHHMM(globals.wrkHrs)}</td>
      <td class="text-end">${fmt(globals.basic)}</td>
      <td class="text-center">${decimalToHHMM(globals.otHrs)}</td>
      <td class="text-end">${fmt(globals.ot)}</td>
      <td class="text-end">${fmt(globals.rotti)}</td>
      <td class="text-end">${fmt(globals.nashta)}</td>
      <td class="text-end">${fmt(globals.mComm)}</td>
      <td class="text-end">${fmt(globals.wComm)}</td>
      <td class="text-end">${fmt(globals.allow)}</td>
      <td class="text-end fw-bold">${fmt(globals.eTotal)}</td>
      <td class="text-center">${decimalToHHMM(globals.stHrs)}</td>
      <td class="text-end">${fmt(globals.st)}</td>
      <td class="text-end">${fmt(globals.penalty)}</td>
      <td class="text-end">${fmt(globals.food)}</td>
      <td class="text-end">${fmt(globals.sec)}</td>
      <td class="text-end">${fmt(globals.otherDed)}</td>
      <td class="text-end">${fmt(globals.wht)}</td>
      <td class="text-end fw-bold">${fmt(globals.dTotal)}</td>
      <td class="text-end fw-bold">${fmt(globals.gross)}</td>
      <td class="text-end">${fmt(globals.prevAdv)}</td>
      <td class="text-end">${fmt(globals.currentAdv)}</td>
      <td class="text-end">${fmt(globals.totalBal)}</td>
      <td class="text-end" style="color: #f87171;">${fmt(globals.recov)}</td>
      <td class="text-end">${fmt(globals.remAdv)}</td>
      <td class="text-end fw-bold">${fmt(globals.net)}</td>
    </tr>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @page {
            size: landscape;
            margin: 3mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            margin: 0;
            padding: 4px;
            color: #0f172a;
            background: #ffffff;
            font-size: 6.5px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-header {
            text-align: center;
            margin-bottom: 6px;
            border-bottom: 1.5px solid #1e4c8c;
            padding-bottom: 4px;
          }
          .company-title {
            font-size: 14px;
            font-weight: 800;
            color: #1e4c8c;
            letter-spacing: 0.5px;
          }
          .company-sub {
            font-size: 8px;
            color: #64748b;
            margin-bottom: 2px;
          }
          .report-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #0f172a;
            margin: 2px 0;
          }
          .report-meta {
            font-size: 8px;
            font-weight: 600;
            color: #334155;
          }
          .summary-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 6.2px;
            table-layout: auto;
          }
          .summary-table th, .summary-table td {
            border: 0.5px solid #94a3b8;
            padding: 1.5px 2px;
            box-sizing: border-box;
          }
          .summary-table thead tr th {
            background-color: #1e4c8c;
            color: #ffffff;
            font-weight: 700;
            text-align: center;
            font-size: 6px;
          }
          .text-center { text-align: center; }
          .text-end { text-align: right; }
          .font-mono { font-family: monospace; }
          .fw-bold { font-weight: 700; }
          .bg-blue-tint { background-color: #f0f9ff; }
          .bg-red-tint { background-color: #fef2f2; }
          .bg-grey-tint { background-color: #f1f5f9; }
          .highlight-net { background-color: #ecfdf5; color: #065f46; font-weight: 800; }
          .dept-total-row td {
            background-color: #cbd5e1;
            font-weight: 700;
            border-top: 1px solid #475569;
            border-bottom: 1px solid #475569;
          }
          .grand-total-row td {
            background-color: #0f172a;
            color: #ffffff;
            font-weight: 800;
            border-top: 1.5px solid #000;
            border-bottom: 1.5px solid #000;
          }
          .summary-card {
            border: 1.5px solid #1e4c8c;
            border-radius: 6px;
            overflow: hidden;
            background: white;
            max-width: 480px;
            margin: 10px auto;
            page-break-inside: avoid;
          }
          .summary-card-header {
            background: #1e4c8c;
            color: white;
            padding: 4px 8px;
            font-weight: 700;
            font-size: 8px;
            text-align: center;
            letter-spacing: 0.5px;
          }
          .summary-card-grid {
            display: flex;
            border-bottom: 1.5px solid #1e4c8c;
          }
          .summary-card-col {
            flex: 1;
          }
          .summary-card-item {
            display: flex;
            justify-content: space-between;
            padding: 2.5px 8px;
            border-bottom: 0.5px solid #f1f5f9;
            font-size: 6.5px;
          }
          .summary-card-footer {
            display: flex;
            justify-content: space-between;
            padding: 4px 8px;
            background: #2e7d32;
            color: white;
            align-items: center;
            font-weight: 800;
          }
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 14px;
            padding: 0 20px;
            page-break-inside: avoid;
          }
          .sig-box {
            text-align: center;
            width: 130px;
          }
          .sig-line {
            border-top: 1px solid #475569;
            margin-bottom: 3px;
          }
          .sig-label {
            font-size: 7px;
            font-weight: 700;
            color: #334155;
          }
        </style>
      </head>
      <body>
        <div class="print-header">
          <div class="company-title">Bilal Accounting System</div>
          <div class="company-sub">A Reliable Name of Trust</div>
          <div class="report-title">Employee PayRoll Summary</div>
          <div class="report-meta">Month: ${monthName} ${y} ${branch !== 'All Branches' ? '| Branch: ' + branch : ''}</div>
        </div>

        <table class="summary-table">
          <thead>
            <tr>
              <th rowspan="2" style="width: 2%;">#</th>
              <th rowspan="2" style="width: 3.5%;">Code</th>
              <th rowspan="2" style="width: 10%;">Employee Name</th>
              <th colspan="2" style="width: 5.5%;">Duty (Hrs)</th>
              <th colspan="8" style="width: 28%;">Earnings</th>
              <th rowspan="2" style="width: 4.5%;">Earn Total</th>
              <th colspan="7" style="width: 23%;">Deductions</th>
              <th rowspan="2" style="width: 4%;">Ded Total</th>
              <th rowspan="2" style="width: 4.5%;">Gross Total</th>
              <th colspan="5" style="width: 17%;">Advances</th>
              <th rowspan="2" style="width: 4.5%;">Net Total</th>
            </tr>
            <tr>
              <th>Req</th>
              <th>Wrk</th>
              <th>Basic</th>
              <th>OT (H)</th>
              <th>OT (Rs)</th>
              <th>Rent</th>
              <th>Tea</th>
              <th>M.Com</th>
              <th>W.Com</th>
              <th>Allow</th>
              <th>ST (H)</th>
              <th>ST (Rs)</th>
              <th>Pen</th>
              <th>Food</th>
              <th>Sec</th>
              <th>Oth</th>
              <th>WHT</th>
              <th>Pre.Bal</th>
              <th>Cur.Adv</th>
              <th>Tot.Bal</th>
              <th>Recov</th>
              <th>Rem.Bal</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            ${grandTotalRowHtml}
          </tfoot>
        </table>

        <!-- Summary Card (100% Match with Web ERP employee-payroll-summary-report.html) -->
        <div class="summary-card">
          <div class="summary-card-header">PAYROLL FINAL SUMMARY</div>
          <div class="summary-card-grid">
            <div class="summary-card-col" style="border-right: 1px solid #cbd5e1;">
              <div class="summary-card-item"><span>Pre Balance</span><b>Rs. ${fmt(globals.prevAdv)}</b></div>
              <div class="summary-card-item"><span>Current Advance</span><b>Rs. ${fmt(globals.currentAdv)}</b></div>
              <div class="summary-card-item" style="background:#f8fafc;"><span>Total Balance</span><b>Rs. ${fmt(globals.totalBal)}</b></div>
              <div class="summary-card-item" style="color:#b91c1c;"><span>Advance Deduction</span><b style="color:#b91c1c;">Rs. ${fmt(globals.recov)}</b></div>
              <div class="summary-card-item" style="color:#15803d;"><span>Rem. Balance</span><b style="color:#15803d;">Rs. ${fmt(globals.remAdv)}</b></div>
            </div>
            <div class="summary-card-col">
              <div class="summary-card-item"><span>Total Over Time</span><b>Rs. ${fmt(globals.ot)}</b></div>
              <div class="summary-card-item" style="color:#b91c1c;"><span>Short Time Amt</span><b style="color:#b91c1c;">Rs. ${fmt(globals.st)}</b></div>
              <div class="summary-card-item" style="color:#0284c7;"><span>Bank Paid</span><b style="color:#0284c7;">Rs. ${fmt(globals.bankPaid)}</b></div>
              <div class="summary-card-item" style="color:#d97706;"><span>Cash Paid</span><b style="color:#d97706;">Rs. ${fmt(globals.cashPaid)}</b></div>
            </div>
          </div>
          <div class="summary-card-footer">
            <span style="font-size: 7.5px; text-transform: uppercase;">Net Salary (Bank & Cash)</span>
            <span style="font-size: 8.5px;">Rs. ${fmt(globals.net)}</span>
          </div>
        </div>

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Prepared By</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Checked By (HR)</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Approved By (Management)</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Print & Share Employee Payroll Summary Report (Landscape PDF matching Web ERP)
 */
export async function printEmployeePayrollSummaryReport({ payrolls = [], monthYear = '', branch = 'All Branches' }) {
  try {
    const html = generatePayrollSummaryReportHtml({ payrolls, monthYear, branch });
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (err) {
    console.error('Error generating Payroll Summary PDF:', err);
    Alert.alert('Print Error', 'Could not generate Payroll Summary PDF: ' + err.message);
  }
}

/**
 * Preview Employee Payroll Summary In-App (Native Visual Landscape Screen Preview with Zoom & Print)
 */
export async function previewEmployeePayrollSummaryReport({ payrolls = [], monthYear = '', branch = 'All Branches' }) {
  try {
    const html = generatePayrollSummaryReportHtml({ payrolls, monthYear, branch });
    await Print.printAsync({ html });
  } catch (err) {
    console.error('Error previewing Payroll Summary:', err);
    Alert.alert('Preview Error', 'Could not preview Payroll Summary: ' + err.message);
  }
}

/**
 * Prompt User with Options for Employee Payroll Summary Report
 */
export function promptPayrollSummaryActions({ payrolls = [], monthYear = '', branch = 'All Branches' }) {
  Alert.alert(
    'Employee PayRoll Summary',
    `Official Web ERP Summary Report (${payrolls.length} Staff)\nMonth: ${monthYear} • Branch: ${branch}`,
    [
      {
        text: '👁️ In-App Preview (Landscape)',
        onPress: () => previewEmployeePayrollSummaryReport({ payrolls, monthYear, branch })
      },
      {
        text: '📥 Download / Share Official PDF',
        onPress: () => printEmployeePayrollSummaryReport({ payrolls, monthYear, branch })
      },
      { text: 'Cancel', style: 'cancel' }
    ]
  );
}

/**
 * Share Report or Salary Slip directly via WhatsApp / System Share Sheet
 */
export async function shareReportToWhatsApp({ html, fileName = 'BAS_Report', dialogTitle = 'Share via WhatsApp' }) {
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: dialogTitle || 'Share PDF via WhatsApp',
      });
    } else {
      Alert.alert('Sharing Error', 'System sharing is not available on this device.');
    }
  } catch (err) {
    console.error('Error sharing to WhatsApp:', err);
    Alert.alert('Share Error', err.message);
  }
}

/**
 * Generate Warehouse Sale Invoice HTML
 */
export function generateWHSaleInvoiceHTML(sale) {
  const fmt = (n) => (n === null || n === undefined || isNaN(n)) ? '0' : Number(Math.round(n)).toLocaleString('en-US');
  const items = sale.items || [];
  const party = sale.customer || {};
  const custName = party.customerName || party.name || sale.customerName || 'Walk-in Customer';
  const custPhone = party.phone || party.mobile || sale.customerPhone || '-';
  const custAddress = party.address || 'Rawalpindi / Islamabad';
  const custNTN = party.customerNTN || party.ntn || party.NTN || '-';
  const custSTRN = party.strn || party.STRN || '-';
  const invDate = sale.invoiceDate ? new Date(sale.invoiceDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
  const printTime = new Date().toLocaleString('en-GB');

  // Format doc number like web (INV-01)
  let dNo = sale.invoiceNo || 'INV-001';
  if (typeof dNo === 'string' && dNo.includes('-')) {
    const parts = dNo.split('-');
    const serialPart = parts[parts.length - 1];
    if (!isNaN(serialPart)) {
      const numericPart = parseInt(serialPart, 10);
      const paddedShort = String(numericPart).padStart(2, '0');
      if (dNo.startsWith('INV-WS-')) dNo = `INV-${paddedShort}`;
    }
  }

  // Group items by Item Class (exactly like wh-print.html)
  const groups = {};
  items.forEach((line) => {
    const item = line.item || {};
    const classObj = line.itemClass || item.itemClass || {};
    const className = classObj.name || (typeof classObj === 'string' ? classObj : null) || line.className || (typeof item.itemClass === 'string' ? item.itemClass : null) || 'General Products';
    if (!groups[className]) groups[className] = [];
    groups[className].push(line);
  });

  let globalIndex = 1;
  let tableRowsHTML = '';
  let calcBase = 0;
  let calcDisc = 0;
  let calcQty = 0;

  for (const className in groups) {
    // Class Group Header Row
    tableRowsHTML += `
      <tr class="class-group-header">
        <td colspan="10" style="padding: 4px 6px; font-weight: 700; color: #1a237e; border: 1px solid #000; background-color: #fff; text-align: left;">
          Class: ${className}
        </td>
      </tr>
    `;

    let classTotal = 0;
    groups[className].forEach((line) => {
      const item = line.item || {};
      const name = line.name || line.itemName || item.name || item.itemName || 'Product';
      const pack = line.pack || item.pack || '';
      const barcode = line.barcode || item.barcode || item.itemsCode || '-';
      const qty = parseFloat(line.quantity || 0);
      const cost = parseFloat(line.pcsPrice || line.rate || 0);
      const retail = parseFloat(line.retailPrice || item.retailPrice || 0);
      const incentive = parseFloat(line.incentive || item.incentive || 0);
      const discRs = parseFloat(line.discountAmount || line.disRs || (incentive * qty) || 0);
      let discPercent = parseFloat(line.discountPercent || line.disP || 0);
      if (!discPercent && discRs > 0 && (cost * qty) > 0) {
        discPercent = (discRs / (cost * qty)) * 100;
      }
      const lineNet = parseFloat(line.netTotal || line.total || (qty * cost - discRs) || 0);

      calcBase += (cost * qty);
      calcDisc += discRs;
      calcQty += qty;
      classTotal += lineNet;

      tableRowsHTML += `
        <tr>
          <td style="text-align: center; border: 1px solid #000; padding: 2px 4px;">${globalIndex++}</td>
          <td style="text-align: center; border: 1px solid #000; padding: 2px 4px;">${barcode}</td>
          <td style="border: 1px solid #000; padding: 2px 4px; text-align: left;">
            <div style="font-weight: 600; font-size: 10.5px;">${name}</div>
            ${pack ? `<div style="font-size: 9px; color: #555;">${pack}</div>` : ''}
          </td>
          <td style="text-align: center; font-weight: 700; border: 1px solid #000; padding: 2px 4px;">${fmt(qty)}</td>
          <td style="text-align: right; border: 1px solid #000; padding: 2px 4px;">${fmt(cost)}</td>
          <td style="text-align: right; border: 1px solid #000; padding: 2px 4px;">${fmt(retail)}</td>
          <td style="text-align: center; border: 1px solid #000; padding: 2px 4px;">${fmt(incentive)}</td>
          <td style="text-align: center; border: 1px solid #000; padding: 2px 4px;">${discPercent > 0 ? `${parseFloat(discPercent.toFixed(2))}%` : '0%'}</td>
          <td style="text-align: right; border: 1px solid #000; padding: 2px 4px;">${fmt(discRs)}</td>
          <td style="text-align: right; font-weight: 700; border: 1px solid #000; padding: 2px 4px;">${fmt(lineNet)}</td>
        </tr>
      `;
    });

    // Sub Total Row for this Class (Silver background #C0C0C0 matching web ERP print)
    tableRowsHTML += `
      <tr class="subtotal-row">
        <td colspan="9" style="text-align: right; font-weight: bold; background-color: #C0C0C0; color: #000; padding: 4px 6px; border: 1px solid #000;">
          Sub Total (${className}):
        </td>
        <td style="text-align: right; font-weight: bold; background-color: #C0C0C0; color: #000; padding: 4px 6px; border: 1px solid #000;">
          ${fmt(classTotal)}
        </td>
      </tr>
    `;
  }

  const globalDisc = parseFloat(sale.globalDiscountAmount || 0);
  const finalGross = calcBase;
  const finalDisc = calcDisc + globalDisc;
  const finalNet = parseFloat(sale.netTotal || (finalGross - finalDisc));
  const paidVal = parseFloat(sale.paidAmount || 0);
  const balanceDue = Math.max(0, finalNet - paidVal);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>WH Sale Invoice - ${dNo}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: "Times New Roman", Times, serif;
          color: #111;
          background: #fff;
          margin: 0;
          padding: 10mm 12mm;
          font-size: 11px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 4px;
          margin-bottom: 8px;
        }
        .company-logo {
          max-height: 80px;
          max-width: 170px;
          object-fit: contain;
        }
        .doc-title {
          text-align: right;
        }
        .doc-title h1 {
          font-size: 24px;
          color: #1a237e;
          margin: 0;
          font-weight: 900;
          letter-spacing: -0.5px;
          line-height: 1.1;
        }
        .doc-title p {
          margin: 4px 0 0;
          color: #000;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
        }
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }
        .info-card {
          border: 1px solid #000;
          border-radius: 6px;
          padding: 6px 10px;
          background: #fff;
        }
        .main-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 10px;
          font-size: 10.5px;
        }
        .main-table th {
          background-color: #2c2c2c;
          color: #fff;
          padding: 4px 4px;
          text-align: center;
          font-weight: 700;
          border: 1px solid #000;
          font-size: 10px;
        }
        .main-table td {
          border: 1px solid #000;
          padding: 2px 4px;
        }
        .class-group-header td {
          font-weight: 700;
          color: #1a237e;
          background-color: #fff;
        }
        .subtotal-row td {
          background-color: #C0C0C0 !important;
          color: #000 !important;
          font-weight: bold;
        }
        .totals-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-top: 10px;
        }
        .totals-table {
          width: 100%;
          border-collapse: collapse;
        }
        .totals-table td {
          padding: 3px 8px;
          border-bottom: 1px solid #000;
        }
        .grand-total-box {
          background-color: #000 !important;
          color: #fff !important;
        }
        .grand-total-box td {
          color: #fff !important;
          font-weight: 900;
          font-size: 13px;
        }
        .footer-signatures {
          margin-top: 40px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 40px;
          text-align: center;
        }
        .sig-box {
          border-top: 2px solid #000;
          padding-top: 8px;
          font-weight: 700;
          font-size: 11px;
          color: #000;
        }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <!-- HEADER -->
      <div class="header-section">
        <div style="width: 32%;">
          <img src="${DWATSON_LOGO_BASE64}" class="company-logo" alt="D.Watson Logo" />
        </div>

        <div style="flex: 1; text-align: center; align-self: center;">
          <div style="display: inline-block; border-bottom: 2px solid #000; min-width: 150px; padding: 4px 12px;">
            <span style="font-size: 26px; font-weight: 900; color: #000; letter-spacing: 0.5px;">${dNo}</span>
          </div>
        </div>

        <div class="doc-title" style="width: 32%;">
          <h1>SALE<br>INVOICE</h1>
          <p>DATE: ${invDate}</p>
        </div>
      </div>

      <!-- DETAILS GRID -->
      <div class="details-grid">
        <div class="info-card">
          <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #000; margin-bottom: 3px;">FROM: COMPANY DETAILS</div>
          <div style="font-size: 13px; font-weight: 800; color: #000; margin-bottom: 2px;">D.Watson</div>
          <div style="font-size: 10px; line-height: 1.35; color: #000;">
            -<br>
            Phone: 051-8438111 | Email:<br>
            dwatsongroupofit@gmail.com<br>
            STRN: - | NTN: -
          </div>
        </div>

        <div class="info-card">
          <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #000; margin-bottom: 3px;">TO: CUSTOMER</div>
          <div style="font-size: 13px; font-weight: 800; color: #000; margin-bottom: 2px;">${custName}</div>
          <div style="font-size: 10px; line-height: 1.35; color: #000;">
            ${custAddress}<br>
            Phone: ${custPhone}<br>
            STRN: ${custSTRN} | NTN: ${custNTN}
          </div>
        </div>
      </div>

      <!-- MAIN TABLE -->
      <table class="main-table">
        <thead>
          <tr>
            <th style="width: 28px;">#</th>
            <th style="width: 85px;">Code</th>
            <th>Item Description</th>
            <th style="width: 40px;">Qty</th>
            <th style="width: 55px;">Cost</th>
            <th style="width: 55px;">Retail</th>
            <th style="width: 55px;">Incentive</th>
            <th style="width: 45px;">Disc %</th>
            <th style="width: 55px;">Disc Rs</th>
            <th style="width: 75px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHTML || '<tr><td colspan="10" style="text-align: center; padding: 10px;">No items added</td></tr>'}
        </tbody>
      </table>

      <!-- TOTALS & REMARKS -->
      <div class="totals-section">
        <div style="flex: 1;">
          <div style="display: inline-block; border: 1.5px solid #000; border-radius: 6px; padding: 4px 14px; margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 800; color: #000; letter-spacing: 0.5px;">TOTAL QTY: </span>
            <span style="font-size: 14px; font-weight: 900; color: #000;">${fmt(calcQty)}</span>
          </div>

          <div class="info-card" style="min-height: 75px;">
            <div style="font-size: 10px; font-weight: 800; color: #000; text-transform: uppercase; margin-bottom: 3px;">REMARKS / TERMS</div>
            <div style="font-size: 10px; line-height: 1.4; color: #111;">
              ${sale.remarks ? sale.remarks : 'No remarks provided.'}
            </div>
          </div>
        </div>

        <div style="width: 320px;">
          <table class="totals-table">
            <tr>
              <td>Gross Amount</td>
              <td style="text-align: right; font-weight: bold;">${fmt(finalGross)}</td>
            </tr>
            <tr>
              <td>Discount (-)</td>
              <td style="text-align: right; font-weight: bold;">${fmt(finalDisc)}</td>
            </tr>
            <tr>
              <td>Net Amount</td>
              <td style="text-align: right; font-weight: bold;">${fmt(finalNet)}</td>
            </tr>
            <tr>
              <td>Tax Total</td>
              <td style="text-align: right; font-weight: bold;">0</td>
            </tr>
            <tr>
              <td>Misc Charges</td>
              <td style="text-align: right; font-weight: bold;">0</td>
            </tr>
            <tr class="grand-total-box">
              <td style="font-weight: 900; padding: 6px 8px;">Grand Total</td>
              <td style="text-align: right; font-weight: 900; padding: 6px 8px;">${fmt(finalNet)}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- FOOTER SIGNATURES -->
      <div class="footer-signatures">
        <div class="sig-box">Receiver Signature</div>
        <div class="sig-box">Verified By</div>
        <div class="sig-box">Authorized Signature</div>
      </div>

      <div style="margin-top: 25px; text-align: center; font-size: 9.5px; color: #000;">
        Printed on: ${printTime} | System Generated Document
      </div>
    </body>
    </html>
  `;
}

/**
 * Print or Share WH Sale Invoice
 */
export async function printWHSaleInvoice(sale, isShare = false) {
  try {
    const html = generateWHSaleInvoiceHTML(sale);
    if (isShare) {
      await shareReportToWhatsApp({
        html,
        fileName: `WHSale_${sale.invoiceNo || 'INV'}`,
        dialogTitle: `Share Invoice #${sale.invoiceNo || ''}`
      });
    } else {
      await Print.printAsync({ html });
    }
  } catch (err) {
    console.error('Error printing WH sale invoice:', err);
    Alert.alert('Print Error', err.message);
  }
}

/**
 * Generate Warehouse Purchase Invoice HTML
 */
export function generateWHPurchaseInvoiceHTML(purchase) {
  const fmt = (n) => (n === null || n === undefined || isNaN(n)) ? '0' : Number(n).toLocaleString('en-US');
  const items = purchase.items || [];
  const suppName = purchase.supplier?.supplierName || purchase.supplier?.name || purchase.supplierName || 'Unknown Supplier';
  const suppPhone = purchase.supplier?.phone || purchase.supplier?.mobile || purchase.supplierPhone || '-';
  const invDate = purchase.invoiceDate ? new Date(purchase.invoiceDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

  const rows = items.map((it, idx) => {
    const name = it.name || it.itemName || it.item?.name || it.item?.itemName || it.productName || (it.barcode ? `Product (${it.barcode})` : `Item #${idx + 1}`);
    const barcode = it.barcode || it.item?.barcode || '-';
    const qty = it.quantity || 0;
    const cost = it.costPrice || it.rate || 0;
    const total = it.totalAmount || (qty * cost);
    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${barcode}</td>
        <td><strong>${name}</strong></td>
        <td style="text-align: right;">${fmt(qty)}</td>
        <td style="text-align: right;">Rs. ${fmt(cost)}</td>
        <td style="text-align: right; font-weight: bold;">Rs. ${fmt(total)}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>WH Purchase Bill #${purchase.invoiceNo || 'BILL'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; font-size: 13px; }
          .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 16px; }
          .brand { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
          .subtitle { font-size: 13px; color: #10b981; font-weight: 700; text-transform: uppercase; margin-top: 4px; }
          .meta-box { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
          .meta-col { flex: 1; }
          .label { font-size: 10.5px; color: #64748b; font-weight: 700; text-transform: uppercase; }
          .value { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background: #0f172a; color: #ffffff; padding: 8px 10px; font-size: 11px; text-transform: uppercase; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
          .totals-table { width: 45%; margin-left: auto; border-collapse: collapse; margin-bottom: 24px; }
          .totals-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
          .grand-total { font-size: 15px; font-weight: 800; color: #10b981; background: #f0fdf4; }
          .signatures { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 20px; }
          .sig-line { width: 28%; border-top: 1px dashed #64748b; text-align: center; font-size: 11px; color: #64748b; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="brand">D.WATSON GROUP • BAS WAREHOUSE</h1>
          <div class="subtitle">Purchase Receiving / Inward Voucher</div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="label">Bill / Inward No</div>
            <div class="value">#${purchase.invoiceNo || 'PUR-DRAFT'}</div>
            <div class="label" style="margin-top: 8px;">Date</div>
            <div class="value">${invDate}</div>
          </div>
          <div class="meta-col">
            <div class="label">Supplier / Vendor</div>
            <div class="value">${suppName}</div>
            <div class="label" style="margin-top: 8px;">Contact</div>
            <div class="value">${suppPhone}</div>
          </div>
          <div class="meta-col" style="text-align: right;">
            <div class="label">Status</div>
            <div class="value"><span style="color: #10b981; font-weight: 800;">${purchase.status || 'Posted'}</span></div>
            <div class="label" style="margin-top: 8px;">Remarks</div>
            <div class="value">${purchase.remarks || '-'}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 6%; text-align: center;">Sr</th>
              <th style="width: 18%;">Barcode</th>
              <th style="width: 42%;">Description</th>
              <th style="width: 10%; text-align: right;">Qty</th>
              <th style="width: 12%; text-align: right;">Cost Rate</th>
              <th style="width: 18%; text-align: right;">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align: center;">No items added</td></tr>'}
          </tbody>
        </table>

        <table class="totals-table">
          <tr>
            <td>Total Items:</td>
            <td style="text-align: right; font-weight: 700;">${items.length} (Total Qty: ${fmt(purchase.totalQuantity || items.reduce((s, i) => s + (i.quantity || 0), 0))})</td>
          </tr>
          <tr>
            <td>Subtotal:</td>
            <td style="text-align: right; font-weight: 700;">Rs. ${fmt(purchase.subTotal || purchase.grandTotal || 0)}</td>
          </tr>
          ${purchase.totalDiscount ? `
            <tr>
              <td>Total Discount:</td>
              <td style="text-align: right; color: #dc2626;">- Rs. ${fmt(purchase.totalDiscount)}</td>
            </tr>
          ` : ''}
          <tr class="grand-total">
            <td><strong>Grand Total:</strong></td>
            <td style="text-align: right;"><strong>Rs. ${fmt(purchase.grandTotal || 0)}</strong></td>
          </tr>
        </table>

        <div class="signatures">
          <div class="sig-line">Receiving Officer</div>
          <div class="sig-line">Quality / Stock Auditor</div>
          <div class="sig-line">Supplier Representative</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Print or Share WH Purchase Invoice
 */
export async function printWHPurchaseInvoice(purchase, isShare = false) {
  try {
    const html = generateWHPurchaseInvoiceHTML(purchase);
    if (isShare) {
      await shareReportToWhatsApp({
        html,
        fileName: `WHPurchase_${purchase.invoiceNo || 'BILL'}`,
        dialogTitle: `Share Purchase Bill #${purchase.invoiceNo || ''}`
      });
    } else {
      await Print.printAsync({ html });
    }
  } catch (err) {
    console.error('Error printing WH purchase invoice:', err);
    Alert.alert('Print Error', err.message);
  }
}

/**
 * Generate 58mm or 80mm High-Contrast Bluetooth POS Thermal Receipt for Salary Slip
 */
export function generateSalarySlipThermalHTML(employee, slip, paperWidth = '58mm') {
  const fmt = (n) => (n === null || n === undefined || isNaN(n)) ? '0' : Number(n).toLocaleString('en-US');
  const is80mm = paperWidth === '80mm';
  const widthMm = is80mm ? '72mm' : '48mm';
  const fontSize = is80mm ? '12px' : '10.5px';

  const empName = slip.employeeName || employee?.name || 'Staff Member';
  const empCode = slip.employeeCode || employee?.code || '-';
  const branch = slip.branch || employee?.branch || 'Head Office';
  const designation = slip.designation || employee?.designation || 'Staff';
  const monthYear = slip.monthYear || 'Current Month';

  const basicSalary = slip.earnings?.basicSalary ?? slip.basicSalary ?? 0;
  const fixAllowance = slip.earnings?.fixAllowance ?? slip.fixAllowance ?? 0;
  const otherAllowance = slip.earnings?.otherAllowance ?? slip.otherAllowance ?? 0;
  const overtimePay = slip.earnings?.overtimePay ?? slip.overtimePay ?? 0;
  const overtimeHours = slip.earnings?.overtimeHours ?? 0;
  const commission = (slip.earnings?.monthlyCommission || 0) + (slip.earnings?.whCommission || 0) + (slip.commission || 0);
  const rottiAllowance = (slip.earnings?.rottiAllowance || 0) + (slip.earnings?.nashtaAllowance || 0);
  const grossSalary = slip.earnings?.grossSalary ?? slip.grossSalary ?? (basicSalary + fixAllowance + otherAllowance + overtimePay + commission + rottiAllowance);

  const shortTimeDeduction = slip.deductions?.shortTimeDeduction ?? slip.shortTimeDeduction ?? 0;
  const advRecovery = (slip.advances?.cmAdvanceRecovery || 0) + (slip.advances?.pmAdvanceRecovery || 0) + (slip.advanceDeduction || 0);
  const securityDeposit = slip.deductions?.securityDeposit ?? slip.securityDeposit ?? 0;
  const incomeTax = slip.taxation?.taxDeduction ?? slip.incomeTax ?? 0;
  const penalty = slip.deductions?.penalty ?? slip.penalty ?? 0;
  const totalDeductions = slip.deductions?.totalDeductions ?? slip.totalDeductions ?? (shortTimeDeduction + advRecovery + securityDeposit + incomeTax + penalty);

  const netPayable = slip.disbursement?.netPayable ?? slip.netSalary ?? (grossSalary - totalDeductions);
  const bankPaid = slip.disbursement?.bankPaid ?? (slip.salThrBank ? netPayable : 0);
  const cashPaid = slip.disbursement?.cashPaid ?? (slip.salThrBank ? 0 : netPayable);

  const printTime = new Date().toLocaleString('en-GB');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Thermal Salary Slip - ${empCode}</title>
        <style>
          @page { margin: 0; size: auto; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: ${widthMm};
            margin: 0 auto;
            padding: 4px 2px;
            font-size: ${fontSize};
            line-height: 1.25;
            color: #000000;
            background: #ffffff;
            font-weight: 600;
          }
          .c { text-align: center; }
          .r { text-align: right; }
          .b { font-weight: 900; }
          .title { font-size: ${is80mm ? '15px' : '13px'}; font-weight: 900; text-transform: uppercase; margin: 0; }
          .sub { font-size: ${is80mm ? '11px' : '9.5px'}; margin-top: 1px; }
          .dash { border-top: 1px dashed #000; margin: 4px 0; }
          .solid { border-top: 1px solid #000; margin: 4px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          .total-box { border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 4px 0; margin: 4px 0; font-size: ${is80mm ? '13px' : '11.5px'}; font-weight: 900; }
          .foot { text-align: center; font-size: 9px; margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="c">
          <div class="title">BAS ERP SYSTEM</div>
          <div class="sub">${branch.toUpperCase()}</div>
          <div class="sub b">OFFICIAL SALARY SLIP • ${monthYear}</div>
        </div>
        <div class="dash"></div>
        <div class="row"><span>EMP:</span><span class="b">${empName}</span></div>
        <div class="row"><span>CODE:</span><span>${empCode}</span></div>
        <div class="row"><span>DESIG:</span><span>${designation}</span></div>
        <div class="dash"></div>
        <div class="c b">-- EARNINGS --</div>
        <div class="row"><span>Basic Salary:</span><span>${fmt(basicSalary)}</span></div>
        ${fixAllowance > 0 ? `<div class="row"><span>Fix Allow:</span><span>+${fmt(fixAllowance)}</span></div>` : ''}
        ${otherAllowance > 0 ? `<div class="row"><span>Other Allow:</span><span>+${fmt(otherAllowance)}</span></div>` : ''}
        ${overtimePay > 0 ? `<div class="row"><span>OverTime (${overtimeHours}h):</span><span>+${fmt(overtimePay)}</span></div>` : ''}
        ${commission > 0 ? `<div class="row"><span>Commission:</span><span>+${fmt(commission)}</span></div>` : ''}
        ${rottiAllowance > 0 ? `<div class="row"><span>Meal / Food:</span><span>+${fmt(rottiAllowance)}</span></div>` : ''}
        <div class="row b"><span>GROSS EARN:</span><span>Rs. ${fmt(grossSalary)}</span></div>
        <div class="dash"></div>
        <div class="c b">-- DEDUCTIONS --</div>
        ${shortTimeDeduction > 0 ? `<div class="row"><span>Short Time:</span><span>-${fmt(shortTimeDeduction)}</span></div>` : ''}
        ${advRecovery > 0 ? `<div class="row"><span>Adv Recovery:</span><span>-${fmt(advRecovery)}</span></div>` : ''}
        ${securityDeposit > 0 ? `<div class="row"><span>Security Dep:</span><span>-${fmt(securityDeposit)}</span></div>` : ''}
        ${incomeTax > 0 ? `<div class="row"><span>WHT Tax:</span><span>-${fmt(incomeTax)}</span></div>` : ''}
        ${penalty > 0 ? `<div class="row"><span>Penalty/Fine:</span><span>-${fmt(penalty)}</span></div>` : ''}
        <div class="row b"><span>TOTAL DEDUCT:</span><span>-Rs. ${fmt(totalDeductions)}</span></div>
        <div class="total-box">
          <div class="row"><span>NET PAYABLE:</span><span>Rs. ${fmt(netPayable)}</span></div>
        </div>
        ${bankPaid > 0 ? `<div class="row"><span>Paid via Bank:</span><span>Rs. ${fmt(bankPaid)}</span></div>` : ''}
        ${cashPaid > 0 ? `<div class="row"><span>Paid in Cash:</span><span>Rs. ${fmt(cashPaid)}</span></div>` : ''}
        <div class="dash"></div>
        <div class="foot">
          *** COMPUTER GENERATED SLIP ***<br>
          Printed: ${printTime}<br>
          Thank You!
        </div>
      </body>
    </html>
  `;
}

/**
 * Print 58mm/80mm Bluetooth Thermal Salary Slip
 */
export async function printThermalSalarySlip(employee, slip, paperWidth = '58mm') {
  try {
    const html = generateSalarySlipThermalHTML(employee, slip, paperWidth);
    await Print.printAsync({ html });
  } catch (error) {
    console.error('Error printing thermal salary slip:', error);
    Alert.alert('Thermal Print Error', 'Could not print thermal slip: ' + error.message);
  }
}

/**
 * Prompt Choice between 58mm and 80mm Bluetooth Thermal Printers
 */
export function promptThermalSalarySlipOptions(employee, slip) {
  Alert.alert(
    'Select Bluetooth Thermal Printer',
    'Choose your printer roll paper width:',
    [
      {
        text: '⚡ 58mm Thermal Roll (Mini POS)',
        onPress: () => printThermalSalarySlip(employee, slip, '58mm')
      },
      {
        text: '🧾 80mm Thermal Roll (Standard POS)',
        onPress: () => printThermalSalarySlip(employee, slip, '80mm')
      },
      {
        text: 'Cancel',
        style: 'cancel'
      }
    ]
  );
}

/**
 * Generate 58mm or 80mm Bluetooth Thermal POS Receipt for WH Sale Invoice
 */
export function generateWHSaleThermalHTML(sale, paperWidth = '58mm') {
  const fmt = (n) => (n === null || n === undefined || isNaN(n)) ? '0' : Number(n).toLocaleString('en-US');
  const is80mm = paperWidth === '80mm';
  const widthMm = is80mm ? '72mm' : '48mm';
  const fontSize = is80mm ? '12px' : '10.5px';

  const custName = sale.customer?.customerName || sale.customer?.name || sale.customerName || 'Walk-in Customer';
  const invNo = sale.invoiceNo || 'INV-000';
  const invDate = sale.invoiceDate ? new Date(sale.invoiceDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
  const items = sale.items || [];

  const itemsHtml = items.map((it, idx) => {
    const name = it.name || it.itemName || it.item?.name || `Item #${idx + 1}`;
    const qty = it.quantity || 1;
    const rate = it.pcsPrice || it.rate || 0;
    const total = it.netTotal || (qty * rate);
    return `
      <div style="margin: 2px 0;">
        <div>${idx + 1}. ${name}</div>
        <div style="display: flex; justify-content: space-between; font-size: ${is80mm ? '11px' : '9.5px'};">
          <span>&nbsp;&nbsp;${qty} x Rs.${fmt(rate)}</span>
          <span style="font-weight: bold;">Rs.${fmt(total)}</span>
        </div>
      </div>
    `;
  }).join('');

  const subTotal = fmt(sale.totalAmount || sale.subTotal || 0);
  const discount = fmt(sale.discountAmount || 0);
  const netTotal = fmt(sale.netTotal || sale.totalAmount || 0);
  const paid = fmt(sale.receivedAmount || sale.paidAmount || 0);
  const balance = fmt(sale.balanceAmount || 0);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>WH Sale Thermal - ${invNo}</title>
        <style>
          @page { margin: 0; size: auto; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: ${widthMm};
            margin: 0 auto;
            padding: 4px 2px;
            font-size: ${fontSize};
            line-height: 1.25;
            color: #000000;
            background: #ffffff;
            font-weight: 600;
          }
          .c { text-align: center; }
          .r { text-align: right; }
          .b { font-weight: 900; }
          .title { font-size: ${is80mm ? '15px' : '13px'}; font-weight: 900; text-transform: uppercase; margin: 0; }
          .sub { font-size: ${is80mm ? '11px' : '9.5px'}; margin-top: 1px; }
          .dash { border-top: 1px dashed #000; margin: 4px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          .total-box { border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 4px 0; margin: 4px 0; font-size: ${is80mm ? '13px' : '11.5px'}; font-weight: 900; }
          .foot { text-align: center; font-size: 9px; margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="c">
          <div class="title">BAS WAREHOUSE</div>
          <div class="sub">SALE INVOICE #${invNo}</div>
          <div class="sub">Date: ${invDate}</div>
        </div>
        <div class="dash"></div>
        <div class="row"><span>Customer:</span><span class="b">${custName}</span></div>
        <div class="dash"></div>
        <div class="c b">-- ITEMS --</div>
        ${itemsHtml}
        <div class="dash"></div>
        <div class="row"><span>SubTotal:</span><span>Rs. ${subTotal}</span></div>
        ${Number(discount.replace(/,/g, '')) > 0 ? `<div class="row"><span>Discount:</span><span>-Rs. ${discount}</span></div>` : ''}
        <div class="total-box">
          <div class="row"><span>NET TOTAL:</span><span>Rs. ${netTotal}</span></div>
        </div>
        <div class="row"><span>Amount Paid:</span><span>Rs. ${paid}</span></div>
        <div class="row b"><span>Remaining:</span><span>Rs. ${balance}</span></div>
        <div class="dash"></div>
        <div class="foot">
          *** THANK YOU FOR YOUR BUSINESS ***<br>
          Software by BAS ERP
        </div>
      </body>
    </html>
  `;
}

/**
 * Print 58mm/80mm Bluetooth Thermal WH Sale Invoice
 */
export async function printThermalWHSale(sale, paperWidth = '58mm') {
  try {
    const html = generateWHSaleThermalHTML(sale, paperWidth);
    await Print.printAsync({ html });
  } catch (error) {
    console.error('Error printing thermal WH sale:', error);
    Alert.alert('Print Error', 'Could not print thermal invoice: ' + error.message);
  }
}

/**
 * 1-Tap Official Salary Slip WhatsApp Share
 * Generates official PDF and launches system share sheet to send PDF directly via WhatsApp
 */
export async function shareSalarySlipViaWhatsApp(employee, slip) {
  try {
    const empName = slip.employeeName || employee?.name || 'Staff Member';

    // 1. Generate official PDF with company letterhead, verified stamp, and breakdowns
    const html = await generateSalarySlipHtml(employee, slip);
    const { uri } = await Print.printToFileAsync({ html });

    // 2. Share PDF directly so user can send the real PDF document via WhatsApp
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Share Salary Slip PDF (${empName}) to WhatsApp`
      });
    } else {
      Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.');
    }
  } catch (error) {
    console.error('Error sharing salary slip via WhatsApp:', error);
    Alert.alert('Share Error', 'Could not share Salary Slip PDF: ' + error.message);
  }
}




