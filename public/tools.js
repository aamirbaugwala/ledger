// ═══════════════════════════════════════════════════════════
//  tools.js — Bulk Add, Market Rate Calc, WhatsApp Receipt
// ═══════════════════════════════════════════════════════════

// ── Update Shared Costs ─────────────────────────────────────
async function openRecalcCostsModal() {
  document.getElementById('rcTransport').value = '';
  document.getElementById('rcHKB').value       = '';
  document.getElementById('rcOther').value     = '';
  document.getElementById('recalcPreviewBox').classList.add('hidden');
  document.getElementById('recalcErr').classList.add('hidden');
  document.getElementById('recalcCurrentInfo').textContent = 'Loading current totals…';

  // Open modal immediately — don't wait for API
  showModal('recalcCostsModal');
  // reset mode to default
  const addRadio = document.querySelector('input[name="rcMode"][value="add"]');
  if (addRadio) addRadio.checked = true;

  // Then load current totals from all goats
  const all = await api('/api/goats') || [];
  const currentTotal = all.reduce((s, g) => s + parseFloat(g.extra_costs || 0), 0);
  const totalWt      = all.reduce((s, g) => s + parseFloat(g.weight_kg || 0), 0);
  const avgPerGoat   = all.length ? Math.round(currentTotal / all.length) : 0;
  document.getElementById('recalcCurrentInfo').dataset.currentTotal = currentTotal;

  document.getElementById('recalcCurrentInfo').innerHTML =
    `<strong>${all.length} goats</strong> · Total buy wt: <strong>${totalWt.toFixed(1)} kg</strong><br>
     Current total extra costs: <strong>₹${fmt(Math.round(currentTotal))}</strong> · Avg per goat: <strong>₹${fmt(avgPerGoat)}</strong>`;
}

function recalcPreview() {
  const t = parseFloat(document.getElementById('rcTransport').value) || 0;
  const h = parseFloat(document.getElementById('rcHKB').value)       || 0;
  const o = parseFloat(document.getElementById('rcOther').value)     || 0;
  const entered = t + h + o;
  const box     = document.getElementById('recalcPreviewBox');
  const mode    = document.querySelector('input[name="rcMode"]:checked')?.value || 'add';
  const currentTotal = parseFloat(document.getElementById('recalcCurrentInfo').dataset.currentTotal || 0);

  if (entered <= 0) { box.classList.add('hidden'); return; }

  const newTotal  = mode === 'add' ? currentTotal + entered : entered;
  const modeLabel = mode === 'add'
    ? `➕ Adding ₹${fmt(entered)} on top of existing ₹${fmt(Math.round(currentTotal))}`
    : `🔄 Replacing existing ₹${fmt(Math.round(currentTotal))} entirely`;

  box.classList.remove('hidden');
  box.innerHTML =
    `<strong>New total extra costs will be: ₹${fmt(Math.round(newTotal))}</strong>
     <span style="margin-left:10px;color:var(--text-3);font-size:0.78rem">${modeLabel}</span><br>
     <span style="color:var(--text-2);font-size:0.78rem;margin-top:4px;display:block">
       🚚 Transport ₹${fmt(t)} &nbsp;+&nbsp; 🤝 HKB ₹${fmt(h)} &nbsp;+&nbsp; 📦 Other ₹${fmt(o)}
       — split proportionally by buy weight across all goats.
     </span>`;
}

async function confirmRecalcCosts() {
  const t = parseFloat(document.getElementById('rcTransport').value) || 0;
  const h = parseFloat(document.getElementById('rcHKB').value)       || 0;
  const o = parseFloat(document.getElementById('rcOther').value)     || 0;
  const mode    = document.querySelector('input[name="rcMode"]:checked')?.value || 'add';
  const errEl   = document.getElementById('recalcErr');
  errEl.classList.add('hidden');

  if (t + h + o <= 0) {
    errEl.textContent = '⚠️ Enter at least one cost greater than 0.';
    errEl.classList.remove('hidden');
    return;
  }

  const currentTotal = parseFloat(document.getElementById('recalcCurrentInfo').dataset.currentTotal || 0);
  const newTotal     = mode === 'add' ? currentTotal + (t + h + o) : (t + h + o);
  const modeText     = mode === 'add' ? `add ₹${fmt(t+h+o)} to existing` : `replace with ₹${fmt(t+h+o)}`;
  if (!confirm(`${mode === 'add' ? '➕' : '🔄'} ${modeText} — new total will be ₹${fmt(Math.round(newTotal))} across all goats. Proceed?`)) return;

  const btn = document.getElementById('recalcSaveBtn');
  btn.dataset.loading = 'true';
  btn.disabled = true;

  const res  = await fetch('/api/recalculate-costs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transport: t, hkb: h, other: o, mode })
  });
  const data = await res.json();

  delete btn.dataset.loading;
  btn.disabled = false;

  if (!res.ok) {
    errEl.textContent = '⚠️ ' + (data.error || 'Failed to update costs.');
    errEl.classList.remove('hidden');
    return;
  }

  closeModal('recalcCostsModal');
  showToast(`✅ Extra costs updated for ${data.updated} goats · New total: ₹${fmt(Math.round(data.newTotal))}`, 'success', 5000);
  await loadStock();
  loadDashboard();
}

// ── WhatsApp Receipt ────────────────────────────────────────
async function sendWhatsApp(id) {
  const g = await api(`/api/goats/${id}`);
  if (!g) { showToast('Could not load goat details', 'error'); return; }

  const totalCost = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
  const advance   = parseFloat(g.advance_amount || 0);
  const sp        = parseFloat(g.selling_price);
  const remaining = sp - advance;
  const isBooked  = g.status === 'booked';
  const saleDate  = g.sale_date ? String(g.sale_date).slice(0, 10) : today();
  const weight    = g.sale_weight_kg || g.weight_kg;
  const now       = new Date();
  const dateStr   = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr   = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Holding / delivery info
  const isInYard    = g.delivery_status === 'in_yard';
  const isDelivered = g.delivery_status === 'delivered';
  const holdRate    = parseFloat(g.holding_rate || 150);
  let holdDays = 0, holdCharges = 0, holdStart = '';
  if (isInYard || isDelivered) {
    const startDate = g.holding_start_date || g.sale_date;
    if (startDate) {
      holdStart = String(startDate).slice(0, 10);
      const endDate = isDelivered && g.delivery_date ? new Date(g.delivery_date) : now;
      const ms = endDate - new Date(startDate);
      holdDays = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
      holdCharges = isDelivered ? parseFloat(g.holding_charges || holdDays * holdRate)
                                : holdDays * holdRate;
    }
  }

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
    g.buyer_name  ? `• Buyer    : ${g.buyer_name}`  : null,
    g.buyer_phone ? `• Phone    : ${g.buyer_phone}` : null,
    ``,
    `*Payment Summary*`,
    advance > 0 ? `• Advance Paid : ₹${fmt(advance)} (${g.advance_mode || 'cash'})` : null,
    isBooked
      ? `• Balance Due  : *₹${fmt(remaining)}*`
      : `• Final Payment: ₹${fmt(sp - advance)} (${g.final_payment_mode || 'cash'})`,
    `• Total Paid   : ₹${fmt(isBooked ? advance : sp)}`,
    ``,
    (isInYard || isDelivered) ? `*Yard / Delivery*` : null,
    isInYard    ? `• Status       : 🏠 In Yard` : null,
    isDelivered ? `• Status       : 📦 Delivered (${g.delivery_date ? String(g.delivery_date).slice(0,10) : ''})` : null,
    holdStart   ? `• In Yard Since: ${holdStart}` : null,
    (isInYard || isDelivered) ? `• Days in Yard : ${holdDays} day${holdDays !== 1 ? 's' : ''}` : null,
    (isInYard || isDelivered) ? `• Holding Rate : ₹${fmt(holdRate)}/day` : null,
    holdCharges > 0 ? `• Holding Chgs : *₹${fmt(Math.round(holdCharges))}*` : null,
    isInYard    ? `⏳ *Accruing ₹${fmt(holdRate)}/day until delivery.*` : null,
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
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isPWA) location.href = url;
  else       window.open(url, '_blank');
}

// ── Bulk Add (Mandi Mode) ───────────────────────────────────
let bulkRows = [];

function openBulkModal() {
  bulkRows = [{ id: Date.now(), goat_id: '', breed: '', weight: '', cost: '', extra: '0', notes: '' }];
  renderBulkRows();
  document.getElementById('bulkErr').textContent = '';
  document.getElementById('bulkPurchaseDate').value = today();
  document.getElementById('bulkAddedBy').value = '';
  showModal('bulkModal');
}

function renderBulkRows() {
  document.getElementById('bulkTableBody').innerHTML = bulkRows.map((r, i) => `
    <tr data-i="${i}">
      <td><input class="bulk-input" value="${esc(r.goat_id)}" placeholder="G-0${10+i}" oninput="bulkRowUpdate(${i},'goat_id',this.value)" /></td>
      <td><input class="bulk-input" value="${esc(r.breed)}"   placeholder="Sojat"     oninput="bulkRowUpdate(${i},'breed',this.value)" list="breedList" /></td>
      <td><input class="bulk-input number" type="number" value="${r.weight}" placeholder="35"  oninput="bulkRowUpdate(${i},'weight',this.value)" min="0.1" step="0.1" /></td>
      <td><input class="bulk-input number" type="number" value="${r.cost}"   placeholder="450" oninput="bulkRowUpdate(${i},'cost',this.value)" min="1" /></td>
      <td><input class="bulk-input number" type="number" value="${r.extra}"  placeholder="0"   oninput="bulkRowUpdate(${i},'extra',this.value)" min="0" /></td>
      <td class="bulk-total">${r.weight && r.cost ? '₹' + fmt(parseFloat(r.weight)*parseFloat(r.cost) + parseFloat(r.extra||0)) : '—'}</td>
      <td><input class="bulk-input" value="${esc(r.notes)}" placeholder="color, notes…" oninput="bulkRowUpdate(${i},'notes',this.value)" /></td>
      <td><button class="btn btn-danger btn-sm" onclick="bulkRemoveRow(${i})" ${bulkRows.length === 1 ? 'disabled' : ''}>✕</button></td>
    </tr>`).join('');
}

function bulkRowUpdate(i, field, val) {
  bulkRows[i][field] = val;
  const r = bulkRows[i];
  const totalCell = document.querySelectorAll('#bulkTableBody tr')[i]?.querySelector('.bulk-total');
  if (totalCell) {
    totalCell.textContent = r.weight && r.cost
      ? '₹' + fmt(parseFloat(r.weight)*parseFloat(r.cost) + parseFloat(r.extra||0))
      : '—';
  }
}

function bulkAddRow() {
  bulkRows.push({ id: Date.now(), goat_id: '', breed: '', weight: '', cost: '', extra: '0', notes: '' });
  renderBulkRows();
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
  for (let i = 0; i < bulkRows.length; i++) {
    const r = bulkRows[i], n = i + 1;
    if (!r.goat_id.trim())                            { errEl.textContent = `⚠️ Row ${n}: Goat ID is required.`; return; }
    if (!/^[A-Za-z0-9\-_]+$/.test(r.goat_id.trim())) { errEl.textContent = `⚠️ Row ${n}: Invalid Goat ID characters.`; return; }
    if (!r.weight || parseFloat(r.weight) <= 0)       { errEl.textContent = `⚠️ Row ${n}: Valid weight required.`; return; }
    if (!r.cost   || parseFloat(r.cost)   <= 0)       { errEl.textContent = `⚠️ Row ${n}: Valid cost/kg required.`; return; }
  }
  const ids   = bulkRows.map(r => r.goat_id.trim().toUpperCase());
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) { errEl.textContent = `⚠️ Duplicate Goat IDs: ${[...new Set(dupes)].join(', ')}`; return; }

  const btn = document.getElementById('bulkSaveBtn');
  btn.dataset.loading = 'true';
  const purchaseDate = document.getElementById('bulkPurchaseDate').value || today();
  const addedBy      = document.getElementById('bulkAddedBy').value.trim();
  let saved = 0, failed = [];
  for (const r of bulkRows) {
    const fd = new FormData();
    const totalCost = parseFloat((parseFloat(r.weight) * parseFloat(r.cost)).toFixed(2));
    fd.append('goat_id',       r.goat_id.trim());
    fd.append('breed',         r.breed.trim());
    fd.append('weight_kg',     r.weight);
    fd.append('cost_price',    totalCost);
    fd.append('extra_costs',   parseFloat(r.extra) || 0);
    fd.append('notes',         r.notes.trim());
    fd.append('purchase_date', purchaseDate);
    fd.append('added_by',      addedBy);
    const res = await fetch('/api/goats', { method: 'POST', body: fd });
    if (res.ok) saved++;
    else { const d = await res.json().catch(() => ({})); failed.push(`${r.goat_id}: ${d.error || 'error'}`); }
  }
  delete btn.dataset.loading;
  if (failed.length) {
    errEl.textContent = `⚠️ Some failed: ${failed.join(' | ')}`;
    if (saved > 0) showToast(`${saved} added, ${failed.length} failed`, 'warning');
  } else {
    closeModal('bulkModal');
    showToast(`✅ ${saved} goat(s) added from mandi!`, 'success', 4000);
    await loadStock(); loadDashboard();
  }
}

// ── Market Rate Calculator ──────────────────────────────────
function openMarketCalc() {
  document.getElementById('marketRateInput').value = '';
  document.getElementById('marketCalcResults').innerHTML =
    `<p style="color:var(--text-3);text-align:center;padding:20px 0">Enter a market rate above to see profitability for each goat.</p>`;
  showModal('marketCalcModal');
  setTimeout(() => document.getElementById('marketRateInput').focus(), 150);
}

function runMarketCalc() {
  const rate      = parseFloat(document.getElementById('marketRateInput').value);
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
  const rows = available.map(g => {
    const totalCost = parseFloat(g.cost_price) + parseFloat(g.extra_costs || 0);
    const marketVal = rate * parseFloat(g.weight_kg);
    const profit    = marketVal - totalCost;
    const pct       = totalCost > 0 ? ((profit / totalCost) * 100).toFixed(1) : 0;
    return { g, totalCost, marketVal, profit, pct };
  }).sort((a, b) => b.profit - a.profit);

  const totalMarket = rows.reduce((s, r) => s + r.marketVal, 0);
  const totalCostAll = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalProfit = totalMarket - totalCostAll;
  const profitable  = rows.filter(r => r.profit >= 0).length;

  resultsEl.innerHTML = `
    <div class="mc-summary">
      <div class="mc-sum-card green"><div class="mc-sum-val">₹${fmt(totalMarket)}</div><div class="mc-sum-lbl">Total Market Value</div></div>
      <div class="mc-sum-card ${totalProfit >= 0 ? 'green' : 'red'}">
        <div class="mc-sum-val">${totalProfit >= 0 ? '+' : ''}₹${fmt(totalProfit)}</div>
        <div class="mc-sum-lbl">Total ${totalProfit >= 0 ? 'Profit' : 'Loss'}</div>
      </div>
      <div class="mc-sum-card blue"><div class="mc-sum-val">${profitable}/${rows.length}</div><div class="mc-sum-lbl">Profitable Goats</div></div>
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
            <span class="mc-pnl ${r.profit >= 0 ? 'bp' : 'bl'}">${r.profit >= 0 ? '▲ +' : '▼ '}₹${fmt(Math.abs(r.profit))} (${r.pct}%)</span>
          </div>
        </div>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  Excel Import
// ═══════════════════════════════════════════════════════════

let _importParsed = [];   // parsed rows ready to save

function openImportModal() {
  _importParsed = [];
  document.getElementById('impPasteArea').value = '';
  document.getElementById('impPreview').innerHTML = '';
  document.getElementById('impErr').classList.add('hidden');
  document.getElementById('impSaveBtn').style.display = 'none';
  document.getElementById('impPurchaseDate').value = today();
  document.getElementById('impAddedBy').value = '';
  showModal('importModal');
}

// Called on any input change — re-parses & re-renders preview
function refreshImportPreview() {
  const raw = document.getElementById('impPasteArea').value.trim();
  if (!raw) {
    document.getElementById('impPreview').innerHTML = '';
    document.getElementById('impSaveBtn').style.display = 'none';
    _importParsed = [];
    return;
  }

  const defPct  = parseFloat(document.getElementById('impDefaultPct').value)  || 95;
  const defRate = parseFloat(document.getElementById('impDefaultRate').value)  || 530;
  const totTrans = parseFloat(document.getElementById('impTransport').value)   || 0;
  const totHKB   = parseFloat(document.getElementById('impHKB').value)         || 0;
  const totOther = parseFloat(document.getElementById('impOther').value)       || 0;

  // Parse lines — skip blank / header lines
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !/^original/i.test(l));
  const rows = [];
  for (const line of lines) {
    // Split on tab OR multiple spaces
    const cols = line.split(/\t+| {2,}/).map(c => c.trim().replace(/,/g, ''));
    const origWt = parseFloat(cols[0]);
    if (!origWt || origWt <= 0) continue;   // skip non-numeric rows

    // Expected % — strip the % sign if present
    let pct = defPct;
    if (cols[1] !== undefined && cols[1] !== '') {
      const p = parseFloat(cols[1].replace('%', ''));
      if (!isNaN(p) && p > 0 && p <= 100) pct = p;
    }

    // Rate per kg
    let rate = defRate;
    if (cols[2] !== undefined && cols[2] !== '') {
      const r = parseFloat(cols[2]);
      if (!isNaN(r) && r > 0) rate = r;
    }

    rows.push({ origWt, pct, rate });
  }

  if (!rows.length) {
    document.getElementById('impPreview').innerHTML = `<div class="error-msg" style="margin-top:8px">⚠️ No valid weight data found. Make sure Column 1 is the numeric Original Weight.</div>`;
    document.getElementById('impSaveBtn').style.display = 'none';
    _importParsed = [];
    return;
  }

  // Calculate per-goat costs
  const totalWt = rows.reduce((s, r) => s + r.origWt, 0);
  const startNum = parseInt(document.getElementById('impStartNum').value) || 1;
  const prefix   = document.getElementById('impPrefix').value || 'G-';
  const breed    = document.getElementById('impBreed').value.trim();

  let grandTotal = 0;
  _importParsed = rows.map((r, i) => {
    const expWt        = r.origWt * (r.pct / 100);
    const weightLoss   = r.origWt - expWt;
    const baseCost     = r.origWt * r.rate;           // Amount (original wt × rate)
    const wtLossCost   = weightLoss * r.rate;         // informational only — not included in cost
    const transShare   = totalWt > 0 ? (r.origWt / totalWt) * totTrans : 0;
    const hkbShare     = totalWt > 0 ? (r.origWt / totalWt) * totHKB   : 0;
    const otherShare   = totalWt > 0 ? (r.origWt / totalWt) * totOther : 0;
    const totalCost    = baseCost + transShare + hkbShare + otherShare;
    const ratePerKg    = expWt > 0 ? totalCost / expWt : 0;   // cost per kg on expected weight
    const goatId       = prefix + String(startNum + i).padStart(3, '0');
    grandTotal += totalCost;
    return { goatId, breed, origWt: r.origWt, expWt, pct: r.pct, rate: r.rate,
             baseCost, wtLossCost, transShare, hkbShare, otherShare, totalCost, ratePerKg };
  });

  // Render preview table
  const rows_html = _importParsed.map((r, i) => `
    <tr>
      <td><input class="bulk-input" value="${esc(r.goatId)}" style="min-width:80px"
          onchange="_importParsed[${i}].goatId = this.value" /></td>
      <td style="white-space:nowrap">${r.origWt} kg</td>
      <td style="white-space:nowrap;color:var(--amber)">${r.expWt.toFixed(1)} kg <small>(${r.pct}%)</small></td>
      <td style="white-space:nowrap">₹${r.rate}</td>
      <td style="white-space:nowrap">₹${fmt(Math.round(r.baseCost))}</td>
      <td style="white-space:nowrap;color:var(--text-3)">₹${fmt(Math.round(r.transShare + r.hkbShare + r.otherShare))}</td>
      <td style="white-space:nowrap;font-weight:700;color:var(--green-deeper)">₹${fmt(Math.round(r.totalCost))}</td>
      <td style="white-space:nowrap;color:var(--blue)">₹${fmt(Math.round(r.ratePerKg))}/kg</td>
    </tr>`).join('');

  document.getElementById('impPreview').innerHTML = `
    <div class="imp-preview-bar">
      <span>📦 <strong>${_importParsed.length} goats</strong></span>
      <span>Total Wt: <strong>${totalWt.toFixed(1)} kg</strong></span>
      <span>Total Cost: <strong>₹${fmt(Math.round(grandTotal))}</strong></span>
      <span style="color:var(--text-3);font-size:0.75rem">Goat IDs are editable below</span>
    </div>
    <div class="bulk-table-wrap" style="max-height:45vh">
      <table class="bulk-table">
        <thead><tr>
          <th>Goat ID</th><th>Buy Wt</th><th>Exp. Wt</th><th>Rate/kg</th>
          <th>Cost Price</th><th>Shared Costs</th><th>Total Cost</th><th>₹/kg (exp)</th>
        </tr></thead>
        <tbody>${rows_html}</tbody>
      </table>
    </div>`;

  document.getElementById('impSaveBtn').style.display = '';
  document.getElementById('impSaveBtn').textContent = `📥 Import ${_importParsed.length} Goats`;
  document.getElementById('impErr').classList.add('hidden');
}

async function confirmImport() {
  if (!_importParsed.length) return;

  const errEl = document.getElementById('impErr');
  errEl.classList.add('hidden');

  // Check for duplicate IDs in this batch
  const ids = _importParsed.map(r => r.goatId.trim().toUpperCase());
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) {
    errEl.textContent = `⚠️ Duplicate Goat IDs: ${[...new Set(dupes)].join(', ')} — edit them above.`;
    errEl.classList.remove('hidden');
    return;
  }

  const breed       = document.getElementById('impBreed').value.trim();
  const purchDate   = document.getElementById('impPurchaseDate').value || today();
  const addedBy     = document.getElementById('impAddedBy').value.trim();
  const btn = document.getElementById('impSaveBtn');
  btn.dataset.loading = 'true';

  let saved = 0, failed = [];
  for (const r of _importParsed) {
    if (!r.goatId.trim()) { failed.push('(empty ID)'); continue; }
    const fd = new FormData();
    fd.append('goat_id',       r.goatId.trim());
    fd.append('breed',         r.breed || breed);
    fd.append('weight_kg',     r.origWt);
    fd.append('cost_price',    Math.round(r.baseCost));  // base weight-based cost (origWt × rate)
    fd.append('extra_costs',   Math.round(r.transShare + r.hkbShare + r.otherShare));  // shared costs
    fd.append('purchase_date', purchDate);
    fd.append('added_by',      addedBy);
    fd.append('notes',         `Exp.wt ${r.expWt.toFixed(1)}kg · ₹${r.rate}/kg purchase rate`);
    const res = await fetch('/api/goats', { method: 'POST', body: fd });
    if (res.ok) saved++;
    else { const d = await res.json().catch(() => ({})); failed.push(`${r.goatId}: ${d.error||'error'}`); }
  }

  delete btn.dataset.loading;

  if (failed.length) {
    errEl.textContent = `⚠️ ${failed.length} failed: ${failed.slice(0,3).join(', ')}${failed.length > 3 ? '…' : ''}`;
    errEl.classList.remove('hidden');
  }
  if (saved > 0) {
    closeModal('importModal');
    showToast(`✅ Imported ${saved} goats successfully!`, 'success', 4000);
    await loadStock();
    loadDashboard();
  }
}
