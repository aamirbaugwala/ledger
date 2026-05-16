// ═══════════════════════════════════════════════════════════
//  stock.js — Stock page (table/card view) + Add/Edit/Sell modals
// ═══════════════════════════════════════════════════════════

let _stockView = 'table';   // 'table' | 'cards'
let _stockSort  = { col: 'goat_id', dir: 'asc' };
let _stockFilter = '';     // '' | 'available' | 'booked'

// ── Multi-select state ──────────────────────────────────────
let _selectedStockIds = new Set();

function _toggleSelectGoat(id) {
  id = parseInt(id);
  if (_selectedStockIds.has(id)) _selectedStockIds.delete(id);
  else _selectedStockIds.add(id);
  const row = document.querySelector(`tr[data-gid="${id}"]`);
  if (row) row.classList.toggle('row-selected', _selectedStockIds.has(id));
  const card = document.querySelector(`.stk-card[data-gid="${id}"]`);
  if (card) card.classList.toggle('stk-selected', _selectedStockIds.has(id));
  _syncHeaderCheckbox();
  _updateBulkBar();
}

function _selectAllStock(checked) {
  document.querySelectorAll('.stk-row-cb').forEach(cb => {
    const id = parseInt(cb.dataset.id);
    if (checked) _selectedStockIds.add(id);
    else _selectedStockIds.delete(id);
    cb.checked = checked;
  });
  document.querySelectorAll('tr[data-gid]').forEach(r => r.classList.toggle('row-selected', checked));
  document.querySelectorAll('.stk-card[data-gid]').forEach(c => c.classList.toggle('stk-selected', checked));
  _updateBulkBar();
}

function _syncHeaderCheckbox() {
  const cbs = document.querySelectorAll('.stk-row-cb');
  const hdr = document.getElementById('stkSelectAll');
  if (!hdr || !cbs.length) return;
  const all  = [...cbs].every(cb => _selectedStockIds.has(parseInt(cb.dataset.id)));
  const some = [...cbs].some(cb  => _selectedStockIds.has(parseInt(cb.dataset.id)));
  hdr.checked       = all;
  hdr.indeterminate = some && !all;
}

function _clearStockSelection() {
  _selectedStockIds.clear();
  document.querySelectorAll('.stk-row-cb').forEach(cb => cb.checked = false);
  document.querySelectorAll('tr[data-gid]').forEach(r => r.classList.remove('row-selected'));
  document.querySelectorAll('.stk-card[data-gid]').forEach(c => c.classList.remove('stk-selected'));
  const hdr = document.getElementById('stkSelectAll');
  if (hdr) { hdr.checked = false; hdr.indeterminate = false; }
  _updateBulkBar();
}

function _updateBulkBar() {
  const bar = document.getElementById('stockBulkBar');
  if (!bar) return;
  const n = _selectedStockIds.size;
  if (n === 0) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');
  const countEl = bar.querySelector('.bulk-bar-count');
  if (countEl) countEl.textContent = `${n} goat${n > 1 ? 's' : ''} selected`;
}

async function _bulkDeleteSelected() {
  const n = _selectedStockIds.size;
  if (!n) return;
  if (!confirm(`Delete ${n} selected goat${n > 1 ? 's' : ''}? This cannot be undone.`)) return;
  const ids = [..._selectedStockIds];
  let ok = 0, fail = 0;
  for (const id of ids) {
    const res = await fetch(`/api/goats/${id}`, { method: 'DELETE' });
    if (res.ok) ok++; else fail++;
  }
  _selectedStockIds.clear();
  showToast(fail ? `${ok} deleted, ${fail} failed` : `🗑 ${ok} goat${ok > 1 ? 's' : ''} deleted`, fail ? 'warning' : 'success');
  await loadStock();
  loadDashboard();
}

function _bulkExportStockCSV() {
  const n = _selectedStockIds.size;
  if (!n) return;
  const selected = allStock.filter(g => _selectedStockIds.has(g.id));
  const headers = ['Goat ID','Breed','Purchase Date','Buy Weight (kg)','Cost Price (₹)','Extra Costs (₹)',
                   'Total Cost (₹)','Rate/kg (exp. wt)','Status','Added By','Notes'];
  const rows = selected.map(g => {
    const totalCost = parseFloat(g.cost_price || 0) + parseFloat(g.extra_costs || 0);
    const expWt     = parseFloat(g.weight_kg || 0) * 0.95;
    const rate      = expWt > 0 ? Math.round(totalCost / expWt) : 0;
    const purchDate = g.purchase_date ? String(g.purchase_date).slice(0,10) : '';
    return [g.goat_id, g.breed || '', purchDate, g.weight_kg,
            parseFloat(g.cost_price || 0).toFixed(0), parseFloat(g.extra_costs || 0).toFixed(0),
            totalCost.toFixed(0), rate, g.status, g.added_by || '', g.notes || '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `stock-${today()}.csv`;
  a.click();
  showToast(`⬇ Exported ${n} goat${n > 1 ? 's' : ''} as CSV`, 'success', 2000);
}

// ── Sort helpers ────────────────────────────────────────────
function _setStockSort(col) {
  if (_stockSort.col === col) {
    _stockSort.dir = _stockSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _stockSort.col = col;
    _stockSort.dir = col === 'weight_kg' || col === 'total_cost' || col === 'rate_kg' ? 'desc' : 'asc';
  }
  filterStock();
}

function _stockSortIcon(col) {
  if (_stockSort.col !== col) return `<span class="sort-icon">↕</span>`;
  return `<span class="sort-icon active">${_stockSort.dir === 'asc' ? '↑' : '↓'}</span>`;
}

function _sortStockGoats(goats) {
  const { col, dir } = _stockSort;
  return [...goats].sort((a, b) => {
    let va, vb;
    if (col === 'total_cost') {
      va = parseFloat(a.cost_price || 0) + parseFloat(a.extra_costs || 0);
      vb = parseFloat(b.cost_price || 0) + parseFloat(b.extra_costs || 0);
    } else if (col === 'rate_kg') {
      const expA = parseFloat(a.weight_kg || 0) * 0.95;
      const expB = parseFloat(b.weight_kg || 0) * 0.95;
      const costA = parseFloat(a.cost_price || 0) + parseFloat(a.extra_costs || 0);
      const costB = parseFloat(b.cost_price || 0) + parseFloat(b.extra_costs || 0);
      va = expA > 0 ? costA / expA : 0;
      vb = expB > 0 ? costB / expB : 0;
    } else if (col === 'weight_kg') {
      va = parseFloat(a.weight_kg || 0);
      vb = parseFloat(b.weight_kg || 0);
    } else if (col === 'status') {
      va = a.status || ''; vb = b.status || '';
    } else {
      va = (a[col] || '').toString().toLowerCase();
      vb = (b[col] || '').toString().toLowerCase();
    }
    if (va < vb) return dir === 'asc' ? -1 :  1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

// ── Load & filter ───────────────────────────────────────────
async function loadStock() {
  _selectedStockIds.clear();
  _updateBulkBar();
  const el = document.getElementById('stockList');
  el.className = '';
  el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">
    <div style="font-size:2rem;margin-bottom:10px">🐐</div>
    <div>Loading stock…</div>
  </div>`;
  allStock = await api('/api/goats?status=available') || [];
  renderStock(allStock);
  updateNavBadge('stock', allStock.length);
}

function filterStock() {
  const q = document.getElementById('stockSearch').value.toLowerCase();
  const statusFilter = document.getElementById('stockFilterStatus')?.value || '';
  let filtered = allStock.filter(g =>
    g.goat_id.toLowerCase().includes(q) ||
    (g.breed  || '').toLowerCase().includes(q) ||
    (g.notes  || '').toLowerCase().includes(q)
  );
  if (statusFilter) filtered = filtered.filter(g => g.status === statusFilter);
  renderStock(_sortStockGoats(filtered));
}

function toggleStockView() {
  _stockView = _stockView === 'table' ? 'cards' : 'table';
  const btn = document.getElementById('stockViewToggle');
  if (btn) btn.textContent = _stockView === 'table' ? '🃏 Cards View' : '📋 Table View';
  filterStock();
}

function renderStock(goats) {
  const el = document.getElementById('stockList');
  if (!goats.length) {
    el.className = '';
    el.innerHTML = `
      <div class="empty-state">
        <span class="ei">🐐</span>
        <h3>No goats in stock</h3>
        <p>Add your first goat to get started</p>
        <button class="btn btn-primary" onclick="openAddModal()">＋ Add Goat</button>
      </div>`;
    return;
  }
  if (_stockView === 'table') {
    el.className = '';
    renderStockTable(goats);
  } else {
    el.className = '';
    renderStockCards(goats);
  }
}

// ── Stock Table View (actual HTML table) ────────────────────
function renderStockTable(goats) {
  const el = document.getElementById('stockList');

  const totalInvested  = goats.reduce((s, g) => s + parseFloat(g.cost_price || 0) + parseFloat(g.extra_costs || 0), 0);
  const totalBuyWt     = goats.reduce((s, g) => s + parseFloat(g.weight_kg || 0), 0);
  const totalExpWt     = goats.reduce((s, g) => s + parseFloat(g.weight_kg || 0) * 0.95, 0);
  const availableCount = goats.filter(g => g.status === 'available').length;
  const bookedCount    = goats.filter(g => g.status === 'booked').length;
  const bookedPending  = goats.filter(g => g.status === 'booked')
                              .reduce((s, g) => s + parseFloat(g.selling_price || 0) - parseFloat(g.advance_amount || 0), 0);

  const rows = goats.map(g => {
    const totalCost = parseFloat(g.cost_price || 0) + parseFloat(g.extra_costs || 0);
    const buyWt     = parseFloat(g.weight_kg || 0);
    const expWt     = (buyWt * 0.95).toFixed(1);
    const ratePerKg = parseFloat(expWt) > 0 ? Math.round(totalCost / parseFloat(expWt)) : 0;
    const isBooked  = g.status === 'booked';
    const advance   = parseFloat(g.advance_amount || 0);
    const remaining = isBooked ? parseFloat(g.selling_price || 0) - advance : 0;
    const isSelected = _selectedStockIds.has(g.id);

    const tagCell = `
      <span class="goat-tag-sm">🐐 ${esc(g.goat_id)}</span>
      ${g.breed ? `<span class="stc-sub">${esc(g.breed)}</span>` : ''}
      ${g.purchase_date ? `<span class="stc-sub" style="color:var(--text-3);font-size:0.7rem">📅 ${String(g.purchase_date).slice(0,10)}</span>` : ''}`;

    const wtCell    = `<span class="stc-main">${buyWt} kg</span>`;
    const expWtCell = `<span class="stc-main stk-amber">${expWt} kg</span><span class="stc-sub">×95%</span>`;

    const costCell = `
      <span class="stc-main">₹${fmt(totalCost)}</span>
      ${parseFloat(g.extra_costs) > 0
        ? `<span class="stc-sub">Base ₹${fmt(g.cost_price)} + ₹${fmt(g.extra_costs)}</span>`
        : `<span class="stc-sub">₹${fmt(g.cost_price)}</span>`}`;

    const rateCell = `
      <span class="stc-main stk-blue">₹${fmt(ratePerKg)}/kg</span>
      <span class="stc-sub">on exp. wt</span>`;

    let statusCell;
    if (isBooked) {
      statusCell = `<span class="st-badge st-booked">⏳ Booked</span>
        <div style="margin-top:4px">
          <span class="stc-sub">Adv ₹${fmt(advance)}</span>
          <span class="stc-sub pay-due">₹${fmt(remaining)} due</span>
        </div>`;
    } else {
      statusCell = `<span class="st-badge st-avail">✅ Available</span>
        ${g.added_by ? `<span class="stc-sub" style="margin-top:3px">by ${esc(g.added_by)}</span>` : ''}`;
    }

    const actions = isBooked
      ? `<button class="btn btn-primary btn-sm" onclick="openFinalizeModal(${g.id})" title="Collect">💳</button>
         <button class="btn btn-wa     btn-sm" onclick="sendWhatsApp(${g.id})"       title="WhatsApp">📱</button>
         <button class="btn btn-gray   btn-sm" onclick="undoSale(${g.id}, this)"     title="Undo">↩</button>
         <button class="btn btn-gray   btn-sm" onclick="viewGoat(${g.id})"           title="View">👁</button>`
      : `<button class="btn btn-primary btn-sm" onclick="openSellModal(${g.id})"     title="Sell">💰 Sell</button>
         <button class="btn btn-gray   btn-sm" onclick="openEditModal(${g.id})"      title="Edit">✏️</button>
         <button class="btn btn-gray   btn-sm" onclick="viewGoat(${g.id})"           title="View">👁</button>
         <button class="btn btn-danger btn-sm" onclick="deleteGoat(${g.id}, 'stock')" title="Delete">🗑</button>`;

    return `<tr class="${isBooked ? 'row-booked' : ''}${isSelected ? ' row-selected' : ''}" data-gid="${g.id}">
      <td class="stk-cb-cell" onclick="_toggleSelectGoat(${g.id})">
        <input type="checkbox" class="stk-row-cb" data-id="${g.id}" ${isSelected ? 'checked' : ''}
          onclick="event.stopPropagation();_toggleSelectGoat(${g.id})" />
      </td>
      <td>${tagCell}</td>
      <td>${wtCell}</td>
      <td>${expWtCell}</td>
      <td>${costCell}</td>
      <td>${rateCell}</td>
      <td>${statusCell}</td>
      <td><div class="tbl-actions">${actions}</div></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="sales-summary-bar" style="margin-bottom:12px">
      <div class="ssb-item"><span class="ssb-label">Total</span><span class="ssb-val">${goats.length}</span></div>
      <div class="ssb-item"><span class="ssb-label">Available</span><span class="ssb-val">${availableCount}</span></div>
      <div class="ssb-item ssb-warn"><span class="ssb-label">⏳ Booked</span><span class="ssb-val">${bookedCount}${bookedPending > 0 ? ` · ₹${fmt(bookedPending)} due` : ''}</span></div>
      <div class="ssb-item"><span class="ssb-label">Buy Wt</span><span class="ssb-val">${totalBuyWt.toFixed(1)} kg</span></div>
      <div class="ssb-item"><span class="ssb-label">Exp. Wt</span><span class="ssb-val">${totalExpWt.toFixed(1)} kg</span></div>
      <div class="ssb-item"><span class="ssb-label">Invested</span><span class="ssb-val">₹${fmt(totalInvested)}</span></div>
    </div>
    <div class="sales-table-wrap">
      <table class="sales-table">
        <thead>
          <tr>
            <th class="stk-cb-cell">
              <input type="checkbox" id="stkSelectAll" title="Select all"
                onchange="_selectAllStock(this.checked)" />
            </th>
            <th onclick="_setStockSort('goat_id')" class="sortable">Tag / Breed ${_stockSortIcon('goat_id')}</th>
            <th onclick="_setStockSort('weight_kg')" class="sortable num">Buy Wt ${_stockSortIcon('weight_kg')}</th>
            <th onclick="_setStockSort('weight_kg')" class="sortable num">Exp. Wt ${_stockSortIcon('weight_kg')}</th>
            <th onclick="_setStockSort('total_cost')" class="sortable num">Total Cost ${_stockSortIcon('total_cost')}</th>
            <th onclick="_setStockSort('rate_kg')" class="sortable num">Rate/kg <small style="font-weight:400;text-transform:none">(exp. wt)</small> ${_stockSortIcon('rate_kg')}</th>
            <th onclick="_setStockSort('status')" class="sortable">Status ${_stockSortIcon('status')}</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Sync header checkbox state after render
  _syncHeaderCheckbox();
}

// ── Stock Card View ──────────────────────────────────────────
function renderStockCards(goats) {
  const el = document.getElementById('stockList');
  el.className = 'stk-grid';

  el.innerHTML = goats.map(g => {
    const totalCost = parseFloat(g.cost_price || 0) + parseFloat(g.extra_costs || 0);
    const buyWt     = parseFloat(g.weight_kg || 0);
    const expWt     = (buyWt * 0.95).toFixed(1);
    const ratePerKg = parseFloat(expWt) > 0 ? Math.round(totalCost / parseFloat(expWt)) : 0;
    const isBooked  = g.status === 'booked';
    const advance   = parseFloat(g.advance_amount || 0);
    const remaining = isBooked ? parseFloat(g.selling_price || 0) - advance : 0;
    const isSelected = _selectedStockIds.has(g.id);

    const statusBadge = isBooked
      ? `<span class="goat-status status-booked">⏳ Booked</span>`
      : `<span class="goat-status status-available">✅ Available</span>`;

    const bookedBar = isBooked ? `
      <div class="stk-booked-bar">
        <span>💳 Advance: <strong>₹${fmt(advance)}</strong></span>
        <span class="pay-due">⏳ Due: <strong>₹${fmt(remaining)}</strong></span>
      </div>` : '';

    const actions = isBooked
      ? `<button class="btn btn-primary btn-sm" onclick="openFinalizeModal(${g.id})">💳 Collect ₹${fmt(remaining)}</button>
         <button class="btn btn-wa     btn-sm" onclick="sendWhatsApp(${g.id})">📱</button>
         <button class="btn btn-gray   btn-sm" onclick="undoSale(${g.id}, this)">↩</button>
         <button class="btn btn-gray   btn-sm" onclick="viewGoat(${g.id})">👁</button>`
      : `<button class="btn btn-primary btn-sm" onclick="openSellModal(${g.id})">💰 Sell</button>
         <button class="btn btn-gray   btn-sm" onclick="openEditModal(${g.id})">✏️ Edit</button>
         <button class="btn btn-gray   btn-sm" onclick="viewGoat(${g.id})">👁</button>
         <button class="btn btn-danger btn-sm" onclick="deleteGoat(${g.id}, 'stock')">🗑</button>`;

    return `
      <div class="stk-card ${isBooked ? 'stk-booked' : ''}${isSelected ? ' stk-selected' : ''}" data-gid="${g.id}">
        <label class="stk-cb-overlay" onclick="event.stopPropagation()">
          <input type="checkbox" class="stk-row-cb" data-id="${g.id}" ${isSelected ? 'checked' : ''}
            onchange="_toggleSelectGoat(${g.id})" />
        </label>
        <div class="stk-card-top">
          <div>
            <span class="goat-tag">🐐 ${esc(g.goat_id)}</span>
            ${g.breed ? `<span class="stk-breed">${esc(g.breed)}</span>` : ''}
          </div>
          ${statusBadge}
        </div>
        <div class="stk-info-grid">
          <div class="stk-info-item">
            <span class="stk-lbl">Buy Weight</span>
            <span class="stk-val">${buyWt} kg</span>
          </div>
          <div class="stk-info-item">
            <span class="stk-lbl">Exp. Weight (×95%)</span>
            <span class="stk-val stk-amber">${expWt} kg</span>
          </div>
          <div class="stk-info-item">
            <span class="stk-lbl">Total Cost</span>
            <span class="stk-val">₹${fmt(totalCost)}</span>
          </div>
          <div class="stk-info-item">
            <span class="stk-lbl">Rate/kg (exp. wt)</span>
            <span class="stk-val stk-blue">₹${fmt(ratePerKg)}</span>
          </div>
          ${g.purchase_date ? `
          <div class="stk-info-item">
            <span class="stk-lbl">Purchased</span>
            <span class="stk-val">${String(g.purchase_date).slice(0,10)}</span>
          </div>` : ''}
          ${g.added_by ? `
          <div class="stk-info-item">
            <span class="stk-lbl">Added By</span>
            <span class="stk-val">${esc(g.added_by)}</span>
          </div>` : ''}
        </div>
        ${bookedBar}
        <div class="stk-actions">${actions}</div>
      </div>`;
  }).join('');
}


// ── Enter in search → sell if single match ──────────────────
function searchEnterSell(e) {
  if (e.key !== 'Enter') return;
  const q = document.getElementById('stockSearch').value.toLowerCase().trim();
  if (!q) return;
  const matches = allStock.filter(g =>
    g.goat_id.toLowerCase().includes(q) ||
    (g.breed || '').toLowerCase().includes(q) ||
    (g.notes || '').toLowerCase().includes(q)
  );
  if      (matches.length === 1) openSellModal(matches[0].id);
  else if (matches.length === 0) showToast(`No goat found matching "${q}"`, 'warning');
  else                           showToast(`${matches.length} matches — narrow your search`, 'info', 2000);
}

// ── Goat card template ──────────────────────────────────────
function goatCard(g, isSold) {
  const isBooked  = g.status === 'booked';
  const showSale  = isSold || isBooked;
  const totalCost = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
  const costPerKg = g.weight_kg ? Math.round(totalCost / g.weight_kg) : 0;
  const saleWt    = g.sale_weight_kg || g.weight_kg;
  const profit    = showSale ? (parseFloat(g.selling_price) - totalCost) : null;
  const remaining = isBooked ? (parseFloat(g.selling_price) - parseFloat(g.advance_amount || 0)) : 0;
  const pClass    = profit !== null ? (profit >= 0 ? 'bp' : 'bl') : '';

  const photoEl = g.photo
    ? `<img src="${g.photo}" class="goat-card-photo" alt="goat ${esc(g.goat_id)}" loading="lazy" />`
    : `<div class="goat-card-photo-placeholder">🐐</div>`;

  const baseDetails = `
    <div class="d-item"><span class="d-lbl">Weight</span><span class="d-val">${g.weight_kg} kg</span></div>
    <div class="d-item"><span class="d-lbl">Total Cost</span><span class="d-val">₹${fmt(totalCost)}</span></div>
    <div class="d-item"><span class="d-lbl">Cost/kg</span><span class="d-val">₹${costPerKg}</span></div>
    ${g.breed    ? `<div class="d-item"><span class="d-lbl">Breed</span><span class="d-val">${esc(g.breed)}</span></div>` : ''}
    ${g.added_by ? `<div class="d-item"><span class="d-lbl">Added by</span><span class="d-val">${esc(g.added_by)}</span></div>` : ''}
    ${g.notes    ? `<div class="d-item" style="grid-column:1/-1"><span class="d-lbl">Notes</span><span class="d-val">${esc(g.notes)}</span></div>` : ''}`;

  const saleDetails = showSale ? `
    <div class="d-item"><span class="d-lbl">Sold For</span><span class="d-val">₹${fmt(g.selling_price)}</span></div>
    <div class="d-item"><span class="d-lbl">Sale Wt</span><span class="d-val">${saleWt} kg</span></div>
    ${g.buyer_name ? `<div class="d-item"><span class="d-lbl">Buyer</span><span class="d-val">${esc(g.buyer_name)}</span></div>` : ''}
    ${parseFloat(g.advance_amount) > 0 ? `<div class="d-item"><span class="d-lbl">Advance</span><span class="d-val">₹${fmt(g.advance_amount)} <span class="pay-badge">${g.advance_mode||'—'}</span></span></div>` : ''}
    ${g.final_payment_mode ? `<div class="d-item"><span class="d-lbl">Payment</span><span class="d-val"><span class="pay-badge">${g.final_payment_mode}</span></span></div>` : ''}
    <div class="d-item"><span class="d-lbl">Sale Date</span><span class="d-val">${g.sale_date ? String(g.sale_date).slice(0,10) : '—'}</span></div>` : '';

  const bookedExtra = isBooked
    ? `<div style="grid-column:1/-1"><span class="remaining-pill">⏳ Remaining: ₹${fmt(remaining)}</span></div>` : '';

  const statusCls   = g.status === 'sold' ? 'status-sold' : isBooked ? 'status-booked' : 'status-available';
  const statusLabel = g.status === 'sold' ? 'Sold' : isBooked ? 'Booked' : 'Available';

  const actions = g.status === 'sold'
    ? `<button class="btn btn-gray   btn-sm" onclick="undoSale(${g.id}, this)">↩ Undo</button>
       <button class="btn btn-wa     btn-sm" onclick="sendWhatsApp(${g.id})">📱 WA</button>
       <button class="btn btn-gray   btn-sm" onclick="viewGoat(${g.id})">👁</button>
       <button class="btn btn-danger btn-sm" onclick="deleteGoat(${g.id}, 'sold')">🗑</button>`
    : isBooked
    ? `<button class="btn btn-primary btn-sm" onclick="openFinalizeModal(${g.id})">💳 Collect ₹${fmt(remaining)}</button>
       <button class="btn btn-wa     btn-sm" onclick="sendWhatsApp(${g.id})">📱 WA</button>
       <button class="btn btn-gray   btn-sm" onclick="undoSale(${g.id}, this)">↩</button>
       <button class="btn btn-gray   btn-sm" onclick="viewGoat(${g.id})">👁</button>`
    : `<button class="btn btn-primary btn-sm" onclick="openSellModal(${g.id})">💰 Sell</button>
       <button class="btn btn-gray    btn-sm" onclick="openEditModal(${g.id})">✏️</button>
       <button class="btn btn-gray    btn-sm" onclick="viewGoat(${g.id})">👁</button>
       <button class="btn btn-danger  btn-sm" onclick="deleteGoat(${g.id}, 'stock')">🗑</button>`;

  return `
    <div class="goat-card ${isSold ? 'sold-card' : ''}${isBooked ? ' booked-card' : ''}">
      ${photoEl}
      <div class="goat-card-body">
        <div class="goat-card-header">
          <span class="goat-tag">🐐 ${esc(g.goat_id)}</span>
          <div class="goat-badges">
            ${profit !== null ? `<span class="badge-profit ${pClass}">${profit >= 0 ? '+' : ''}₹${fmt(profit)}</span>` : ''}
            <span class="goat-status ${statusCls}">${statusLabel}</span>
          </div>
        </div>
        <div class="goat-details">${baseDetails}${saleDetails}${bookedExtra}</div>
        <div class="goat-actions">${actions}</div>
      </div>
    </div>`;
}

// ── Add / Edit modal ────────────────────────────────────────
async function openAddModal() {
  document.getElementById('goatModalTitle').textContent = 'Add Goat';
  document.getElementById('goatForm').reset();
  document.getElementById('editId').value = '';
  document.getElementById('fExtra').value = '0';
  document.getElementById('fPurchaseDate').value = today();
  document.getElementById('calcStrip').style.display = 'none';
  document.getElementById('goatFormErr').classList.add('hidden');
  document.getElementById('photoPreview').classList.add('hidden');
  document.getElementById('photoPlaceholder').style.display = 'flex';
  setLoading('saveGoatBtn', false);
  const res = await api('/api/next-id');
  if (res?.nextId) document.getElementById('fGoatId').value = res.nextId;
  showModal('goatModal');
  setTimeout(() => document.getElementById('fWeight').focus(), 200);
}

async function openEditModal(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }
  document.getElementById('goatModalTitle').textContent = 'Edit Goat';
  document.getElementById('editId').value   = g.id;
  document.getElementById('fGoatId').value  = g.goat_id;
  document.getElementById('fBreed').value   = g.breed || '';
  document.getElementById('fWeight').value  = g.weight_kg;
  document.getElementById('fCost').value    = g.weight_kg ? (g.cost_price / g.weight_kg).toFixed(2) : g.cost_price;
  document.getElementById('fExtra').value   = g.extra_costs || 0;
  document.getElementById('fPurchaseDate').value = g.purchase_date ? String(g.purchase_date).slice(0,10) : today();
  document.getElementById('fAddedBy').value = g.added_by || '';
  document.getElementById('fNotes').value   = g.notes || '';
  document.getElementById('goatFormErr').classList.add('hidden');
  setLoading('saveGoatBtn', false);
  if (g.photo) {
    document.getElementById('photoPreview').src = g.photo;
    document.getElementById('photoPreview').classList.remove('hidden');
    document.getElementById('photoPlaceholder').style.display = 'none';
  } else {
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('photoPlaceholder').style.display = 'flex';
  }
  calcAuto();
  showModal('goatModal');
}

function previewPhoto(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('photoPreview').src = e.target.result;
    document.getElementById('photoPreview').classList.remove('hidden');
    document.getElementById('photoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(input.files[0]);
}

function calcAuto() {
  const w = parseFloat(document.getElementById('fWeight').value) || 0;
  const c = parseFloat(document.getElementById('fCost').value)   || 0;
  const x = parseFloat(document.getElementById('fExtra').value)  || 0;
  const strip = document.getElementById('calcStrip');
  if (w > 0 && c > 0) {
    const total = c * w + x;
    document.getElementById('calcTotal').textContent = `₹${fmt(total)}`;
    document.getElementById('calcPerKg').textContent = `₹${fmt(c)}/kg × ${w} kg${x > 0 ? ` + ₹${fmt(x)} extra` : ''}`;
    strip.style.display = 'flex';
  } else {
    strip.style.display = 'none';
  }
}

async function saveGoat(e, addAnother = false) {
  e.preventDefault();
  const errEl   = document.getElementById('goatFormErr');
  const showErr = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  errEl.classList.add('hidden');

  const goatIdVal = document.getElementById('fGoatId').value.trim();
  if (!goatIdVal)                          return showErr('⚠️ Goat ID / Tag is required.');
  if (!/^[A-Za-z0-9\-_]+$/.test(goatIdVal)) return showErr('⚠️ Goat ID can only contain letters, numbers, hyphens and underscores.');
  const weightVal = parseFloat(document.getElementById('fWeight').value);
  if (!weightVal || weightVal <= 0)        return showErr('⚠️ Weight must be greater than 0.');
  if (weightVal > 500)                     return showErr('⚠️ Weight seems too high. Please check.');
  const costVal = parseFloat(document.getElementById('fCost').value);
  if (!costVal || costVal <= 0)            return showErr('⚠️ Cost per kg must be greater than 0.');
  const extraVal = parseFloat(document.getElementById('fExtra').value) || 0;
  if (extraVal < 0)                        return showErr('⚠️ Extra costs cannot be negative.');
  if (costVal * weightVal + extraVal > 500000) {
    if (!confirm(`Total cost is ₹${fmt(costVal * weightVal + extraVal)}. This seems very high. Continue?`)) return;
  }

  const id = document.getElementById('editId').value;
  setLoading('saveGoatBtn', true);
  setLoading('saveAddAnotherBtn', true);

  const fd = new FormData();
  fd.append('goat_id',       goatIdVal);
  fd.append('breed',         document.getElementById('fBreed').value.trim());
  fd.append('weight_kg',     weightVal);
  fd.append('cost_price',    parseFloat((costVal * weightVal).toFixed(2)));
  fd.append('extra_costs',   extraVal);
  fd.append('purchase_date', document.getElementById('fPurchaseDate').value || today());
  fd.append('added_by',      document.getElementById('fAddedBy').value.trim());
  fd.append('notes',         document.getElementById('fNotes').value.trim());
  const photoFile = document.getElementById('photoInput').files[0];
  if (photoFile) fd.append('photo', photoFile);

  try {
    const res  = await fetch(id ? `/api/goats/${id}` : '/api/goats', { method: id ? 'PUT' : 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { showErr(data.error); setLoading('saveGoatBtn', false); setLoading('saveAddAnotherBtn', false); return; }
    saveNameSuggestion(document.getElementById('fAddedBy').value.trim());
    if (addAnother) {
      const addedBy = document.getElementById('fAddedBy').value.trim();
      showToast(`Goat ${goatIdVal} added ✅ — ready for next`, 'success', 2500);
      await loadStock();
      document.getElementById('goatForm').reset();
      document.getElementById('editId').value = '';
      document.getElementById('fExtra').value = '0';
      document.getElementById('fPurchaseDate').value = today();
      document.getElementById('fAddedBy').value = addedBy;
      document.getElementById('calcStrip').style.display = 'none';
      document.getElementById('photoPreview').classList.add('hidden');
      document.getElementById('photoPlaceholder').style.display = 'flex';
      document.getElementById('photoInput').value = '';
      setLoading('saveGoatBtn', false); setLoading('saveAddAnotherBtn', false);
      const res2 = await api('/api/next-id');
      if (res2?.nextId) document.getElementById('fGoatId').value = res2.nextId;
      setTimeout(() => document.getElementById('fWeight').focus(), 100);
    } else {
      closeModal('goatModal');
      showToast(id ? `Goat ${goatIdVal} updated` : `Goat ${goatIdVal} added 🐐`, 'success');
      await loadStock();
    }
  } catch (err) {
    showErr('Network error: ' + err.message);
    setLoading('saveGoatBtn', false); setLoading('saveAddAnotherBtn', false);
  }
}

async function deleteGoat(id, context = 'stock') {
  if (!confirm('Delete this goat? This cannot be undone.')) return;
  const res = await fetch(`/api/goats/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Goat record deleted', 'warning');
    if (context === 'sold') loadSold(); else loadStock();
  } else {
    showToast('Failed to delete goat', 'error');
  }
}

// ── Sell modal ──────────────────────────────────────────────
async function openSellModal(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }
  if (g.status === 'sold') { showToast('This goat is already sold', 'warning'); return; }

  const totalCost   = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
  const expWeight   = (parseFloat(g.weight_kg) * 0.95).toFixed(2);
  const ratePerKg   = totalCost / parseFloat(expWeight);   // cost per kg on expected weight

  document.getElementById('sellId').value          = id;
  document.getElementById('sellDate').value        = today();
  document.getElementById('sellPrice').value       = '';
  document.getElementById('sellWeight').value      = expWeight;   // pre-fill with expected weight
  document.getElementById('sellAdvance').value     = '0';
  document.getElementById('sellAdvanceMode').value = '';
  document.getElementById('sellFinalMode').value   = '';
  document.getElementById('sellBuyer').value       = g.buyer_name || '';
  document.getElementById('sellPhone').value       = g.buyer_phone || '';

  // Store for calculations
  document.getElementById('sellPrice').dataset.cost       = totalCost;
  document.getElementById('sellPrice').dataset.ratePerKg  = ratePerKg.toFixed(4);
  document.getElementById('sellPrice').dataset.goatId     = g.goat_id;

  document.getElementById('sellPreview').classList.add('hidden');
  document.getElementById('sellFormErr').classList.add('hidden');
  setLoading('confirmSaleBtn', false);

  document.getElementById('sellInfoBox').innerHTML = `
    <div class="d-item"><span class="d-lbl">Goat ID</span><span class="d-val">${esc(g.goat_id)}</span></div>
    <div class="d-item"><span class="d-lbl">Breed</span><span class="d-val">${esc(g.breed || '—')}</span></div>
    <div class="d-item"><span class="d-lbl">Buy Weight</span><span class="d-val">${g.weight_kg} kg</span></div>
    <div class="d-item"><span class="d-lbl">Expected Weight</span><span class="d-val" style="color:var(--amber)">${expWeight} kg <small style="font-weight:500">(×95%)</small></span></div>
    <div class="d-item"><span class="d-lbl">Total Cost</span><span class="d-val">₹${fmt(totalCost)}</span></div>
    <div class="d-item"><span class="d-lbl">Rate/kg (exp. wt)</span><span class="d-val" style="color:var(--blue)">₹${fmt(Math.round(ratePerKg))}</span></div>`;

  showModal('sellModal');
  setTimeout(() => document.getElementById('sellPrice').focus(), 150);
}

function updateSellPreview() {
  const sp         = parseFloat(document.getElementById('sellPrice').value)  || 0;
  const ratePerKg  = parseFloat(document.getElementById('sellPrice').dataset.ratePerKg) || 0;
  const fallback   = parseFloat(document.getElementById('sellPrice').dataset.cost) || 0;
  const actualWt   = parseFloat(document.getElementById('sellWeight').value) || 0;
  const advance    = parseFloat(document.getElementById('sellAdvance').value) || 0;

  // Effective cost = rate/kg × actual weight (rate is based on expected weight cost)
  const effectiveCost = ratePerKg > 0 && actualWt > 0 ? ratePerKg * actualWt : fallback;

  const el = document.getElementById('sellPreview');
  if (sp > 0) {
    const profit    = sp - effectiveCost;
    const remaining = sp - advance;
    const marginPct = effectiveCost > 0 ? ((profit / effectiveCost) * 100).toFixed(1) : 0;
    const profitTxt = profit >= 0
      ? `✅ Profit: ₹${fmt(profit)} (${marginPct}% margin)`
      : `❌ Loss: ₹${fmt(Math.abs(profit))}`;
    const costInfo  = ratePerKg > 0 && actualWt > 0
      ? `  ·  📐 Eff. cost: ₹${fmt(Math.round(effectiveCost))} (${actualWt}kg × ₹${fmt(Math.round(ratePerKg))})`
      : '';
    const advTxt = advance > 0 && advance < sp
      ? `  ·  📥 Advance: ₹${fmt(advance)}  ·  ⏳ Remaining: ₹${fmt(remaining)}`
      : advance >= sp ? '  ·  ✅ Fully paid' : '';
    el.textContent = profitTxt + costInfo + advTxt;
    el.className   = `profit-preview ${profit >= 0 ? 'pos' : 'neg'}`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

async function confirmSale(e) {
  e.preventDefault();
  const id    = document.getElementById('sellId').value;
  const errEl = document.getElementById('sellFormErr');
  errEl.classList.add('hidden');

  const sp         = parseFloat(document.getElementById('sellPrice').value);
  const cost       = parseFloat(document.getElementById('sellPrice').dataset.cost);
  const ratePerKg  = parseFloat(document.getElementById('sellPrice').dataset.ratePerKg) || 0;
  const goatId     = document.getElementById('sellPrice').dataset.goatId;
  const advance    = parseFloat(document.getElementById('sellAdvance').value) || 0;
  const buyerName  = document.getElementById('sellBuyer').value.trim();
  const buyerPhone = document.getElementById('sellPhone').value.trim();
  const advMode    = document.getElementById('sellAdvanceMode').value;
  const finalMode  = document.getElementById('sellFinalMode').value;
  const saleWeight = document.getElementById('sellWeight').value;
  const isBooked   = advance > 0 && advance < sp;
  const showErr    = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); };

  // Use effective cost for loss check
  const actualWt      = parseFloat(saleWeight) || 0;
  const effectiveCost = ratePerKg > 0 && actualWt > 0 ? ratePerKg * actualWt : cost;

  if (!sp || sp <= 0)  return showErr('⚠️ Selling price must be greater than 0.');
  if (sp > 10000000)   return showErr('⚠️ Selling price seems too high. Please check.');
  if (!buyerName)      return showErr('⚠️ Buyer name is required.');
  if (!buyerPhone)     return showErr('⚠️ Buyer phone is required.');
  if (!/^[0-9+\-\s]{7,15}$/.test(buyerPhone)) return showErr('⚠️ Enter a valid phone number (7–15 digits).');
  if (advance < 0)     return showErr('⚠️ Advance amount cannot be negative.');
  if (advance >= sp)   return showErr('⚠️ Advance cannot be equal to or more than the selling price.');
  if (isBooked && !advMode)    return showErr('⚠️ Please select advance payment mode.');
  if (!isBooked && !finalMode) return showErr('⚠️ Please select a payment mode.');
  const saleDate = document.getElementById('sellDate').value;
  if (!saleDate)        return showErr('⚠️ Sale date is required.');
  if (saleDate > today()) return showErr('⚠️ Sale date cannot be in the future.');
  if (sp < effectiveCost && !confirm(`⚠️ Selling at a LOSS of ₹${fmt(Math.round(effectiveCost - sp))} (based on actual weight ${actualWt}kg). Are you sure?`)) return;

  setLoading('confirmSaleBtn', true);
  try {
    const res  = await fetch(`/api/goats/${id}/sell`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selling_price: sp, buyer_name: buyerName, buyer_phone: buyerPhone,
        sale_date: saleDate, sale_weight_kg: saleWeight || null,
        advance_amount: advance, advance_mode: advMode, final_payment_mode: finalMode })
    });
    const data = await res.json();
    if (!res.ok) { showErr(data.error); setLoading('confirmSaleBtn', false); return; }
    closeModal('sellModal');
    const profit = sp - effectiveCost;
    if (data.status === 'booked') {
      showToast(`${goatId} booked — ₹${fmt(advance)} received, ₹${fmt(sp - advance)} pending`, 'info', 5000);
    } else {
      showToast(profit >= 0 ? `Sold ${goatId} — Profit: ₹${fmt(Math.round(profit))} 🎉` : `Sold ${goatId} — Loss: ₹${fmt(Math.round(Math.abs(profit)))}`,
        profit >= 0 ? 'success' : 'warning', 5000);
    }
    await loadStock();
    loadDashboard();
  } catch (err) {
    showErr('Network error: ' + err.message);
    setLoading('confirmSaleBtn', false);
  }
}

async function undoSale(id, btn) {
  if (!confirm('Move this goat back to available stock?')) return;
  btn.dataset.loading = 'true';
  const res = await fetch(`/api/goats/${id}/unsell`, { method: 'POST' });
  delete btn.dataset.loading;
  if (res.ok) { showToast('Sale reverted — goat back in stock', 'info'); await loadStock(); loadDashboard(); }
  else         showToast('Failed to revert sale', 'error');
}

// ── Finalize booked goat ────────────────────────────────────
async function openFinalizeModal(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }
  const remaining = parseFloat(g.selling_price) - parseFloat(g.advance_amount || 0);
  document.getElementById('finalizeId').value = id;
  document.getElementById('finalizeFinalMode').value = '';
  document.getElementById('finalizeFormErr').classList.add('hidden');
  setLoading('finalizeBtn', false);
  document.getElementById('finalizeInfoBox').innerHTML = `
    <div class="d-item"><span class="d-lbl">Goat</span><span class="d-val">${esc(g.goat_id)}</span></div>
    <div class="d-item"><span class="d-lbl">Buyer</span><span class="d-val">${esc(g.buyer_name || '—')}</span></div>
    <div class="d-item"><span class="d-lbl">Advance Paid</span><span class="d-val">₹${fmt(g.advance_amount)}</span></div>
    <div class="d-item"><span class="d-lbl">Remaining</span><span class="d-val" style="color:var(--orange);font-weight:800">₹${fmt(remaining)}</span></div>`;
  showModal('finalizeModal');
}

async function finalizeSale(e) {
  e.preventDefault();
  const id    = document.getElementById('finalizeId').value;
  const errEl = document.getElementById('finalizeFormErr');
  const mode  = document.getElementById('finalizeFinalMode').value;
  errEl.classList.add('hidden');
  if (!mode) { errEl.textContent = '⚠️ Please select the final payment mode.'; errEl.classList.remove('hidden'); return; }
  setLoading('finalizeBtn', true);
  try {
    const res  = await fetch(`/api/goats/${id}/finalize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_payment_mode: mode })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.remove('hidden'); setLoading('finalizeBtn', false); return; }
    closeModal('finalizeModal');
    showToast('Payment collected — goat marked as fully sold ✅', 'success');
    await loadStock(); loadDashboard();
  } catch (err) {
    errEl.textContent = 'Network error: ' + err.message;
    errEl.classList.remove('hidden'); setLoading('finalizeBtn', false);
  }
}

async function viewGoat(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }
  const totalCost = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
  const saleWt    = g.sale_weight_kg || g.weight_kg;
  const profit    = (g.status !== 'available') ? parseFloat(g.selling_price) - totalCost : null;
  const remaining = g.status === 'booked' ? parseFloat(g.selling_price) - parseFloat(g.advance_amount || 0) : 0;
  const purchDate = g.purchase_date ? String(g.purchase_date).slice(0,10) : '—';
  const saleDate  = g.sale_date ? String(g.sale_date).slice(0,10) : '—';
  const daysHeld  = g.purchase_date
    ? Math.round((new Date(g.sale_date || new Date()) - new Date(g.purchase_date)) / 86400000)
    : null;

  document.getElementById('viewTitle').textContent = `🐐 ${g.goat_id}`;
  document.getElementById('viewContent').innerHTML = `
    ${g.photo ? `<img src="${g.photo}" class="view-photo" />` : ''}
    <div class="view-grid">
      <div class="view-item"><span class="view-lbl">Goat ID / Tag</span><span class="view-val">${esc(g.goat_id)}</span></div>
      <div class="view-item"><span class="view-lbl">Status</span><span class="view-val">${g.status === 'sold' ? '🔴 Sold' : g.status === 'booked' ? '🟡 Booked' : '🟢 Available'}</span></div>
      <div class="view-item"><span class="view-lbl">Breed</span><span class="view-val">${esc(g.breed || '—')}</span></div>
      <div class="view-item"><span class="view-lbl">Purchase Date</span><span class="view-val">📅 ${purchDate}</span></div>
      <div class="view-item"><span class="view-lbl">Buy Weight</span><span class="view-val">${g.weight_kg} kg</span></div>
      <div class="view-item"><span class="view-lbl">Exp. Sale Weight (×95%)</span><span class="view-val" style="color:var(--amber)">${(parseFloat(g.weight_kg)*0.95).toFixed(1)} kg</span></div>
      <div class="view-item"><span class="view-lbl">Cost Price</span><span class="view-val">₹${fmt(g.cost_price)}</span></div>
      <div class="view-item"><span class="view-lbl">Extra Costs</span><span class="view-val">₹${fmt(g.extra_costs || 0)}</span></div>
      <div class="view-item"><span class="view-lbl">Total Cost</span><span class="view-val" style="font-weight:700">₹${fmt(totalCost)}</span></div>
      <div class="view-item"><span class="view-lbl">Cost/kg (buy wt)</span><span class="view-val">₹${(totalCost / parseFloat(g.weight_kg)).toFixed(0)}/kg</span></div>
      ${daysHeld !== null ? `<div class="view-item"><span class="view-lbl">Days Held</span><span class="view-val">${daysHeld} days</span></div>` : ''}
      <div class="view-item"><span class="view-lbl">Added By</span><span class="view-val">${esc(g.added_by || '—')}</span></div>
      ${g.status !== 'available' ? `
        <div class="view-item view-full" style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px"><span class="view-lbl" style="font-weight:700;color:var(--text-1)">── Sale Details ──</span><span class="view-val"></span></div>
        <div class="view-item"><span class="view-lbl">Selling Price</span><span class="view-val" style="font-weight:700">₹${fmt(g.selling_price)}</span></div>
        <div class="view-item"><span class="view-lbl">Sale Weight</span><span class="view-val">${saleWt} kg</span></div>
        <div class="view-item"><span class="view-lbl">Price/kg (sale wt)</span><span class="view-val">₹${parseFloat(saleWt) > 0 ? Math.round(parseFloat(g.selling_price) / parseFloat(saleWt)) : '—'}/kg</span></div>
        <div class="view-item"><span class="view-lbl">Profit / Loss</span>
          <span class="view-val" style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">
            ${profit >= 0 ? '▲ +' : '▼ '}₹${fmt(Math.abs(profit))}
            ${totalCost > 0 ? ` <small>(${((profit/totalCost)*100).toFixed(1)}%)</small>` : ''}
          </span>
        </div>
        <div class="view-item"><span class="view-lbl">Buyer Name</span><span class="view-val">${esc(g.buyer_name || '—')}</span></div>
        <div class="view-item"><span class="view-lbl">Buyer Phone</span><span class="view-val">${esc(g.buyer_phone || '—')}</span></div>
        <div class="view-item"><span class="view-lbl">Sale Date</span><span class="view-val">📅 ${saleDate}</span></div>
        ${parseFloat(g.advance_amount) > 0 ? `
          <div class="view-item"><span class="view-lbl">Advance Paid</span><span class="view-val">₹${fmt(g.advance_amount)} <span class="pay-badge">${g.advance_mode || ''}</span></span></div>
          ${g.advance_date ? `<div class="view-item"><span class="view-lbl">Advance Date</span><span class="view-val">📅 ${String(g.advance_date).slice(0,10)}</span></div>` : ''}` : ''}
        ${g.final_payment_mode ? `<div class="view-item"><span class="view-lbl">Final Payment Mode</span><span class="view-val"><span class="pay-badge">${g.final_payment_mode}</span></span></div>` : ''}
        ${g.status === 'booked' ? `<div class="view-item view-full"><span class="view-lbl">Remaining Due</span><span class="view-val" style="color:var(--orange);font-weight:800">₹${fmt(remaining)} to collect</span></div>` : ''}` : ''}
      <div class="view-item view-full"><span class="view-lbl">Notes</span><span class="view-val">${esc(g.notes || '—')}</span></div>
    </div>`;
  showModal('viewModal');
}
