// ═══════════════════════════════════════════════════════════
//  utils.js — Shared utilities
// ═══════════════════════════════════════════════════════════

function fmt(n)  { return Math.round(n || 0).toLocaleString('en-IN'); }
function esc(s)  {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function today() { return new Date().toISOString().split('T')[0]; }

function showModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function setLoading(btnId, on) {
  const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
  if (!btn) return;
  if (on) btn.dataset.loading = 'true';
  else    delete btn.dataset.loading;
}

async function api(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
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

function prefillNames() {
  const names = JSON.parse(localStorage.getItem('gl_names') || '[]');
  const dl = document.getElementById('nameList');
  if (dl) dl.innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
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
