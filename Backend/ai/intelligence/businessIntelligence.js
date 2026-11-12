'use strict';

/**
 * Business Intelligence Engine — Level 2 Intelligence
 *
 * Detects trends, anomalies, and generates smart insights from ERP data.
 * All queries go directly to MongoDB — zero LLM calls.
 */

const ClosingSheet  = require('../../models/ClosingSheet');
const Attendance    = require('../../models/Attendance');
const Employee      = require('../../models/Employee');
const AiInsight     = require('../../models/AiInsight');

// ─── Timezone helper ──────────────────────────────────────────────────────────
function karachiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

function daysAgo(n) {
  const d = new Date(`${karachiToday()}T00:00:00+05:00`);
  d.setDate(d.getDate() - n);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function dateRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 5 * 60 * 60 * 1000);
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ─── Sale trend detection ─────────────────────────────────────────────────────
async function detectSaleTrend(userBranches) {
  try {
    const today     = karachiToday();
    const yesterday = daysAgo(1);
    const dayBefore = daysAgo(2);

    const branchFilter = userBranches && userBranches.length
      ? { branch: { $in: userBranches } }
      : {};

    async function getDaySale(dateStr) {
      const { start, end } = dateRange(dateStr);
      const sheets = await ClosingSheet.find({
        ...branchFilter,
        date: { $gte: start, $lt: end }
      }).select('closing02.data.warehouseSale branch').lean();

      let total = 0;
      for (const sheet of sheets) {
        const rows = sheet.closing02?.data?.warehouseSale || [];
        for (const row of rows) total += Number(row.saleAmount || 0);
      }
      return { total, date: dateStr };
    }

    const [yest, dayB] = await Promise.all([getDaySale(yesterday), getDaySale(dayBefore)]);

    if (!yest.total || !dayB.total) return null;

    const change = ((yest.total - dayB.total) / dayB.total) * 100;
    const absChange = Math.abs(change);

    if (absChange < 5) return null; // No significant change

    const direction = change > 0 ? 'increased' : 'decreased';
    const emoji     = change > 0 ? '📈' : '📉';
    const severity  = absChange > 30 ? 'critical' : absChange > 15 ? 'warning' : 'info';

    return {
      type: 'trend',
      severity,
      title: `${emoji} Sales ${direction} by ${absChange.toFixed(1)}%`,
      message: `Yesterday's total sale was **${yest.total.toLocaleString()} PKR** compared to **${dayB.total.toLocaleString()} PKR** the day before — a ${absChange.toFixed(1)}% ${direction}.`,
      data: { yesterday: yest.total, dayBefore: dayB.total, changePercent: change.toFixed(1) },
      date: today
    };
  } catch {
    return null;
  }
}

// ─── Absence anomaly detection ────────────────────────────────────────────────
async function detectAbsenceAnomaly(userBranches) {
  try {
    const today = karachiToday();
    const { start, end } = dateRange(today);

    const empQuery = { isActive: true };
    if (userBranches && userBranches.length) empQuery.branch = { $in: userBranches };

    const [totalEmp, todayAttendance] = await Promise.all([
      Employee.countDocuments(empQuery),
      Attendance.find({
        date: { $gte: start, $lt: end },
        isPresent: true,
        ...(userBranches && userBranches.length ? { branch: { $in: userBranches } } : {})
      }).countDocuments()
    ]);

    if (!totalEmp) return null;

    const absentCount  = totalEmp - todayAttendance;
    const absentPercent = (absentCount / totalEmp) * 100;

    if (absentPercent < 20) return null; // Normal absence rate

    const severity = absentPercent > 50 ? 'critical' : absentPercent > 30 ? 'warning' : 'info';

    return {
      type: 'alert',
      severity,
      title: `⚠️ High Absence Rate Today — ${absentPercent.toFixed(0)}%`,
      message: `**${absentCount} out of ${totalEmp}** employees are absent today (${absentPercent.toFixed(0)}%). This is above the normal threshold.`,
      data: { total: totalEmp, present: todayAttendance, absent: absentCount, absentPercent: absentPercent.toFixed(1) },
      date: today
    };
  } catch {
    return null;
  }
}

// ─── Smart sale comparison formatter ─────────────────────────────────────────
async function compareSales(startDate1, endDate1, label1, startDate2, endDate2, label2, branchFilter) {
  try {
    async function getPeriodSale(startStr, endStr) {
      const [y1, m1, d1] = startStr.split('-').map(Number);
      const [y2, m2, d2] = endStr.split('-').map(Number);
      const start = new Date(Date.UTC(y1, m1 - 1, d1, 0, 0, 0) - 5 * 60 * 60 * 1000);
      const end   = new Date(Date.UTC(y2, m2 - 1, d2 + 1, 0, 0, 0) - 5 * 60 * 60 * 1000);

      const query = { date: { $gte: start, $lt: end } };
      if (branchFilter) query.branch = new RegExp(branchFilter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');

      const sheets = await ClosingSheet.find(query).select('closing02.data.warehouseSale branch').lean();

      const byBranch = {};
      let total = 0;
      for (const sheet of sheets) {
        const rows = sheet.closing02?.data?.warehouseSale || [];
        let branchTotal = 0;
        for (const row of rows) branchTotal += Number(row.saleAmount || 0);
        byBranch[sheet.branch] = (byBranch[sheet.branch] || 0) + branchTotal;
        total += branchTotal;
      }
      return { total, byBranch };
    }

    const [p1, p2] = await Promise.all([
      getPeriodSale(startDate1, endDate1),
      getPeriodSale(startDate2, endDate2)
    ]);

    const change = p2.total > 0 ? ((p1.total - p2.total) / p2.total) * 100 : 0;
    const emoji  = change >= 0 ? '📈' : '📉';

    const lines = [
      `### ${emoji} Sale Comparison`,
      '',
      `| Period | Total Sale |`,
      `|---|---:|`,
      `| **${label1}** | **${p1.total.toLocaleString()} PKR** |`,
      `| ${label2} | ${p2.total.toLocaleString()} PKR |`,
      `| Change | ${change >= 0 ? '+' : ''}${change.toFixed(1)}% |`,
      ''
    ];

    // Branch breakdown if multiple branches
    const branches = new Set([...Object.keys(p1.byBranch), ...Object.keys(p2.byBranch)]);
    if (branches.size > 1) {
      lines.push('**Branch-wise comparison:**', '');
      lines.push('| Branch | ' + label1 + ' | ' + label2 + ' | Change |');
      lines.push('|---|---:|---:|---:|');
      for (const branch of [...branches].sort()) {
        const v1 = p1.byBranch[branch] || 0;
        const v2 = p2.byBranch[branch] || 0;
        const bc = v2 > 0 ? ((v1 - v2) / v2 * 100).toFixed(1) : '–';
        lines.push(`| ${branch} | ${v1.toLocaleString()} | ${v2.toLocaleString()} | ${bc !== '–' ? (Number(bc) >= 0 ? '+' : '') + bc + '%' : '–'} |`);
      }
    }

    return lines.join('\n');
  } catch (err) {
    return `Could not compare sales: ${err.message}`;
  }
}

// ─── Save insight to DB ───────────────────────────────────────────────────────
async function saveInsight(insight) {
  try {
    // Avoid duplicate insights for same type+date+branch
    await AiInsight.findOneAndUpdate(
      { type: insight.type, date: insight.date, branch: insight.branch || null, title: insight.title },
      { $set: insight },
      { upsert: true }
    );
  } catch { /* ignore */ }
}

// ─── Get unseen insights for a user ──────────────────────────────────────────
async function getUnseenInsights(userId, userBranches) {
  try {
    const query = { seen: false, seenBy: { $ne: userId } };
    if (userBranches && userBranches.length) {
      query.$or = [{ branch: null }, { branch: { $in: userBranches } }];
    }
    return await AiInsight.find(query)
      .sort({ severity: 1, createdAt: -1 })
      .limit(5)
      .lean();
  } catch {
    return [];
  }
}

// ─── Mark insights as seen ────────────────────────────────────────────────────
async function markSeen(insightIds, userId) {
  try {
    await AiInsight.updateMany(
      { _id: { $in: insightIds } },
      { $addToSet: { seenBy: userId } }
    );
  } catch { /* ignore */ }
}

// ─── Run all detectors and save results ──────────────────────────────────────
async function runDetectors(userBranches) {
  const results = await Promise.allSettled([
    detectSaleTrend(userBranches),
    detectAbsenceAnomaly(userBranches)
  ]);

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      await saveInsight(r.value);
    }
  }
}

module.exports = {
  detectSaleTrend,
  detectAbsenceAnomaly,
  compareSales,
  getUnseenInsights,
  markSeen,
  runDetectors,
  saveInsight
};
