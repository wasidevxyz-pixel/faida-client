(() => {
  'use strict';

  const queueList = document.getElementById('queueList');
  const queueStatus = document.getElementById('queueStatus');
  const money = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(localStorage.getItem('token') ? { Authorization: `******'token')}` } : {}),
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
      appendText(queueList, 'div', 'No POS return requests are waiting for approval.', 'text-center text-muted py-5');
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
      appendText(heading, 'div', `Submitted ${submittedOn}`, 'approval-card-meta');
      card.appendChild(heading);

      const meta = document.createElement('div');
      meta.className = 'approval-card-meta mt-2';
      const customer = saleReturn.customer?.customerName || saleReturn.customer?.name || 'Walk-in Customer';
      const requester = saleReturn.createdBy?.name || saleReturn.createdBy?.email || 'Unknown user';
      meta.textContent = `Customer: ${customer} · Requested by: ${requester}`;
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
      appendText(footer, 'div', `Refund: ${money(saleReturn.netTotal)}`, 'approval-card-total');
      const actions = document.createElement('div');
      actions.className = 'approval-actions';
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
      footer.appendChild(actions);
      card.appendChild(footer);
      queueList.appendChild(card);
    });
  }

  async function loadQueue() {
    queueStatus.textContent = 'Loading pending requests…';
    queueStatus.className = 'approval-status';
    try {
      const result = await apiRequest('/api/v1/wh-sales/pos-return-queue');
      renderQueue(result.data || []);
      queueStatus.textContent = `${result.count || 0} pending return request${result.count === 1 ? '' : 's'}.`;
    } catch (error) {
      queueStatus.textContent = `Could not load approval queue: ${error.message}`;
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
    document.getElementById('refreshQueue').addEventListener('click', loadQueue);
    queueList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (button) reviewRequest(button);
    });
    loadQueue();
  });
})();
