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
      <span class="stat-icon">🏠</span>
      <span class="stat-value" style="color:#d97706">${d.inYardTotal || 0}</span>
      <span class="stat-label">In Yard<br><small style="font-weight:400;text-transform:none;font-size:0.65rem;color:#92400e">${d.inYardBalanceCount || 0} balance · ${d.inYardPaidCount || 0} paid</small></span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">✅</span>
      <span class="stat-value">${d.soldCount}</span>
      <span class="stat-label">Sold &amp; Out</span>
    </div>
    <div class="stat-card" style="border-top:3px solid #f97316">
      <span class="stat-icon">💰</span>
      <span class="stat-value" style="color:#ea580c">₹${fmt(d.outstandingTotal || 0)}</span>
      <span class="stat-label">Outstanding<br><small style="font-weight:400;text-transform:none;font-size:0.65rem;color:#9a3412">₹${fmt(d.balanceDue || 0)} bal · ₹${fmt(Math.round(d.palaiAccruing || 0))} palai</small></span>
    </div>
    <div class="stat-card is-blue">
      <span class="stat-icon">📦</span>
      <span class="stat-value">₹${fmt(d.stockValue)}</span>
      <span class="stat-label">Stock Value</span>
    </div>
    <div class="stat-card is-blue">
      <span class="stat-icon">💵</span>
      <span class="stat-value">₹${fmt(d.totalRevenue)}</span>
      <span class="stat-label">Revenue<br><small style="font-weight:400;text-transform:none;font-size:0.65rem;color:#1d4ed8">${d.totalPalaiCollected > 0 ? `+ ₹${fmt(Math.round(d.totalPalaiCollected))} palai` : 'Palai separate'}</small></span>
    </div>
    <div class="stat-card ${profit >= 0 ? 'is-profit' : 'is-loss'}">
      <span class="stat-icon">${profit >= 0 ? '📈' : '📉'}</span>
      <span class="stat-value">₹${fmt(Math.abs(profit))}</span>
      <span class="stat-label">Net ${profit >= 0 ? 'Profit' : 'Loss'}</span>
    </div>`;

  // In Yard — Outstanding table
  const pendingWrap = document.getElementById('pendingBookingsBody');
  if (pendingWrap) {
    const inYardGoats = d.inYardGoats || d.pendingGoats || [];
    if (!inYardGoats.length) {
      pendingWrap.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">No goats currently in yard</td></tr>`;
    } else {
      pendingWrap.innerHTML = inYardGoats.map(g => {
        const isBalance = g.status === 'booked';
        const sp        = parseFloat(g.selling_price || 0);
        const adv       = parseFloat(g.advance_amount || 0);
        const balance   = parseFloat(g.remaining || 0);
        const days      = parseInt(g.hold_days || 0);
        const palai     = parseFloat(g.palai_accruing || 0);
        const agreed    = parseInt(g.agreed_palai_days || 0);
        const totalDue  = balance + palai;
        const badge     = isBalance
          ? `<span class="st-badge st-inyard-bal" style="white-space:nowrap">Balance Due</span>`
          : `<span class="st-badge st-inyard-paid" style="white-space:nowrap">Paid</span>`;
        return `<tr>
          <td><strong>${esc(g.goat_id)}</strong></td>
          <td>${badge}</td>
          <td>${esc(g.buyer_name || '—')}</td>
          <td>₹${fmt(sp)}</td>
          <td>₹${fmt(adv)}</td>
          <td style="color:${balance > 0 ? '#ea580c' : '#15803d'};font-weight:700">${balance > 0 ? '₹' + fmt(balance) : '✅'}</td>
          <td>${days}d${agreed > 0 ? ` <span style="color:#92400e;font-size:0.7rem">(${agreed}d agreed)</span>` : ''}</td>
          <td style="color:#ea580c">₹${fmt(Math.round(palai))}</td>
          <td style="font-weight:800;color:#c2410c">₹${fmt(Math.round(totalDue))}</td>
        </tr>`;
      }).join('');
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
      <div class="pbc-icon">💰</div>
      <div class="pbc-amount">₹${fmt(Math.round(d.outstandingTotal || 0))}</div>
      <div class="pbc-label">Outstanding</div>
      <div class="pbc-detail">₹${fmt(d.balanceDue || 0)} balance · ₹${fmt(Math.round(d.palaiAccruing || 0))} palai · ${d.inYardTotal || 0} goat${(d.inYardTotal || 0) !== 1 ? 's' : ''}</div>
    </div>
    ${(d.totalPalaiCollected || 0) > 0 ? `
    <div class="pay-breakdown-card" style="border-top:3px solid #ea580c">
      <div class="pbc-icon">🏠</div>
      <div class="pbc-amount" style="color:#ea580c">₹${fmt(Math.round(d.totalPalaiCollected))}</div>
      <div class="pbc-label">Palai Collected</div>
      <div class="pbc-detail">+ ₹${fmt(Math.round(d.palaiAccruing || 0))} accruing in yard</div>
    </div>` : ''}`;

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
      ? `<span style="background:#fef3c7;color:#b45309;padding:2px 7px;border-radius:4px;font-size:0.72rem;font-weight:700">🏠 In Yard</span>`
      : `<span style="background:#dcfce7;color:#166534;padding:2px 7px;border-radius:4px;font-size:0.72rem;font-weight:700">✅ Sold</span>`;
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
