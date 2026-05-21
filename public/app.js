// ═══════════════════════════════════════════════════════════
//  app.js — Bootstrap & Navigation
//  Components: utils.js | dashboard.js | stock.js | sales.js | tools.js
// ═══════════════════════════════════════════════════════════

// ─── Global state ───────────────────────────────────────────
let allStock = [];
let allSold  = [];
let charts   = {}; // kept for backward compat, no longer used
let _deferredPWAPrompt = null;

// ─── PWA install prompt ─────────────────────────────────────
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

// ─── Bootstrap ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  prefillNames();
  showSection('dashboard');

  document.getElementById('goatForm').addEventListener('submit',     saveGoat);
  document.getElementById('sellForm').addEventListener('submit',     confirmSale);

  ['fWeight','fCost','fExtra'].forEach(id =>
    document.getElementById(id).addEventListener('input', calcAuto)
  );
  document.getElementById('sellRatePerKg').addEventListener('input', updateSellPreview);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal:not(.hidden)')].pop();
    if (open) closeModal(open.id);
  });
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) closeModal(e.target.id);
  });
});

// ─── Navigation ─────────────────────────────────────────────
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
  const sb   = document.getElementById('sidebar');
  const ov   = document.getElementById('sidebarOverlay');
  const open = force !== undefined ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  ov.classList.toggle('show', open);
}
