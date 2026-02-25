/**
 * StatementGuard — Frontend Application Logic
 * Handles sidebar navigation, file selection, processing,
 * table rendering, search, pagination, and CSV export.
 */

// ===== MODULE CONFIG =====
const MODULES = {
  validation: {
    title: 'Validation Results',
    columns: ['card', 'field', 'expected', 'actual', 'status'],
    searchColumn: 'card',
    searchPlaceholder: 'Search card number...',
    dataKey: 'validations'
  },
  posting: {
    title: 'Posting Date Filter',
    columns: ['posting', 'card', 'line'],
    searchColumn: 'card',
    searchPlaceholder: 'Search card number...',
    dataKey: 'filtered_transactions'
  },
  structure: {
    title: 'Structure Validation',
    columns: ['customer', 'has_01', 'has_02', 'has_03', 'has_04', 'status', 'missing'],
    searchColumn: 'customer',
    searchPlaceholder: 'Search customer...',
    dataKey: 'structure_results'
  },
  duplicate: {
    title: 'Duplicate Transactions',
    columns: ['card', 'posting_date', 'trx_detail', 'amount', 'direction', 'count'],
    searchColumn: 'card',
    searchPlaceholder: 'Search card number...',
    dataKey: 'duplicate_transactions'
  },
  totpay: {
    title: 'Tot Payment Check',
    columns: ['card', 'tot_payment', 'has_cr', 'cr_total', 'status'],
    searchColumn: 'card',
    searchPlaceholder: 'Search card number...',
    dataKey: 'tot_payment_results'
  },
  zeroamt: {
    title: 'Zero Amount Check',
    columns: ['card', 'posting_date', 'trx_detail', 'amount', 'direction'],
    searchColumn: 'card',
    searchPlaceholder: 'Search card number...',
    dataKey: 'zero_amount_transactions'
  },
  sequence: {
    title: 'Sequence Check',
    columns: ['customer', 'sequence', 'status'],
    searchColumn: 'customer',
    searchPlaceholder: 'Search customer...',
    dataKey: 'sequence_results'
  }
};

// ===== STATE =====
const state = {
  currentModule: 'dashboard',
  filePath: null,
  allData: {},
  currentData: [],      // current module data (after search)
  currentPage: 1,
  pageSize: 50,
  sortColumn: null,
  sortAscending: true,
  searchText: '',
  processing: false
};

// ===== DOM REFERENCES =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  navItems: () => $$('.nav-item'),
  btnSelectFile: () => $('#btnSelectFile'),
  fileName: () => $('#fileName'),
  btnProcess: () => $('#btnProcess'),
  dateFrom: () => $('#dateFrom'),
  dateUntil: () => $('#dateUntil'),
  progressBar: () => $('#progressBar'),
  progressPercent: () => $('#progressPercent'),
  resultsTitle: () => $('#resultsTitle'),
  searchInput: () => $('#searchInput'),
  btnClear: () => $('#btnClear'),
  tableHead: () => $('#tableHead'),
  tableBody: () => $('#tableBody'),
  emptyState: () => $('#emptyState'),
  showingInfo: () => $('#showingInfo'),
  pagination: () => $('#pagination'),
  btnExport: () => $('#btnExport'),
  darkModeToggle: () => $('#darkModeToggle'),
  statusText: () => $('.status-text')
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initControls();
  initSearch();
  initDarkMode();
  switchModule('dashboard');
  
  if (window.api) {
    // Listen for progress updates
    window.api.onProgress((data) => {
      updateProgress(data.percent);
    });
    
    // Listen for realtime data updates
    window.api.onData((data) => {
      handleRealtimeData(data);
    });
  }
});

// ===== REALTIME DATA HANDLER =====
let realtimeRenderTimer = null;

function handleRealtimeData(data) {
  const { module, rows } = data;
  if (!rows || rows.length === 0) return;
  
  // Initialize array if not exists
  if (!state.allData[module]) {
    state.allData[module] = [];
  }
  
  // Append new rows
  state.allData[module].push(...rows);
  
  // Find which UI module matches this data key
  const activeConfig = MODULES[state.currentModule];
  if (activeConfig && activeConfig.dataKey === module) {
    // Throttle re-renders to max once per 500ms so user can interact freely
    if (!realtimeRenderTimer) {
      realtimeRenderTimer = setTimeout(() => {
        realtimeRenderTimer = null;
        const searchHadFocus = document.activeElement === dom.searchInput();
        renderTable();
        if (searchHadFocus) {
          dom.searchInput().focus();
        }
      }, 500);
    }
  }
  
  // Always update dashboard if viewing it
  if (state.currentModule === 'dashboard') {
    if (!realtimeRenderTimer) {
      realtimeRenderTimer = setTimeout(() => {
        realtimeRenderTimer = null;
        renderDashboard();
      }, 500);
    }
  }
}

// ===== SIDEBAR =====
function initSidebar() {
  dom.navItems().forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const module = item.dataset.module;
      switchModule(module);
    });
  });
}

function switchModule(moduleName) {
  state.currentModule = moduleName;
  state.currentPage = 1;
  state.searchText = '';
  state.sortColumn = null;
  state.sortAscending = true;
  
  // Update active nav
  dom.navItems().forEach(item => {
    item.classList.toggle('active', item.dataset.module === moduleName);
  });
  
  // Toggle views
  const dashboardView = document.getElementById('dashboardView');
  const tableView = document.getElementById('tableView');
  
  if (moduleName === 'dashboard') {
    dashboardView.style.display = '';
    tableView.style.display = 'none';
    renderDashboard();
  } else {
    dashboardView.style.display = 'none';
    tableView.style.display = '';
    
    const config = MODULES[moduleName];
    dom.resultsTitle().textContent = config.title;
    dom.searchInput().placeholder = config.searchPlaceholder;
    dom.searchInput().value = '';
    renderTable();
  }
}

// ===== DASHBOARD =====
function renderDashboard() {
  const d = state.allData;
  
  // --- Compute stats ---
  const validations = d.validations || [];
  const structure = d.structure_results || [];
  const totpay = d.tot_payment_results || [];
  const sequence = d.sequence_results || [];
  const duplicates = d.duplicate_transactions || [];
  const zeroamt = d.zero_amount_transactions || [];
  const filtered = d.filtered_transactions || [];
  
  // Validation pass/fail
  const valPass = validations.filter(r => r.status === 'PASS').length;
  const valFail = validations.filter(r => r.status === 'FAIL').length;
  const valTotal = validations.length;
  
  // Structure valid/invalid
  const strValid = structure.filter(r => r.status === 'VALID').length;
  const strInvalid = structure.filter(r => r.status === 'INVALID').length;
  
  // TotPay valid/invalid
  const tpValid = totpay.filter(r => r.status === 'VALID').length;
  const tpInvalid = totpay.filter(r => r.status === 'INVALID').length;
  
  // Sequence valid/invalid
  const seqValid = sequence.filter(r => r.status === 'VALID').length;
  const seqInvalid = sequence.filter(r => r.status === 'INVALID').length;
  
  // Overall health (structure + totpay + sequence)
  const healthValid = strValid + tpValid + seqValid;
  const healthInvalid = strInvalid + tpInvalid + seqInvalid;
  const healthTotal = healthValid + healthInvalid;
  
  // Total checks = all items with status + issue counts
  const totalChecks = valTotal + healthTotal + duplicates.length + zeroamt.length + filtered.length;
  
  // Issues = failures + duplicates + zero amounts
  const totalIssues = valFail + healthInvalid + duplicates.length + zeroamt.length;
  
  // Unique cards
  const cardSet = new Set();
  validations.forEach(r => { if (r.card) cardSet.add(r.card); });
  totpay.forEach(r => { if (r.card) cardSet.add(r.card); });
  
  // Pass rate
  const passRate = valTotal > 0 ? Math.round((valPass / valTotal) * 100) : 0;
  
  // --- Update Metric Cards ---
  document.getElementById('metricTotal').textContent = totalChecks.toLocaleString();
  document.getElementById('metricPassRate').textContent = passRate + '%';
  document.getElementById('metricIssues').textContent = totalIssues.toLocaleString();
  document.getElementById('metricCards').textContent = cardSet.size.toLocaleString();
  
  // --- Donut: Validation Results ---
  const valDeg = valTotal > 0 ? (valPass / valTotal) * 360 : 0;
  document.getElementById('donutValidation').style.background = 
    valTotal > 0
      ? `conic-gradient(#27ae60 0deg, #27ae60 ${valDeg}deg, #e74c3c ${valDeg}deg, #e74c3c 360deg)`
      : 'conic-gradient(#e9ecef 0deg, #e9ecef 360deg)';
  document.getElementById('donutValPercent').textContent = passRate + '%';
  document.getElementById('legendValPass').textContent = valPass;
  document.getElementById('legendValFail').textContent = valFail;
  
  // --- Donut: Overall Health ---
  const healthRate = healthTotal > 0 ? Math.round((healthValid / healthTotal) * 100) : 0;
  const healthDeg = healthTotal > 0 ? (healthValid / healthTotal) * 360 : 0;
  document.getElementById('donutHealth').style.background = 
    healthTotal > 0
      ? `conic-gradient(#27ae60 0deg, #27ae60 ${healthDeg}deg, #e74c3c ${healthDeg}deg, #e74c3c 360deg)`
      : 'conic-gradient(#e9ecef 0deg, #e9ecef 360deg)';
  document.getElementById('donutHealthPercent').textContent = healthRate + '%';
  document.getElementById('legendHealthValid').textContent = healthValid;
  document.getElementById('legendHealthInvalid').textContent = healthInvalid;
  
  // --- Module Health Table ---
  const modules = [
    { name: 'Validation Results', total: valTotal, pass: valPass, fail: valFail },
    { name: 'Structure Validation', total: structure.length, pass: strValid, fail: strInvalid },
    { name: 'Tot Payment Check', total: totpay.length, pass: tpValid, fail: tpInvalid },
    { name: 'Sequence Check', total: sequence.length, pass: seqValid, fail: seqInvalid },
    { name: 'Duplicate Transactions', total: duplicates.length, pass: 0, fail: duplicates.length },
    { name: 'Zero Amount', total: zeroamt.length, pass: 0, fail: zeroamt.length },
    { name: 'Posting Date Filter', total: filtered.length, pass: 0, fail: filtered.length },
  ];
  
  const tbody = document.getElementById('moduleHealthBody');
  tbody.innerHTML = '';
  modules.forEach(m => {
    const rate = m.total > 0 ? Math.round((m.pass / m.total) * 100) : (m.total === 0 ? 100 : 0);
    const barColor = rate >= 80 ? '#27ae60' : rate >= 50 ? '#f39c12' : '#e74c3c';
    let statusHtml;
    if (m.total === 0) {
      statusHtml = '<span style="color:#adb5bd;font-size:12px">No Data</span>';
    } else if (m.fail === 0) {
      statusHtml = '<span class="status-valid">All Clear</span>';
    } else {
      statusHtml = `<span class="status-mismatch">${m.fail} Issue${m.fail > 1 ? 's' : ''}</span>`;
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600">${m.name}</td>
      <td>${m.total}</td>
      <td style="color:#27ae60;font-weight:600">${m.pass}</td>
      <td style="color:${m.fail > 0 ? '#e74c3c' : '#adb5bd'};font-weight:600">${m.fail}</td>
      <td>
        <div class="rate-bar"><div class="rate-fill" style="width:${rate}%;background:${barColor}"></div></div>
        ${m.total > 0 ? rate + '%' : '-'}
      </td>
      <td>${statusHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

function initControls() {
  // File selection
  dom.btnSelectFile().addEventListener('click', async () => {
    if (!window.api) {
      alert('API not available');
      return;
    }
    const filePath = await window.api.selectFile();
    if (filePath) {
      state.filePath = filePath;
      const fileName = filePath.split(/[\\/]/).pop();
      dom.fileName().textContent = fileName;
      dom.fileName().title = filePath;
    }
  });
  
  // Process button
  dom.btnProcess().addEventListener('click', startProcessing);
  
  // Export button
  dom.btnExport().addEventListener('click', exportCSV);
}

async function startProcessing() {
  if (!state.filePath) {
    showToast('Pilih file terlebih dahulu', 'error');
    return;
  }
  
  if (state.processing) return;
  state.processing = true;
  
  // Clear previous data for fresh realtime display
  state.allData = {};
  state.currentPage = 1;
  if (state.currentModule === 'dashboard') {
    renderDashboard();
  } else {
    renderTable();
  }
  
  const btnProcess = dom.btnProcess();
  btnProcess.disabled = true;
  btnProcess.innerHTML = '<span class="material-icons-outlined" style="font-size:18px;animation:spin 1s linear infinite">sync</span> Processing...';
  
  updateStatus('Processing...');
  updateProgress(0);
  
  const cardType = document.querySelector('input[name="cardType"]:checked').value;
  const fromDate = dom.dateFrom().value;
  const untilDate = dom.dateUntil().value;
  
  try {
    const result = await window.api.runValidation({
      file_path: state.filePath,
      card_type: cardType,
      from_date: fromDate,
      until_date: untilDate
    });
    
    if (result.success) {
      // Use final result to ensure completeness (overwrites streamed data)
      state.allData = result.data;
      updateProgress(100);
      if (state.currentModule === 'dashboard') {
        renderDashboard();
      } else {
        renderTable();
      }
      showToast('Validation completed successfully!', 'success');
      updateStatus('System Ready');
    } else {
      showToast(`Error: ${result.error}`, 'error');
      updateStatus('Error occurred');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    updateStatus('Error occurred');
  } finally {
    state.processing = false;
    btnProcess.disabled = false;
    btnProcess.innerHTML = '<span class="material-icons-outlined" style="font-size:18px">play_arrow</span> Proses';
  }
}

function updateProgress(percent) {
  dom.progressBar().style.width = `${percent}%`;
  dom.progressPercent().textContent = `${percent}% Complete`;
}

function updateStatus(text) {
  const statusEl = dom.statusText();
  if (statusEl) statusEl.textContent = text;
}

// ===== SEARCH =====
function initSearch() {
  dom.searchInput().addEventListener('input', debounce(() => {
    state.searchText = dom.searchInput().value.trim();
    state.currentPage = 1;
    renderTable();
  }, 250));
  
  dom.searchInput().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.searchText = dom.searchInput().value.trim();
      state.currentPage = 1;
      renderTable();
    }
  });
  
  dom.btnClear().addEventListener('click', () => {
    dom.searchInput().value = '';
    state.searchText = '';
    state.currentPage = 1;
    renderTable();
  });
}

// ===== TABLE RENDERING =====
function renderTable() {
  const config = MODULES[state.currentModule];
  const rawData = state.allData[config.dataKey] || [];
  
  // Apply search
  let data = rawData;
  if (state.searchText) {
    const searchLower = state.searchText.toLowerCase();
    data = rawData.filter(row => {
      const val = String(row[config.searchColumn] || '').toLowerCase();
      return val.includes(searchLower);
    });
  }
  
  // Apply sort
  if (state.sortColumn) {
    data = [...data].sort((a, b) => {
      const va = a[state.sortColumn] ?? '';
      const vb = b[state.sortColumn] ?? '';
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return state.sortAscending ? cmp : -cmp;
    });
  }
  
  state.currentData = data;
  
  // Render header
  renderTableHead(config.columns);
  
  // Render body
  renderTableBody(config, data);
  
  // Render pagination
  renderPagination(data.length);
  
  // Show/hide empty state
  const empty = dom.emptyState();
  const table = $('table.data-table');
  if (data.length === 0) {
    empty.classList.add('visible');
    table.style.display = 'none';
  } else {
    empty.classList.remove('visible');
    table.style.display = '';
  }
}

function renderTableHead(columns) {
  const head = dom.tableHead();
  head.innerHTML = '';
  
  columns.forEach(col => {
    const th = document.createElement('th');
    const label = col.replace(/_/g, ' ');
    let sortIndicator = '';
    if (state.sortColumn === col) {
      sortIndicator = state.sortAscending ? ' ↑' : ' ↓';
    }
    th.textContent = label + sortIndicator;
    th.addEventListener('click', () => sortBy(col));
    head.appendChild(th);
  });
}

function renderTableBody(config, data) {
  const body = dom.tableBody();
  body.innerHTML = '';
  
  const start = (state.currentPage - 1) * state.pageSize;
  const end = Math.min(start + state.pageSize, data.length);
  const page = data.slice(start, end);
  
  page.forEach(row => {
    const tr = document.createElement('tr');
    config.columns.forEach(col => {
      const td = document.createElement('td');
      const value = row[col] ?? '';
      
      if (col === 'status') {
        td.innerHTML = renderStatusBadge(String(value));
      } else if (col === 'actual' && row['status']) {
        // Color the actual value to match its status
        const statusLower = String(row['status']).toLowerCase();
        if (statusLower === 'pass' || statusLower === 'valid') {
          td.innerHTML = `<span style="color:#27ae60;font-weight:600">${escapeHtml(String(value))}</span>`;
        } else if (statusLower === 'fail' || statusLower === 'invalid' || statusLower === 'mismatch') {
          td.innerHTML = `<span style="color:#e74c3c;font-weight:600">${escapeHtml(String(value))}</span>`;
        } else if (statusLower === 'warning' || statusLower === 'missing') {
          td.innerHTML = `<span style="color:#f39c12;font-weight:600">${escapeHtml(String(value))}</span>`;
        } else {
          td.textContent = String(value);
        }
      } else {
        td.textContent = String(value);
      }
      
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function renderStatusBadge(status) {
  const s = status.toLowerCase();
  if (s === 'valid' || s === 'pass' || s === 'complete' || s === 'ok') {
    return `<span class="status-valid">${escapeHtml(status)}</span>`;
  } else if (s === 'mismatch' || s === 'invalid' || s === 'fail') {
    return `<span class="status-mismatch">${escapeHtml(status)}</span>`;
  } else if (s === 'warning' || s === 'missing') {
    return `<span class="status-warning">${escapeHtml(status)}</span>`;
  } else {
    return `<span class="status-invalid">${escapeHtml(status)}</span>`;
  }
}

// ===== SORT =====
function sortBy(column) {
  if (state.sortColumn === column) {
    state.sortAscending = !state.sortAscending;
  } else {
    state.sortColumn = column;
    state.sortAscending = true;
  }
  state.currentPage = 1;
  renderTable();
}

// ===== PAGINATION =====
function renderPagination(totalItems) {
  const container = dom.pagination();
  container.innerHTML = '';
  
  const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
  const start = (state.currentPage - 1) * state.pageSize + 1;
  const end = Math.min(state.currentPage * state.pageSize, totalItems);
  
  // Showing info
  if (totalItems > 0) {
    dom.showingInfo().innerHTML = `Showing <strong>${start}</strong> to <strong>${end}</strong> of <strong>${totalItems}</strong> results`;
  } else {
    dom.showingInfo().textContent = 'Showing 0 results';
  }
  
  if (totalPages <= 1) return;
  
  // Prev button
  const prevBtn = createPageBtn('‹', state.currentPage > 1, () => {
    state.currentPage--;
    renderTable();
  });
  container.appendChild(prevBtn);
  
  // Page numbers (show max 7 pages around current)
  const pages = getPageNumbers(state.currentPage, totalPages, 7);
  pages.forEach(p => {
    if (p === '...') {
      const dots = document.createElement('span');
      dots.textContent = '...';
      dots.style.padding = '0 4px';
      dots.style.color = '#adb5bd';
      container.appendChild(dots);
    } else {
      const btn = createPageBtn(String(p), true, () => {
        state.currentPage = p;
        renderTable();
      });
      if (p === state.currentPage) btn.classList.add('active');
      container.appendChild(btn);
    }
  });
  
  // Next button
  const nextBtn = createPageBtn('›', state.currentPage < totalPages, () => {
    state.currentPage++;
    renderTable();
  });
  container.appendChild(nextBtn);
}

function createPageBtn(text, enabled, onClick) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.textContent = text;
  btn.disabled = !enabled;
  if (enabled) btn.addEventListener('click', onClick);
  return btn;
}

function getPageNumbers(current, total, maxVisible) {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  
  const pages = [];
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total, start + maxVisible - 1);
  
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }
  
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push('...');
  }
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  if (end < total) {
    if (end < total - 1) pages.push('...');
    pages.push(total);
  }
  
  return pages;
}

// ===== EXPORT =====
async function exportCSV() {
  const config = MODULES[state.currentModule];
  const data = state.currentData;
  
  if (!data || data.length === 0) {
    showToast('No data to export', 'error');
    return;
  }
  
  if (!window.api) return;
  
  const defaultName = `${config.dataKey}_export.csv`;
  const filePath = await window.api.saveFile(defaultName);
  if (!filePath) return;
  
  // Build CSV
  const headers = config.columns.join(',');
  const rows = data.map(row =>
    config.columns.map(col => {
      const val = String(row[col] ?? '');
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',')
  );
  const csv = [headers, ...rows].join('\n');
  
  const result = await window.api.writeCsv(filePath, csv);
  if (result.success) {
    showToast('Export successful!', 'success');
  } else {
    showToast(`Export failed: ${result.error}`, 'error');
  }
}

// ===== DARK MODE =====
function initDarkMode() {
  dom.darkModeToggle().addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    const icon = dom.darkModeToggle().querySelector('.material-icons-outlined');
    icon.textContent = isDark ? 'light_mode' : 'dark_mode';
  });
}

// ===== TOAST NOTIFICATION =====
function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // Styling
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '12px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'var(--font)',
    color: '#fff',
    zIndex: '9999',
    animation: 'fadeIn 0.3s ease',
    maxWidth: '400px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
  });
  
  if (type === 'success') {
    toast.style.background = '#27ae60';
  } else if (type === 'error') {
    toast.style.background = '#e74c3c';
  } else {
    toast.style.background = '#3498db';
  }
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== UTILITIES =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Add spinning animation for processing button
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);
