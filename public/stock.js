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
                   'Total Cost (₹)','Rate/kg (buy wt)','Status','Added By','Notes'];
  const rows = selected.map(g => {
    const totalCost = parseFloat(g.cost_price || 0) + parseFloat(g.extra_costs || 0);
    const buyWt     = parseFloat(g.weight_kg || 0);
    const rate      = buyWt > 0 ? Math.round(totalCost / buyWt) : 0;
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
      const buyA  = parseFloat(a.weight_kg || 0);
      const buyB  = parseFloat(b.weight_kg || 0);
      const costA = parseFloat(a.cost_price || 0) + parseFloat(a.extra_costs || 0);
      const costB = parseFloat(b.cost_price || 0) + parseFloat(b.extra_costs || 0);
      va = buyA > 0 ? costA / buyA : 0;
      vb = buyB > 0 ? costB / buyB : 0;
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

  const availableCount = goats.filter(g => g.status === 'available').length;
  const bookedCount    = goats.filter(g => g.status === 'booked').length;
  const bookedPending  = goats.filter(g => g.status === 'booked')
                              .reduce((s, g) => s + parseFloat(g.selling_price || 0) - parseFloat(g.advance_amount || 0), 0);

  const rows = goats.map(g => {
    const totalCost = parseFloat(g.cost_price || 0) + parseFloat(g.extra_costs || 0);
    const buyWt     = parseFloat(g.weight_kg || 0);
    const ratePerKg = buyWt > 0 ? Math.round(totalCost / buyWt) : 0;
    const isBooked  = g.status === 'booked';
    const advance   = parseFloat(g.advance_amount || 0);
    const remaining = isBooked ? parseFloat(g.selling_price || 0) - advance : 0;
    const isSelected = _selectedStockIds.has(g.id);
    const expWtMatch = (g.notes || '').match(/Exp\.wt\s+([\d.]+)kg/);
    const expWt      = expWtMatch ? parseFloat(expWtMatch[1]) : null;

    const tagCell = `
      <span class="goat-tag-sm">🐐 ${esc(g.goat_id)}</span>
      ${g.breed ? `<span class="stc-sub">${esc(g.breed)}</span>` : ''}
      ${g.purchase_date ? `<span class="stc-sub" style="color:var(--text-3);font-size:0.7rem">📅 ${String(g.purchase_date).slice(0,10)}</span>` : ''}`;

    const wtCell = `
      <span class="stc-main">${buyWt} kg</span>
      ${expWt !== null ? `<span class="stc-sub" style="color:var(--amber);font-weight:600">Exp: ${expWt} kg</span>` : ''}`;

    const costCell = `
      <span class="stc-main">₹${fmt(totalCost)}</span>
      ${parseFloat(g.extra_costs) > 0
        ? `<span class="stc-sub">Base ₹${fmt(g.cost_price)} + ₹${fmt(g.extra_costs)}</span>`
        : `<span class="stc-sub">₹${fmt(g.cost_price)}</span>`}`;

    const rateCell = `
      <span class="stc-main stk-blue">₹${fmt(ratePerKg)}/kg</span>
      <span class="stc-sub">on buy wt</span>`;

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
      ? `<button class="btn btn-primary btn-sm" onclick="quickOut(${g.id})" title="Mark as Out">� Out</button>
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
            <th onclick="_setStockSort('total_cost')" class="sortable num">Total Cost ${_stockSortIcon('total_cost')}</th>
            <th onclick="_setStockSort('rate_kg')" class="sortable num">Rate/kg <small style="font-weight:400;text-transform:none">(buy wt)</small> ${_stockSortIcon('rate_kg')}</th>
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
    const ratePerKg = buyWt > 0 ? Math.round(totalCost / buyWt) : 0;
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
            <span class="stk-lbl">Total Cost</span>
            <span class="stk-val">₹${fmt(totalCost)}</span>
          </div>
          <div class="stk-info-item">
            <span class="stk-lbl">Rate/kg (buy wt)</span>
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
  const expWtMatch = (g.notes || '').match(/Exp\.wt\s+([\d.]+)kg/);
  const expWt      = expWtMatch ? parseFloat(expWtMatch[1]) : null;

  const photoEl = g.photo
    ? `<img src="${g.photo}" class="goat-card-photo" alt="goat ${esc(g.goat_id)}" loading="lazy" />`
    : `<div class="goat-card-photo-placeholder">🐐</div>`;

  const baseDetails = `
    <div class="d-item"><span class="d-lbl">Buy Wt</span><span class="d-val">${g.weight_kg} kg</span></div>
    ${expWt !== null ? `<div class="d-item"><span class="d-lbl">Exp Wt</span><span class="d-val" style="color:var(--amber);font-weight:600">${expWt} kg</span></div>` : ''}
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

  const totalCost     = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);

  document.getElementById('sellId').value           = id;
  document.getElementById('sellDate').value         = today();
  document.getElementById('sellRatePerKg').value    = '';
  document.getElementById('sellWeight').value       = g.weight_kg;
  document.getElementById('sellTotalPrice').value   = '';
  document.getElementById('sellPalaiDays').value    = '0';
  document.getElementById('sellPalaiRate').value    = '150';
  document.getElementById('sellPalaiCharges').value = '';
  document.getElementById('sellGrandTotal').value   = '';
  document.getElementById('sellAdvance').value      = '0';
  document.getElementById('sellAdvanceMode').value  = '';
  document.getElementById('sellFinalMode').value    = '';
  document.getElementById('sellBuyer').value        = g.buyer_name || '';
  document.getElementById('sellPhone').value        = g.buyer_phone || '';

  // Reset to Full Payment mode
  document.getElementById('sellPayTypeFull').checked = true;
  document.getElementById('sellFullSection').style.display = '';
  document.getElementById('sellAdvSection').style.display  = 'none';
  const takeTodayEl = document.getElementById('sellTakeToday');
  if (takeTodayEl) takeTodayEl.checked = true;

  // Store for calculations
  document.getElementById('sellRatePerKg').dataset.cost      = totalCost;
  document.getElementById('sellRatePerKg').dataset.goatId    = g.goat_id;

  document.getElementById('sellPreview').classList.add('hidden');
  document.getElementById('sellFormErr').classList.add('hidden');
  setLoading('confirmSaleBtn', false);

  document.getElementById('sellInfoBox').innerHTML = `
    <div class="d-item"><span class="d-lbl">Goat ID</span><span class="d-val">${esc(g.goat_id)}</span></div>
    <div class="d-item"><span class="d-lbl">Breed</span><span class="d-val">${esc(g.breed || '—')}</span></div>
    <div class="d-item"><span class="d-lbl">Buy Weight</span><span class="d-val">${g.weight_kg} kg</span></div>
    <div class="d-item"><span class="d-lbl">Total Cost</span><span class="d-val">₹${fmt(totalCost)}</span></div>
    <div class="d-item"><span class="d-lbl">Cost Rate/kg</span><span class="d-val" style="color:var(--blue)">₹${fmt(parseFloat(g.weight_kg) > 0 ? Math.round(totalCost / parseFloat(g.weight_kg)) : 0)}</span></div>`;

  showModal('sellModal');
  setTimeout(() => document.getElementById('sellRatePerKg').focus(), 150);
}

function updateSellPayType() {
  const isFull = document.getElementById('sellPayTypeFull').checked;
  document.getElementById('sellFullSection').style.display = isFull ? '' : 'none';
  document.getElementById('sellAdvSection').style.display  = isFull ? 'none' : '';
  if (isFull) document.getElementById('sellAdvance').value = '0';
  updateSellPreview();
}

function updateSellPreview() {
  const inputRate     = parseFloat(document.getElementById('sellRatePerKg').value) || 0;
  const effectiveCost = parseFloat(document.getElementById('sellRatePerKg').dataset.cost) || 0;
  const actualWt      = parseFloat(document.getElementById('sellWeight').value) || 0;
  const palaiDays  = parseInt(document.getElementById('sellPalaiDays').value) || 0;
  const palaiRate  = parseFloat(document.getElementById('sellPalaiRate').value) || 0;
  const isFull     = document.getElementById('sellPayTypeFull').checked;
  const advance    = isFull ? 0 : (parseFloat(document.getElementById('sellAdvance').value) || 0);

  const sp           = inputRate > 0 && actualWt > 0 ? Math.round(inputRate * actualWt) : 0;
  const palaiCharges = palaiDays > 0 ? palaiDays * palaiRate : 0;
  const grandTotal   = sp + palaiCharges;

  document.getElementById('sellTotalPrice').value   = sp > 0 ? sp : '';
  document.getElementById('sellPalaiCharges').value = palaiDays > 0 ? palaiCharges : '';
  document.getElementById('sellGrandTotal').value   = sp > 0 ? grandTotal : '';

  const el = document.getElementById('sellPreview');
  if (sp > 0) {
    const takeToday  = isFull && (document.getElementById('sellTakeToday')?.checked ?? true);
    const profit    = sp - effectiveCost;
    const marginPct = effectiveCost > 0 ? ((profit / effectiveCost) * 100).toFixed(1) : 0;
    const profitTxt = profit >= 0
      ? `✅ Profit: ₹${fmt(Math.round(profit))} (${marginPct}% margin)`
      : `❌ Loss: ₹${fmt(Math.round(Math.abs(profit)))}`;
    const palaiTxt = palaiDays > 0
      ? `  ·  🏠 Palai: ${palaiDays}d x ₹${fmt(palaiRate)} = ₹${fmt(palaiCharges)}`
      : isFull && !takeToday ? `  ·  🏠 Palai: charged at delivery` : '';
    const grandTxt = `  ·  Grand Total: ₹${fmt(grandTotal)}`;
    const advTxt   = !isFull && advance > 0 && advance < sp
      ? `  ·  Advance: ₹${fmt(advance)}  ·  Remaining: ₹${fmt(sp - advance)}`
      : '';
    const delivTxt = isFull
      ? (takeToday ? `  ·  📦 Delivered today` : `  ·  🏠 Staying in yard`)
      : `  ·  🏠 Booking — keeping in yard`;
    el.textContent = profitTxt + palaiTxt + grandTxt + advTxt + delivTxt;
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

  const inputRate  = parseFloat(document.getElementById('sellRatePerKg').value);
  const cost       = parseFloat(document.getElementById('sellRatePerKg').dataset.cost);
  const goatId     = document.getElementById('sellRatePerKg').dataset.goatId;
  const isFull     = document.getElementById('sellPayTypeFull').checked;
  const advance    = isFull ? 0 : (parseFloat(document.getElementById('sellAdvance').value) || 0);
  const buyerName  = document.getElementById('sellBuyer').value.trim();
  const buyerPhone = document.getElementById('sellPhone').value.trim();
  const advMode    = isFull ? '' : document.getElementById('sellAdvanceMode').value;
  const finalMode  = isFull ? document.getElementById('sellFinalMode').value : '';
  const saleWeight = document.getElementById('sellWeight').value;
  const palaiDays  = parseInt(document.getElementById('sellPalaiDays').value) || 0;
  const palaiRate  = parseFloat(document.getElementById('sellPalaiRate').value) || 150;
  const actualWt   = parseFloat(saleWeight) || 0;
  const sp         = inputRate > 0 && actualWt > 0 ? Math.round(inputRate * actualWt) : 0;
  const effectiveCost = cost;
  const isBooked   = !isFull && advance > 0 && advance < sp;
  const takeToday  = isFull ? (document.getElementById('sellTakeToday')?.checked ?? true) : false;
  const showErr    = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); };

  if (!inputRate || inputRate <= 0) return showErr('⚠️ Rate per kg must be greater than 0.');
  if (!actualWt || actualWt <= 0)   return showErr('⚠️ Sale weight is required.');
  if (sp > 10000000)   return showErr('⚠️ Selling price seems too high.');
  if (!buyerName)      return showErr('⚠️ Buyer name is required.');
  if (!buyerPhone)     return showErr('⚠️ Buyer phone is required.');
  if (!/^[0-9+\-\s]{7,15}$/.test(buyerPhone)) return showErr('⚠️ Enter a valid phone number.');
  if (!isFull && advance <= 0) return showErr('⚠️ Enter an advance amount, or switch to Full Payment.');
  if (!isFull && advance >= sp) return showErr('⚠️ Advance cannot equal or exceed the selling price.');
  if (!isFull && !advMode) return showErr('⚠️ Please select advance payment mode.');
  if (isFull && !finalMode) return showErr('⚠️ Please select a payment mode.');
  const saleDate = document.getElementById('sellDate').value;
  if (!saleDate)          return showErr('⚠️ Sale date is required.');
  if (saleDate > today()) return showErr('⚠️ Sale date cannot be in the future.');
  if (sp < effectiveCost && !confirm(`⚠️ Selling at a LOSS of ₹${fmt(Math.round(effectiveCost - sp))}. Are you sure?`)) return;

  setLoading('confirmSaleBtn', true);
  try {
    const res  = await fetch(`/api/goats/${id}/sell`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selling_price: sp, buyer_name: buyerName, buyer_phone: buyerPhone,
        sale_date: saleDate, sale_weight_kg: saleWeight || null,
        advance_amount: advance, advance_mode: advMode, final_payment_mode: finalMode,
        palai_days: palaiDays, palai_rate: palaiRate, take_today: takeToday })
    });
    const data = await res.json();
    if (!res.ok) { showErr(data.error); setLoading('confirmSaleBtn', false); return; }
    closeModal('sellModal');
    const profit = sp - effectiveCost;
    const palaiNote = palaiDays > 0 ? ` · Palai ${palaiDays}d = ₹${fmt(palaiDays * palaiRate)}` : '';
    if (isBooked) {
      showToast(`🔖 ${goatId} booked — ₹${fmt(advance)} advance, ₹${fmt(sp - advance)} remaining`, 'info', 5000);
    } else if (takeToday) {
      showToast(profit >= 0 ? `📦 ${goatId} sold & out — Profit: ₹${fmt(Math.round(profit))} 🎉${palaiNote}` : `📦 ${goatId} sold & out — Loss: ₹${fmt(Math.round(Math.abs(profit)))}`,
        profit >= 0 ? 'success' : 'warning', 5000);
    } else {
      showToast(profit >= 0 ? `✅ ${goatId} sold, keeping in yard — Profit: ₹${fmt(Math.round(profit))} 🎉` : `✅ ${goatId} sold, in yard — Loss: ₹${fmt(Math.round(Math.abs(profit)))}`,
        profit >= 0 ? 'success' : 'warning', 5000);
    }
    await loadStock();
    loadDashboard();
  } catch (err) {
    showErr('Network error: ' + err.message);
    setLoading('confirmSaleBtn', false);
  }
}

// ── View Goat Details ────────────────────────────────────────
async function viewGoat(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat', 'error'); return; }

  const cost       = parseFloat(g.cost_price || 0);
  const extra      = parseFloat(g.extra_costs || 0);
  const totalCost  = cost + extra;
  const sp         = parseFloat(g.selling_price || 0);
  const profit     = sp > 0 ? sp - totalCost : null;
  const wt         = parseFloat(g.sale_weight_kg || g.weight_kg || 0);
  const purchDate  = g.purchase_date ? String(g.purchase_date).slice(0,10) : '—';
  const saleDate   = g.sale_date     ? String(g.sale_date).slice(0,10)     : '—';
  const expWtMatch = (g.notes || '').match(/Exp\.wt\s+([\d.]+)kg/);
  const expWt      = expWtMatch ? parseFloat(expWtMatch[1]) : null;
  const isInYard   = g.status === 'sold' && (g.delivery_status === 'in_yard' || !g.delivery_status);
  const isDelivered = g.delivery_status === 'delivered';
  const holdStart  = g.holding_start_date || g.sale_date;
  const holdDays   = (isInYard && holdStart)
    ? Math.max(0, Math.round((new Date() - new Date(holdStart)) / 86400000))
    : (isDelivered && holdStart && g.delivery_date)
    ? Math.max(0, Math.round((new Date(g.delivery_date) - new Date(holdStart)) / 86400000))
    : 0;
  const holdRate   = parseFloat(g.holding_rate || 150);
  const holdCharges = isDelivered ? parseFloat(g.holding_charges || 0) : holdDays * holdRate;

  const deliverySection = (isInYard || isDelivered) ? `
    <div class="form-section">📦 Delivery / Palai</div>
    <div class="view-grid">
      <div class="d-item"><span class="d-lbl">Status</span><span class="d-val">${isDelivered ? '📦 Out' : '🏠 In Yard'}</span></div>
      <div class="d-item"><span class="d-lbl">Agreed Palai Days</span><span class="d-val" style="color:var(--amber)">${parseInt(g.agreed_palai_days) > 0 ? parseInt(g.agreed_palai_days) + 'd' : 'Open'}</span></div>
      <div class="d-item"><span class="d-lbl">Palai Rate</span><span class="d-val">₹${fmt(holdRate)}/day</span></div>
      <div class="d-item"><span class="d-lbl">Holding Since</span><span class="d-val">${holdStart ? String(holdStart).slice(0,10) : '—'}</span></div>
      <div class="d-item"><span class="d-lbl">Days Held</span><span class="d-val">${holdDays}d</span></div>
      <div class="d-item"><span class="d-lbl">${isDelivered ? 'Palai Charges' : 'Accruing'}</span><span class="d-val">₹${fmt(holdCharges)}</span></div>
      ${isDelivered ? `<div class="d-item"><span class="d-lbl">Delivery Date</span><span class="d-val">${g.delivery_date ? String(g.delivery_date).slice(0,10) : '—'}</span></div>` : ''}
    </div>` : '';

  const saleSection = (g.status === 'sold' || g.status === 'booked') ? `
    <div class="form-section">💰 Sale Info</div>
    <div class="view-grid">
      <div class="d-item"><span class="d-lbl">Selling Price</span><span class="d-val">₹${fmt(sp)}</span></div>
      ${profit !== null ? `<div class="d-item"><span class="d-lbl">Profit</span><span class="d-val ${profit >= 0 ? 'profit-pos' : 'profit-neg'}">${profit >= 0 ? '+' : ''}₹${fmt(profit)}</span></div>` : ''}
      <div class="d-item"><span class="d-lbl">Sale Weight</span><span class="d-val">${g.sale_weight_kg ? g.sale_weight_kg + ' kg' : '—'}</span></div>
      <div class="d-item"><span class="d-lbl">Sale Date</span><span class="d-val">${saleDate}</span></div>
      <div class="d-item"><span class="d-lbl">Buyer</span><span class="d-val">${esc(g.buyer_name || '—')}</span></div>
      <div class="d-item"><span class="d-lbl">Phone</span><span class="d-val">${esc(g.buyer_phone || '—')}</span></div>
      ${parseFloat(g.advance_amount) > 0 ? `<div class="d-item"><span class="d-lbl">Advance</span><span class="d-val">₹${fmt(g.advance_amount)} (${esc(g.advance_mode || '')})</span></div>` : ''}
      ${g.final_payment_mode ? `<div class="d-item"><span class="d-lbl">Payment Mode</span><span class="d-val">${esc(g.final_payment_mode)}</span></div>` : ''}
    </div>` : '';

  document.getElementById('viewTitle').textContent = `🐐 ${g.goat_id}`;
  document.getElementById('viewContent').innerHTML = `
    ${g.photo ? `<img src="${g.photo}" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:12px" alt="goat" />` : ''}
    <div class="form-section">🐐 Identity</div>
    <div class="view-grid">
      <div class="d-item"><span class="d-lbl">Goat ID</span><span class="d-val">${esc(g.goat_id)}</span></div>
      <div class="d-item"><span class="d-lbl">Breed</span><span class="d-val">${esc(g.breed || '—')}</span></div>
      <div class="d-item"><span class="d-lbl">Status</span><span class="d-val">${g.status}</span></div>
      <div class="d-item"><span class="d-lbl">Purchase Date</span><span class="d-val">${purchDate}</span></div>
      <div class="d-item"><span class="d-lbl">Added By</span><span class="d-val">${esc(g.added_by || '—')}</span></div>
    </div>
    <div class="form-section">⚖️ Weight & Cost</div>
    <div class="view-grid">
      <div class="d-item"><span class="d-lbl">Buy Weight</span><span class="d-val">${g.weight_kg} kg</span></div>
      ${expWt !== null ? `<div class="d-item"><span class="d-lbl">Exp Weight</span><span class="d-val" style="color:var(--amber);font-weight:600">${expWt} kg</span></div>` : ''}
      <div class="d-item"><span class="d-lbl">Cost/kg</span><span class="d-val">₹${fmt(cost / parseFloat(g.weight_kg || 1))}/kg</span></div>
      <div class="d-item"><span class="d-lbl">Cost Price</span><span class="d-val">₹${fmt(cost)}</span></div>
      ${extra > 0 ? `<div class="d-item"><span class="d-lbl">Extra Costs</span><span class="d-val">₹${fmt(extra)}</span></div>` : ''}
      <div class="d-item"><span class="d-lbl">Total Cost</span><span class="d-val">₹${fmt(totalCost)}</span></div>
    </div>
    ${saleSection}
    ${deliverySection}
    ${g.notes ? `<div class="form-section">📝 Notes</div><p style="margin:8px 0 0;color:var(--text-2)">${esc(g.notes)}</p>` : ''}`;
  showModal('viewModal');
}

// ── Open Finalize Modal (collect remaining + palai → mark as delivered) ──
async function openFinalizeModal(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat', 'error'); return; }

  const isCollectible = g.status === 'booked' ||
    (g.status === 'sold' && (g.delivery_status === 'in_yard' || !g.delivery_status));
  if (!isCollectible) { showToast('This goat is already delivered', 'warning'); return; }

  const sp        = parseFloat(g.selling_price || 0);
  const advance   = parseFloat(g.advance_amount || 0);
  const remaining = sp - advance;
  const holdRate  = parseFloat(g.holding_rate || 150);
  const holdStart = g.holding_start_date || g.sale_date;
  const agreedDays = parseInt(g.agreed_palai_days || 0);

  document.getElementById('finalizeId').value           = id;
  document.getElementById('finalizeDeliveryDate').value = today();
  document.getElementById('finalizeHoldRate').value     = holdRate;
  document.getElementById('finalizeFinalMode').value    = '';
  document.getElementById('finalizeTotalAmt').value     = '';
  document.getElementById('finalizeSummaryBox').style.display = 'none';
  document.getElementById('finalizeFormErr').classList.add('hidden');
  setLoading('finalizeBtn', false);

  document.getElementById('finalizeDeliveryDate').dataset.holdStart  = holdStart || '';
  document.getElementById('finalizeDeliveryDate').dataset.salePrice  = sp;
  document.getElementById('finalizeDeliveryDate').dataset.advance    = advance;
  document.getElementById('finalizeDeliveryDate').dataset.agreedDays = agreedDays;

  const statusBadge = g.status === 'booked'
    ? `<span class="st-badge st-inyard-bal">🏠 In Yard · Balance Due</span>`
    : `<span class="st-badge st-inyard-paid">🏠 In Yard · Paid</span>`;

  document.getElementById('finalizeInfoBox').innerHTML = `
    <div class="d-item"><span class="d-lbl">Goat</span><span class="d-val">🐐 ${esc(g.goat_id)}</span></div>
    <div class="d-item"><span class="d-lbl">Status</span><span class="d-val">${statusBadge}</span></div>
    <div class="d-item"><span class="d-lbl">Buyer</span><span class="d-val">${esc(g.buyer_name || '—')}</span></div>
    <div class="d-item"><span class="d-lbl">Sale Price</span><span class="d-val">₹${fmt(sp)}</span></div>
    <div class="d-item"><span class="d-lbl">Advance Paid</span><span class="d-val">₹${fmt(advance)}</span></div>
    <div class="d-item"><span class="d-lbl">Balance</span><span class="d-val" style="color:var(--${remaining > 0 ? 'red' : 'green'})">${remaining > 0 ? '₹' + fmt(remaining) + ' due' : '✅ Fully paid'}</span></div>
    <div class="d-item"><span class="d-lbl">Palai Rate</span><span class="d-val">₹${fmt(holdRate)}/day</span></div>
    <div class="d-item"><span class="d-lbl">Agreed Palai Days</span><span class="d-val" style="color:${agreedDays > 0 ? 'var(--amber)' : 'var(--text-3)'}">${agreedDays > 0 ? agreedDays + 'd agreed' : 'Open — charged at delivery'}</span></div>
    <div class="d-item"><span class="d-lbl">In Yard Since</span><span class="d-val">${holdStart ? String(holdStart).slice(0,10) : '—'}</span></div>`;

  showModal('finalizeModal');
  updateFinalizePreview();
}

function updateFinalizePreview() {
  const delivDate  = document.getElementById('finalizeDeliveryDate').value;
  const holdRate   = parseFloat(document.getElementById('finalizeHoldRate').value) || 0;
  const holdStart  = document.getElementById('finalizeDeliveryDate').dataset.holdStart;
  const sp         = parseFloat(document.getElementById('finalizeDeliveryDate').dataset.salePrice) || 0;
  const advance    = parseFloat(document.getElementById('finalizeDeliveryDate').dataset.advance) || 0;
  const agreedDays = parseInt(document.getElementById('finalizeDeliveryDate').dataset.agreedDays) || 0;
  const remaining  = sp - advance;
  const sumEl      = document.getElementById('finalizeSummaryBox');
  const totalEl    = document.getElementById('finalizeTotalAmt');
  const modeLabel  = document.getElementById('finalizePayLabel');
  if (!delivDate) return;

  const actualDays   = holdStart ? Math.max(0, Math.round((new Date(delivDate) - new Date(holdStart)) / 86400000)) : 0;
  const palaiCharges = actualDays * holdRate;
  const total        = remaining + palaiCharges;

  totalEl.value = Math.round(total);
  if (modeLabel) modeLabel.textContent = total > 0 ? 'Payment Mode *' : 'Payment Mode (optional)';

  const agreedNote = agreedDays > 0
    ? `<div class="d-item"><span class="d-lbl">Agreed Days</span><span class="d-val" style="color:${actualDays > agreedDays ? 'var(--red)' : 'var(--green)'}">${agreedDays}d agreed · ${actualDays}d actual${actualDays > agreedDays ? ` ⚠️ +${actualDays - agreedDays}d over` : ' ✅'}</span></div>`
    : `<div class="d-item"><span class="d-lbl">Agreed Days</span><span class="d-val" style="color:var(--text-3)">Open (charged at delivery)</span></div>`;

  sumEl.style.display = '';
  sumEl.innerHTML = `
    ${agreedNote}
    <div class="d-item"><span class="d-lbl">Actual Days in Yard</span><span class="d-val">${actualDays}d × ₹${fmt(holdRate)}/day</span></div>
    <div class="d-item"><span class="d-lbl">Palai Charges</span><span class="d-val" style="color:var(--red)">₹${fmt(palaiCharges)}</span></div>
    <div class="d-item"><span class="d-lbl">Remaining Balance</span><span class="d-val">₹${fmt(remaining)}</span></div>
    <div class="d-item" style="border-top:1px solid var(--border);padding-top:6px;margin-top:4px"><span class="d-lbl" style="font-weight:700">Total to Collect</span><span class="d-val" style="font-weight:700;font-size:1.1rem;color:var(--${total > 0 ? 'red' : 'green'})">₹${fmt(Math.round(total))}</span></div>`;
}

// ── Finalize Sale (form submit) ──────────────────────────────
async function finalizeSale(e) {
  e.preventDefault();
  const id        = document.getElementById('finalizeId').value;
  const mode      = document.getElementById('finalizeFinalMode').value;
  const delivDate = document.getElementById('finalizeDeliveryDate').value;
  const holdRate  = parseFloat(document.getElementById('finalizeHoldRate').value) || 0;
  const total     = parseFloat(document.getElementById('finalizeTotalAmt').value) || 0;
  const errEl     = document.getElementById('finalizeFormErr');
  errEl.classList.add('hidden');

  if (!delivDate) { errEl.textContent = '⚠️ Delivery date is required.'; errEl.classList.remove('hidden'); return; }
  if (delivDate > today()) { errEl.textContent = '⚠️ Delivery date cannot be in the future.'; errEl.classList.remove('hidden'); return; }
  if (total > 0 && !mode) { errEl.textContent = '⚠️ Please select a payment mode.'; errEl.classList.remove('hidden'); return; }

  setLoading('finalizeBtn', true);
  try {
    const res = await fetch(`/api/goats/${id}/finalize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_payment_mode: mode, delivery_date: delivDate, holding_rate: holdRate })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.remove('hidden'); setLoading('finalizeBtn', false); return; }
    closeModal('finalizeModal');
    const palaiTxt = data.holding_charges > 0 ? ` · Palai ₹${fmt(data.holding_charges)} (${data.holding_days}d)` : '';
    showToast(`📦 Released! Collected: ₹${fmt(Math.round(total))}${palaiTxt}`, 'success', 5000);
    await loadStock();
    loadDashboard();
    if (typeof loadSold === 'function') loadSold();
  } catch (err) {
    errEl.textContent = 'Network error: ' + err.message;
    errEl.classList.remove('hidden'); setLoading('finalizeBtn', false);
  }
}


// ── Undo Sale ────────────────────────────────────────────────
async function undoSale(id, btn) {
  if (!confirm('↩ Undo this sale? The goat will return to Available stock.')) return;
  if (btn) btn.disabled = true;
  try {
    const res  = await fetch(`/api/goats/${id}/unsell`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to undo sale', 'error'); if (btn) btn.disabled = false; return; }
    showToast('↩ Sale undone — goat returned to stock', 'info', 3000);
    await loadStock();
    loadDashboard();
    if (typeof loadSold === 'function') loadSold();
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

