const {
  isAllowedTikTokUrl,
  isAllowedProxyUrl,
  fetchTikTokHtmlServerSide,
} = require('./tiktokFetch');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const {
  buildSampleOrderImportData,
  buildAllianceOrderImportData,
  buildRecordImportData,
  SAMPLE_ORDER_COLUMNS,
  ALLIANCE_ORDER_COLUMNS,
  RECORD_IMPORT_COLUMNS,
} = require('./public/js/order-columns.js');
const {
  initDatabase,
  normalizeCommissionRate,
  sanitizeCommission,
  findExistingRecord,
  insertRecord,
  getRecords,
  getAllRecordsForExport,
  getDistinctCommissionRates,
  getCommissionFilterOptions,
  getTagFilterOptions,
  getAssigneeFilterOptions,
  getImportBatchFilterOptions,
  getImportedByFilterOptions,
  getShopNameFilterOptions,
  getAllSkuModels,
  getSkuModelLookupMap,
  getSkuModelById,
  insertSkuModel,
  updateSkuModel,
  deleteSkuModel,
  normalizeTagsValue,
  getAuditTabCounts,
  getRecordById,
  getRecordsByInfluencerId,
  getInfluencerFollowUps,
  insertInfluencerFollowUp,
  deleteInfluencerFollowUp,
  batchScrapeInfluencerEmails,
  batchSaveInfluencerEmails,
  filterInfluencerIdsNeedingEmailScrape,
  getRecordIdsByFilters,
  getInfluencerIdsFromRecordIds,
  getInfluencerIdsByRecordFilters,
  batchDistributeAssigneesByInfluencer,
  batchDistributeAssigneesByRecordIds,
  canStaffAccessInfluencerAssignee,
  batchDeleteRecords,
  batchUpdateAssignee,
  updateRecordFields,
  findStaffByName,
  findStaffById,
  findStaffByCommissionRate,
  getAllStaff,
  insertStaff,
  updateStaff,
  deleteStaff,
  updateStaffPassword,
  getArticles,
  getArticleById,
  insertArticle,
  updateArticle,
  deleteArticle,
  getLastSampleOrderImport,
  getSampleOrderById,
  getSampleOrderPageNumber,
  getSampleOrders,
  getSampleOrderImportTimeOptions,
  getSampleOrderIdsByFilters,
  batchDeleteSampleOrders,
  getLastAllianceOrderImport,
  importAllianceOrdersBatch,
  importSampleOrdersBatch,
  getAllianceOrderById,
  getAllianceOrderPageNumber,
  getAllianceOrders,
  getAllianceOrderImportTimeOptions,
  getAllianceOrderIdsByFilters,
  batchDeleteAllianceOrders,
  getCollaboratedStats,
  getCollaboratedRowsForExport,
  getCollaboratedMonthlyStats,
  getCollaboratedInfluencerIdsByFilters,
  getCollaboratedFilterOptions,
  getAssigneeStats,
  getSampleShipmentStats,
  updateInfluencerProfileTags,
  batchUpdateInfluencerTags,
  updateInfluencerProfileInfluencerRemark,
  updateInfluencerProfileFulfillment,
  renameInfluencerId,
  getInfluencerIdRenameLogs,
  resolveCanonicalInfluencerId,
  toggleInfluencerProfilePin,
  batchUpdateInfluencerAssignees,
  updateInfluencerProfileEmail,
  FULFILLMENT_PROGRESS_OPTIONS,
  formatBeijingDateTime,
  getStaffMailSettingsPublic,
  getStaffMailSettingsForSend,
  updateStaffMailSettings,
  getCollaboratedRowsByInfluencerIds,
  buildCollaboratedEmailVars,
  sendCollaboratedBatchEmails,
  sendPendingAuditBatchEmails,
  getEmailBatches,
  getEmailBatchDetail,
  MAX_BATCH_EMAIL_COUNT,
} = require('./db');
const { sendStaffEmail, SMTP_PROVIDER_PRESETS } = require('./mailService');
const {
  verifyPassword,
  createSession,
  destroySession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireManager,
  isManager,
  SESSION_COOKIE,
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
const wikiImagesDir = path.join(__dirname, 'public', 'uploads', 'wiki');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(wikiImagesDir)) fs.mkdirSync(wikiImagesDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    },
  }),
  fileFilter: (req, file, cb) => {
    cb(null, isAllowedImportExtension(file.originalname));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_IMPORT_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

function isAllowedImportExtension(filename) {
  return ALLOWED_IMPORT_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

const wikiImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, wikiImagesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const ok = allowedExt.includes(ext) || /^image\//i.test(file.mimetype || '');
    cb(null, ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const IMPORT_COLUMNS = RECORD_IMPORT_COLUMNS.map((column) => column.key);

const EXPORT_HEADERS = [
  { key: 'influencer_id', label: '达人id' },
  { key: 'assignee', label: '负责人' },
  { key: 'follower_count', label: '粉丝数' },
  { key: 'expected_publish_rate', label: '预计发布率' },
  { key: 'transaction_amount', label: '成交金额' },
  { key: 'avg_video_views', label: '平均视频播放量' },
  { key: 'model', label: '型号' },
  { key: 'product_title', label: '商品标题' },
  { key: 'product_id', label: '商品id' },
  { key: 'sku_id', label: 'skuID' },
  { key: 'commission', label: '佣金率' },
  { key: 'application_id', label: '申请ID' },
  { key: 'update_time', label: '更新时间' },
  { key: 'audit_status', label: '审核' },
  { key: 'audit_reason', label: '审核原因' },
  { key: 'tags', label: '标签' },
  { key: 'remark', label: '备注' },
  { key: 'create_time', label: '导入时间' },
];

const COLLABORATED_EXPORT_HEADERS = [
  { key: 'influencer_id', label: '达人id' },
  { key: 'fulfillment_progress', label: '履约进展' },
  { key: 'tags', label: '标签' },
  { key: 'assignee', label: '负责人' },
  { key: 'video_count', label: '出单视频数' },
  { key: 'order_count', label: '出单数' },
  { key: 'refund_count', label: '退款数' },
  { key: 'influencer_remark', label: '达人备注' },
  { key: 'sample_date', label: '寄样日期' },
  { key: 'follow_up_count', label: '跟进记录数' },
  { key: 'latest_follow_up', label: '最近跟进' },
];

app.use(express.json({ limit: '5mb' }));

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth/login') || req.path === '/login.html' || req.path.startsWith('/js/') || req.path === '/styles.css') {
    return next();
  }
  if (req.path.endsWith('.html') || req.path === '/' || req.path === '/index.html') {
    const cookies = parseCookies(req.headers.cookie);
    const { getSession } = require('./auth');
    if (!getSession(cookies[SESSION_COOKIE])) {
      return res.redirect('/login.html');
    }
  }
  next();
});

app.use((req, res, next) => {
  if (/\.(html?|js|css)$/i.test(req.path) || req.path === '/styles.css' || req.path.startsWith('/js/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.get('/influencers-collaborated.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'influencers-collaborated.html'));
});

app.get('/email-history.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'email-history.html'));
});

app.get('/api/tiktok-fetch-proxy', requireAuth, async (req, res) => {
  const target = toCellValue(req.query.url);
  const proxy = toCellValue(req.query.proxy);
  if (!target || !isAllowedTikTokUrl(target)) {
    return res.status(400).json({ success: false, error: '非法 TikTok 地址' });
  }
  if (proxy && !isAllowedProxyUrl(proxy)) {
    return res.status(400).json({ success: false, error: '仅允许本地或局域网代理地址' });
  }
  try {
    const html = await fetchTikTokHtmlServerSide(target, proxy);
    res.type('text/plain; charset=utf-8').send(html);
  } catch (err) {
    res.status(502).json({ success: false, error: err.message || '无法访问 TikTok' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/influencers.html'));

function toCellValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function scoreSpreadsheetDataRows(rows) {
  const sample = rows[1] || rows[0] || [];
  return sample.filter((cell) => String(cell ?? '').trim() !== '').length;
}

function readSpreadsheetRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.csv') {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  }

  const buf = fs.readFileSync(filePath);
  const attempts = [
    () => XLSX.read(buf, { type: 'buffer', raw: false }),
    () => {
      const iconv = require('iconv-lite');
      const text = iconv.decode(buf, 'gbk');
      return XLSX.read(text, { type: 'string', raw: false });
    },
  ];

  let bestRows = [];
  let bestScore = -1;
  for (const attempt of attempts) {
    try {
      const workbook = attempt();
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      const score = scoreSpreadsheetDataRows(rows);
      if (score > bestScore) {
        bestScore = score;
        bestRows = rows;
      }
    } catch {
      // try next encoding
    }
  }

  if (bestRows.length) return bestRows;
  const workbook = XLSX.read(buf, { type: 'buffer', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function parseFile(filePath) {
  const rows = readSpreadsheetRows(filePath);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map((row) => buildRecordImportData(row))
    .filter((item) => item.application_id && String(item.application_id).trim());
}

function parseSampleOrderFile(filePath) {
  const rows = readSpreadsheetRows(filePath);
  if (rows.length < 2) return { rows: [] };
  const parsedRows = rows
    .slice(1)
    .map((row) => {
      const data = buildSampleOrderImportData(row);
      const uniqueKey = toCellValue(data.unique_key) || toCellValue(data.order_id);
      return { unique_key: uniqueKey, data };
    })
    .filter((item) => item.unique_key);
  return { rows: parsedRows };
}

function parseAllianceOrderFile(filePath) {
  const rows = readSpreadsheetRows(filePath);
  if (rows.length < 2) return { rows: [] };
  const parsedRows = rows
    .slice(1)
    .map((row) => {
      const data = buildAllianceOrderImportData(row);
      const uniqueKey = toCellValue(data.order_id);
      return { unique_key: uniqueKey, data };
    })
    .filter((item) => item.unique_key);
  return { rows: parsedRows };
}

function formatRateValue(value) {
  const text = toCellValue(value);
  if (!text) return '';
  const num = Number(text.replace('%', ''));
  if (!Number.isNaN(num) && num === 0) return '';
  if (!Number.isNaN(num) && num > 0 && num <= 1 && !text.includes('%')) {
    return `${(num * 100).toFixed(2)}%`;
  }
  if (!text.includes('%') && !Number.isNaN(num)) return `${num.toFixed(2)}%`;
  return text;
}

const RECORD_FIELD_LABELS = {
  audit_status: '审核',
  audit_reason: '审核原因',
  remark: '备注',
  tags: '标签',
};

function buildRecordUpdateContent(record, changes) {
  return Object.entries(changes)
    .map(([field, newValue]) => {
      const label = RECORD_FIELD_LABELS[field] || field;
      const oldValue = record[field] || '(空)';
      const nextValue = newValue || '(空)';
      return `${label}：${oldValue} → ${nextValue}`;
    })
    .join('；');
}

function formatImportedValue(field, value) {
  if (value === null || value === undefined || value === '') return '';
  if (field === 'commission') return sanitizeCommission(formatRateValue(value));
  if (field === 'expected_publish_rate') return formatRateValue(value);
  if (field === 'update_time') {
    const text = toCellValue(value);
    if (/^\d+(\.\d+)?$/.test(text)) {
      const serial = Number(text);
      if (serial > 30000 && serial < 60000) {
        const epoch = new Date(1899, 11, 30);
        return new Date(epoch.getTime() + serial * 86400000).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          hour12: false,
        });
      }
    }
    return text;
  }
  return toCellValue(value);
}

function buildRecordFilters(query, user) {
  const auditTab = toCellValue(query.audit_tab) || 'pending';
  const validTabs = ['all', 'pending', 'tentative', 'approved', 'rejected'];
  const validSortFields = ['import_batch_time', 'influencer_id', 'commission'];
  const sortField = toCellValue(query.sort_field);
  const sortOrder = toCellValue(query.sort_order);
  const sortCommission = toCellValue(query.sort_commission);
  let resolvedSortField = validSortFields.includes(sortField) ? sortField : 'import_batch_time';
  let resolvedSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
  if (!sortField && ['asc', 'desc'].includes(sortCommission)) {
    resolvedSortField = 'commission';
    resolvedSortOrder = sortCommission;
  }
  const filters = {
    influencer_id: toCellValue(query.influencer_id),
    commission: toCellValue(query.commission),
    tags: toCellValue(query.tags),
    assignee_filter: toCellValue(query.assignee),
    import_batch: toCellValue(query.import_batch),
    imported_by: toCellValue(query.imported_by),
    shop_name: toCellValue(query.shop_name),
    audit_tab: validTabs.includes(auditTab) ? auditTab : 'pending',
    sort_field: resolvedSortField,
    sort_order: resolvedSortOrder,
    apply_pin: toCellValue(query.apply_pin) === '0' ? 0 : 1,
    has_sample_date: toCellValue(query.has_sample_date) === '1',
    sample_date_from: toCellValue(query.sample_date_from),
    sample_date_to: toCellValue(query.sample_date_to),
    audit_date_from: toCellValue(query.audit_date_from),
    audit_date_to: toCellValue(query.audit_date_to),
    page: Math.max(1, parseInt(query.page, 10) || 1),
    pageSize: Math.min(200, Math.max(1, parseInt(query.pageSize, 10) || 50)),
  };
  if (!isManager(user)) {
    filters.scope_assignee = user.name;
  }
  return filters;
}

function filterAccessibleInfluencerIds(influencerIds, user) {
  const uniqueIds = [...new Set((influencerIds || []).map((id) => toCellValue(id)).filter(Boolean))];
  if (isManager(user)) return uniqueIds;
  return uniqueIds.filter((id) => canStaffAccessInfluencerAssignee(id, user.name));
}

async function handleBatchTagsRequest(req, res, { resolveInfluencerIds }) {
  const mode = ['replace', 'add', 'remove'].includes(req.body?.mode) ? req.body.mode : 'replace';
  const tags = toCellValue(req.body?.tags);
  const scope = req.body?.scope === 'all' ? 'all' : 'page';

  if (mode === 'add' && !String(tags || '').trim()) {
    return res.status(400).json({ success: false, message: '请输入要追加的标签' });
  }
  if (mode === 'remove' && !String(tags || '').trim()) {
    return res.status(400).json({ success: false, message: '请输入要移除的标签' });
  }

  try {
    const influencerIds = await resolveInfluencerIds(scope, req);
    const allowedIds = filterAccessibleInfluencerIds(influencerIds, req.user);
    if (!allowedIds.length) {
      return res.status(400).json({ success: false, message: '没有可设置标签的达人' });
    }
    const updated = await batchUpdateInfluencerTags(allowedIds, tags, mode, req.user.name);
    res.json({ success: true, updated, mode, tags: normalizeTagsValue(tags) });
  } catch (err) {
    console.error('批量设置标签失败:', err);
    res.status(500).json({ success: false, message: '批量设置标签失败' });
  }
}

function buildCollaboratedFilters(query, user) {
  const validSortFields = ['video_count', 'order_count', 'refund_count', 'sample_date'];
  const validTabs = ['all', 'recent_sample', 'ordered', 'no_order'];
  const validSampleDateFilters = ['__empty__', 'has', 'recent_15d', 'older_15d'];
  const sortField = toCellValue(query.sort_field);
  const sortOrder = toCellValue(query.sort_order);
  const collabTab = toCellValue(query.collab_tab) || 'all';
  const fulfillmentProgress = toCellValue(query.fulfillment_progress);
  const sampleDateFilter = toCellValue(query.sample_date);
  const filters = {
    influencer_id: toCellValue(query.influencer_id),
    tags: toCellValue(query.tags),
    assignee_filter: toCellValue(query.assignee),
    collab_tab: validTabs.includes(collabTab) ? collabTab : 'all',
    sort_field: validSortFields.includes(sortField) ? sortField : 'order_count',
    sort_order: sortOrder === 'asc' ? 'asc' : 'desc',
    apply_pin: toCellValue(query.apply_pin) === '0' ? 0 : 1,
    page: Math.max(1, parseInt(query.page, 10) || 1),
    pageSize: Math.min(200, Math.max(1, parseInt(query.pageSize, 10) || 50)),
  };
  if (
    fulfillmentProgress === '__empty__' ||
    FULFILLMENT_PROGRESS_OPTIONS.includes(fulfillmentProgress)
  ) {
    filters.fulfillment_progress = fulfillmentProgress;
  }
  if (validSampleDateFilters.includes(sampleDateFilter)) {
    filters.sample_date_filter = sampleDateFilter;
  }
  filters.sample_date_from = toCellValue(query.sample_date_from);
  filters.sample_date_to = toCellValue(query.sample_date_to);
  filters.ordered_after_sample = toCellValue(query.ordered_after_sample) === '1';
  if (!isManager(user)) {
    filters.scope_assignee = user.name;
  }
  return filters;
}

async function resolveScrapeEmailInfluencerIds(body, user) {
  const source = body?.source === 'collaborated' ? 'collaborated' : 'records';
  const scope = body?.scope === 'all' ? 'all' : 'page';
  let influencerIds = [];
  if (scope === 'all') {
    if (source === 'collaborated') {
      const filters = buildCollaboratedFilters(body?.filters || {}, user);
      delete filters.page;
      delete filters.pageSize;
      influencerIds = await getCollaboratedInfluencerIdsByFilters(filters);
    } else {
      const filters = buildRecordFilters(body?.filters || {}, user);
      delete filters.page;
      delete filters.pageSize;
      influencerIds = await getInfluencerIdsByRecordFilters(filters);
    }
  } else if (Array.isArray(body?.influencer_ids) && body.influencer_ids.length) {
    influencerIds = body.influencer_ids.map((id) => toCellValue(id)).filter(Boolean);
  } else if (Array.isArray(body?.record_ids) && body.record_ids.length) {
    influencerIds = await getInfluencerIdsFromRecordIds(
      body.record_ids.map((id) => Number(id)).filter(Boolean)
    );
  }

  influencerIds = [...new Set(influencerIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!influencerIds.length) return [];

  if (!isManager(user)) {
    influencerIds = influencerIds.filter((id) => canStaffAccessInfluencerAssignee(id, user.name));
  }
  return influencerIds;
}

// Auth
app.post('/api/auth/login', async (req, res) => {
  const name = toCellValue(req.body?.name);
  const password = toCellValue(req.body?.password);
  if (!name || !password) {
    return res.status(400).json({ success: false, message: '请输入账号和密码' });
  }
  try {
    const staff = await findStaffByName(name);
    if (!staff) {
      return res.status(401).json({ success: false, message: '该用户未注册，请联系主管进行注册' });
    }
    if (!verifyPassword(password, staff.password_hash)) {
      return res.status(401).json({ success: false, message: '登录密码错误' });
    }
    const token = createSession(staff);
    setSessionCookie(res, token);
    res.json({
      success: true,
      user: { id: staff.id, name: staff.name, role: staff.role },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  destroySession(cookies[SESSION_COOKIE]);
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const { getSession } = require('./auth');
  const session = getSession(cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ success: false, message: '未登录' });
  res.json({ success: true, user: session.user });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const oldPassword = toCellValue(req.body?.old_password);
  const newPassword = toCellValue(req.body?.new_password);
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: '请填写原密码和新密码' });
  }
  try {
    const staff = await findStaffById(req.user.id);
    if (!staff || !verifyPassword(oldPassword, staff.password_hash)) {
      return res.status(400).json({ success: false, message: '原密码错误' });
    }
    await updateStaffPassword(req.user.id, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: '修改密码失败' });
  }
});

// Wiki
app.get('/api/articles', requireAuth, async (req, res) => {
  try {
    const articles = await getArticles();
    res.json({ success: true, data: articles });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取文章列表失败' });
  }
});

app.get('/api/articles/:id', requireAuth, async (req, res) => {
  try {
    const article = await getArticleById(Number(req.params.id));
    if (!article) return res.status(404).json({ success: false, message: '文章不存在' });
    res.json({ success: true, data: article });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取文章失败' });
  }
});

app.post('/api/articles', requireAuth, async (req, res) => {
  const title = toCellValue(req.body?.title);
  const content = req.body?.content || '';
  if (!title) return res.status(400).json({ success: false, message: '标题不能为空' });
  try {
    const id = await insertArticle({ title, content, author: req.user.name });
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, message: '创建文章失败' });
  }
});

app.post('/api/articles/upload-image', requireAuth, (req, res) => {
  wikiImageUpload.single('image')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 5MB' : err.message || '图片上传失败';
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传图片文件（支持 jpg/png/gif/webp）' });
    }
    const url = `/uploads/wiki/${req.file.filename}`;
    res.json({ success: true, url });
  });
});

app.put('/api/articles/:id', requireAuth, async (req, res) => {
  const title = toCellValue(req.body?.title);
  const content = req.body?.content || '';
  if (!title) return res.status(400).json({ success: false, message: '标题不能为空' });
  try {
    await updateArticle(Number(req.params.id), { title, content });
    res.json({ success: true });
  } catch (err) {
    const message = err.message === '文章不存在' ? err.message : '更新文章失败';
    res.status(err.message === '文章不存在' ? 404 : 500).json({ success: false, message });
  }
});

app.delete('/api/articles/:id', requireAuth, requireManager, async (req, res) => {
  try {
    await deleteArticle(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    const message = err.message === '文章不存在' ? err.message : '删除文章失败';
    res.status(err.message === '文章不存在' ? 404 : 500).json({ success: false, message });
  }
});

// Staff
app.get('/api/staff', requireAuth, requireManager, async (req, res) => {
  try {
    const staff = await getAllStaff();
    res.json({ success: true, data: staff });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取人员列表失败' });
  }
});

app.post('/api/staff', requireAuth, requireManager, async (req, res) => {
  const name = toCellValue(req.body?.name);
  const password = toCellValue(req.body?.password);
  const commission_rate = toCellValue(req.body?.commission_rate);
  const supervisor_id = req.body?.supervisor_id ? Number(req.body.supervisor_id) : null;
  const role = req.body?.role === 'manager' ? 'manager' : 'employee';
  if (!name || !password) {
    return res.status(400).json({ success: false, message: '姓名和密码不能为空' });
  }
  if (!commission_rate && name !== 'admin') {
    return res.status(400).json({ success: false, message: '佣金率不能为空' });
  }
  try {
    const id = await insertStaff({ name, password, commission_rate, supervisor_id, role });
    res.json({ success: true, id });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '创建人员失败' });
  }
});

app.put('/api/staff/:id', requireAuth, requireManager, async (req, res) => {
  try {
    await updateStaff(Number(req.params.id), {
      name: req.body?.name !== undefined ? toCellValue(req.body.name) : undefined,
      password: req.body?.password ? toCellValue(req.body.password) : undefined,
      commission_rate:
        req.body?.commission_rate !== undefined ? toCellValue(req.body.commission_rate) : undefined,
      supervisor_id:
        req.body?.supervisor_id !== undefined
          ? req.body.supervisor_id
            ? Number(req.body.supervisor_id)
            : null
          : undefined,
      role: req.body?.role !== undefined ? (req.body.role === 'manager' ? 'manager' : 'employee') : undefined,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '更新人员失败' });
  }
});

app.delete('/api/staff/:id', requireAuth, requireManager, async (req, res) => {
  try {
    await deleteStaff(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '删除人员失败' });
  }
});

// Records
app.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
  const filePath = req.file.path;
  let inserted = 0;
  let skipped = 0;
  const importBatchTime = formatBeijingDateTime(new Date());
  try {
    const records = parseFile(filePath);
    if (!records.length) {
      return res.status(400).json({
        success: false,
        message: '未能从文件中解析到有效数据。请确认第 10 列为申请ID且数据从第 2 行开始。',
      });
    }
    for (const record of records) {
      const applicationId = toCellValue(record.application_id);
      if (!applicationId) {
        skipped++;
        continue;
      }
      if (await findExistingRecord({ applicationId })) {
        skipped++;
        continue;
      }
      const commission = formatImportedValue('commission', record.commission);
      const assigneeStaff = await findStaffByCommissionRate(commission);
      try {
        await insertRecord({
          influencer_id: toCellValue(record.influencer_id) || applicationId,
          follower_count: formatImportedValue('follower_count', record.follower_count),
          expected_publish_rate: formatImportedValue('expected_publish_rate', record.expected_publish_rate),
          transaction_amount: formatImportedValue('transaction_amount', record.transaction_amount),
          avg_video_views: formatImportedValue('avg_video_views', record.avg_video_views),
          product_title: formatImportedValue('product_title', record.product_title),
          product_id: formatImportedValue('product_id', record.product_id),
          sku_id: formatImportedValue('sku_id', record.sku_id),
          commission,
          application_id: applicationId,
          update_time: formatImportedValue('update_time', record.update_time),
          audit_status: formatImportedValue('audit_status', record.audit_status),
          remark: formatImportedValue('remark', record.remark),
          assignee: assigneeStaff ? assigneeStaff.name : '',
          imported_by: req.user.name,
          import_batch_time: importBatchTime,
        });
        inserted++;
      } catch (err) {
        if (String(err).includes('UNIQUE')) skipped++;
        else throw err;
      }
    }
    res.json({ success: true, inserted, skipped, total: records.length });
  } catch (err) {
    console.error('导入失败:', err);
    res.status(500).json({ success: false, message: '文件解析或导入失败' });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.get('/api/records/filter-options', requireAuth, async (req, res) => {
  try {
    const filters = buildRecordFilters(req.query, req.user);
    delete filters.audit_tab;
    delete filters.sort_field;
    delete filters.sort_order;
    delete filters.page;
    delete filters.pageSize;
    delete filters.import_batch;
    delete filters.imported_by;
    delete filters.shop_name;
    if (!isManager(req.user)) {
      delete filters.assignee_filter;
    }
    const [
      { commission_rates, has_empty_commission },
      { tags, has_empty_tags },
      { assignees, has_empty_assignee, has_assignee_conflict },
      { import_batches, latest_import_batch },
      { importers, has_empty_importer },
      { shop_names, has_empty_shop_name },
    ] = await Promise.all([
      getCommissionFilterOptions(filters),
      getTagFilterOptions(filters),
      isManager(req.user)
        ? getAssigneeFilterOptions(filters)
        : Promise.resolve({ assignees: [], has_empty_assignee: false, has_assignee_conflict: false }),
      getImportBatchFilterOptions(filters),
      getImportedByFilterOptions(filters),
      getShopNameFilterOptions(filters),
    ]);
    res.json({
      success: true,
      commission_rates,
      has_empty_commission,
      tags,
      has_empty_tags,
      assignees,
      has_empty_assignee,
      has_assignee_conflict,
      import_batches,
      latest_import_batch,
      importers,
      has_empty_importer,
      shop_names,
      has_empty_shop_name,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取筛选项失败' });
  }
});

app.get('/api/records', requireAuth, async (req, res) => {
  try {
    const filters = buildRecordFilters(req.query, req.user);
    const baseFilters = { ...filters };
    delete baseFilters.audit_tab;
    delete baseFilters.sort_field;
    delete baseFilters.sort_order;
    delete baseFilters.page;
    delete baseFilters.pageSize;

    const [{ rows, total, totalInfluencers, page, pageSize }, tabCounts] = await Promise.all([
      getRecords(filters),
      getAuditTabCounts(baseFilters),
    ]);

    res.json({
      success: true,
      data: rows,
      total,
      totalInfluencers,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil((totalInfluencers || 0) / pageSize)),
      tabCounts,
      audit_tab: filters.audit_tab,
    });
  } catch (err) {
    console.error('查询失败:', err);
    res.status(500).json({ success: false, message: '获取记录列表失败' });
  }
});

app.get('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const record = await getRecordById(Number(req.params.id));
    if (!record) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(record.influencer_id, req.user.name)) {
      return res.status(403).json({ success: false, message: '无权限查看此记录' });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取记录失败' });
  }
});

app.get('/api/influencer-records/:influencerId', requireAuth, async (req, res) => {
  const influencerId = decodeURIComponent(toCellValue(req.params.influencerId));
  if (!influencerId) {
    return res.status(400).json({ success: false, message: '达人 id 不能为空' });
  }
  try {
    if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(influencerId, req.user.name)) {
      return res.status(403).json({ success: false, message: '无权限查看此达人' });
    }
    const filters = {};
    if (!isManager(req.user)) filters.scope_assignee = req.user.name;
    const rows = await getRecordsByInfluencerId(influencerId, filters);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('获取达人审核信息失败:', err);
    res.status(500).json({ success: false, message: '获取审核信息失败' });
  }
});

app.post('/api/records/batch-assign', requireAuth, requireManager, async (req, res) => {
  const assignees = Array.isArray(req.body?.assignees)
    ? req.body.assignees.map((name) => toCellValue(name)).filter(Boolean)
    : req.body?.assignee
      ? [toCellValue(req.body.assignee)]
      : [];
  const scope = req.body?.scope === 'all' ? 'all' : 'page';
  const recordIds = Array.isArray(req.body?.record_ids)
    ? req.body.record_ids.map((id) => Number(id)).filter(Boolean)
    : [];

  if (!assignees.length) {
    return res.status(400).json({ success: false, message: '请选择负责人' });
  }

  try {
    for (const assignee of assignees) {
      const staff = await findStaffByName(assignee);
      if (!staff) {
        return res.status(400).json({ success: false, message: `负责人不存在：${assignee}` });
      }
    }

    let influencerIds = [];
    if (scope === 'all') {
      const filters = buildRecordFilters(req.body?.filters || {}, req.user);
      delete filters.page;
      delete filters.pageSize;
      influencerIds = await getInfluencerIdsByRecordFilters(filters);
    } else {
      const result = await batchDistributeAssigneesByRecordIds(recordIds, assignees, req.user.name);
      return res.json({
        success: true,
        updated: result.influencers,
        records: result.records,
        assignees,
      });
    }

    if (!influencerIds.length) {
      return res.status(400).json({ success: false, message: '没有可分配的达人' });
    }

    const result = await batchDistributeAssigneesByInfluencer(influencerIds, assignees, req.user.name);
    res.json({
      success: true,
      updated: result.influencers,
      records: result.records,
      assignees,
    });
  } catch (err) {
    console.error('批量分配失败:', err);
    res.status(500).json({ success: false, message: '批量分配失败' });
  }
});

app.post('/api/records/batch-delete', requireAuth, requireManager, async (req, res) => {
  const scope = req.body?.scope === 'all' ? 'all' : 'page';
  const recordIds = Array.isArray(req.body?.record_ids)
    ? req.body.record_ids.map((id) => Number(id)).filter(Boolean)
    : [];

  try {
    let ids = [];
    if (scope === 'all') {
      const filters = buildRecordFilters(req.body?.filters || {}, req.user);
      delete filters.page;
      delete filters.pageSize;
      ids = await getRecordIdsByFilters(filters);
    } else {
      ids = recordIds;
    }

    if (!ids.length) {
      return res.status(400).json({ success: false, message: '没有可删除的记录' });
    }

    const deleted = await batchDeleteRecords(ids);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('批量删除失败:', err);
    res.status(500).json({ success: false, message: '批量删除失败' });
  }
});

app.post('/api/records/batch-tags', requireAuth, async (req, res) => {
  await handleBatchTagsRequest(req, res, {
    resolveInfluencerIds: async (scope, request) => {
      if (scope === 'all') {
        const filters = buildRecordFilters(request.body?.filters || {}, request.user);
        delete filters.page;
        delete filters.pageSize;
        return getInfluencerIdsByRecordFilters(filters);
      }
      const recordIds = Array.isArray(request.body?.record_ids)
        ? request.body.record_ids.map((id) => Number(id)).filter(Boolean)
        : [];
      return getInfluencerIdsFromRecordIds(recordIds);
    },
  });
});

app.patch('/api/records/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: '无效的记录 ID' });
  const { audit_status, audit_reason, remark, tags } = req.body || {};
  if (audit_status === undefined && audit_reason === undefined && remark === undefined && tags === undefined) {
    return res.status(400).json({ success: false, message: '请提供要更新的字段' });
  }
  try {
    const record = await getRecordById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(record.influencer_id, req.user.name)) {
      return res.status(403).json({ success: false, message: '无权限修改此记录' });
    }
    const changes = {};
    if (audit_status !== undefined) changes.audit_status = toCellValue(audit_status);
    if (audit_reason !== undefined) changes.audit_reason = toCellValue(audit_reason);
    if (remark !== undefined) changes.remark = toCellValue(remark);
    if (tags !== undefined) changes.tags = normalizeTagsValue(toCellValue(tags));

    if (tags !== undefined) {
      await updateInfluencerProfileTags(record.influencer_id, changes.tags, req.user.name);
    }

    const recordFields = {
      audit_status: audit_status !== undefined ? changes.audit_status : undefined,
      audit_reason: audit_reason !== undefined ? changes.audit_reason : undefined,
      remark: remark !== undefined ? changes.remark : undefined,
    };
    const hasRecordFieldUpdates = Object.values(recordFields).some((value) => value !== undefined);

    if (hasRecordFieldUpdates) {
      await updateRecordFields(
        id,
        recordFields,
        {
          updatedBy: req.user.name,
          updatedContent: buildRecordUpdateContent(record, changes),
        }
      );
    } else if (tags === undefined) {
      return res.status(400).json({ success: false, message: '请提供要更新的字段' });
    }
    res.json({ success: true });
  } catch (err) {
    const message = err.message === '记录不存在' ? err.message : '更新记录失败';
    res.status(err.message === '记录不存在' ? 404 : 500).json({ success: false, message });
  }
});

app.get('/api/sku-models', requireAuth, async (req, res) => {
  try {
    const data = await getAllSkuModels();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取 skuID 设置失败' });
  }
});

app.post('/api/sku-models', requireAuth, requireManager, async (req, res) => {
  try {
    const id = await insertSkuModel({
      sku_id: toCellValue(req.body?.sku_id),
      model_name: toCellValue(req.body?.model_name),
      shop_name: toCellValue(req.body?.shop_name),
    });
    res.json({ success: true, id });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '创建失败' });
  }
});

app.put('/api/sku-models/:id', requireAuth, requireManager, async (req, res) => {
  try {
    await updateSkuModel(Number(req.params.id), {
      sku_id: req.body?.sku_id !== undefined ? toCellValue(req.body.sku_id) : undefined,
      model_name: req.body?.model_name !== undefined ? toCellValue(req.body.model_name) : undefined,
      shop_name: req.body?.shop_name !== undefined ? toCellValue(req.body.shop_name) : undefined,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '更新失败' });
  }
});

app.delete('/api/sku-models/:id', requireAuth, requireManager, async (req, res) => {
  try {
    await deleteSkuModel(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '删除失败' });
  }
});

app.get('/api/collaborated/export', requireAuth, requireManager, async (req, res) => {
  try {
    const filters = buildCollaboratedFilters(req.query, req.user);
    const rows = await getCollaboratedRowsForExport(filters);
    const sheetRows = rows.map((row) => {
      const item = {};
      COLLABORATED_EXPORT_HEADERS.forEach(({ key, label }) => {
        item[label] = row[key] ?? '';
      });
      return item;
    });
    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '已合作');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `已合作_${formatBeijingDateTime(new Date()).slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    console.error('已合作导出失败:', err);
    res.status(500).json({ success: false, message: '导出 Excel 失败' });
  }
});

app.get('/api/collaborated-stats', requireAuth, async (req, res) => {
  try {
    const filters = buildCollaboratedFilters(req.query, req.user);
    const { rows, total, page, pageSize, tabCounts } = await getCollaboratedStats(filters);
    res.json({
      success: true,
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      tabCounts,
      collab_tab: filters.collab_tab,
    });
  } catch (err) {
    console.error('获取已合作统计失败:', err);
    res.status(500).json({ success: false, message: '获取已合作统计失败' });
  }
});

app.get('/api/collaborated/monthly-stats/:influencerId', requireAuth, async (req, res) => {
  const influencerId = decodeURIComponent(toCellValue(req.params.influencerId));
  if (!influencerId) {
    return res.status(400).json({ success: false, message: '达人 id 不能为空' });
  }
  try {
    if (!isManager(req.user)) {
      const filters = buildCollaboratedFilters({ influencer_id: influencerId }, req.user);
      const ids = await getCollaboratedInfluencerIdsByFilters(filters);
      const allowed = ids.some(
        (id) => String(id || '').trim().toLowerCase() === influencerId.toLowerCase()
      );
      if (!allowed) {
        return res.status(403).json({ success: false, message: '无权限查看此达人' });
      }
    }
    const stats = await getCollaboratedMonthlyStats(influencerId);
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('获取达人月度统计失败:', err);
    res.status(500).json({ success: false, message: '获取达人月度统计失败' });
  }
});

app.get('/api/collaborated/filter-options', requireAuth, async (req, res) => {
  try {
    const filters = {};
    if (!isManager(req.user)) {
      filters.scope_assignee = req.user.name;
    }
    const options = await getCollaboratedFilterOptions(filters);
    res.json({ success: true, ...options });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取筛选项失败' });
  }
});

app.get('/api/assignee-stats', requireAuth, async (req, res) => {
  try {
    const filters = {
      include_allocation_tag: toCellValue(req.query.include_allocation_tag) === '1',
    };
    if (!isManager(req.user)) {
      filters.scope_assignee = req.user.name;
    }
    const stats = await getAssigneeStats(filters);
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error('获取负责人统计失败:', err);
    res.status(500).json({ success: false, message: '获取负责人统计失败' });
  }
});

app.get('/api/sample-shipment-stats', requireAuth, async (req, res) => {
  try {
    const filters = {
      date_preset: toCellValue(req.query.date_preset) || 'recent_30d',
      date_from: toCellValue(req.query.date_from),
      date_to: toCellValue(req.query.date_to),
      include_allocation_tag: toCellValue(req.query.include_allocation_tag) === '1',
    };
    const stats = await getSampleShipmentStats(filters);
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error('获取寄样统计失败:', err);
    res.status(400).json({ success: false, message: err.message || '获取寄样统计失败' });
  }
});

app.patch('/api/influencer-profiles/:influencerId', requireAuth, async (req, res) => {
  const influencerId = decodeURIComponent(toCellValue(req.params.influencerId));
  if (!influencerId) {
    return res.status(400).json({ success: false, message: '达人 id 不能为空' });
  }
  try {
    if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(influencerId, req.user.name)) {
      return res.status(403).json({ success: false, message: '无权限操作此达人' });
    }
    if (req.body?.tags !== undefined) {
      await updateInfluencerProfileTags(influencerId, toCellValue(req.body.tags), req.user.name);
    }
    if (req.body?.influencer_remark !== undefined) {
      await updateInfluencerProfileInfluencerRemark(
        influencerId,
        toCellValue(req.body.influencer_remark),
        req.user.name
      );
    }
    if (req.body?.fulfillment_progress !== undefined) {
      await updateInfluencerProfileFulfillment(
        influencerId,
        toCellValue(req.body.fulfillment_progress),
        req.user.name
      );
    }
    if (req.body?.email !== undefined) {
      await updateInfluencerProfileEmail(influencerId, toCellValue(req.body.email), req.user.name);
    }
    if (req.body?.toggle_pin) {
      const result = await toggleInfluencerProfilePin(influencerId, req.user.name);
      return res.json({ success: true, pinned: result.pinned });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '更新失败' });
  }
});

app.post('/api/influencer-profiles/:influencerId/rename', requireAuth, async (req, res) => {
  const influencerId = decodeURIComponent(toCellValue(req.params.influencerId));
  const newInfluencerId = toCellValue(req.body?.new_influencer_id);
  if (!influencerId) {
    return res.status(400).json({ success: false, message: '达人 id 不能为空' });
  }
  try {
    if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(influencerId, req.user.name)) {
      return res.status(403).json({ success: false, message: '无权限操作此达人' });
    }
    const result = await renameInfluencerId(influencerId, newInfluencerId, req.user.name);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '修改达人 id 失败' });
  }
});

app.get('/api/influencer-profiles/:influencerId/rename-logs', requireAuth, async (req, res) => {
  const influencerId = decodeURIComponent(toCellValue(req.params.influencerId));
  if (!influencerId) {
    return res.status(400).json({ success: false, message: '达人 id 不能为空' });
  }
  try {
    if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(influencerId, req.user.name)) {
      return res.status(403).json({ success: false, message: '无权限查看此达人' });
    }
    const rows = await getInfluencerIdRenameLogs(influencerId);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取 id 修改记录失败' });
  }
});

app.get('/api/influencer-profiles/:influencerId/follow-ups', requireAuth, async (req, res) => {
  const influencerId = decodeURIComponent(toCellValue(req.params.influencerId));
  if (!influencerId) {
    return res.status(400).json({ success: false, message: '达人 id 不能为空' });
  }
  try {
    if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(influencerId, req.user.name)) {
      return res.status(403).json({ success: false, message: '无权限查看此达人' });
    }
    const rows = await getInfluencerFollowUps(influencerId);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取跟进记录失败' });
  }
});

app.post('/api/influencer-profiles/:influencerId/follow-ups', requireAuth, async (req, res) => {
  const influencerId = decodeURIComponent(toCellValue(req.params.influencerId));
  const content = toCellValue(req.body?.content);
  if (!influencerId) {
    return res.status(400).json({ success: false, message: '达人 id 不能为空' });
  }
  try {
    if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(influencerId, req.user.name)) {
      return res.status(403).json({ success: false, message: '无权限操作此达人' });
    }
    const id = await insertInfluencerFollowUp(influencerId, content, req.user.name);
    const rows = await getInfluencerFollowUps(influencerId);
    res.json({ success: true, id, data: rows });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '添加跟进记录失败' });
  }
});

app.delete('/api/influencer-profiles/:influencerId/follow-ups/:followUpId', requireAuth, requireManager, async (req, res) => {
  const influencerId = decodeURIComponent(toCellValue(req.params.influencerId));
  const followUpId = Number(req.params.followUpId);
  if (!influencerId || !followUpId) {
    return res.status(400).json({ success: false, message: '参数无效' });
  }
  try {
    const rows = await getInfluencerFollowUps(influencerId);
    const target = rows.find((row) => Number(row.id) === followUpId);
    if (!target) {
      return res.status(404).json({ success: false, message: '跟进记录不存在' });
    }
    await deleteInfluencerFollowUp(followUpId);
    const updated = await getInfluencerFollowUps(influencerId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '删除跟进记录失败' });
  }
});

app.post('/api/influencer-profiles/scrape-email-targets', requireAuth, async (req, res) => {
  try {
    const influencerIds = await resolveScrapeEmailInfluencerIds(req.body || {}, req.user);
    if (!influencerIds.length) {
      return res.status(400).json({ success: false, message: '请先选择达人' });
    }
    const emailMap = filterInfluencerIdsNeedingEmailScrape(influencerIds);
    const skippedCount = influencerIds.length - emailMap.length;
    res.json({
      success: true,
      influencer_ids: emailMap,
      skipped: skippedCount,
      total: influencerIds.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || '获取抓取目标失败' });
  }
});

app.post('/api/influencer-profiles/batch-save-emails', requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    return res.status(400).json({ success: false, message: '没有可保存的邮箱' });
  }
  try {
    const allowedItems = [];
    for (const item of items) {
      const influencerId = toCellValue(item?.influencer_id);
      if (!influencerId) continue;
      if (!isManager(req.user) && !canStaffAccessInfluencerAssignee(influencerId, req.user.name)) {
        continue;
      }
      allowedItems.push({ influencer_id: influencerId, email: toCellValue(item?.email) });
    }
    if (!allowedItems.length) {
      return res.status(403).json({ success: false, message: '无权限保存所选达人邮箱' });
    }
    const results = await batchSaveInfluencerEmails(allowedItems, req.user.name);
    const saved = results.filter((item) => item.success);
    const failed = results.filter((item) => !item.success);
    res.json({
      success: true,
      results,
      summary: {
        total: results.length,
        scraped: saved.length,
        skipped: 0,
        failed: failed.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || '保存邮箱失败' });
  }
});

app.post('/api/influencer-profiles/scrape-emails', requireAuth, async (req, res) => {
  try {
    const influencerIds = await resolveScrapeEmailInfluencerIds(req.body || {}, req.user);
    if (!influencerIds.length) {
      return res.status(400).json({ success: false, message: '请先选择达人' });
    }

    const targets = filterInfluencerIdsNeedingEmailScrape(influencerIds);
    const skippedExisting = influencerIds.length - targets.length;
    if (!targets.length) {
      return res.json({
        success: true,
        results: influencerIds.map((influencer_id) => ({
          influencer_id,
          skipped: true,
          success: true,
        })),
        summary: {
          total: influencerIds.length,
          scraped: 0,
          skipped: skippedExisting,
          failed: 0,
        },
        message: '所选达人均已有邮箱信息',
      });
    }

    const results = await batchScrapeInfluencerEmails(targets, req.user.name);
    const scraped = results.filter((item) => item.success && !item.skipped);
    const skipped = results.filter((item) => item.skipped);
    const failed = results.filter((item) => !item.success);
    res.json({
      success: true,
      results,
      summary: {
        total: influencerIds.length,
        scraped: scraped.length,
        skipped: skippedExisting + skipped.length,
        failed: failed.length,
      },
      client_side_recommended: failed.length > 0,
      message:
        failed.length > 0
          ? '服务端无法访问 TikTok，请在前端使用浏览器抓取（需本机可访问 TikTok）'
          : undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || '抓取邮箱失败' });
  }
});

app.post('/api/collaborated/batch-assign', requireAuth, requireManager, async (req, res) => {
  const assignees = Array.isArray(req.body?.assignees)
    ? req.body.assignees.map((name) => toCellValue(name)).filter(Boolean)
    : req.body?.assignee
      ? [toCellValue(req.body.assignee)]
      : [];
  const scope = req.body?.scope === 'all' ? 'all' : 'page';
  const influencerIds = Array.isArray(req.body?.influencer_ids)
    ? req.body.influencer_ids.map((id) => toCellValue(id)).filter(Boolean)
    : [];

  if (!assignees.length) {
    return res.status(400).json({ success: false, message: '请选择负责人' });
  }

  try {
    for (const assignee of assignees) {
      const staff = await findStaffByName(assignee);
      if (!staff) {
        return res.status(400).json({ success: false, message: `负责人不存在：${assignee}` });
      }
    }

    let ids = [];
    if (scope === 'all') {
      const filters = buildCollaboratedFilters(req.body?.filters || {}, req.user);
      delete filters.page;
      delete filters.pageSize;
      ids = await getCollaboratedInfluencerIdsByFilters(filters);
    } else {
      ids = influencerIds;
    }

    if (!ids.length) {
      return res.status(400).json({ success: false, message: '没有可分配的达人' });
    }

    const result = await batchDistributeAssigneesByInfluencer(ids, assignees, req.user.name);
    res.json({
      success: true,
      updated: result.influencers,
      records: result.records,
      assignees,
    });
  } catch (err) {
    console.error('已合作批量分配失败:', err);
    res.status(500).json({ success: false, message: '批量分配失败' });
  }
});

app.post('/api/collaborated/batch-tags', requireAuth, async (req, res) => {
  await handleBatchTagsRequest(req, res, {
    resolveInfluencerIds: async (scope, request) => {
      if (scope === 'all') {
        const filters = buildCollaboratedFilters(request.body?.filters || {}, request.user);
        delete filters.page;
        delete filters.pageSize;
        return getCollaboratedInfluencerIdsByFilters(filters);
      }
      return Array.isArray(request.body?.influencer_ids)
        ? request.body.influencer_ids.map((id) => toCellValue(id)).filter(Boolean)
        : [];
    },
  });
});

function enrichMailSettingsResponse(settings) {
  return {
    ...settings,
    max_batch_count: MAX_BATCH_EMAIL_COUNT,
    smtp_presets: SMTP_PROVIDER_PRESETS,
  };
}

app.get('/api/me/mail-settings', requireAuth, async (req, res) => {
  try {
    const settings = getStaffMailSettingsPublic(req.user.id);
    if (!settings) return res.status(404).json({ success: false, message: '用户不存在' });
    res.json({ success: true, data: enrichMailSettingsResponse(settings) });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取邮箱配置失败' });
  }
});

app.put('/api/me/mail-settings', requireAuth, async (req, res) => {
  try {
    const payload = {};
    if (req.body?.smtp_email !== undefined) payload.smtp_email = toCellValue(req.body.smtp_email);
    if (req.body?.mail_from_name !== undefined) payload.mail_from_name = toCellValue(req.body.mail_from_name);
    if (req.body?.smtp_provider !== undefined) payload.smtp_provider = toCellValue(req.body.smtp_provider);
    if (req.body?.smtp_host !== undefined) payload.smtp_host = toCellValue(req.body.smtp_host);
    if (req.body?.smtp_port !== undefined) payload.smtp_port = Number(req.body.smtp_port);
    if (req.body?.smtp_secure !== undefined) payload.smtp_secure = Boolean(req.body.smtp_secure);
    if (req.body?.smtp_auth_code !== undefined) payload.smtp_auth_code = String(req.body.smtp_auth_code || '').trim();
    const settings = await updateStaffMailSettings(req.user.id, payload);
    res.json({ success: true, data: enrichMailSettingsResponse(settings) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '保存邮箱配置失败' });
  }
});

app.post('/api/me/mail-settings/test', requireAuth, async (req, res) => {
  try {
    const settings = getStaffMailSettingsForSend(req.user.id);
    if (!settings) {
      return res.status(400).json({ success: false, message: '请先配置发件邮箱与 SMTP 授权码' });
    }
    await sendStaffEmail(settings, {
      to: settings.smtp_email,
      subject: 'LUJIFO ERP 邮箱配置测试',
      text: `您好 ${settings.mail_from_name || settings.staff_name || ''}，\n\n这是一封来自 LUJIFO ERP 的测试邮件。若您收到此邮件，说明 SMTP 配置正确。\n\nSMTP：${settings.smtp_host}:${settings.smtp_port}\n发送时间：${formatBeijingDateTime(new Date())}`,
    });
    res.json({ success: true, message: `测试邮件已发送至 ${settings.smtp_email}` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '测试邮件发送失败' });
  }
});

app.post('/api/collaborated/batch-email', requireAuth, async (req, res) => {
  try {
    const scope = req.body?.scope === 'all' ? 'all' : 'page';
    let influencerIds = [];
    if (scope === 'all') {
      const filters = buildCollaboratedFilters(req.body?.filters || {}, req.user);
      delete filters.page;
      delete filters.pageSize;
      influencerIds = await getCollaboratedInfluencerIdsByFilters(filters);
    } else if (Array.isArray(req.body?.influencer_ids)) {
      influencerIds = req.body.influencer_ids.map((id) => toCellValue(id)).filter(Boolean);
    }

    influencerIds = [...new Set(influencerIds.map((id) => String(id).trim()).filter(Boolean))];
    if (!influencerIds.length) {
      return res.status(400).json({ success: false, message: '请先选择达人' });
    }

    if (!isManager(req.user)) {
      influencerIds = influencerIds.filter((id) => canStaffAccessInfluencerAssignee(id, req.user.name));
    }
    if (!influencerIds.length) {
      return res.status(403).json({ success: false, message: '没有可发送的达人（无权限或列表为空）' });
    }

    const result = await sendCollaboratedBatchEmails({
      staffId: req.user.id,
      influencerIds,
      subjectTemplate: toCellValue(req.body?.subject),
      bodyTemplate: toCellValue(req.body?.body),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '群发邮件失败' });
  }
});

app.get('/api/email-batches', requireAuth, async (req, res) => {
  try {
    const filters = {
      page: Math.max(1, parseInt(req.query.page, 10) || 1),
      pageSize: Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20)),
    };
    if (!isManager(req.user)) {
      filters.created_by = req.user.name;
    }
    const result = await getEmailBatches(filters);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取发送记录失败' });
  }
});

app.get('/api/email-batches/:id', requireAuth, async (req, res) => {
  try {
    const batchId = Number(req.params.id);
    if (!batchId) return res.status(400).json({ success: false, message: '无效的批次 ID' });
    const detail = await getEmailBatchDetail(batchId);
    if (!detail) return res.status(404).json({ success: false, message: '发送记录不存在' });
    if (!isManager(req.user) && detail.batch.created_by !== req.user.name) {
      return res.status(403).json({ success: false, message: '无权限查看此发送记录' });
    }
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取发送明细失败' });
  }
});

app.post('/api/records/batch-email', requireAuth, async (req, res) => {
  try {
    const scope = req.body?.scope === 'all' ? 'all' : 'page';
    let influencerIds = [];
    if (scope === 'all') {
      const filters = buildRecordFilters(req.body?.filters || {}, req.user);
      delete filters.page;
      delete filters.pageSize;
      influencerIds = await getInfluencerIdsByRecordFilters(filters);
    } else if (Array.isArray(req.body?.record_ids)) {
      influencerIds = await getInfluencerIdsFromRecordIds(
        req.body.record_ids.map((id) => Number(id)).filter(Boolean)
      );
    }

    influencerIds = [...new Set(influencerIds.map((id) => String(id).trim()).filter(Boolean))];
    if (!influencerIds.length) {
      return res.status(400).json({ success: false, message: '请先选择达人' });
    }

    if (!isManager(req.user)) {
      influencerIds = influencerIds.filter((id) => canStaffAccessInfluencerAssignee(id, req.user.name));
    }
    if (!influencerIds.length) {
      return res.status(403).json({ success: false, message: '没有可发送的达人（无权限或列表为空）' });
    }

    const result = await sendPendingAuditBatchEmails({
      staffId: req.user.id,
      influencerIds,
      subjectTemplate: toCellValue(req.body?.subject),
      bodyTemplate: toCellValue(req.body?.body),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || '群发邮件失败' });
  }
});

app.post('/api/alliance-orders/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
  const filePath = req.file.path;
  try {
    const { rows } = parseAllianceOrderFile(filePath);
    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: '未能从文件中解析到有效数据。请确认第 1 列为订单 id 且数据从第 2 行开始。',
      });
    }

    const { inserted, updated } = await importAllianceOrdersBatch({
      rows,
      imported_by: req.user.name,
      import_time: formatBeijingDateTime(new Date()),
    });

    res.json({
      success: true,
      inserted,
      updated,
      skipped: 0,
      total: rows.length,
      message:
        updated > 0
          ? `导入完成：新增 ${inserted} 条，覆盖 ${updated} 条`
          : `导入完成：新增 ${inserted} 条`,
    });
  } catch (err) {
    console.error('联盟订单导入失败:', err);
    res.status(500).json({ success: false, message: '联盟订单导入失败' });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.get('/api/alliance-orders', requireAuth, async (req, res) => {
  try {
    const filters = {
      content_id: toCellValue(req.query.content_id),
      creator_username: toCellValue(req.query.creator_username),
      order_id: toCellValue(req.query.order_id),
      assignee_filter: toCellValue(req.query.assignee),
      payment_from: toCellValue(req.query.payment_from),
      payment_to: toCellValue(req.query.payment_to),
      payment_after_sample: toCellValue(req.query.payment_after_sample) === '1',
      sample_date_from: toCellValue(req.query.sample_date_from),
      sample_date_to: toCellValue(req.query.sample_date_to),
      import_time: toCellValue(req.query.import_time),
      full_refund: toCellValue(req.query.full_refund) === '1' ? '1' : '',
      page: Math.max(1, parseInt(req.query.page, 10) || 1),
      pageSize: Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50)),
    };
    if (!isManager(req.user)) {
      filters.scope_assignee = req.user.name;
    }
    const { rows, total, page, pageSize, columns } = await getAllianceOrders(filters);
    res.json({
      success: true,
      data: rows,
      columns,
      skuModelMap: getSkuModelLookupMap(),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      lastImport: getLastAllianceOrderImport(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取联盟订单失败' });
  }
});

app.get('/api/alliance-orders/filter-options', requireAuth, async (req, res) => {
  try {
    const filters = {
      content_id: toCellValue(req.query.content_id),
      creator_username: toCellValue(req.query.creator_username),
      order_id: toCellValue(req.query.order_id),
      assignee_filter: toCellValue(req.query.assignee),
      payment_from: toCellValue(req.query.payment_from),
      payment_to: toCellValue(req.query.payment_to),
      payment_after_sample: toCellValue(req.query.payment_after_sample) === '1',
      sample_date_from: toCellValue(req.query.sample_date_from),
      sample_date_to: toCellValue(req.query.sample_date_to),
    };
    if (!isManager(req.user)) {
      filters.scope_assignee = req.user.name;
    }
    const options = await getAllianceOrderImportTimeOptions(filters);
    res.json({ success: true, ...options });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取筛选项失败' });
  }
});

app.get('/api/alliance-orders/:id', requireAuth, async (req, res) => {
  try {
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const order = await getAllianceOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ success: false, message: '记录不存在' });
    const page = getAllianceOrderPageNumber(Number(req.params.id), pageSize);
    res.json({ success: true, data: order, page, pageSize });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取联盟订单失败' });
  }
});

app.post('/api/alliance-orders/batch-delete', requireAuth, async (req, res) => {
  const scope = req.body?.scope === 'all' ? 'all' : 'page';
  const orderIds = Array.isArray(req.body?.order_ids)
    ? req.body.order_ids.map((id) => Number(id)).filter(Boolean)
    : [];

  try {
    let ids = [];
    if (scope === 'all') {
      const filters = {
        content_id: toCellValue(req.body?.filters?.content_id),
        creator_username: toCellValue(req.body?.filters?.creator_username),
        order_id: toCellValue(req.body?.filters?.order_id),
      };
      ids = await getAllianceOrderIdsByFilters(filters);
    } else {
      ids = orderIds;
    }

    if (!ids.length) {
      return res.status(400).json({ success: false, message: '没有可删除的记录' });
    }

    const deleted = await batchDeleteAllianceOrders(ids);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('联盟订单批量删除失败:', err);
    res.status(500).json({ success: false, message: '批量删除失败' });
  }
});

app.post('/api/sample-orders/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
  const filePath = req.file.path;
  let inserted = 0;
  let skipped = 0;
  const duplicateKeys = [];
  try {
    const { rows } = parseSampleOrderFile(filePath);
    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: '未能从文件中解析到有效数据。请确认首列为唯一标识且数据从第 2 行开始。',
      });
    }

    const batchResult = await importSampleOrdersBatch({
      rows,
      imported_by: req.user.name,
      import_time: formatBeijingDateTime(new Date()),
    });
    inserted = batchResult.inserted;
    skipped = batchResult.skipped;
    duplicateKeys.push(...batchResult.duplicateKeys);

    res.json({
      success: true,
      inserted,
      skipped,
      duplicateKeys,
      total: rows.length,
      message:
        duplicateKeys.length > 0
          ? `导入完成：新增 ${inserted} 条，跳过重复 ${skipped} 条`
          : `导入完成：新增 ${inserted} 条`,
    });
  } catch (err) {
    console.error('样品订单导入失败:', err);
    res.status(500).json({ success: false, message: '样品订单导入失败' });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.get('/api/sample-orders', requireAuth, async (req, res) => {
  try {
    const filters = {
      order_id: toCellValue(req.query.order_id),
      buyer_username: toCellValue(req.query.buyer_username),
      assignee_filter: toCellValue(req.query.assignee),
      sample_date_from: toCellValue(req.query.sample_date_from),
      sample_date_to: toCellValue(req.query.sample_date_to),
      import_time: toCellValue(req.query.import_time),
      highlight_ids: toCellValue(req.query.highlight_ids),
      page: Math.max(1, parseInt(req.query.page, 10) || 1),
      pageSize: Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50)),
    };
    if (!isManager(req.user)) {
      filters.scope_assignee = req.user.name;
    }
    const { rows, total, page, pageSize, columns } = await getSampleOrders(filters);
    res.json({
      success: true,
      data: rows,
      columns,
      skuModelMap: getSkuModelLookupMap(),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      lastImport: getLastSampleOrderImport(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取样品订单失败' });
  }
});

app.get('/api/sample-orders/filter-options', requireAuth, async (req, res) => {
  try {
    const filters = {
      order_id: toCellValue(req.query.order_id),
      buyer_username: toCellValue(req.query.buyer_username),
      assignee_filter: toCellValue(req.query.assignee),
      sample_date_from: toCellValue(req.query.sample_date_from),
      sample_date_to: toCellValue(req.query.sample_date_to),
    };
    if (!isManager(req.user)) {
      filters.scope_assignee = req.user.name;
    }
    const options = await getSampleOrderImportTimeOptions(filters);
    res.json({ success: true, ...options });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取筛选项失败' });
  }
});

app.get('/api/sample-orders/:id', requireAuth, async (req, res) => {
  try {
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const order = await getSampleOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ success: false, message: '记录不存在' });
    const page = getSampleOrderPageNumber(Number(req.params.id), pageSize);
    res.json({ success: true, data: order, page, pageSize });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取样品订单失败' });
  }
});

app.post('/api/sample-orders/batch-delete', requireAuth, async (req, res) => {
  const scope = req.body?.scope === 'all' ? 'all' : 'page';
  const orderIds = Array.isArray(req.body?.order_ids)
    ? req.body.order_ids.map((id) => Number(id)).filter(Boolean)
    : [];

  try {
    let ids = [];
    if (scope === 'all') {
      const filters = {
        order_id: toCellValue(req.body?.filters?.order_id),
        buyer_username: toCellValue(req.body?.filters?.buyer_username),
      };
      ids = await getSampleOrderIdsByFilters(filters);
    } else {
      ids = orderIds;
    }

    if (!ids.length) {
      return res.status(400).json({ success: false, message: '没有可删除的记录' });
    }

    const deleted = await batchDeleteSampleOrders(ids);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('样品订单批量删除失败:', err);
    res.status(500).json({ success: false, message: '批量删除失败' });
  }
});

app.get('/api/export', requireAuth, requireManager, async (req, res) => {
  try {
    const filters = buildRecordFilters(req.query, req.user);
    const records = await getAllRecordsForExport(filters);
    const rows = records.map((record) => {
      const row = {};
      EXPORT_HEADERS.forEach(({ key, label }) => {
        row[label] = record[key] ?? '';
      });
      return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '达人数据库');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `达人数据库_${formatBeijingDateTime(new Date()).slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: '导出 Excel 失败' });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: '文件上传失败：' + err.message });
  }
  if (err) return res.status(400).json({ success: false, message: err.message });
  next();
});

async function start() {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LUJIFO跨境电商ERP系统已启动: http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
