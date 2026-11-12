'use strict';

/**
 * Proactive Intelligence Engine — Level 3
 *
 * Generates daily briefings, threshold alerts, and proactive insights
 * without waiting for user to ask.
 */

const { runDetectors, getUnseenInsights, markSeen, compareSales } = require('./businessIntelligence');

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

/**
 * Get a greeting with proactive insights for when user opens the chat.
 * Shows unseen alerts, today's summary, trends.
 */
async function getProactiveGreeting(userId, userBranches) {
  try {
    // Run detectors to generate fresh insights
    await runDetectors(userBranches);

    // Get unseen insights
    const insights = await getUnseenInsights(userId, userBranches);

    if (!insights.length) return null;

    // Mark them as seen
    await markSeen(insights.map(i => i._id), userId);

    const critical = insights.filter(i => i.severity === 'critical');
    const warnings = insights.filter(i => i.severity === 'warning');
    const info     = insights.filter(i => i.severity === 'info');

    const lines = ['### 🔔 Amey ki taraf se alerts:'];

    for (const insight of [...critical, ...warnings, ...info].slice(0, 3)) {
      lines.push('', `**${insight.title}**`, insight.message);
    }

    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Generate a daily briefing message — called on first message of the day.
 * Returns a formatted string or null.
 */
async function getDailyBriefing(userId, userBranches) {
  try {
    const yesterday = daysAgo(1);
    const dayBefore = daysAgo(2);

    const comparison = await compareSales(
      yesterday, yesterday, 'Yesterday',
      dayBefore, dayBefore, 'Day Before',
      null
    );

    if (!comparison || comparison.includes('Could not')) return null;

    return [
      `### 📋 Daily Briefing — ${karachiToday()}`,
      '',
      comparison,
      '',
      '_Tip: Amey se kuch bhi poochho — sale, payment, attendance, salary_'
    ].join('\n');

  } catch {
    return null;
  }
}

/**
 * Detect if user is greeting and should receive a proactive summary.
 */
function isGreeting(message) {
  return /^(?:hi|hello|salam|assalam|hey|good morning|good evening|السلام|ہیلو|helo|hllo|helllo)\b/i.test(
    String(message || '').trim()
  );
}

module.exports = {
  getProactiveGreeting,
  getDailyBriefing,
  isGreeting
};
