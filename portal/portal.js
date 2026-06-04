const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function isLoggedIn() {
  return !!getToken();
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/portal/login';
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('member_id');
  window.location.href = '/portal/login';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showAlert(msg, type = 'error') {
  const el = document.getElementById('alert');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
}

function clearAlert() {
  const el = document.getElementById('alert');
  if (el) el.innerHTML = '';
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCurrency(amount) {
  return parseFloat(amount).toLocaleString('en-US', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
}
