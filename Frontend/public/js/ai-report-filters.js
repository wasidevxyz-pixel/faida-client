// Applies only assistant-provided, ISO date parameters to existing report filters.
// It never executes a report automatically; the user remains in control of loading/exporting it.
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get('startDate');
  const endDate = params.get('endDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) return;
  const from = document.querySelector('#filterFromDate, #startDate, [name="startDate"]');
  const to = document.querySelector('#filterToDate, #endDate, [name="endDate"]');
  if (from) from.value = startDate;
  if (to) to.value = endDate;
  if (from || to) {
    const notice = document.createElement('div');
    notice.className = 'alert alert-info py-2 mx-3 mt-2 mb-0';
    notice.textContent = `D.WATSON prepared the date range: ${startDate} to ${endDate}. Select Load/Generate to run the report.`;
    document.body.prepend(notice);
  }
});
