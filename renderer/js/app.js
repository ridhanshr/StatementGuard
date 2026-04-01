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
    dataKey: 'validations'
  },
  posting: {
    title: 'Posting Date Filter',
    columns: ['posting', 'card', 'line'],
    dataKey: 'filtered_transactions'
  },
  structure: {
    title: 'Structure Validation',
    columns: ['customer', 'has_01', 'has_02', 'has_03', 'has_04', 'status', 'missing'],
    dataKey: 'structure_results'
  },
  duplicate: {
    title: 'Duplicate Transactions',
    columns: ['card', 'posting_date', 'trx_detail', 'amount', 'direction', 'count'],
    dataKey: 'duplicate_transactions'
  },
  totpay: {
    title: 'Tot Payment Check',
    columns: ['card', 'tot_payment', 'has_cr', 'cr_total', 'status'],
    dataKey: 'tot_payment_results'
  },
  zeroamt: {
    title: 'Zero Amount Check',
    columns: ['card', 'posting_date', 'trx_detail', 'amount', 'direction'],
    dataKey: 'zero_amount_transactions'
  },
  sequence: {
    title: 'Sequence Check',
    columns: ['customer', 'sequence', 'status'],
    dataKey: 'sequence_results'
  },
  currency: {
    title: 'Transaction Check',
    columns: ['card', 'posting_date', 'trx_detail', 'amount', 'currency', 'direction'],
    dataKey: 'non_idr_transactions'
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
  columnFilters: {},    // { columnName: filterText }
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
  initDarkMode();
  initDashboardNav();
  initPatchModal();
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
  
  // During processing: only show lightweight row count, NO full table render
  if (state.processing) {
    const activeConfig = MODULES[state.currentModule];
    if (activeConfig && activeConfig.dataKey === module) {
      // Lightweight update: just show count in the showing info
      if (!realtimeRenderTimer) {
        realtimeRenderTimer = setTimeout(() => {
          realtimeRenderTimer = null;
          const total = state.allData[activeConfig.dataKey]?.length || 0;
          dom.showingInfo().innerHTML = `<span style="color:#6366f1">Streaming... <strong>${total.toLocaleString()}</strong> rows received</span>`;
        }, 300);
      }
    }
    // Dashboard: lightweight update during processing
    if (state.currentModule === 'dashboard') {
      if (!realtimeRenderTimer) {
        realtimeRenderTimer = setTimeout(() => {
          realtimeRenderTimer = null;
          renderDashboard();
        }, 1000);
      }
    }
    return;
  }
  
  // After processing: full render (this path is rarely hit post-processing)
  const activeConfig = MODULES[state.currentModule];
  if (activeConfig && activeConfig.dataKey === module) {
    if (!realtimeRenderTimer) {
      realtimeRenderTimer = setTimeout(() => {
        realtimeRenderTimer = null;
        renderTable();
      }, 500);
    }
  }
  
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
  state.columnFilters = {};
  state.sortColumn = null;
  state.sortAscending = true;
  state.currentPage = 1;
  
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
    
    // Show/hide Fix button based on module
    const btnFix = document.getElementById('btnFix');
    if (btnFix) {
      const hasFixableIssues = (state.allData.structure_results || []).some(r => r.fixable);
      btnFix.style.display = (moduleName === 'structure' && hasFixableIssues) ? '' : 'none';
    }
    
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
  const nonidr = d.non_idr_transactions || [];
  
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
  const totalChecks = valTotal + healthTotal + duplicates.length + zeroamt.length + filtered.length + nonidr.length;
  
  // Issues = failures + duplicates + zero amounts + non-idr
  const totalIssues = valFail + healthInvalid + duplicates.length + zeroamt.length + nonidr.length;
  
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
  
  // --- Chart.js: Validation Results ---
  renderDoughnutChart('chartValidation', valPass, valFail, 'Pass', 'Fail', passRate + '%');
  document.getElementById('legendValPass').textContent = valPass;
  document.getElementById('legendValFail').textContent = valFail;
  
  // --- Chart.js: Overall Health ---
  const healthRate = healthTotal > 0 ? Math.round((healthValid / healthTotal) * 100) : 0;
  renderDoughnutChart('chartHealth', healthValid, healthInvalid, 'Valid', 'Invalid', healthRate + '%');
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
    { name: 'Transaction Check', total: nonidr.length, pass: 0, fail: nonidr.length },
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
  
  // Add click handlers for navigation
  addHealthTableClickHandlers();
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
  
  // Export buttons
  dom.btnExport().addEventListener('click', exportCSV);
  
  const btnExportExcel = document.getElementById('btnExportExcel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', exportExcel);
  }
  
  const btnBatchExport = document.getElementById('btnBatchExport');
  if (btnBatchExport) {
    btnBatchExport.addEventListener('click', batchExportExcel);
  }
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
  state.columnOptionsCache = {};
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
      // Data is already populated via realtime streaming (handleRealtimeData)
      updateProgress(100);
      state.processing = false; // Set to false BEFORE final render so dropdowns build!
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

// ===== COLUMN FILTERS =====

function updateColumnFilter(column, value) {
  if (value) {
    state.columnFilters[column] = value;
  } else {
    delete state.columnFilters[column];
  }
  state.currentPage = 1;
  renderTable();
}

// Columns that have few distinct values → use dropdown <select>
const DROPDOWN_FILTER_COLUMNS = new Set([
  'status', 'direction', 'field', 'currency',
  'has_01', 'has_02', 'has_03', 'has_04', 'has_cr',
  'fixable', 'count'
]);

// ===== TABLE RENDERING =====
// Track which module the header was last built for, to avoid unnecessary rebuilds
let lastRenderedHeaderModule = null;
let lastRenderedHeaderDataLength = 0;

function renderTable() {
  const config = MODULES[state.currentModule];
  const rawData = state.allData[config.dataKey] || [];
  
  // Apply search
  let data = rawData;
  
  // Column filters
  const filterKeys = Object.keys(state.columnFilters);
  if (filterKeys.length > 0) {
    data = data.filter(row => {
      return filterKeys.every(key => {
        const filterVal = state.columnFilters[key];
        const cellVal = String(row[key] || '').trim();
        
        if (DROPDOWN_FILTER_COLUMNS.has(key)) {
          // Exact match for dropdowns
          return cellVal === filterVal;
        } else {
          // Contains match for text inputs
          return cellVal.toLowerCase().includes(filterVal.toLowerCase());
        }
      });
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
  
  // Only rebuild header when module changes or data length changes significantly (post-processing)
  const needsHeaderRebuild = 
    lastRenderedHeaderModule !== state.currentModule || 
    (!state.processing && lastRenderedHeaderDataLength !== rawData.length);
  
  if (needsHeaderRebuild) {
    renderTableHead(config.columns, rawData);
    lastRenderedHeaderModule = state.currentModule;
    lastRenderedHeaderDataLength = rawData.length;
  }
  
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

function renderTableHead(columns, rawData) {
  const head = dom.tableHead();
  head.innerHTML = '';
  
  const dataKey = MODULES[state.currentModule].dataKey;
  if (!state.columnOptionsCache) state.columnOptionsCache = {};
  if (!state.columnOptionsCache[dataKey]) state.columnOptionsCache[dataKey] = {};
  
  columns.forEach(col => {
    const th = document.createElement('th');
    const label = col.replace(/_/g, ' ');
    
    // Header label wrapper
    const headerContent = document.createElement('div');
    headerContent.className = 'th-header';
    
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    headerContent.appendChild(labelSpan);
    
    // Sort indicator
    if (state.sortColumn === col) {
      const icon = document.createElement('span');
      icon.className = 'sort-icon material-icons-outlined';
      icon.style.fontSize = '14px';
      icon.textContent = state.sortAscending ? 'arrow_upward' : 'arrow_downward';
      headerContent.appendChild(icon);
    }
    
    th.appendChild(headerContent);
    labelSpan.addEventListener('click', () => sortBy(col));
    
    // Filter element (Dropdown or Text Input)
    const isDropdown = DROPDOWN_FILTER_COLUMNS.has(col);
    let filterEl;

    if (isDropdown) {
      // Build Unique values only once after processing complete for dropdowns
      let uniqueVals = state.columnOptionsCache[dataKey][col];
      if (!uniqueVals && !state.processing) {
        const valSet = new Set();
        for (let i = 0; i < rawData.length; i++) {
          const v = String(rawData[i][col] ?? '').trim();
          if (v) valSet.add(v);
          if (valSet.size >= 100) break; 
        }
        uniqueVals = [...valSet].sort((a, b) => a.localeCompare(b));
        state.columnOptionsCache[dataKey][col] = uniqueVals;
      }
      
      if (!uniqueVals) uniqueVals = [];
      
      filterEl = document.createElement('select');
      filterEl.className = 'column-filter';
      
      const frag = document.createDocumentFragment();
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'All...';
      frag.appendChild(defaultOpt);
      
      for (let i = 0; i < uniqueVals.length; i++) {
        const opt = document.createElement('option');
        opt.value = uniqueVals[i];
        opt.textContent = uniqueVals[i];
        frag.appendChild(opt);
      }
      
      if (state.columnFilters[col] && !uniqueVals.includes(state.columnFilters[col])) {
        const opt = document.createElement('option');
        opt.value = state.columnFilters[col];
        opt.textContent = state.columnFilters[col];
        frag.appendChild(opt);
      }
      
      filterEl.appendChild(frag);
      filterEl.value = state.columnFilters[col] || '';
      filterEl.addEventListener('change', (e) => updateColumnFilter(col, e.target.value));
    } else {
      // Text Input for dynamic columns (card, expected, actual, etc.)
      filterEl = document.createElement('input');
      filterEl.type = 'text';
      filterEl.className = 'column-filter';
      filterEl.placeholder = 'Filter...';
      filterEl.value = state.columnFilters[col] || '';
      
      // Debounce text input
      filterEl.addEventListener('input', debounce((e) => {
        updateColumnFilter(col, e.target.value.trim());
      }, 300));
    }
    
    filterEl.addEventListener('click', (e) => e.stopPropagation());
    th.appendChild(filterEl);
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
    
    // Drill-down: if this is a validation row with FAIL, make it clickable
    if (state.currentModule === 'validation' && row.status === 'FAIL') {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => toggleDrillDown(tr, row));
    }
    
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
  lastRenderedHeaderModule = null; // Force header rebuild with new sort indicator
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
  @keyframes scaleIn {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid #e9ecef;
    border-top: 3px solid #f39c12;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .metric-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.1);
    transition: all 0.2s ease;
  }
  .module-health-table tbody tr { cursor: pointer; }
  .module-health-table tbody tr:hover { background: rgba(79, 70, 229, 0.04); }
`;
document.head.appendChild(styleSheet);

// ===== DASHBOARD NAVIGATION =====
function initDashboardNav() {
  // Metric card click handlers
  const cardMap = {
    'cardTotalChecks': 'validation',
    'cardPassRate': 'validation',
    'cardIssuesFound': 'structure',
    'cardCardsProcessed': 'totpay'
  };
  
  Object.entries(cardMap).forEach(([id, module]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => switchModule(module));
    }
  });
}

// ===== MODULE HEALTH TABLE NAVIGATION =====
const MODULE_NAME_MAP = {
  'Validation Results': 'validation',
  'Structure Validation': 'structure',
  'Tot Payment Check': 'totpay',
  'Sequence Check': 'sequence',
  'Duplicate Transactions': 'duplicate',
  'Zero Amount': 'zeroamt',
  'Posting Date Filter': 'posting',
  'Transaction Check': 'currency'
};

function addHealthTableClickHandlers() {
  const tbody = document.getElementById('moduleHealthBody');
  if (!tbody) return;
  
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(tr => {
    const firstTd = tr.querySelector('td');
    if (firstTd) {
      const moduleName = firstTd.textContent.trim();
      const moduleKey = MODULE_NAME_MAP[moduleName];
      if (moduleKey) {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => switchModule(moduleKey));
      }
    }
  });
}

// ===== PATCHING MODAL =====
function initPatchModal() {
  const btnFix = document.getElementById('btnFix');
  const modal = document.getElementById('patchModal');
  const btnCancel = document.getElementById('btnCancelPatch');
  const btnConfirm = document.getElementById('btnConfirmPatch');
  
  if (btnFix) {
    btnFix.addEventListener('click', () => {
      if (modal) {
        modal.style.display = 'flex';
        document.getElementById('patchStatus').textContent = 
          "This will generate a new file with missing '04' records inserted to fix structural validation issues.";
        document.getElementById('patchLoading').style.display = 'none';
        btnConfirm.disabled = false;
      }
    });
  }
  
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });
  }
  
  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => patchFile());
  }
  
  // Close modal on background click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }
}

async function patchFile() {
  if (!state.filePath || !window.api) return;
  
  const modal = document.getElementById('patchModal');
  const btnConfirm = document.getElementById('btnConfirmPatch');
  const loading = document.getElementById('patchLoading');
  const statusEl = document.getElementById('patchStatus');
  
  // Show loading
  btnConfirm.disabled = true;
  loading.style.display = 'block';
  statusEl.textContent = 'Analyzing and patching file...';
  
  try {
    const result = await window.api.runValidation({
      command: 'patch_file',
      file_path: state.filePath
    });
    
    loading.style.display = 'none';
    
    if (result.success) {
      statusEl.innerHTML = `
        <span style="color:#27ae60; font-weight:600;">✓ Patching completed successfully!</span><br>
        <span style="font-size:12px; color:#888; margin-top:8px; display:block;">
          Fixed ${result.issues_fixed} issue(s).<br>
          Output: <code style="background:#f5f5f5; padding:2px 6px; border-radius:4px;">${result.output_path}</code>
        </span>
      `;
      btnConfirm.textContent = 'Done';
      btnConfirm.style.background = '#27ae60';
      btnConfirm.disabled = false;
      btnConfirm.onclick = () => { modal.style.display = 'none'; };
      showToast(`File patched successfully! ${result.issues_fixed} issue(s) fixed.`, 'success');
    } else {
      statusEl.innerHTML = `<span style="color:#e74c3c;">✗ Patching failed: ${result.error || 'No fixable issues found.'}</span>`;
      btnConfirm.disabled = false;
    }
  } catch (err) {
    loading.style.display = 'none';
    statusEl.innerHTML = `<span style="color:#e74c3c;">X Error: ${err.message}</span>`;
    btnConfirm.disabled = false;
  }
}

// ===== CHART.JS DOUGHNUT RENDERER =====
let chartInstances = {};

function renderDoughnutChart(canvasId, goodVal, badVal, goodLabel, badLabel, centerText) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  // Destroy existing chart instance
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  
  const total = goodVal + badVal;
  const data = total > 0 ? [goodVal, badVal] : [0, 1]; // Show grey if no data
  const colors = total > 0 ? ['#27ae60', '#e74c3c'] : ['#e9ecef', '#e9ecef'];
  
  chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: [goodLabel, badLabel],
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return ` ${context.label}: ${val.toLocaleString()} (${pct}%)`;
            }
          }
        }
      },
      animation: {
        animateRotate: true,
        duration: 800
      }
    },
    plugins: [{
      // Center text plugin
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea: { width, height, top, left } } = chart;
        ctx.save();
        const cx = left + width / 2;
        const cy = top + height / 2;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Main percentage
        ctx.font = 'bold 22px Inter';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e';
        ctx.fillText(centerText, cx, cy - 6);
        
        // Sub label
        ctx.font = '500 11px Inter';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#6c757d';
        ctx.fillText(goodLabel, cx, cy + 14);
        
        ctx.restore();
      }
    }]
  });
}

// ===== DRILL-DOWN FOR FAIL ROWS =====
function toggleDrillDown(tr, row) {
  // Check if drill-down row already exists
  const existingDrillDown = tr.nextElementSibling;
  if (existingDrillDown && existingDrillDown.classList.contains('drill-down-row')) {
    existingDrillDown.remove();
    return;
  }
  
  // Remove any other open drill-down
  document.querySelectorAll('.drill-down-row').forEach(el => el.remove());
  
  const expected = row.expected ?? 0;
  const actual = row.actual ?? 0;
  const diff = actual - expected;
  
  const formatNum = (n) => {
    if (typeof n === 'number') {
      return 'Rp ' + Math.abs(n).toLocaleString('id-ID');
    }
    return String(n);
  };
  
  const drillRow = document.createElement('tr');
  drillRow.className = 'drill-down-row';
  const colSpan = MODULES[state.currentModule].columns.length;
  
  const td = document.createElement('td');
  td.colSpan = colSpan;
  td.innerHTML = `
    <div class="drill-down-content">
      <div class="drill-down-header">
        <span class="material-icons-outlined" style="font-size:18px;color:#e74c3c">info</span>
        <strong>Discrepancy Detail — ${escapeHtml(row.field || '')}</strong>
      </div>
      <div class="drill-down-grid">
        <div class="drill-item">
          <span class="drill-label">Expected</span>
          <span class="drill-value" style="color:#27ae60">${formatNum(expected)}</span>
        </div>
        <div class="drill-item">
          <span class="drill-label">Actual</span>
          <span class="drill-value" style="color:#e74c3c">${formatNum(actual)}</span>
        </div>
        <div class="drill-item">
          <span class="drill-label">Difference</span>
          <span class="drill-value" style="color:${diff >= 0 ? '#f39c12' : '#e74c3c'};font-weight:700">
            ${diff >= 0 ? '+' : '-'}${formatNum(Math.abs(diff))}
          </span>
        </div>
      </div>
    </div>
  `;
  
  drillRow.appendChild(td);
  tr.insertAdjacentElement('afterend', drillRow);
}

// ===== EXCEL EXPORT (Single Module) =====
async function exportExcel() {
  const config = MODULES[state.currentModule];
  const data = state.currentData;
  
  if (!data || data.length === 0) {
    showToast('No data to export', 'error');
    return;
  }
  
  if (!window.XLSX) {
    showToast('XLSX library not loaded', 'error');
    return;
  }
  
  if (!window.api) return;
  
  const defaultName = `${config.dataKey}_export.xlsx`;
  const filePath = await window.api.saveFile(defaultName);
  if (!filePath) return;
  
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [config.columns.map(c => c.replace(/_/g, ' ').toUpperCase())];
    
    data.forEach(row => {
      wsData.push(config.columns.map(col => row[col] ?? ''));
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Column widths
    ws['!cols'] = config.columns.map(col => ({ wch: Math.max(col.length + 2, 15) }));
    
    XLSX.utils.book_append_sheet(wb, ws, config.title.substring(0, 31));
    
    // Write as buffer
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataArray = Array.from(new Uint8Array(wbout));
    
    // Use writeBinary to save
    const result = await window.api.writeBinary(filePath, dataArray);
    if (result.success) {
      showToast('Excel export successful!', 'success');
    } else {
      showToast(`Export failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Excel export error: ${err.message}`, 'error');
  }
}

// ===== BATCH EXCEL EXPORT (All Modules) =====
async function batchExportExcel() {
  const d = state.allData;
  const hasData = Object.keys(d).some(k => d[k] && d[k].length > 0);
  
  if (!hasData) {
    showToast('No data to export. Run validation first.', 'error');
    return;
  }
  
  if (!window.XLSX) {
    showToast('XLSX library not loaded', 'error');
    return;
  }
  
  if (!window.api) return;
  
  const defaultName = 'StatementGuard_FullReport.xlsx';
  const filePath = await window.api.saveFile(defaultName);
  if (!filePath) return;
  
  try {
    const wb = XLSX.utils.book_new();
    
    Object.entries(MODULES).forEach(([key, config]) => {
      const rawData = d[config.dataKey] || [];
      if (rawData.length === 0) return;
      
      const wsData = [config.columns.map(c => c.replace(/_/g, ' ').toUpperCase())];
      rawData.forEach(row => {
        wsData.push(config.columns.map(col => row[col] ?? ''));
      });
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = config.columns.map(col => ({ wch: Math.max(col.length + 2, 15) }));
      
      // Sheet name max 31 chars
      const sheetName = config.title.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataArray = Array.from(new Uint8Array(wbout));
    
    const result = await window.api.writeBinary(filePath, dataArray);
    if (result.success) {
      showToast('Batch export successful! All modules exported.', 'success');
    } else {
      showToast(`Batch export failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Batch export error: ${err.message}`, 'error');
  }
}
