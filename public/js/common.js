const IMPORT_FILE_EXTENSIONS = ['xlsx', 'xls', 'csv'];
const IMPORT_FILE_ACCEPT = '.xlsx,.xls,.csv';
const IMPORT_FILE_LABEL = '.xlsx / .xls / .csv';

function renderImportColumnGuideHtml(columns, options = {}) {
  const list = columns || [];
  const sourceColumns = options.sourceColumns || [];
  const hideFieldKeys = options.hideFieldKeys === true;
  const fileColumnCount = Number(options.fileColumnCount) || 0;
  const importCount = list.length;
  const fileColCount = fileColumnCount || (sourceColumns.length ? Math.max(...sourceColumns) : importCount);
  const title =
    options.title ||
    (fileColumnCount && sourceColumns.length
      ? `列映射说明（TikTok 导出共 ${fileColCount} 列，导入其中 ${importCount} 列）`
      : `列映射说明（共 ${importCount} 个字段）`);
  const notes = []
    .concat(options.notes || [])
    .flat()
    .filter(Boolean);
  const fileColHeader = sourceColumns.length ? 'Excel 列号' : '文件列序';
  const fieldHeader = sourceColumns.length ? '系统字段' : '列表字段名';
  const statusHeader = fileColumnCount && sourceColumns.length ? '<th>导入</th>' : '';
  const keyHeader = hideFieldKeys ? '' : '<th>字段 key</th>';

  let rows = '';
  if (fileColumnCount && sourceColumns.length) {
    const importMap = new Map();
    list.forEach((column, index) => {
      const excelCol = sourceColumns[index];
      if (excelCol) importMap.set(excelCol, column);
    });
    rows = Array.from({ length: fileColumnCount }, (_, index) => {
      const excelCol = index + 1;
      const column = importMap.get(excelCol);
      const keyCell = hideFieldKeys
        ? ''
        : `<td class="col-key">${column ? `<code>${escapeHtml(column.key)}</code>` : ''}</td>`;
      if (column) {
        return `<tr class="import-col-yes"><td class="col-index">第 ${excelCol} 列</td><td>${escapeHtml(column.label || column.key)}</td><td>是</td>${keyCell}</tr>`;
      }
      return `<tr class="import-col-skip"><td class="col-index">第 ${excelCol} 列</td><td class="import-col-muted">—</td><td class="import-col-muted">否</td>${keyCell}</tr>`;
    }).join('');
  } else {
    rows = list
      .map((column, index) => {
        const fileCol = sourceColumns[index];
        const fileColLabel = fileCol ? `第 ${fileCol} 列` : `第 ${index + 1} 列`;
        const keyCell = hideFieldKeys
          ? ''
          : `<td class="col-key"><code>${escapeHtml(column.key)}</code></td>`;
        return `<tr><td class="col-index">${fileColLabel}</td><td>${escapeHtml(column.label || column.key)}</td>${keyCell}</tr>`;
      })
      .join('');
  }

  const intro = fileColumnCount && sourceColumns.length
    ? `系统<strong>忽略第 1 行表头</strong>，从<strong>第 2 行</strong>起读取数据。请使用 TikTok 原始导出文件（共 ${fileColCount} 列，勿删列）；下表列出全部列，标记为「是」的 ${importCount} 列会被导入：`
    : sourceColumns.length
      ? '系统<strong>忽略第 1 行表头</strong>，从<strong>第 2 行</strong>起读取数据。请使用 TikTok 原始导出文件（勿删列）；仅读取下表「Excel 列号」所示列，其余列忽略：'
      : '系统<strong>忽略首行</strong>（可保留平台表头）。从<strong>第 2 行</strong>起为数据；文件列须<strong>从左到右</strong>与下表一致：';
  return `
    <div class="erp-import-column-guide">
      <p class="erp-import-column-guide-title">${escapeHtml(title)}</p>
      <p class="erp-upload-hint">${intro}</p>
      <div class="erp-import-column-table-wrap">
        <table class="erp-import-column-table">
          <thead><tr><th>${fileColHeader}</th><th>${fieldHeader}</th>${statusHeader}${keyHeader}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${notes.map((note) => `<p class="erp-upload-hint erp-import-column-note">${escapeHtml(note)}</p>`).join('')}
    </div>`;
}

const FULFILLMENT_PROGRESS_OPTIONS = [
  '待签收',
  '待发布',
  '已发布',
  '复拍中',
  '逾期',
];

const FULFILLMENT_PROGRESS_TONE_CLASSES = [
  'fulfillment-tone-empty',
  'fulfillment-tone-sign',
  'fulfillment-tone-publish',
  'fulfillment-tone-published',
  'fulfillment-tone-reshoot',
  'fulfillment-tone-overdue',
];

function getFulfillmentProgressToneClass(value) {
  const text = String(value || '').trim();
  const toneMap = {
    待签收: 'fulfillment-tone-sign',
    待发布: 'fulfillment-tone-publish',
    已发布: 'fulfillment-tone-published',
    复拍中: 'fulfillment-tone-reshoot',
    逾期: 'fulfillment-tone-overdue',
  };
  return toneMap[text] || 'fulfillment-tone-empty';
}

function applyFulfillmentSelectTone(select) {
  if (!select) return;
  FULFILLMENT_PROGRESS_TONE_CLASSES.forEach((cls) => select.classList.remove(cls));
  select.classList.add(getFulfillmentProgressToneClass(select.value));
}

function renderFulfillmentProgressSelect(influencerId, value) {
  const toneClass = getFulfillmentProgressToneClass(value);
  const options = [`<option value="">-</option>`].concat(
    FULFILLMENT_PROGRESS_OPTIONS.map((item) => {
      const selected = item === value ? ' selected' : '';
      return `<option value="${escapeAttr(item)}"${selected}>${escapeHtml(item)}</option>`;
    })
  );
  return `<select class="erp-input fulfillment-select ${toneClass}" data-influencer-id="${escapeAttr(influencerId)}">${options.join('')}</select>`;
}

function isAllowedImportFile(file) {
  if (!file?.name) return false;
  const ext = file.name.split('.').pop().toLowerCase();
  return IMPORT_FILE_EXTENSIONS.includes(ext);
}
const BRAND = 'LUJIFO';

const MORE_LINKS = [
  { label: '在途货物', url: 'https://www.kdocs.cn/l/cpojTymKRo1a', external: true },
  { label: '周数据', url: 'https://www.kdocs.cn/l/ciV2DrY5WNz6', external: true },
  { label: '产品参数信息', url: 'https://www.kdocs.cn/l/cbvzFuKIqhLP', external: true },
  { label: 'skuID设置', url: '/sku-settings.html', external: false, key: 'sku-settings' },
];

const DATA_IMPORT_LINKS = [
  { label: '样品订单', url: '/sample-orders.html', key: 'sample-orders' },
  { label: '联盟订单', url: '/alliance-orders.html', key: 'alliance-orders' },
  { label: '达人视频', url: '/influencer-videos.html', key: 'influencer-videos' },
];

const INFLUENCER_LINKS = [
  { label: '待审核', url: '/influencers.html', key: 'influencers-pending' },
  { label: '已合作', url: '/influencers-collaborated.html', key: 'influencers-collaborated' },
  { label: '发送记录', url: '/email-history.html', key: 'email-history' },
  { label: '统计', url: '/influencers-stats.html', key: 'influencers-stats' },
  { label: '寄样统计', url: '/influencers-sample-stats.html', key: 'influencers-sample-stats' },
];

let currentUser = null;

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.includes('/api/auth/login')) {
    window.location.href = '/login.html';
    throw new Error('未登录');
  }
  return { res, data };
}

async function requireLogin() {
  const { res, data } = await api('/api/auth/me');
  if (!res.ok) {
    window.location.href = '/login.html';
    return null;
  }
  currentUser = data.user;
  return currentUser;
}

function isManager() {
  return currentUser && (currentUser.role === 'manager' || currentUser.name === 'admin');
}

function renderShell({ active, title, breadcrumb, meta, content }) {
  const managerMenus = isManager()
    ? `<a href="/org.html" class="erp-nav-item ${active === 'org' ? 'active' : ''}"><span class="erp-nav-icon">◎</span>组织</a>`
    : '';

  const moreSub = MORE_LINKS.map((item) =>
    item.external
      ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="erp-nav-subitem">${item.label}</a>`
      : `<a href="${item.url}" class="erp-nav-subitem ${active === item.key ? 'active' : ''}">${item.label}</a>`
  ).join('');

  const influencerActive = INFLUENCER_LINKS.some((item) => item.key === active);
  const influencerSub = INFLUENCER_LINKS.map(
    (item) => `<a href="${item.url}" class="erp-nav-subitem ${active === item.key ? 'active' : ''}">${item.label}</a>`
  ).join('');

  const dataImportActive = DATA_IMPORT_LINKS.some((item) => item.key === active);
  const dataImportSub = DATA_IMPORT_LINKS.map(
    (item) => `<a href="${item.url}" class="erp-nav-subitem ${active === item.key ? 'active' : ''}">${item.label}</a>`
  ).join('');

  document.body.innerHTML = `
    <div class="erp-layout">
      <aside class="erp-sidebar">
        <div class="erp-brand">
          <div class="erp-brand-title">${BRAND}</div>
          <div class="erp-brand-sub">跨境电商 ERP</div>
        </div>
        <nav class="erp-nav">
          <div class="erp-nav-label">一级菜单</div>
          <a href="/wiki.html" class="erp-nav-item ${active === 'wiki' ? 'active' : ''}"><span class="erp-nav-icon">▤</span>Wiki</a>
          <div class="erp-nav-group">
            <div class="erp-nav-item erp-nav-parent ${influencerActive ? 'active' : ''}"><span class="erp-nav-icon">▣</span>达人</div>
            <div class="erp-nav-submenu">${influencerSub}</div>
          </div>
          <div class="erp-nav-group">
            <div class="erp-nav-item erp-nav-parent ${dataImportActive ? 'active' : ''}"><span class="erp-nav-icon">⇪</span>导数据</div>
            <div class="erp-nav-submenu">${dataImportSub}</div>
          </div>
          ${managerMenus}
          <div class="erp-nav-group">
            <div class="erp-nav-item erp-nav-parent ${active === 'more' ? 'active' : ''}"><span class="erp-nav-icon">⋯</span>更多</div>
            <div class="erp-nav-submenu">${moreSub}</div>
          </div>
        </nav>
        <div class="erp-sidebar-footer">© 2026 ${BRAND}</div>
      </aside>
      <div class="erp-main">
        <header class="erp-topbar">
          <div class="erp-breadcrumb">${breadcrumb || title}</div>
          <div class="erp-topbar-right">
            <span class="erp-topbar-meta">${meta || ''}</span>
            <div class="erp-user-menu" id="userMenu">
              <button class="erp-user-btn" id="userMenuBtn">${currentUser?.name || ''} ▾</button>
              <div class="erp-user-dropdown hidden" id="userDropdown">
                <button id="changePasswordBtn">修改密码</button>
                <button id="logoutBtn">退出登录</button>
              </div>
            </div>
          </div>
        </header>
        <main class="erp-content">${content}</main>
      </div>
    </div>
    <div id="passwordModal" class="erp-modal-overlay hidden">
      <div class="erp-modal">
        <div class="erp-modal-header">修改密码</div>
        <div class="erp-modal-body">
          <div class="erp-form-field"><label>原密码</label><input id="oldPassword" type="password" class="erp-input erp-input-wide" /></div>
          <div class="erp-form-field"><label>新密码</label><input id="newPassword" type="password" class="erp-input erp-input-wide" /></div>
        </div>
        <div class="erp-modal-footer">
          <button class="erp-btn erp-btn-secondary" id="cancelPasswordBtn">取消</button>
          <button class="erp-btn erp-btn-primary" id="savePasswordBtn">保存</button>
        </div>
      </div>
    </div>
  `;

  bindUserMenu();
}

function bindUserMenu() {
  const btn = document.getElementById('userMenuBtn');
  const dropdown = document.getElementById('userDropdown');
  const passwordModal = document.getElementById('passwordModal');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('hidden');
  });

  dropdown?.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', () => dropdown?.classList.add('hidden'));

  document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    dropdown?.classList.add('hidden');
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  document.getElementById('changePasswordBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.add('hidden');
    passwordModal?.classList.remove('hidden');
  });

  document.getElementById('cancelPasswordBtn')?.addEventListener('click', () => {
    passwordModal.classList.add('hidden');
  });

  document.getElementById('savePasswordBtn')?.addEventListener('click', async () => {
    const old_password = document.getElementById('oldPassword').value;
    const new_password = document.getElementById('newPassword').value;
    const { res, data } = await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    });
    if (!res.ok) return alert(data.message || '修改失败');
    alert('密码修改成功');
    passwordModal.classList.add('hidden');
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n/g, ' ');
}

const BEIJING_TZ = 'Asia/Shanghai';
const BEIJING_LOCALE = 'zh-CN';
const BEIJING_LOCALE_OPTIONS = { timeZone: BEIJING_TZ, hour12: false };

function parseDateTimeValue(value, storage = 'utc') {
  const text = String(value || '').trim();
  if (!text) return null;

  if (/[zZ]$/.test(text) || /[+-]\d{2}:\d{2}$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (match) {
    const suffix = storage === 'beijing' ? '+08:00' : 'Z';
    const date = new Date(`${match[1]}T${match[2]}${suffix}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value, options = {}) {
  if (!value) return '-';
  const text = String(value).trim();
  const storage = options.storage || 'utc';

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 30000 && serial < 60000) {
      const epoch = new Date(1899, 11, 30);
      return new Date(epoch.getTime() + serial * 86400000).toLocaleString(
        BEIJING_LOCALE,
        BEIJING_LOCALE_OPTIONS
      );
    }
  }

  const date = parseDateTimeValue(text, storage);
  if (!date) return text;
  return date.toLocaleString(BEIJING_LOCALE, BEIJING_LOCALE_OPTIONS);
}

function formatImportTimeValue(value) {
  return formatDateTime(value, { storage: 'beijing' });
}

const ORDER_IMPORT_TIME_HEADER = '__import_time__';

function isOrderIdColumn(column) {
  return column?.key === 'order_id';
}

function isSkuIdColumn(column) {
  return column?.key === 'sku_id';
}

function getSkuIdFromOrderRow(row, column) {
  if (row?.sku_id) return String(row.sku_id).trim();
  if (isSkuIdColumn(column) && typeof readOrderCellValue === 'function') {
    return readOrderCellValue(row, column);
  }
  return '';
}

function resolveSkuModelDisplay(raw, row, column, skuModelMap = {}) {
  const skuId = getSkuIdFromOrderRow(row, column) || String(raw || '').trim();
  if (!skuId) return null;
  const model = skuModelMap[skuId];
  if (!model) return null;
  return { skuId, model };
}

function buildShopModelDisplay(shopName, model) {
  const shopText = String(shopName || '').trim();
  const modelText = String(model || '').trim();
  if (shopText && modelText) return `${shopText}${modelText}`;
  return modelText || shopText || '';
}

function buildModelSkuTitle(model, skuId, shopName) {
  const displayText = buildShopModelDisplay(shopName, model);
  const skuText = String(skuId || '').trim();
  if (displayText && skuText) return `${displayText}（SKU ${skuText}）`;
  if (displayText) return displayText;
  if (skuText) return `SKU ${skuText}`;
  return '';
}

function findOrderIdColumnIndex(columns = []) {
  return columns.findIndex((column) => isOrderIdColumn(column));
}

function buildOrderDisplayColumns(columns = []) {
  const list = columns.map((column) => ({ ...column }));
  const orderIdx = findOrderIdColumnIndex(list);
  const insertAt = orderIdx >= 0 ? orderIdx : 0;
  list.splice(insertAt, 0, { key: ORDER_IMPORT_TIME_HEADER, label: '导入时间' });
  return list;
}

function renderOrderImportTimeHeader() {
  return `<th class="cell-import-time">导入时间</th>`;
}

function renderOrderTableHeadHtml(columns = []) {
  return buildOrderDisplayColumns(columns)
    .map((column) => {
      if (column.key === ORDER_IMPORT_TIME_HEADER) return renderOrderImportTimeHeader();
      return `<th>${escapeHtml(column.label || column.key)}</th>`;
    })
    .join('');
}

function renderOrderTableCellHtml(row, column, skuModelMap = {}) {
  if (column.key === ORDER_IMPORT_TIME_HEADER) {
    const text = formatImportTimeValue(row.import_time) || '-';
    return `<td class="cell-import-time" title="${escapeAttr(text)}">${escapeHtml(text)}</td>`;
  }
  const raw = typeof readOrderCellValue === 'function' ? readOrderCellValue(row, column) : '';
  if (column.key === 'video_url') {
    const url = String(raw || '').trim();
    if (url) {
      return `<td class="cell-truncate"><a href="${escapeAttr(url)}" class="erp-link-external" target="_blank" rel="noopener noreferrer" title="${escapeAttr(url)}">${escapeHtml(url)}</a></td>`;
    }
    return `<td class="cell-truncate">-</td>`;
  }
  const skuDisplay = isSkuIdColumn(column) ? resolveSkuModelDisplay(raw, row, column, skuModelMap) : null;
  if (skuDisplay) {
    const title = `${skuDisplay.model}（SKU ${skuDisplay.skuId}）`;
    return `<td class="cell-truncate cell-sku-model" title="${escapeAttr(title)}">${escapeHtml(skuDisplay.model)}</td>`;
  }
  const text = raw || '-';
  return `<td class="cell-truncate" title="${escapeAttr(raw)}">${escapeHtml(text)}</td>`;
}

function populateOrderImportTimeFilter(select, items = [], currentValue = '') {
  if (!select) return;
  select.innerHTML =
    '<option value="">全部</option>'
    + (items || [])
      .map(
        (item) =>
          `<option value="${escapeAttr(item.value)}">${escapeHtml(formatImportTimeValue(item.value))}（${item.count} 条）</option>`
      )
      .join('');
  if (currentValue) select.value = currentValue;
}

function formatPercent(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.includes('%')) return text;
  const num = Number(text);
  if (Number.isNaN(num)) return text;
  if (num > 0 && num <= 1) return `${(num * 100).toFixed(2)}%`;
  return `${num.toFixed(2)}%`;
}

function parsePercentNumber(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return null;
  const num = Number(text.replace('%', '').replace(/,/g, ''));
  if (Number.isNaN(num)) return null;
  if (text.includes('%') || num > 1) return num;
  return num * 100;
}

function parseCurrencyNumber(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return null;
  const num = Number(text.replace(/[$¥￥,\s]/g, ''));
  return Number.isNaN(num) ? null : num;
}

function parseMetricNumber(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return null;
  const num = Number(text.replace(/,/g, ''));
  return Number.isNaN(num) ? null : num;
}

function metricAlertClass(isAlert) {
  return isAlert ? 'erp-cell-alert' : '';
}

const LOGIN_AUTOFILL_VALUES = new Set(['admin']);

function isLoginAutofillValue(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  if (LOGIN_AUTOFILL_VALUES.has(text)) return true;
  const userName = String(currentUser?.name || '').trim().toLowerCase();
  return userName && text === userName;
}

function setupFilterAutofillGuard(inputIds) {
  const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.autofillGuard === '1') return;
    input.dataset.autofillGuard = '1';
    input.removeAttribute('name');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-lpignore', 'true');
    input.setAttribute('data-1p-ignore', 'true');
    input.setAttribute('data-form-type', 'other');
    input.setAttribute('readonly', 'readonly');

    const clearAutofill = () => {
      if (isLoginAutofillValue(input.value)) input.value = '';
    };

    const unlock = () => {
      input.removeAttribute('readonly');
      clearAutofill();
    };

    clearAutofill();
    input.addEventListener('mousedown', unlock, { once: false });
    input.addEventListener('touchstart', unlock, { once: false, passive: true });
    input.addEventListener('keydown', unlock);
    input.addEventListener('focus', clearAutofill);
    input.addEventListener('input', clearAutofill);
    input.addEventListener('animationstart', (e) => {
      if (e.animationName === 'erpAutofillStart') clearAutofill();
    });

    [50, 100, 300, 500, 1000, 2000].forEach((delay) => {
      setTimeout(clearAutofill, delay);
    });
  });
}

function isValidRecipientEmailClient(email) {
  const value = String(email || '').trim();
  if (!value || value === '未留') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function renderEmailTemplateClient(template, vars = {}) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

function buildInfluencerEmailPreviewVars(row) {
  return {
    influencer_id: String(row?.influencer_id || '').trim(),
    email: String(row?.email || '').trim(),
    assignee: String(row?.assignee || '').trim(),
    tags: String(row?.tags || '').trim(),
    sample_date: String(row?.sample_date || '').trim(),
    sample_model: String(row?.sample_model || '').trim(),
    sender_name: String(currentUser?.name || '').trim(),
  };
}

function buildCollaboratedEmailPreviewVars(row) {
  return buildInfluencerEmailPreviewVars(row);
}

function dedupeRowsByInfluencerId(rows = []) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = String(row?.influencer_id || '').trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, row);
  });
  return [...map.values()];
}

const CLIENT_SMTP_PROVIDER_PRESETS = {
  netease_enterprise: { label: '网易企业邮', host: 'smtp.qiye.163.com', port: 465, secure: true },
  tencent_enterprise: { label: '腾讯企业邮', host: 'smtp.exmail.qq.com', port: 465, secure: true },
  tencent_personal: { label: 'QQ 邮箱', host: 'smtp.qq.com', port: 465, secure: true },
  aliyun_enterprise: { label: '阿里企业邮', host: 'smtp.mxhichina.com', port: 465, secure: true },
  gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true },
  outlook: { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, secure: false },
  custom: { label: '自定义', host: '', port: 465, secure: true },
};

const EMAIL_TEMPLATE_VARIABLES = [
  { key: 'influencer_id', label: '达人 id' },
  { key: 'email', label: '达人邮箱' },
  { key: 'assignee', label: '负责人' },
  { key: 'tags', label: '标签' },
  { key: 'sample_date', label: '寄样日期' },
  { key: 'sample_model', label: '寄样型号' },
  { key: 'sender_name', label: '发件人姓名' },
];

function renderBatchEmailVariableChipsHtml() {
  const chips = EMAIL_TEMPLATE_VARIABLES.map(
    (item) =>
      `<button type="button" class="erp-email-var-chip" data-var-key="${escapeAttr(item.key)}" title="${escapeAttr(item.label)}">${escapeHtml(`{{${item.key}}}`)}</button>`
  ).join('');
  return `
    <div class="erp-email-var-panel" id="batchEmailVarPanel">
      <span class="erp-email-var-label">点击插入变量</span>
      <div class="erp-email-var-list" id="batchEmailVarList">${chips}</div>
      <p class="erp-meta erp-email-var-hint">插入到当前光标所在的「主题」或「正文」输入框。</p>
    </div>
  `;
}

function insertTextAtFieldCursor(field, text) {
  if (!field) return;
  const value = String(field.value ?? '');
  const start = typeof field.selectionStart === 'number' ? field.selectionStart : value.length;
  const end = typeof field.selectionEnd === 'number' ? field.selectionEnd : start;
  field.value = value.slice(0, start) + text + value.slice(end);
  const pos = start + text.length;
  field.focus();
  if (typeof field.setSelectionRange === 'function') {
    field.setSelectionRange(pos, pos);
  }
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function bindBatchEmailVariableInsert(updatePreview) {
  const subjectField = document.getElementById('batchEmailSubject');
  const bodyField = document.getElementById('batchEmailBody');
  let activeField = bodyField;

  subjectField?.addEventListener('focus', () => {
    activeField = subjectField;
  });
  bodyField?.addEventListener('focus', () => {
    activeField = bodyField;
  });

  document.getElementById('batchEmailVarList')?.addEventListener('click', (event) => {
    const chip = event.target.closest('.erp-email-var-chip');
    if (!chip) return;
    event.preventDefault();
    const key = String(chip.dataset.varKey || '').trim();
    if (!key) return;
    insertTextAtFieldCursor(activeField || bodyField || subjectField, `{{${key}}}`);
    if (typeof updatePreview === 'function') updatePreview();
  });
}

function renderStaffMailModalsHtml() {
  const providerOptions = Object.entries(CLIENT_SMTP_PROVIDER_PRESETS)
    .map(([key, item]) => `<option value="${escapeAttr(key)}">${escapeHtml(item.label)}</option>`)
    .join('');
  return `
    <div id="mailSettingsModal" class="erp-modal-overlay hidden">
      <div class="erp-modal">
        <div class="erp-modal-header">我的邮箱</div>
        <div class="erp-modal-body">
          <p class="erp-meta" style="margin-bottom:10px;">每人使用自己的邮箱账号发信，收件人仅看到您一人。</p>
          <div class="erp-form-field">
            <label>邮箱服务商</label>
            <select id="mailSmtpProvider" class="erp-input erp-input-wide">${providerOptions}</select>
          </div>
          <div class="erp-form-field">
            <label>发件邮箱</label>
            <input id="mailSmtpEmail" class="erp-input erp-input-wide" type="email" placeholder="name@yourcompany.com" autocomplete="off" />
          </div>
          <div class="erp-form-field">
            <label>SMTP 服务器</label>
            <input id="mailSmtpHost" class="erp-input erp-input-wide" placeholder="smtp.example.com" autocomplete="off" />
          </div>
          <div class="erp-form-field erp-form-inline">
            <label>SMTP 端口</label>
            <input id="mailSmtpPort" class="erp-input" type="number" min="1" placeholder="465" />
            <label class="erp-checkbox-inline"><input type="checkbox" id="mailSmtpSecure" /> SSL/TLS</label>
          </div>
          <div class="erp-form-field">
            <label>SMTP 授权码</label>
            <input id="mailSmtpAuthCode" class="erp-input erp-input-wide" type="password" placeholder="留空则不修改已保存的授权码" autocomplete="new-password" />
            <p class="erp-meta" style="margin-top:6px;">请使用邮箱服务商提供的 SMTP / 客户端授权密码，不是网页登录密码。</p>
          </div>
          <div class="erp-form-field">
            <label>发件人显示名</label>
            <input id="mailFromName" class="erp-input erp-input-wide" placeholder="默认可填您的姓名" autocomplete="off" />
          </div>
          <p id="mailSettingsStatus" class="erp-meta"></p>
        </div>
        <div class="erp-modal-footer">
          <button class="erp-btn erp-btn-secondary" id="cancelMailSettingsBtn">取消</button>
          <button class="erp-btn erp-btn-secondary" id="testMailSettingsBtn">发送测试邮件</button>
          <button class="erp-btn erp-btn-primary" id="saveMailSettingsBtn">保存</button>
        </div>
      </div>
    </div>
    <div id="batchEmailModal" class="erp-modal-overlay hidden">
      <div class="erp-modal erp-modal-wide">
        <div class="erp-modal-header">群发邮件</div>
        <div class="erp-modal-body">
          <p id="batchEmailHint" class="erp-meta" style="margin-bottom:10px;">已选 0 位达人</p>
          <p id="batchEmailMailHint" class="erp-meta" style="margin-bottom:10px;"></p>
          <div class="erp-form-field">
            <label>邮件主题</label>
            <input id="batchEmailSubject" class="erp-input erp-input-wide" placeholder="Hi {{influencer_id}}，关于寄样跟进" autocomplete="off" />
          </div>
          ${renderBatchEmailVariableChipsHtml()}
          <div class="erp-form-field">
            <label>邮件正文</label>
            <textarea id="batchEmailBody" class="erp-input erp-input-wide" rows="10" placeholder="您好，\n\n我是 {{sender_name}}，看到您 {{sample_date}} 的寄样...\n\nBest regards,\n{{sender_name}}"></textarea>
            <p class="erp-meta" style="margin-top:6px;">每人单独发送，仅收件人在 To 中。</p>
          </div>
          <div class="erp-form-field">
            <label>预览（选一位达人）</label>
            <select id="batchEmailPreviewSelect" class="erp-input erp-input-wide"></select>
          </div>
          <div class="erp-form-field">
            <label>预览主题</label>
            <div id="batchEmailPreviewSubject" class="erp-email-preview-box">-</div>
          </div>
          <div class="erp-form-field">
            <label>预览正文</label>
            <pre id="batchEmailPreviewBody" class="erp-email-preview-box">-</pre>
          </div>
        </div>
        <div class="erp-modal-footer">
          <button class="erp-btn erp-btn-secondary" id="cancelBatchEmailBtn">取消</button>
          <button class="erp-btn erp-btn-primary" id="confirmBatchEmailBtn">确认发送</button>
        </div>
      </div>
    </div>
  `;
}

function applyMailProviderPresetToForm(providerKey, presets = CLIENT_SMTP_PROVIDER_PRESETS) {
  const preset = presets[providerKey] || presets.custom;
  const hostInput = document.getElementById('mailSmtpHost');
  const portInput = document.getElementById('mailSmtpPort');
  const secureInput = document.getElementById('mailSmtpSecure');
  const isCustom = providerKey === 'custom';
  if (hostInput) {
    hostInput.value = preset.host || '';
    hostInput.readOnly = !isCustom;
  }
  if (portInput) {
    portInput.value = preset.port || 465;
    portInput.readOnly = !isCustom;
  }
  if (secureInput) secureInput.checked = Boolean(preset.secure);
}

function bindStaffMailSettingsModal() {
  if (window.__staffMailSettingsBound) return;
  window.__staffMailSettingsBound = true;
  window.__mailSettingsCache = null;

  document.getElementById('mailSmtpProvider')?.addEventListener('change', (e) => {
    applyMailProviderPresetToForm(e.target.value);
  });

  document.getElementById('myMailSettingsBtn')?.addEventListener('click', () => openStaffMailSettingsModal());
  document.getElementById('cancelMailSettingsBtn')?.addEventListener('click', closeStaffMailSettingsModal);
  document.getElementById('saveMailSettingsBtn')?.addEventListener('click', saveStaffMailSettings);
  document.getElementById('testMailSettingsBtn')?.addEventListener('click', testStaffMailSettings);
}

async function loadStaffMailSettings() {
  const { res, data } = await api('/api/me/mail-settings');
  if (!res.ok) throw new Error(data.message || '获取邮箱配置失败');
  window.__mailSettingsCache = data.data || null;
  return window.__mailSettingsCache;
}

async function openStaffMailSettingsModal() {
  try {
    const settings = await loadStaffMailSettings();
    const provider = settings.smtp_provider || 'netease_enterprise';
    document.getElementById('mailSmtpProvider').value = provider;
    applyMailProviderPresetToForm(provider, settings.smtp_presets || CLIENT_SMTP_PROVIDER_PRESETS);
    document.getElementById('mailSmtpEmail').value = settings.smtp_email || '';
    document.getElementById('mailSmtpHost').value = settings.smtp_host || '';
    document.getElementById('mailSmtpPort').value = settings.smtp_port || 465;
    document.getElementById('mailSmtpSecure').checked = Boolean(settings.smtp_secure);
    document.getElementById('mailSmtpAuthCode').value = '';
    document.getElementById('mailFromName').value = settings.mail_from_name || settings.staff_name || '';
    document.getElementById('mailSettingsStatus').textContent = settings.configured
      ? `当前已配置：${settings.smtp_email}（${settings.smtp_host}:${settings.smtp_port}）`
      : '尚未配置邮箱，请先保存后再群发邮件。';
    document.getElementById('mailSettingsModal').classList.remove('hidden');
  } catch (err) {
    alert(err.message || '加载邮箱配置失败');
  }
}

function closeStaffMailSettingsModal() {
  document.getElementById('mailSettingsModal')?.classList.add('hidden');
}

async function saveStaffMailSettings() {
  const payload = {
    smtp_provider: document.getElementById('mailSmtpProvider').value.trim(),
    smtp_email: document.getElementById('mailSmtpEmail').value.trim(),
    smtp_host: document.getElementById('mailSmtpHost').value.trim(),
    smtp_port: Number(document.getElementById('mailSmtpPort').value) || 465,
    smtp_secure: document.getElementById('mailSmtpSecure').checked,
    mail_from_name: document.getElementById('mailFromName').value.trim(),
  };
  const authCode = document.getElementById('mailSmtpAuthCode').value.trim();
  if (authCode) payload.smtp_auth_code = authCode;
  if (!payload.smtp_email) return alert('请填写发件邮箱');
  if (!window.__mailSettingsCache?.configured && !authCode) return alert('首次配置请填写 SMTP 授权码');

  const btn = document.getElementById('saveMailSettingsBtn');
  btn.disabled = true;
  try {
    const { res, data } = await api('/api/me/mail-settings', { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) return alert(data.message || '保存失败');
    window.__mailSettingsCache = data.data;
    document.getElementById('mailSettingsStatus').textContent = `已保存：${window.__mailSettingsCache.smtp_email}（${window.__mailSettingsCache.smtp_host}:${window.__mailSettingsCache.smtp_port}）`;
    document.getElementById('mailSmtpAuthCode').value = '';
    alert('邮箱配置已保存');
  } finally {
    btn.disabled = false;
  }
}

async function testStaffMailSettings() {
  const btn = document.getElementById('testMailSettingsBtn');
  btn.disabled = true;
  try {
    if (!window.__mailSettingsCache?.configured) await saveStaffMailSettings();
    const { res, data } = await api('/api/me/mail-settings/test', { method: 'POST' });
    if (!res.ok) return alert(data.message || '测试邮件发送失败');
    alert(data.message || '测试邮件已发送');
  } finally {
    btn.disabled = false;
  }
}

function bindBatchEmailModal(options = {}) {
  if (options.bindKey && window[`__batchEmailBound_${options.bindKey}`]) return;
  if (options.bindKey) window[`__batchEmailBound_${options.bindKey}`] = true;

  const updatePreview = () => {
    const rows = typeof options.getPreviewRows === 'function' ? options.getPreviewRows() : [];
    const select = document.getElementById('batchEmailPreviewSelect');
    const row = rows.find((item) => String(item.influencer_id) === String(select?.value || ''));
    const subject = document.getElementById('batchEmailSubject')?.value || '';
    const body = document.getElementById('batchEmailBody')?.value || '';
    const subjectEl = document.getElementById('batchEmailPreviewSubject');
    const bodyEl = document.getElementById('batchEmailPreviewBody');
    if (!row) {
      if (subjectEl) subjectEl.textContent = '-';
      if (bodyEl) bodyEl.textContent = '-';
      return;
    }
    const vars = buildInfluencerEmailPreviewVars(row);
    if (subjectEl) subjectEl.textContent = renderEmailTemplateClient(subject, vars) || '-';
    if (bodyEl) bodyEl.textContent = renderEmailTemplateClient(body, vars) || '-';
  };

  const populatePreviewSelect = () => {
    const select = document.getElementById('batchEmailPreviewSelect');
    if (!select) return;
    const rows = (typeof options.getPreviewRows === 'function' ? options.getPreviewRows() : []).filter((row) =>
      isValidRecipientEmailClient(row.email)
    );
    select.innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              `<option value="${escapeAttr(row.influencer_id)}">${escapeHtml(row.influencer_id)} (${escapeHtml(row.email)})</option>`
          )
          .join('')
      : '<option value="">暂无可预览的达人（需有效邮箱）</option>';
    updatePreview();
  };

  window.__updateBatchEmailPreview = updatePreview;
  window.__populateBatchEmailPreviewSelect = populatePreviewSelect;
  bindBatchEmailVariableInsert(updatePreview);

  document.getElementById(options.openButtonId || 'batchEmailBtn')?.addEventListener('click', async () => {
    if (typeof options.validateSelection === 'function') {
      const err = options.validateSelection();
      if (err) return alert(err);
    }
    try {
      const settings = await loadStaffMailSettings();
      if (!settings.configured) {
        if (!confirm('您尚未配置发件邮箱，是否现在配置？')) return;
        await openStaffMailSettingsModal();
        return;
      }
      if (typeof options.onOpen === 'function') options.onOpen(settings);
      populatePreviewSelect();
      document.getElementById('batchEmailModal').classList.remove('hidden');
    } catch (err) {
      alert(err.message || '打开群发邮件失败');
    }
  });

  document.getElementById('cancelBatchEmailBtn')?.addEventListener('click', () => {
    document.getElementById('batchEmailModal')?.classList.add('hidden');
  });
  document.getElementById('batchEmailSubject')?.addEventListener('input', updatePreview);
  document.getElementById('batchEmailBody')?.addEventListener('input', updatePreview);
  document.getElementById('batchEmailPreviewSelect')?.addEventListener('change', updatePreview);
  document.getElementById('confirmBatchEmailBtn')?.addEventListener('click', async () => {
    const subject = document.getElementById('batchEmailSubject').value.trim();
    const body = document.getElementById('batchEmailBody').value.trim();
    if (!subject) return alert('请填写邮件主题');
    if (!body) return alert('请填写邮件正文');
    if (typeof options.validateSelection === 'function') {
      const err = options.validateSelection();
      if (err) return alert(err);
    }
    if (!confirm('确定发送吗？系统将逐人单独发送，每人仅看到自己的邮箱在收件人栏。')) return;

    const btn = document.getElementById('confirmBatchEmailBtn');
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = '发送中...';
    try {
      const payload = typeof options.buildPayload === 'function'
        ? options.buildPayload({ subject, body })
        : { subject, body };
      const { res, data } = await api(options.apiPath, { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) return alert(data.message || '群发邮件失败');
      const lines = [`发送完成：成功 ${data.sent || 0}，失败 ${data.failed || 0}，跳过 ${data.skipped || 0}`];
      (data.results || []).filter((item) => item.status === 'failed').slice(0, 5).forEach((item) => {
        lines.push(`${item.influencer_id}: ${item.error}`);
      });
      alert(lines.join('\n'));
      document.getElementById('batchEmailModal')?.classList.add('hidden');
      if (typeof options.onSent === 'function') options.onSent(data);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });
}

function renderPinButton(influencerId, pinned) {
  const active = Number(pinned) === 1;
  const label = active ? '取消置顶' : '置顶';
  return `<button type="button" class="erp-pin-btn${active ? ' is-pinned' : ''}" data-influencer-id="${escapeAttr(String(influencerId || ''))}" title="${label}" aria-label="${label}"><span class="erp-pin-icon" aria-hidden="true"></span></button>`;
}

function renderInfluencerIdCell(id, pinned, renderLink) {
  const linkHtml = typeof renderLink === 'function' ? renderLink(id) : escapeHtml(id || '-');
  if (!id) return linkHtml;
  return `<span class="erp-influencer-id-cell">${linkHtml}${renderPinButton(id, pinned)}</span>`;
}

function formatEmailSendDateLabel(sentAt) {
  const text = String(sentAt || '').trim();
  if (!text) return '';
  return text.slice(0, 10);
}

function renderEmailSendStatusBadge(row) {
  const status = String(row?.latest_email_send_status || '').trim();
  const sentAt = String(row?.latest_email_send_at || '').trim();
  if (!status || !sentAt || !['sent', 'failed'].includes(status)) return '';
  const date = formatEmailSendDateLabel(sentAt);
  if (!date) return '';
  const isSuccess = status === 'sent';
  const cls = isSuccess ? 'erp-email-send-badge erp-email-send-badge--success' : 'erp-email-send-badge erp-email-send-badge--failed';
  const title = isSuccess
    ? `最近发送成功：${sentAt}`
    : `最近发送失败：${sentAt}${row?.latest_email_send_error ? `\n${row.latest_email_send_error}` : ''}`;
  return `<span class="${cls}" title="${escapeAttr(title)}">${escapeHtml(date)}</span>`;
}

function renderInfluencerEmailInline(influencerId, email, row) {
  if (email === undefined) return '';
  return `<span class="erp-influencer-email-inline">${renderInfluencerEmailInput(influencerId, email)}${renderEmailSendStatusBadge(row)}</span>`;
}

async function toggleInfluencerPin(influencerId) {
  const { res, data } = await api(`/api/influencer-profiles/${encodeURIComponent(influencerId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ toggle_pin: true }),
  });
  if (!res.ok) throw new Error(data.message || '置顶操作失败');
  return data;
}

function bindPinButtons(container, onToggled) {
  (container || document).addEventListener('click', async (e) => {
    const btn = e.target.closest('.erp-pin-btn');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const influencerId = btn.dataset.influencerId;
    if (!influencerId) return;
    btn.disabled = true;
    try {
      await toggleInfluencerPin(influencerId);
      if (typeof onToggled === 'function') await onToggled();
    } catch (err) {
      alert(err.message || '置顶操作失败');
    } finally {
      btn.disabled = false;
    }
  });
}

const TABLE_SELECT_ALL_HEADER = `
  <th class="cell-checkbox">
    <div class="erp-select-all-wrap" id="selectAllWrap">
      <input type="checkbox" id="selectAllCheckbox" title="批量选择" />
      <div id="selectAllMenu" class="erp-select-all-menu hidden">
        <button type="button" id="selectPageBtn">选中本页 <span id="selectPageCount">0</span> 行</button>
        <button type="button" id="selectAllBtn">选中所有搜索结果 <span id="selectAllCount">0</span> 行</button>
        <button type="button" id="selectClearBtn">取消选择</button>
      </div>
    </div>
  </th>`;

function createBatchRowSelection(options = {}) {
  const deleteIdKey = options.deleteIdKey || 'order_ids';
  let selectedIds = new Set();
  let allResultsSelected = false;
  let lastLoadedRows = [];
  let lastTotal = 0;

  function isRowChecked(id) {
    return allResultsSelected || selectedIds.has(Number(id));
  }

  function getSelectedCount() {
    return allResultsSelected ? lastTotal : selectedIds.size;
  }

  function updateSelectAllMenuCounts() {
    const pageCountEl = document.getElementById('selectPageCount');
    const allCountEl = document.getElementById('selectAllCount');
    if (pageCountEl) pageCountEl.textContent = lastLoadedRows.length;
    if (allCountEl) allCountEl.textContent = lastTotal;
  }

  function syncHeaderCheckbox() {
    const header = document.getElementById('selectAllCheckbox');
    if (!header) return;
    if (!lastLoadedRows.length) {
      header.checked = false;
      header.indeterminate = false;
      return;
    }
    if (allResultsSelected) {
      header.checked = true;
      header.indeterminate = false;
      return;
    }
    const pageIds = lastLoadedRows.map((row) => Number(row.id));
    const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
    header.checked = selectedOnPage > 0 && selectedOnPage === pageIds.length;
    header.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
  }

  function syncRowCheckboxes() {
    document.querySelectorAll('.row-checkbox').forEach((box) => {
      box.checked = isRowChecked(box.dataset.id);
    });
    syncHeaderCheckbox();
  }

  function closeSelectAllMenu() {
    document.getElementById('selectAllMenu')?.classList.add('hidden');
  }

  function openSelectAllMenu() {
    updateSelectAllMenuCounts();
    document.getElementById('selectAllMenu')?.classList.remove('hidden');
  }

  function toggleSelectAllMenu() {
    const menu = document.getElementById('selectAllMenu');
    if (!menu) return;
    if (menu.classList.contains('hidden')) openSelectAllMenu();
    else closeSelectAllMenu();
  }

  function resetSelection(selectAll = false) {
    allResultsSelected = selectAll;
    selectedIds.clear();
    const header = document.getElementById('selectAllCheckbox');
    if (header) {
      header.checked = selectAll;
      header.indeterminate = false;
    }
  }

  function selectCurrentPage() {
    if (!lastLoadedRows.length) return alert('当前页没有可选择的记录');
    allResultsSelected = false;
    selectedIds = new Set(lastLoadedRows.map((row) => Number(row.id)));
    syncRowCheckboxes();
    closeSelectAllMenu();
  }

  function selectAllResults() {
    if (!lastTotal) return alert('当前没有可选择的记录');
    allResultsSelected = true;
    selectedIds.clear();
    syncRowCheckboxes();
    closeSelectAllMenu();
  }

  function clearSelection() {
    resetSelection(false);
    syncRowCheckboxes();
    closeSelectAllMenu();
  }

  function bindSelectAllMenuElements() {
    const checkbox = document.getElementById('selectAllCheckbox');
    const wrap = document.getElementById('selectAllWrap');
    if (!checkbox || !wrap) return;

    checkbox.onmousedown = (e) => e.preventDefault();
    checkbox.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSelectAllMenu();
    };
    const pageBtn = document.getElementById('selectPageBtn');
    if (pageBtn) {
      pageBtn.onclick = (e) => {
        e.stopPropagation();
        selectCurrentPage();
      };
    }
    const allBtn = document.getElementById('selectAllBtn');
    if (allBtn) {
      allBtn.onclick = (e) => {
        e.stopPropagation();
        selectAllResults();
      };
    }
    const clearBtn = document.getElementById('selectClearBtn');
    if (clearBtn) {
      clearBtn.onclick = (e) => {
        e.stopPropagation();
        clearSelection();
      };
    }
    syncHeaderCheckbox();
  }

  let documentClickBound = false;

  function setupSelectAllMenu() {
    bindSelectAllMenuElements();
    if (documentClickBound) return;
    documentClickBound = true;
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('selectAllWrap');
      if (wrap && !wrap.contains(e.target)) closeSelectAllMenu();
    });
  }

  function bindRowCheckboxes() {
    document.querySelectorAll('.row-checkbox').forEach((box) => {
      box.addEventListener('change', () => {
        const id = Number(box.dataset.id);
        if (allResultsSelected) {
          allResultsSelected = false;
          selectedIds = new Set(lastLoadedRows.map((row) => Number(row.id)));
        }
        if (box.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        syncHeaderCheckbox();
      });
    });
  }

  function setLoadedRows(rows, total) {
    lastLoadedRows = rows || [];
    lastTotal = total || 0;
    updateSelectAllMenuCounts();
    syncRowCheckboxes();
  }

  function buildDeletePayload(getBatchFilters) {
    return {
      scope: allResultsSelected ? 'all' : 'page',
      [deleteIdKey]: allResultsSelected ? [] : [...selectedIds],
      filters: typeof getBatchFilters === 'function' ? getBatchFilters() : {},
    };
  }

  function renderCheckboxCell(id) {
    const checked = isRowChecked(id) ? 'checked' : '';
    return `<td class="cell-checkbox"><input type="checkbox" class="row-checkbox" data-id="${id}" ${checked} /></td>`;
  }

  return {
    getSelectedCount,
    resetSelection,
    setupSelectAllMenu,
    bindRowCheckboxes,
    setLoadedRows,
    buildDeletePayload,
    renderCheckboxCell,
  };
}

const INFLUENCER_ID_HEADER_ALIASES = new Set([
  'buyer username',
  'buyerusername',
  '达人用户名',
  'creator username',
  'creatorusername',
  '达人id',
  '达人 id',
]);

const SAMPLE_DATE_HEADER_ALIASES = new Set([
  'created time',
  'createdtime',
  'creater time',
  'creatertime',
]);

function normalizeInfluencerIdHeaderLabel(header) {
  const text = String(header || '').trim();
  if (!text) return header;
  const key = text.toLowerCase();
  const compact = key.replace(/\s+/g, '');
  if (INFLUENCER_ID_HEADER_ALIASES.has(key) || INFLUENCER_ID_HEADER_ALIASES.has(compact)) return '达人id';
  if (SAMPLE_DATE_HEADER_ALIASES.has(key) || SAMPLE_DATE_HEADER_ALIASES.has(compact)) return '寄样日期';
  return header;
}

function renderInfluencerLink(id) {
  const clean = String(id || '').trim().replace(/^@+/, '');
  if (!clean) return '-';
  const url = `https://www.tiktok.com/@${encodeURIComponent(clean)}?shop_region=US`;
  return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="erp-link-external">${escapeHtml(clean)}</a>`;
}

function renderInfluencerEmailCell(email) {
  const value = String(email || '').trim();
  if (!value) return '-';
  if (value === '未留') return '<span class="erp-meta">未留</span>';
  return escapeHtml(value);
}

function renderInfluencerEmailInput(influencerId, email) {
  const value = String(email || '').trim();
  return `<div class="erp-editable-wrap"><input type="text" class="erp-editable editable-email" data-influencer-id="${escapeAttr(influencerId)}" value="${escapeAttr(value)}" placeholder="邮箱" title="${escapeAttr(value)}" /><span class="erp-save-status save-status hidden"></span></div>`;
}

const influencerEmailSaveTimers = new Map();

async function saveInfluencerEmailField(input) {
  const influencerId = String(input?.dataset?.influencerId || '').trim();
  if (!influencerId) return;
  const timerKey = `email-${influencerId}`;
  if (influencerEmailSaveTimers.has(timerKey)) {
    clearTimeout(influencerEmailSaveTimers.get(timerKey));
    influencerEmailSaveTimers.delete(timerKey);
  }
  const value = input.value.trim();
  if (input.dataset.lastSaved === value) return;
  const status = input.parentElement?.querySelector('.save-status');
  const { res, data } = await api(`/api/influencer-profiles/${encodeURIComponent(influencerId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ email: value }),
  });
  if (!res.ok) {
    alert(data.message || '邮箱保存失败');
    input.value = input.dataset.lastSaved || '';
    input.title = input.dataset.lastSaved || '';
    return;
  }
  input.dataset.lastSaved = value;
  input.title = value;
  if (status) {
    status.textContent = '已保存';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 1200);
  }
  if (typeof window.onInfluencerEmailSaved === 'function') {
    window.onInfluencerEmailSaved(influencerId, value);
  }
}

function scheduleInfluencerEmailSave(input) {
  const influencerId = String(input?.dataset?.influencerId || '').trim();
  if (!influencerId) return;
  const timerKey = `email-${influencerId}`;
  if (influencerEmailSaveTimers.has(timerKey)) clearTimeout(influencerEmailSaveTimers.get(timerKey));
  influencerEmailSaveTimers.set(
    timerKey,
    setTimeout(() => {
      influencerEmailSaveTimers.delete(timerKey);
      saveInfluencerEmailField(input);
    }, 600)
  );
}

function bindInfluencerEmailFields(root = document) {
  root.querySelectorAll('.editable-email').forEach((input) => {
    if (input.dataset.emailBound === '1') return;
    input.dataset.emailBound = '1';
    input.dataset.lastSaved = input.value.trim();
    input.addEventListener('input', () => scheduleInfluencerEmailSave(input));
    input.addEventListener('blur', () => saveInfluencerEmailField(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  });
}

function renderLastImportSummary(lastImport) {
  if (!lastImport) return '';
  const time = formatImportTimeValue(lastImport.import_time);
  const by = escapeHtml(lastImport.imported_by || '-');
  const total = Number(lastImport.total) || 0;
  const inserted = Number(lastImport.inserted) || 0;
  const updated = Number(lastImport.updated) || 0;
  const skipped = Number(lastImport.skipped) || 0;
  let detail = `成功 ${inserted} 条`;
  if (updated > 0) detail += `，覆盖 ${updated} 条`;
  if (skipped > 0) detail += `，重复 ${skipped} 条`;
  return `<div class="erp-import-summary">最近导入：${escapeHtml(time)} · 导入人 ${by} · 共 ${total} 条，${detail}</div>`;
}

function formatScrapeEmailResultMessage(data) {
  const summary = data.summary || {};
  const lines = [`抓取完成：成功 ${summary.scraped || 0} 条，跳过已有 ${summary.skipped || 0} 条`];
  (data.results || [])
    .filter((item) => !item.success)
    .forEach((item) => {
      lines.push(`${item.influencer_id}：由于${item.error || '未知原因'}，抓取邮箱失败`);
    });
  return lines.join('\n');
}

const TIKTOK_EMAIL_BLOCKED_DOMAINS = ['tiktok.com', 'byteoversea.com', 'example.com', 'musical.ly'];

function isValidInfluencerEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.split('@')[1].toLowerCase();
  return !TIKTOK_EMAIL_BLOCKED_DOMAINS.some((part) => domain.includes(part));
}

function extractEmailFromPlainText(text) {
  const normalized = normalizeTikTokHtmlForEmailSearch(text);
  const emails = normalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  for (const email of emails) {
    if (isValidInfluencerEmail(email)) return email;
  }
  return '';
}

function extractSignatureFieldsFromRawHtml(html) {
  const normalized = normalizeTikTokHtmlForEmailSearch(html);
  const pattern = /"signature"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = pattern.exec(normalized))) {
    try {
      const decoded = JSON.parse(`"${match[1]}"`);
      const email = extractEmailFromPlainText(decoded);
      if (email) return email;
    } catch {
      const email = extractEmailFromPlainText(match[1]);
      if (email) return email;
    }
  }
  return '';
}

function extractEmailFromTikTokUserObject(user) {
  if (!user || typeof user !== 'object') return '';
  const signature = String(user.signature || user.bio || user.desc || user.bioDescription || '').trim();
  const fromSignature = extractEmailFromPlainText(signature);
  if (fromSignature) return fromSignature;
  const directEmail = String(user.email || user.businessEmail || user.contactEmail || '').trim();
  if (isValidInfluencerEmail(directEmail)) return directEmail;
  const bioLink = user.bioLink || user.bio_link || user.biolink;
  if (bioLink && typeof bioLink === 'object') {
    const link = String(bioLink.link || bioLink.url || '').trim();
    const mailto = link.match(/mailto:([^?]+)/i);
    if (mailto && isValidInfluencerEmail(mailto[1])) return mailto[1];
    const fromLink = extractEmailFromPlainText(link);
    if (fromLink) return fromLink;
  }
  return '';
}

function walkJsonForTikTokEmail(value, depth = 0) {
  if (depth > 8 || value == null) return '';
  if (typeof value === 'string') {
    if (value.includes('@')) return extractEmailFromPlainText(value);
    return '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = walkJsonForTikTokEmail(item, depth + 1);
      if (email) return email;
    }
    return '';
  }
  if (typeof value === 'object') {
    if (value.uniqueId || value.unique_id || value.nickname) {
      const fromUser = extractEmailFromTikTokUserObject(value);
      if (fromUser) return fromUser;
    }
    for (const key of Object.keys(value)) {
      const email = walkJsonForTikTokEmail(value[key], depth + 1);
      if (email) return email;
    }
  }
  return '';
}

function extractEmailFromTikTokHtml(html) {
  if (detectTikTokWafPage(html)) return '';

  const text = normalizeTikTokHtmlForEmailSearch(html);
  const mailto = text.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (mailto && isValidInfluencerEmail(mailto[1])) return mailto[1];

  const fromRawSignature = extractSignatureFieldsFromRawHtml(text);
  if (fromRawSignature) return fromRawSignature;

  const scriptIds = ['SIGI_STATE', '__UNIVERSAL_DATA_FOR_REHYDRATION__'];
  for (const scriptId of scriptIds) {
    const match = text.match(new RegExp(`<script id="${scriptId}"[^>]*>([\\s\\S]*?)<\\/script>`, 'i'));
    if (!match) continue;
    try {
      const data = JSON.parse(match[1]);
      const users = data?.UserModule?.users;
      if (users && typeof users === 'object') {
        for (const user of Object.values(users)) {
          const email = extractEmailFromTikTokUserObject(user);
          if (email) return email;
        }
      }
      const userInfo = data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
      const fromDefault = extractEmailFromTikTokUserObject(userInfo);
      if (fromDefault) return fromDefault;
      const fromJson = walkJsonForTikTokEmail(data);
      if (fromJson) return fromJson;
    } catch {
      // ignore malformed JSON blocks
    }
  }

  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const fromJson = walkJsonForTikTokEmail(JSON.parse(trimmed));
      if (fromJson) return fromJson;
    }
  } catch {
    // not JSON response
  }

  return extractEmailFromPlainText(text);
}

let tiktokServiceWorkerReadyPromise = null;

function normalizeTikTokFetchError(message) {
  const text = String(message || '').trim();
  if (!text) return '无法访问 TikTok';
  if (/failed to fetch|networkerror|network error|load failed/i.test(text)) {
    return '网络无法访问 TikTok，请确认 VPN/代理已开启，且浏览器能打开 TikTok 主页';
  }
  return text;
}

function buildTikTokProfileUrlsClient(username) {
  const clean = String(username || '').trim().replace(/^@+/, '');
  if (!clean) return [];
  const encoded = encodeURIComponent(clean);
  return [
    `https://www.tiktok.com/@${encoded}?shop_region=US&lang=en`,
    `https://www.tiktok.com/api/user/detail/?uniqueId=${encoded}`,
  ];
}

function detectTikTokWafPage(html) {
  const text = String(html || '');
  if (/Please wait|wafchallenge|SlardarWAF|_wafchallengeid|waf-aiso/i.test(text)) return true;
  if (text.trim().startsWith('<!DOCTYPE') && text.length < 8000) {
    if (!text.includes('SIGI_STATE') && !text.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) return true;
  }
  return false;
}

function pageHasTikTokProfileData(html) {
  const text = String(html || '');
  if (detectTikTokWafPage(text)) return false;
  if (text.includes('SIGI_STATE') || text.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) return true;
  if (/"signature"\s*:\s*"[^"]*@/.test(text.replace(/\\u0040/gi, '@'))) return true;
  if (text.trim().startsWith('{') && text.includes('"uniqueId"')) return true;
  return text.length >= 8000;
}

function normalizeTikTokHtmlForEmailSearch(html) {
  return String(html || '')
    .replace(/\\u0040/gi, '@')
    .replace(/&#64;|&#x40;/gi, '@')
    .replace(/\s*\[at\]\s*/gi, '@')
    .replace(/\s*\(at\)\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@');
}

async function readTikTokProxyResponse(response) {
  const body = await response.text();
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed.error) message = parsed.error;
    } catch {
      if (body) message = body.slice(0, 160);
    }
    throw new Error(normalizeTikTokFetchError(message));
  }
  return body;
}

const DEFAULT_TIKTOK_PROXY = 'http://127.0.0.1:7890';

function canUseLocalProxyForServerFetch() {
  const host = String(window.location.hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function getStoredTikTokProxy() {
  try {
    return String(localStorage.getItem('tiktok_proxy') || '').trim();
  } catch {
    return '';
  }
}

function getEffectiveTikTokProxy() {
  const stored = getStoredTikTokProxy();
  if (stored) return stored;
  if (canUseLocalProxyForServerFetch()) return DEFAULT_TIKTOK_PROXY;
  return '';
}

function initTikTokProxyForScrape() {
  const existing = getStoredTikTokProxy();
  if (existing) return existing;
  if (!canUseLocalProxyForServerFetch()) return '';
  try {
    localStorage.setItem('tiktok_proxy', DEFAULT_TIKTOK_PROXY);
  } catch {
    // ignore storage errors
  }
  return DEFAULT_TIKTOK_PROXY;
}

function ensureTikTokProxyConfigured() {
  const existing = getEffectiveTikTokProxy();
  if (existing) return existing;
  const input = window.prompt(
    '当前网络无法访问 TikTok。\n\n若您使用 Clash / V2Ray 等工具，请输入本地代理地址；访问云服务器 ERP 时也可开启 Clash 系统代理后重试：',
    DEFAULT_TIKTOK_PROXY
  );
  if (input === null) return '';
  const value = String(input).trim();
  if (value) {
    try {
      localStorage.setItem('tiktok_proxy', value);
    } catch {
      // ignore storage errors
    }
  }
  return value;
}

async function fetchTikTokPageHtmlViaServer(targetUrl, timeoutMs = 15000, proxyOverride) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const proxy = proxyOverride !== undefined ? String(proxyOverride || '').trim() : getEffectiveTikTokProxy();
    const params = new URLSearchParams({ url: targetUrl });
    if (proxy) params.set('proxy', proxy);
    const proxyUrl = `/api/tiktok-fetch-proxy?${params.toString()}`;
    const response = await fetch(proxyUrl, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    return await readTikTokProxyResponse(response);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时，请确认 VPN/代理可用');
    throw new Error(normalizeTikTokFetchError(err.message));
  } finally {
    clearTimeout(timer);
  }
}

async function ensureTikTokServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('当前浏览器不支持 Service Worker，请使用 Chrome 或 Edge 最新版');
  }
  if (!window.isSecureContext) {
    throw new Error('请在 HTTPS 或 localhost 环境下使用抓取邮箱功能');
  }
  if (!tiktokServiceWorkerReadyPromise) {
    tiktokServiceWorkerReadyPromise = navigator.serviceWorker
      .register('/tiktok-fetch-sw.js', { scope: '/' })
      .then((registration) => navigator.serviceWorker.ready.then(() => registration))
      .catch((err) => {
        tiktokServiceWorkerReadyPromise = null;
        throw new Error(err.message || 'Service Worker 注册失败');
      });
  }
  return tiktokServiceWorkerReadyPromise;
}

async function fetchTikTokPageHtmlViaServiceWorker(targetUrl, timeoutMs = 15000) {
  await ensureTikTokServiceWorker();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const proxyUrl = `/tiktok-fetch-proxy?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxyUrl, { signal: controller.signal, cache: 'no-store' });
    return await readTikTokProxyResponse(response);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时，请确认本机可访问 TikTok');
    throw new Error(normalizeTikTokFetchError(err.message));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTikTokPageHtml(targetUrl, timeoutMs = 15000) {
  const proxy = getEffectiveTikTokProxy();
  const strategies = [];
  if (proxy) {
    strategies.push(() => fetchTikTokPageHtmlViaServer(targetUrl, timeoutMs, proxy));
  }
  strategies.push(() => fetchTikTokPageHtmlViaServer(targetUrl, timeoutMs, ''));
  strategies.push(() => fetchTikTokPageHtmlViaServiceWorker(targetUrl, timeoutMs));
  let lastError = null;
  for (const strategy of strategies) {
    try {
      const html = await strategy();
      if (detectTikTokWafPage(html)) {
        lastError = new Error('TikTok 安全验证拦截，请先在浏览器打开该达人 TikTok 主页后再抓取');
        continue;
      }
      if (html && pageHasTikTokProfileData(html)) return html;
      if (html && html.length >= 80) return html;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('无法获取 TikTok 页面，请确认 VPN/代理已开启');
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeTikTokEmailForInfluencer(influencerId) {
  const username = String(influencerId || '').trim().replace(/^@+/, '');
  if (!username) throw new Error('达人 id 不能为空');

  let html = '';
  let lastError = null;
  let sawWaf = false;
  for (const url of buildTikTokProfileUrlsClient(username)) {
    try {
      html = await fetchTikTokPageHtml(url);
      if (detectTikTokWafPage(html)) {
        sawWaf = true;
        continue;
      }
      if (pageHasTikTokProfileData(html)) break;
    } catch (err) {
      lastError = err;
      if (String(err.message || '').includes('安全验证拦截')) sawWaf = true;
    }
  }

  if (!html || !pageHasTikTokProfileData(html)) {
    if (sawWaf) {
      throw new Error('TikTok 安全验证拦截，请先在浏览器打开该达人 TikTok 主页后再抓取');
    }
    throw lastError || new Error('无法获取 TikTok 页面内容，请确认本机网络可访问 TikTok');
  }

  if (/couldn't find this account|doesn't exist|page isn't available|account was banned/i.test(html)) {
    throw new Error('未找到该达人账号');
  }

  const email = extractEmailFromTikTokHtml(html);
  return email || '未留';
}

async function scrapeInfluencerEmailsClient(influencerIds, onProgress) {
  const uniqueIds = [...new Set((influencerIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const results = [];
  for (let index = 0; index < uniqueIds.length; index += 1) {
    const influencerId = uniqueIds[index];
    try {
      const email = await scrapeTikTokEmailForInfluencer(influencerId);
      results.push({ influencer_id: influencerId, email, success: true, skipped: false });
    } catch (err) {
      results.push({
        influencer_id: influencerId,
        success: false,
        error: err.message || '抓取失败',
      });
    }
    if (typeof onProgress === 'function') onProgress(index + 1, uniqueIds.length);
    if (index < uniqueIds.length - 1) await sleepMs(150);
  }
  return results;
}

async function runInfluencerEmailScrapeFlow({
  source = 'records',
  scope = 'page',
  recordIds = [],
  influencerIds = [],
  filters = {},
  onStatus,
} = {}) {
  const { res: targetRes, data: targetData } = await api('/api/influencer-profiles/scrape-email-targets', {
    method: 'POST',
    body: JSON.stringify({
      source,
      scope,
      record_ids: recordIds,
      influencer_ids: influencerIds,
      filters,
    }),
  });
  if (!targetRes.ok) throw new Error(targetData.message || '获取抓取目标失败');

  initTikTokProxyForScrape();

  const ids = targetData.influencer_ids || [];
  if (!ids.length) {
    return {
      results: [],
      summary: {
        total: targetData.total || 0,
        scraped: 0,
        skipped: targetData.skipped || 0,
        failed: 0,
      },
      message: '所选达人均已有邮箱信息',
    };
  }

  if (typeof onStatus === 'function') onStatus(`正在抓取 0/${ids.length}，请保持页面打开…`);
  let clientResults = await scrapeInfluencerEmailsClient(ids, (done, total) => {
    if (typeof onStatus === 'function') onStatus(`正在抓取 ${done}/${total}，请保持页面打开…`);
  });

  const failedIds = clientResults.filter((item) => !item.success).map((item) => item.influencer_id);
  if (failedIds.length && !getEffectiveTikTokProxy()) {
    ensureTikTokProxyConfigured();
    if (getEffectiveTikTokProxy()) {
      if (typeof onStatus === 'function') onStatus('已配置代理，正在重试…');
      const retryResults = await scrapeInfluencerEmailsClient(failedIds, (done, total) => {
        if (typeof onStatus === 'function') onStatus(`重试抓取 ${done}/${total}…`);
      });
      const merged = new Map(clientResults.map((item) => [item.influencer_id, item]));
      retryResults.forEach((item) => merged.set(item.influencer_id, item));
      clientResults = ids.map((id) => merged.get(id)).filter(Boolean);
    }
  }

  const successItems = clientResults.filter((item) => item.success);
  if (successItems.length) {
    const { res: saveRes, data: saveData } = await api('/api/influencer-profiles/batch-save-emails', {
      method: 'POST',
      body: JSON.stringify({ items: successItems }),
    });
    if (!saveRes.ok) throw new Error(saveData.message || '保存邮箱失败');
  }

  return {
    results: clientResults,
    summary: {
      total: targetData.total || ids.length,
      scraped: successItems.length,
      skipped: targetData.skipped || 0,
      failed: clientResults.filter((item) => !item.success).length,
    },
  };
}

const TAGS_COLLAPSED_VISIBLE_COUNT = 2;

function parseTagsList(value) {
  const seen = new Set();
  const tags = [];
  String(value || '')
    .split(/[,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((tag) => {
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    });
  return tags;
}

function joinTagsList(tags) {
  return tags.filter(Boolean).join(',');
}

function renderTagChipHtml(tag, { editable = false } = {}) {
  const removeBtn = editable
    ? `<button type="button" class="erp-tag-remove" data-tag="${escapeAttr(tag)}" aria-label="删除标签">×</button>`
    : '';
  return `<span class="erp-tag-chip${editable ? '' : ' readonly'}" data-tag="${escapeAttr(tag)}"><span class="erp-tag-text">${escapeHtml(tag)}</span>${removeBtn}</span>`;
}

function buildTagsCollapsedInner(tags) {
  if (!tags.length) {
    return '<span class="erp-tags-empty">点击添加</span>';
  }
  const visible = tags.slice(0, TAGS_COLLAPSED_VISIBLE_COUNT);
  const restCount = tags.length - visible.length;
  const chips = visible.map((tag) => renderTagChipHtml(tag)).join('');
  const more = restCount > 0 ? `<span class="erp-tag-more">+${restCount}</span>` : '';
  return `${chips}${more}`;
}

function buildTagsEditInner(tags) {
  const chips = tags.map((tag) => renderTagChipHtml(tag, { editable: true })).join('');
  return `${chips}<input type="text" class="erp-tag-add-input" placeholder="回车添加" />`;
}

function renderTagsCell(influencerId, tagsValue) {
  const tags = parseTagsList(tagsValue);
  return `<div class="erp-tags-cell erp-tags-cell-collapsed" data-influencer-id="${escapeAttr(influencerId)}" tabindex="0" role="button" title="点击编辑标签">${buildTagsCollapsedInner(tags)}</div>`;
}

function setTagsCellCollapsed(cell, tags) {
  cell.classList.remove('erp-tags-cell-editing');
  cell.classList.add('erp-tags-cell-collapsed');
  cell.setAttribute('tabindex', '0');
  cell.setAttribute('role', 'button');
  cell.title = '点击编辑标签';
  cell.innerHTML = buildTagsCollapsedInner(tags);
}

function setTagsCellEditing(cell, tags) {
  cell.classList.remove('erp-tags-cell-collapsed');
  cell.classList.add('erp-tags-cell-editing');
  cell.removeAttribute('tabindex');
  cell.removeAttribute('role');
  cell.removeAttribute('title');
  cell.innerHTML = buildTagsEditInner(tags);
}

const tagsCellHandlersMap = new WeakMap();
let activeEditingTagsCell = null;
let tagsDocumentListenerBound = false;

function collapseActiveTagsCell() {
  document.removeEventListener('click', onDocumentClickForTags, true);
  if (!activeEditingTagsCell) return;
  const cell = activeEditingTagsCell;
  activeEditingTagsCell = null;
  const handlers = tagsCellHandlersMap.get(cell);
  if (!handlers) return;
  const tags = handlers.getTagsForInfluencer(cell.dataset.influencerId);
  setTagsCellCollapsed(cell, tags);
}

function onDocumentClickForTags(e) {
  if (activeEditingTagsCell?.contains(e.target)) return;
  collapseActiveTagsCell();
}

function onDocumentKeydownForTags(e) {
  if (e.key !== 'Escape' || !activeEditingTagsCell) return;
  collapseActiveTagsCell();
}

function ensureTagsDocumentListeners() {
  if (tagsDocumentListenerBound) return;
  tagsDocumentListenerBound = true;
  document.addEventListener('keydown', onDocumentKeydownForTags);
}

function expandTagsCell(cell) {
  const handlers = tagsCellHandlersMap.get(cell);
  if (!handlers) return;
  if (activeEditingTagsCell && activeEditingTagsCell !== cell) {
    collapseActiveTagsCell();
  }
  activeEditingTagsCell = cell;
  setTagsCellEditing(cell, handlers.getTagsForInfluencer(cell.dataset.influencerId));
  document.removeEventListener('click', onDocumentClickForTags, true);
  setTimeout(() => {
    document.addEventListener('click', onDocumentClickForTags, true);
    cell.querySelector('.erp-tag-add-input')?.focus();
  }, 0);
}

function refreshTagsCellsForInfluencer(influencerId, tags) {
  document.querySelectorAll('.erp-tags-cell').forEach((cell) => {
    if (cell.dataset.influencerId !== String(influencerId)) return;
    const isEditing = cell.classList.contains('erp-tags-cell-editing');
    if (isEditing) {
      setTagsCellEditing(cell, tags);
      cell.querySelector('.erp-tag-add-input')?.focus();
    } else {
      setTagsCellCollapsed(cell, tags);
    }
  });
}

async function saveTagsCellChange(cell, influencerId, tags) {
  const handlers = tagsCellHandlersMap.get(cell);
  if (!handlers) return false;
  const ok = await handlers.saveTagsForInfluencer(influencerId, tags);
  if (!ok) return false;
  refreshTagsCellsForInfluencer(influencerId, tags);
  if (typeof handlers.onAfterSave === 'function') {
    handlers.onAfterSave();
  }
  return true;
}

function bindTagsCell(cell) {
  const handlers = tagsCellHandlersMap.get(cell);
  if (!handlers || cell.dataset.tagsBound === '1') return;
  cell.dataset.tagsBound = '1';
  const influencerId = cell.dataset.influencerId;

  cell.addEventListener('click', async (e) => {
    if (cell.classList.contains('erp-tags-cell-collapsed')) {
      if (e.target.closest('.erp-tag-remove')) return;
      expandTagsCell(cell);
      e.stopPropagation();
      return;
    }
    const removeBtn = e.target.closest('.erp-tag-remove');
    if (!removeBtn) return;
    e.stopPropagation();
    const tagToRemove = removeBtn.dataset.tag;
    const tags = handlers.getTagsForInfluencer(influencerId).filter((tag) => tag !== tagToRemove);
    await saveTagsCellChange(cell, influencerId, tags);
  });

  cell.addEventListener('keydown', async (e) => {
    if (cell.classList.contains('erp-tags-cell-collapsed')) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        expandTagsCell(cell);
      }
      return;
    }
    if (!cell.classList.contains('erp-tags-cell-editing')) return;
    if (e.target.classList.contains('erp-tag-add-input') && e.key === 'Enter') {
      e.preventDefault();
      const addInput = e.target;
      const newTag = addInput.value.trim();
      if (!newTag) return;
      const tags = handlers.getTagsForInfluencer(influencerId);
      if (tags.includes(newTag)) {
        alert('该标签已存在');
        addInput.value = '';
        return;
      }
      const ok = await saveTagsCellChange(cell, influencerId, [...tags, newTag]);
      if (ok) addInput.value = '';
    }
  });
}

function bindInfluencerTagsCells(handlers) {
  ensureTagsDocumentListeners();
  if (activeEditingTagsCell && !document.body.contains(activeEditingTagsCell)) {
    activeEditingTagsCell = null;
    document.removeEventListener('click', onDocumentClickForTags, true);
  }
  document.querySelectorAll('.erp-tags-cell').forEach((cell) => {
    tagsCellHandlersMap.set(cell, handlers);
    bindTagsCell(cell);
  });
}

function renderTagsDisplayReadonly(value) {
  const tags = parseTagsList(value);
  if (!tags.length) return '-';
  return `<span class="erp-tag-list erp-tag-list-readonly">${buildTagsCollapsedInner(tags)}</span>`;
}

function collectSampleOrderItemsFromDuplicateGroups(groups) {
  const items = [];
  const seenIds = new Set();
  (groups || []).forEach((group) => {
    (group.sample_dates || []).forEach((item) => {
      const id = item?.sample_order_id;
      if (id) {
        if (seenIds.has(id)) return;
        seenIds.add(id);
      }
      items.push(item);
    });
  });
  return items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function buildSampleOrdersHighlightUrl(items) {
  const ids = (items || []).map((item) => item?.sample_order_id).filter(Boolean);
  if (!ids.length) return '';
  return `/sample-orders.html?highlight=${ids.join(',')}`;
}

function renderSampleDateText(item) {
  const date = String(item?.date || '').trim();
  return date ? escapeHtml(date) : '';
}

function wrapSampleDateLink(items, innerHtml) {
  if (!innerHtml) return '';
  const href = buildSampleOrdersHighlightUrl(items);
  if (!href) return innerHtml;
  return `<a href="${escapeAttr(href)}" class="erp-link-external sample-date-link-wrap">${innerHtml}</a>`;
}

function renderSampleDateLink(item) {
  const text = renderSampleDateText(item);
  if (!text) return '';
  return wrapSampleDateLink([item], `<span class="sample-date-link">${text}</span>`);
}

function resolveSampleDateDisplayData(row, scope = 'default') {
  if (scope === 'influencer') {
    return {
      sample_dates: row?.influencer_sample_dates,
      sample_order_count: row?.influencer_sample_order_count,
    };
  }
  if (scope === 'application') {
    return {
      sample_dates: row?.application_sample_dates,
      sample_order_count: row?.application_sample_order_count,
    };
  }
  return {
    sample_dates: row?.sample_dates,
    sample_order_count: row?.sample_order_count,
    sample_date: row?.sample_date,
    sample_order_id: row?.sample_order_id,
  };
}

function normalizeSampleDateItemsFromData(data) {
  if (Array.isArray(data?.sample_dates) && data.sample_dates.length) return data.sample_dates;
  if (data?.sample_date) {
    return [{ date: data.sample_date, sample_order_id: data.sample_order_id || null }];
  }
  return [];
}

function normalizeSampleDateItems(row) {
  return normalizeSampleDateItemsFromData(row);
}

function buildSampleDateDuplicateTitle(items, count) {
  const dates = items.map((item) => item.date).filter(Boolean).join('、');
  return `重复寄样 ${count} 次：${dates}`;
}

function buildSameModelDuplicateTitle(groups) {
  return groups
    .map((group) => {
      const dates = (group.sample_dates || []).map((item) => item.date).filter(Boolean).join('、');
      return `${group.model_name}：${dates}`;
    })
    .join('\n');
}

function renderSameModelDuplicateSampleDate(items, groups, duplicateCount) {
  const inner = `${renderSampleDateText(items[0])}<span class="sample-date-badge sample-date-badge-same-model">×${duplicateCount}</span>`;
  const linked = wrapSampleDateLink(items, inner);
  const title = `同一型号重复寄样\n${buildSameModelDuplicateTitle(groups)}`;
  return `<span class="sample-date-wrap sample-date-same-model-duplicate" title="${escapeAttr(title)}">${linked}</span>`;
}

function renderSampleDateListCell(row, scope = 'default') {
  const data = resolveSampleDateDisplayData(row, scope);
  const items = normalizeSampleDateItemsFromData(data);
  if (!items.length) return '-';

  if (scope === 'influencer' && row?.influencer_same_model_duplicate_groups?.length) {
    const groups = row.influencer_same_model_duplicate_groups;
    const linkItems = collectSampleOrderItemsFromDuplicateGroups(groups);
    return renderSameModelDuplicateSampleDate(
      linkItems.length ? linkItems : items,
      groups,
      row.influencer_same_model_duplicate_count
    );
  }

  if (scope === 'application' && (row?.application_sample_order_count || 0) > 1) {
    const groups = [
      {
        model_name: String(row?.model || row?.sku_id || '未知型号').trim() || '未知型号',
        sample_dates: row.application_sample_dates,
        count: row.application_sample_order_count,
      },
    ];
    return renderSameModelDuplicateSampleDate(items, groups, row.application_sample_order_count);
  }

  const count = Number(data.sample_order_count) || items.length;
  const isDuplicate = scope === 'default' && count > 1;
  if (!isDuplicate) return renderSampleDateLink(items[0]);
  const inner = `${renderSampleDateText(items[0])}<span class="sample-date-badge">×${count}</span>`;
  const title = buildSampleDateDuplicateTitle(items, count);
  return `<span class="sample-date-wrap sample-date-duplicate" title="${escapeAttr(title)}">${wrapSampleDateLink(items, inner)}</span>`;
}

function renderInfluencerSampleDateCell(row) {
  return renderSampleDateListCell(row, 'influencer');
}

function renderApplicationSampleDateCell(row) {
  return renderSampleDateListCell(row, 'application');
}

function renderSampleDateDetailCell(record) {
  return renderSampleDateListCell(record);
}

function ymdToInputDateValue(ymd) {
  const text = String(ymd || '').trim();
  if (!/^\d{8}$/.test(text)) return '';
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function renderCollaboratedSampleDateDetail(row) {
  return renderSampleDateListCell(row);
}

function renderInfluencerIdEditFieldHtml(influencerId) {
  const value = String(influencerId || '').trim();
  const displayHtml = value ? renderInfluencerLink(value) : '<span class="erp-meta">-</span>';
  return `
    <div class="erp-influencer-id-edit">
      <div class="erp-influencer-id-view">
        <span class="erp-influencer-id-display">${displayHtml}</span>
        <button type="button" class="erp-btn erp-btn-secondary erp-btn-sm edit-influencer-id-btn">编辑</button>
      </div>
      <div class="erp-influencer-id-form hidden">
        <input
          type="text"
          class="erp-input erp-influencer-id-input"
          value="${escapeAttr(value)}"
          data-original-id="${escapeAttr(value)}"
          placeholder="达人 id"
          autocomplete="off"
        />
        <button type="button" class="erp-btn erp-btn-primary erp-btn-sm save-influencer-id-btn">保存</button>
        <button type="button" class="erp-btn erp-btn-secondary erp-btn-sm cancel-influencer-id-btn">取消</button>
        <span class="erp-save-status save-status hidden"></span>
        <p class="erp-meta erp-influencer-id-edit-hint">修改后将同步更新相关数据；历史 id 会保留为别名，仍可用于关联查询。</p>
      </div>
    </div>
  `;
}

function enterInfluencerIdEditMode(wrap) {
  if (!wrap) return;
  wrap.querySelector('.erp-influencer-id-view')?.classList.add('hidden');
  wrap.querySelector('.erp-influencer-id-form')?.classList.remove('hidden');
  const input = wrap.querySelector('.erp-influencer-id-input');
  input?.focus();
  input?.select();
}

function exitInfluencerIdEditMode(wrap, { reset = true } = {}) {
  if (!wrap) return;
  const input = wrap.querySelector('.erp-influencer-id-input');
  if (reset && input) {
    input.value = input.dataset.originalId || '';
  }
  wrap.querySelector('.erp-influencer-id-view')?.classList.remove('hidden');
  wrap.querySelector('.erp-influencer-id-form')?.classList.add('hidden');
  setInfluencerDetailStatus(wrap.querySelector('.save-status'), '', true);
}

function formatInfluencerIdRenameLogText(log) {
  const changedBy = String(log?.changed_by || '').trim() || '-';
  const changedAt = formatImportTimeValue(log?.changed_at) || '-';
  const oldId = String(log?.old_influencer_id || '').trim() || '-';
  const newId = String(log?.new_influencer_id || '').trim() || '-';
  return `${changedBy}（修改人）于${changedAt}（修改日期）将达人id由${oldId}改成${newId}`;
}

function renderInfluencerIdRenameHistoryHtml(logs) {
  const list = Array.isArray(logs) ? logs : [];
  if (!list.length) return '';
  return list
    .map(
      (log) =>
        `<p class="erp-meta erp-influencer-id-history-item">${escapeHtml(formatInfluencerIdRenameLogText(log))}</p>`
    )
    .join('');
}

function renderInfluencerIdEditSectionHtml(influencerId, renameLogs = []) {
  return `${renderInfluencerIdEditFieldHtml(influencerId)}${renderInfluencerIdRenameHistoryHtml(renameLogs)}`;
}

function renderInfluencerCollabDetailHtml(row, renameLogs = []) {
  const fields = [
    ['达人id', renderInfluencerIdEditSectionHtml(row?.influencer_id, renameLogs)],
    ['负责人', row?.assignee_conflict && row?.assignee_names?.length
      ? `<span class="assignee-conflict" title="${escapeAttr(row.assignee_names.join('、'))}">${escapeHtml(row.assignee || '冲突')}</span>`
      : escapeHtml(row?.assignee || '-')],
    ['履约进展', escapeHtml(row?.fulfillment_progress || '-')],
    ['标签', renderTagsDisplayReadonly(row?.tags)],
    ['达人备注', escapeHtml(row?.influencer_remark || '-')],
    ['出单视频数', escapeHtml(String(row?.video_count ?? 0))],
    ['出单数', escapeHtml(String(row?.order_count ?? 0))],
    ['退款数', escapeHtml(String(row?.refund_count ?? 0))],
    ['寄样日期', renderCollaboratedSampleDateDetail(row)],
  ];

  return fields
    .map(
      ([label, val]) =>
        `<div class="erp-detail-label">${label}</div><div class="erp-detail-value">${val}</div>`
    )
    .join('');
}

const INFLUENCER_AUDIT_DETAIL_FIELDS = [
  { key: 'influencer_id', label: '达人id' },
  { key: 'assignee', label: '负责人' },
  { key: 'tags', label: '标签' },
  { key: 'influencer_sample', label: '达人寄样', type: 'influencer_sample' },
];

const AUDIT_APPLICATION_TABLE_COLUMNS = [
  { key: 'application_id', label: '申请ID', className: 'cell-app-id' },
  { key: 'update_time', label: '达秘更新时间', type: 'update_time' },
  { key: 'model', label: '型号' },
  { key: 'application_sample', label: '申请寄样', type: 'application_sample' },
  { key: 'commission', label: '佣金率', type: 'percent' },
  { key: 'audit_status', label: '审核结果', type: 'audit_status' },
  { key: 'audited_by', label: '审核人', type: 'audited_by' },
  { key: 'audit_status_at', label: '审核时间', type: 'audit_time' },
  { key: 'audit_reason', label: '审核原因', className: 'cell-audit-reason' },
  { key: 'remark', label: '备注', className: 'cell-remark' },
];

function formatAuditStatusDisplay(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'Y') return '通过';
  if (text === 'N') return '拒绝';
  if (text === 'X') return '待定';
  return '待审核';
}

function resolveAuditedByDisplay(record) {
  const text = String(record?.audit_status || '').trim().toUpperCase();
  if (!text || !['Y', 'N', 'X'].includes(text)) return '-';
  return record.last_updated_by || '-';
}

function renderAuditApplicationTableCell(record, column) {
  if (column.type === 'application_sample') {
    return renderApplicationSampleDateCell(record);
  }
  if (column.type === 'audit_status') {
    return escapeHtml(record.audit_status_label || formatAuditStatusDisplay(record.audit_status));
  }
  if (column.type === 'audited_by') {
    return escapeHtml(record.audited_by || resolveAuditedByDisplay(record));
  }
  if (column.type === 'update_time') {
    return escapeHtml(formatDateTime(record.update_time) || '-');
  }
  if (column.type === 'audit_time') {
    return escapeHtml(formatImportTimeValue(record.audit_status_at) || '-');
  }
  if (column.type === 'percent') {
    return escapeHtml(formatPercent(record[column.key]) || '-');
  }
  if (column.key === 'model') {
    const display = buildShopModelDisplay(record.shop_name, record.model);
    return escapeHtml(display || '-');
  }
  return escapeHtml(record[column.key] || '-');
}

function renderAuditApplicationsTableHtml(recordsOrApps, { emptyText = '暂无申请' } = {}) {
  const list = Array.isArray(recordsOrApps) ? recordsOrApps : recordsOrApps ? [recordsOrApps] : [];
  if (!list.length) {
    return `<div class="erp-meta">${escapeHtml(emptyText)}</div>`;
  }
  const headHtml = AUDIT_APPLICATION_TABLE_COLUMNS.map(
    (column) => `<th${column.className ? ` class="${column.className}"` : ''}>${column.label}</th>`
  ).join('');
  const bodyHtml = list
    .map(
      (record) => `
        <tr>
          ${AUDIT_APPLICATION_TABLE_COLUMNS.map((column) => {
            const cls = column.className ? ` class="${column.className}"` : '';
            return `<td${cls}>${renderAuditApplicationTableCell(record, column)}</td>`;
          }).join('')}
        </tr>
      `
    )
    .join('');
  return `
    <div class="erp-audit-apps-wrap">
      <table class="erp-table erp-audit-apps-table">
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function renderAuditSharedDetailHtml(record, renameLogs = []) {
  return INFLUENCER_AUDIT_DETAIL_FIELDS.map((field) => {
    let val;
    if (field.type === 'influencer_sample') {
      val = renderInfluencerSampleDateCell(record);
    } else if (field.key === 'tags') {
      val = renderTagsDisplayReadonly(record[field.key]);
    } else if (field.key === 'influencer_id') {
      val = renderInfluencerIdEditSectionHtml(record[field.key], renameLogs);
    } else if (field.type === 'link') {
      val = renderInfluencerLink(record[field.key]);
    } else if (field.key === 'assignee') {
      val =
        record.assignee_conflict && record.assignee_names?.length
          ? `<span class="assignee-conflict" title="${escapeAttr(record.assignee_names.join('、'))}">${escapeHtml(record.assignee || '冲突')}</span>`
          : escapeHtml(record[field.key] || '-');
    } else {
      val = escapeHtml(record[field.key] || '-');
    }
    return `<div class="erp-detail-label">${field.label}</div><div class="erp-detail-value">${val}</div>`;
  }).join('');
}

function renderInfluencerAuditDetailHtml(records, renameLogs = []) {
  const list = Array.isArray(records) ? records : records ? [records] : [];
  if (!list.length) {
    return '<div class="erp-empty" style="grid-column:1/-1;">暂无审核记录</div>';
  }
  const sharedHtml = `
    <div class="erp-detail-section-title">达人概况</div>
    <div class="erp-detail-grid erp-detail-shared-grid">${renderAuditSharedDetailHtml(list[0], renameLogs)}</div>
  `;
  const tableHtml = `
    <div class="erp-detail-section-title">申请信息（${list.length} 条）</div>
    ${renderAuditApplicationsTableHtml(list)}
  `;
  return `${sharedHtml}${tableHtml}`;
}

function renderFollowUpPanel(influencerId, items, options = {}) {
  const canDelete = !!options.canDelete;
  const listHtml = items.length
    ? items
        .map(
          (item) => `
        <div class="erp-follow-up-item">
          <div class="erp-follow-up-item-head">
            <div class="erp-follow-up-meta">${escapeHtml(formatDateTime(item.created_at))} · ${escapeHtml(item.created_by || '未知')}</div>
            ${canDelete ? `<button type="button" class="erp-btn erp-btn-danger erp-btn-sm follow-up-delete-btn" data-id="${item.id}" data-influencer-id="${escapeAttr(influencerId)}">删除</button>` : ''}
          </div>
          <div class="erp-follow-up-content">${escapeHtml(item.content || '')}</div>
        </div>
      `
        )
        .join('')
    : '<div class="erp-meta">暂无跟进记录</div>';
  return `
    <div class="erp-follow-up-list">${listHtml}</div>
    <div class="erp-follow-up-form">
      <label class="erp-detail-label">添加跟进记录</label>
      <textarea id="followUpInput" class="erp-input" rows="3" placeholder="输入跟进内容"></textarea>
      <div class="erp-follow-up-actions">
        <button type="button" id="followUpSubmitBtn" class="erp-btn erp-btn-primary" data-influencer-id="${escapeAttr(influencerId)}">添加</button>
      </div>
    </div>
  `;
}

async function loadAndRenderFollowUps(influencerId) {
  const el = document.getElementById('detailFollowUpContent');
  if (!el) return;
  el.innerHTML = '<div class="erp-empty">加载中...</div>';
  const id = String(influencerId || '').trim();
  if (!id) {
    el.innerHTML = '<div class="erp-empty">暂无达人信息</div>';
    return;
  }
  const { res, data } = await api(`/api/influencer-profiles/${encodeURIComponent(id)}/follow-ups`);
  if (!res.ok) {
    el.innerHTML = `<div class="erp-empty">${escapeHtml(data.message || '加载失败')}</div>`;
    return;
  }
  el.innerHTML = renderFollowUpPanel(id, data.data || [], { canDelete: isManager() });
}

let influencerDetailModalBound = false;

function switchInfluencerDetailTab(tab) {
  document.querySelectorAll('#influencerDetailTabs .erp-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('detailAuditContent')?.classList.toggle('hidden', tab !== 'audit');
  document.getElementById('detailCollabContent')?.classList.toggle('hidden', tab !== 'collab');
  document.getElementById('detailFollowUpContent')?.classList.toggle('hidden', tab !== 'followup');
}

function bindInfluencerDetailModal() {
  if (influencerDetailModalBound) return;
  influencerDetailModalBound = true;

  document.getElementById('detailCloseBtn')?.addEventListener('click', () => {
    document.getElementById('detailModal')?.classList.add('hidden');
  });
  document.getElementById('detailModal')?.addEventListener('click', async (e) => {
    if (e.target.id === 'detailModal') {
      e.target.classList.add('hidden');
      return;
    }
    const saveBtn = e.target.closest('.save-influencer-id-btn');
    if (saveBtn) {
      e.preventDefault();
      await saveInfluencerIdFromDetail(saveBtn);
      return;
    }
    const editBtn = e.target.closest('.edit-influencer-id-btn');
    if (editBtn) {
      e.preventDefault();
      enterInfluencerIdEditMode(editBtn.closest('.erp-influencer-id-edit'));
      return;
    }
    const cancelBtn = e.target.closest('.cancel-influencer-id-btn');
    if (cancelBtn) {
      e.preventDefault();
      exitInfluencerIdEditMode(cancelBtn.closest('.erp-influencer-id-edit'));
    }
  });
  document.getElementById('influencerDetailTabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.erp-tab');
    if (!tab) return;
    switchInfluencerDetailTab(tab.dataset.tab);
  });
  document.getElementById('detailModal')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('.erp-influencer-id-input');
    if (!input) return;
    e.preventDefault();
    input.closest('.erp-influencer-id-edit')?.querySelector('.save-influencer-id-btn')?.click();
  });
  document.getElementById('detailFollowUpContent')?.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.follow-up-delete-btn');
    if (deleteBtn) {
      if (!isManager()) return;
      const followUpId = deleteBtn.dataset.id;
      const influencerId = deleteBtn.dataset.influencerId;
      if (!followUpId || !influencerId) return;
      if (!confirm('确定要删除这条跟进记录吗？')) return;
      deleteBtn.disabled = true;
      try {
        const { res, data } = await api(
          `/api/influencer-profiles/${encodeURIComponent(influencerId)}/follow-ups/${followUpId}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error(data.message || '删除失败');
        await loadAndRenderFollowUps(influencerId);
        if (typeof window.onInfluencerFollowUpChanged === 'function') {
          window.onInfluencerFollowUpChanged(influencerId, data.data || []);
        }
      } catch (err) {
        alert(err.message || '删除跟进记录失败');
      } finally {
        deleteBtn.disabled = false;
      }
      return;
    }

    const btn = e.target.closest('#followUpSubmitBtn');
    if (!btn || btn.disabled) return;
    const influencerId = btn.dataset.influencerId;
    const input = document.getElementById('followUpInput');
    const content = input?.value.trim() || '';
    if (!content) return alert('请输入跟进内容');
    btn.disabled = true;
    try {
      const { res, data } = await api(`/api/influencer-profiles/${encodeURIComponent(influencerId)}/follow-ups`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(data.message || '添加失败');
      await loadAndRenderFollowUps(influencerId);
      if (typeof window.onInfluencerFollowUpChanged === 'function') {
        window.onInfluencerFollowUpChanged(influencerId, data.data || []);
      }
    } catch (err) {
      alert(err.message || '添加跟进记录失败');
    } finally {
      btn.disabled = false;
    }
  });
}

async function fetchAuditRecordsForDetail({ recordId, influencerId }) {
  let resolvedId = String(influencerId || '').trim();
  if (recordId) {
    const { res, data } = await api(`/api/records/${recordId}`);
    if (res.ok && data.data?.influencer_id) {
      resolvedId = String(data.data.influencer_id).trim();
    }
  }
  if (!resolvedId) return [];
  const { res, data } = await api(`/api/influencer-records/${encodeURIComponent(resolvedId)}`);
  if (!res.ok) throw new Error(data.message || '加载审核信息失败');
  return data.data || [];
}

async function fetchCollabRowForDetail(influencerId) {
  const id = String(influencerId || '').trim();
  if (!id) return null;
  const params = new URLSearchParams({
    influencer_id: id,
    collab_tab: 'all',
    pageSize: '1',
  });
  const { res, data } = await api(`/api/collaborated-stats?${params.toString()}`);
  if (!res.ok || !Array.isArray(data.data) || !data.data.length) {
    return {
      influencer_id: id,
      video_count: 0,
      order_count: 0,
      refund_count: 0,
      assignee: '',
      fulfillment_progress: '',
      influencer_remark: '',
      tags: '',
      sample_date: '',
    };
  }
  return data.data[0];
}

function setInfluencerDetailStatus(statusEl, message, hidden = false) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.toggle('hidden', hidden || !message);
}

async function fetchInfluencerIdRenameLogs(influencerId) {
  const id = String(influencerId || '').trim();
  if (!id) return [];
  const { res, data } = await api(`/api/influencer-profiles/${encodeURIComponent(id)}/rename-logs`);
  if (!res.ok) return [];
  return data.data || [];
}

async function loadInfluencerDetailContent({
  recordId = null,
  influencerId = '',
  enableFollowUp = false,
  collabRow = null,
} = {}) {
  const modal = document.getElementById('detailModal');
  const auditEl = document.getElementById('detailAuditContent');
  const collabEl = document.getElementById('detailCollabContent');
  const followUpEl = document.getElementById('detailFollowUpContent');
  if (!modal || !auditEl || !collabEl) return influencerId;

  auditEl.innerHTML = '<div class="erp-empty" style="grid-column:1/-1;">加载中...</div>';
  collabEl.innerHTML = '<div class="erp-empty" style="grid-column:1/-1;">加载中...</div>';
  if (followUpEl && enableFollowUp) {
    followUpEl.innerHTML = '<div class="erp-empty">加载中...</div>';
  }

  let resolvedInfluencerId = String(influencerId || '').trim();
  const auditRecords = await fetchAuditRecordsForDetail({ recordId, influencerId: resolvedInfluencerId });
  if (auditRecords[0]?.influencer_id) {
    resolvedInfluencerId = String(auditRecords[0].influencer_id).trim();
  }
  const renameLogs = await fetchInfluencerIdRenameLogs(resolvedInfluencerId);
  auditEl.innerHTML = renderInfluencerAuditDetailHtml(auditRecords, renameLogs);

  const collab =
    collabRow && String(collabRow.influencer_id || '').trim()
      ? { ...collabRow, influencer_id: resolvedInfluencerId }
      : await fetchCollabRowForDetail(resolvedInfluencerId);
  if (collab) collab.influencer_id = resolvedInfluencerId;
  collabEl.innerHTML = renderInfluencerCollabDetailHtml(collab, renameLogs);

  if (enableFollowUp && followUpEl) {
    await loadAndRenderFollowUps(resolvedInfluencerId);
  }

  modal.dataset.influencerId = resolvedInfluencerId;
  return resolvedInfluencerId;
}

async function saveInfluencerIdFromDetail(button) {
  const wrap = button?.closest('.erp-influencer-id-edit');
  const input = wrap?.querySelector('.erp-influencer-id-input');
  const statusEl = wrap?.querySelector('.save-status');
  const modal = document.getElementById('detailModal');
  const oldId = String(input?.dataset.originalId || modal?.dataset.influencerId || '').trim();
  const newId = String(input?.value || '').trim();
  if (!input || !oldId) return;
  if (!newId) return alert('请输入新的达人 id');
  if (newId === oldId) {
    exitInfluencerIdEditMode(wrap);
    return;
  }

  if (!confirm(`确定将达人 id 从「${oldId}」修改为「${newId}」吗？\n相关审核、合作、寄样、联盟订单等数据将一并更新。`)) {
    return;
  }

  button.disabled = true;
  input.disabled = true;
  setInfluencerDetailStatus(statusEl, '保存中...');
  try {
    const { res, data } = await api(`/api/influencer-profiles/${encodeURIComponent(oldId)}/rename`, {
      method: 'POST',
      body: JSON.stringify({ new_influencer_id: newId }),
    });
    if (!res.ok) throw new Error(data.message || '修改达人 id 失败');

    const context = modal?.__detailContext || {};
    context.influencerId = data.new_influencer_id;
    if (context.collabRow) {
      context.collabRow = { ...context.collabRow, influencer_id: data.new_influencer_id };
    }
    modal.__detailContext = context;

    document.querySelectorAll('.erp-influencer-id-input').forEach((field) => {
      field.value = data.new_influencer_id;
      field.dataset.originalId = data.new_influencer_id;
    });
    modal.dataset.influencerId = data.new_influencer_id;

    await loadInfluencerDetailContent({
      recordId: context.recordId || null,
      influencerId: data.new_influencer_id,
      enableFollowUp: !!context.enableFollowUp,
      collabRow: context.collabRow || null,
    });

    setInfluencerDetailStatus(statusEl, '已保存');
    window.setTimeout(() => setInfluencerDetailStatus(statusEl, '', true), 1800);
    if (typeof window.onInfluencerIdRenamed === 'function') {
      window.onInfluencerIdRenamed(data.old_influencer_id, data.new_influencer_id);
    }
  } catch (err) {
    setInfluencerDetailStatus(statusEl, err.message || '保存失败');
    alert(err.message || '修改达人 id 失败');
  } finally {
    button.disabled = false;
    input.disabled = false;
  }
}

async function showInfluencerDetailModal({
  recordId = null,
  influencerId = '',
  defaultTab = 'audit',
  collabRow = null,
  enableFollowUp = false,
} = {}) {
  bindInfluencerDetailModal();

  const modal = document.getElementById('detailModal');
  const auditEl = document.getElementById('detailAuditContent');
  const collabEl = document.getElementById('detailCollabContent');
  const followUpEl = document.getElementById('detailFollowUpContent');
  if (!modal || !auditEl || !collabEl) return;

  const resolvedDefaultTab =
    defaultTab === 'followup' && enableFollowUp
      ? 'followup'
      : defaultTab === 'collab'
        ? 'collab'
        : 'audit';
  switchInfluencerDetailTab(resolvedDefaultTab);
  auditEl.innerHTML = '<div class="erp-empty" style="grid-column:1/-1;">加载中...</div>';
  collabEl.innerHTML = '<div class="erp-empty" style="grid-column:1/-1;">加载中...</div>';
  if (followUpEl) {
    followUpEl.innerHTML = enableFollowUp
      ? '<div class="erp-empty">加载中...</div>'
      : '<div class="erp-empty">跟进记录仅在已合作列表可用</div>';
  }
  modal.classList.remove('hidden');
  modal.__detailContext = {
    recordId,
    influencerId: String(influencerId || '').trim(),
    enableFollowUp: !!enableFollowUp,
    collabRow: collabRow && typeof collabRow === 'object' ? { ...collabRow } : null,
  };

  try {
    const resolvedInfluencerId = await loadInfluencerDetailContent({
      recordId,
      influencerId,
      enableFollowUp,
      collabRow,
    });
    modal.__detailContext.influencerId = resolvedInfluencerId;
  } catch (err) {
    auditEl.innerHTML = '<div class="erp-empty" style="grid-column:1/-1;">加载失败</div>';
    collabEl.innerHTML = '<div class="erp-empty" style="grid-column:1/-1;">加载失败</div>';
    if (followUpEl && enableFollowUp) {
      followUpEl.innerHTML = '<div class="erp-empty">加载失败</div>';
    }
    alert(err.message || '加载达人详情失败');
  }
}
