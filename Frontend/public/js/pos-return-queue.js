(() => {
  'use strict';

  const queueList = document.getElementById('queueList');
  const queueStatus = document.getElementById('queueStatus');
  const money = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

  let currentTab = 'Pending Approval';

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
        ...(options.headers || {})
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.message || result.error || `Request failed (${response.status})`);
    }
    return result;
  }

  function appendText(parent, tag, text, className = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text || '—';
    parent.appendChild(element);
    return element;
  }

  function renderLines(container, lines) {
    const wrapper = document.createElement('div');
    wrapper.className = 'approval-lines-wrap';
    const table = document.createElement('table');
    table.className = 'table table-sm align-middle';
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    ['Item', 'Barcode / Code', 'Qty', 'Unit Price', 'Amount'].forEach((label) => appendText(header, 'th', label));
    thead.appendChild(header);
    const tbody = document.createElement('tbody');
    (lines || []).forEach((line) => {
      const row = document.createElement('tr');
      const itemName = line.name || line.itemName || line.item?.name || 'Item';
      appendText(row, 'td', itemName);
      appendText(row, 'td', line.barcode || line.item?.barcode || line.item?.itemsCode || '—');
      appendText(row, 'td', String(Number(line.quantity || 0)));
      appendText(row, 'td', money(line.pcsPrice || line.retailPrice));
      appendText(row, 'td', money(line.subTotal ?? line.netTotal));
      tbody.appendChild(row);
    });
    table.append(thead, tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }

  function renderQueue(returns) {
    queueList.replaceChildren();
    if (!returns.length) {
      const msg = currentTab === 'Pending Approval'
        ? 'No POS return requests are waiting for approval.'
        : (currentTab === 'Posted' ? 'No approved / posted returns found.' : 'No rejected returns found.');
      appendText(queueList, 'div', msg, 'text-center text-muted py-5');
      return;
    }

    returns.forEach((saleReturn) => {
      const card = document.createElement('article');
      card.className = 'approval-card';
      card.dataset.id = saleReturn._id;

      const heading = document.createElement('div');
      heading.className = 'approval-card-heading';
      const titleWrap = document.createElement('div');
      appendText(titleWrap, 'h3', `Return ${saleReturn.returnNo || ''}`);
      const saleInvoiceNo = saleReturn.originalSale?.invoiceNo
        ? `Sale invoice ${saleReturn.originalSale.invoiceNo}`
        : 'Warehouse sale return';
      appendText(titleWrap, 'div', saleInvoiceNo, 'approval-card-meta');
      heading.appendChild(titleWrap);
      const submittedOn = saleReturn.createdAt ? new Date(saleReturn.createdAt).toLocaleString() : '—';
      appendText(heading, 'div', `Date: ${submittedOn}`, 'approval-card-meta');
      card.appendChild(heading);

      const meta = document.createElement('div');
      meta.className = 'approval-card-meta mt-2';
      const customer = saleReturn.customer?.customerName || saleReturn.customer?.name || 'Walk-in Customer';
      const requester = saleReturn.createdBy?.name || saleReturn.createdBy?.email || 'Unknown user';
      const reviewer = saleReturn.reviewedBy?.name ? ` · Reviewed by: ${saleReturn.reviewedBy.name}` : '';
      meta.textContent = `Customer: ${customer} · Requested by: ${requester}${reviewer}`;
      card.appendChild(meta);

      const lines = document.createElement('div');
      lines.className = 'approval-lines';
      renderLines(lines, saleReturn.items);
      card.appendChild(lines);

      if (saleReturn.remarks) {
        appendText(card, 'div', `Remarks: ${saleReturn.remarks}`, 'approval-card-meta mb-2');
      }

      const footer = document.createElement('div');
      footer.className = 'approval-card-footer';
      appendText(footer, 'div', `Refund Total: ${money(saleReturn.netTotal || saleReturn.refundAmount)}`, 'approval-card-total');

      const actions = document.createElement('div');
      actions.className = 'approval-actions';

      if (saleReturn.status === 'Pending Approval') {
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'btn btn-outline-danger btn-sm';
        reject.dataset.action = 'reject';
        reject.textContent = 'Reject';

        const approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'btn btn-success btn-sm';
        approve.dataset.action = 'approve';
        approve.innerHTML = '<i class="fas fa-check me-1"></i>Approve &amp; Post';

        actions.append(reject, approve);
      } else if (saleReturn.status === 'Posted') {
        const badge = document.createElement('span');
        badge.className = 'badge bg-success py-2 px-3';
        badge.innerHTML = '<i class="fas fa-check-double me-1"></i>Approved &amp; Stock Returned';

        const printBtn = document.createElement('a');
        printBtn.href = `/print-invoice?type=wh-sale-return&id=${encodeURIComponent(saleReturn._id)}&format=thermal`;
        printBtn.target = '_blank';
        printBtn.className = 'btn btn-sm btn-outline-primary ms-2';
        printBtn.innerHTML = '<i class="fas fa-print me-1"></i>Print Credit Note';

        actions.append(badge, printBtn);
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge bg-danger py-2 px-3';
        badge.innerHTML = '<i class="fas fa-times-circle me-1"></i>Rejected / Cancelled';
        actions.appendChild(badge);
      }

      footer.appendChild(actions);
      card.appendChild(footer);
      queueList.appendChild(card);
    });
  }

  async function loadCounts() {
    try {
      const [pendingRes, postedRes, rejectedRes] = await Promise.all([
        apiRequest('/api/v1/wh-sales/pos-return-queue?status=Pending%20Approval'),
        apiRequest('/api/v1/wh-sales/pos-return-queue?status=Posted'),
        apiRequest('/api/v1/wh-sales/pos-return-queue?status=Cancelled')
      ]);
      const pendingEl = document.getElementById('pendingCount');
      const postedEl = document.getElementById('postedCount');
      const rejectedEl = document.getElementById('rejectedCount');

      if (pendingEl) pendingEl.textContent = pendingRes.count || 0;
      if (postedEl) postedEl.textContent = postedRes.count || 0;
      if (rejectedEl) rejectedEl.textContent = rejectedRes.count || 0;
    } catch (e) {
      console.error('Count load error:', e);
    }
  }

  async function loadQueue() {
    queueStatus.textContent = `Loading ${currentTab.toLowerCase()} requests…`;
    queueStatus.className = 'approval-status';
    try {
      const result = await apiRequest(`/api/v1/wh-sales/pos-return-queue?status=${encodeURIComponent(currentTab)}`);
      renderQueue(result.data || []);
      queueStatus.textContent = `${result.count || 0} ${currentTab.toLowerCase()} request${result.count === 1 ? '' : 's'}.`;
      loadCounts();
    } catch (error) {
      queueStatus.textContent = `Could not load returns: ${error.message}`;
      queueStatus.className = 'approval-status error';
      queueList.replaceChildren();
    }
  }

  async function reviewRequest(button) {
    const card = button.closest('.approval-card');
    const action = button.dataset.action;
    let remarks = '';
    if (action === 'approve') {
      if (!window.confirm('Approve this return and post it to warehouse inventory?')) return;
    } else {
      remarks = window.prompt('Enter the reason for rejecting this return:') || '';
      if (!remarks.trim()) return;
    }

    card.querySelectorAll('button').forEach((actionButton) => {
      actionButton.disabled = true;
    });
    try {
      const result = await apiRequest(`/api/v1/wh-sales/pos-return-queue/${encodeURIComponent(card.dataset.id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ remarks })
      });
      queueStatus.textContent = action === 'approve'
        ? `Return ${result.data.returnNo} approved and posted to inventory.`
        : `Return ${result.data.returnNo} rejected. Inventory was not changed.`;
      await loadQueue();
    } catch (error) {
      queueStatus.textContent = `Could not ${action} return: ${error.message}`;
      queueStatus.className = 'approval-status error';
      card.querySelectorAll('button').forEach((actionButton) => {
        actionButton.disabled = false;
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('refreshQueue')?.addEventListener('click', loadQueue);

    // Tab buttons
    document.querySelectorAll('.queue-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.queue-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.status;
        loadQueue();
      });
    });

    queueList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (button) reviewRequest(button);
    });

    loadQueue();
  });
})();
