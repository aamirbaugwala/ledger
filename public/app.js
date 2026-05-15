// ═══════════════════════════════════════════════════════════
//  Goat Ledger — Production JS
// ═══════════════════════════════════════════════════════════

// ─── State ─────────────────────────────────────────────────
let allStock = [], allSold = [];
let charts   = {};

// ─── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  prefillNames();
  showSection('dashboard');

  document.getElementById('goatForm').addEventListener('submit', saveGoat);
  document.getElementById('sellForm').addEventListener('submit', confirmSale);

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
    <div class="stat-card">
      <span class="stat-icon">🏷️</span>
      <span class="stat-value">${d.soldCount}</span>
      <span class="stat-label">Goats Sold</span>
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

  // ── Monthly chart ──
  destroyChart('monthlyChart');
  const ml = d.monthly;
  if (ml.length) {
    charts.monthly = new Chart(document.getElementById('monthlyChart'), {
      type: 'bar',
      data: {
        labels: ml.map(m => m.mon),
        datasets: [
          { label: 'Revenue', data: ml.map(m => m.revenue), backgroundColor: '#42a5f5', borderRadius: 4 },
          { label: 'Cost',    data: ml.map(m => m.cost),    backgroundColor: '#ef9a9a', borderRadius: 4 },
          { label: 'Profit',  data: ml.map(m => m.profit),  type: 'line',
            borderColor: '#66bb6a', backgroundColor: 'rgba(102,187,106,0.12)',
            pointBackgroundColor: '#66bb6a', tension: 0.3, fill: true }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + fmt(v) } } }
      }
    });
  } else {
    document.getElementById('monthlyChart').parentElement.innerHTML +=
      '<p style="text-align:center;color:#bbb;padding:20px 0">No sales data yet</p>';
  }

  // ── Breed doughnut ──
  destroyChart('breedChart');
  const breeds = d.byBreed;
  if (breeds.length) {
    charts.breed = new Chart(document.getElementById('breedChart'), {
      type: 'doughnut',
      data: {
        labels: breeds.map(b => b.breed || 'Unknown'),
        datasets: [{ data: breeds.map(b => b.total), backgroundColor: palette(breeds.length), hoverOffset: 6 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // ── Weight distribution ──
  destroyChart('weightChart');
  if (d.weightDist.length) {
    charts.weight = new Chart(document.getElementById('weightChart'), {
      type: 'bar',
      data: {
        labels: d.weightDist.map(w => w.range),
        datasets: [{ label: 'Goats', data: d.weightDist.map(w => w.cnt), backgroundColor: '#80cbc4', borderRadius: 4 }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }

  // ── Breed profit ──
  destroyChart('breedProfitChart');
  if (breeds.length) {
    charts.breedProfit = new Chart(document.getElementById('breedProfitChart'), {
      type: 'bar',
      data: {
        labels: breeds.map(b => b.breed || 'Unknown'),
        datasets: [{
          label: 'Profit (₹)', data: breeds.map(b => b.profit || 0),
          backgroundColor: breeds.map(b => (b.profit || 0) >= 0 ? '#a5d6a7' : '#ef9a9a'),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => '₹' + fmt(v) } } }
      }
    });
  }

  // ── Recent sales table ──
  const tbody = document.querySelector('#recentSalesTable tbody');
  if (!d.recentSales.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:#bbb">No sales recorded yet</td></tr>`;
    return;
  }
  tbody.innerHTML = d.recentSales.map(s => {
    const cls = s.profit >= 0 ? 'bp' : 'bl';
    const saleDate = s.sale_date ? String(s.sale_date).slice(0, 10) : '—';
    return `<tr>
      <td><strong>${esc(s.goat_id)}</strong></td>
      <td>${esc(s.breed || '—')}</td>
      <td>${s.weight_kg} kg</td>
      <td>₹${fmt(parseFloat(s.cost_price) + parseFloat(s.extra_costs || 0))}</td>
      <td>₹${fmt(s.selling_price)}</td>
      <td><span class="badge-profit ${cls}">${s.profit >= 0 ? '+' : ''}₹${fmt(s.profit)}</span></td>
      <td>${esc(s.buyer_name || '—')}</td>
      <td>${esc(s.added_by || '—')}</td>
      <td>${saleDate}</td>
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
  const totalCost  = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
  const costPerKg  = g.weight_kg ? Math.round(totalCost / g.weight_kg) : 0;
  const profit     = isSold ? (parseFloat(g.selling_price) - totalCost) : null;
  const pClass     = profit !== null ? (profit >= 0 ? 'bp' : 'bl') : '';

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

  const saleDetails = isSold ? `
    <div class="d-item"><span class="d-lbl">Sold For</span><span class="d-val">₹${fmt(g.selling_price)}</span></div>
    <div class="d-item"><span class="d-lbl">Sell/kg</span><span class="d-val">₹${g.weight_kg ? (g.selling_price/g.weight_kg).toFixed(0) : '—'}</span></div>
    ${g.buyer_name ? `<div class="d-item"><span class="d-lbl">Buyer</span><span class="d-val">${esc(g.buyer_name)}</span></div>` : ''}
    <div class="d-item"><span class="d-lbl">Sale Date</span><span class="d-val">${g.sale_date}</span></div>` : '';

  const actions = isSold
    ? `<button class="btn btn-gray   btn-sm" onclick="undoSale(${g.id}, this)">↩ Undo</button>
       <button class="btn btn-gray   btn-sm" onclick="viewGoat(${g.id})">👁 View</button>
       <button class="btn btn-danger btn-sm" onclick="deleteGoat(${g.id}, 'sold')">🗑</button>`
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
            <span class="goat-status ${isSold ? 'status-sold' : 'status-available'}">${isSold ? 'Sold' : 'Available'}</span>
          </div>
        </div>
        <div class="goat-details">${baseDetails}${saleDetails}</div>
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
  // Validate required fields before fetch
  const goatIdVal  = document.getElementById('fGoatId').value.trim();
  const weightVal  = document.getElementById('fWeight').value;
  const costVal    = document.getElementById('fCost').value;
  if (!goatIdVal || !weightVal || !costVal) {
    document.getElementById('goatFormErr').textContent = 'Goat ID, weight and cost per kg are required';
    document.getElementById('goatFormErr').classList.remove('hidden');
    return;
  }
  const id    = document.getElementById('editId').value;
  const errEl = document.getElementById('goatFormErr');
  errEl.classList.add('hidden');
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
  // Always fetch fresh from API — works regardless of which page we're on
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }
  if (g.status === 'sold') { showToast('This goat is already sold', 'warning'); return; }

  const totalCost = g.cost_price + (g.extra_costs || 0);

  document.getElementById('sellId').value    = id;
  document.getElementById('sellDate').value  = today();
  document.getElementById('sellPrice').value = '';
  document.getElementById('sellPrice').dataset.cost     = totalCost;
  document.getElementById('sellPrice').dataset.goatId   = g.goat_id;
  document.getElementById('sellBuyer').value = '';
  document.getElementById('sellPhone').value = '';
  document.getElementById('sellPreview').classList.add('hidden');
  document.getElementById('sellFormErr').classList.add('hidden');
  setLoading('confirmSaleBtn', false);

  document.getElementById('sellInfoBox').innerHTML = `
    <div><span class="d-lbl">Goat ID</span><strong>${esc(g.goat_id)}</strong></div>
    <div><span class="d-lbl">Breed</span><strong>${esc(g.breed || '—')}</strong></div>
    <div><span class="d-lbl">Weight</span><strong>${g.weight_kg} kg</strong></div>
    <div><span class="d-lbl">Total Cost</span><strong>₹${fmt(totalCost)}</strong></div>`;

  showModal('sellModal');
  setTimeout(() => document.getElementById('sellPrice').focus(), 150);
}

function updateSellPreview() {
  const sp   = parseFloat(document.getElementById('sellPrice').value) || 0;
  const cost = parseFloat(document.getElementById('sellPrice').dataset.cost) || 0;
  const el   = document.getElementById('sellPreview');
  if (sp > 0) {
    const p = sp - cost;
    el.textContent  = p >= 0 ? `✅ Profit: ₹${fmt(p)}` : `❌ Loss: ₹${fmt(Math.abs(p))}`;
    el.className    = `profit-preview ${p >= 0 ? 'pos' : 'neg'}`;
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
  setLoading('confirmSaleBtn', true);

  const sp      = parseFloat(document.getElementById('sellPrice').value);
  const cost    = parseFloat(document.getElementById('sellPrice').dataset.cost);
  const goatId  = document.getElementById('sellPrice').dataset.goatId;
  const profit  = sp - cost;

  const body = {
    selling_price: sp,
    buyer_name:    document.getElementById('sellBuyer').value.trim(),
    buyer_phone:   document.getElementById('sellPhone').value.trim(),
    sale_date:     document.getElementById('sellDate').value
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
    const profitMsg = profit >= 0
      ? `Sold ${goatId} — Profit: ₹${fmt(profit)} 🎉`
      : `Sold ${goatId} — Loss: ₹${fmt(Math.abs(profit))}`;
    showToast(profitMsg, profit >= 0 ? 'success' : 'warning', 5000);
    await loadStock();
    // Bust dashboard cache so it's fresh next visit
    loadDashboard();
  } catch {
    errEl.textContent = 'Network error — please try again';
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
    await loadSold();
  } else {
    showToast('Failed to revert sale', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  VIEW DETAIL MODAL
// ═══════════════════════════════════════════════════════════
async function viewGoat(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }

  const totalCost = g.cost_price + (g.extra_costs || 0);
  const profit    = g.status === 'sold' ? g.selling_price - totalCost : null;

  document.getElementById('viewTitle').textContent = `🐐 ${g.goat_id}`;
  document.getElementById('viewContent').innerHTML = `
    ${g.photo ? `<img src="${g.photo}" class="view-photo" />` : ''}
    <div class="view-grid">
      <div class="view-item"><span class="view-lbl">Goat ID</span><span class="view-val">${esc(g.goat_id)}</span></div>
      <div class="view-item"><span class="view-lbl">Status</span><span class="view-val">${g.status === 'sold' ? '🔴 Sold' : '🟢 Available'}</span></div>
      <div class="view-item"><span class="view-lbl">Breed</span><span class="view-val">${esc(g.breed || '—')}</span></div>
      <div class="view-item"><span class="view-lbl">Age</span><span class="view-val">${g.age_months ? g.age_months + ' months' : '—'}</span></div>
      <div class="view-item"><span class="view-lbl">Weight</span><span class="view-val">${g.weight_kg} kg</span></div>
      <div class="view-item"><span class="view-lbl">Purchase Date</span><span class="view-val">${g.purchase_date}</span></div>
      <div class="view-item"><span class="view-lbl">Cost Price</span><span class="view-val">₹${fmt(g.cost_price)}</span></div>
      <div class="view-item"><span class="view-lbl">Extra Costs</span><span class="view-val">₹${fmt(g.extra_costs)}</span></div>
      <div class="view-item"><span class="view-lbl">Total Cost</span><span class="view-val">₹${fmt(totalCost)}</span></div>
      <div class="view-item"><span class="view-lbl">Cost / kg</span><span class="view-val">₹${(totalCost / g.weight_kg).toFixed(2)}</span></div>
      ${g.status === 'sold' ? `
        <div class="view-item"><span class="view-lbl">Selling Price</span><span class="view-val">₹${fmt(g.selling_price)}</span></div>
        <div class="view-item"><span class="view-lbl">Sell / kg</span><span class="view-val">₹${(g.selling_price / g.weight_kg).toFixed(2)}</span></div>
        <div class="view-item"><span class="view-lbl">Buyer</span><span class="view-val">${esc(g.buyer_name || '—')}</span></div>
        <div class="view-item"><span class="view-lbl">Buyer Phone</span><span class="view-val">${esc(g.buyer_phone || '—')}</span></div>
        <div class="view-item"><span class="view-lbl">Sale Date</span><span class="view-val">${g.sale_date}</span></div>
        <div class="view-item">
          <span class="view-lbl">Profit / Loss</span>
          <span class="view-val" style="color:${profit >= 0 ? '#2e7d32' : '#c62828'};font-size:1.05rem">
            ${profit >= 0 ? '▲ +' : '▼ '}₹${fmt(Math.abs(profit))}
          </span>
        </div>` : ''}
      <div class="view-item view-full"><span class="view-lbl">Notes</span><span class="view-val">${esc(g.notes || '—')}</span></div>
      <div class="view-item"><span class="view-lbl">Added By</span><span class="view-val">${esc(g.added_by || '—')}</span></div>
      <div class="view-item"><span class="view-lbl">Added On</span><span class="view-val">${g.created_at}</span></div>
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
