(() => {
  'use strict';

  const state = {
    items: [],
    filteredItems: [],
    cart: new Map(), // key: itemId, value: { item, quantity }
    cashEdited: false,
    submitting: false,
    mode: 'sale', // 'sale' or 'return'
    returnInvoice: null,
    returnLines: [],
    returnQuantities: new Map(),
    directReturnLines: new Map(), // key: itemId, value: { item, quantity, pcsPrice, name, barcode }
    lastPrintUrl: '',
    activeItemCount: 0,
    searchTimer: null,
    salesListPage: 1,
    salesListPages: 0,
    salesListRequestId: 0,
    salesListTimer: null,
    returnsListPage: 1,
    returnsListPages: 0,
    returnsListRequestId: 0,
    returnsListTimer: null,
    activeList: null, // null, 'sales', or 'returns'
    passwordModal: null,
    passwordResolver: null,
    selectedIndex: 0,
    isLookupVisible: true
  };

  const byId = (id) => document.getElementById(id);
  const addListener = (target, evt, handler) => {
    const el = typeof target === 'string' ? byId(target) : target;
    if (el) el.addEventListener(evt, handler);
  };
  const money = (value) => Number(value || 0).toFixed(2);
  const token = () => localStorage.getItem('token');

  function normalizeItem(item) {
    const stockArr = Array.isArray(item.stock) ? item.stock : [];
    const stockQty = stockArr.length && stockArr[0] ? Number(stockArr[0].quantity || 0) : 0;
    const companyName = (item.company && item.company.name) || item.companyName || '';
    return {
      ...item,
      stockQty,
      salePrice: Number(item.retailPrice || item.salePrice || 0),
      companyName,
      unit: 'units'
    };
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {})
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw new Error(result.message || result.error || `Request failed (${response.status})`);
    }
    return result;
  }

  function showMessage(message, type = '') {
    const element = byId('posMessage');
    if (!element) return;
    element.textContent = message;
    element.style.color = type === 'error' ? '#c00' : (type === 'success' ? '#080' : '#036');
  }

  async function loadItems() {
    const badge = byId('catalogCountBadge');
    if (badge) badge.textContent = 'Loading...';
    try {
      const result = await apiRequest('/api/v1/wh-items/pos-catalog?limit=1500');
      state.items = (result.data || [])
        .filter((item) => item.isActive !== false)
        .map(normalizeItem);
      state.activeItemCount = Number(result.totalCount ?? result.count ?? state.items.length);
      if (badge) badge.textContent = `${state.activeItemCount} active items`;
      renderLookupGrid();
    } catch (error) {
      if (badge) badge.textContent = 'Error loading items';
      showMessage(error.message, 'error');
    }
  }

  function getAvailable(item) {
    const inCartItem = state.cart.get(String(item._id));
    const inCart = inCartItem ? (inCartItem.quantity || 0) : 0;
    return Math.max(0, Number(item.stockQty || 0) - inCart);
  }

  function toggleLookup(show) {
    const wrap = document.querySelector('.erp-lookup-table-wrap');
    if (!wrap) return;
    if (typeof show === 'boolean') {
      state.isLookupVisible = show;
    } else {
      state.isLookupVisible = !state.isLookupVisible;
    }
    wrap.classList.toggle('d-none', !state.isLookupVisible);
    if (state.isLookupVisible) {
      renderLookupGrid();
    }
  }

  function renderLookupGrid() {
    const tableBody = byId('erpLookupRows');
    if (!tableBody) return;

    const searchInput = byId('itemSearch');
    const query = searchInput && searchInput.value ? searchInput.value.trim().toLowerCase() : '';
    let matching = state.items;

    if (query) {
      matching = state.items.filter((item) => {
        const text = [item.name, item.itemsCode, item.barcode, item.companyName].join(' ').toLowerCase();
        return text.includes(query);
      });
    }

    state.filteredItems = matching;

    if (matching.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No matching items found for "${query}"</td></tr>`;
      state.selectedIndex = -1;
      return;
    }

    if (state.selectedIndex < 0) state.selectedIndex = 0;
    if (state.selectedIndex >= matching.length) state.selectedIndex = matching.length - 1;

    const displayList = matching.slice(0, 60);

    tableBody.innerHTML = displayList.map((item, idx) => {
      const avail = getAvailable(item);
      const isOut = avail <= 0;
      const isSelected = idx === state.selectedIndex;
      return `
        <tr data-item-id="${item._id}" data-index="${idx}" class="${isSelected ? 'erp-lookup-selected' : ''}" style="${isOut ? 'opacity: 0.5;' : ''}" title="Click or Press Enter to add to sale">
          <td style="font-weight: 600;">${item.name}</td>
          <td style="color: ${isSelected ? '#fff' : '#555'};">${item.barcode || item.itemsCode || '-'}</td>
          <td style="text-align: center; font-weight: bold; color: ${isSelected ? '#fff' : (avail > 0 ? '#006600' : '#cc0000')};">
            ${avail}
          </td>
          <td style="text-align: right; font-weight: bold;">${money(item.salePrice)}</td>
          <td style="color: ${isSelected ? '#eee' : '#444'}; font-size: 11px;">${item.companyName || '-'}</td>
        </tr>
      `;
    }).join('');

    const selectedTr = tableBody.querySelector('tr.erp-lookup-selected');
    if (selectedTr) {
      selectedTr.scrollIntoView({ block: 'nearest' });
    }
  }

  function addItem(item) {
    if (state.mode === 'return') {
      if (state.returnInvoice) {
        // Invoice-based return: increment return quantity for this item if present in loaded invoice
        const line = state.returnLines.find((l) => String(l.item) === String(item._id));
        if (!line) {
          showMessage(`Item "${item.name}" was not part of invoice #${state.returnInvoice.sale.invoiceNo}. To return unlisted items, switch to Direct Return mode.`, 'error');
          return;
        }
        const currentQty = Number(state.returnQuantities.get(line.item) || 0);
        if (currentQty >= line.quantityRemaining) {
          showMessage(`Cannot return more than available remaining quantity (${line.quantityRemaining}) for ${line.name}.`, 'error');
          return;
        }
        state.returnQuantities.set(line.item, currentQty + 1);
        renderCart();
        return;
      }

      // Direct Return Mode (without invoice): Add item directly to return list
      const id = String(item._id);
      const current = state.directReturnLines.get(id);
      const currentQty = current ? current.quantity : 0;
      const quantity = currentQty + 1;
      const pcsPrice = current ? current.pcsPrice : Number(item.retailPrice || item.salePrice || 0);

      state.directReturnLines.set(id, {
        item,
        quantity,
        pcsPrice,
        name: item.name,
        barcode: item.barcode || item.itemsCode || ''
      });
      showMessage('');
      renderCart();

      const searchInput = byId('itemSearch');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // Normal Sale Mode:
    if (getAvailable(item) <= 0) {
      showMessage(`${item.name} is out of stock.`, 'error');
      return;
    }
    const id = String(item._id);
    const current = state.cart.get(id);
    const currentQty = current ? (current.quantity || 0) : 0;
    const quantity = currentQty + 1;
    if (quantity > Number(item.stockQty || 0)) {
      showMessage(`Only ${item.stockQty || 0} available for ${item.name}.`, 'error');
      return;
    }
    state.cart.set(id, { item, quantity });
    showMessage('');
    renderCart();
    renderLookupGrid();

    const searchInput = byId('itemSearch');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  function updateQuantity(id, value) {
    const line = state.cart.get(id);
    if (!line) return;
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      state.cart.delete(id);
    } else if (quantity > Number(line.item.stockQty || 0)) {
      showMessage(`Only ${line.item.stockQty || 0} available for ${line.item.name}.`, 'error');
      return;
    } else {
      line.quantity = quantity;
    }
    renderCart();
    renderLookupGrid();
  }

  function totals() {
    let subtotal = 0;
    state.cart.forEach(({ item, quantity }) => {
      const amount = Number(item.salePrice || 0) * quantity;
      subtotal += amount;
    });
    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;

    const discPercentEl = byId('posDiscountPercent');
    const flatDiscEl = byId('posDiscountAmount');
    const miscEl = byId('posMiscCharges');
    const discountPercent = Number(discPercentEl ? discPercentEl.value : 0);
    const flatDiscount = Number(flatDiscEl ? flatDiscEl.value : 0);
    const miscCharges = Number(miscEl ? miscEl.value : 0);

    const percentageDiscount = Math.round((subtotal * discountPercent / 100 + Number.EPSILON) * 100) / 100;
    const discountTotal = Math.round((percentageDiscount + flatDiscount + Number.EPSILON) * 100) / 100;

    const adjustmentsValid = Number.isFinite(discountPercent)
      && discountPercent >= 0
      && discountPercent <= 100
      && Number.isFinite(flatDiscount)
      && flatDiscount >= 0
      && Number.isFinite(miscCharges)
      && miscCharges >= 0
      && discountTotal <= subtotal;

    const grandTotal = Math.round(Math.max(0, subtotal - discountTotal + miscCharges) * 100) / 100;
    return { subtotal, discountPercent, flatDiscount, percentageDiscount, discountTotal, miscCharges, grandTotal, adjustmentsValid };
  }

  function directReturnTotals() {
    let subtotal = 0;
    let quantity = 0;
    state.directReturnLines.forEach((line) => {
      const lineTotal = Math.round((Number(line.pcsPrice || 0) * Number(line.quantity || 0) + Number.EPSILON) * 100) / 100;
      subtotal += lineTotal;
      quantity += Number(line.quantity || 0);
    });
    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;
    return { subtotal, quantity, refundTotal: subtotal };
  }

  function returnTotals() {
    let subtotal = 0;
    let quantity = 0;
    state.returnLines.forEach((line) => {
      const returnQty = Number(state.returnQuantities.get(line.item) || 0);
      subtotal += Math.round((Number(line.pcsPrice || 0) * returnQty + Number.EPSILON) * 100) / 100;
      quantity += returnQty;
    });
    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;
    const retInv = state.returnInvoice || {};
    const saleSubtotal = Number(retInv.subtotal || 0);
    const discountPercent = Number(retInv.discountPercent || 0);
    const flatDiscount = saleSubtotal > 0
        ? Math.round((Number(retInv.flatDiscount || 0) * subtotal / saleSubtotal + Number.EPSILON) * 100) / 100
        : 0;
    const percentDiscount = Math.round((subtotal * discountPercent / 100 + Number.EPSILON) * 100) / 100;
    const tax = saleSubtotal > 0
        ? Math.round((Number(retInv.taxAmount || 0) * subtotal / saleSubtotal + Number.EPSILON) * 100) / 100
        : 0;
    const refundTotal = Math.round(Math.max(0, subtotal - flatDiscount - percentDiscount + tax) * 100) / 100;
    return { subtotal, quantity, flatDiscount, percentDiscount, tax, refundTotal };
  }

  function renderReturnCart() {
    const body = byId('cartRows');
    if (!body) return;
    body.replaceChildren();

    const countDisplay = byId('cartItemCountDisplay');

    if (state.returnInvoice) {
      // ================= FLOW 1: INVOICE-BASED RETURN =================
      if (countDisplay) {
        countDisplay.textContent = `(Invoice Return: ${state.returnLines.length} lines)`;
      }

      if (!state.returnLines.length) {
        const row = body.insertRow();
        row.innerHTML = `<td colspan="8" class="text-center text-muted py-5">This invoice has no returnable items.</td>`;
      } else {
        let rowNum = 1;
        state.returnLines.forEach((line) => {
          const row = body.insertRow();
          const returnQty = Number(state.returnQuantities.get(line.item) || 0);
          const lineRefund = Math.round((Number(line.pcsPrice || 0) * returnQty + Number.EPSILON) * 100) / 100;

          row.innerHTML = `
            <td class="text-center" style="font-weight: bold; color: #555;">${rowNum++}</td>
            <td style="font-family: monospace; font-size: 11.5px; color: #333;">${line.barcode || '-'}</td>
            <td style="font-weight: 700; color: #003366;">
              ${line.name}
              <div style="font-size: 11px; color: #666; font-weight: normal;">
                Sold: ${line.quantitySold} | Returned: ${line.quantityReturned} | Available to return: <strong>${line.quantityRemaining}</strong>
              </div>
            </td>
            <td class="text-center" style="font-weight: 600;">${line.quantityRemaining}</td>
            <td class="text-center">
              <input type="number" class="erp-cell-qty" min="0" max="${line.quantityRemaining}" value="${returnQty}" data-return-id="${line.item}" ${line.quantityRemaining <= 0 ? 'disabled' : ''}>
            </td>
            <td class="text-end" style="font-weight: 600;">${money(line.pcsPrice)}</td>
            <td class="text-end" style="font-weight: 800; color: #a04000; font-size: 13.5px;">${money(lineRefund)}</td>
            <td class="text-center">—</td>
          `;

          const qtyInput = row.querySelector('.erp-cell-qty');
          if (qtyInput) {
            qtyInput.addEventListener('change', () => {
              const val = Math.max(0, Math.min(Number(qtyInput.value) || 0, line.quantityRemaining));
              state.returnQuantities.set(line.item, val);
              qtyInput.value = val;
              renderCart();
            });
          }
        });
      }

      const { subtotal, quantity, refundTotal } = returnTotals();
      if (byId('subtotal')) byId('subtotal').value = money(subtotal);
      if (byId('grandTotal')) byId('grandTotal').textContent = money(refundTotal);
      if (byId('cashReceived')) byId('cashReceived').value = money(refundTotal);
      if (byId('changeDue')) byId('changeDue').value = '0.00';
      if (byId('completeSale')) {
        byId('completeSale').disabled = quantity <= 0 || refundTotal <= 0 || state.submitting;
      }
      if (byId('clearCart')) {
        byId('clearCart').disabled = quantity <= 0 || state.submitting;
      }
    } else {
      // ================= FLOW 2: DIRECT RETURN (WITHOUT INVOICE) =================
      if (countDisplay) {
        countDisplay.textContent = `(Direct Return: ${state.directReturnLines.size} lines)`;
      }

      if (state.directReturnLines.size === 0) {
        const row = body.insertRow();
        row.innerHTML = `
          <td colspan="8" class="text-center text-muted py-5">
            <i class="fas fa-barcode fa-2x mb-2 text-warning d-block"></i>
            <strong style="color: #003366; font-size: 14px;">Direct Sale Return Mode Active</strong><br>
            <span style="color: #666; font-size: 12px;">Search or scan any item from the Item Lookup table above to add it for return. No invoice number needed!</span>
          </td>
        `;
      } else {
        let rowNum = 1;
        state.directReturnLines.forEach((line, id) => {
          const row = body.insertRow();
          const lineTotal = Math.round((Number(line.pcsPrice || 0) * Number(line.quantity || 0) + Number.EPSILON) * 100) / 100;
          const currentStock = Number(line.item.stockQty || 0);

          row.innerHTML = `
            <td class="text-center" style="font-weight: bold; color: #555;">${rowNum++}</td>
            <td style="font-family: monospace; font-size: 11.5px; color: #333;">${line.barcode || '-'}</td>
            <td style="font-weight: 700; color: #003366;">
              ${line.name}
              <span class="badge bg-warning text-dark ms-1" style="font-size: 10px;">Return</span>
            </td>
            <td class="text-center" style="font-weight: 600; color: #006600;">
              ${currentStock} in stock
            </td>
            <td class="text-center">
              <input type="number" class="erp-cell-qty" min="1" value="${line.quantity}" data-direct-qty="${id}">
            </td>
            <td class="text-end">
              <input type="number" step="0.01" min="0" class="erp-cell-qty text-end" style="width: 75px;" value="${money(line.pcsPrice)}" data-direct-price="${id}">
            </td>
            <td class="text-end" style="font-weight: 800; color: #a04000; font-size: 13.5px;">${money(lineTotal)}</td>
            <td class="text-center">
              <button type="button" class="erp-delete-btn" data-remove-direct="${id}" title="Remove item from return">
                <i class="fas fa-trash-can"></i>
              </button>
            </td>
          `;

          const qtyInput = row.querySelector('[data-direct-qty]');
          if (qtyInput) {
            qtyInput.addEventListener('change', () => {
              const val = Math.max(1, Number(qtyInput.value) || 1);
              line.quantity = val;
              qtyInput.value = val;
              renderCart();
            });
          }

          const priceInput = row.querySelector('[data-direct-price]');
          if (priceInput) {
            priceInput.addEventListener('change', () => {
              const val = Math.max(0, Number(priceInput.value) || 0);
              line.pcsPrice = val;
              priceInput.value = money(val);
              renderCart();
            });
          }

          const removeBtn = row.querySelector('[data-remove-direct]');
          if (removeBtn) {
            removeBtn.addEventListener('click', () => {
              state.directReturnLines.delete(id);
              renderCart();
            });
          }
        });
      }

      const { subtotal, quantity, refundTotal } = directReturnTotals();
      if (byId('subtotal')) byId('subtotal').value = money(subtotal);
      if (byId('grandTotal')) byId('grandTotal').textContent = money(refundTotal);
      if (byId('cashReceived')) byId('cashReceived').value = money(refundTotal);
      if (byId('changeDue')) byId('changeDue').value = '0.00';
      if (byId('completeSale')) {
        byId('completeSale').disabled = state.directReturnLines.size === 0 || refundTotal <= 0 || state.submitting;
      }
      if (byId('clearCart')) {
        byId('clearCart').disabled = state.directReturnLines.size === 0 || state.submitting;
      }
    }
  }

  function renderCart() {
    if (state.mode === 'return') {
      renderReturnCart();
      return;
    }

    const body = byId('cartRows');
    if (!body) return;
    body.replaceChildren();

    const countDisplay = byId('cartItemCountDisplay');
    if (countDisplay) {
      let totalQty = 0;
      state.cart.forEach(c => totalQty += c.quantity);
      countDisplay.textContent = `(${state.cart.size} lines, ${totalQty} units)`;
    }

    if (state.cart.size === 0) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 8;
      cell.className = 'text-center text-muted py-5';
      cell.innerHTML = '<i class="fas fa-barcode me-2"></i>Scan a barcode or click an item above to add it to this sale.';
    } else {
      let rowNum = 1;
      state.cart.forEach(({ item, quantity }, id) => {
        const row = body.insertRow();
        const lineTotal = Number(item.salePrice || 0) * quantity;
        const avail = Number(item.stockQty || 0);

        row.innerHTML = `
          <td class="text-center" style="font-weight: bold; color: #555;">${rowNum++}</td>
          <td style="font-family: monospace; font-size: 11.5px; color: #333;">${item.barcode || item.itemsCode || '-'}</td>
          <td style="font-weight: 700; color: #003366;">
            ${item.name}
            ${item.companyName ? `<span style="font-size: 11px; color: #666; font-weight: normal; margin-left: 6px;">(${item.companyName})</span>` : ''}
          </td>
          <td class="text-center" style="font-weight: 600; color: ${avail > 0 ? '#006600' : '#cc0000'};">
            ${avail} in stock
          </td>
          <td class="text-center">
            <input type="number" class="erp-cell-qty" min="1" max="${avail}" value="${quantity}" data-id="${id}">
          </td>
          <td class="text-end" style="font-weight: 600;">${money(item.salePrice)}</td>
          <td class="text-end" style="font-weight: 800; color: #003366; font-size: 13.5px;">${money(lineTotal)}</td>
          <td class="text-center">
            <button type="button" class="erp-delete-btn" data-remove-id="${id}" title="Remove item">
              <i class="fas fa-trash-can"></i>
            </button>
          </td>
        `;

        const qtyInput = row.querySelector('.erp-cell-qty');
        qtyInput.addEventListener('change', () => updateQuantity(id, qtyInput.value));

        const removeBtn = row.querySelector('[data-remove-id]');
        removeBtn.addEventListener('click', () => updateQuantity(id, 0));
      });
    }

    const saleTotals = totals();
    const { subtotal, grandTotal, adjustmentsValid } = saleTotals;

    if (byId('subtotal')) byId('subtotal').value = money(subtotal);
    if (byId('grandTotal')) byId('grandTotal').textContent = money(grandTotal);

      const cashRecInput = byId('cashReceived');
      if (!state.cashEdited && cashRecInput) {
        cashRecInput.value = grandTotal.toFixed(2);
      }
      const tendered = Number(cashRecInput ? cashRecInput.value : 0);
      if (byId('changeDue')) {
        byId('changeDue').value = money(Math.max(0, tendered - grandTotal));
      }

      if (byId('completeSale')) {
        byId('completeSale').disabled = state.cart.size === 0 || state.submitting || !adjustmentsValid || tendered < grandTotal;
      }
      if (byId('clearCart')) {
        byId('clearCart').disabled = state.cart.size === 0 || state.submitting;
      }
    }

    function setMode(mode) {
      if (state.submitting && mode !== state.mode) return;
      state.mode = mode;
      const isReturn = mode === 'return';

      // Toggle mode buttons
      const saleBtn = byId('saleModeButton');
      if (saleBtn) saleBtn.classList.toggle('active', !isReturn);
      const retBtn = byId('returnModeButton');
      if (retBtn) retBtn.classList.toggle('active', isReturn);

      // Toggle return invoice lookup strip
      const retStrip = byId('returnLookupStrip');
      if (retStrip) retStrip.classList.toggle('d-none', !isReturn);

      // Update labels
      if (byId('cartHeaderTitle')) {
        byId('cartHeaderTitle').textContent = isReturn ? 'Sale Return Items' : 'Sale Items Cart';
      }
      if (byId('completeSaleLabel')) {
        byId('completeSaleLabel').textContent = isReturn ? 'Post Return' : 'Post & Print';
      }
      if (byId('netSaleLabel')) {
        byId('netSaleLabel').textContent = isReturn ? 'NET REFUND:' : 'NET SALE:';
      }

      renderCart();
      renderLookupGrid();
      const searchInput = byId('itemSearch');
      if (searchInput) searchInput.focus();
    }

    function setListView(list) {
      state.activeList = list;
      const isList = Boolean(list);

      // Toggle workspace vs list panels
      const wsPanels = byId('saleWorkspacePanels');
      if (wsPanels) wsPanels.classList.toggle('d-none', isList);
      const retStrip = byId('returnLookupStrip');
      if (retStrip) retStrip.classList.toggle('d-none', isList || state.mode !== 'return');
      const slPanel = byId('salesListPanel');
      if (slPanel) slPanel.classList.toggle('d-none', list !== 'sales');
      const rlPanel = byId('returnsListPanel');
      if (rlPanel) rlPanel.classList.toggle('d-none', list !== 'returns');

      // Update button states
      const slBtn = byId('salesListButton');
      if (slBtn) slBtn.classList.toggle('active', list === 'sales');
      const rlBtn = byId('returnsListButton');
      if (rlBtn) rlBtn.classList.toggle('active', list === 'returns');

      if (list === 'sales') loadSalesList();
      if (list === 'returns') loadReturnsList();
    }

    async function loadReturnInvoice() {
      const invInput = byId('returnInvoiceNumber');
      const invoiceNo = invInput ? invInput.value.trim() : '';
      const status = byId('returnInvoiceStatus');
      if (!invoiceNo) {
        if (status) {
          status.textContent = 'Enter an invoice number.';
          status.style.color = '#c00';
        }
        return;
      }

      if (status) {
        status.textContent = 'Loading invoice…';
        status.style.color = '#0055a5';
      }
      try {
        const result = await apiRequest(`/api/v1/wh-sales/pos-return/invoice/${encodeURIComponent(invoiceNo)}`);
        state.returnInvoice = result.data;
        state.returnLines = result.data.items || [];
        state.returnQuantities.clear();

        const details = byId('returnInvoiceDetails');
        if (details) {
          details.textContent = `Invoice #${result.data.sale.invoiceNo} | Date: ${new Date(result.data.sale.invoiceDate).toLocaleDateString()} | Net Total: Rs. ${money(result.data.sale.netTotal)}`;
          details.classList.remove('d-none');
        }

        if (status) {
          status.textContent = 'Invoice loaded. Enter return quantities below.';
          status.style.color = '#080';
        }

        const clearBtn = byId('clearReturnInvoice');
        if (clearBtn) clearBtn.classList.remove('d-none');

        if (byId('erpCustomerName')) {
          const saleObj = result.data.sale || {};
          const cust = saleObj.customer || {};
          byId('erpCustomerName').value = cust.customerName || cust.name || 'Customer';
        }

        renderCart();
      } catch (error) {
        state.returnInvoice = null;
        state.returnLines = [];
        state.returnQuantities.clear();
        const details = byId('returnInvoiceDetails');
        if (details) {
          details.textContent = '';
          details.classList.add('d-none');
        }
        if (status) {
          status.textContent = error.message;
          status.style.color = '#c00';
        }
        showMessage(error.message, 'error');
        renderCart();
      }
    }

    async function loadSalesList() {
      const status = byId('salesListStatus');
      const tableBody = byId('salesListRows');
      if (status) status.textContent = 'Loading invoices…';
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Loading invoices…</td></tr>';

      const searchEl = byId('salesListSearch');
      const query = new URLSearchParams({
        page: String(state.salesListPage),
        limit: '50',
      search: searchEl && searchEl.value ? searchEl.value.trim() : ''
      });
      const startEl = byId('salesListStartDate');
      const endEl = byId('salesListEndDate');
      const startDate = startEl ? startEl.value : '';
      const endDate = endEl ? endEl.value : '';
      if (startDate) query.set('startDate', startDate);
      if (endDate) query.set('endDate', endDate);

      try {
        const result = await apiRequest(`/api/v1/wh-sales/pos/list?${query}`);
        const sales = result.data || [];
        const pagination = result.pagination || {};
        state.salesListPages = Number(pagination.pages || 0);
        const total = Number(pagination.total || 0);

        if (status) status.textContent = `${total} invoice${total === 1 ? '' : 's'}`;
        if (byId('salesListPageStatus')) {
          byId('salesListPageStatus').textContent = total ? `Page ${state.salesListPage} of ${state.salesListPages}` : '';
        }
        if (byId('salesListPrev')) byId('salesListPrev').disabled = state.salesListPage <= 1;
        if (byId('salesListNext')) byId('salesListNext').disabled = state.salesListPage >= state.salesListPages;

        if (!sales.length) {
          tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No POS invoices found.</td></tr>';
          return;
        }

        tableBody.innerHTML = sales.map((sale) => {
          const cust = sale.customer || {};
          const customer = cust.customerName || cust.name || sale.customerName || 'Walk-in Customer';
          const dateStr = sale.invoiceDate ? new Date(sale.invoiceDate).toLocaleDateString() : '-';
          const creator = sale.createdBy || {};
          return `
          <tr>
            <td style="font-weight: 700; font-family: monospace;">${sale.invoiceNo}</td>
            <td>${customer}</td>
            <td>${dateStr}</td>
            <td><span class="badge bg-success">${sale.status || 'Posted'}</span></td>
            <td class="text-end" style="font-weight: 700;">Rs. ${money(sale.netTotal)}</td>
            <td>${creator.name || '-'}</td>
            <td style="font-size: 11.5px; color: #555;">${sale.remarks || '-'}</td>
            <td class="text-end">${money(sale.totalReturned)}</td>
            <td class="text-center">
              <a href="/print-invoice?type=wh-sale&id=${encodeURIComponent(sale._id)}&format=thermal" target="_blank" class="erp-btn-sm" style="text-decoration: none; padding: 2px 7px;">
                <i class="fas fa-print me-1"></i>Print
              </a>
            </td>
          </tr>
        `;
        }).join('');
      } catch (error) {
        if (status) status.textContent = 'Failed to load invoices';
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">${error.message}</td></tr>`;
      }
    }

    async function loadReturnsList() {
      const status = byId('returnsListStatus');
      const tableBody = byId('returnsListRows');
      if (status) status.textContent = 'Loading returns…';
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Loading returns…</td></tr>';

      const rSearchEl = byId('returnsListSearch');
      const rStatusEl = byId('returnsListStatusFilter');
      const query = new URLSearchParams({
        page: String(state.returnsListPage),
        limit: '50',
      search: rSearchEl && rSearchEl.value ? rSearchEl.value.trim() : '',
        status: rStatusEl && rStatusEl.value ? rStatusEl.value : 'All'
      });
      const rStartEl = byId('returnsListStartDate');
      const rEndEl = byId('returnsListEndDate');
      const startDate = rStartEl ? rStartEl.value : '';
      const endDate = rEndEl ? rEndEl.value : '';
      if (startDate) query.set('startDate', startDate);
      if (endDate) query.set('endDate', endDate);

      try {
        const result = await apiRequest(`/api/v1/wh-sales/pos/returns?${query}`);
        const returns = result.data || [];
        const pagination = result.pagination || {};
        state.returnsListPages = Number(pagination.pages || 0);
        const total = Number(pagination.total || 0);

        if (status) status.textContent = `${total} return${total === 1 ? '' : 's'}`;
        if (byId('returnsListPageStatus')) {
          byId('returnsListPageStatus').textContent = total ? `Page ${state.returnsListPage} of ${state.returnsListPages}` : '';
        }
        if (byId('returnsListPrev')) byId('returnsListPrev').disabled = state.returnsListPage <= 1;
        if (byId('returnsListNext')) byId('returnsListNext').disabled = state.returnsListPage >= state.returnsListPages;

        if (!returns.length) {
          tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No returns found.</td></tr>';
          return;
        }

        tableBody.innerHTML = returns.map((ret) => {
          const rCust = ret.customer || {};
          const customer = rCust.customerName || rCust.name || 'Walk-in Customer';
          const dateStr = ret.returnDate ? new Date(ret.returnDate).toLocaleDateString() : '-';
          const orig = ret.originalSale || {};
          const req = ret.requestedBy || {};
          return `
          <tr>
            <td style="font-weight: 700; font-family: monospace;">${ret.returnNo}</td>
            <td style="font-family: monospace;">${orig.invoiceNo || '-'}</td>
            <td>${customer}</td>
            <td>${dateStr}</td>
            <td><span class="badge bg-warning text-dark">${ret.status || 'Posted'}</span></td>
            <td class="text-end" style="font-weight: 700; color: #a04000;">Rs. ${money(ret.refundAmount || ret.totalRefund)}</td>
            <td>${req.name || '-'}</td>
            <td style="font-size: 11.5px; color: #555;">${ret.remarks || '-'}</td>
            <td class="text-center">
              <a href="/print-invoice?type=wh-sale-return&id=${encodeURIComponent(ret._id)}&format=thermal" target="_blank" class="erp-btn-sm" style="text-decoration: none; padding: 2px 7px;">
                <i class="fas fa-print me-1"></i>Print
              </a>
            </td>
          </tr>
        `;
        }).join('');
      } catch (error) {
        if (status) status.textContent = 'Failed to load returns';
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">${error.message}</td></tr>`;
      }
    }

    function requestPOSPassword(action) {
      return new Promise((resolve) => {
        byId('posPasswordPrompt').textContent = `Enter your login password to ${action}.`;
        byId('posPasswordInput').value = '';
        byId('posPasswordError').textContent = '';
        byId('posPasswordError').classList.add('d-none');
        state.passwordResolver = resolve;
        state.passwordModal.show();
      });
    }

    async function completeSale() {
      if (state.submitting) return;

      if (state.mode === 'return') {
        return completeReturn();
      }

      if (state.cart.size === 0) return;
      const saleTotals = totals();
      const { grandTotal, adjustmentsValid } = saleTotals;
      if (!adjustmentsValid) {
        showMessage('Please verify discount amounts.', 'error');
        return;
      }
      const cashReceived = Number(byId('cashReceived').value);
      if (!Number.isFinite(cashReceived) || cashReceived < grandTotal) {
        showMessage('Cash received must be at least the sale total.', 'error');
        return;
      }

      state.submitting = true;
      renderCart();
      let password = '';
      try {
        password = await requestPOSPassword('post this sale');
        if (!password) {
          return;
        }
        showMessage('Posting sale and deducting warehouse stock…');
        const result = await apiRequest('/api/v1/wh-sales/pos', {
          method: 'POST',
          body: JSON.stringify({
            password,
            items: Array.from(state.cart, ([item, line]) => ({ item, quantity: line.quantity })),
            cashReceived,
            globalDiscountPercent: saleTotals.discountPercent,
            globalDiscountAmount: saleTotals.flatDiscount,
            miscCharges: saleTotals.miscCharges
          })
        });
        password = '';
        const sale = result.data;
        const printUrl = `/print-invoice?type=wh-sale&id=${encodeURIComponent(sale._id)}&format=thermal&autoprint=1`;
        state.lastPrintUrl = printUrl;
        byId('printLastSale').href = printUrl;
        byId('printLastSale').classList.remove('d-none');

        state.cart.forEach(({ item, quantity }) => {
          const current = state.items.find((catalogItem) => String(catalogItem._id) === String(item._id));
          if (current) {
            current.stockQty = Math.max(0, Number(current.stockQty || 0) - quantity);
            if (current.stock && current.stock.length && current.stock[0]) {
              current.stock[0].quantity = current.stockQty;
            }
          }
        });

        state.cart.clear();
        state.cashEdited = false;
        if (byId('posDiscountPercent')) byId('posDiscountPercent').value = '0';
        if (byId('posDiscountAmount')) byId('posDiscountAmount').value = '0.00';
        if (byId('posMiscCharges')) byId('posMiscCharges').value = '0.00';

        renderCart();
        renderLookupGrid();
        showMessage(`Sale ${sale.invoiceNo} posted successfully! Printing receipt…`, 'success');

        const printWindow = window.open(printUrl, '_blank');
        if (!printWindow) {
          showMessage(`Sale ${sale.invoiceNo} saved. Use "Print Last Receipt" to print it.`, 'success');
        }

        byId('itemSearch').focus();
      } catch (error) {
        showMessage(error.message, 'error');
      } finally {
        password = '';
        state.submitting = false;
        renderCart();
      }
    }

    async function completeReturn() {
      if (state.submitting) return;
      const isDirect = !state.returnInvoice;

      let itemsPayload = [];
      let originalSaleId = null;

      if (isDirect) {
        if (state.directReturnLines.size === 0) {
          showMessage('Select or scan at least one item to return.', 'error');
          return;
        }
        itemsPayload = Array.from(state.directReturnLines.entries()).map(([id, line]) => ({
          item: id,
          quantity: line.quantity,
          pcsPrice: line.pcsPrice
        }));
      } else {
        const { quantity } = returnTotals();
        if (quantity <= 0) {
          showMessage('Select return quantities greater than 0.', 'error');
          return;
        }
        originalSaleId = state.returnInvoice.sale._id;
        itemsPayload = Array.from(state.returnQuantities, ([item, returnQuantity]) => ({
          item,
          quantity: returnQuantity
        })).filter((line) => line.quantity > 0);
      }

      state.submitting = true;
      renderCart();
      let password = '';
      try {
        password = await requestPOSPassword('post this sale return');
        if (!password) {
          return;
        }
        showMessage('Submitting return…');
        const result = await apiRequest('/api/v1/wh-sales/pos-return', {
          method: 'POST',
          body: JSON.stringify({
            originalSaleId,
            password,
            items: itemsPayload,
            remarks: isDirect ? 'Direct POS return without invoice' : undefined
          })
        });
        password = '';
        const saleReturn = result.data;

        // Update local items stock (return adds stock back)
        itemsPayload.forEach(({ item, quantity }) => {
          const catalogItem = state.items.find((ci) => String(ci._id) === String(item));
          if (catalogItem) {
            catalogItem.stockQty = Number(catalogItem.stockQty || 0) + quantity;
            if (catalogItem.stock && catalogItem.stock.length && catalogItem.stock[0]) {
              catalogItem.stock[0].quantity = catalogItem.stockQty;
            }
          }
        });

        state.directReturnLines.clear();
        state.returnQuantities.clear();
        state.returnInvoice = null;
        state.returnLines = [];

        const details = byId('returnInvoiceDetails');
        if (details) {
          details.textContent = '';
          details.classList.add('d-none');
        }
        const invInput = byId('returnInvoiceNumber');
        if (invInput) invInput.value = '';
        const invStatus = byId('returnInvoiceStatus');
        if (invStatus) invStatus.textContent = '';
        const clearBtn = byId('clearReturnInvoice');
        if (clearBtn) clearBtn.classList.add('d-none');

        renderCart();
        renderLookupGrid();

        if (saleReturn && saleReturn._id) {
          const printUrl = `/print-invoice?type=wh-sale-return&id=${encodeURIComponent(saleReturn._id)}&format=thermal&autoprint=1`;
          state.lastPrintUrl = printUrl;
          byId('printLastSale').href = printUrl;
          byId('printLastSale').classList.remove('d-none');
          window.open(printUrl, '_blank');
        }

        showMessage(`Return ${saleReturn.returnNo} posted successfully! Printing receipt…`, 'success');
      } catch (error) {
        showMessage(error.message, 'error');
      } finally {
        password = '';
        state.submitting = false;
        renderCart();
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      // Password Modal setup
      const passwordModalElement = byId('posPasswordModal');
      if (passwordModalElement) {
        state.passwordModal = bootstrap.Modal.getOrCreateInstance(passwordModalElement, {
          backdrop: 'static',
          keyboard: false
        });
        passwordModalElement.addEventListener('shown.bs.modal', () => {
          const passInput = byId('posPasswordInput');
          if (passInput) {
            passInput.focus();
            passInput.select();
          }
        });
        passwordModalElement.addEventListener('hidden.bs.modal', () => {
          if (state.passwordResolver) {
            state.passwordResolver(null);
            state.passwordResolver = null;
          }
          byId('posPasswordInput').value = '';
        });

        // Submit password handler (triggered by form submit or Enter key)
        const handlePasswordSubmit = () => {
          const password = byId('posPasswordInput').value;
          if (!password) {
            const err = byId('posPasswordError');
            if (err) {
              err.textContent = 'Please enter password.';
              err.classList.remove('d-none');
            }
            return;
          }
          if (!state.passwordResolver) return;
          const resolvePassword = state.passwordResolver;
          state.passwordResolver = null;
          resolvePassword(password);
          state.passwordModal.hide();
        };

        byId('posPasswordForm').addEventListener('submit', (event) => {
          event.preventDefault();
          handlePasswordSubmit();
        });

        // Explicit Enter key on password input for quick posting
          addListener('posPasswordInput', 'keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handlePasswordSubmit();
            }
          });
        }

    // Read cashier info
    let user = {};
        try {
          user = JSON.parse(localStorage.getItem('user') || '{}');
        } catch (error) { }
        if (byId('cashierName')) {
          byId('cashierName').textContent = user.name || user.email || 'Cashier';
        }

        // Top Action Buttons: Sale, Return, Invoices, Returns List
          addListener('saleModeButton', 'click', () => {
            setListView(null);
            setMode('sale');
          });

            addListener('returnModeButton', 'click', () => {
              setListView(null);
              setMode('return');
            });

              addListener('salesListButton', 'click', () => {
                const next = state.activeList === 'sales' ? null : 'sales';
                setListView(next);
              });

                addListener('returnsListButton', 'click', () => {
                  const next = state.activeList === 'returns' ? null : 'returns';
                  setListView(next);
                });

                // Return invoice lookup
                  addListener('loadReturnInvoice', 'click', loadReturnInvoice);
                  addListener('clearReturnInvoice', 'click', () => {
                    state.returnInvoice = null;
                    state.returnLines = [];
                    state.returnQuantities.clear();
                    const invInput = byId('returnInvoiceNumber');
                    if (invInput) invInput.value = '';
                    const invStatus = byId('returnInvoiceStatus');
                    if (invStatus) invStatus.textContent = '';
                    const details = byId('returnInvoiceDetails');
                    if (details) {
                      details.textContent = '';
                      details.classList.add('d-none');
                    }
                    const clearBtn = byId('clearReturnInvoice');
                    if (clearBtn) clearBtn.classList.add('d-none');
                    renderCart();
                    showMessage('Direct Return mode active. Select or scan items below.', 'info');
                  });
                  addListener('returnInvoiceNumber', 'keydown', (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      loadReturnInvoice();
                    }
                  });

                  // Sales list search & pagination
                    addListener('refreshSalesList', 'click', () => {
                      state.salesListPage = 1;
                      loadSalesList();
                    });
                      addListener('salesListSearch', 'input', () => {
                        clearTimeout(state.salesListTimer);
                        state.salesListTimer = setTimeout(() => {
                          state.salesListPage = 1;
                          loadSalesList();
                        }, 300);
                      });
                        addListener('salesListPrev', 'click', () => {
                          if (state.salesListPage > 1) {
                            state.salesListPage -= 1;
                            loadSalesList();
                          }
                        });
                          addListener('salesListNext', 'click', () => {
                            if (state.salesListPage < state.salesListPages) {
                              state.salesListPage += 1;
                              loadSalesList();
                            }
                          });

                          // Returns list search & pagination
                            addListener('refreshReturnsList', 'click', () => {
                              state.returnsListPage = 1;
                              loadReturnsList();
                            });
                              addListener('returnsListSearch', 'input', () => {
                                clearTimeout(state.returnsListTimer);
                                state.returnsListTimer = setTimeout(() => {
                                  state.returnsListPage = 1;
                                  loadReturnsList();
                                }, 300);
                              });
                                addListener('returnsListPrev', 'click', () => {
                                  if (state.returnsListPage > 1) {
                                    state.returnsListPage -= 1;
                                    loadReturnsList();
                                  }
                                });
                                  addListener('returnsListNext', 'click', () => {
                                    if (state.returnsListPage < state.returnsListPages) {
                                      state.returnsListPage += 1;
                                      loadReturnsList();
                                    }
                                  });

                                  // Lookup Table Click delegation (Click item row to add to cart)
                                  const lookupRows = byId('erpLookupRows');
                                  if (lookupRows) {
                                    lookupRows.addEventListener('click', (event) => {
                                      const tr = event.target.closest('tr[data-item-id]');
                                      if (!tr) return;
                                      const itemId = tr.dataset.itemId;
                                      const item = state.items.find(i => String(i._id) === String(itemId));
                                      if (item) addItem(item);
                                    });
                                  }

                                  // Search Bar input & navigation
                                  const itemSearch = byId('itemSearch');
                                  if (itemSearch) {
                                    itemSearch.addEventListener('focus', () => {
                                      toggleLookup(true);
                                      state.selectedIndex = 0;
                                      renderLookupGrid();
                                    });

                                    itemSearch.addEventListener('click', () => {
                                      toggleLookup(true);
                                      renderLookupGrid();
                                    });

                                    itemSearch.addEventListener('input', () => {
                                      state.selectedIndex = 0;
                                      toggleLookup(true);
                                      renderLookupGrid();
                                    });

                                    itemSearch.addEventListener('keydown', (event) => {
                                      if (event.key === 'ArrowDown') {
                                        event.preventDefault();
                                        toggleLookup(true);
                                        if (state.filteredItems && state.filteredItems.length > 0) {
                                          state.selectedIndex = Math.min(state.selectedIndex + 1, state.filteredItems.length - 1);
                                          renderLookupGrid();
                                        }
                                        return;
                                      }

                                      if (event.key === 'ArrowUp') {
                                        event.preventDefault();
                                        toggleLookup(true);
                                        if (state.filteredItems && state.filteredItems.length > 0) {
                                          state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
                                          renderLookupGrid();
                                        }
                                        return;
                                      }

                                      if (event.key === 'Enter') {
                                        event.preventDefault();
                                        const query = itemSearch.value.trim().toLowerCase();

                                        if (query) {
                                          const exactMatch = state.items.find((item) =>
                                            [item.barcode, item.itemsCode].some((val) => val && String(val).toLowerCase() === query)
                                          );
                                          if (exactMatch) {
                                            addItem(exactMatch);
                                            itemSearch.value = '';
                                            renderLookupGrid();
                                            return;
                                          }
                                        }

                                        if (state.filteredItems && state.filteredItems.length > 0) {
                                          const pickIndex = (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length)
                                            ? state.selectedIndex
                                            : 0;
                                          const chosenItem = state.filteredItems[pickIndex];
                                          if (chosenItem) {
                                            addItem(chosenItem);
                                            itemSearch.value = '';
                                            renderLookupGrid();
                                          }
                                        }
                                        return;
                                      }

                                      if (event.key === 'Escape') {
                                        toggleLookup(false);
                                      }
                                    });
                                  }

                                  // Inventory refresh
                                  const refreshBtn = byId('refreshItems');
                                  if (refreshBtn) refreshBtn.addEventListener('click', loadItems);

                                  // Complete Sale button
                                  const completeBtn = byId('completeSale');
                                  if (completeBtn) completeBtn.addEventListener('click', completeSale);

                                  // Clear Cart button
                                  const clearBtn = byId('clearCart');
                                  if (clearBtn) {
                                    clearBtn.addEventListener('click', () => {
                                      if (state.mode === 'return') {
                                        state.directReturnLines.clear();
                                        state.returnQuantities.clear();
                                        if (state.returnInvoice) {
                                          state.returnInvoice = null;
                                          state.returnLines = [];
                                          const details = byId('returnInvoiceDetails');
                                          if (details) {
                                            details.textContent = '';
                                            details.classList.add('d-none');
                                          }
                                          const invInput = byId('returnInvoiceNumber');
                                          if (invInput) invInput.value = '';
                                          const invStatus = byId('returnInvoiceStatus');
                                          if (invStatus) invStatus.textContent = '';
                                          const clearRetBtn = byId('clearReturnInvoice');
                                          if (clearRetBtn) clearRetBtn.classList.add('d-none');
                                        }
                                      } else {
                                        state.cart.clear();
                                        state.cashEdited = false;
                                      }
                                      renderCart();
                                      renderLookupGrid();
                                      showMessage('');
                                      if (itemSearch) itemSearch.focus();
                                    });
                                  }

                                  // Cash received & discount inputs
                                  if (byId('cashReceived')) {
                                    byId('cashReceived').addEventListener('input', () => {
                                      state.cashEdited = true;
                                      renderCart();
                                    });
                                  }
                                  ['posDiscountPercent', 'posDiscountAmount', 'posMiscCharges'].forEach((id) => {
                                    const input = byId(id);
                                    if (input) input.addEventListener('input', renderCart);
                                  });

                                  // Global keyboard shortcuts:
                                  // [Alt + S] or [F2] -> Save / Post & Print Sale
                                  // [Alt + A] or [F4] -> Jump to item search & write
                                  window.addEventListener('keydown', (e) => {
                                    // Check Alt+S or Alt+s
                                    if (e.altKey && (e.key === 's' || e.key === 'S')) {
                                      e.preventDefault();
                                      completeSale();
                                      return;
                                    }

                                    // Check Alt+A or Alt+a
                                    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
                                      e.preventDefault();
                                      toggleLookup(true);
                                      if (itemSearch) {
                                        itemSearch.focus();
                                        itemSearch.select();
                                      }
                                      return;
                                    }

                                    // Existing F4 shortcut
                                    if (e.key === 'F4') {
                                      e.preventDefault();
                                      toggleLookup();
                                      if (itemSearch) {
                                        itemSearch.focus();
                                        itemSearch.select();
                                      }
                                      return;
                                    }

                                    // Existing F2 shortcut
                                    if (e.key === 'F2') {
                                      e.preventDefault();
                                      completeSale();
                                      return;
                                    }
                                  });

                                  // Initial load
                                  renderCart();
                                  loadItems();
                                  if (itemSearch) itemSearch.focus();
                                });
                              })();
