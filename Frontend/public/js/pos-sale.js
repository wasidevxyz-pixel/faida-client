(() => {
  'use strict';

  const state = {
    items: [],
    filteredItems: [],
    cart: new Map(),
    cashEdited: false,
    submitting: false,
    mode: 'sale',
    returnInvoice: null,
    returnLines: [],
    returnQuantities: new Map(),
    lastPrintUrl: '',
    activeItemCount: 0,
    renderedSuggestionCount: 0,
    highlightedIndex: -1,
    suggestionsOpen: false,
    searchRequestId: 0,
    searchController: null,
    salesListPage: 1,
    salesListPages: 0,
    salesListRequestId: 0,
    salesListTimer: null,
    returnsListPage: 1,
    returnsListPages: 0,
    returnsListRequestId: 0,
    returnsListTimer: null,
    activeList: null,
    passwordModal: null,
    passwordResolver: null
  };

  const SUGGESTION_PAGE_SIZE = 60;
  const byId = (id) => document.getElementById(id);
  const money = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;
  const token = () => localStorage.getItem('token');

  function normalizeItem(item) {
    const stockQty = Array.isArray(item.stock) ? Number(item.stock[0]?.quantity || 0) : 0;
    return {
      ...item,
      stockQty,
      salePrice: Number(item.retailPrice || item.salePrice || 0),
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
    element.textContent = message;
    element.className = `pos-message${type ? ` ${type}` : ''}`;
  }

  async function loadItems() {
    byId('catalogStatus').textContent = 'Loading warehouse inventory…';
    try {
      const result = await apiRequest('/api/v1/wh-items/pos-catalog?limit=1000');
      state.items = (result.data || [])
        .filter((item) => item.isActive !== false)
        .map(normalizeItem);
      state.activeItemCount = Number(result.totalCount ?? result.count ?? state.items.length);
      renderItems();
    } catch (error) {
      byId('catalogStatus').textContent = 'Could not load inventory';
      showMessage(error.message, 'error');
    }
  }

  function getAvailable(item) {
    const inCart = state.cart.get(String(item._id))?.quantity || 0;
    return Math.max(0, Number(item.stockQty || 0) - inCart);
  }

  function appendSuggestions() {
    const list = byId('itemGrid');
    const end = Math.min(state.renderedSuggestionCount + SUGGESTION_PAGE_SIZE, state.filteredItems.length);

    for (let index = state.renderedSuggestionCount; index < end; index += 1) {
      const item = state.filteredItems[index];
      const available = getAvailable(item);
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `pos-item-option-${index}`;
      button.className = 'pos-item-option';
      button.dataset.index = String(index);
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === state.highlightedIndex));
      button.disabled = available <= 0;
      button.innerHTML = `
        <span class="pos-item-option-name"></span>
        <span class="pos-item-option-price"></span>
        <span class="pos-item-option-code"></span>
        <span class="pos-item-option-stock"></span>
      `;
      button.querySelector('.pos-item-option-name').textContent = item.name;
      button.querySelector('.pos-item-option-price').textContent = money(item.salePrice);
      button.querySelector('.pos-item-option-code').textContent = item.barcode || item.itemsCode || '';
      button.querySelector('.pos-item-option-stock').textContent = available > 0
        ? `In stock: ${available} ${item.unit}`
        : Number(item.stockQty || 0) <= 0 ? 'Out of stock' : 'All in cart';
      if (index === state.highlightedIndex) button.classList.add('is-highlighted');
      list.appendChild(button);
    }

    state.renderedSuggestionCount = end;
  }

  function renderItems() {
    const query = byId('itemSearch').value.trim().toLowerCase();
    const matching = state.items.filter((item) => {
      const haystack = [item.name, item.itemsCode, item.barcode].join(' ').toLowerCase();
      return haystack.includes(query);
    });
    matching.sort((left, right) => {
      const leftExact = [left.barcode, left.itemsCode].some((value) => value && String(value).toLowerCase() === query);
      const rightExact = [right.barcode, right.itemsCode].some((value) => value && String(value).toLowerCase() === query);
      if (leftExact !== rightExact) return leftExact ? -1 : 1;
      return left.name.localeCompare(right.name);
    });

    state.filteredItems = matching;
    state.renderedSuggestionCount = 0;
    byId('itemGrid').replaceChildren();
    byId('itemGrid').classList.toggle('is-open', state.suggestionsOpen && matching.length > 0);
    byId('emptyCatalog').classList.toggle('d-none', !state.suggestionsOpen || matching.length > 0);
    byId('itemSearch').setAttribute('aria-expanded', String(state.suggestionsOpen && matching.length > 0));
    byId('itemSearch').removeAttribute('aria-activedescendant');

    if (state.suggestionsOpen && matching.length > 0) {
      appendSuggestions();
    } else if (state.suggestionsOpen) {
      byId('emptyCatalog').textContent = state.items.length
        ? 'No active items match your search.'
        : 'No active items found.';
    }

    const itemCount = query ? matching.length : state.activeItemCount;
    byId('catalogStatus').textContent = query
      ? `${itemCount} matching active item${itemCount === 1 ? '' : 's'}`
      : `${state.activeItemCount} active warehouse item${state.activeItemCount === 1 ? '' : 's'}`;
  }

  function mergeItems(items) {
    const byIdMap = new Map(state.items.map((item) => [String(item._id), item]));
    items.forEach((item) => {
      if (item.isActive !== false) byIdMap.set(String(item._id), normalizeItem(item));
    });
    state.items = Array.from(byIdMap.values());
  }

  async function searchItems(query, requestId) {
    if (state.searchController) state.searchController.abort();
    const controller = new AbortController();
    state.searchController = controller;

    try {
      const params = new URLSearchParams({ search: query, limit: '1000' });
      const result = await apiRequest(`/api/v1/wh-items/pos-catalog?${params}`, { signal: controller.signal });
      if (requestId !== state.searchRequestId) return;
      mergeItems(result.data || []);
      renderItems();
    } catch (error) {
      if (error.name !== 'AbortError' && requestId === state.searchRequestId) {
        showMessage(`Search failed: ${error.message}`, 'error');
      }
    }
  }

  function queueSearch(query) {
    state.searchRequestId += 1;
    const requestId = state.searchRequestId;
    if (state.searchController) state.searchController.abort();
    window.clearTimeout(state.searchTimer);
    if (!query) return;
    state.searchTimer = window.setTimeout(() => searchItems(query, requestId), 120);
  }

  function setHighlightedIndex(index) {
    const enabledIndexes = state.filteredItems
      .map((item, itemIndex) => getAvailable(item) > 0 ? itemIndex : -1)
      .filter((itemIndex) => itemIndex >= 0);
    if (!enabledIndexes.length) return;
    const currentPosition = enabledIndexes.indexOf(state.highlightedIndex);
    const nextPosition = currentPosition < 0
      ? (index > 0 ? 0 : enabledIndexes.length - 1)
      : (currentPosition + index + enabledIndexes.length) % enabledIndexes.length;
    state.highlightedIndex = enabledIndexes[nextPosition];
    if (state.highlightedIndex >= state.renderedSuggestionCount) appendSuggestions();
    renderHighlight();
  }

  function renderHighlight() {
    byId('itemGrid').querySelectorAll('.pos-item-option').forEach((option) => {
      const selected = Number(option.dataset.index) === state.highlightedIndex;
      option.classList.toggle('is-highlighted', selected);
      option.setAttribute('aria-selected', String(selected));
      if (selected) {
        byId('itemSearch').setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function closeSuggestions() {
    state.suggestionsOpen = false;
    byId('itemGrid').classList.remove('is-open');
    byId('emptyCatalog').classList.add('d-none');
    byId('itemSearch').setAttribute('aria-expanded', 'false');
    byId('itemSearch').removeAttribute('aria-activedescendant');
  }

  function addItem(item) {
    if (getAvailable(item) <= 0) {
      showMessage(`${item.name} is out of stock.`, 'error');
      return;
    }
    const id = String(item._id);
    const current = state.cart.get(id);
    const quantity = (current?.quantity || 0) + 1;
    if (quantity > Number(item.stockQty || 0)) {
      showMessage(`Only ${item.stockQty || 0} ${item.unit || ''} available for ${item.name}.`, 'error');
      return;
    }
    state.cart.set(id, { item, quantity });
    showMessage('');
    renderCart();
    renderItems();
    byId('itemSearch').focus();
    byId('itemSearch').select();
  }

  function updateQuantity(id, value) {
    const line = state.cart.get(id);
    if (!line) return;
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      state.cart.delete(id);
    } else if (quantity > Number(line.item.stockQty || 0)) {
      showMessage(`Only ${line.item.stockQty || 0} ${line.item.unit || ''} available for ${line.item.name}.`, 'error');
      return;
    } else {
      line.quantity = quantity;
    }
    renderCart();
    renderItems();
  }

  function totals() {
    let subtotal = 0;
    let tax = 0;
    state.cart.forEach(({ item, quantity }) => {
      const amount = Number(item.salePrice || 0) * quantity;
      subtotal += amount;
      tax += amount * Number(item.taxPercent || 0) / 100;
    });
    subtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100;
    tax = Math.round((tax + Number.EPSILON) * 100) / 100;
    const discountPercent = Number(byId('posDiscountPercent').value || 0);
    const flatDiscount = Number(byId('posDiscountAmount').value || 0);
    const miscCharges = Number(byId('posMiscCharges').value || 0);
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
    const grandTotal = Math.round(Math.max(0, subtotal + tax - discountTotal + miscCharges) * 100) / 100;
    return { subtotal, tax, discountPercent, flatDiscount, percentageDiscount, discountTotal, miscCharges, grandTotal, adjustmentsValid };
  }

  function renderCart() {
    if (state.mode === 'return') {
      renderReturnCart();
      return;
    }

    const body = byId('cartRows');
    body.replaceChildren();
    if (state.cart.size === 0) {
      const row = body.insertRow();
      row.className = 'pos-cart-empty';
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.textContent = 'Scan or choose an item to add it here.';
    } else {
      state.cart.forEach(({ item, quantity }, id) => {
        const row = body.insertRow();
        const itemCell = row.insertCell();
        itemCell.innerHTML = '<span class="pos-line-name"></span><span class="pos-line-code"></span>';
        itemCell.querySelector('.pos-line-name').textContent = item.name;
        itemCell.querySelector('.pos-line-code').textContent = item.barcode || item.itemsCode || '';

        const qtyCell = row.insertCell();
        qtyCell.className = 'text-center';
        qtyCell.innerHTML = `
          <div class="pos-qty-control">
            <button type="button" aria-label="Decrease quantity">−</button>
            <input type="number" min="0.01" step="any" aria-label="Quantity">
            <button type="button" aria-label="Increase quantity">+</button>
          </div>`;
        const qtyInput = qtyCell.querySelector('input');
        qtyInput.value = String(quantity);
        qtyInput.addEventListener('change', () => updateQuantity(id, qtyInput.value));
        const [decrease, increase] = qtyCell.querySelectorAll('button');
        decrease.addEventListener('click', () => updateQuantity(id, quantity - 1));
        increase.addEventListener('click', () => updateQuantity(id, quantity + 1));

        const priceCell = row.insertCell();
        priceCell.className = 'text-end';
        priceCell.textContent = money(item.salePrice);
        const totalCell = row.insertCell();
        totalCell.className = 'text-end fw-semibold';
        totalCell.textContent = money(Number(item.salePrice || 0) * quantity);
        const removeCell = row.insertCell();
        removeCell.className = 'text-end';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pos-remove-line';
        remove.setAttribute('aria-label', `Remove ${item.name}`);
        remove.innerHTML = '<i class="fas fa-xmark"></i>';
        remove.addEventListener('click', () => updateQuantity(id, 0));
        removeCell.appendChild(remove);
      });
    }

    const saleTotals = totals();
    const { subtotal, tax, grandTotal, discountTotal, miscCharges, adjustmentsValid } = saleTotals;
    byId('subtotal').textContent = money(subtotal);
    byId('taxTotal').textContent = money(tax);
    byId('discountTotal').textContent = money(discountTotal);
    byId('discountTotalRow').classList.toggle('d-none', discountTotal <= 0);
    byId('miscChargesTotal').textContent = money(miscCharges);
    byId('adjustmentMessage').textContent = adjustmentsValid
      ? ''
      : discountTotal > subtotal
        ? 'Total discount cannot exceed the subtotal.'
        : 'Enter a valid discount and miscellaneous charge.';
    byId('grandTotal').textContent = money(grandTotal);
    if (!state.cashEdited) byId('cashReceived').value = grandTotal.toFixed(2);
    const tendered = Number(byId('cashReceived').value || 0);
    byId('changeDue').textContent = money(Math.max(0, tendered - grandTotal));
    byId('completeSale').disabled = state.cart.size === 0 || state.submitting || !adjustmentsValid || tendered < grandTotal;
    byId('clearCart').disabled = state.cart.size === 0 || state.submitting;
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
    const saleSubtotal = Number(state.returnInvoice?.subtotal || 0);
    const discountPercent = Number(state.returnInvoice?.discountPercent || 0);
    const flatDiscount = saleSubtotal > 0
      ? Math.round((Number(state.returnInvoice?.flatDiscount || 0) * subtotal / saleSubtotal + Number.EPSILON) * 100) / 100
      : 0;
    const percentDiscount = Math.round((subtotal * discountPercent / 100 + Number.EPSILON) * 100) / 100;
    const tax = saleSubtotal > 0
      ? Math.round((Number(state.returnInvoice?.taxAmount || 0) * subtotal / saleSubtotal + Number.EPSILON) * 100) / 100
      : 0;
    const refundTotal = Math.round(Math.max(0, subtotal - flatDiscount - percentDiscount + tax) * 100) / 100;
    return { subtotal, quantity, flatDiscount, percentDiscount, tax, refundTotal };
  }

  function renderReturnCart() {
    const body = byId('cartRows');
    body.replaceChildren();
    if (!state.returnInvoice) {
      const row = body.insertRow();
      row.className = 'pos-cart-empty';
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.textContent = 'Load a cash sale invoice to start a return.';
    } else if (!state.returnLines.length) {
      const row = body.insertRow();
      row.className = 'pos-cart-empty';
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.textContent = 'This invoice has no returnable items.';
    } else {
      state.returnLines.forEach((line) => {
        const row = body.insertRow();
        const itemCell = row.insertCell();
        itemCell.innerHTML = '<span class="pos-return-line-name"></span><span class="pos-return-line-code"></span>';
        itemCell.querySelector('.pos-return-line-name').textContent = line.name;
        itemCell.querySelector('.pos-return-line-code').textContent =
          `${line.barcode ? `${line.barcode} · ` : ''}Sold: ${line.quantitySold} · Returned / pending: ${line.quantityReturned} · Available: ${line.quantityRemaining}`;

        const qtyCell = row.insertCell();
        qtyCell.className = 'text-center';
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'pos-return-qty';
        qtyInput.min = '0';
        qtyInput.max = String(line.quantityRemaining);
        qtyInput.step = 'any';
        qtyInput.value = String(state.returnQuantities.get(line.item) || 0);
        qtyInput.disabled = line.quantityRemaining <= 0 || state.submitting;
        qtyInput.setAttribute('aria-label', `Return quantity for ${line.name}`);
        qtyInput.addEventListener('change', () => {
          const value = Number(qtyInput.value);
          if (!Number.isFinite(value) || value < 0 || value > line.quantityRemaining) {
            showMessage(`Return quantity for ${line.name} must be between 0 and ${line.quantityRemaining}.`, 'error');
            qtyInput.value = String(state.returnQuantities.get(line.item) || 0);
            return;
          }
          state.returnQuantities.set(line.item, value);
          showMessage('');
          renderCart();
        });
        qtyCell.appendChild(qtyInput);

        const priceCell = row.insertCell();
        priceCell.className = 'text-end';
        priceCell.textContent = money(line.pcsPrice);
        const totalCell = row.insertCell();
        totalCell.className = 'text-end fw-semibold';
        totalCell.textContent = money(Math.round((line.pcsPrice * Number(state.returnQuantities.get(line.item) || 0) + Number.EPSILON) * 100) / 100);
        row.insertCell();
      });
    }

    const { subtotal, quantity, flatDiscount, percentDiscount, tax, refundTotal } = returnTotals();
    byId('subtotalLabel').textContent = 'Returned items';
    byId('subtotal').textContent = money(subtotal);
    byId('taxTotal').textContent = money(tax);
    byId('taxTotalRow').classList.toggle('d-none', tax <= 0);
    byId('saleAdjustments').classList.add('d-none');
    byId('discountTotalRow').classList.toggle('d-none', flatDiscount + percentDiscount <= 0);
    byId('discountTotal').textContent = money(flatDiscount + percentDiscount);
    byId('miscChargesRow').classList.add('d-none');
    byId('grandTotalLabel').textContent = 'Cash refund';
    byId('grandTotal').textContent = money(refundTotal);
    byId('cashReceivedSection').classList.add('d-none');
    byId('completeSaleLabel').textContent = 'Post Sale Return & Print Credit Note';
    byId('completeSale').disabled = !state.returnInvoice || quantity <= 0 || refundTotal <= 0 || state.submitting;
    byId('clearCart').disabled = quantity <= 0 || state.submitting;
    byId('printLastLabel').textContent = 'Print Last Return';
  }

  function setMode(mode) {
    if (state.submitting && mode !== state.mode) return;
    state.mode = mode;
    const isReturn = mode === 'return';
    byId('posLayout').classList.toggle('is-return-mode', isReturn);
    byId('returnLookup').classList.toggle('d-none', !isReturn);
    byId('saleModeButton').classList.toggle('btn-light', !isReturn);
    byId('saleModeButton').classList.toggle('btn-outline-light', isReturn);
    byId('saleModeButton').setAttribute('aria-pressed', String(!isReturn));
    byId('returnModeButton').classList.toggle('btn-light', isReturn);
    byId('returnModeButton').classList.toggle('btn-outline-light', !isReturn);
    byId('returnModeButton').setAttribute('aria-pressed', String(isReturn));
    byId('cartTitle').textContent = isReturn ? 'Sale Return' : 'Current Sale';
    byId('quantityHeader').textContent = isReturn ? 'Return Qty' : 'Qty';
    byId('cartCustomer').textContent = isReturn
      ? `Customer: ${state.returnInvoice?.sale?.customer?.customerName || state.returnInvoice?.sale?.customer?.name || 'Load invoice'}`
      : 'Customer: Walk-in Customer';
    byId('completeSaleLabel').textContent = isReturn ? 'Post Sale Return & Print Credit Note' : 'Complete Sale & Print 80mm Receipt';
    byId('subtotalLabel').textContent = isReturn ? 'Returned items' : 'Subtotal';
    byId('saleAdjustments').classList.toggle('d-none', isReturn);
    byId('miscChargesRow').classList.toggle('d-none', isReturn);
    byId('cashReceivedSection').classList.toggle('d-none', isReturn);
    byId('taxTotalRow').classList.toggle('d-none', isReturn);
    byId('grandTotalLabel').textContent = isReturn ? 'Cash refund' : 'Total';
    byId('printLastLabel').textContent = isReturn ? 'Print Last Return' : 'Print Last Receipt';
    renderCart();
  }

  async function loadReturnInvoice() {
    const invoiceNo = byId('returnInvoiceNumber').value.trim();
    const status = byId('returnInvoiceStatus');
    if (!invoiceNo) {
      status.textContent = 'Enter a cash sale invoice number.';
      status.className = 'pos-return-status error';
      return;
    }

    status.textContent = 'Loading sale invoice…';
    status.className = 'pos-return-status';
    byId('loadReturnInvoice').disabled = true;
    try {
      const result = await apiRequest(`/api/v1/wh-sales/pos-return/invoice/${encodeURIComponent(invoiceNo)}`);
      state.returnInvoice = result.data;
      state.returnLines = result.data.items || [];
      state.returnQuantities.clear();
      byId('returnInvoiceDetails').innerHTML = '';
      byId('returnInvoiceDetails').textContent =
        `Invoice ${result.data.sale.invoiceNo} · ${new Date(result.data.sale.invoiceDate).toLocaleDateString()} · ` +
        `Total ${money(result.data.sale.netTotal)} · Returnable items ${state.returnLines.filter((line) => line.quantityRemaining > 0).length}`;
      byId('returnInvoiceDetails').classList.remove('d-none');
      status.textContent = state.returnLines.some((line) => line.quantityRemaining > 0)
        ? 'Invoice loaded. Enter the quantities being returned.'
        : 'This invoice has already been fully returned.';
      status.className = `pos-return-status${state.returnLines.some((line) => line.quantityRemaining > 0) ? '' : ' error'}`;
      setMode('return');
    } catch (error) {
      state.returnInvoice = null;
      state.returnLines = [];
      state.returnQuantities.clear();
      byId('returnInvoiceDetails').classList.add('d-none');
      status.textContent = error.message;
      status.className = 'pos-return-status error';
      renderCart();
    } finally {
      byId('loadReturnInvoice').disabled = false;
    }
  }

  function setListView(list) {
    state.activeList = list;
    byId('salesListPanel').classList.toggle('d-none', list !== 'sales');
    byId('returnsListPanel').classList.toggle('d-none', list !== 'returns');
    byId('posLayout').classList.toggle('is-list-view', Boolean(list));

    [['salesListButton', 'sales'], ['returnsListButton', 'returns']].forEach(([id, type]) => {
      const active = list === type;
      const button = byId(id);
      button.setAttribute('aria-expanded', String(active));
      button.querySelector('span').textContent = active
        ? 'Back to POS'
        : type === 'sales' ? 'Sales List' : 'Returns List';
      button.querySelector('i').className = active
        ? 'fas fa-cash-register me-1'
        : type === 'sales' ? 'fas fa-list me-1' : 'fas fa-arrow-rotate-left me-1';
    });
  }

  function createSalesListCell(row, value, className = '') {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = value == null || value === '' ? '—' : String(value);
    row.appendChild(cell);
    return cell;
  }

  function requestPOSPassword(action) {
    byId('posPasswordPrompt').textContent = `Enter your current login password to ${action}.`;
    byId('posPasswordInput').value = '';
    byId('posPasswordError').textContent = '';
    byId('posPasswordError').classList.add('d-none');
    return new Promise((resolve) => {
      state.passwordResolver = resolve;
      state.passwordModal.show();
    });
  }

  function renderSalesList(sales) {
    const rows = byId('salesListRows');
    rows.replaceChildren();
    if (!sales.length) {
      const row = document.createElement('tr');
      const cell = createSalesListCell(row, 'No POS invoices found.', 'text-center text-muted py-4');
      cell.colSpan = 10;
      rows.appendChild(row);
      return;
    }

    sales.forEach((sale) => {
      const row = document.createElement('tr');
      row.dataset.invoice = sale.invoiceNo || '';
      createSalesListCell(row, sale.invoiceNo);
      const customer = sale.customer?.customerName || sale.customer?.name || sale.customerName;
      createSalesListCell(row, customer || 'Walk-in Customer');
      createSalesListCell(row, sale.invoiceDate ? new Date(sale.invoiceDate).toLocaleDateString() : '—');
      createSalesListCell(row, sale.status || 'Posted');
      createSalesListCell(row, money(sale.netTotal), 'text-end');
      createSalesListCell(row, sale.createdBy?.name || '—');
      createSalesListCell(row, sale.remarks || '—');
      createSalesListCell(row, sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '—');
      createSalesListCell(row, money(sale.totalReturned), 'text-end');

      const actions = document.createElement('td');
      actions.className = 'pos-sales-list-actions';
      const print = document.createElement('button');
      print.type = 'button';
      print.className = 'btn btn-sm btn-outline-secondary';
      print.dataset.action = 'print';
      print.dataset.id = sale._id;
      print.title = 'View or print invoice';
      print.setAttribute('aria-label', `View or print ${sale.invoiceNo}`);
      print.innerHTML = '<i class="fas fa-print"></i>';
      const returnButton = document.createElement('button');
      returnButton.type = 'button';
      returnButton.className = 'btn btn-sm btn-primary';
      returnButton.dataset.action = 'return';
      returnButton.dataset.invoice = sale.invoiceNo || '';
      returnButton.textContent = 'Return';
      actions.append(print, returnButton);
      row.appendChild(actions);
      rows.appendChild(row);
    });
  }

  async function loadSalesList() {
    const requestId = ++state.salesListRequestId;
    const status = byId('salesListStatus');
    status.textContent = 'Loading invoices…';
    byId('salesListRows').replaceChildren();
    const query = new URLSearchParams({
      page: String(state.salesListPage),
      limit: '50',
      search: byId('salesListSearch').value.trim()
    });
    const startDate = byId('salesListStartDate').value;
    const endDate = byId('salesListEndDate').value;
    if (startDate) query.set('startDate', startDate);
    if (endDate) query.set('endDate', endDate);

    try {
      const result = await apiRequest(`/api/v1/wh-sales/pos/list?${query}`);
      if (requestId !== state.salesListRequestId) return;
      const sales = result.data || [];
      renderSalesList(sales);
      state.salesListPages = Number(result.pagination?.pages || 0);
      const total = Number(result.pagination?.total || 0);
      status.textContent = `${total} invoice${total === 1 ? '' : 's'}`;
      byId('salesListPageStatus').textContent = total
        ? `Page ${state.salesListPage} of ${state.salesListPages}`
        : '';
      byId('salesListPrev').disabled = state.salesListPage <= 1;
      byId('salesListNext').disabled = state.salesListPage >= state.salesListPages;
    } catch (error) {
      if (requestId !== state.salesListRequestId) return;
      status.textContent = 'Could not load invoices.';
      byId('salesListPageStatus').textContent = error.message;
      const row = document.createElement('tr');
      const cell = createSalesListCell(row, `Could not load invoices: ${error.message}`, 'text-center text-danger py-4');
      cell.colSpan = 10;
      byId('salesListRows').replaceChildren(row);
    }
  }

  function renderReturnsList(returns) {
    const rows = byId('returnsListRows');
    rows.replaceChildren();
    if (!returns.length) {
      const row = document.createElement('tr');
      const cell = createSalesListCell(row, 'No sale returns found.', 'text-center text-muted py-4');
      cell.colSpan = 10;
      rows.appendChild(row);
      return;
    }

    returns.forEach((saleReturn) => {
      const row = document.createElement('tr');
      createSalesListCell(row, saleReturn.returnNo);
      createSalesListCell(row, saleReturn.originalSale?.invoiceNo || '—');
      createSalesListCell(
        row,
        saleReturn.customer?.customerName || saleReturn.customer?.name || 'Walk-in Customer'
      );
      createSalesListCell(row, saleReturn.returnDate
        ? new Date(saleReturn.returnDate).toLocaleDateString()
        : '—');
      const statusLabel = saleReturn.status === 'Cancelled' ? 'Rejected' : saleReturn.status || 'Posted';
      const status = createSalesListCell(row, statusLabel);
      status.classList.add(saleReturn.status === 'Posted' ? 'text-success' :
        saleReturn.status === 'Pending Approval' ? 'text-warning' :
          saleReturn.status === 'Cancelled' ? 'text-danger' : 'text-muted');
      createSalesListCell(row, money(saleReturn.netTotal), 'text-end');
      createSalesListCell(row, saleReturn.createdBy?.name || '—');
      createSalesListCell(row, saleReturn.reviewedBy?.name || '—');
      createSalesListCell(row, saleReturn.reviewRemarks || saleReturn.remarks || '—');

      const actions = document.createElement('td');
      actions.className = 'pos-sales-list-actions';
      const print = document.createElement('button');
      print.type = 'button';
      print.className = 'btn btn-sm btn-outline-secondary';
      print.dataset.action = 'print-return';
      print.dataset.id = saleReturn._id;
      print.title = saleReturn.status === 'Posted' ? 'View or print return' : 'Only posted returns can be printed';
      print.setAttribute('aria-label', `View or print return ${saleReturn.returnNo || ''}`);
      print.disabled = saleReturn.status !== 'Posted';
      print.innerHTML = '<i class="fas fa-print"></i>';
      actions.appendChild(print);
      row.appendChild(actions);
      rows.appendChild(row);
    });
  }

  async function loadReturnsList() {
    const requestId = ++state.returnsListRequestId;
    const status = byId('returnsListStatus');
    status.textContent = 'Loading sale returns…';
    byId('returnsListRows').replaceChildren();
    const query = new URLSearchParams({
      page: String(state.returnsListPage),
      limit: '50',
      search: byId('returnsListSearch').value.trim(),
      status: byId('returnsListStatusFilter').value
    });
    const startDate = byId('returnsListStartDate').value;
    const endDate = byId('returnsListEndDate').value;
    if (startDate) query.set('startDate', startDate);
    if (endDate) query.set('endDate', endDate);

    try {
      const result = await apiRequest(`/api/v1/wh-sales/pos/returns?${query}`);
      if (requestId !== state.returnsListRequestId) return;
      const returns = result.data || [];
      renderReturnsList(returns);
      state.returnsListPages = Number(result.pagination?.pages || 0);
      const total = Number(result.pagination?.total || 0);
      status.textContent = `${total} return${total === 1 ? '' : 's'}`;
      byId('returnsListPageStatus').textContent = total
        ? `Page ${state.returnsListPage} of ${state.returnsListPages}`
        : '';
      byId('returnsListPrev').disabled = state.returnsListPage <= 1;
      byId('returnsListNext').disabled = state.returnsListPage >= state.returnsListPages;
    } catch (error) {
      if (requestId !== state.returnsListRequestId) return;
      status.textContent = 'Could not load sale returns.';
      byId('returnsListPageStatus').textContent = error.message;
      const row = document.createElement('tr');
      const cell = createSalesListCell(row, `Could not load sale returns: ${error.message}`, 'text-center text-danger py-4');
      cell.colSpan = 10;
      byId('returnsListRows').replaceChildren(row);
    }
  }

  async function addScannedCode(code) {
    const exactMatch = state.items.find((item) =>
      [item.barcode, item.itemsCode].some((value) => value && String(value).toLowerCase() === code.toLowerCase())
    );
    if (exactMatch) {
      addItem(exactMatch);
      return;
    }

    try {
      const params = new URLSearchParams({ search: code, limit: '1000' });
      const result = await apiRequest(`/api/v1/wh-items/pos-catalog?${params}`);
      const item = (result.data || []).find((candidate) =>
        [candidate.barcode, candidate.itemsCode].some((value) =>
          value && String(value).toLowerCase() === code.toLowerCase()
        )
      );
      if (!item || item.isActive === false) throw new Error('Item is unavailable.');
      const normalizedItem = normalizeItem(item);
      const existing = state.items.find((candidate) => String(candidate._id) === String(item._id));
      if (existing) {
        addItem(existing);
      } else {
        state.items.unshift(normalizedItem);
        addItem(normalizedItem);
      }
    } catch (error) {
      showMessage(error.message || `No item found for barcode ${code}.`, 'error');
      byId('itemSearch').select();
    }
  }

  async function completeReturn() {
    const { quantity } = returnTotals();
    if (state.submitting || !state.returnInvoice || quantity <= 0) return;

    state.submitting = true;
    renderCart();
    let password = '';
    try {
      password = await requestPOSPassword('post this sale return');
      if (!password) {
        return;
      }
      showMessage('Submitting return request for admin approval…');
      const result = await apiRequest('/api/v1/wh-sales/pos-return', {
        method: 'POST',
        body: JSON.stringify({
          originalSaleId: state.returnInvoice.sale._id,
          password,
          items: Array.from(state.returnQuantities, ([item, returnQuantity]) => ({ item, quantity: returnQuantity }))
            .filter((line) => line.quantity > 0)
        })
      });
      password = '';
      const saleReturn = result.data;
      state.lastPrintUrl = '';
      byId('printLastSale').classList.add('d-none');
      const returnedQuantities = new Map(state.returnQuantities);
      state.returnLines = state.returnLines.map((line) => {
        const returned = returnedQuantities.get(line.item) || 0;
        return {
          ...line,
          quantityReturned: Number(line.quantityReturned || 0) + returned,
          quantityRemaining: Math.max(0, Number(line.quantityRemaining || 0) - returned)
        };
      });
      state.returnQuantities.clear();
      showMessage(`Return ${saleReturn.returnNo} submitted for admin approval. Inventory will update after approval.`, 'success');
      byId('returnInvoiceStatus').textContent = state.returnLines.some((line) => line.quantityRemaining > 0)
        ? `Return request ${saleReturn.returnNo} is awaiting admin approval. Remaining quantities are reserved for this request.`
        : `Return request ${saleReturn.returnNo} is awaiting admin approval.`;
      byId('returnInvoiceStatus').className = 'pos-return-status';
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      password = '';
      state.submitting = false;
      renderCart();
    }
  }

  async function completeSale() {
    if (state.submitting || state.cart.size === 0) return;
    const saleTotals = totals();
    const { grandTotal, adjustmentsValid } = saleTotals;
    if (!adjustmentsValid) {
      showMessage(byId('adjustmentMessage').textContent, 'error');
      return;
    }
    const cashReceived = Number(byId('cashReceived').value);
    if (!Number.isFinite(cashReceived) || cashReceived < grandTotal) {
      showMessage('Cash received must be at least the sale total.', 'error');
      return;
    }

    state.submitting = true;
    renderCart();
    const printWindow = window.open('about:blank', '_blank');
    let password = '';
    try {
      password = await requestPOSPassword('post this sale');
      if (!password) {
        if (printWindow && !printWindow.closed) printWindow.close();
        return;
      }
      showMessage('Saving sale and updating stock…');
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
          if (current.stock?.length) current.stock[0].quantity = current.stockQty;
        }
      });
      state.cart.clear();
      state.cashEdited = false;
      resetAdjustments();
      renderCart();
      renderItems();
      showMessage(`Sale ${sale.invoiceNo} saved. Opening the 80mm receipt…`, 'success');

      if (printWindow && !printWindow.closed) {
        printWindow.location.href = printUrl;
      } else {
        showMessage(`Sale ${sale.invoiceNo} saved. Use “Print Last Receipt” to print it.`, 'success');
      }
      byId('itemSearch').focus();
    } catch (error) {
      if (printWindow && !printWindow.closed) printWindow.close();
      showMessage(error.message, 'error');
    } finally {
      password = '';
      state.submitting = false;
      renderCart();
    }
  }

  function resetAdjustments() {
    byId('posDiscountPercent').value = '0';
    byId('posDiscountAmount').value = '0.00';
    byId('posMiscCharges').value = '0.00';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const passwordModalElement = byId('posPasswordModal');
    state.passwordModal = bootstrap.Modal.getOrCreateInstance(passwordModalElement, {
      backdrop: 'static',
      keyboard: false
    });
    passwordModalElement.addEventListener('shown.bs.modal', () => byId('posPasswordInput').focus());
    passwordModalElement.addEventListener('hidden.bs.modal', () => {
      if (state.passwordResolver) {
        state.passwordResolver(null);
        state.passwordResolver = null;
      }
      byId('posPasswordInput').value = '';
    });
    byId('posPasswordForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const password = byId('posPasswordInput').value;
      if (!password || !state.passwordResolver) return;
      const resolvePassword = state.passwordResolver;
      state.passwordResolver = null;
      resolvePassword(password);
      state.passwordModal.hide();
    });

    let user = {};
    try {
      user = JSON.parse(localStorage.getItem('user') || '{}');
    } catch (error) {
      console.error('Unable to read the current user profile.', error);
    }
    byId('cashierName').textContent = user.name || user.email || 'Cashier';
    byId('printLastLabel').textContent = 'Print Last Receipt';
    byId('saleModeButton').addEventListener('click', () => setMode('sale'));
    byId('returnModeButton').addEventListener('click', () => setMode('return'));
    byId('salesListButton').addEventListener('click', () => {
      const list = state.activeList === 'sales' ? null : 'sales';
      setListView(list);
      if (list) loadSalesList();
    });
    byId('returnsListButton').addEventListener('click', () => {
      const list = state.activeList === 'returns' ? null : 'returns';
      setListView(list);
      if (list) loadReturnsList();
    });
    byId('refreshSalesList').addEventListener('click', () => {
      state.salesListPage = 1;
      loadSalesList();
    });
    byId('salesListSearch').addEventListener('input', () => {
      window.clearTimeout(state.salesListTimer);
      state.salesListTimer = window.setTimeout(() => {
        state.salesListPage = 1;
        loadSalesList();
      }, 250);
    });
    ['salesListStartDate', 'salesListEndDate'].forEach((id) => {
      byId(id).addEventListener('change', () => {
        state.salesListPage = 1;
        loadSalesList();
      });
    });
    byId('salesListPrev').addEventListener('click', () => {
      if (state.salesListPage > 1) {
        state.salesListPage -= 1;
        loadSalesList();
      }
    });
    byId('salesListNext').addEventListener('click', () => {
      if (state.salesListPage < state.salesListPages) {
        state.salesListPage += 1;
        loadSalesList();
      }
    });
    byId('salesListRows').addEventListener('click', (event) => {
      const action = event.target.closest('button[data-action]');
      if (!action) return;
      if (action.dataset.action === 'print') {
        const url = `/print-invoice?type=wh-sale&id=${encodeURIComponent(action.dataset.id)}&format=thermal`;
        window.open(url, '_blank', 'noopener');
      } else if (action.dataset.action === 'return' && action.dataset.invoice) {
        setListView(null);
        setMode('return');
        byId('returnInvoiceNumber').value = action.dataset.invoice;
        loadReturnInvoice();
      }
    });
    byId('returnsListSearch').addEventListener('input', () => {
      window.clearTimeout(state.returnsListTimer);
      state.returnsListTimer = window.setTimeout(() => {
        state.returnsListPage = 1;
        loadReturnsList();
      }, 250);
    });
    ['returnsListStartDate', 'returnsListEndDate', 'returnsListStatusFilter'].forEach((id) => {
      byId(id).addEventListener('change', () => {
        state.returnsListPage = 1;
        loadReturnsList();
      });
    });
    byId('refreshReturnsList').addEventListener('click', () => {
      state.returnsListPage = 1;
      loadReturnsList();
    });
    byId('returnsListPrev').addEventListener('click', () => {
      if (state.returnsListPage > 1) {
        state.returnsListPage -= 1;
        loadReturnsList();
      }
    });
    byId('returnsListNext').addEventListener('click', () => {
      if (state.returnsListPage < state.returnsListPages) {
        state.returnsListPage += 1;
        loadReturnsList();
      }
    });
    byId('returnsListRows').addEventListener('click', (event) => {
      const action = event.target.closest('button[data-action="print-return"]');
      if (!action || action.disabled) return;
      const url = `/wh-print?type=sale-return&id=${encodeURIComponent(action.dataset.id)}`;
      window.open(url, '_blank', 'noopener');
    });
    byId('loadReturnInvoice').addEventListener('click', loadReturnInvoice);
    byId('returnInvoiceNumber').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadReturnInvoice();
      }
    });
    byId('returnInvoiceNumber').addEventListener('input', () => {
      if (state.returnInvoice && byId('returnInvoiceNumber').value.trim() !== state.returnInvoice.sale.invoiceNo) {
        state.returnInvoice = null;
        state.returnLines = [];
        state.returnQuantities.clear();
        byId('returnInvoiceDetails').classList.add('d-none');
        byId('returnInvoiceStatus').textContent = 'Load the entered invoice before selecting return quantities.';
        byId('returnInvoiceStatus').className = 'pos-return-status';
        renderCart();
      }
    });

    const itemSearch = byId('itemSearch');
    itemSearch.addEventListener('focus', () => {
      state.suggestionsOpen = true;
      state.highlightedIndex = -1;
      renderItems();
    });
    itemSearch.addEventListener('input', () => {
      state.suggestionsOpen = true;
      state.highlightedIndex = -1;
      showMessage('');
      renderItems();
      queueSearch(itemSearch.value.trim());
    });
    byId('itemSearch').addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        state.suggestionsOpen = true;
        renderItems();
        setHighlightedIndex(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const code = itemSearch.value.trim();
        if (!code) return;
        const exactMatch = state.items.find((item) =>
          [item.barcode, item.itemsCode].some((value) => value && String(value).toLowerCase() === code.toLowerCase())
        );
        if (exactMatch) {
          addItem(exactMatch);
          return;
        }
        if (state.highlightedIndex >= 0) {
          addItem(state.filteredItems[state.highlightedIndex]);
          return;
        }
        if (!/^\d+$/.test(code)) {
          const firstAvailable = state.filteredItems.find((item) => getAvailable(item) > 0);
          if (firstAvailable) {
            addItem(firstAvailable);
            return;
          }
        }
        addScannedCode(code);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSuggestions();
      }
    });
    byId('itemGrid').addEventListener('click', (event) => {
      const option = event.target.closest('.pos-item-option');
      if (!option || option.disabled) return;
      const item = state.filteredItems[Number(option.dataset.index)];
      if (item) addItem(item);
    });
    byId('itemGrid').addEventListener('scroll', () => {
      const list = byId('itemGrid');
      if (list.scrollHeight - list.scrollTop - list.clientHeight < 80) appendSuggestions();
    });
    byId('itemGrid').addEventListener('pointerdown', (event) => {
      if (event.target.closest('.pos-item-option')) event.preventDefault();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.pos-search-row')) closeSuggestions();
    });
    byId('cashReceived').addEventListener('input', () => {
      state.cashEdited = true;
      renderCart();
    });
    ['posDiscountPercent', 'posDiscountAmount', 'posMiscCharges'].forEach((id) => {
      byId(id).addEventListener('input', renderCart);
    });
    byId('completeSale').addEventListener('click', () => {
      if (state.mode === 'return') completeReturn();
      else completeSale();
    });
    byId('clearCart').addEventListener('click', () => {
      if (state.mode === 'return') {
        state.returnQuantities.clear();
      } else {
        state.cart.clear();
        state.cashEdited = false;
        resetAdjustments();
      }
      showMessage('');
      renderCart();
      renderItems();
      if (state.mode === 'sale') byId('itemSearch').focus();
    });
    byId('refreshItems').addEventListener('click', loadItems);
    byId('printLastSale').addEventListener('click', (event) => {
      if (!state.lastPrintUrl) event.preventDefault();
    });

    renderCart();
    setMode('sale');
    loadItems();
    itemSearch.focus();
  });
})();
