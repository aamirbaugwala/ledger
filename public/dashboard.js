// ═══════════════════════════════════════════════════════════
//  dashboard.js — Dashboard section
// ═══════════════════════════════════════════════════════════

async function loadDashboard() {
  const d = await api('/api/dashboard');
  if (!d) { showToast('Failed to load dashboard', 'error'); return; }

  const profit = d.totalProfit;

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

  // Pending bookings
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

  // Pay breakdown cards
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

  // Recent activity
  const tbody = document.querySelector('#recentSalesTable tbody');
  if (!d.recentActivity || !d.recentActivity.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af">No activity yet</td></tr>`;
    return;
  }
  tbody.innerHTML = d.recentActivity.map(s => {
    const totalCost = parseFloat(s.cost_price) + parseFloat(s.extra_costs || 0);
    const profit    = parseFloat(s.selling_price) - totalCost;
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
      <td><span class="badge-profit ${profit >= 0 ? 'bp' : 'bl'}">${profit >= 0 ? '+' : ''}₹${fmt(profit)}</span></td>
      <td>${esc(s.buyer_name || '—')}</td>
      <td>${advInfo}</td>
      <td>${date}</td>
    </tr>`;
  }).join('');
}
