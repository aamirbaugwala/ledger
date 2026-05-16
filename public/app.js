// ═══════════════════════════════════════════════════════════
//  Goat Ledger — Production JS
// ═══════════════════════════════════════════════════════════

// ─── State ─────────────────────────────────────────────────
let allStock = [], allSold = [];
let charts   = {};
let _deferredPWAPrompt = null;

// ─── PWA Install Prompt ─────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredPWAPrompt = e;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = '';
});

window.addEventListener('appinstalled', () => {
  _deferredPWAPrompt = null;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'none';
});

function installPWA() {
  if (!_deferredPWAPrompt) return;
  _deferredPWAPrompt.prompt();
  _deferredPWAPrompt.userChoice.then(() => { _deferredPWAPrompt = null; });
}

// ─── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  prefillNames();
  showSection('dashboard');

  document.getElementById('goatForm').addEventListener('submit', saveGoat);
  document.getElementById('sellForm').addEventListener('submit', confirmSale);
  document.getElementById('finalizeForm').addEventListener('submit', finalizeSale);

  ['fWeight','fCost','fExtra'].forEach(id =>
    document.getElementById(id).addEventListener('input', calcAuto)
  );
  document.getElementById('sellPrice').addEventListener('input', updateSellPreview);

  // Escape closes topmost open modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal:not(.hidden)')].pop();
    if (open) closeModal(open.id);
  });

  // Click on dim-overlay closes modal
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) closeModal(e.target.id);
  });
});

// ═══════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');

  document.querySelectorAll('.sidebar-nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.sec === name)
  );

  const titles = { dashboard: '📊 Dashboard', stock: '🐐 Stock', sold: '💰 Sales' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  toggleSidebar(false);

  if      (name === 'dashboard') loadDashboard();
  else if (name === 'stock')     { loadStock(); setTimeout(() => document.getElementById('stockSearch').focus(), 300); }
  else if (name === 'sold')      loadSold();
}

function toggleSidebar(force) {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  const open = force !== undefined ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  ov.classList.toggle('show', open);
}

// ═══════════════════════════════════════════════════════════
//  TOAST SYSTEM
// ═══════════════════════════════════════════════════════════
const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || ''}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════════════════════════
//  BUTTON LOADING HELPER
// ═══════════════════════════════════════════════════════════
function setLoading(btnId, on) {
  const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
  if (!btn) return;
  btn.dataset.loading = on ? 'true' : 'false';
  if (!on) delete btn.dataset.loading;
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
  const d = await api('/api/dashboard');
  if (!d) { showToast('Failed to load dashboard', 'error'); return; }

  const profit = d.totalProfit;

  // ── Stat cards ──
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card">
      <span class="stat-icon">🐐</span>
      <span class="stat-value">${d.availableCount}</span>
      <span class="stat-label">In Stock</span>
    </div>
    <div class="stat-card" style="border-top:3px solid #f59e0b">
      <span class="stat-icon">🔖</span>
      <span class="stat-value" style="color:#d97706">${d.bookedCount}</span>
      <span class="stat-label">Booked</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">✅</span>
      <span class="stat-value">${d.soldCount}</span>
      <span class="stat-label">Sold</span>
    </div>
    <div class="stat-card" style="border-top:3px solid #f97316">
      <span class="stat-icon">⏳</span>
      <span class="stat-value" style="color:#ea580c">₹${fmt(d.pendingAmount)}</span>
      <span class="stat-label">Pending Collection</span>
    </div>
    <div class="stat-card is-blue">
      <span class="stat-icon">📦</span>
      <span class="stat-value">₹${fmt(d.stockValue)}</span>
      <span class="stat-label">Stock Value</span>
    </div>
    <div class="stat-card is-blue">
      <span class="stat-icon">💵</span>
      <span class="stat-value">₹${fmt(d.totalRevenue)}</span>
      <span class="stat-label">Revenue</span>
    </div>
    <div class="stat-card ${profit >= 0 ? 'is-profit' : 'is-loss'}">
      <span class="stat-icon">${profit >= 0 ? '📈' : '📉'}</span>
      <span class="stat-value">₹${fmt(Math.abs(profit))}</span>
      <span class="stat-label">Net ${profit >= 0 ? 'Profit' : 'Loss'}</span>
    </div>`;

  // ── Pending bookings table ──
  const pendingWrap = document.getElementById('pendingBookingsBody');
  if (pendingWrap) {
    if (!d.pendingGoats.length) {
      pendingWrap.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#9ca3af">No pending bookings</td></tr>`;
    } else {
      pendingWrap.innerHTML = d.pendingGoats.map(g => `
        <tr>
          <td><strong>${esc(g.goat_id)}</strong></td>
          <td>${esc(g.buyer_name || '—')}</td>
          <td>${esc(g.buyer_phone || '—')}</td>
          <td>₹${fmt(g.advance_amount)}</td>
          <td><span style="color:#ea580c;font-weight:700">₹${fmt(g.remaining)}</span></td>
        </tr>`).join('');
    }
  }

  // ── Monthly chart ──
  destroyChart('monthlyChart');
  document.getElementById('monthlyChartMsg').textContent = '';
  const ml = d.monthly;
  if (ml.length) {
    charts.monthly = new Chart(document.getElementById('monthlyChart'), {
      type: 'bar',
      data: {
        labels: ml.map(m => m.mon),
        datasets: [
          { label: 'Revenue', data: ml.map(m => +m.revenue), backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 5, borderSkipped: false },
          { label: 'Cost',    data: ml.map(m => +m.cost),    backgroundColor: 'rgba(220,38,38,0.5)', borderRadius: 5, borderSkipped: false },
          { label: 'Profit',  data: ml.map(m => +m.profit),  type: 'line',
            borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.08)',
            pointBackgroundColor: '#16a34a', pointRadius: 4, tension: 0.35, fill: true,
            borderWidth: 2 }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } } },
        scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { callback: v => '₹' + fmt(v) } } }
      }
    });
  } else {
    document.getElementById('monthlyChartMsg').textContent = 'No sales data yet';
  }

  // ── Status breakdown doughnut ──
  destroyChart('breedChart');
  const total = d.availableCount + d.bookedCount + d.soldCount;
  if (total > 0) {
    charts.breed = new Chart(document.getElementById('breedChart'), {
      type: 'doughnut',
      data: {
        labels: ['Available', 'Booked', 'Sold'],
        datasets: [{ data: [d.availableCount, d.bookedCount, d.soldCount],
          backgroundColor: ['#16a34a', '#f59e0b', '#6b7280'],
          borderWidth: 0, hoverOffset: 8 }]
      },
      options: {
        responsive: true, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} goats` } }
        }
      }
    });
  }

  // ── Payment mode breakdown (count doughnut) ──
  destroyChart('weightChart');
  document.getElementById('weightChartMsg').textContent = '';
  if (d.payModes && d.payModes.length) {
    const modeLabels = { cash: '💵 Cash', online: '📱 Online', 'cash+online': '💵+📱 Split' };
    charts.weight = new Chart(document.getElementById('weightChart'), {
      type: 'doughnut',
      data: {
        labels: d.payModes.map(m => modeLabels[m.mode] || m.mode),
        datasets: [{ data: d.payModes.map(m => m.cnt),
          backgroundColor: ['#16a34a', '#2563eb', '#7c3aed'],
          borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, cutout: '60%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } } }
      }
    });
  } else {
    document.getElementById('weightChartMsg').textContent = 'No payment data yet';
  }

  // ── Cash vs Online deep breakdown ──
  const pb = d.payBreakdown || {};
  const totalCash   = (pb.adv_cash   || 0) + (pb.fin_cash   || 0);
  const totalOnline = (pb.adv_online || 0) + (pb.fin_online || 0);
  const totalSplit  = pb.fin_split  || 0;
  const uncollected = pb.uncollected || 0;
  document.getElementById('payBreakdownGrid').innerHTML = `
    <div class="pay-breakdown-card cash">
      <div class="pbc-icon">💵</div>
      <div class="pbc-amount">₹${fmt(totalCash)}</div>
      <div class="pbc-label">Cash Received</div>
      <div class="pbc-detail">Advance ₹${fmt(pb.adv_cash)} + Final ₹${fmt(pb.fin_cash)}</div>
    </div>
    <div class="pay-breakdown-card online">
      <div class="pbc-icon">📱</div>
      <div class="pbc-amount">₹${fmt(totalOnline)}</div>
      <div class="pbc-label">Online Received</div>
      <div class="pbc-detail">Advance ₹${fmt(pb.adv_online)} + Final ₹${fmt(pb.fin_online)}</div>
    </div>
    <div class="pay-breakdown-card split">
      <div class="pbc-icon">💵📱</div>
      <div class="pbc-amount">₹${fmt(totalSplit)}</div>
      <div class="pbc-label">Split Payments</div>
      <div class="pbc-detail">Cash + Online combined</div>
    </div>
    <div class="pay-breakdown-card pending">
      <div class="pbc-icon">⏳</div>
      <div class="pbc-amount">₹${fmt(uncollected)}</div>
      <div class="pbc-label">Yet to Collect</div>
      <div class="pbc-detail">From ${d.bookedCount} booked goat${d.bookedCount !== 1 ? 's' : ''}</div>
    </div>`;

  // ── Breed profit bar ──
  destroyChart('breedProfitChart');
  const breeds = d.byBreed;
  if (breeds.length) {
    charts.breedProfit = new Chart(document.getElementById('breedProfitChart'), {
      type: 'bar',
      data: {
        labels: breeds.map(b => b.breed || 'Unknown'),
        datasets: [
          { label: 'Total',  data: breeds.map(b => +b.total),      backgroundColor: '#dcfce7', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 },
          { label: 'Sold',   data: breeds.map(b => +b.sold_count),  backgroundColor: '#16a34a', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 },
          { label: 'Booked', data: breeds.map(b => +b.booked_count),backgroundColor: '#f59e0b', borderRadius: 4, borderSkipped: false, maxBarThickness: 40 },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } } },
        scales: {
          y: { beginAtZero: true, max: Math.max(...breeds.map(b => +b.total)) + 2, ticks: { stepSize: 1 }, grid: { color: '#f3f4f6' } }
        }
      }
    });
  }

  // ── Recent activity table ──
  const tbody = document.querySelector('#recentSalesTable tbody');
  if (!d.recentActivity || !d.recentActivity.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#9ca3af">No activity yet</td></tr>`;
    return;
  }
  tbody.innerHTML = d.recentActivity.map(s => {
    const totalCost = parseFloat(s.cost_price) + parseFloat(s.extra_costs || 0);
    const profit    = parseFloat(s.selling_price) - totalCost;
    const pCls      = profit >= 0 ? 'bp' : 'bl';
    const date      = s.sale_date ? String(s.sale_date).slice(0, 10) : '—';
    const statusBadge = s.status === 'booked'
      ? `<span style="background:#fef3c7;color:#d97706;padding:2px 7px;border-radius:4px;font-size:0.72rem;font-weight:700">Booked</span>`
      : `<span style="background:#dcfce7;color:#166534;padding:2px 7px;border-radius:4px;font-size:0.72rem;font-weight:700">Sold</span>`;
    const advInfo = s.status === 'booked'
      ? `<span style="color:#ea580c;font-size:0.78rem">⏳ ₹${fmt(parseFloat(s.selling_price) - parseFloat(s.advance_amount))} due</span>`
      : (s.final_payment_mode ? `<span class="pay-badge">${s.final_payment_mode}</span>` : '—');
    return `<tr>
      <td><strong>${esc(s.goat_id)}</strong></td>
      <td>${statusBadge}</td>
      <td>₹${fmt(s.selling_price)}</td>
      <td><span class="badge-profit ${pCls}">${profit >= 0 ? '+' : ''}₹${fmt(profit)}</span></td>
      <td>${esc(s.buyer_name || '—')}</td>
      <td>${advInfo}</td>
      <td>${date}</td>
    </tr>`;
  }).join('');
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ═══════════════════════════════════════════════════════════
//  STOCK PAGE
// ═══════════════════════════════════════════════════════════
async function loadStock() {
  document.getElementById('stockList').innerHTML = skeletonCards(3);
  allStock = await api('/api/goats?status=available') || [];
  renderStock(allStock);
  updateNavBadge('stock', allStock.length);
}

function filterStock() {
  const q = document.getElementById('stockSearch').value.toLowerCase();
  renderStock(allStock.filter(g =>
    g.goat_id.toLowerCase().includes(q) ||
    (g.breed || '').toLowerCase().includes(q) ||
    (g.notes || '').toLowerCase().includes(q)
  ));
}

function renderStock(goats) {
  const el = document.getElementById('stockList');
  if (!goats.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="ei">🐐</span>
        <h3>No goats in stock</h3>
        <p>Add your first goat to get started</p>
        <button class="btn btn-primary" onclick="openAddModal()">＋ Add Goat</button>
      </div>`;
    return;
  }
  el.innerHTML = goats.map(g => goatCard(g, false)).join('');
}

// ═══════════════════════════════════════════════════════════
//  SALES PAGE
// ═══════════════════════════════════════════════════════════
async function loadSold() {
  document.getElementById('soldList').innerHTML = skeletonCards(3);
  allSold = await api('/api/goats?status=sold') || [];
  renderSold(allSold);
}

function filterSold() {
  const q = document.getElementById('soldSearch').value.toLowerCase();
  renderSold(allSold.filter(g =>
    g.goat_id.toLowerCase().includes(q) ||
    (g.buyer_name || '').toLowerCase().includes(q) ||
    (g.breed || '').toLowerCase().includes(q)
  ));
}

function renderSold(goats) {
  const el = document.getElementById('soldList');
  if (!goats.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="ei">💰</span>
        <h3>No sales yet</h3>
        <p>Mark goats as sold from the Stock page</p>
      </div>`;
    return;
  }
  el.innerHTML = goats.map(g => goatCard(g, true)).join('');
}

// ═══════════════════════════════════════════════════════════
//  GOAT CARD TEMPLATE
// ═══════════════════════════════════════════════════════════
function goatCard(g, isSold) {
  const isBooked   = g.status === 'booked';
  const showSale   = isSold || isBooked;
  const totalCost  = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
  const costPerKg  = g.weight_kg ? Math.round(totalCost / g.weight_kg) : 0;
  const saleWeight = g.sale_weight_kg || g.weight_kg;
  const profit     = showSale ? (parseFloat(g.selling_price) - totalCost) : null;
  const pClass     = profit !== null ? (profit >= 0 ? 'bp' : 'bl') : '';
  const remaining  = isBooked ? (parseFloat(g.selling_price) - parseFloat(g.advance_amount || 0)) : 0;

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
    <div class="d-item"><span class="d-lbl">Sale Wt</span><span class="d-val">${saleWeight} kg</span></div>
    ${g.buyer_name ? `<div class="d-item"><span class="d-lbl">Buyer</span><span class="d-val">${esc(g.buyer_name)}</span></div>` : ''}
    ${parseFloat(g.advance_amount) > 0 ? `<div class="d-item"><span class="d-lbl">Advance</span><span class="d-val">₹${fmt(g.advance_amount)} <span class="pay-badge">${g.advance_mode||'—'}</span></span></div>` : ''}
    ${g.final_payment_mode ? `<div class="d-item"><span class="d-lbl">Payment</span><span class="d-val"><span class="pay-badge">${g.final_payment_mode}</span></span></div>` : ''}
    <div class="d-item"><span class="d-lbl">Sale Date</span><span class="d-val">${g.sale_date ? String(g.sale_date).slice(0,10) : '—'}</span></div>` : '';

  const bookedExtra = isBooked
    ? `<div style="grid-column:1/-1"><span class="remaining-pill">⏳ Remaining: ₹${fmt(remaining)}</span></div>` : '';

  const statusLabel = g.status === 'sold' ? 'Sold' : isBooked ? 'Booked' : 'Available';
  const statusCls   = g.status === 'sold' ? 'status-sold' : isBooked ? 'status-booked' : 'status-available';

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
    <div class="goat-card ${isSold ? 'sold-card' : ''}">
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

// ═══════════════════════════════════════════════════════════
//  ADD / EDIT GOAT MODAL
// ═══════════════════════════════════════════════════════════
async function openAddModal() {
  document.getElementById('goatModalTitle').textContent = 'Add Goat';
  document.getElementById('goatForm').reset();
  document.getElementById('editId').value = '';
  document.getElementById('fExtra').value = '0';
  document.getElementById('calcStrip').style.display = 'none';
  document.getElementById('goatFormErr').classList.add('hidden');
  document.getElementById('photoPreview').classList.add('hidden');
  document.getElementById('photoPlaceholder').style.display = 'flex';
  setLoading('saveGoatBtn', false);

  // Auto-suggest next ID
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
  // Reverse-compute cost per kg from stored total cost price
  const costPerKg = g.weight_kg ? (g.cost_price / g.weight_kg).toFixed(2) : g.cost_price;
  document.getElementById('fCost').value    = costPerKg;
  document.getElementById('fExtra').value   = g.extra_costs || 0;
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
  const c = parseFloat(document.getElementById('fCost').value)   || 0;  // cost per kg
  const x = parseFloat(document.getElementById('fExtra').value)  || 0;
  const strip = document.getElementById('calcStrip');
  if (w > 0 && c > 0) {
    const base  = c * w;
    const total = base + x;
    document.getElementById('calcTotal').textContent = `₹${fmt(total)}`;
    document.getElementById('calcPerKg').textContent = `₹${fmt(c)}/kg × ${w} kg${x > 0 ? ` + ₹${fmt(x)} extra` : ''}`;
    strip.style.display = 'flex';
  } else {
    strip.style.display = 'none';
  }
}

async function saveGoat(e, addAnother = false) {
  e.preventDefault();
  const errEl     = document.getElementById('goatFormErr');
  const showErr   = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  errEl.classList.add('hidden');

  // ── Validate: Goat ID ──
  const goatIdVal = document.getElementById('fGoatId').value.trim();
  if (!goatIdVal) return showErr('⚠️ Goat ID / Tag is required.');
  if (!/^[A-Za-z0-9\-_]+$/.test(goatIdVal)) return showErr('⚠️ Goat ID can only contain letters, numbers, hyphens and underscores.');

  // ── Validate: Weight ──
  const weightVal = parseFloat(document.getElementById('fWeight').value);
  if (!weightVal || weightVal <= 0) return showErr('⚠️ Weight must be greater than 0.');
  if (weightVal > 500)              return showErr('⚠️ Weight seems too high. Please check.');

  // ── Validate: Cost per kg ──
  const costVal = parseFloat(document.getElementById('fCost').value);
  if (!costVal || costVal <= 0)  return showErr('⚠️ Cost per kg must be greater than 0.');
  if (costVal > 100000)          return showErr('⚠️ Cost per kg seems too high. Please check.');

  // ── Validate: Extra costs ──
  const extraVal = parseFloat(document.getElementById('fExtra').value) || 0;
  if (extraVal < 0) return showErr('⚠️ Extra costs cannot be negative.');

  // ── Warn: selling below cost (not a blocker) ──
  const totalCostPreview = costVal * weightVal + extraVal;
  if (totalCostPreview > 500000) {
    if (!confirm(`Total cost is ₹${fmt(totalCostPreview)}. This seems very high. Continue?`)) return;
  }
  const id = document.getElementById('editId').value;
  setLoading('saveGoatBtn', true);
  setLoading('saveAddAnotherBtn', true);

  const fd = new FormData();
  fd.append('goat_id',     document.getElementById('fGoatId').value.trim());
  fd.append('breed',       document.getElementById('fBreed').value.trim());
  fd.append('weight_kg',   document.getElementById('fWeight').value);
  const costPerKg = parseFloat(document.getElementById('fCost').value) || 0;
  const weightKg  = parseFloat(document.getElementById('fWeight').value) || 0;
  const totalCost = parseFloat((costPerKg * weightKg).toFixed(2));
  console.log(`💰 costPerKg=${costPerKg}, weightKg=${weightKg}, totalCost=${totalCost}`);
  fd.append('cost_price',  totalCost);
  fd.append('extra_costs', document.getElementById('fExtra').value || 0);
  fd.append('added_by',    document.getElementById('fAddedBy').value.trim());
  fd.append('notes',       document.getElementById('fNotes').value.trim());
  const photoFile = document.getElementById('photoInput').files[0];
  if (photoFile) fd.append('photo', photoFile);

  const url    = id ? `/api/goats/${id}` : '/api/goats';
  const method = id ? 'PUT' : 'POST';

  try {
    const res  = await fetch(url, { method, body: fd });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      setLoading('saveGoatBtn', false);
      setLoading('saveAddAnotherBtn', false);
      return;
    }
    const goatId = document.getElementById('fGoatId').value.trim();
    saveNameSuggestion(document.getElementById('fAddedBy').value.trim());
    if (addAnother) {
      // Stay in modal — reset form and get next ID for another entry
      const addedBy = document.getElementById('fAddedBy').value.trim();
      showToast(`Goat ${goatId} added ✅ — ready for next`, 'success', 2500);
      await loadStock();
      // Reset form for next entry
      document.getElementById('goatForm').reset();
      document.getElementById('editId').value  = '';
      document.getElementById('fExtra').value  = '0';
      document.getElementById('fAddedBy').value = addedBy; // keep same person
      document.getElementById('calcStrip').style.display = 'none';
      document.getElementById('photoPreview').classList.add('hidden');
      document.getElementById('photoPlaceholder').style.display = 'flex';
      document.getElementById('photoInput').value = '';
      setLoading('saveGoatBtn', false);
      setLoading('saveAddAnotherBtn', false);
      const res2 = await api('/api/next-id');
      if (res2?.nextId) document.getElementById('fGoatId').value = res2.nextId;
      setTimeout(() => document.getElementById('fWeight').focus(), 100);
    } else {
      closeModal('goatModal');
      showToast(id ? `Goat ${goatId} updated` : `Goat ${goatId} added to stock 🐐`, 'success');
      await loadStock();
    }
  } catch (err) {
    console.error('saveGoat error:', err);
    errEl.textContent = 'Network error: ' + err.message;
    errEl.classList.remove('hidden');
    setLoading('saveGoatBtn', false);
    setLoading('saveAddAnotherBtn', false);
  }
}

// ─── Enter key in stock search → sell if exactly 1 match ───
function searchEnterSell(e) {
  if (e.key !== 'Enter') return;
  const q = document.getElementById('stockSearch').value.toLowerCase().trim();
  if (!q) return;
  const matches = allStock.filter(g =>
    g.goat_id.toLowerCase().includes(q) ||
    (g.breed || '').toLowerCase().includes(q) ||
    (g.notes || '').toLowerCase().includes(q)
  );
  if (matches.length === 1) {
    openSellModal(matches[0].id);
  } else if (matches.length === 0) {
    showToast('No goat found matching "' + q + '"', 'warning');
  } else {
    showToast(`${matches.length} matches — narrow your search`, 'info', 2000);
  }
}

async function deleteGoat(id, context = 'stock') {
  if (!confirm('Delete this goat? This cannot be undone.')) return;
  const res = await fetch(`/api/goats/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Goat record deleted', 'warning');
    if (context === 'sold') loadSold();
    else                    loadStock();
  } else {
    showToast('Failed to delete goat', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  SELL MODAL
// ═══════════════════════════════════════════════════════════
async function openSellModal(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }
  if (g.status === 'sold') { showToast('This goat is already sold', 'warning'); return; }

  const totalCost = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);

  document.getElementById('sellId').value      = id;
  document.getElementById('sellDate').value    = today();
  document.getElementById('sellPrice').value   = '';
  document.getElementById('sellWeight').value  = g.weight_kg;      // default to purchase weight
  document.getElementById('sellAdvance').value = '0';
  document.getElementById('sellAdvanceMode').value   = '';
  document.getElementById('sellFinalMode').value     = '';
  document.getElementById('sellBuyer').value   = g.buyer_name || ''; // keep if re-opening booked goat
  document.getElementById('sellPhone').value   = g.buyer_phone || '';
  document.getElementById('sellPrice').dataset.cost   = totalCost;
  document.getElementById('sellPrice').dataset.goatId = g.goat_id;
  document.getElementById('sellPreview').classList.add('hidden');
  document.getElementById('sellFormErr').classList.add('hidden');
  setLoading('confirmSaleBtn', false);

  document.getElementById('sellInfoBox').innerHTML = `
    <div class="d-item"><span class="d-lbl">Goat ID</span><span class="d-val">${esc(g.goat_id)}</span></div>
    <div class="d-item"><span class="d-lbl">Breed</span><span class="d-val">${esc(g.breed || '—')}</span></div>
    <div class="d-item"><span class="d-lbl">Buy Weight</span><span class="d-val">${g.weight_kg} kg</span></div>
    <div class="d-item"><span class="d-lbl">Total Cost</span><span class="d-val">₹${fmt(totalCost)}</span></div>`;

  showModal('sellModal');
  setTimeout(() => document.getElementById('sellPrice').focus(), 150);
}

function updateSellPreview() {
  const sp      = parseFloat(document.getElementById('sellPrice').value)   || 0;
  const cost    = parseFloat(document.getElementById('sellPrice').dataset.cost) || 0;
  const advance = parseFloat(document.getElementById('sellAdvance').value) || 0;
  const el      = document.getElementById('sellPreview');
  if (sp > 0) {
    const profit    = sp - cost;
    const remaining = sp - advance;
    const profitTxt = profit >= 0 ? `✅ Profit: ₹${fmt(profit)}` : `❌ Loss: ₹${fmt(Math.abs(profit))}`;
    const advTxt    = advance > 0 && advance < sp
      ? `  ·  📥 Advance: ₹${fmt(advance)}  ·  ⏳ Remaining: ₹${fmt(remaining)}`
      : advance >= sp ? '  ·  ✅ Fully paid' : '';
    el.textContent  = profitTxt + advTxt;
    el.className    = `profit-preview ${profit >= 0 ? 'pos' : 'neg'}`;
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

  const sp          = parseFloat(document.getElementById('sellPrice').value);
  const cost        = parseFloat(document.getElementById('sellPrice').dataset.cost);
  const goatId      = document.getElementById('sellPrice').dataset.goatId;
  const advance     = parseFloat(document.getElementById('sellAdvance').value) || 0;
  const buyerName   = document.getElementById('sellBuyer').value.trim();
  const buyerPhone  = document.getElementById('sellPhone').value.trim();
  const advMode     = document.getElementById('sellAdvanceMode').value;
  const finalMode   = document.getElementById('sellFinalMode').value;
  const saleWeight  = document.getElementById('sellWeight').value;
  const isBooked    = advance > 0 && advance < sp;

  // ── Validation ──
  if (!sp || sp <= 0)  { errEl.textContent = '⚠️ Selling price must be greater than 0.'; errEl.classList.remove('hidden'); return; }
  if (sp > 10000000)   { errEl.textContent = '⚠️ Selling price seems too high. Please check.'; errEl.classList.remove('hidden'); return; }
  if (!buyerName)      { errEl.textContent = '⚠️ Buyer name is required.'; errEl.classList.remove('hidden'); return; }
  if (!buyerPhone)     { errEl.textContent = '⚠️ Buyer phone is required.'; errEl.classList.remove('hidden'); return; }
  if (!/^[0-9+\-\s]{7,15}$/.test(buyerPhone)) { errEl.textContent = '⚠️ Enter a valid phone number (7–15 digits).'; errEl.classList.remove('hidden'); return; }
  if (advance < 0)     { errEl.textContent = '⚠️ Advance amount cannot be negative.'; errEl.classList.remove('hidden'); return; }
  if (advance >= sp)   { errEl.textContent = '⚠️ Advance cannot be equal to or more than the selling price — use "Fully Paid" instead.'; errEl.classList.remove('hidden'); return; }
  if (isBooked && !advMode) {
    errEl.textContent = '⚠️ Please select advance payment mode (Cash or Online).';
    errEl.classList.remove('hidden'); return;
  }
  if (!isBooked && !finalMode) {
    errEl.textContent = '⚠️ Please select a payment mode (Cash / Online / Split).';
    errEl.classList.remove('hidden'); return;
  }
  const saleDate = document.getElementById('sellDate').value;
  if (!saleDate) { errEl.textContent = '⚠️ Sale date is required.'; errEl.classList.remove('hidden'); return; }
  if (saleDate > today()) { errEl.textContent = '⚠️ Sale date cannot be in the future.'; errEl.classList.remove('hidden'); return; }

  // Warn if selling at a loss
  if (sp < cost) {
    const loss = cost - sp;
    if (!confirm(`⚠️ You are selling at a LOSS of ₹${fmt(loss)}. Are you sure?`)) return;
  }

  const profit = sp - cost;
  setLoading('confirmSaleBtn', true);

  const body = {
    selling_price:      sp,
    buyer_name:         buyerName,
    buyer_phone:        buyerPhone,
    sale_date:          document.getElementById('sellDate').value,
    sale_weight_kg:     saleWeight || null,
    advance_amount:     advance,
    advance_mode:       advMode,
    final_payment_mode: finalMode,
  };

  try {
    const res  = await fetch(`/api/goats/${id}/sell`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      setLoading('confirmSaleBtn', false);
      return;
    }
    closeModal('sellModal');
    if (data.status === 'booked') {
      const remaining = sp - advance;
      showToast(`${goatId} booked — ₹${fmt(advance)} received (${advMode}), ₹${fmt(remaining)} pending`, 'info', 5000);
    } else {
      const msg = profit >= 0
        ? `Sold ${goatId} — Profit: ₹${fmt(profit)} 🎉`
        : `Sold ${goatId} — Loss: ₹${fmt(Math.abs(profit))}`;
      showToast(msg, profit >= 0 ? 'success' : 'warning', 5000);
    }
    await loadStock();
    loadDashboard();
  } catch (err) {
    errEl.textContent = 'Network error: ' + err.message;
    errEl.classList.remove('hidden');
    setLoading('confirmSaleBtn', false);
  }
}

async function undoSale(id, btn) {
  if (!confirm('Move this goat back to available stock?')) return;
  btn.dataset.loading = 'true';
  const res = await fetch(`/api/goats/${id}/unsell`, { method: 'POST' });
  delete btn.dataset.loading;
  if (res.ok) {
    showToast('Sale reverted — goat is back in stock', 'info');
    await loadStock();
    loadDashboard();
  } else {
    showToast('Failed to revert sale', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  FINALIZE BOOKED GOAT
// ═══════════════════════════════════════════════════════════
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
  const id      = document.getElementById('finalizeId').value;
  const errEl   = document.getElementById('finalizeFormErr');
  const mode    = document.getElementById('finalizeFinalMode').value;
  errEl.classList.add('hidden');

  if (!mode) {
    errEl.textContent = '⚠️ Please select the final payment mode.';
    errEl.classList.remove('hidden'); return;
  }
  setLoading('finalizeBtn', true);
  try {
    const res  = await fetch(`/api/goats/${id}/finalize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_payment_mode: mode })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error; errEl.classList.remove('hidden');
      setLoading('finalizeBtn', false); return;
    }
    closeModal('finalizeModal');
    showToast('Payment collected — goat marked as fully sold ✅', 'success');
    await loadStock();
    loadDashboard();
  } catch (err) {
    errEl.textContent = 'Network error: ' + err.message;
    errEl.classList.remove('hidden');
    setLoading('finalizeBtn', false);
  }
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 1 — WHATSAPP RECEIPT GENERATOR
// ═══════════════════════════════════════════════════════════
async function sendWhatsApp(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }

  const totalCost = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
  const advance   = parseFloat(g.advance_amount || 0);
  const sp        = parseFloat(g.selling_price);
  const remaining = sp - advance;
  const profit    = sp - totalCost;
  const isBooked  = g.status === 'booked';
  const saleDate  = g.sale_date ? String(g.sale_date).slice(0, 10) : today();
  const weight    = g.sale_weight_kg || g.weight_kg;

  const now   = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const lines = [
    `🐐 *CLASSIC GOAT FARM*`,
    `📋 *Sale Receipt*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `*Goat Details*`,
    `• Tag No.  : *${g.goat_id}*`,
    g.breed    ? `• Breed    : ${g.breed}` : null,
    `• Weight   : ${weight} kg`,
    ``,
    `*Sale Details*`,
    `• Sale Price : *₹${fmt(sp)}*`,
    `• Sale Date  : ${saleDate}`,
    g.buyer_name  ? `• Buyer    : ${g.buyer_name}` : null,
    g.buyer_phone ? `• Phone    : ${g.buyer_phone}` : null,
    ``,
    `*Payment Summary*`,
    advance > 0
      ? `• Advance Paid : ₹${fmt(advance)} (${g.advance_mode || 'cash'})`
      : null,
    isBooked
      ? `• Balance Due  : *₹${fmt(remaining)}*`
      : `• Final Payment: ₹${fmt(sp - advance)} (${g.final_payment_mode || 'cash'})`,
    `• Total Paid   : ₹${fmt(isBooked ? advance : sp)}`,
    ``,
    isBooked
      ? `⚠️ *Remaining balance of ₹${fmt(remaining)} to be paid on delivery.*`
      : `✅ *Payment complete. Thank you for your purchase!*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📍 Classic Goat Farm`,
    `🕐 Issued: ${dateStr} at ${timeStr}`,
    `_For queries, reply to this message._`
  ].filter(l => l !== null).join('\n');

  const phone = (g.buyer_phone || '').replace(/\D/g, '');
  const url   = `https://wa.me/${phone ? '91' + phone : ''}?text=${encodeURIComponent(lines)}`;
  // Use location.href so it works in PWA standalone mode (window.open is blocked by OS)
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isPWA) {
    location.href = url;
  } else {
    window.open(url, '_blank');
  }
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 5 — BULK QUICK-ADD (Mandi Mode)
// ═══════════════════════════════════════════════════════════
let bulkRows = [];

function openBulkModal() {
  bulkRows = [{ id: Date.now(), goat_id: '', breed: '', weight: '', cost: '', extra: '0', notes: '' }];
  renderBulkRows();
  document.getElementById('bulkErr').textContent = '';
  showModal('bulkModal');
}

function renderBulkRows() {
  const tbody = document.getElementById('bulkTableBody');
  tbody.innerHTML = bulkRows.map((r, i) => `
    <tr data-i="${i}">
      <td><input class="bulk-input" value="${esc(r.goat_id)}" placeholder="G-0${10+i}" oninput="bulkRowUpdate(${i},'goat_id',this.value)" /></td>
      <td><input class="bulk-input" value="${esc(r.breed)}"   placeholder="Sojat"   oninput="bulkRowUpdate(${i},'breed',this.value)"   list="breedList" /></td>
      <td><input class="bulk-input number" type="number" value="${r.weight}" placeholder="35"  oninput="bulkRowUpdate(${i},'weight',this.value)"  min="0.1" step="0.1" /></td>
      <td><input class="bulk-input number" type="number" value="${r.cost}"   placeholder="450" oninput="bulkRowUpdate(${i},'cost',this.value)"    min="1" /></td>
      <td><input class="bulk-input number" type="number" value="${r.extra}"  placeholder="0"   oninput="bulkRowUpdate(${i},'extra',this.value)"   min="0" /></td>
      <td class="bulk-total">${r.weight && r.cost ? '₹' + fmt(parseFloat(r.weight)*parseFloat(r.cost) + parseFloat(r.extra||0)) : '—'}</td>
      <td><input class="bulk-input" value="${esc(r.notes)}" placeholder="color, notes…" oninput="bulkRowUpdate(${i},'notes',this.value)" /></td>
      <td><button class="btn btn-danger btn-sm" onclick="bulkRemoveRow(${i})" ${bulkRows.length === 1 ? 'disabled' : ''}>✕</button></td>
    </tr>`).join('');
}

function bulkRowUpdate(i, field, val) {
  bulkRows[i][field] = val;
  // re-render only the total cell for performance
  const rows = document.querySelectorAll('#bulkTableBody tr');
  const r = bulkRows[i];
  const totalCell = rows[i]?.querySelector('.bulk-total');
  if (totalCell) {
    totalCell.textContent = r.weight && r.cost
      ? '₹' + fmt(parseFloat(r.weight)*parseFloat(r.cost) + parseFloat(r.extra||0))
      : '—';
  }
}

function bulkAddRow() {
  bulkRows.push({ id: Date.now(), goat_id: '', breed: '', weight: '', cost: '', extra: '0', notes: '' });
  renderBulkRows();
  // Focus first input of new row
  setTimeout(() => {
    const rows = document.querySelectorAll('#bulkTableBody tr');
    rows[rows.length - 1]?.querySelector('input')?.focus();
  }, 50);
}

function bulkRemoveRow(i) {
  bulkRows.splice(i, 1);
  renderBulkRows();
}

async function saveBulkGoats() {
  const errEl = document.getElementById('bulkErr');
  errEl.textContent = '';

  // Validate all rows
  for (let i = 0; i < bulkRows.length; i++) {
    const r = bulkRows[i];
    const rowNum = i + 1;
    if (!r.goat_id.trim())           { errEl.textContent = `⚠️ Row ${rowNum}: Goat ID is required.`; return; }
    if (!/^[A-Za-z0-9\-_]+$/.test(r.goat_id.trim())) { errEl.textContent = `⚠️ Row ${rowNum}: Invalid Goat ID characters.`; return; }
    if (!r.weight || parseFloat(r.weight) <= 0) { errEl.textContent = `⚠️ Row ${rowNum}: Valid weight required.`; return; }
    if (!r.cost   || parseFloat(r.cost)   <= 0) { errEl.textContent = `⚠️ Row ${rowNum}: Valid cost/kg required.`; return; }
  }

  // Check for duplicate IDs within the batch
  const ids = bulkRows.map(r => r.goat_id.trim().toUpperCase());
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) { errEl.textContent = `⚠️ Duplicate Goat IDs in batch: ${[...new Set(dupes)].join(', ')}`; return; }

  const btn = document.getElementById('bulkSaveBtn');
  btn.dataset.loading = 'true';

  let saved = 0, failed = [];
  for (const r of bulkRows) {
    const fd = new FormData();
    const totalCost = parseFloat((parseFloat(r.weight) * parseFloat(r.cost)).toFixed(2));
    fd.append('goat_id',    r.goat_id.trim());
    fd.append('breed',      r.breed.trim());
    fd.append('weight_kg',  r.weight);
    fd.append('cost_price', totalCost);
    fd.append('extra_costs', parseFloat(r.extra) || 0);
    fd.append('notes',      r.notes.trim());
    const res = await fetch('/api/goats', { method: 'POST', body: fd });
    if (res.ok) saved++;
    else {
      const d = await res.json().catch(() => ({}));
      failed.push(`${r.goat_id}: ${d.error || 'error'}`);
    }
  }

  delete btn.dataset.loading;
  if (failed.length) {
    errEl.textContent = `⚠️ Some failed: ${failed.join(' | ')}`;
    if (saved > 0) showToast(`${saved} goat(s) added, ${failed.length} failed`, 'warning');
  } else {
    closeModal('bulkModal');
    showToast(`✅ ${saved} goat(s) added to stock from mandi!`, 'success', 4000);
    await loadStock();
    loadDashboard();
  }
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 6 — MARKET RATE CALCULATOR
// ═══════════════════════════════════════════════════════════
function openMarketCalc() {
  document.getElementById('marketRateInput').value = '';
  document.getElementById('marketCalcResults').innerHTML = `<p style="color:var(--text-3);text-align:center;padding:20px 0">Enter a market rate above to see profitability for each goat in stock.</p>`;
  showModal('marketCalcModal');
  setTimeout(() => document.getElementById('marketRateInput').focus(), 150);
}

function runMarketCalc() {
  const rate = parseFloat(document.getElementById('marketRateInput').value);
  const resultsEl = document.getElementById('marketCalcResults');
  if (!rate || rate <= 0) {
    resultsEl.innerHTML = `<p style="color:var(--red);text-align:center;padding:12px 0">⚠️ Enter a valid market rate per kg.</p>`;
    return;
  }

  const available = allStock.filter(g => g.status === 'available');
  if (!available.length) {
    resultsEl.innerHTML = `<p style="color:var(--text-3);text-align:center;padding:20px 0">No goats currently in stock.</p>`;
    return;
  }

  // Sort: most profitable first
  const rows = available.map(g => {
    const totalCost  = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
    const marketVal  = rate * parseFloat(g.weight_kg);
    const profit     = marketVal - totalCost;
    const profitPct  = totalCost > 0 ? ((profit / totalCost) * 100).toFixed(1) : 0;
    return { g, totalCost, marketVal, profit, profitPct };
  }).sort((a, b) => b.profit - a.profit);

  const totalMarketVal = rows.reduce((s, r) => s + r.marketVal, 0);
  const totalCostAll   = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalProfit    = totalMarketVal - totalCostAll;
  const profitable     = rows.filter(r => r.profit >= 0).length;

  resultsEl.innerHTML = `
    <div class="mc-summary">
      <div class="mc-sum-card green">
        <div class="mc-sum-val">₹${fmt(totalMarketVal)}</div>
        <div class="mc-sum-lbl">Total Market Value</div>
      </div>
      <div class="mc-sum-card ${totalProfit >= 0 ? 'green' : 'red'}">
        <div class="mc-sum-val">${totalProfit >= 0 ? '+' : ''}₹${fmt(totalProfit)}</div>
        <div class="mc-sum-lbl">Total ${totalProfit >= 0 ? 'Profit' : 'Loss'} if All Sold</div>
      </div>
      <div class="mc-sum-card blue">
        <div class="mc-sum-val">${profitable}/${rows.length}</div>
        <div class="mc-sum-lbl">Profitable Goats</div>
      </div>
    </div>
    <div class="mc-list">
      ${rows.map(r => `
        <div class="mc-row ${r.profit >= 0 ? 'mc-profit' : 'mc-loss'}">
          <div class="mc-goat-id">🐐 ${esc(r.g.goat_id)}${r.g.breed ? ` <span class="mc-breed">${esc(r.g.breed)}</span>` : ''}</div>
          <div class="mc-details">
            <span>${r.g.weight_kg} kg × ₹${fmt(rate)}/kg</span>
            <span class="mc-arrow">→</span>
            <span>Market: <strong>₹${fmt(r.marketVal)}</strong></span>
            <span>Cost: ₹${fmt(r.totalCost)}</span>
            <span class="mc-pnl ${r.profit >= 0 ? 'bp' : 'bl'}">${r.profit >= 0 ? '▲ +' : '▼ '}₹${fmt(Math.abs(r.profit))} (${r.profitPct}%)</span>
          </div>
        </div>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  VIEW DETAIL MODAL
// ═══════════════════════════════════════════════════════════
async function viewGoat(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }

  const totalCost = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
  const saleWt    = g.sale_weight_kg || g.weight_kg;
  const profit    = (g.status === 'sold' || g.status === 'booked') ? parseFloat(g.selling_price) - totalCost : null;
  const remaining = g.status === 'booked' ? parseFloat(g.selling_price) - parseFloat(g.advance_amount || 0) : 0;

  document.getElementById('viewTitle').textContent = `🐐 ${g.goat_id}`;
  document.getElementById('viewContent').innerHTML = `
    ${g.photo ? `<img src="${g.photo}" class="view-photo" />` : ''}
    <div class="view-grid">
      <div class="view-item"><span class="view-lbl">Goat ID</span><span class="view-val">${esc(g.goat_id)}</span></div>
      <div class="view-item"><span class="view-lbl">Status</span><span class="view-val">${
        g.status === 'sold' ? '🔴 Sold' : g.status === 'booked' ? '� Booked' : '�🟢 Available'
      }</span></div>
      <div class="view-item"><span class="view-lbl">Breed</span><span class="view-val">${esc(g.breed || '—')}</span></div>
      <div class="view-item"><span class="view-lbl">Buy Weight</span><span class="view-val">${g.weight_kg} kg</span></div>
      <div class="view-item"><span class="view-lbl">Cost Price</span><span class="view-val">₹${fmt(g.cost_price)}</span></div>
      <div class="view-item"><span class="view-lbl">Extra Costs</span><span class="view-val">₹${fmt(g.extra_costs)}</span></div>
      <div class="view-item"><span class="view-lbl">Total Cost</span><span class="view-val">₹${fmt(totalCost)}</span></div>
      <div class="view-item"><span class="view-lbl">Cost/kg</span><span class="view-val">₹${(totalCost / parseFloat(g.weight_kg)).toFixed(0)}</span></div>
      ${g.status !== 'available' ? `
        <div class="view-item"><span class="view-lbl">Selling Price</span><span class="view-val">₹${fmt(g.selling_price)}</span></div>
        <div class="view-item"><span class="view-lbl">Sale Weight</span><span class="view-val">${saleWt} kg</span></div>
        <div class="view-item"><span class="view-lbl">Sell/kg</span><span class="view-val">₹${(parseFloat(g.selling_price)/parseFloat(saleWt)).toFixed(0)}</span></div>
        <div class="view-item"><span class="view-lbl">Profit/Loss</span>
          <span class="view-val" style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'}">
            ${profit >= 0 ? '▲ +' : '▼ '}₹${fmt(Math.abs(profit))}
          </span>
        </div>
        <div class="view-item"><span class="view-lbl">Buyer</span><span class="view-val">${esc(g.buyer_name || '—')}</span></div>
        <div class="view-item"><span class="view-lbl">Phone</span><span class="view-val">${esc(g.buyer_phone || '—')}</span></div>
        ${parseFloat(g.advance_amount) > 0 ? `
          <div class="view-item"><span class="view-lbl">Advance</span><span class="view-val">₹${fmt(g.advance_amount)} <span class="pay-badge">${g.advance_mode||''}</span></span></div>
          <div class="view-item"><span class="view-lbl">Adv Date</span><span class="view-val">${g.advance_date ? String(g.advance_date).slice(0,10) : '—'}</span></div>` : ''}
        ${g.final_payment_mode ? `<div class="view-item"><span class="view-lbl">Final Pay</span><span class="view-val"><span class="pay-badge">${g.final_payment_mode}</span></span></div>` : ''}
        ${g.status === 'booked' ? `<div class="view-item" style="grid-column:1/-1"><span class="view-lbl">Remaining</span><span class="view-val" style="color:var(--orange);font-weight:800;font-size:1.05rem">₹${fmt(remaining)} to collect</span></div>` : ''}
        <div class="view-item"><span class="view-lbl">Sale Date</span><span class="view-val">${g.sale_date ? String(g.sale_date).slice(0,10) : '—'}</span></div>` : ''}
      <div class="view-item view-full"><span class="view-lbl">Notes</span><span class="view-val">${esc(g.notes || '—')}</span></div>
      <div class="view-item"><span class="view-lbl">Added By</span><span class="view-val">${esc(g.added_by || '—')}</span></div>
    </div>`;
  showModal('viewModal');
}

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════
function showModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function today() { return new Date().toISOString().split('T')[0]; }
function fmt(n)  { return Math.round(n || 0).toLocaleString('en-IN'); }
function esc(s)  {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function palette(n) {
  const c = ['#4caf50','#2196f3','#ff9800','#9c27b0','#f44336','#00bcd4','#8bc34a','#ff5722','#795548'];
  return Array.from({ length: n }, (_, i) => c[i % c.length]);
}
function skeletonCards(n) {
  return Array.from({length: n}, () => `
    <div class="goat-card">
      <div class="goat-card-photo-placeholder skeleton" style="height:80px"></div>
      <div class="goat-card-body">
        <div class="skeleton" style="height:18px;width:60%;margin-bottom:10px;border-radius:4px"></div>
        <div class="skeleton" style="height:14px;width:100%;margin-bottom:6px;border-radius:4px"></div>
        <div class="skeleton" style="height:14px;width:80%;border-radius:4px"></div>
      </div>
    </div>`).join('');
}
function updateNavBadge(sec, count) {
  document.querySelectorAll(`.sidebar-nav a[data-sec="${sec}"] .nav-badge`).forEach(b => b.remove());
  if (count > 0) {
    const link = document.querySelector(`.sidebar-nav a[data-sec="${sec}"]`);
    if (link) link.insertAdjacentHTML('beforeend', `<span class="nav-badge">${count}</span>`);
  }
}

async function api(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ─── Name autocomplete (localStorage) ──────────────────────
function prefillNames() {
  const names = JSON.parse(localStorage.getItem('gl_names') || '[]');
  const dl = document.getElementById('nameList');
  if (dl) dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
}
function saveNameSuggestion(name) {
  if (!name) return;
  const names = JSON.parse(localStorage.getItem('gl_names') || '[]');
  if (!names.includes(name)) {
    names.push(name);
    localStorage.setItem('gl_names', JSON.stringify(names));
    prefillNames();
  }
}
