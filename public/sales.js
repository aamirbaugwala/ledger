// ═══════════════════════════════════════════════════════════
//  sales.js — Sales tab: table view with filter/sort/export
// ═══════════════════════════════════════════════════════════

let _salesData    = [];   // full data from API
let _salesFiltered = [];  // after filters applied
let _salesSort    = { col: 'sale_date', dir: 'desc' };

// ── Quick Out ────────────────────────────────────────────────
let _quickOutId      = null;
let _quickOutPayMode = '';

async function quickOut(id) {
  _quickOutId      = id;
  _quickOutPayMode = '';
  document.querySelectorAll('.qpm-btn').forEach(b => b.classList.remove('qpm-active'));
  document.getElementById('quickOutErr').classList.add('hidden');
  document.getElementById('quickOutSummary').innerHTML =
    `<div class="qout-summary" style="color:var(--text-3);text-align:center">Loading…</div>`;
  showModal('quickOutModal');

  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat', 'error'); closeModal('quickOutModal'); return; }

  const sp          = parseFloat(g.selling_price || 0);
  const advance     = parseFloat(g.advance_amount || 0);
  const remaining   = sp - advance;
  const holdStart   = g.holding_start_date || g.sale_date;
  const holdRate    = parseFloat(g.holding_rate || 150);
  const holdDays    = holdStart
    ? Math.max(0, Math.round((new Date() - new Date(holdStart)) / 86400000))
    : 0;
  const palaiCharges = holdDays * holdRate;
  const totalCollect = remaining + palaiCharges;
  const isBooked     = g.status === 'booked';

  // Hide payment section if nothing to collect
  document.getElementById('quickOutPaySection').style.display = totalCollect > 0 ? '' : 'none';

  document.getElementById('quickOutSummary').innerHTML = `
    <div class="qout-summary">
      <div class="qout-goat-id">🐐 ${esc(g.goat_id)}${g.buyer_name ? ` · ${esc(g.buyer_name)}` : ''}</div>
      <div class="qout-row"><span>💰 Sale Price</span><span><strong>₹${fmt(sp)}</strong></span></div>
      ${advance > 0 ? `<div class="qout-row"><span>✅ Advance paid</span><span>₹${fmt(advance)}</span></div>` : ''}
      ${remaining > 0 ? `<div class="qout-row"><span>💸 Balance</span><span style="color:var(--red)"><strong>₹${fmt(remaining)}</strong></span></div>` : ''}
      ${holdDays > 0
        ? `<div class="qout-row"><span>🏠 Palai (${holdDays}d × ₹${fmt(holdRate)})</span><span style="color:#ea580c"><strong>₹${fmt(palaiCharges)}</strong></span></div>`
        : `<div class="qout-row" style="color:var(--text-3)"><span>🏠 Palai</span><span>Same day — no charges</span></div>`}
      ${totalCollect > 0
        ? `<div class="qout-total">💰 Total to collect: ₹${fmt(Math.round(totalCollect))}</div>`
        : `<div class="qout-total" style="color:var(--green-deeper)">✅ Nothing to collect — fully settled</div>`}
    </div>`;
}

function selectQuickPayMode(mode) {
  _quickOutPayMode = mode === 'skip' ? '' : mode;
  document.querySelectorAll('.qpm-btn').forEach(b => b.classList.remove('qpm-active'));
  document.getElementById(`qpm-${mode}`)?.classList.add('qpm-active');
}

async function confirmQuickOut() {
  if (!_quickOutId) return;
  const errEl = document.getElementById('quickOutErr');
  errEl.classList.add('hidden');
  setLoading('quickOutBtn', true);

  const res  = await fetch(`/api/goats/${_quickOutId}/finalize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ final_payment_mode: _quickOutPayMode })
  });
  const data = await res.json();
  setLoading('quickOutBtn', false);

  if (!res.ok) {
    errEl.textContent = '⚠️ ' + (data.error || 'Failed');
    errEl.classList.remove('hidden');
    return;
  }
  closeModal('quickOutModal');
  const palaiMsg = data.holding_charges > 0
    ? ` · Palai: ₹${fmt(data.holding_charges)} (${data.holding_days}d)` : '';
  showToast(`📦 Goat out!${palaiMsg}`, 'success', 4000);
  await loadSold();
  loadDashboard();
}

// ── Load ────────────────────────────────────────────────────
async function loadSold() {
  const container = document.getElementById('soldList');
  container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-3)">Loading sales…</div>`;
  // Fetch ALL goats then exclude available — so booked goats show in sales tab too
  const all = await api('/api/goats') || [];
  _salesData = all.filter(g => g.status === 'sold' || g.status === 'booked');
  _applyFiltersAndSort();
}

// ── Filter controls (read from DOM) ─────────────────────────
function filterSold() { _applyFiltersAndSort(); }

function _applyFiltersAndSort() {
  const q       = (document.getElementById('soldSearch')?.value || '').toLowerCase();
  const status  = document.getElementById('salesFilterStatus')?.value  || '';
  const payment = document.getElementById('salesFilterPayment')?.value || '';
  const dateFrom = document.getElementById('salesDateFrom')?.value || '';
  const dateTo   = document.getElementById('salesDateTo')?.value   || '';

  _salesFiltered = _salesData.filter(g => {
    const saleDate = g.sale_date ? String(g.sale_date).slice(0,10) : '';
    const matchQ = !q ||
      g.goat_id.toLowerCase().includes(q) ||
      (g.buyer_name  || '').toLowerCase().includes(q) ||
      (g.breed       || '').toLowerCase().includes(q) ||
      (g.buyer_phone || '').toLowerCase().includes(q);
    const matchStatus  = !status
      || (status === 'in_yard' && (g.status === 'booked' || (g.status === 'sold' && (g.delivery_status === 'in_yard' || !g.delivery_status))))
      || (status === 'booked'  && g.status === 'booked')
      || (status === 'sold'    && g.status === 'sold' && g.delivery_status === 'delivered');
    const matchPayment = !payment || g.final_payment_mode === payment || g.advance_mode === payment;
    const matchFrom    = !dateFrom || saleDate >= dateFrom;
    const matchTo      = !dateTo   || saleDate <= dateTo;
    return matchQ && matchStatus && matchPayment && matchFrom && matchTo;
  });

  // Sort
  const { col, dir } = _salesSort;
  _salesFiltered.sort((a, b) => {
    let va, vb;
    if (col === 'profit') {
      const costA = parseFloat(a.cost_price) + parseFloat(a.extra_costs || 0);
      const costB = parseFloat(b.cost_price) + parseFloat(b.extra_costs || 0);
      va = parseFloat(a.selling_price) - costA;
      vb = parseFloat(b.selling_price) - costB;
    } else if (col === 'weight_kg') {
      va = parseFloat(a.sale_weight_kg || a.weight_kg || 0);
      vb = parseFloat(b.sale_weight_kg || b.weight_kg || 0);
    } else if (col === 'selling_price') {
      va = parseFloat(a.selling_price); vb = parseFloat(b.selling_price);
    } else if (col === 'sale_date') {
      va = a.sale_date || ''; vb = b.sale_date || '';
    } else {
      va = (a[col] || '').toString().toLowerCase();
      vb = (b[col] || '').toString().toLowerCase();
    }
    if (va < vb) return dir === 'asc' ? -1 :  1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });

  renderSalesTable(_salesFiltered);
}

function _setSalesSort(col) {
  if (_salesSort.col === col) {
    _salesSort.dir = _salesSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _salesSort.col = col;
    _salesSort.dir = col === 'sale_date' ? 'desc' : 'asc';
  }
  _applyFiltersAndSort();
}

function _sortIcon(col) {
  if (_salesSort.col !== col) return `<span class="sort-icon">↕</span>`;
  return `<span class="sort-icon active">${_salesSort.dir === 'asc' ? '↑' : '↓'}</span>`;
}

// ── Render table ─────────────────────────────────────────────
function renderSalesTable(goats) {
  const container = document.getElementById('soldList');

  // Summary bar totals
  const totalRev     = goats.reduce((s, g) => s + parseFloat(g.selling_price || 0), 0);
  const totalCostAll = goats.reduce((s, g) => s + parseFloat(g.cost_price || 0) + parseFloat(g.extra_costs || 0), 0);
  const totalProfit  = totalRev - totalCostAll;   // Palai is NOT part of profit — tracked separately
  const pending      = goats.filter(g => g.status === 'booked').length;
  const fullyPaid    = goats.filter(g => g.status === 'sold').length;
  const totalPending = goats.filter(g => g.status === 'booked')
                            .reduce((s, g) => s + parseFloat(g.selling_price || 0) - parseFloat(g.advance_amount || 0), 0);
  const avgProfit    = goats.length ? (totalProfit / goats.length) : 0;
  const margin       = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : 0;
  // Extra insights
  const winCount     = goats.filter(g => (parseFloat(g.selling_price||0) - parseFloat(g.cost_price||0) - parseFloat(g.extra_costs||0)) >= 0).length;
  const lossCount    = goats.length - winCount;
  const totalWt      = goats.reduce((s, g) => s + parseFloat(g.sale_weight_kg || g.weight_kg || 0), 0);
  const totalCostInv = totalCostAll;
  const avgRateKg    = totalWt > 0 ? Math.round(totalRev / totalWt) : 0;
  const bestGoat     = goats.reduce((best, g) => {
    const p = parseFloat(g.selling_price||0) - parseFloat(g.cost_price||0) - parseFloat(g.extra_costs||0);
    return (!best || p > best.p) ? { id: g.goat_id, p } : best;
  }, null);
  // Palai totals
  const totalPalaiCollected = goats.filter(g => g.delivery_status === 'delivered')
    .reduce((s, g) => s + parseFloat(g.holding_charges || 0), 0);
  // In-yard (sold but not yet physically delivered)
  const inYardGoats  = goats.filter(g => g.status === 'sold' && (g.delivery_status === 'in_yard' || !g.delivery_status));
  const inYardCount  = inYardGoats.length;
  const inYardAccruing = inYardGoats.reduce((s, g) => {
    const start = g.holding_start_date || g.sale_date;
    const days  = start ? Math.max(0, Math.round((new Date() - new Date(start)) / 86400000)) : 0;
    return s + days * parseFloat(g.holding_rate || 150);
  }, 0);

  if (!goats.length) {
    container.innerHTML = `
      <div class="sales-summary-bar">
        <div class="ssb-item"><span class="ssb-label">Showing</span><span class="ssb-val">0 records</span></div>
      </div>
      <div class="empty-state">
        <span class="ei">💰</span>
        <h3>No sales match your filters</h3>
        <p>Try adjusting your search or filters</p>
      </div>`;
    return;
  }

  const rows = goats.map(g => {
    const cost       = parseFloat(g.cost_price || 0);
    const extra      = parseFloat(g.extra_costs || 0);
    const totalCost  = cost + extra;
    const sellPrice  = parseFloat(g.selling_price || 0);
    const profit     = sellPrice - totalCost;
    const marginPct  = totalCost > 0 ? ((profit / totalCost) * 100).toFixed(0) : 0;
    const advance    = parseFloat(g.advance_amount || 0);
    const remaining  = sellPrice - advance;
    const wt         = parseFloat(g.sale_weight_kg || g.weight_kg || 0);
    const pricePerKg = wt > 0 ? Math.round(sellPrice / wt) : null;
    const saleDate   = g.sale_date ? String(g.sale_date).slice(0,10) : '—';
    const isBooked   = g.status === 'booked';
    const profitCls  = profit >= 0 ? 'profit-pos' : 'profit-neg';

    // Delivery tracking — treat NULL delivery_status on sold goats as in_yard
    const isInYard   = g.status === 'sold' && (g.delivery_status === 'in_yard' || !g.delivery_status);
    const isDelivered = g.delivery_status === 'delivered';
    const holdStart  = g.holding_start_date || g.sale_date;
    const holdDays   = (isInYard && holdStart)
      ? Math.max(0, Math.round((new Date() - new Date(holdStart)) / 86400000))
      : (isDelivered && holdStart && g.delivery_date)
      ? Math.max(0, Math.round((new Date(g.delivery_date) - new Date(holdStart)) / 86400000))
      : 0;
    const holdRate    = parseFloat(g.holding_rate || 150);
    const agreedDays  = parseInt(g.agreed_palai_days || 0);
    const holdCharges = isDelivered
      ? parseFloat(g.holding_charges || 0)
      : isInYard ? holdDays * holdRate : 0;

    // ── Unified status badge ─────────────────────────────────
    let statusBadge;
    if (isBooked) {
      const agreedNote = agreedDays > 0 ? `Agreed ${agreedDays}d palai` : `Palai open`;
      statusBadge = `
        <span class="st-badge st-inyard-bal">🏠 In Yard</span>
        <div class="hide-mobile" style="margin-top:3px"><span class="stc-sub" style="color:#b45309;font-weight:700">Balance Due</span></div>
        <div class="hide-mobile" style="margin-top:2px"><span class="stc-sub hold-days">${holdDays}d · ₹${fmt(holdCharges)} palai</span></div>
        <div class="hide-mobile" style="margin-top:1px"><span class="stc-sub" style="color:#78350f">${agreedNote} @ ₹${fmt(holdRate)}/d</span></div>`;
    } else if (isInYard) {
      const agreedNote = agreedDays > 0 ? `Agreed ${agreedDays}d palai` : `Palai open`;
      statusBadge = `
        <span class="st-badge st-inyard-paid">🏠 In Yard</span>
        <div class="hide-mobile" style="margin-top:3px"><span class="stc-sub" style="color:#1d4ed8;font-weight:700">Paid · Palai Pending</span></div>
        <div class="hide-mobile" style="margin-top:2px"><span class="stc-sub hold-days">${holdDays}d · ₹${fmt(holdCharges)} accrued</span></div>
        <div class="hide-mobile" style="margin-top:1px"><span class="stc-sub" style="color:#1e40af">${agreedNote} @ ₹${fmt(holdRate)}/d</span></div>`;
    } else if (isDelivered) {
      const delDate = g.delivery_date ? String(g.delivery_date).slice(0,10) : '—';
      statusBadge = `
        <span class="st-badge st-out">📦 Out</span>
        <div class="hide-mobile" style="margin-top:3px"><span class="stc-sub">${delDate}</span></div>
        ${holdCharges > 0 ? `<div class="hide-mobile" style="margin-top:2px"><span class="stc-sub">Held ${holdDays}d · ₹${fmt(holdCharges)}</span></div>` : ''}`;
    } else {
      statusBadge = `<span class="st-badge st-sold">✅ Sold</span>`;
    }

    const wtCell = wt > 0
      ? `<span class="stc-main">${wt} kg</span>${pricePerKg ? `<span class="stc-sub">₹${fmt(pricePerKg)}/kg</span>` : ''}`
      : `<span class="stc-muted">—</span>`;

    const finCell = `
      <span class="stc-main">₹${fmt(sellPrice)}</span>
      <span class="stc-sub">Cost ₹${fmt(cost)}${extra > 0 ? ` + ₹${fmt(extra)}` : ''}</span>`;

    const profitCell = `
      <span class="stc-main ${profitCls}">${profit >= 0 ? '+' : ''}₹${fmt(profit)}</span>
      <span class="stc-sub ${profit >= 0 ? 'profit-pos' : 'profit-neg'}">${profit >= 0 ? '▲' : '▼'} ${Math.abs(marginPct)}% margin</span>`;

    // Palai is separate income — NOT included in profit
    const palaiCell = holdCharges > 0
      ? `<span class="stc-main" style="color:#ea580c">₹${fmt(Math.round(holdCharges))}</span>
         <span class="stc-sub">${holdDays}d × ₹${fmt(holdRate)}/d${(isInYard || isBooked) ? ' <em>est.</em>' : ''}</span>`
      : agreedDays > 0
      ? `<span class="stc-muted" style="font-size:0.72rem">${agreedDays}d agreed<br>pending delivery</span>`
      : `<span class="stc-muted">—</span>`;

    const buyerCell = g.buyer_name
      ? `<span class="stc-main">${esc(g.buyer_name)}</span>${g.buyer_phone ? `<span class="stc-sub">📞 ${esc(g.buyer_phone)}</span>` : ''}`
      : `<span class="stc-muted">—</span>`;

    let payCell;
    if (isBooked) {
      payCell = advance > 0
        ? `<span class="stc-main pay-adv-badge">Adv ₹${fmt(advance)}</span><span class="stc-sub pay-due">₹${fmt(remaining)} due</span>`
        : `<span class="stc-main pay-due">₹${fmt(remaining)} due</span>`;
    } else {
      const mode = g.final_payment_mode || g.advance_mode || '';
      payCell = mode
        ? `<span class="stc-main"><span class="pay-badge">${esc(mode)}</span></span>${advance > 0 && g.advance_mode ? `<span class="stc-sub">Adv ₹${fmt(advance)}</span>` : ''}`
        : `<span class="stc-muted">—</span>`;
    }

    const tagCell = `
      <span class="goat-tag-sm">🐐 ${esc(g.goat_id)}</span>
      ${g.breed ? `<span class="stc-sub">${esc(g.breed)}</span>` : ''}`;

    const actionBtn = (isBooked || isInYard)
      ? `<button class="btn btn-primary btn-sm" onclick="quickOut(${g.id})" title="Mark as Out">📦 Out</button>`
      : `<button class="btn btn-gray btn-sm" onclick="undoSale(${g.id}, this)" title="Undo Sale">↩</button>`;

    return `<tr class="${isBooked ? 'row-inyard-bal' : isInYard ? 'row-inyard-paid' : ''}">
      <td>${tagCell}</td>
      <td>${statusBadge}</td>
      <td>${wtCell}</td>
      <td>${finCell}</td>
      <td>${profitCell}</td>
      <td class="col-hide-mobile">${palaiCell}</td>
      <td class="col-hide-mobile">${buyerCell}</td>
      <td class="col-hide-mobile">${payCell}</td>
      <td class="col-hide-mobile"><span class="stc-main">${saleDate}</span></td>
      <td>
        <div class="tbl-actions">
          ${actionBtn}
          <button class="btn btn-wa btn-sm" onclick="sendWhatsApp(${g.id})" title="WhatsApp Receipt">📱</button>
          <button class="btn btn-gray btn-sm" onclick="viewGoat(${g.id})" title="View Details">👁</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGoat(${g.id}, 'sold')" title="Delete">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="sales-summary-bar">
      <div class="ssb-item"><span class="ssb-label">Showing</span><span class="ssb-val">${goats.length} of ${_salesData.length}</span></div>
      <div class="ssb-item"><span class="ssb-label">Revenue</span><span class="ssb-val">₹${fmt(totalRev)}</span></div>
      <div class="ssb-item"><span class="ssb-label">Cost Invested</span><span class="ssb-val">₹${fmt(totalCostInv)}</span></div>
      <div class="ssb-item"><span class="ssb-label">Profit</span><span class="ssb-val ${totalProfit >= 0 ? 'profit-pos' : 'profit-neg'}">${totalProfit >= 0 ? '+' : ''}₹${fmt(totalProfit)}</span></div>
      <div class="ssb-item"><span class="ssb-label">Margin</span><span class="ssb-val">${margin}%</span></div>
      <div class="ssb-item"><span class="ssb-label">Avg Profit</span><span class="ssb-val ${avgProfit >= 0 ? 'profit-pos' : 'profit-neg'}">${avgProfit >= 0 ? '+' : ''}₹${fmt(Math.round(avgProfit))}</span></div>
      <div class="ssb-item"><span class="ssb-label">Win/Loss</span><span class="ssb-val"><span class="profit-pos">${winCount}✅</span> / <span class="profit-neg">${lossCount}📉</span></span></div>
      ${bestGoat ? `<div class="ssb-item"><span class="ssb-label">Best Sale</span><span class="ssb-val profit-pos">${esc(bestGoat.id)} +₹${fmt(bestGoat.p)}</span></div>` : ''}
      ${totalWt > 0 ? `<div class="ssb-item"><span class="ssb-label">Total Wt</span><span class="ssb-val">${totalWt.toFixed(1)} kg · ₹${fmt(avgRateKg)}/kg</span></div>` : ''}
      <div class="ssb-item"><span class="ssb-label">Paid</span><span class="ssb-val">${fullyPaid}</span></div>
      ${totalPalaiCollected > 0 ? `<div class="ssb-item" style="border-left:2px solid #ea580c"><span class="ssb-label" style="color:#ea580c">🏠 Palai Collected</span><span class="ssb-val" style="color:#ea580c">₹${fmt(Math.round(totalPalaiCollected))}</span></div>` : ''}
      <div class="ssb-item ssb-warn"><span class="ssb-label">⏳ Pending</span><span class="ssb-val">${pending} · ₹${fmt(totalPending)}</span></div>
      ${inYardCount > 0 ? `<div class="ssb-item ssb-inyard"><span class="ssb-label">🏠 In Yard</span><span class="ssb-val">${inYardCount} · ₹${fmt(inYardAccruing)} due</span></div>` : ''}
      <button class="btn btn-gray btn-sm ssb-export" onclick="exportSalesCSV()">⬇ CSV</button>
    </div>
    <div class="sales-table-wrap">
      <table class="sales-table">
        <thead>
          <tr>
            <th onclick="_setSalesSort('goat_id')" class="sortable">Tag / Breed ${_sortIcon('goat_id')}</th>
            <th onclick="_setSalesSort('status')"   class="sortable">Status ${_sortIcon('status')}</th>
            <th onclick="_setSalesSort('weight_kg')" class="sortable">Weight ${_sortIcon('weight_kg')}</th>
            <th onclick="_setSalesSort('selling_price')" class="sortable num">Price / Cost ${_sortIcon('selling_price')}</th>
            <th onclick="_setSalesSort('profit')"   class="sortable num">Profit / Margin ${_sortIcon('profit')}</th>
            <th class="num col-hide-mobile">Palai</th>
            <th onclick="_setSalesSort('buyer_name')" class="sortable col-hide-mobile">Buyer ${_sortIcon('buyer_name')}</th>
            <th class="col-hide-mobile">Payment</th>
            <th onclick="_setSalesSort('sale_date')" class="sortable col-hide-mobile">Date ${_sortIcon('sale_date')}</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Deliver modal ────────────────────────────────────────────
async function openDeliverModal(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }

  const holdStart   = g.holding_start_date || g.sale_date;
  const holdRate    = parseFloat(g.holding_rate || 150);
  const sp          = parseFloat(g.selling_price || 0);
  const advance     = parseFloat(g.advance_amount || 0);
  const alreadyPaid = advance; // sale payment collected so far
  // Estimate palai using agreed rate × today's days (exact will be calculated at delivery)
  const daysEst     = holdStart ? Math.max(0, Math.round((new Date() - new Date(holdStart)) / 86400000)) : 0;
  const palaiEst    = daysEst * holdRate;
  const grandEst    = sp + palaiEst;
  const outstanding = grandEst - alreadyPaid;

  document.getElementById('deliverId').value    = id;
  document.getElementById('deliverDate').value  = today();
  document.getElementById('deliverRate').value  = holdRate;
  document.getElementById('deliverFormErr').classList.add('hidden');
  document.getElementById('deliverPreview').classList.add('hidden');
  setLoading('deliverBtn', false);

  document.getElementById('deliverInfoBox').innerHTML = `
    <div class="d-item"><span class="d-lbl">Goat</span><span class="d-val">🐐 ${esc(g.goat_id)}</span></div>
    <div class="d-item"><span class="d-lbl">Buyer</span><span class="d-val">${esc(g.buyer_name || '—')}</span></div>
    <div class="d-item"><span class="d-lbl">Sale Price</span><span class="d-val">₹${fmt(sp)}</span></div>
    <div class="d-item"><span class="d-lbl">Advance Paid</span><span class="d-val">₹${fmt(advance)}</span></div>
    <div class="d-item"><span class="d-lbl">Palai Rate</span><span class="d-val">₹${fmt(holdRate)}/day</span></div>
    <div class="d-item"><span class="d-lbl">Holding Since</span><span class="d-val">📅 ${holdStart ? String(holdStart).slice(0,10) : '—'}</span></div>`;

  // Show/hide payment collection section based on outstanding balance
  const paySection = document.getElementById('deliverPaySection');
  const collectEl  = document.getElementById('deliverCollectAmt');
  if (outstanding > 0) {
    paySection.style.display = '';
    collectEl.value = Math.round(outstanding);
    document.getElementById('deliverPaySummary').textContent =
      `Advance: ₹${fmt(advance)}  ·  Est. Palai: ₹${fmt(palaiEst)}  ·  Outstanding ≈ ₹${fmt(Math.round(outstanding))}`;
  } else {
    paySection.style.display = 'none';
    collectEl.value = '';
  }
  // Store data for preview calc
  document.getElementById('deliverDate').dataset.holdStart  = holdStart || '';
  document.getElementById('deliverDate').dataset.salePrice  = sp;
  document.getElementById('deliverDate').dataset.advance    = advance;
  showModal('deliverModal');
  updateDeliverPreview();
}

function updateDeliverPreview() {
  const deliverDate = document.getElementById('deliverDate').value;
  const rate        = parseFloat(document.getElementById('deliverRate').value) || 0;
  const holdStart   = document.getElementById('deliverDate').dataset.holdStart;
  const sp          = parseFloat(document.getElementById('deliverDate').dataset.salePrice) || 0;
  const advance     = parseFloat(document.getElementById('deliverDate').dataset.advance) || 0;
  const el          = document.getElementById('deliverPreview');
  const collectEl   = document.getElementById('deliverCollectAmt');

  if (deliverDate && holdStart) {
    const days         = Math.max(0, Math.round((new Date(deliverDate) - new Date(holdStart)) / 86400000));
    const palaiCharges = days * rate;
    const grandTotal   = sp + palaiCharges;
    const outstanding  = grandTotal - advance;

    if (outstanding > 0 && collectEl) collectEl.value = Math.round(outstanding);
    const paySection = document.getElementById('deliverPaySection');
    if (paySection) paySection.style.display = outstanding > 0 ? '' : 'none';

    el.textContent = days === 0
      ? `✅ Delivered same day — no holding charges  ·  Collect: ₹${fmt(sp - advance)}`
      : `🏠 Palai: ${days}d × ₹${fmt(rate)} = ₹${fmt(palaiCharges)}  ·  Grand Total: ₹${fmt(grandTotal)}  ·  Collect: ₹${fmt(Math.round(outstanding))}`;
    el.className = `profit-preview ${palaiCharges > 0 ? 'neg' : 'pos'}`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

async function confirmDelivery(e) {
  e.preventDefault();
  const id        = document.getElementById('deliverId').value;
  const errEl     = document.getElementById('deliverFormErr');
  const delDate   = document.getElementById('deliverDate').value;
  const rate      = parseFloat(document.getElementById('deliverRate').value);
  const holdStart = document.getElementById('deliverDate').dataset.holdStart;
  const sp        = parseFloat(document.getElementById('deliverDate').dataset.salePrice) || 0;
  const advance   = parseFloat(document.getElementById('deliverDate').dataset.advance) || 0;
  const payMode   = document.getElementById('deliverPayMode')?.value || '';
  errEl.classList.add('hidden');

  if (!delDate)   { errEl.textContent = '⚠️ Delivery date is required.'; errEl.classList.remove('hidden'); return; }
  if (delDate > today()) { errEl.textContent = '⚠️ Delivery date cannot be in the future.'; errEl.classList.remove('hidden'); return; }
  if (holdStart && delDate < holdStart) { errEl.textContent = '⚠️ Delivery date cannot be before the holding start date.'; errEl.classList.remove('hidden'); return; }

  const days         = Math.max(0, Math.round((new Date(delDate) - new Date(holdStart)) / 86400000));
  const palaiCharges = days * (rate || 0);
  const grandTotal   = sp + palaiCharges;
  const outstanding  = grandTotal - advance;

  if (outstanding > 0 && !payMode) {
    errEl.textContent = '⚠️ Please select payment mode for the outstanding amount.';
    errEl.classList.remove('hidden'); return;
  }

  setLoading('deliverBtn', true);
  try {
    const res  = await fetch(`/api/goats/${id}/deliver`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery_date: delDate, holding_rate: rate, pay_mode: payMode })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.remove('hidden'); setLoading('deliverBtn', false); return; }
    closeModal('deliverModal');
    const msg = data.holding_charges > 0
      ? `📦 Delivered · Palai: ₹${fmt(data.holding_charges)} (${data.holding_days}d)  ·  Total collected: ₹${fmt(Math.round(grandTotal))}`
      : `📦 Goat delivered — no holding charges`;
    showToast(msg, data.holding_charges > 0 ? 'warning' : 'success', 5000);
    await loadSold();
    loadDashboard();
  } catch (err) {
    errEl.textContent = 'Network error: ' + err.message;
    errEl.classList.remove('hidden'); setLoading('deliverBtn', false);
  }
}

// ── CSV Export ───────────────────────────────────────────────
function exportSalesCSV() {
  if (!_salesFiltered.length) { showToast('No data to export', 'warning'); return; }
  const headers = ['Goat ID','Breed','Status','Delivery Status','Purchase Date','Buy Weight (kg)','Sale Weight (kg)',
    'Cost Price (₹)','Extra Costs (₹)','Total Cost (₹)','Sale Price (₹)','Profit (₹)','Margin %',
    'Buyer Name','Buyer Phone','Advance Amount (₹)','Advance Mode','Final Payment Mode','Sale Date',
    'Delivery Date','Holding Days','Holding Rate (₹/day)','Holding Charges (₹)','Added By','Notes'];
  const rows = _salesFiltered.map(g => {
    const cost        = parseFloat(g.cost_price || 0);
    const extra       = parseFloat(g.extra_costs || 0);
    const totalCost   = cost + extra;
    const sellPrice   = parseFloat(g.selling_price || 0);
    const profit      = sellPrice - totalCost;
    const marginPct   = totalCost > 0 ? ((profit / totalCost) * 100).toFixed(1) : '0';
    const saleDate    = g.sale_date ? String(g.sale_date).slice(0,10) : '';
    const purchDate   = g.purchase_date ? String(g.purchase_date).slice(0,10) : '';
    const delivDate   = g.delivery_date ? String(g.delivery_date).slice(0,10) : '';
    const holdStart   = g.holding_start_date || g.sale_date;
    const holdDays    = (holdStart && g.delivery_date)
      ? Math.max(0, Math.round((new Date(g.delivery_date) - new Date(holdStart)) / 86400000))
      : '';
    return [
      g.goat_id, g.breed || '', g.status, g.delivery_status || '',
      purchDate, g.weight_kg || '', g.sale_weight_kg || '',
      cost.toFixed(0), extra.toFixed(0), totalCost.toFixed(0),
      sellPrice.toFixed(0), profit.toFixed(0), marginPct,
      g.buyer_name || '', g.buyer_phone || '',
      parseFloat(g.advance_amount || 0).toFixed(0),
      g.advance_mode || '', g.final_payment_mode || '',
      saleDate, delivDate, holdDays,
      parseFloat(g.holding_rate || 150).toFixed(0),
      parseFloat(g.holding_charges || 0).toFixed(0),
      g.added_by || '', g.notes || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `sales-${today()}.csv`;
  a.click();
  showToast('CSV exported ✅', 'success', 2000);
}
