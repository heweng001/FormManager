const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');
const { encryptSecret, decryptSecret } = require('./mailCrypto');
const {
  resolveStaffSmtpConfig,
  renderEmailTemplate,
  sendStaffEmail,
  createStaffMailSender,
  sleep,
  isValidRecipientEmail,
  SMTP_PROVIDER_PRESETS,
} = require('./mailService');

const DB_PATH = path.join(__dirname, 'data.db');

let db = null;

function saveDb() {
  if (!db) return;
  invalidateListEnrichMapsCache();
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

let listEnrichMapsCache = null;

function invalidateListEnrichMapsCache() {
  listEnrichMapsCache = null;
}

function getListEnrichMaps() {
  if (listEnrichMapsCache) return listEnrichMapsCache;
  listEnrichMapsCache = {
    tagMap: getInfluencerMergedTagsMap(),
    metaMap: buildInfluencerMetaMapForStats(),
    auditSummaryMap: getInfluencerApplicationAuditSummaryMap(),
    sampleOrderMaps: buildSampleOrderIndexMaps(),
    collaboratedKeys: getRealCollaboratedInfluencerKeySet(),
    emailMap: getInfluencerEmailMap(),
    emailSendMap: getLatestEmailSendSummaryMap(),
    skuModelMap: getSkuModelLookupMap(),
  };
  return listEnrichMapsCache;
}

function getLastInsertRowId() {
  if (!db) return 0;
  const row = queryOne('SELECT last_insert_rowid() AS id');
  return Number(row?.id) || 0;
}

function queryRows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryRows(sql, params);
  return rows[0] || null;
}

function normalizeCommissionRate(value) {
  const text = String(value || '').trim().replace(/%/g, '');
  if (!text) return '';
  const num = Number(text);
  if (Number.isNaN(num)) return text;
  if (num === 0) return '';
  if (num > 0 && num <= 1) return `${(num * 100).toFixed(2)}%`;
  return `${num.toFixed(2)}%`;
}

function sanitizeCommission(value) {
  return normalizeCommissionRate(value);
}

function migrateLegacyUsersTable() {
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
  if (!tables.length) return;
  const info = db.exec('PRAGMA table_info(users)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (columns.includes('email')) {
    db.run('DROP TABLE users');
    saveDb();
  }
}

function migrateInfluencerProfilesRemark() {
  const info = db.exec('PRAGMA table_info(influencer_profiles)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('remark')) {
    db.run('ALTER TABLE influencer_profiles ADD COLUMN remark TEXT');
    saveDb();
  }
}

function migrateInfluencerProfilesPinned() {
  const info = db.exec('PRAGMA table_info(influencer_profiles)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('pinned')) {
    db.run('ALTER TABLE influencer_profiles ADD COLUMN pinned INTEGER DEFAULT 0');
    saveDb();
  }
  if (!columns.includes('pinned_at')) {
    db.run('ALTER TABLE influencer_profiles ADD COLUMN pinned_at DATETIME');
    saveDb();
  }
}

function migrateRecordsAssignee() {
  const info = db.exec('PRAGMA table_info(records)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('assignee')) {
    db.run('ALTER TABLE records ADD COLUMN assignee TEXT');
    saveDb();
  }
}

function migrateRecordsTags() {
  const info = db.exec('PRAGMA table_info(records)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('tags')) {
    db.run('ALTER TABLE records ADD COLUMN tags TEXT');
    saveDb();
  }
}

function migrateRecordsMeta() {
  const info = db.exec('PRAGMA table_info(records)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  const additions = [
    ['imported_by', 'TEXT'],
    ['last_updated_by', 'TEXT'],
    ['last_updated_at', 'TEXT'],
    ['last_updated_content', 'TEXT'],
    ['audit_reason', 'TEXT'],
    ['sample_date', 'TEXT'],
    ['sample_order_id', 'INTEGER'],
    ['import_batch_time', 'TEXT'],
  ];
  additions.forEach(([name, type]) => {
    if (!columns.includes(name)) {
      db.run(`ALTER TABLE records ADD COLUMN ${name} ${type}`);
    }
  });
  saveDb();
}

function migrateRecordsAuditStatusAt() {
  const info = db.exec('PRAGMA table_info(records)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('audit_status_at')) {
    db.run('ALTER TABLE records ADD COLUMN audit_status_at TEXT');
    db.run(`
      UPDATE records
      SET audit_status_at = COALESCE(last_updated_at, import_batch_time, create_time)
      WHERE UPPER(TRIM(COALESCE(audit_status, ''))) IN ('Y', 'N', 'X')
        AND (audit_status_at IS NULL OR TRIM(audit_status_at) = '')
    `);
    saveDb();
  }
}

function migrateSkuModelsShopName() {
  const info = db.exec('PRAGMA table_info(sku_models)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('shop_name')) {
    db.run('ALTER TABLE sku_models ADD COLUMN shop_name TEXT');
    saveDb();
  }
}

function migrateInfluencerProfilesFulfillment() {
  const info = db.exec('PRAGMA table_info(influencer_profiles)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('fulfillment_progress')) {
    db.run('ALTER TABLE influencer_profiles ADD COLUMN fulfillment_progress TEXT');
    saveDb();
  }
}

function migrateInfluencerProfileInfluencerRemark() {
  const info = db.exec('PRAGMA table_info(influencer_profiles)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('influencer_remark')) {
    db.run('ALTER TABLE influencer_profiles ADD COLUMN influencer_remark TEXT');
    saveDb();
  }
  db.run(`
    UPDATE influencer_profiles
    SET influencer_remark = remark
    WHERE TRIM(COALESCE(influencer_remark, '')) = ''
      AND TRIM(COALESCE(remark, '')) != ''
  `);
  saveDb();
}

function migrateInfluencerProfilesEmail() {
  const info = db.exec('PRAGMA table_info(influencer_profiles)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('email')) {
    db.run('ALTER TABLE influencer_profiles ADD COLUMN email TEXT');
    saveDb();
  }
}

function migrateStaffMailSettings() {
  const info = db.exec('PRAGMA table_info(staff)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  [
    ['smtp_email', 'TEXT'],
    ['smtp_auth_code_enc', 'TEXT'],
    ['mail_from_name', 'TEXT'],
    ['smtp_provider', 'TEXT'],
    ['smtp_host', 'TEXT'],
    ['smtp_port', 'INTEGER'],
    ['smtp_secure', 'INTEGER'],
  ].forEach(([name, type]) => {
    if (!columns.includes(name)) db.run(`ALTER TABLE staff ADD COLUMN ${name} ${type}`);
  });
  saveDb();
}

function migrateEmailSendLogs() {
  db.run(`
    CREATE TABLE IF NOT EXISTS email_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_template TEXT NOT NULL,
      body_template TEXT NOT NULL,
      created_by TEXT,
      sender_email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS email_send_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER,
      influencer_id TEXT NOT NULL,
      to_email TEXT,
      subject TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_email_send_logs_batch
    ON email_send_logs(batch_id)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_email_send_logs_influencer
    ON email_send_logs(influencer_id, sent_at)
  `);
  saveDb();
}

function migrateEmailSendLogBatchIds() {
  ensureAppMetaTable();
  if (getAppMeta('email_send_log_batch_fix_v1') === '1') return;

  queryRows(
    `
    SELECT id, sent_at
    FROM email_send_logs
    WHERE batch_id IS NULL OR batch_id = 0
    ORDER BY datetime(sent_at) ASC, id ASC
    `
  ).forEach((log) => {
    const batch = queryOne(
      `
      SELECT id
      FROM email_batches
      WHERE datetime(created_at) <= datetime(?)
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1
      `,
      [log.sent_at]
    );
    if (!batch?.id) return;
    db.run('UPDATE email_send_logs SET batch_id = ? WHERE id = ?', [batch.id, log.id]);
  });

  queryRows('SELECT id FROM email_batches ORDER BY id ASC').forEach((batch) => {
    const success = Number(
      queryOne(
        `SELECT COUNT(*) AS cnt FROM email_send_logs WHERE batch_id = ? AND status = 'sent'`,
        [batch.id]
      )?.cnt || 0
    );
    const failed = Number(
      queryOne(
        `SELECT COUNT(*) AS cnt FROM email_send_logs WHERE batch_id = ? AND status = 'failed'`,
        [batch.id]
      )?.cnt || 0
    );
    const skipped = Number(
      queryOne(
        `SELECT COUNT(*) AS cnt FROM email_send_logs WHERE batch_id = ? AND status = 'skipped'`,
        [batch.id]
      )?.cnt || 0
    );
    db.run(
      `UPDATE email_batches SET success_count = ?, failed_count = ?, skipped_count = ? WHERE id = ?`,
      [success, failed, skipped, batch.id]
    );
  });

  setAppMeta('email_send_log_batch_fix_v1', '1');
  saveDb();
}

function migrateInfluencerIdAliases() {
  db.run(`
    CREATE TABLE IF NOT EXISTS influencer_id_rename_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_influencer_id TEXT NOT NULL,
      new_influencer_id TEXT NOT NULL,
      changed_by TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS influencer_id_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_influencer_id TEXT NOT NULL,
      alias_influencer_id TEXT NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(alias_influencer_id)
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_influencer_id_rename_logs_old
    ON influencer_id_rename_logs(old_influencer_id)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_influencer_id_rename_logs_new
    ON influencer_id_rename_logs(new_influencer_id)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_influencer_id_aliases_canonical
    ON influencer_id_aliases(canonical_influencer_id)
  `);
  saveDb();
}

function migrateFulfillmentProgressShortLabels() {
  ensureAppMetaTable();
  if (getAppMeta('fulfillment_progress_short_v1') === '1') return;

  const legacyUpdates = [
    ['样品待签收', '待签收'],
    ['视频待发布', '待发布'],
    ['视频已发布', '已发布'],
    ['视频复拍中', '复拍中'],
    ['逾期未发布', '逾期'],
    ['预期未发布', '逾期'],
  ];
  legacyUpdates.forEach(([from, to]) => {
    db.run('UPDATE influencer_profiles SET fulfillment_progress = ? WHERE fulfillment_progress = ?', [to, from]);
  });
  setAppMeta('fulfillment_progress_short_v1', '1');
  saveDb();
}

function backfillImportBatchTime() {
  const rows = queryRows(`
    SELECT id, create_time
    FROM records
    WHERE import_batch_time IS NULL OR TRIM(import_batch_time) = ''
  `);
  rows.forEach((row) => {
    const source = String(row.create_time || '').trim();
    if (!source) return;
    const normalized = source.includes('T') ? source.slice(0, 16).replace('T', ' ') : source.slice(0, 16);
    const converted = convertUtcStorageToBeijing(normalized);
    if (converted) {
      db.run('UPDATE records SET import_batch_time = ? WHERE id = ?', [converted, row.id]);
    }
  });
  saveDb();
}

const BEIJING_TZ = 'Asia/Shanghai';

function formatBeijingDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function convertUtcStorageToBeijing(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const withSeconds = /:\d{2}$/.test(normalized) ? normalized : `${normalized}:00`;
  const date = new Date(`${withSeconds}Z`);
  if (Number.isNaN(date.getTime())) return text.slice(0, 16);
  return formatBeijingDateTime(date);
}

function ensureAppMetaTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
}

function getAppMeta(key) {
  return queryOne('SELECT value FROM app_meta WHERE key = ?', [key])?.value || '';
}

function setAppMeta(key, value) {
  db.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [key, value]);
}

function migrateImportBatchTimeToBeijing() {
  ensureAppMetaTable();
  if (getAppMeta('import_batch_time_beijing_v1') === '1') return;
  const rows = queryRows(`
    SELECT id, import_batch_time
    FROM records
    WHERE import_batch_time IS NOT NULL AND TRIM(import_batch_time) != ''
  `);
  rows.forEach((row) => {
    const converted = convertUtcStorageToBeijing(row.import_batch_time);
    if (converted) {
      db.run('UPDATE records SET import_batch_time = ? WHERE id = ?', [converted, row.id]);
    }
  });
  setAppMeta('import_batch_time_beijing_v1', '1');
  saveDb();
}

function migrateOrderImportTimeToBeijing() {
  ensureAppMetaTable();
  if (getAppMeta('order_import_time_beijing_v1') === '1') return;
  ['sample_orders', 'alliance_orders', 'influencer_videos'].forEach((table) => {
    queryRows(
      `SELECT id, import_time FROM ${table}
       WHERE import_time IS NOT NULL AND TRIM(import_time) != ''
         AND import_time GLOB '*:*:*'`
    ).forEach((row) => {
      const converted = convertUtcStorageToBeijing(row.import_time);
      if (converted && converted !== row.import_time) {
        db.run(`UPDATE ${table} SET import_time = ? WHERE id = ?`, [converted, row.id]);
      }
    });
  });
  setAppMeta('order_import_time_beijing_v1', '1');
  saveDb();
}

const FULFILLMENT_PROGRESS_OPTIONS = [
  '待签收',
  '待发布',
  '已发布',
  '复拍中',
  '逾期',
];

const FULFILLMENT_PROGRESS_LEGACY_MAP = {
  样品待签收: '待签收',
  视频待发布: '待发布',
  视频已发布: '已发布',
  视频复拍中: '复拍中',
  逾期未发布: '逾期',
  预期未发布: '逾期',
};

function normalizeFulfillmentProgressValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (FULFILLMENT_PROGRESS_OPTIONS.includes(text)) return text;
  return FULFILLMENT_PROGRESS_LEGACY_MAP[text] || '';
}

function distributeEvenly(items, bucketCount) {
  const groups = Array.from({ length: bucketCount }, () => []);
  if (!items.length || !bucketCount) return groups;
  const base = Math.floor(items.length / bucketCount);
  let remainder = items.length % bucketCount;
  let index = 0;
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    groups[bucket] = items.slice(index, index + size);
    index += size;
  }
  return groups;
}

function mergeTagsValues(...values) {
  const unique = [];
  values.forEach((value) => {
    splitTagsValue(value).forEach((tag) => {
      if (!unique.includes(tag)) unique.push(tag);
    });
  });
  return joinTagsList(unique);
}

function getInfluencerProfileTagsMap() {
  const map = new Map();
  getInfluencerProfileMap().forEach((row, key) => {
    map.set(key, normalizeTagsValue(row.tags || ''));
  });
  return map;
}

function getInfluencerMergedTagsMap() {
  return getInfluencerProfileTagsMap();
}

function normalizeAuditStatusKey(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text || !['Y', 'N', 'X'].includes(text)) return 'pending';
  return text;
}

function formatAuditStatusLabel(statusKey) {
  const labels = {
    Y: '通过',
    N: '拒绝',
    X: '待定',
    pending: '待审核',
  };
  return labels[statusKey] || statusKey;
}

function getInfluencerApplicationAuditSummaryMap() {
  const map = new Map();
  queryRows(
    `
    SELECT
      r.id, r.influencer_id, r.application_id, r.audit_status, r.audit_status_at,
      r.audit_reason, r.remark, r.last_updated_by, r.last_updated_at,
      r.update_time, r.commission, sm.model_name AS model
    FROM records r
    LEFT JOIN sku_models sm ON TRIM(COALESCE(r.sku_id, '')) = TRIM(sm.sku_id)
    WHERE TRIM(COALESCE(r.influencer_id, '')) != ''
    ORDER BY r.id DESC
    `
  ).forEach((row) => {
    const key = resolveCanonicalInfluencerKey(row.influencer_id);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        influencer_id: resolveCanonicalInfluencerId(row.influencer_id),
        statusSet: new Set(),
        applications: [],
      });
    }
    const entry = map.get(key);
    const statusKey = normalizeAuditStatusKey(row.audit_status);
    entry.statusSet.add(statusKey);
    entry.applications.push({
      record_id: row.id,
      application_id: String(row.application_id || '').trim() || `#${row.id}`,
      audit_status: String(row.audit_status || '').trim(),
      audit_status_key: statusKey,
      audit_status_label: formatAuditStatusLabel(statusKey),
      audit_status_at: String(row.audit_status_at || '').trim(),
      audit_reason: String(row.audit_reason || '').trim(),
      remark: String(row.remark || '').trim(),
      audited_by: statusKey === 'pending' ? '' : String(row.last_updated_by || '').trim(),
      update_time: String(row.update_time || '').trim(),
      model: String(row.model || '').trim(),
      commission: String(row.commission || '').trim(),
    });
  });
  map.forEach((entry) => {
    entry.has_mixed_audit_status = entry.statusSet.size > 1;
    entry.application_count = entry.applications.length;
  });
  return map;
}

function enrichRecordsWithMergedTags(rows) {
  return enrichRecordsWithMergedFields(rows);
}

function getRealCollaboratedInfluencerKeySet() {
  const sampleBuyerMap = getAllSampleOrderBuyerIdMap();
  const aggMap = buildAllianceOrderStatsByInfluencerKey();
  const recordMap = getMergedRecordSummaryByInfluencer();
  return collectRealCollaboratedInfluencerKeys({ sampleBuyerMap, aggMap, recordMap });
}

function enrichRecordsWithMergedFields(rows, options = {}) {
  const list = rows || [];
  if (!list.length) return [];
  if (options.light && options.influencerId) {
    return enrichRecordsForInfluencerDetail(list, options.influencerId);
  }
  const maps = options.useCache === false
    ? null
    : getListEnrichMaps();
  const tagMap = maps?.tagMap || getInfluencerMergedTagsMap();
  const metaMap = maps?.metaMap || buildInfluencerMetaMapForStats();
  const auditSummaryMap = options.skipAuditSummary
    ? null
    : maps?.auditSummaryMap || getInfluencerApplicationAuditSummaryMap();
  const sampleOrderMaps = options.sampleOrderMaps || maps?.sampleOrderMaps || buildSampleOrderIndexMaps();
  const collaboratedKeys = options.skipCollaboratedFlag
    ? new Set()
    : maps?.collaboratedKeys || getRealCollaboratedInfluencerKeySet();
  const emailMap = maps?.emailMap || getInfluencerEmailMap();
  const emailSendMap = maps?.emailSendMap || getLatestEmailSendSummaryMap();
  const skuModelMap = maps?.skuModelMap || getSkuModelLookupMap();
  return list.map((row) =>
    enrichRecordWithMergedFields(
      row,
      tagMap,
      metaMap,
      auditSummaryMap,
      sampleOrderMaps,
      collaboratedKeys,
      emailMap,
      emailSendMap,
      skuModelMap
    )
  );
}

function enrichRecordWithMergedTags(row) {
  return enrichRecordWithMergedFields(row);
}

function enrichRecordWithMergedFields(
  row,
  tagMap,
  metaMap,
  auditSummaryMap,
  sampleOrderMaps,
  collaboratedKeys,
  emailMap,
  emailSendMap,
  skuModelMap
) {
  if (!row) return row;
  const tagsMap = tagMap || getInfluencerMergedTagsMap();
  const canonicalKey = resolveCanonicalInfluencerKey(row.influencer_id);
  row.tags = tagsMap.get(canonicalKey) || '';
  const meta = getInfluencerMetaForStats(
    metaMap || buildInfluencerMetaMapForStats(),
    canonicalKey,
    row.influencer_id
  );
  const info = resolveInfluencerAssigneeInfo(meta.assignees);
  row.assignee_names = info.assignee_names;
  row.assignee_conflict = info.assignee_conflict;
  row.assignee = info.assignee;
  const auditSummary = auditSummaryMap
    ? auditSummaryMap.get(canonicalKey)
    : null;
  if (auditSummary) {
    row.influencer_mixed_audit = auditSummary.has_mixed_audit_status;
    row.influencer_application_count = auditSummary.application_count;
    row.influencer_applications = auditSummary.applications;
  } else {
    row.influencer_mixed_audit = false;
    row.influencer_application_count = 0;
    row.influencer_applications = [];
  }
  const collabKeys = collaboratedKeys || getRealCollaboratedInfluencerKeySet();
  row.is_collaborated = !!canonicalKey && collabKeys.has(canonicalKey);
  row.email = (emailMap || getInfluencerEmailMap()).get(canonicalKey) || '';
  applyEmailSendSummaryToRow(
    row,
    (emailSendMap || getLatestEmailSendSummaryMap()).get(canonicalKey)
  );

  const maps = sampleOrderMaps || buildSampleOrderIndexMaps();
  const modelMap = skuModelMap || getSkuModelLookupMap();
  const aliasKeys = getInfluencerAliasKeys(row.influencer_id);
  const buyerOrders = collectSampleOrdersForInfluencer(maps, row.influencer_id);
  const skuOrders = collectMapListValues(maps.byBuyerSku, aliasKeys, sampleOrderItemKey).filter(
    (item) => normalizeMatchKey(item.sku_id) === normalizeMatchKey(row.sku_id)
  );
  const duplicateGroups = aliasKeys.flatMap((key) => buildSameModelDuplicateGroups(key, maps, modelMap));
  const duplicateGroupMap = new Map();
  duplicateGroups.forEach((group) => {
    const groupKey = `${group.sku_id}|${group.model_name}|${group.count}`;
    if (!duplicateGroupMap.has(groupKey)) duplicateGroupMap.set(groupKey, group);
  });
  const mergedDuplicateGroups = [...duplicateGroupMap.values()].sort((a, b) =>
    String(b.sample_dates[0]?.date || '').localeCompare(String(a.sample_dates[0]?.date || ''))
  );

  row.influencer_sample_dates = buyerOrders;
  row.influencer_sample_order_count = buyerOrders.length;
  row.influencer_same_model_duplicate_groups = mergedDuplicateGroups;
  row.influencer_same_model_duplicate_count = mergedDuplicateGroups.reduce((sum, group) => sum + group.count, 0);
  row.application_sample_dates = skuOrders;
  row.application_sample_order_count = skuOrders.length;

  row.sample_dates = skuOrders;
  row.sample_order_count = skuOrders.length;
  row.sample_date = skuOrders[0]?.date || '';
  row.sample_order_id = skuOrders[0]?.sample_order_id || null;
  row.has_duplicate_sample = skuOrders.length > 1;

  return row;
}

function splitTagsValue(value) {
  return String(value || '')
    .split(/[,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTagsValue(value) {
  const unique = [];
  splitTagsValue(value).forEach((tag) => {
    if (!unique.includes(tag)) unique.push(tag);
  });
  return unique.join(',');
}

function joinTagsList(tags) {
  return tags.filter(Boolean).join(',');
}

function tagContainsSql(columnExpr, placeholderIndex = '?') {
  return `(',' || REPLACE(REPLACE(REPLACE(TRIM(COALESCE(${columnExpr}, '')), '，', ','), '；', ','), ';', ',') || ',' LIKE '%,' || ${placeholderIndex} || ',%')`;
}

function clearZeroCommissionRates() {
  const rows = queryRows(
    `SELECT id, commission FROM records WHERE commission IS NOT NULL AND TRIM(commission) != ''`
  );
  let changed = 0;
  rows.forEach((row) => {
    const sanitized = sanitizeCommission(row.commission);
    if (!sanitized && row.commission) {
      db.run('UPDATE records SET commission = ? WHERE id = ?', ['', row.id]);
      changed++;
    }
  });
  if (changed) saveDb();
}

function seedAdminUser() {
  const existing = queryOne('SELECT id FROM staff WHERE name = ?', ['admin']);
  if (existing) return;
  db.run(
    `INSERT INTO staff (name, password_hash, commission_rate, supervisor_id, role)
     VALUES (?, ?, NULL, NULL, 'manager')`,
    ['admin', hashPassword('LujifoERPbyhw')]
  );
  saveDb();
}

function migrateArticlesAuthor() {
  const info = db.exec('PRAGMA table_info(articles)');
  if (!info.length) return;
  const columns = info[0].values.map((row) => row[1]);
  if (!columns.includes('author')) {
    db.run('ALTER TABLE articles ADD COLUMN author TEXT');
    saveDb();
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  migrateLegacyUsersTable();

  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      influencer_id TEXT NOT NULL,
      follower_count TEXT,
      expected_publish_rate TEXT,
      transaction_amount TEXT,
      avg_video_views TEXT,
      product_title TEXT,
      product_id TEXT,
      sku_id TEXT,
      commission TEXT,
      application_id TEXT UNIQUE,
      update_time TEXT,
      audit_status TEXT,
      remark TEXT,
      assignee TEXT,
      tags TEXT,
      imported_by TEXT,
      last_updated_by TEXT,
      last_updated_at TEXT,
      last_updated_content TEXT,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      commission_rate TEXT UNIQUE,
      supervisor_id INTEGER,
      role TEXT NOT NULL CHECK(role IN ('employee', 'manager')),
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supervisor_id) REFERENCES staff(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sku_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id TEXT NOT NULL UNIQUE,
      model_name TEXT NOT NULL,
      shop_name TEXT,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sample_order_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sample_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_key TEXT NOT NULL UNIQUE,
      data_json TEXT NOT NULL,
      buyer_username TEXT,
      sku_id TEXT,
      order_id TEXT,
      created_time_raw TEXT,
      created_time_ymd TEXT,
      imported_by TEXT,
      import_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alliance_order_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alliance_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_key TEXT NOT NULL UNIQUE,
      data_json TEXT NOT NULL,
      content_id TEXT,
      creator_username TEXT,
      order_id TEXT,
      payment_time_raw TEXT,
      payment_time_ymd TEXT,
      full_return TEXT,
      full_refund TEXT,
      is_refund INTEGER DEFAULT 0,
      imported_by TEXT,
      import_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS influencer_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_key TEXT NOT NULL UNIQUE,
      data_json TEXT NOT NULL,
      video_title TEXT,
      content_id TEXT,
      publish_date_raw TEXT,
      publish_date_ymd TEXT,
      video_url TEXT,
      creator_username TEXT,
      product_id TEXT,
      imported_by TEXT,
      import_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS influencer_profiles (
      influencer_id TEXT PRIMARY KEY,
      tags TEXT,
      assignee TEXT,
      remark TEXT,
      pinned INTEGER DEFAULT 0,
      pinned_at DATETIME,
      fulfillment_progress TEXT,
      updated_by TEXT,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS influencer_follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      influencer_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_influencer_follow_ups_influencer
    ON influencer_follow_ups(influencer_id)
  `);

  migrateInfluencerProfilesRemark();
  migrateInfluencerProfilesPinned();
  migrateInfluencerProfilesFulfillment();
  migrateInfluencerProfileInfluencerRemark();
  migrateInfluencerProfilesEmail();
  migrateFulfillmentProgressShortLabels();
  migrateRemoveDuplicateSampleTag();
  migrateRecordsAssignee();
  migrateRecordsTags();
  migrateRecordsMeta();
  migrateResyncSampleDatesPerSku();
  migrateReconcileSampleOrderYmdFromRaw();
  migrateReconcileSampleOrderYmdFromRawV2();
  migrateReconcileAlliancePaymentYmd();
  migrateClearAllianceOrdersColumnTrimV1();
  migrateInfluencerTagsToProfile();
  migrateStaffMailSettings();
  migrateEmailSendLogs();
  migrateEmailSendLogBatchIds();
  migrateInfluencerIdAliases();

  migrateRecordsAuditStatusAt();
  migrateSkuModelsShopName();
  migrateArticlesAuthor();
  backfillImportBatchTime();
  migrateImportBatchTimeToBeijing();
  migrateOrderImportTimeToBeijing();
  clearZeroCommissionRates();
  seedAdminUser();
  rebuildAllianceOrderDerivedFields();
  migrateRepairFutureSwappedAlliancePaymentDates();
  saveDb();
}

function findStaffByName(name) {
  return Promise.resolve(queryOne('SELECT * FROM staff WHERE name = ?', [name]));
}

function findStaffById(id) {
  return Promise.resolve(queryOne('SELECT * FROM staff WHERE id = ?', [id]));
}

function getAllStaff() {
  const rows = queryRows(`
    SELECT s.id, s.name, s.commission_rate, s.supervisor_id, s.role, s.create_time,
           sup.name AS supervisor_name
    FROM staff s
    LEFT JOIN staff sup ON sup.id = s.supervisor_id
    ORDER BY s.id ASC
  `);
  return Promise.resolve(rows);
}

function findStaffByCommissionRate(commission) {
  const normalized = normalizeCommissionRate(commission);
  if (!normalized) return Promise.resolve(null);
  const rows = queryRows('SELECT id, name, commission_rate, role FROM staff WHERE commission_rate IS NOT NULL');
  const matched = rows.find((row) => normalizeCommissionRate(row.commission_rate) === normalized);
  return Promise.resolve(matched || null);
}

function insertStaff({ name, password, commission_rate, supervisor_id, role }) {
  try {
    db.run(
      `INSERT INTO staff (name, password_hash, commission_rate, supervisor_id, role)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name,
        hashPassword(password),
        commission_rate ? normalizeCommissionRate(commission_rate) : null,
        supervisor_id || null,
        role,
      ]
    );
    saveDb();
    return Promise.resolve(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      if (String(err).includes('staff.name')) return Promise.reject(new Error('姓名已存在'));
      if (String(err).includes('staff.commission_rate')) {
        return Promise.reject(new Error('佣金率已存在，不能重复'));
      }
    }
    return Promise.reject(err);
  }
}

function updateStaff(id, fields) {
  return findStaffById(id).then((existing) => {
    if (!existing) return Promise.reject(new Error('人员不存在'));
    const updates = [];
    const params = [];

    if (fields.name !== undefined) {
      updates.push('name = ?');
      params.push(fields.name);
    }
    if (fields.password !== undefined && fields.password) {
      updates.push('password_hash = ?');
      params.push(hashPassword(fields.password));
    }
    if (fields.commission_rate !== undefined) {
      updates.push('commission_rate = ?');
      params.push(fields.commission_rate ? normalizeCommissionRate(fields.commission_rate) : null);
    }
    if (fields.supervisor_id !== undefined) {
      updates.push('supervisor_id = ?');
      params.push(fields.supervisor_id || null);
    }
    if (fields.role !== undefined) {
      updates.push('role = ?');
      params.push(fields.role);
    }

    if (!updates.length) return Promise.reject(new Error('没有可更新的字段'));

    params.push(id);
    try {
      db.run(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`, params);
      saveDb();
      return Promise.resolve(id);
    } catch (err) {
      if (String(err).includes('UNIQUE')) {
        if (String(err).includes('staff.name')) return Promise.reject(new Error('姓名已存在'));
        if (String(err).includes('staff.commission_rate')) {
          return Promise.reject(new Error('佣金率已存在，不能重复'));
        }
      }
      return Promise.reject(err);
    }
  });
}

function deleteStaff(id) {
  const existing = queryOne('SELECT id, name FROM staff WHERE id = ?', [id]);
  if (!existing) return Promise.reject(new Error('人员不存在'));
  if (existing.name === 'admin') return Promise.reject(new Error('不能删除管理员账号'));
  const children = queryOne('SELECT COUNT(*) AS cnt FROM staff WHERE supervisor_id = ?', [id]);
  if (children && children.cnt > 0) {
    return Promise.reject(new Error('该人员仍有下级，请先调整汇报关系'));
  }
  db.run('DELETE FROM staff WHERE id = ?', [id]);
  saveDb();
  return Promise.resolve(id);
}

function updateStaffPassword(id, password) {
  db.run('UPDATE staff SET password_hash = ? WHERE id = ?', [hashPassword(password), id]);
  saveDb();
  return Promise.resolve(id);
}

function getArticles() {
  return Promise.resolve(
    queryRows('SELECT id, title, author, create_time, update_time FROM articles ORDER BY update_time DESC')
  );
}

function getArticleById(id) {
  return Promise.resolve(queryOne('SELECT * FROM articles WHERE id = ?', [id]));
}

function insertArticle({ title, content, author }) {
  db.run('INSERT INTO articles (title, content, author) VALUES (?, ?, ?)', [
    title,
    content,
    author || '',
  ]);
  saveDb();
  return Promise.resolve(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
}

function updateArticle(id, { title, content }) {
  const existing = queryOne('SELECT id FROM articles WHERE id = ?', [id]);
  if (!existing) return Promise.reject(new Error('文章不存在'));
  db.run(
    `UPDATE articles SET title = ?, content = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`,
    [title, content, id]
  );
  saveDb();
  return Promise.resolve(id);
}

function deleteArticle(id) {
  const existing = queryOne('SELECT id FROM articles WHERE id = ?', [id]);
  if (!existing) return Promise.reject(new Error('文章不存在'));
  db.run('DELETE FROM articles WHERE id = ?', [id]);
  saveDb();
  return Promise.resolve(id);
}

function findByApplicationId(applicationId) {
  if (!applicationId) return Promise.resolve(null);
  return Promise.resolve(queryOne('SELECT id FROM records WHERE application_id = ?', [applicationId]));
}

function findExistingRecord({ applicationId }) {
  return findByApplicationId(applicationId);
}

function insertRecord(record) {
  try {
    db.run(
      `INSERT INTO records (
        influencer_id, follower_count, expected_publish_rate, transaction_amount,
        avg_video_views, product_title, product_id, sku_id, commission,
        application_id, update_time, audit_status, audit_reason, remark, assignee, tags, imported_by, import_batch_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.influencer_id,
        record.follower_count,
        record.expected_publish_rate,
        record.transaction_amount,
        record.avg_video_views,
        record.product_title,
        record.product_id,
        record.sku_id,
        sanitizeCommission(record.commission),
        record.application_id || null,
        record.update_time,
        record.audit_status,
        record.audit_reason || '',
        record.remark,
        record.assignee || '',
        normalizeTagsValue(record.tags),
        record.imported_by || '',
        record.import_batch_time || '',
      ]
    );
    saveDb();
    return Promise.resolve(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  } catch (err) {
    return Promise.reject(err);
  }
}

function colName(name, prefix = '') {
  return prefix ? `${prefix}.${name}` : name;
}

function recordsSelectFields(prefix = 'r') {
  return `
    ${colName('id', prefix)}, ${colName('influencer_id', prefix)}, ${colName('follower_count', prefix)},
    ${colName('expected_publish_rate', prefix)}, ${colName('transaction_amount', prefix)},
    ${colName('avg_video_views', prefix)}, ${colName('product_title', prefix)}, ${colName('product_id', prefix)},
    ${colName('sku_id', prefix)}, ${colName('commission', prefix)}, ${colName('application_id', prefix)},
    ${colName('update_time', prefix)}, ${colName('audit_status', prefix)}, ${colName('audit_status_at', prefix)},
    ${colName('audit_reason', prefix)},
    ${colName('remark', prefix)}, ${colName('sample_date', prefix)}, ${colName('sample_order_id', prefix)},
    ${colName('assignee', prefix)}, ${colName('tags', prefix)},
    ${colName('imported_by', prefix)}, ${colName('import_batch_time', prefix)}, ${colName('last_updated_by', prefix)}, ${colName('last_updated_at', prefix)},
    ${colName('last_updated_content', prefix)}, ${colName('create_time', prefix)},
    COALESCE(ip.pinned, 0) AS pinned,
    sm.model_name AS model,
    sm.shop_name AS shop_name
  `;
}

function recordsFromJoin() {
  return `
    FROM records r
    LEFT JOIN sku_models sm ON TRIM(COALESCE(r.sku_id, '')) = TRIM(sm.sku_id)
    LEFT JOIN influencer_profiles ip ON TRIM(r.influencer_id) = TRIM(ip.influencer_id)
  `;
}

function getAllSkuModels() {
  return Promise.resolve(
    queryRows('SELECT id, sku_id, model_name, shop_name, create_time, update_time FROM sku_models ORDER BY sku_id ASC')
  );
}

function getSkuModelLookupMap() {
  const map = Object.create(null);
  queryRows(
    `SELECT sku_id, model_name, shop_name FROM sku_models WHERE TRIM(COALESCE(sku_id, '')) != '' AND TRIM(COALESCE(model_name, '')) != ''`
  ).forEach((row) => {
    map[String(row.sku_id).trim()] = {
      model_name: String(row.model_name).trim(),
      shop_name: String(row.shop_name || '').trim(),
    };
  });
  return map;
}

function lookupSkuModelEntry(skuId, skuModelMap) {
  const text = String(skuId || '').trim();
  if (!text || !skuModelMap) return null;
  if (skuModelMap[text]) {
    const entry = skuModelMap[text];
    return typeof entry === 'string' ? { model_name: entry, shop_name: '' } : entry;
  }
  const normalized = normalizeMatchKey(text);
  const matchedKey = Object.keys(skuModelMap).find((item) => normalizeMatchKey(item) === normalized);
  if (!matchedKey) return null;
  const entry = skuModelMap[matchedKey];
  return typeof entry === 'string' ? { model_name: entry, shop_name: '' } : entry;
}

function getSkuModelById(id) {
  return Promise.resolve(queryOne('SELECT * FROM sku_models WHERE id = ?', [id]));
}

function insertSkuModel({ sku_id, model_name, shop_name }) {
  const skuId = String(sku_id || '').trim();
  const modelName = String(model_name || '').trim();
  const shopName = String(shop_name || '').trim();
  if (!skuId || !modelName) return Promise.reject(new Error('skuID 和型号不能为空'));
  try {
    db.run('INSERT INTO sku_models (sku_id, model_name, shop_name) VALUES (?, ?, ?)', [skuId, modelName, shopName]);
    saveDb();
    return Promise.resolve(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  } catch (err) {
    if (String(err).includes('UNIQUE')) return Promise.reject(new Error('skuID 已存在'));
    return Promise.reject(err);
  }
}

function updateSkuModel(id, { sku_id, model_name, shop_name }) {
  return getSkuModelById(id).then((existing) => {
    if (!existing) return Promise.reject(new Error('记录不存在'));
    const skuId = sku_id !== undefined ? String(sku_id || '').trim() : existing.sku_id;
    const modelName = model_name !== undefined ? String(model_name || '').trim() : existing.model_name;
    const shopName = shop_name !== undefined ? String(shop_name || '').trim() : existing.shop_name || '';
    if (!skuId || !modelName) return Promise.reject(new Error('skuID 和型号不能为空'));
    try {
      db.run(
        'UPDATE sku_models SET sku_id = ?, model_name = ?, shop_name = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?',
        [skuId, modelName, shopName, id]
      );
      saveDb();
      return Promise.resolve(id);
    } catch (err) {
      if (String(err).includes('UNIQUE')) return Promise.reject(new Error('skuID 已存在'));
      return Promise.reject(err);
    }
  });
}

function deleteSkuModel(id) {
  const existing = queryOne('SELECT id FROM sku_models WHERE id = ?', [id]);
  if (!existing) return Promise.reject(new Error('记录不存在'));
  db.run('DELETE FROM sku_models WHERE id = ?', [id]);
  saveDb();
  return Promise.resolve(id);
}

function auditCondition(alias = '') {
  const col = alias ? `${alias}.audit_status` : 'audit_status';
  return {
    pending: `(${col} IS NULL OR TRIM(${col}) = '' OR UPPER(TRIM(${col})) NOT IN ('Y', 'N', 'X'))`,
    tentative: `UPPER(TRIM(${col})) = 'X'`,
    approved: `UPPER(TRIM(${col})) = 'Y'`,
    rejected: `UPPER(TRIM(${col})) = 'N'`,
  };
}

function appendInfluencerProfileTagFilter(conditions, params, influencerIdCol, tagFilter) {
  if (tagFilter === '__empty__') {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM influencer_profiles ip_tag
      WHERE TRIM(ip_tag.influencer_id) = TRIM(${influencerIdCol})
      AND TRIM(COALESCE(ip_tag.tags, '')) != ''
    )`);
    return;
  }
  if (!tagFilter) return;
  conditions.push(`EXISTS (
    SELECT 1 FROM influencer_profiles ip_tag
    WHERE TRIM(ip_tag.influencer_id) = TRIM(${influencerIdCol})
    AND ${tagContainsSql('ip_tag.tags')}
  )`);
  params.push(tagFilter);
}

function buildBaseConditions(filters, { includeAssigneeScope = true, prefix = 'r' } = {}) {
  const conditions = [];
  const params = [];
  const col = (name) => colName(name, prefix);

  if (filters.influencer_id) {
    const keyword = String(filters.influencer_id).trim();
    const aliasValues = getInfluencerAliasDisplayValues(keyword);
    if (aliasValues.length > 1 || resolveCanonicalInfluencerId(keyword) !== keyword) {
      const clauses = aliasValues.map(() => `${col('influencer_id')} LIKE ?`);
      conditions.push(`(${clauses.join(' OR ')})`);
      aliasValues.forEach((value) => params.push(`%${value}%`));
    } else {
      conditions.push(`${col('influencer_id')} LIKE ?`);
      params.push(`%${keyword}%`);
    }
  }
  if (filters.commission === '__empty__') {
    conditions.push(`(${col('commission')} IS NULL OR TRIM(${col('commission')}) = '')`);
  } else if (filters.commission) {
    const normalized = normalizeCommissionRate(filters.commission);
    const plain = normalized.replace('%', '');
    conditions.push(`(
      TRIM(${col('commission')}) = ? OR TRIM(${col('commission')}) = ? OR
      REPLACE(REPLACE(TRIM(${col('commission')}), '%', ''), ' ', '') = ?
    )`);
    params.push(normalized, plain, plain);
  }
  if (filters.tags === '__empty__' || filters.tags) {
    appendInfluencerProfileTagFilter(conditions, params, col('influencer_id'), filters.tags);
  }
  if (includeAssigneeScope && filters.scope_assignee) {
    appendInfluencerAssigneeFilter(conditions, params, col('influencer_id'), filters.scope_assignee);
  }
  if (filters.assignee_filter === '__empty__') {
    appendEmptyInfluencerAssigneeFilter(conditions, params, col('influencer_id'));
  } else if (filters.assignee_filter === ASSIGNEE_CONFLICT_FILTER) {
    appendInfluencerAssigneeConflictFilter(conditions, params, col('influencer_id'));
  } else if (filters.assignee_filter) {
    appendInfluencerAssigneeFilter(conditions, params, col('influencer_id'), filters.assignee_filter);
  }
  if (filters.has_sample_date) {
    conditions.push(`(${col('sample_date')} IS NOT NULL AND TRIM(${col('sample_date')}) != '')`);
  }
  if (filters.sample_date_from) {
    conditions.push(`TRIM(COALESCE(${col('sample_date')}, '')) >= ?`);
    params.push(filters.sample_date_from);
  }
  if (filters.sample_date_to) {
    conditions.push(`TRIM(COALESCE(${col('sample_date')}, '')) <= ?`);
    params.push(filters.sample_date_to);
  }
  if (filters.audit_date_from || filters.audit_date_to) {
    conditions.push(`UPPER(TRIM(COALESCE(${col('audit_status')}, ''))) IN ('Y', 'N', 'X')`);
    conditions.push(`TRIM(COALESCE(${col('audit_status_at')}, '')) != ''`);
    const bounds = ymdToDateTimeBounds(filters.audit_date_from, filters.audit_date_to);
    if (bounds.start) {
      conditions.push(`${col('audit_status_at')} >= ?`);
      params.push(bounds.start);
    }
    if (bounds.end) {
      conditions.push(`${col('audit_status_at')} <= ?`);
      params.push(bounds.end);
    }
  }
  if (filters.import_batch) {
    conditions.push(`${col('import_batch_time')} = ?`);
    params.push(filters.import_batch);
  }
  if (filters.imported_by === '__empty__') {
    conditions.push(`(${col('imported_by')} IS NULL OR TRIM(${col('imported_by')}) = '')`);
  } else if (filters.imported_by) {
    conditions.push(`${col('imported_by')} = ?`);
    params.push(filters.imported_by);
  }
  if (filters.shop_name === '__empty__') {
    conditions.push(`(
      ${col('sku_id')} IS NULL OR TRIM(${col('sku_id')}) = '' OR
      NOT EXISTS (
        SELECT 1 FROM sku_models sm2
        WHERE TRIM(sm2.sku_id) = TRIM(${col('sku_id')}) AND TRIM(COALESCE(sm2.shop_name, '')) != ''
      )
    )`);
  } else if (filters.shop_name) {
    conditions.push(`EXISTS (
      SELECT 1 FROM sku_models sm2
      WHERE TRIM(sm2.sku_id) = TRIM(${col('sku_id')}) AND sm2.shop_name = ?
    )`);
    params.push(filters.shop_name);
  }

  return { conditions, params };
}

function buildInfluencerScopeClause(filters) {
  const { conditions, params } = buildBaseConditions(filters, { includeAssigneeScope: true, prefix: '' });
  const tab = filters.audit_tab || 'pending';

  if (tab !== 'all') {
    const audit = auditCondition();
    const auditExpr = audit[tab] || audit.pending;
    conditions.push(`(${auditExpr})`);
  }

  if (!conditions.length) return { clause: '', params: [] };
  return { clause: `WHERE ${conditions.join(' AND ')}`, params };
}

function buildRecordWhereForJoin(filters) {
  const { clause, params } = buildInfluencerScopeClause(filters);
  if (!clause) return { clause: '', params: [] };
  const prefixed = clause.replace(
    /(?<![.\w])(influencer_id|commission|tags|assignee|sample_date|import_batch_time|imported_by)\b/g,
    'r.$1'
  );
  return { clause: prefixed, params };
}

function shouldApplyPinSort(filters = {}) {
  return !(filters.apply_pin === false || filters.apply_pin === 0 || String(filters.apply_pin) === '0');
}

function getOrderClause(filters = {}, prefix = '') {
  const col = (name) => colName(name, prefix);
  const pinOrder = 'COALESCE(ip.pinned, 0) DESC, COALESCE(ip.pinned_at, \'\') DESC';
  const pinPrefix = shouldApplyPinSort(filters) ? `${pinOrder}, ` : '';
  const validFields = ['import_batch_time', 'audit_status_at', 'influencer_id', 'commission'];
  const sortField = validFields.includes(filters.sort_field) ? filters.sort_field : 'audit_status_at';
  const direction = filters.sort_order === 'asc' ? 'ASC' : 'DESC';
  const importTimeSort = `COALESCE(NULLIF(TRIM(${col('import_batch_time')}), ''), ${col('create_time')})`;
  const auditTimeSort = `COALESCE(NULLIF(TRIM(${col('audit_status_at')}), ''), '')`;
  const tieBreak = `${auditTimeSort} DESC, ${col('influencer_id')} ASC, ${col('create_time')} DESC`;

  if (sortField === 'commission') {
    return `
      ORDER BY
        ${pinPrefix}CASE
          WHEN ${col('commission')} IS NULL OR TRIM(${col('commission')}) = '' THEN -1
          ELSE CAST(REPLACE(REPLACE(${col('commission')}, '%', ''), ' ', '') AS REAL)
        END ${direction},
        ${tieBreak}
    `;
  }

  if (sortField === 'influencer_id') {
    return `ORDER BY ${pinPrefix}${col('influencer_id')} ${direction}, ${tieBreak}`;
  }

  if (sortField === 'import_batch_time') {
    return `ORDER BY ${pinPrefix}${importTimeSort} ${direction}, ${col('influencer_id')} ASC, ${col('create_time')} DESC`;
  }

  return `ORDER BY ${pinPrefix}${auditTimeSort} ${direction}, ${col('influencer_id')} ASC, ${col('create_time')} DESC`;
}

function countMatchingRecords(filters = {}) {
  const { clause, params } = buildRecordWhereForJoin(filters);
  return queryOne(`SELECT COUNT(*) AS total ${recordsFromJoin()} ${clause}`, params)?.total || 0;
}

function countDistinctInfluencers(filters = {}) {
  const { clause, params } = buildRecordWhereForJoin(filters);
  return (
    queryOne(
      `SELECT COUNT(DISTINCT r.influencer_id) AS total ${recordsFromJoin()} ${clause}`,
      params
    )?.total || 0
  );
}

function getInfluencerOrderByClause(filters = {}) {
  const col = (name) => colName(name, 'r');
  const pinPrefix = shouldApplyPinSort(filters)
    ? 'MAX(COALESCE(ip.pinned, 0)) DESC, MAX(COALESCE(ip.pinned_at, \'\')) DESC, '
    : '';
  const validFields = ['import_batch_time', 'audit_status_at', 'influencer_id', 'commission'];
  const sortField = validFields.includes(filters.sort_field) ? filters.sort_field : 'audit_status_at';
  const direction = filters.sort_order === 'asc' ? 'ASC' : 'DESC';
  const importTimeSort = `COALESCE(NULLIF(TRIM(${col('import_batch_time')}), ''), ${col('create_time')})`;
  const auditTimeSort = `COALESCE(NULLIF(TRIM(${col('audit_status_at')}), ''), '')`;
  const tieBreak = `MAX(${auditTimeSort}) DESC, r.influencer_id ASC`;

  if (sortField === 'commission') {
    const commExpr = `CASE
      WHEN ${col('commission')} IS NULL OR TRIM(${col('commission')}) = '' THEN -1
      ELSE CAST(REPLACE(REPLACE(TRIM(${col('commission')}), '%', ''), ' ', '') AS REAL)
    END`;
    return `${pinPrefix}MAX(${commExpr}) ${direction}, ${tieBreak}`;
  }

  if (sortField === 'influencer_id') {
    return `${pinPrefix}r.influencer_id ${direction}, ${tieBreak}`;
  }

  if (sortField === 'import_batch_time') {
    return `${pinPrefix}MAX(${importTimeSort}) ${direction}, r.influencer_id ASC`;
  }

  return `${pinPrefix}MAX(${auditTimeSort}) ${direction}, r.influencer_id ASC`;
}

function getPagedInfluencerIds(filters = {}, limit, offset) {
  const { clause, params } = buildRecordWhereForJoin(filters);
  const orderBy = getInfluencerOrderByClause(filters);
  const rows = queryRows(
    `
    SELECT r.influencer_id
    ${recordsFromJoin()}
    ${clause}
    GROUP BY r.influencer_id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );
  return rows.map((row) => row.influencer_id).filter(Boolean);
}

function appendInfluencerIdInClause(clause, params, influencerIds) {
  if (!influencerIds.length) return { clause: 'WHERE 1 = 0', params: [] };
  const placeholders = influencerIds.map(() => '?').join(', ');
  const inClause = `r.influencer_id IN (${placeholders})`;
  if (!clause) return { clause: `WHERE ${inClause}`, params: [...influencerIds] };
  return { clause: `${clause} AND ${inClause}`, params: [...params, ...influencerIds] };
}

function getRecords(filters = {}) {
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(filters.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;

  const totalRecords = countMatchingRecords(filters);
  const totalInfluencers = countDistinctInfluencers(filters);
  const influencerIds = getPagedInfluencerIds(filters, pageSize, offset);

  if (!influencerIds.length) {
    return Promise.resolve({
      rows: [],
      total: totalRecords,
      totalInfluencers,
      page,
      pageSize,
    });
  }

  const baseWhere = buildRecordWhereForJoin(filters);
  const { clause, params } = appendInfluencerIdInClause(
    baseWhere.clause,
    baseWhere.params,
    influencerIds
  );
  const orderClause = getOrderClause(filters, 'r');
  const rows = enrichRecordsWithMergedFields(
    queryRows(
      `
    SELECT ${recordsSelectFields('r')}
    ${recordsFromJoin()}
    ${clause}
    ${orderClause}
    `,
      params
    )
  );

  return Promise.resolve({
    rows,
    total: totalRecords,
    totalInfluencers,
    page,
    pageSize,
  });
}

function getAllRecordsForExport(filters = {}) {
  const { clause, params } = buildRecordWhereForJoin(filters);
  const orderClause = getOrderClause(filters, 'r');
  const rows = enrichRecordsWithMergedFields(
    queryRows(
      `
    SELECT ${recordsSelectFields('r')}
    ${recordsFromJoin()}
    ${clause}
    ${orderClause}
    `,
      params
    )
  );
  return Promise.resolve(rows);
}

function getCommissionFilterOptions(filters = {}) {
  const { conditions, params } = buildBaseConditions(
    { ...filters, commission: undefined },
    { includeAssigneeScope: true, prefix: '' }
  );
  const wherePrefix = conditions.length ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE';

  const emptyCount =
    queryOne(
      `
      SELECT COUNT(*) AS cnt FROM records
      ${wherePrefix} (commission IS NULL OR TRIM(commission) = '')
      `,
      params
    )?.cnt || 0;

  const rows = queryRows(
    `
    SELECT DISTINCT commission
    FROM records
    ${wherePrefix} commission IS NOT NULL AND TRIM(commission) != ''
    `,
    params
  );

  const seen = new Map();
  rows.forEach((row) => {
    const normalized = normalizeCommissionRate(row.commission);
    if (!normalized) return;
    const numKey = Number(normalized.replace('%', ''));
    if (Number.isNaN(numKey) || seen.has(numKey)) return;
    seen.set(numKey, normalized);
  });

  const rates = [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value);

  return Promise.resolve({
    commission_rates: rates,
    has_empty_commission: emptyCount > 0,
  });
}

function getDistinctCommissionRates(filters = {}) {
  return getCommissionFilterOptions(filters).then((result) => result.commission_rates);
}

function getTagFilterOptionsFromMeta(scopedKeys, metaMap) {
  const map = metaMap || buildInfluencerMetaMapForStats();
  const tagSet = new Set();
  let emptyCount = 0;
  scopedKeys.forEach((key) => {
    const entry = map.get(key);
    if (!entry || entry.tagSet.size === 0) {
      emptyCount += 1;
      return;
    }
    entry.tagSet.forEach((tag) => tagSet.add(tag));
  });
  return {
    tags: [...tagSet].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    has_empty_tags: emptyCount > 0,
  };
}

function getTagFilterOptions(filters = {}) {
  const scopedKeys = getScopedInfluencerKeysFromRecordFilters(filters);
  return Promise.resolve(getTagFilterOptionsFromMeta(scopedKeys, buildInfluencerMetaMapForStats()));
}

function getAssigneeFilterOptionsFromMeta(scopedKeys, metaMap) {
  const map = metaMap || buildInfluencerMetaMapForStats();
  const assigneeSet = new Set();
  let emptyCount = 0;
  let hasConflict = false;
  scopedKeys.forEach((key) => {
    const entry = map.get(key);
    if (!entry || entry.assigneeSet.size === 0) {
      emptyCount += 1;
      return;
    }
    if (entry.assigneeSet.size > 1) {
      hasConflict = true;
      return;
    }
    entry.assigneeSet.forEach((name) => assigneeSet.add(name));
  });
  return {
    assignees: [...assigneeSet].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    has_empty_assignee: emptyCount > 0,
    has_assignee_conflict: hasConflict,
  };
}

function getScopedInfluencerKeysFromRecordFilters(filters = {}) {
  const { conditions, params } = buildBaseConditions(
    { ...filters, assignee_filter: undefined },
    { includeAssigneeScope: true, prefix: '' }
  );
  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return new Set(
    queryRows(
      `
      SELECT DISTINCT influencer_id
      FROM records
      ${clause}
      `,
      params
    )
      .map((row) => normalizeMatchKey(row.influencer_id))
      .filter(Boolean)
  );
}

function getAssigneeFilterOptions(filters = {}) {
  const scopedKeys = getScopedInfluencerKeysFromRecordFilters(filters);
  return Promise.resolve(getAssigneeFilterOptionsFromMeta(scopedKeys, buildInfluencerMetaMapForStats()));
}

function getImportBatchFilterOptions(filters = {}) {
  const { conditions, params } = buildBaseConditions(
    { ...filters, import_batch: undefined },
    { includeAssigneeScope: true, prefix: '' }
  );
  const wherePrefix = conditions.length ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE';
  const rows = queryRows(
    `
    SELECT import_batch_time, COUNT(*) AS cnt
    FROM records
    ${wherePrefix} import_batch_time IS NOT NULL AND TRIM(import_batch_time) != ''
    GROUP BY import_batch_time
    ORDER BY import_batch_time DESC
    `,
    params
  );
  const import_batches = rows.map((row) => ({
    value: row.import_batch_time,
    count: row.cnt,
  }));
  return Promise.resolve({
    import_batches,
    latest_import_batch: import_batches[0]?.value || '',
  });
}

function getImportedByFilterOptions(filters = {}) {
  const { conditions, params } = buildBaseConditions(
    { ...filters, imported_by: undefined },
    { includeAssigneeScope: true, prefix: '' }
  );
  const wherePrefix = conditions.length ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE';
  const emptyCount =
    queryOne(
      `
      SELECT COUNT(*) AS cnt FROM records
      ${wherePrefix} (imported_by IS NULL OR TRIM(imported_by) = '')
      `,
      params
    )?.cnt || 0;
  const rows = queryRows(
    `
    SELECT DISTINCT imported_by
    FROM records
    ${wherePrefix} imported_by IS NOT NULL AND TRIM(imported_by) != ''
    ORDER BY imported_by ASC
    `,
    params
  );
  return Promise.resolve({
    importers: rows.map((row) => String(row.imported_by || '').trim()).filter(Boolean),
    has_empty_importer: emptyCount > 0,
  });
}

function getShopNameFilterOptions(filters = {}) {
  const { conditions, params } = buildBaseConditions(
    { ...filters, shop_name: undefined },
    { includeAssigneeScope: true, prefix: '' }
  );
  const wherePrefix = conditions.length ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE';
  const emptyCount =
    queryOne(
      `
      SELECT COUNT(*) AS cnt FROM records r
      ${wherePrefix} (
        r.sku_id IS NULL OR TRIM(r.sku_id) = '' OR
        NOT EXISTS (
          SELECT 1 FROM sku_models sm2
          WHERE TRIM(sm2.sku_id) = TRIM(r.sku_id) AND TRIM(COALESCE(sm2.shop_name, '')) != ''
        )
      )
      `,
      params
    )?.cnt || 0;
  const rows = queryRows(
    `
    SELECT DISTINCT sm.shop_name
    FROM records r
    INNER JOIN sku_models sm ON TRIM(COALESCE(r.sku_id, '')) = TRIM(sm.sku_id)
    ${wherePrefix} TRIM(COALESCE(sm.shop_name, '')) != ''
    ORDER BY sm.shop_name ASC
    `,
    params
  );
  return Promise.resolve({
    shop_names: rows.map((row) => String(row.shop_name || '').trim()).filter(Boolean),
    has_empty_shop_name: emptyCount > 0,
  });
}

function getAuditTabCounts(filters = {}) {
  const tabs = ['all', 'pending', 'tentative', 'approved', 'rejected'];
  const counts = {};
  tabs.forEach((tab) => {
    const { clause, params } = buildInfluencerScopeClause({ ...filters, audit_tab: tab });
    counts[tab] = queryOne(`SELECT COUNT(*) AS total FROM records ${clause}`, params)?.total || 0;
  });
  return Promise.resolve({
    all: counts.all,
    pending: counts.pending,
    tentative: counts.tentative,
    approved: counts.approved,
    rejected: counts.rejected,
  });
}

function findRecordById(id) {
  return Promise.resolve(queryOne('SELECT id, assignee FROM records WHERE id = ?', [id]));
}

function getRecordById(id) {
  return Promise.resolve(
    enrichRecordWithMergedTags(
      queryOne(
        `SELECT ${recordsSelectFields('r')} ${recordsFromJoin()} WHERE r.id = ?`,
        [id]
      )
    )
  );
}

function getRecordsByInfluencerId(influencerId, filters = {}) {
  const id = String(influencerId || '').trim();
  if (!id) return Promise.resolve([]);
  const conditions = [];
  const params = [];
  appendInfluencerIdSqlFilter(conditions, params, 'r.influencer_id', id);
  if (filters.scope_assignee) {
    appendInfluencerAssigneeFilter(conditions, params, 'r.influencer_id', filters.scope_assignee);
  }
  const rows = queryRows(
    `
      SELECT ${recordsSelectFields('r')}
      ${recordsFromJoin()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(NULLIF(TRIM(r.import_batch_time), ''), r.create_time) DESC, r.id DESC
      `,
    params
  );
  const enriched = filters.light
    ? enrichRecordsWithMergedFields(rows, { light: true, influencerId: id })
    : enrichRecordsWithMergedFields(rows);
  return Promise.resolve(enriched);
}

function getInfluencerFollowUpSummaryMap() {
  const map = new Map();
  queryRows(
    `
    SELECT influencer_id, COUNT(*) AS cnt
    FROM influencer_follow_ups
    WHERE TRIM(COALESCE(influencer_id, '')) != ''
    GROUP BY influencer_id
    `
  ).forEach((row) => {
    map.set(normalizeMatchKey(row.influencer_id), {
      follow_up_count: Number(row.cnt) || 0,
      latest_follow_up: '',
      latest_follow_up_at: '',
    });
  });
  queryRows(
    `
    SELECT f.influencer_id, f.content, f.created_at
    FROM influencer_follow_ups f
    INNER JOIN (
      SELECT influencer_id, MAX(id) AS max_id
      FROM influencer_follow_ups
      GROUP BY influencer_id
    ) latest ON TRIM(f.influencer_id) = TRIM(latest.influencer_id) AND f.id = latest.max_id
    `
  ).forEach((row) => {
    const key = normalizeMatchKey(row.influencer_id);
    const entry = map.get(key) || {
      follow_up_count: 0,
      latest_follow_up: '',
      latest_follow_up_at: '',
    };
    entry.latest_follow_up = String(row.content || '').trim();
    entry.latest_follow_up_at = String(row.created_at || '').trim();
    if (!entry.follow_up_count) entry.follow_up_count = 1;
    map.set(key, entry);
  });
  return map;
}

function getInfluencerFollowUpCountMap() {
  const map = new Map();
  getInfluencerFollowUpSummaryMap().forEach((entry, key) => {
    map.set(key, entry.follow_up_count);
  });
  return map;
}

function getInfluencerFollowUps(influencerId) {
  const id = String(influencerId || '').trim();
  if (!id) return Promise.resolve([]);
  const conditions = [];
  const params = [];
  appendInfluencerIdSqlFilter(conditions, params, 'influencer_id', id);
  return Promise.resolve(
    queryRows(
      `
      SELECT id, influencer_id, content, created_by, created_at
      FROM influencer_follow_ups
      WHERE ${conditions.join(' AND ')}
      ORDER BY datetime(created_at) DESC, id DESC
      `,
      params
    )
  );
}

function insertInfluencerFollowUp(influencerId, content, createdBy = '') {
  const id = String(influencerId || '').trim();
  const text = String(content || '').trim();
  if (!id) return Promise.reject(new Error('达人 id 不能为空'));
  if (!text) return Promise.reject(new Error('跟进内容不能为空'));
  db.run(
    `INSERT INTO influencer_follow_ups (influencer_id, content, created_by) VALUES (?, ?, ?)`,
    [id, text, createdBy || '']
  );
  saveDb();
  return Promise.resolve(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
}

function deleteInfluencerFollowUp(followUpId) {
  const id = Number(followUpId);
  if (!id) return Promise.reject(new Error('无效的跟进记录 ID'));
  db.run('DELETE FROM influencer_follow_ups WHERE id = ?', [id]);
  saveDb();
  return Promise.resolve(true);
}

function influencerHasStoredEmail(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text === '未留') return true;
  return text.includes('@');
}

function getInfluencerEmailMap() {
  const rows = queryRows(
    `SELECT influencer_id, email FROM influencer_profiles WHERE TRIM(COALESCE(email, '')) != ''`
  );
  const map = new Map();
  rows.forEach((row) => {
    map.set(normalizeMatchKey(row.influencer_id), String(row.email || '').trim());
  });
  return map;
}

function updateInfluencerProfileEmail(influencerId, email, updatedBy = '') {
  const id = String(influencerId || '').trim();
  const value = String(email ?? '').trim();
  if (!id) return Promise.reject(new Error('达人 id 不能为空'));
  return upsertInfluencerProfile(id, { email: value }, updatedBy).then(() => value);
}

const {
  detectTikTokWafPage,
  pageHasTikTokProfileData,
  extractEmailFromTikTokHtml,
} = require('./tiktokEmailExtract');

async function scrapeTikTokInfluencerEmail(influencerId) {
  const username = String(influencerId || '').trim().replace(/^@+/, '');
  if (!username) throw new Error('达人 id 不能为空');
  const { fetchTikTokProfileHtmlServerSide } = require('./tiktokFetch');
  const html = await fetchTikTokProfileHtmlServerSide(username);
  if (/couldn't find this account|doesn't exist|page isn't available|not found/i.test(html)) {
    throw new Error('未找到该达人账号');
  }
  if (detectTikTokWafPage(html)) {
    throw new Error('TikTok 安全验证拦截，请先在浏览器打开该达人 TikTok 主页后再抓取');
  }
  if (!pageHasTikTokProfileData(html)) {
    throw new Error('未获取到 TikTok 个人简介数据');
  }
  const email = extractEmailFromTikTokHtml(html);
  return email || '未留';
}

async function batchScrapeInfluencerEmails(influencerIds = [], updatedBy = '') {
  const uniqueIds = [...new Set(influencerIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const emailMap = getInfluencerEmailMap();
  const results = [];
  for (const influencerId of uniqueIds) {
    const key = normalizeMatchKey(influencerId);
    if (influencerHasStoredEmail(emailMap.get(key))) {
      results.push({
        influencer_id: influencerId,
        email: emailMap.get(key),
        skipped: true,
        success: true,
      });
      continue;
    }
    try {
      const email = await scrapeTikTokInfluencerEmail(influencerId);
      await updateInfluencerProfileEmail(influencerId, email, updatedBy);
      emailMap.set(key, email);
      results.push({ influencer_id: influencerId, email, success: true, skipped: false });
    } catch (err) {
      results.push({
        influencer_id: influencerId,
        success: false,
        error: err.message || '抓取失败',
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return results;
}

function filterInfluencerIdsNeedingEmailScrape(influencerIds = []) {
  const emailMap = getInfluencerEmailMap();
  return [...new Set(influencerIds.map((id) => String(id || '').trim()).filter(Boolean))].filter((id) => {
    const key = normalizeMatchKey(id);
    return !influencerHasStoredEmail(emailMap.get(key));
  });
}

async function batchSaveInfluencerEmails(items = [], updatedBy = '') {
  const results = [];
  for (const item of items) {
    const influencerId = String(item?.influencer_id || '').trim();
    if (!influencerId) continue;
    try {
      const email = String(item?.email ?? '').trim();
      if (!email) throw new Error('邮箱不能为空');
      await updateInfluencerProfileEmail(influencerId, email, updatedBy);
      results.push({ influencer_id: influencerId, email, success: true });
    } catch (err) {
      results.push({
        influencer_id: influencerId,
        success: false,
        error: err.message || '保存失败',
      });
    }
  }
  return results;
}

function batchUpdateAssignee(ids, assignee, updatedBy = '') {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
  if (!uniqueIds.length) return Promise.resolve(0);
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const content = `负责人 → ${assignee}`;
  db.run(
    `UPDATE records SET assignee = ?, last_updated_by = ?, last_updated_at = CURRENT_TIMESTAMP, last_updated_content = ? WHERE id IN (${placeholders})`,
    [assignee, updatedBy, content, ...uniqueIds]
  );
  saveDb();
  return Promise.resolve(uniqueIds.length);
}

function batchDeleteRecords(ids) {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
  if (!uniqueIds.length) return Promise.resolve(0);
  const placeholders = uniqueIds.map(() => '?').join(', ');
  db.run(`DELETE FROM records WHERE id IN (${placeholders})`, uniqueIds);
  saveDb();
  return Promise.resolve(uniqueIds.length);
}

function getRecordIdsByFilters(filters = {}) {
  const { clause, params } = buildInfluencerScopeClause(filters);
  const rows = queryRows(`SELECT id FROM records ${clause}`, params);
  return Promise.resolve(rows.map((row) => row.id));
}

function getInfluencerIdsFromRecordIds(recordIds = []) {
  const ids = [...new Set(recordIds.map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) return Promise.resolve([]);
  const placeholders = ids.map(() => '?').join(', ');
  const rows = queryRows(
    `SELECT DISTINCT influencer_id FROM records WHERE id IN (${placeholders})`,
    ids
  );
  return Promise.resolve(rows.map((row) => row.influencer_id).filter(Boolean));
}

function getInfluencerIdsByRecordFilters(filters = {}) {
  const { clause, params } = buildRecordWhereForJoin(filters);
  const rows = queryRows(
    `SELECT DISTINCT r.influencer_id ${recordsFromJoin()} ${clause}`,
    params
  );
  return Promise.resolve(rows.map((row) => row.influencer_id).filter(Boolean));
}

function batchDistributeAssigneesByInfluencer(influencerIds, assignees, updatedBy = '') {
  const influencers = [...new Set(influencerIds.map((id) => String(id || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  );
  const managers = [...new Set(assignees.map((name) => String(name || '').trim()).filter(Boolean))];
  if (!influencers.length || !managers.length) return Promise.resolve({ influencers: 0, records: 0 });

  const groups = distributeEvenly(influencers, managers.length);
  let recordCount = 0;
  groups.forEach((group, index) => {
    const assignee = normalizeSingleAssigneeValue(managers[index]);
    group.forEach((influencerId) => {
      upsertInfluencerProfile(influencerId, { assignee }, updatedBy);
      syncInfluencerAssigneeToRecords(influencerId, assignee);
      const cnt =
        queryOne('SELECT COUNT(*) AS cnt FROM records WHERE influencer_id = ?', [influencerId])?.cnt || 0;
      recordCount += cnt;
    });
  });
  saveDb();
  return Promise.resolve({ influencers: influencers.length, records: recordCount });
}

function batchDistributeAssigneesByRecordIds(recordIds, assignees, updatedBy = '') {
  return getInfluencerIdsFromRecordIds(recordIds).then((influencerIds) =>
    batchDistributeAssigneesByInfluencer(influencerIds, assignees, updatedBy)
  );
}

function updateRecordFields(id, fields, meta = {}) {
  return getRecordById(id).then((existing) => {
    if (!existing) return Promise.reject(new Error('记录不存在'));
    const updates = [];
    const params = [];
    if (fields.audit_status !== undefined) {
      updates.push('audit_status = ?');
      params.push(fields.audit_status);
      if (String(fields.audit_status || '') !== String(existing.audit_status || '')) {
        updates.push('audit_status_at = CURRENT_TIMESTAMP');
      }
    }
    if (fields.remark !== undefined) {
      updates.push('remark = ?');
      params.push(fields.remark);
    }
    if (fields.tags !== undefined) {
      updates.push('tags = ?');
      params.push(normalizeTagsValue(fields.tags));
    }
    if (fields.audit_reason !== undefined) {
      updates.push('audit_reason = ?');
      params.push(fields.audit_reason);
    }
    if (!updates.length) return Promise.reject(new Error('没有可更新的字段'));
    if (meta.updatedBy) {
      updates.push('last_updated_by = ?');
      params.push(meta.updatedBy);
      updates.push('last_updated_at = CURRENT_TIMESTAMP');
      updates.push('last_updated_content = ?');
      params.push(meta.updatedContent || '');
    }
    params.push(id);
    db.run(`UPDATE records SET ${updates.join(', ')} WHERE id = ?`, params);
    saveDb();
    return Promise.resolve(id);
  });
}

const {
  SAMPLE_ORDER_COLUMNS,
  ALLIANCE_ORDER_COLUMNS,
  INFLUENCER_VIDEO_COLUMNS,
  INFLUENCER_VIDEO_DISPLAY_COLUMNS,
  RECORD_IMPORT_COLUMNS,
  readOrderFieldFromData,
  buildImportedOrderData,
  buildRecordImportData,
} = require('./public/js/order-columns.js');

function migrateRemoveDuplicateSampleTag() {
  ensureAppMetaTable();
  if (getAppMeta('remove_duplicate_sample_tag_v1') === '1') return;

  const tag = '重复寄样';
  queryRows('SELECT id, tags FROM records').forEach((row) => {
    const cleaned = removeTagIfPresent(row.tags, tag);
    if (cleaned !== (row.tags || '')) {
      db.run('UPDATE records SET tags = ? WHERE id = ?', [cleaned, row.id]);
    }
  });
  queryRows('SELECT influencer_id, tags FROM influencer_profiles').forEach((row) => {
    const cleaned = removeTagIfPresent(row.tags, tag);
    if (cleaned !== (row.tags || '')) {
      db.run('UPDATE influencer_profiles SET tags = ? WHERE influencer_id = ?', [cleaned, row.influencer_id]);
    }
  });
  setAppMeta('remove_duplicate_sample_tag_v1', '1');
  saveDb();
}

function migrateResyncSampleDatesPerSku() {
  ensureAppMetaTable();
  if (getAppMeta('sample_dates_per_sku_v1') === '1') return;
  syncSampleDatesToRecords();
  setAppMeta('sample_dates_per_sku_v1', '1');
}

function migrateReconcileSampleOrderYmdFromRaw() {
  ensureAppMetaTable();
  if (getAppMeta('sample_order_ymd_reconcile_v1') === '1') return;
  backfillSampleOrderYmdFromRaw();
  syncSampleDatesToRecords({ deferSave: true });
  setAppMeta('sample_order_ymd_reconcile_v1', '1');
  saveDb();
}

function migrateReconcileSampleOrderYmdFromRawV2() {
  ensureAppMetaTable();
  if (getAppMeta('sample_order_ymd_reconcile_v2') === '1') return;
  backfillSampleOrderYmdFromRaw();
  syncSampleDatesToRecords({ deferSave: true });
  setAppMeta('sample_order_ymd_reconcile_v2', '1');
  saveDb();
}

function migrateReconcileAlliancePaymentYmd() {
  ensureAppMetaTable();
  if (getAppMeta('alliance_payment_ymd_reconcile_v1') === '1') return;
  rebuildAllianceOrderDerivedFields();
  setAppMeta('alliance_payment_ymd_reconcile_v1', '1');
}

/** Obsolete: imports now use DD/MM; do not swap stored payment dates. */
function migrateRepairFutureSwappedAlliancePaymentDates() {
  ensureAppMetaTable();
  if (getAppMeta('alliance_payment_mdy_prefer_repair_v1') === '1') return;
  setAppMeta('alliance_payment_mdy_prefer_repair_v1', '1');
}

function migrateClearAllianceOrdersColumnTrimV1() {
  ensureAppMetaTable();
  if (getAppMeta('alliance_orders_column_trim_v1') === '1') return;
  db.run('DELETE FROM alliance_orders');
  db.run(`DELETE FROM alliance_order_meta WHERE key IN ('headers', 'last_import')`);
  setAppMeta('alliance_orders_column_trim_v1', '1');
  saveDb();
}

function migrateInfluencerTagsToProfile() {
  ensureAppMetaTable();
  if (getAppMeta('influencer_tags_profile_only_v1') === '1') return;

  const byKey = new Map();
  const addTags = (rawKey, influencerId, tagsValue) => {
    const key = normalizeMatchKey(rawKey);
    if (!key) return;
    if (!byKey.has(key)) {
      byKey.set(key, { influencer_id: String(influencerId || rawKey).trim(), tagList: [] });
    }
    const entry = byKey.get(key);
    if (influencerId) entry.influencer_id = String(influencerId).trim();
    splitTagsValue(tagsValue).forEach((tag) => {
      if (!entry.tagList.includes(tag)) entry.tagList.push(tag);
    });
  };

  queryRows(
    `SELECT influencer_id, tags FROM records
     WHERE TRIM(COALESCE(influencer_id, '')) != '' AND TRIM(COALESCE(tags, '')) != ''`
  ).forEach((row) => addTags(row.influencer_id, row.influencer_id, row.tags));
  queryRows(
    `SELECT influencer_id, tags FROM influencer_profiles WHERE TRIM(COALESCE(influencer_id, '')) != ''`
  ).forEach((row) => addTags(row.influencer_id, row.influencer_id, row.tags));

  byKey.forEach((entry) => {
    const merged = joinTagsList(entry.tagList);
    const existing = queryOne('SELECT influencer_id FROM influencer_profiles WHERE TRIM(influencer_id) = TRIM(?)', [
      entry.influencer_id,
    ]);
    if (existing) {
      db.run('UPDATE influencer_profiles SET tags = ? WHERE influencer_id = ?', [merged, existing.influencer_id]);
    } else if (merged) {
      db.run('INSERT INTO influencer_profiles (influencer_id, tags) VALUES (?, ?)', [entry.influencer_id, merged]);
    }
  });

  db.run(`UPDATE records SET tags = '' WHERE TRIM(COALESCE(tags, '')) != ''`);
  setAppMeta('influencer_tags_profile_only_v1', '1');
  saveDb();
}

function normalizeMatchKey(value) {
  return String(value || '').trim().toLowerCase();
}

let influencerAliasCache = null;

function invalidateInfluencerAliasCache() {
  influencerAliasCache = null;
}

function getInfluencerAliasCache() {
  if (influencerAliasCache) return influencerAliasCache;
  const aliasToCanonical = new Map();
  const canonicalToAliasKeys = new Map();
  queryRows(
    `SELECT canonical_influencer_id, alias_influencer_id FROM influencer_id_aliases`
  ).forEach((row) => {
    const canonical = String(row.canonical_influencer_id || '').trim();
    const alias = String(row.alias_influencer_id || '').trim();
    if (!canonical || !alias) return;
    const canonicalKey = normalizeMatchKey(canonical);
    const aliasKey = normalizeMatchKey(alias);
    aliasToCanonical.set(aliasKey, canonical);
    if (!canonicalToAliasKeys.has(canonicalKey)) canonicalToAliasKeys.set(canonicalKey, new Set());
    canonicalToAliasKeys.get(canonicalKey).add(aliasKey);
    canonicalToAliasKeys.get(canonicalKey).add(canonicalKey);
  });
  queryRows(`SELECT influencer_id FROM influencer_profiles WHERE TRIM(COALESCE(influencer_id, '')) != ''`).forEach(
    (row) => {
      const canonical = String(row.influencer_id || '').trim();
      if (!canonical) return;
      const canonicalKey = normalizeMatchKey(canonical);
      if (!canonicalToAliasKeys.has(canonicalKey)) canonicalToAliasKeys.set(canonicalKey, new Set([canonicalKey]));
    }
  );
  influencerAliasCache = { aliasToCanonical, canonicalToAliasKeys };
  return influencerAliasCache;
}

function resolveCanonicalInfluencerId(influencerId) {
  const value = String(influencerId || '').trim();
  if (!value) return '';
  const cache = getInfluencerAliasCache();
  return cache.aliasToCanonical.get(normalizeMatchKey(value)) || value;
}

function resolveCanonicalInfluencerKey(influencerId) {
  return normalizeMatchKey(resolveCanonicalInfluencerId(influencerId));
}

function getInfluencerAliasKeys(influencerId) {
  const canonical = resolveCanonicalInfluencerId(influencerId);
  const canonicalKey = normalizeMatchKey(canonical);
  const cache = getInfluencerAliasCache();
  const keys = cache.canonicalToAliasKeys.get(canonicalKey);
  return keys ? [...keys] : [canonicalKey];
}

function getInfluencerAliasDisplayValues(influencerId) {
  const canonical = resolveCanonicalInfluencerId(influencerId);
  const values = new Set([canonical]);
  queryRows(
    `SELECT alias_influencer_id FROM influencer_id_aliases WHERE LOWER(TRIM(canonical_influencer_id)) = ?`,
    [normalizeMatchKey(canonical)]
  ).forEach((row) => {
    const alias = String(row.alias_influencer_id || '').trim();
    if (alias) values.add(alias);
  });
  return [...values];
}

function appendInfluencerIdSqlFilter(conditions, params, column, influencerId) {
  const keys = getInfluencerAliasKeys(influencerId);
  if (!keys.length) return;
  if (keys.length === 1) {
    conditions.push(`LOWER(TRIM(${column})) = ?`);
    params.push(keys[0]);
    return;
  }
  conditions.push(`LOWER(TRIM(${column})) IN (${keys.map(() => '?').join(', ')})`);
  params.push(...keys);
}

function collectMapListValues(map, keys, dedupeFn) {
  const seen = new Set();
  const list = [];
  keys.forEach((key) => {
    (map.get(key) || []).forEach((item) => {
      const dedupeKey = dedupeFn(item);
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      list.push(item);
    });
  });
  return list;
}

function sampleOrderItemKey(item) {
  return `${item.sample_order_id}|${item.date}|${item.sku_id}`;
}

function collectSampleOrdersForInfluencer(maps, influencerId) {
  const keys = getInfluencerAliasKeys(influencerId);
  const orders = collectMapListValues(maps.byBuyer, keys, sampleOrderItemKey);
  return orders.sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      Number(b.sample_order_id) - Number(a.sample_order_id)
  );
}

function isAllianceOrderRefunded(order) {
  if (Number(order?.is_refund) === 1) return true;
  return isYesValue(order?.full_refund);
}

function allianceOrderPaymentTimeValidConditions(tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return [
    `TRIM(COALESCE(${prefix}payment_time_ymd, '')) != ''`,
    `CAST(SUBSTR(${prefix}payment_time_ymd, 5, 2) AS INTEGER) BETWEEN 1 AND 12`,
    `CAST(SUBSTR(${prefix}payment_time_ymd, 7, 2) AS INTEGER) BETWEEN 1 AND 31`,
  ];
}

function allianceOrderIsRefundedSql(tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `(
    ${prefix}is_refund = 1
    OR TRIM(COALESCE(${prefix}full_refund, '')) IN ('是', 'yes', 'YES', 'Yes', 'Y', 'y')
  )`;
}

function buildAllianceOrderStatsByInfluencerKey() {
  const statsMap = new Map();
  const ensure = (key) => {
    if (!statsMap.has(key)) {
      statsMap.set(key, { order_count: 0, refund_count: 0, videos: new Set(), creator_username: '' });
    }
    return statsMap.get(key);
  };

  queryRows(
    `
    SELECT creator_username, content_id, is_refund, full_refund, payment_time_ymd
    FROM alliance_orders
    WHERE TRIM(COALESCE(creator_username, '')) != ''
      AND ${allianceOrderPaymentTimeValidConditions().join(' AND ')}
    `
  ).forEach((order) => {
    const key = normalizeMatchKey(order.creator_username);
    if (!key) return;
    const agg = ensure(key);
    agg.order_count += 1;
    if (!agg.creator_username) agg.creator_username = String(order.creator_username).trim();
    const contentId = String(order.content_id || '').trim();
    if (contentId) agg.videos.add(contentId);
    if (isAllianceOrderRefunded(order)) agg.refund_count += 1;
  });

  const aggMap = new Map();
  statsMap.forEach((agg, key) => {
    aggMap.set(key, {
      creator_username: agg.creator_username,
      order_count: agg.order_count,
      video_count: agg.videos.size,
      refund_count: agg.refund_count,
      videos: agg.videos,
    });
  });
  return aggMap;
}

function mergeAllianceAggRows(aggMap, keys) {
  const videos = new Set();
  const merged = { video_count: 0, order_count: 0, refund_count: 0, creator_username: '' };
  keys.forEach((key) => {
    const agg = aggMap.get(key);
    if (!agg) return;
    merged.order_count += Number(agg.order_count) || 0;
    merged.refund_count += Number(agg.refund_count) || 0;
    if (agg.videos) {
      agg.videos.forEach((contentId) => videos.add(contentId));
    }
    if (!merged.creator_username && agg.creator_username) {
      merged.creator_username = String(agg.creator_username).trim();
    }
  });
  merged.video_count = videos.size;
  return merged;
}

function buildAllianceOrderStatsByContentId() {
  const statsMap = new Map();
  queryRows(
    `
    SELECT content_id, is_refund, full_refund, payment_time_ymd
    FROM alliance_orders
    WHERE TRIM(COALESCE(content_id, '')) != ''
      AND ${allianceOrderPaymentTimeValidConditions().join(' AND ')}
    `
  ).forEach((order) => {
    const contentId = String(order.content_id || '').trim();
    if (!contentId) return;
    if (!statsMap.has(contentId)) {
      statsMap.set(contentId, { order_count: 0, refund_count: 0 });
    }
    const agg = statsMap.get(contentId);
    agg.order_count += 1;
    if (isAllianceOrderRefunded(order)) agg.refund_count += 1;
  });
  return statsMap;
}

function buildInfluencerVideoStatsByCreatorKey() {
  const statsMap = new Map();
  queryRows(
    `
    SELECT creator_username, content_id
    FROM influencer_videos
    WHERE TRIM(COALESCE(creator_username, '')) != ''
    `
  ).forEach((row) => {
    const key = normalizeMatchKey(row.creator_username);
    if (!key) return;
    if (!statsMap.has(key)) {
      statsMap.set(key, { videos: new Set(), creator_username: String(row.creator_username).trim() });
    }
    const contentId = String(row.content_id || '').trim();
    if (contentId) statsMap.get(key).videos.add(contentId);
    if (!statsMap.get(key).creator_username) {
      statsMap.get(key).creator_username = String(row.creator_username).trim();
    }
  });
  return statsMap;
}

function buildInfluencerVideosIndexByCreatorKey() {
  const index = new Map();
  queryRows(
    `
    SELECT creator_username, content_id, publish_date_ymd
    FROM influencer_videos
    WHERE TRIM(COALESCE(creator_username, '')) != ''
    `
  ).forEach((row) => {
    const key = resolveCanonicalInfluencerKey(row.creator_username);
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({
      content_id: row.content_id,
      publish_date_ymd: row.publish_date_ymd,
    });
  });
  return index;
}

function computePublishedVideoStatsAfterSample(sampledInfluencers, videoIndex) {
  const contentIds = new Set();
  let publishedInfluencerCount = 0;
  sampledInfluencers.forEach((sampleDates, influencerKey) => {
    const videos = videoIndex.get(influencerKey) || [];
    const qualifyingIds = new Set();
    videos.forEach((video) => {
      const publishYmd = String(video.publish_date_ymd || '').trim();
      if (!isValidYmd(publishYmd)) return;
      const publishedAfterSample = [...sampleDates].some((sampleYmd) => publishYmd > sampleYmd);
      if (!publishedAfterSample) return;
      const contentId = String(video.content_id || '').trim();
      if (contentId) qualifyingIds.add(contentId);
    });
    if (qualifyingIds.size > 0) publishedInfluencerCount += 1;
    qualifyingIds.forEach((id) => contentIds.add(id));
  });
  return {
    published_video_count: contentIds.size,
    published_influencer_count: publishedInfluencerCount,
    content_id_list: [...contentIds],
  };
}

function getPublishedContentIdsAfterSampleForAssignee(assignee, dateFrom, dateTo, filters = {}) {
  const metaMap = buildInfluencerMetaMapForStats();
  const sampledInfluencers = new Map();
  queryRows(
    `SELECT buyer_username, created_time_ymd, created_time_raw
     FROM sample_orders
     WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((order) => {
    const ymd = resolveSampleOrderYmd(order);
    if (!ymdInRangeForStats(ymd, dateFrom, dateTo)) return;
    const meta = getInfluencerMetaForStats(metaMap, order.buyer_username, order.buyer_username);
    if (isAllocationTaggedInfluencerForStats(meta.tags, filters)) return;
    const assignees = getSampleStatsAssigneeTargets(meta, { scope_assignee: filters.scope_assignee });
    if (!assignees.includes(assignee)) return;
    const influencerKey = resolveCanonicalInfluencerKey(order.buyer_username);
    if (!influencerKey) return;
    if (!sampledInfluencers.has(influencerKey)) sampledInfluencers.set(influencerKey, new Set());
    sampledInfluencers.get(influencerKey).add(ymd);
  });
  const videoIndex = buildInfluencerVideosIndexByCreatorKey();
  return computePublishedVideoStatsAfterSample(sampledInfluencers, videoIndex).content_id_list;
}

function mergePublishedVideoCount(videoMap, keys) {
  const videos = new Set();
  keys.forEach((key) => {
    const agg = videoMap.get(key);
    if (!agg?.videos) return;
    agg.videos.forEach((contentId) => videos.add(contentId));
  });
  return videos.size;
}

function countPublishedVideosForCreatorNames(creatorNames, dateFrom, dateTo) {
  if (!creatorNames.length) return 0;
  const placeholders = creatorNames.map(() => '?').join(', ');
  const conditions = [
    `creator_username IN (${placeholders})`,
    `TRIM(COALESCE(content_id, '')) != ''`,
  ];
  const params = [...creatorNames];
  if (dateFrom && dateTo) {
    conditions.push(`TRIM(COALESCE(publish_date_ymd, '')) != ''`);
    conditions.push(`publish_date_ymd >= ?`);
    conditions.push(`publish_date_ymd <= ?`);
    params.push(dateFrom, dateTo);
  }
  const row = queryOne(
    `SELECT COUNT(DISTINCT content_id) AS cnt FROM influencer_videos WHERE ${conditions.join(' AND ')}`,
    params
  );
  return Number(row?.cnt) || 0;
}

function getSampledCreatorUsernamesForAssigneeInRange(assignee, dateFrom, dateTo) {
  if (!assignee || !dateFrom || !dateTo) return [];
  const metaMap = buildInfluencerMetaMapForStats();
  const names = new Set();
  queryRows(
    `SELECT buyer_username, created_time_ymd, created_time_raw
     FROM sample_orders
     WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((order) => {
    const ymd = resolveSampleOrderYmd(order);
    if (!ymdInRangeForStats(ymd, dateFrom, dateTo)) return;
    const meta = getInfluencerMetaForStats(metaMap, order.buyer_username, order.buyer_username);
    const assignees = getSampleStatsAssigneeTargets(meta, { scope_assignee: undefined });
    if (!assignees.includes(assignee)) return;
    names.add(String(order.buyer_username).trim());
  });
  return [...names];
}

function groupNormalizedKeysByCanonical(normalizedKeys, sampleBuyerMap, allianceCreatorMap) {
  const groups = new Map();
  normalizedKeys.forEach((key) => {
    const raw = sampleBuyerMap.get(key) || allianceCreatorMap.get(key) || key;
    const canonicalKey = resolveCanonicalInfluencerKey(raw);
    if (!groups.has(canonicalKey)) groups.set(canonicalKey, new Set());
    groups.get(canonicalKey).add(key);
  });
  return groups;
}

function getInfluencerIdRenameLogs(influencerId) {
  const keys = getInfluencerAliasKeys(influencerId);
  if (!keys.length) return Promise.resolve([]);
  const placeholders = keys.map(() => '?').join(', ');
  const rows = queryRows(
    `
    SELECT id, old_influencer_id, new_influencer_id, changed_by, changed_at
    FROM influencer_id_rename_logs
    WHERE LOWER(TRIM(old_influencer_id)) IN (${placeholders})
       OR LOWER(TRIM(new_influencer_id)) IN (${placeholders})
    ORDER BY datetime(changed_at) DESC, id DESC
    `,
    [...keys, ...keys]
  ).map((row) => ({
    ...row,
    changed_at: convertUtcStorageToBeijing(row.changed_at) || row.changed_at,
  }));
  return Promise.resolve(rows);
}

function pickDataField(data, aliases) {
  if (!data || typeof data !== 'object') return '';
  const keys = Object.keys(data);
  for (const alias of aliases) {
    const normalized = normalizeMatchKey(alias).replace(/\s+/g, '');
    const found = keys.find((key) => normalizeMatchKey(key).replace(/\s+/g, '') === normalized);
    if (found) return String(data[found] ?? '').trim();
  }
  return '';
}

function formatYmdFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function isValidYmd(ymd) {
  if (!/^\d{8}$/.test(String(ymd || ''))) return false;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() + 1 === month &&
    dt.getUTCDate() === day
  );
}

function normalizeParsedYear(yearPart) {
  const text = String(yearPart || '').trim();
  if (/^\d{4}$/.test(text)) return text;
  if (/^\d{2}$/.test(text)) {
    const n = Number(text);
    return n >= 70 ? `19${text}` : `20${text}`;
  }
  return text;
}

function buildYmdFromMonthDayYear(month, day, year) {
  const y = normalizeParsedYear(year);
  if (!/^\d{4}$/.test(y)) return '';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const ymd = `${y}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  return isValidYmd(ymd) ? ymd : '';
}

/** Slash-date order: 'dmy' = day/month/year (联盟订单); 'mdy' = month/day/year (样品/达人视频). */
const SLASH_DATE_ORDER_DMY = 'dmy';
const SLASH_DATE_ORDER_MDY = 'mdy';

/**
 * Parse slash date parts.
 * dmy: first=day, second=month. mdy: first=month, second=day.
 * Never auto-swap when out of range — empty means invalid.
 */
function parseSlashDateToYmd(parts, order = SLASH_DATE_ORDER_DMY) {
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  const year = parts[2];
  if (!Number.isFinite(first) || !Number.isFinite(second)) return '';
  if (order === SLASH_DATE_ORDER_MDY) {
    return buildYmdFromMonthDayYear(first, second, year);
  }
  return buildYmdFromMonthDayYear(second, first, year);
}

const IMPORT_DATE_FORMAT_ERROR = '导入Excel中的日期有误，请确认日期格式后再导入。';

function createImportDateFormatError() {
  const err = new Error(IMPORT_DATE_FORMAT_ERROR);
  err.code = 'IMPORT_DATE_FORMAT';
  return err;
}

function isAmbiguousSlashDateText(value) {
  const text = String(value || '').trim();
  return /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(text) && !/^\d{4}[./-]/.test(text);
}

/** Reject slash dates that are invalid under the given order (e.g. month segment > 12). */
function assertImportedDateValue(value, order = SLASH_DATE_ORDER_DMY) {
  const text = String(value || '').trim();
  if (!text) return;
  if (!isAmbiguousSlashDateText(text)) return;
  const parts = text.split(/[ T]/)[0].split(/[-/.]/);
  if (!parseSlashDateToYmd(parts, order)) throw createImportDateFormatError();
}

function parseCreatedTimeToYmd(value, order = SLASH_DATE_ORDER_DMY) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{8}$/.test(text)) return isValidYmd(text) ? text : '';
  if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}/.test(text)) {
    const parts = text.split(/[ T]/)[0].split(/[-/.]/);
    const y = parts[0];
    const m = String(parts[1]).padStart(2, '0');
    const d = String(parts[2]).padStart(2, '0');
    const ymd = `${y}${m}${d}`;
    return isValidYmd(ymd) ? ymd : '';
  }
  // Explicit slash parser — do not fall through to locale-dependent Date() on failure.
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(text)) {
    const parts = text.split(/[ T]/)[0].split(/[-/.]/);
    return parseSlashDateToYmd(parts, order) || '';
  }
  if (/\b(AM|PM)\b/i.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return formatYmdFromDate(date);
  }
  const serial = Number(text);
  if (!Number.isNaN(serial) && serial > 30000 && serial < 100000) {
    const epoch = new Date(1899, 11, 30);
    return formatYmdFromDate(new Date(epoch.getTime() + serial * 86400000));
  }
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return formatYmdFromDate(date);
  return '';
}

function resolveSampleOrderYmd(order) {
  const raw = String(order?.created_time_raw || '').trim();
  if (raw) {
    const parsed = parseCreatedTimeToYmd(raw, SLASH_DATE_ORDER_MDY);
    if (parsed) return parsed;
  }
  return String(order?.created_time_ymd || '').trim();
}

function resolveAlliancePaymentYmd(order) {
  const raw = String(order?.payment_time_raw || '').trim();
  if (raw) {
    const parsed = parseCreatedTimeToYmd(raw, SLASH_DATE_ORDER_DMY);
    if (parsed) return parsed;
  }
  return String(order?.payment_time_ymd || '').trim();
}

function sanitizeSampleOrderData(data = {}) {
  const cleaned = {};
  SAMPLE_ORDER_COLUMNS.forEach((column) => {
    cleaned[column.key] = readOrderFieldFromData(data, column.key, column.legacyAliases || []);
  });
  if (cleaned.created_time_raw) {
    cleaned.created_time_raw = normalizeImportedDateTimeRaw(cleaned.created_time_raw, SLASH_DATE_ORDER_MDY);
  }
  if (cleaned.received_time_raw) {
    cleaned.received_time_raw = normalizeImportedDateTimeRaw(cleaned.received_time_raw, SLASH_DATE_ORDER_MDY);
  }
  return cleaned;
}

function extractSampleOrderFields(data) {
  const buyer_username = readOrderFieldFromData(data, 'buyer_username', [
    '达人id', '达人ID', 'Buyer Username', 'buyer username', 'BuyerUsername', 'Creator Username',
  ]);
  const sku_id = readOrderFieldFromData(data, 'sku_id', ['skuID', 'SKU ID', 'Sku ID', 'skuid', 'SKU', 'sku_id']);
  const order_id = readOrderFieldFromData(data, 'order_id', [
    '订单id', '订单ID', 'Order ID', 'order id', 'OrderID', 'Main order ID', 'Platform order ID',
  ]);
  const created_time_raw = normalizeImportedDateTimeRaw(
    readOrderFieldFromData(data, 'created_time_raw', [
      '寄样时间', '寄样日期', 'Created Time', 'created time', 'CreatedTime',
    ]) ||
      readOrderFieldFromData(data, 'payment_time_raw', ['支付时间', 'Payment Time', 'payment_time']),
    SLASH_DATE_ORDER_MDY
  );
  const created_time_ymd = parseCreatedTimeToYmd(created_time_raw, SLASH_DATE_ORDER_MDY);
  return { buyer_username, sku_id, order_id, created_time_raw, created_time_ymd };
}

function setSampleOrderHeaders(headers) {
  db.run('INSERT OR REPLACE INTO sample_order_meta (key, value) VALUES (?, ?)', [
    'headers',
    JSON.stringify(headers || []),
  ]);
  saveDb();
}

function getSampleOrderHeaders() {
  const row = queryOne('SELECT value FROM sample_order_meta WHERE key = ?', ['headers']);
  if (!row?.value) return [];
  try {
    const headers = JSON.parse(row.value);
    return Array.isArray(headers) ? headers : [];
  } catch {
    return [];
  }
}

function setLastSampleOrderImport(summary, options = {}) {
  db.run('INSERT OR REPLACE INTO sample_order_meta (key, value) VALUES (?, ?)', [
    'last_import',
    JSON.stringify(summary || {}),
  ]);
  if (!options.deferSave) saveDb();
}

function getLastSampleOrderImport() {
  const row = queryOne('SELECT value FROM sample_order_meta WHERE key = ?', ['last_import']);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function findSampleOrderByUniqueKey(uniqueKey) {
  return Promise.resolve(queryOne('SELECT id FROM sample_orders WHERE unique_key = ?', [uniqueKey]));
}

function insertSampleOrder({ unique_key, data, imported_by, import_time }, options = {}) {
  const cleanedData = sanitizeSampleOrderData(data);
  const fields = extractSampleOrderFields(cleanedData);
  const resolvedImportTime = import_time || formatBeijingDateTime();
  db.run(
    `INSERT INTO sample_orders (
      unique_key, data_json, buyer_username, sku_id, order_id, created_time_raw, created_time_ymd, imported_by, import_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      unique_key,
      JSON.stringify(cleanedData || {}),
      fields.buyer_username,
      fields.sku_id,
      fields.order_id,
      fields.created_time_raw,
      fields.created_time_ymd,
      imported_by || '',
      resolvedImportTime,
    ]
  );
  if (!options.deferSave) saveDb();
  return Promise.resolve(getLastInsertRowId());
}

function getSampleOrderById(id) {
  const row = queryOne('SELECT * FROM sample_orders WHERE id = ?', [id]);
  if (!row) return Promise.resolve(null);
  let data = {};
  try {
    data = JSON.parse(row.data_json || '{}');
  } catch {
    data = {};
  }
  return Promise.resolve({ ...row, data });
}

function getSampleOrderPageNumber(id, pageSize = 50) {
  const order = queryOne('SELECT id FROM sample_orders WHERE id = ?', [id]);
  if (!order) return null;
  const countRow = queryOne('SELECT COUNT(*) AS total FROM sample_orders WHERE id > ?', [id]);
  const count = countRow?.total || 0;
  return Math.floor(count / pageSize) + 1;
}

function getSampleOrders(filters = {}) {
  const { where, params } = buildSampleOrderWhere(filters);
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(filters.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;
  const validSortFields = ['created_time', 'import_time', 'id'];
  const sortField = validSortFields.includes(filters.sort_field) ? filters.sort_field : 'created_time';
  const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';
  let orderBy = `id DESC`;
  if (sortField === 'created_time') {
    orderBy = `COALESCE(NULLIF(TRIM(created_time_ymd), ''), '') ${sortOrder}, id DESC`;
  } else if (sortField === 'import_time') {
    orderBy = `COALESCE(NULLIF(TRIM(import_time), ''), '') ${sortOrder}, id DESC`;
  }
  const total = queryOne(`SELECT COUNT(*) AS total FROM sample_orders ${where}`, params)?.total || 0;
  const rows = queryRows(
    `SELECT id, unique_key, data_json, buyer_username, sku_id, order_id, created_time_raw, created_time_ymd, imported_by, import_time
     FROM sample_orders ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  ).map((row) => {
    let data = {};
    try {
      data = JSON.parse(row.data_json || '{}');
    } catch {
      data = {};
    }
    return { ...row, data };
  });
  return Promise.resolve({ rows, total, page, pageSize, columns: SAMPLE_ORDER_COLUMNS });
}

function backfillSampleOrderYmdFromRaw() {
  let changed = false;
  queryRows(
    `SELECT id, created_time_raw, created_time_ymd FROM sample_orders
     WHERE TRIM(COALESCE(created_time_raw, '')) != ''`
  ).forEach((row) => {
    const ymd = parseCreatedTimeToYmd(row.created_time_raw, SLASH_DATE_ORDER_MDY);
    if (ymd && ymd !== String(row.created_time_ymd || '').trim()) {
      db.run('UPDATE sample_orders SET created_time_ymd = ? WHERE id = ?', [ymd, row.id]);
      changed = true;
    }
  });
  if (changed) saveDb();
}

function buildSampleOrderWhere(filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.order_id) {
    conditions.push('order_id LIKE ?');
    params.push(`%${filters.order_id}%`);
  }
  if (filters.buyer_username) {
    const keyword = String(filters.buyer_username).trim();
    const aliasValues = getInfluencerAliasDisplayValues(keyword);
    if (aliasValues.length > 1 || resolveCanonicalInfluencerId(keyword) !== keyword) {
      const clauses = aliasValues.map(() => 'buyer_username LIKE ?');
      conditions.push(`(${clauses.join(' OR ')})`);
      aliasValues.forEach((value) => params.push(`%${value}%`));
    } else {
      conditions.push('buyer_username LIKE ?');
      params.push(`%${keyword}%`);
    }
  }
  if (filters.sample_date_from && !filters.stats_aligned) {
    conditions.push('TRIM(COALESCE(created_time_ymd, \'\')) >= ?');
    params.push(filters.sample_date_from);
  }
  if (filters.sample_date_to && !filters.stats_aligned) {
    conditions.push('TRIM(COALESCE(created_time_ymd, \'\')) <= ?');
    params.push(filters.sample_date_to);
  }
  if (filters.import_time) {
    conditions.push('import_time = ?');
    params.push(filters.import_time);
  }
  if (filters.highlight_ids) {
    const ids = String(filters.highlight_ids)
      .split(',')
      .map((item) => Number(String(item || '').trim()))
      .filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(', ');
      conditions.push(`id IN (${placeholders})`);
      params.push(...ids);
    }
  }
  const assigneeName = filters.assignee_filter || filters.scope_assignee;
  if (assigneeName) {
    if (filters.stats_aligned) {
      const matches = getSampleOrderIdsMatchingStatsFilters({
        assignee_filter: assigneeName,
        sample_date_from: filters.sample_date_from,
        sample_date_to: filters.sample_date_to,
        include_allocation_tag: filters.include_allocation_tag,
        scope_assignee: filters.scope_assignee,
      });
      const orderIds = matches.map((item) => item.id).filter(Boolean);
      if (!orderIds.length) {
        conditions.push('1 = 0');
      } else {
        const placeholders = orderIds.map(() => '?').join(', ');
        conditions.push(`id IN (${placeholders})`);
        params.push(...orderIds);
      }
    } else {
      const creators = getCreatorUsernamesForAssignee(assigneeName);
      if (!creators.length) {
        conditions.push('1 = 0');
      } else {
        const placeholders = creators.map(() => '?').join(', ');
        conditions.push(`buyer_username IN (${placeholders})`);
        params.push(...creators);
      }
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

function getSampleOrderImportTimeOptions(filters = {}) {
  const { where, params } = buildSampleOrderWhere({ ...filters, import_time: undefined });
  const wherePrefix = where ? `${where} AND` : 'WHERE';
  const rows = queryRows(
    `
    SELECT import_time, COUNT(*) AS cnt
    FROM sample_orders
    ${wherePrefix} import_time IS NOT NULL AND TRIM(import_time) != ''
    GROUP BY import_time
    ORDER BY import_time DESC
    `,
    params
  );
  return Promise.resolve({
    import_times: rows.map((row) => ({
      value: row.import_time,
      count: row.cnt,
    })),
  });
}

function getSampleOrderIdsByFilters(filters = {}) {
  const { where, params } = buildSampleOrderWhere(filters);
  const rows = queryRows(`SELECT id FROM sample_orders ${where}`, params);
  return Promise.resolve(rows.map((row) => row.id));
}

function batchDeleteSampleOrders(ids) {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
  if (!uniqueIds.length) return Promise.resolve(0);
  const placeholders = uniqueIds.map(() => '?').join(', ');
  db.run(`DELETE FROM sample_orders WHERE id IN (${placeholders})`, uniqueIds);
  saveDb();
  return syncSampleDatesToRecords().then(() => uniqueIds.length);
}

function getAllSampleOrdersForSync() {
  return queryRows(
    `SELECT id, buyer_username, sku_id, created_time_ymd, created_time_raw
     FROM sample_orders
     WHERE TRIM(COALESCE(buyer_username, '')) != '' AND TRIM(COALESCE(sku_id, '')) != ''`
  );
}

function buildSampleOrderIndexMaps() {
  const byBuyerSku = new Map();
  const byBuyer = new Map();
  getAllSampleOrdersForSync().forEach((order) => {
    const date = resolveSampleOrderYmd(order);
    if (!date) return;
    const item = { date, sample_order_id: order.id, sku_id: String(order.sku_id || '').trim() };
    const buyerKey = normalizeMatchKey(order.buyer_username);
    const skuKey = `${buyerKey}|${normalizeMatchKey(order.sku_id)}`;
    if (!byBuyerSku.has(skuKey)) byBuyerSku.set(skuKey, []);
    byBuyerSku.get(skuKey).push(item);
    if (!byBuyer.has(buyerKey)) byBuyer.set(buyerKey, []);
    byBuyer.get(buyerKey).push(item);
  });
  const sortItems = (items) =>
    items.sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        Number(b.sample_order_id) - Number(a.sample_order_id)
    );
  byBuyerSku.forEach((items, key) => byBuyerSku.set(key, sortItems(items)));
  byBuyer.forEach((items, key) => byBuyer.set(key, sortItems(items)));
  return { byBuyerSku, byBuyer };
}

function resolveSkuModelName(skuId, skuModelMap) {
  const text = String(skuId || '').trim();
  if (!text) return '未知型号';
  const entry = lookupSkuModelEntry(text, skuModelMap);
  return entry?.model_name || text;
}

function buildSameModelDuplicateGroups(buyerKey, maps, skuModelMap) {
  const groups = [];
  maps.byBuyerSku.forEach((orders, skuKey) => {
    const sep = skuKey.indexOf('|');
    if (sep < 0) return;
    if (skuKey.slice(0, sep) !== buyerKey) return;
    if (orders.length <= 1) return;
    const skuId = orders[0]?.sku_id || skuKey.slice(sep + 1);
    groups.push({
      model_name: resolveSkuModelName(skuId, skuModelMap),
      sku_id: skuId,
      sample_dates: orders,
      count: orders.length,
    });
  });
  groups.sort((a, b) =>
    String(b.sample_dates[0]?.date || '').localeCompare(String(a.sample_dates[0]?.date || ''))
  );
  return groups;
}

function getLatestSampleOrderSummaryByBuyer() {
  const map = new Map();
  getAllSampleOrdersForSync().forEach((order) => {
    const key = normalizeMatchKey(order.buyer_username);
    if (!key) return;
    const sampleDate = resolveSampleOrderYmd(order);
    if (!sampleDate) return;
    const existing = map.get(key);
    if (
      !existing
      || String(sampleDate).localeCompare(String(existing.sample_date)) > 0
      || (sampleDate === existing.sample_date && Number(order.id) > Number(existing.sample_order_id))
    ) {
      map.set(key, {
        influencer_id: String(order.buyer_username || '').trim(),
        sample_date: sampleDate,
        sample_order_id: order.id,
      });
    }
  });
  return map;
}

function addTagIfMissing(tagsValue, tagName) {
  const tags = splitTagsValue(tagsValue);
  if (tags.includes(tagName)) return joinTagsList(tags);
  tags.push(tagName);
  return joinTagsList(tags);
}

function removeTagIfPresent(tagsValue, tagName) {
  return joinTagsList(splitTagsValue(tagsValue).filter((tag) => tag !== tagName));
}

function syncSampleDatesToRecords(options = {}) {
  const ordersMissingYmd = queryRows(
    `SELECT id, created_time_raw FROM sample_orders
     WHERE TRIM(COALESCE(created_time_ymd, '')) = '' AND TRIM(COALESCE(created_time_raw, '')) != ''`
  );
  ordersMissingYmd.forEach((row) => {
    const ymd = parseCreatedTimeToYmd(row.created_time_raw, SLASH_DATE_ORDER_MDY);
    if (ymd) db.run('UPDATE sample_orders SET created_time_ymd = ? WHERE id = ?', [ymd, row.id]);
  });

  const orders = getAllSampleOrdersForSync();
  const orderGroups = new Map();
  orders.forEach((order) => {
    const key = `${normalizeMatchKey(order.buyer_username)}|${normalizeMatchKey(order.sku_id)}`;
    if (!orderGroups.has(key)) orderGroups.set(key, []);
    orderGroups.get(key).push(order);
  });

  orderGroups.forEach((items) => {
    items.sort((a, b) => {
      const ymd = String(resolveSampleOrderYmd(b)).localeCompare(String(resolveSampleOrderYmd(a)));
      if (ymd !== 0) return ymd;
      return Number(b.id) - Number(a.id);
    });
  });

  const records = queryRows(
    `SELECT id, influencer_id, sku_id, sample_date, sample_order_id
     FROM records
     WHERE TRIM(COALESCE(influencer_id, '')) != '' AND TRIM(COALESCE(sku_id, '')) != ''`
  );

  records.forEach((record) => {
    const key = `${normalizeMatchKey(record.influencer_id)}|${normalizeMatchKey(record.sku_id)}`;
    const matches = orderGroups.get(key) || [];
    if (!matches.length) {
      if (record.sample_date || record.sample_order_id) {
        db.run('UPDATE records SET sample_date = ?, sample_order_id = ? WHERE id = ?', ['', null, record.id]);
      }
      return;
    }

    const latest = matches[0];
    const sampleDate = resolveSampleOrderYmd(latest);
    db.run('UPDATE records SET sample_date = ?, sample_order_id = ? WHERE id = ?', [
      sampleDate || '',
      latest.id,
      record.id,
    ]);
  });

  if (!options.deferSave) saveDb();
  return Promise.resolve(true);
}

function importSampleOrdersBatch({ rows, imported_by, import_time }) {
  for (const row of rows) {
    const data = row.data || {};
    assertImportedDateValue(
      readOrderFieldFromData(data, 'created_time_raw', [
        '寄样时间', '寄样日期', 'Created Time', 'created time', 'CreatedTime',
      ]) || readOrderFieldFromData(data, 'payment_time_raw', ['支付时间', 'Payment Time', 'payment_time']),
      SLASH_DATE_ORDER_MDY
    );
    assertImportedDateValue(
      readOrderFieldFromData(data, 'received_time_raw', ['签收时间', '送达时间', 'Received Time', 'received_time']),
      SLASH_DATE_ORDER_MDY
    );
  }

  let inserted = 0;
  let skipped = 0;
  const duplicateKeys = [];
  const batchImportTime = import_time || formatBeijingDateTime();

  for (const row of rows) {
    const existing = queryOne('SELECT id FROM sample_orders WHERE unique_key = ?', [row.unique_key]);
    if (existing) {
      skipped++;
      duplicateKeys.push(row.unique_key);
      continue;
    }
    insertSampleOrder(
      {
        unique_key: row.unique_key,
        data: row.data,
        imported_by,
        import_time: batchImportTime,
      },
      { deferSave: true }
    );
    inserted++;
  }

  syncSampleDatesToRecords({ deferSave: true });
  setLastSampleOrderImport(
    {
      import_time: batchImportTime,
      imported_by,
      total: rows.length,
      inserted,
      skipped,
    },
    { deferSave: true }
  );
  saveDb();
  return Promise.resolve({ inserted, skipped, duplicateKeys, import_time: batchImportTime });
}

function isYesValue(value) {
  const text = String(value || '').trim();
  return text === '是' || text.toLowerCase() === 'yes' || text.toUpperCase() === 'Y';
}

function shiftBeijingYmd(dayOffset) {
  const parts = getBeijingDateParts();
  const date = new Date(`${parts.yearStr}-${parts.monthStr}-${parts.dayStr}T12:00:00+08:00`);
  date.setDate(date.getDate() + dayOffset);
  const next = getBeijingDateParts(date);
  return `${next.yearStr}${next.monthStr}${next.dayStr}`;
}

function defaultSampleStatsDateRange() {
  return {
    start: shiftBeijingYmd(-45),
    end: shiftBeijingYmd(-15),
  };
}

function defaultDateFrom30Days() {
  const parts = getBeijingDateParts();
  const date = new Date(`${parts.yearStr}-${parts.monthStr}-${parts.dayStr}T12:00:00+08:00`);
  date.setDate(date.getDate() - 29);
  const next = getBeijingDateParts(date);
  return `${next.yearStr}${next.monthStr}${next.dayStr}`;
}

function defaultDateFrom15Days() {
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return formatYmdFromDate(date);
}

function sampleDateWithinLast15Days(sampleDate) {
  const text = String(sampleDate || '').trim();
  if (!isValidYmd(text)) return false;
  const today = formatYmdFromDate(new Date());
  const from = defaultDateFrom15Days();
  return text >= from && text <= today;
}

function sampleDateOlderThan15Days(sampleDate) {
  const text = String(sampleDate || '').trim();
  if (!isValidYmd(text)) return false;
  return text < defaultDateFrom15Days();
}

function matchesCollaboratedTab(row, tab) {
  const orderCount = Number(row.order_count || 0);
  if (tab === 'recent_sample') {
    return sampleDateWithinLast15Days(row.sample_date);
  }
  if (tab === 'ordered') {
    return sampleDateOlderThan15Days(row.sample_date) && orderCount !== 0;
  }
  if (tab === 'no_order') {
    return sampleDateOlderThan15Days(row.sample_date) && orderCount === 0;
  }
  return true;
}

function normalizeYmdInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{8}$/.test(text)) return text;
  return parseCreatedTimeToYmd(text);
}

function pad2DatePart(value) {
  return String(value ?? '').padStart(2, '0');
}

function extractTimePartsFromText(text) {
  const match = String(text || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] != null ? Number(match[3]) : null;
  const ampm = (match[4] || '').toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (second != null && (second < 0 || second > 59)) return null;
  return {
    hour,
    minute,
    second: second == null ? 0 : second,
    hasSeconds: match[3] != null,
  };
}

function formatDisplayDateTimeParts({ year, month, day, hour, minute, second, hasTime, hasSeconds }) {
  const datePart = `${year}/${pad2DatePart(month)}/${pad2DatePart(day)}`;
  if (!hasTime) return datePart;
  const timePart = `${pad2DatePart(hour)}:${pad2DatePart(minute)}`;
  if (hasSeconds) return `${datePart} ${timePart}:${pad2DatePart(second || 0)}`;
  return `${datePart} ${timePart}`;
}

/** 将导入日期规范为 yyyy/mm/dd 或 yyyy/mm/dd HH:mm(:ss)；order 控制斜杠日月顺序 */
function normalizeImportedDateTimeRaw(value, order = SLASH_DATE_ORDER_DMY) {
  const text = String(value || '').trim();
  if (!text) return '';
  const ymd = parseCreatedTimeToYmd(text, order);
  if (!ymd) return text;
  const time = extractTimePartsFromText(text);
  return formatDisplayDateTimeParts({
    year: ymd.slice(0, 4),
    month: ymd.slice(4, 6),
    day: ymd.slice(6, 8),
    hour: time?.hour || 0,
    minute: time?.minute || 0,
    second: time?.second || 0,
    hasTime: Boolean(time),
    hasSeconds: Boolean(time?.hasSeconds),
  });
}

function sanitizeAllianceOrderData(data = {}) {
  const cleaned = {};
  ALLIANCE_ORDER_COLUMNS.forEach((column) => {
    cleaned[column.key] = readOrderFieldFromData(data, column.key, column.legacyAliases || []);
  });
  if (cleaned.payment_time_raw) {
    cleaned.payment_time_raw = normalizeImportedDateTimeRaw(cleaned.payment_time_raw);
  }
  return cleaned;
}

function extractAllianceOrderFields(data) {
  const order_id = readOrderFieldFromData(data, 'order_id', ['订单id', '订单 ID', 'Order ID', 'unique_key']);
  const content_id = readOrderFieldFromData(data, 'content_id', ['内容id', '内容 ID', 'Content ID']);
  const creator_username = readOrderFieldFromData(data, 'creator_username', ['达人id', '达人 ID', 'Creator Username']);
  const payment_time_raw = normalizeImportedDateTimeRaw(
    readOrderFieldFromData(data, 'payment_time_raw', ['支付时间', 'Payment Time'])
  );
  const payment_time_ymd = parseCreatedTimeToYmd(payment_time_raw);
  const full_refund = readOrderFieldFromData(data, 'full_refund', ['已全部退款', '全额退款']);
  const full_return = full_refund;
  const is_refund = isYesValue(full_refund) ? 1 : 0;
  return {
    content_id,
    creator_username,
    order_id,
    payment_time_raw,
    payment_time_ymd,
    full_return,
    full_refund,
    is_refund,
  };
}

function setAllianceOrderHeaders(headers) {
  db.run('INSERT OR REPLACE INTO alliance_order_meta (key, value) VALUES (?, ?)', [
    'headers',
    JSON.stringify(headers || []),
  ]);
  saveDb();
}

function getAllianceOrderHeaders() {
  const row = queryOne('SELECT value FROM alliance_order_meta WHERE key = ?', ['headers']);
  if (!row?.value) return [];
  try {
    const headers = JSON.parse(row.value);
    return Array.isArray(headers) ? headers : [];
  } catch {
    return [];
  }
}

function setLastAllianceOrderImport(summary, options = {}) {
  db.run('INSERT OR REPLACE INTO alliance_order_meta (key, value) VALUES (?, ?)', [
    'last_import',
    JSON.stringify(summary || {}),
  ]);
  if (!options.deferSave) saveDb();
}

function getLastAllianceOrderImport() {
  const row = queryOne('SELECT value FROM alliance_order_meta WHERE key = ?', ['last_import']);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function findAllianceOrderByUniqueKey(uniqueKey) {
  const key = String(uniqueKey || '').trim();
  if (!key) return Promise.resolve(null);
  return Promise.resolve(
    queryOne('SELECT id FROM alliance_orders WHERE unique_key = ? OR order_id = ? LIMIT 1', [key, key])
  );
}

function insertAllianceOrder({ unique_key, data, imported_by, import_time }, options = {}) {
  const cleanedData = sanitizeAllianceOrderData(data);
  const fields = extractAllianceOrderFields(cleanedData);
  const resolvedUniqueKey = unique_key || fields.order_id;
  const resolvedImportTime = import_time || formatBeijingDateTime();
  db.run(
    `INSERT INTO alliance_orders (
      unique_key, data_json, content_id, creator_username, order_id,
      payment_time_raw, payment_time_ymd, full_return, full_refund, is_refund, imported_by, import_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      resolvedUniqueKey,
      JSON.stringify(cleanedData || {}),
      fields.content_id,
      fields.creator_username,
      fields.order_id,
      fields.payment_time_raw,
      fields.payment_time_ymd,
      fields.full_return,
      fields.full_refund,
      fields.is_refund,
      imported_by || '',
      resolvedImportTime,
    ]
  );
  if (!options.deferSave) saveDb();
  return Promise.resolve(getLastInsertRowId());
}

function updateAllianceOrder(id, { unique_key, data, imported_by, import_time }, options = {}) {
  const cleanedData = sanitizeAllianceOrderData(data);
  const fields = extractAllianceOrderFields(cleanedData);
  const resolvedUniqueKey = unique_key || fields.order_id;
  const resolvedImportTime = import_time || formatBeijingDateTime();
  db.run(
    `UPDATE alliance_orders SET
      unique_key = ?, data_json = ?, content_id = ?, creator_username = ?, order_id = ?,
      payment_time_raw = ?, payment_time_ymd = ?, full_return = ?, full_refund = ?, is_refund = ?,
      imported_by = ?, import_time = ?
     WHERE id = ?`,
    [
      resolvedUniqueKey,
      JSON.stringify(cleanedData || {}),
      fields.content_id,
      fields.creator_username,
      fields.order_id,
      fields.payment_time_raw,
      fields.payment_time_ymd,
      fields.full_return,
      fields.full_refund,
      fields.is_refund,
      imported_by || '',
      resolvedImportTime,
      id,
    ]
  );
  if (!options.deferSave) saveDb();
  return Promise.resolve(true);
}

function importAllianceOrdersBatch({ rows, imported_by, import_time }) {
  for (const row of rows) {
    assertImportedDateValue(
      readOrderFieldFromData(row.data || {}, 'payment_time_raw', ['支付时间', 'Payment Time'])
    );
  }

  let inserted = 0;
  let updated = 0;
  const batchImportTime = import_time || formatBeijingDateTime();

  for (const row of rows) {
    const key = String(row.unique_key || '').trim();
    const existing = key
      ? queryOne('SELECT id FROM alliance_orders WHERE unique_key = ? OR order_id = ? LIMIT 1', [key, key])
      : null;
    if (existing) {
      updateAllianceOrder(
        existing.id,
        {
          unique_key: row.unique_key,
          data: row.data,
          imported_by,
          import_time: batchImportTime,
        },
        { deferSave: true }
      );
      updated++;
      continue;
    }
    insertAllianceOrder(
      {
        unique_key: row.unique_key,
        data: row.data,
        imported_by,
        import_time: batchImportTime,
      },
      { deferSave: true }
    );
    inserted++;
  }

  setLastAllianceOrderImport(
    {
      import_time: batchImportTime,
      imported_by,
      total: rows.length,
      inserted,
      updated,
      skipped: 0,
    },
    { deferSave: true }
  );
  saveDb();
  return Promise.resolve({ inserted, updated, import_time: batchImportTime });
}

function backfillAllianceOrderDates() {
  rebuildAllianceOrderDerivedFields();
}

function rebuildAllianceOrderDerivedFields() {
  const rows = queryRows('SELECT id, data_json, payment_time_raw FROM alliance_orders');
  if (!rows.length) return;
  rows.forEach((row) => {
    let data = {};
    try {
      data = JSON.parse(row.data_json || '{}');
    } catch {
      data = {};
    }
    if (!data.payment_time_raw && row.payment_time_raw) {
      data.payment_time_raw = row.payment_time_raw;
    }
    const cleaned = sanitizeAllianceOrderData(data);
    const fields = extractAllianceOrderFields(cleaned);
    const payment_time_raw = fields.payment_time_raw || '';
    const payment_time_ymd = resolveAlliancePaymentYmd({ payment_time_raw, payment_time_ymd: fields.payment_time_ymd });
    db.run(
      `UPDATE alliance_orders SET
        data_json = ?, content_id = ?, creator_username = ?, order_id = ?,
        payment_time_raw = ?, payment_time_ymd = ?,
        full_return = ?, full_refund = ?, is_refund = ?
      WHERE id = ?`,
      [
        JSON.stringify(cleaned),
        fields.content_id,
        fields.creator_username,
        fields.order_id,
        payment_time_raw,
        payment_time_ymd,
        fields.full_return,
        fields.full_refund,
        fields.is_refund,
        row.id,
      ]
    );
  });
  saveDb();
}

function getAllianceOrderById(id) {
  const row = queryOne('SELECT * FROM alliance_orders WHERE id = ?', [id]);
  if (!row) return Promise.resolve(null);
  let data = {};
  try {
    data = JSON.parse(row.data_json || '{}');
  } catch {
    data = {};
  }
  return Promise.resolve({ ...row, data });
}

function getAllianceOrderPageNumber(id, pageSize = 50) {
  const order = queryOne('SELECT id FROM alliance_orders WHERE id = ?', [id]);
  if (!order) return null;
  const countRow = queryOne('SELECT COUNT(*) AS total FROM alliance_orders WHERE id > ?', [id]);
  const count = countRow?.total || 0;
  return Math.floor(count / pageSize) + 1;
}

function getAllianceOrders(filters = {}) {
  const { where, params } = buildAllianceOrderWhere(filters);
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(filters.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;
  const validSortFields = ['payment_time', 'import_time', 'id'];
  const sortField = validSortFields.includes(filters.sort_field) ? filters.sort_field : 'payment_time';
  const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';
  let orderBy = `id DESC`;
  if (sortField === 'payment_time') {
    orderBy = `COALESCE(NULLIF(TRIM(payment_time_ymd), ''), '') ${sortOrder}, COALESCE(NULLIF(TRIM(payment_time_raw), ''), '') ${sortOrder}, id DESC`;
  } else if (sortField === 'import_time') {
    orderBy = `COALESCE(NULLIF(TRIM(import_time), ''), '') ${sortOrder}, id DESC`;
  }
  const total = queryOne(`SELECT COUNT(*) AS total FROM alliance_orders ${where}`, params)?.total || 0;
  const rows = queryRows(
    `SELECT id, unique_key, data_json, content_id, creator_username, order_id, payment_time_raw, payment_time_ymd,
            full_return, full_refund, is_refund, imported_by, import_time
     FROM alliance_orders ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  ).map((row) => {
    let data = {};
    try {
      data = JSON.parse(row.data_json || '{}');
    } catch {
      data = {};
    }
    return { ...row, data };
  });
  return Promise.resolve({ rows, total, page, pageSize, columns: ALLIANCE_ORDER_COLUMNS });
}

function buildAllianceOrderWhere(filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.content_id) {
    conditions.push('content_id LIKE ?');
    params.push(`%${filters.content_id}%`);
  }
  if (filters.creator_username) {
    const keyword = String(filters.creator_username).trim();
    const aliasValues = getInfluencerAliasDisplayValues(keyword);
    if (aliasValues.length > 1 || resolveCanonicalInfluencerId(keyword) !== keyword) {
      const clauses = aliasValues.map(() => 'creator_username LIKE ?');
      conditions.push(`(${clauses.join(' OR ')})`);
      aliasValues.forEach((value) => params.push(`%${value}%`));
    } else {
      conditions.push('creator_username LIKE ?');
      params.push(`%${keyword}%`);
    }
  }
  if (filters.order_id) {
    conditions.push('order_id LIKE ?');
    params.push(`%${filters.order_id}%`);
  }
  if (filters.full_refund === '1' || filters.full_refund === 1 || filters.is_refund === '1' || filters.is_refund === 1) {
    conditions.push(allianceOrderIsRefundedSql());
  }
  if (filters.payment_from) {
    conditions.push('TRIM(COALESCE(payment_time_ymd, \'\')) >= ?');
    params.push(filters.payment_from);
  }
  if (filters.payment_to) {
    conditions.push('TRIM(COALESCE(payment_time_ymd, \'\')) <= ?');
    params.push(filters.payment_to);
  }
  if (filters.import_time) {
    conditions.push('import_time = ?');
    params.push(filters.import_time);
  }
  if (
    filters.payment_after_sample &&
    filters.sample_date_from &&
    filters.sample_date_to
  ) {
    // Assignee / allocation filters are applied inside matched IDs (alias-aware).
    const matchedIds = getAllianceOrderIdsMatchingPaymentAfterSample(filters);
    if (!matchedIds.length) {
      conditions.push('1 = 0');
    } else {
      const placeholders = matchedIds.map(() => '?').join(', ');
      conditions.push(`id IN (${placeholders})`);
      params.push(...matchedIds);
    }
  } else if (filters.assignee_filter) {
    const creators = getCreatorUsernamesForAssignee(filters.assignee_filter);
    if (!creators.length) {
      conditions.push('1 = 0');
    } else {
      const placeholders = creators.map(() => '?').join(', ');
      conditions.push(`creator_username IN (${placeholders})`);
      params.push(...creators);
    }
  } else if (filters.scope_assignee) {
    const creators = getCreatorUsernamesForAssignee(filters.scope_assignee);
    if (!creators.length) {
      conditions.push('1 = 0');
    } else {
      const placeholders = creators.map(() => '?').join(', ');
      conditions.push(`creator_username IN (${placeholders})`);
      params.push(...creators);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

function getAllianceOrderImportTimeOptions(filters = {}) {
  const { where, params } = buildAllianceOrderWhere({ ...filters, import_time: undefined });
  const wherePrefix = where ? `${where} AND` : 'WHERE';
  const rows = queryRows(
    `
    SELECT import_time, COUNT(*) AS cnt
    FROM alliance_orders
    ${wherePrefix} import_time IS NOT NULL AND TRIM(import_time) != ''
    GROUP BY import_time
    ORDER BY import_time DESC
    `,
    params
  );
  return Promise.resolve({
    import_times: rows.map((row) => ({
      value: row.import_time,
      count: row.cnt,
    })),
  });
}

function ymdToDateTimeBounds(fromYmd, toYmd) {
  const start = fromYmd && isValidYmd(fromYmd)
    ? `${fromYmd.slice(0, 4)}-${fromYmd.slice(4, 6)}-${fromYmd.slice(6, 8)} 00:00:00`
    : '';
  const end = toYmd && isValidYmd(toYmd)
    ? `${toYmd.slice(0, 4)}-${toYmd.slice(4, 6)}-${toYmd.slice(6, 8)} 23:59:59`
    : '';
  return { start, end };
}

function resolveSampleStatsDateRange(filters = {}) {
  let start = String(filters.date_from || '').trim();
  let end = String(filters.date_to || '').trim();
  if (!start || !end) {
    const defaults = defaultSampleStatsDateRange();
    start = defaults.start;
    end = defaults.end;
  }
  if (!isValidYmd(start) || !isValidYmd(end)) {
    throw new Error('时间格式无效，请使用 YYYYMMDD');
  }
  if (start > end) throw new Error('开始日期不能晚于结束日期');
  return {
    start,
    end,
    label: `${start} - ${end}`,
  };
}

function assigneeNameMatchesValue(assigneeName, value) {
  if (!assigneeName) return false;
  return splitAssigneeList(value).includes(assigneeName);
}

const SAMPLE_STATS_EMPTY_ASSIGNEE_KEY = '__empty__';

function getSampleStatsAssigneeTargets(meta, filters = {}) {
  if (meta.assignees.length) return meta.assignees;
  if (filters.scope_assignee) return [];
  return [SAMPLE_STATS_EMPTY_ASSIGNEE_KEY];
}

function getCreatorUsernamesForEmptyAssignee() {
  const creators = new Set();
  const metaMap = buildInfluencerMetaMapForStats();
  metaMap.forEach((entry) => {
    if (entry.assigneeSet.size === 0 && entry.influencer_id) {
      creators.add(String(entry.influencer_id).trim());
    }
  });
  queryRows(
    `SELECT DISTINCT buyer_username FROM sample_orders WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((row) => {
    const meta = getInfluencerMetaForStats(metaMap, row.buyer_username, row.buyer_username);
    if (!meta.assignees.length) creators.add(String(row.buyer_username).trim());
  });
  queryRows(
    `SELECT DISTINCT creator_username FROM alliance_orders WHERE TRIM(COALESCE(creator_username, '')) != ''`
  ).forEach((row) => {
    const meta = getInfluencerMetaForStats(metaMap, row.creator_username, row.creator_username);
    if (!meta.assignees.length) creators.add(String(row.creator_username).trim());
  });
  return [...creators];
}

function getCreatorUsernamesForAssignee(assigneeName) {
  if (assigneeName === SAMPLE_STATS_EMPTY_ASSIGNEE_KEY) {
    return getCreatorUsernamesForEmptyAssignee();
  }
  const creators = new Set();
  const metaMap = buildInfluencerMetaMapForStats();
  metaMap.forEach((entry) => {
    if (entry.assigneeSet.has(assigneeName) && entry.influencer_id) {
      creators.add(String(entry.influencer_id).trim());
    }
  });
  queryRows(
    `SELECT DISTINCT influencer_id FROM records WHERE TRIM(COALESCE(influencer_id, '')) != ''`
  ).forEach((row) => {
    if (assigneeNameMatchesValue(assigneeName, row.assignee)) {
      creators.add(String(row.influencer_id).trim());
    }
  });
  return [...creators];
}

function getSampleOrderBuyersMatchingStatsFilters(filters = {}) {
  return getSampleOrderIdsMatchingStatsFilters(filters).map((item) => item.buyer_username);
}

function getSampleOrderIdsMatchingStatsFilters(filters = {}) {
  backfillSampleOrderYmdFromRaw();
  const start = String(filters.sample_date_from || '').trim();
  const end = String(filters.sample_date_to || '').trim();
  if (!start || !end) return [];
  const metaMap = buildInfluencerMetaMapForStats();
  const statsFilters = {
    include_allocation_tag:
      filters.include_allocation_tag === true ||
      filters.include_allocation_tag === 1 ||
      String(filters.include_allocation_tag) === '1',
    scope_assignee: filters.scope_assignee,
  };
  const assignee = filters.assignee_filter;
  const matches = [];
  queryRows(
    `SELECT id, buyer_username, created_time_ymd, created_time_raw
     FROM sample_orders
     WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((order) => {
    const ymd = resolveSampleOrderYmd(order);
    if (!ymdInRangeForStats(ymd, start, end)) return;
    const meta = getInfluencerMetaForStats(metaMap, order.buyer_username, order.buyer_username);
    if (isAllocationTaggedInfluencerForStats(meta.tags, statsFilters)) return;
    const assignees = getSampleStatsAssigneeTargets(meta, statsFilters);
    if (!assignees.length) return;
    if (assignee && !assignees.includes(assignee)) return;
    matches.push({
      id: order.id,
      buyer_username: String(order.buyer_username).trim(),
    });
  });
  return matches;
}

function calcApprovalRatePercent(approved, rejected, tentative) {
  const denominator = approved + rejected + tentative;
  if (!denominator) return null;
  return Math.round((Number(approved || 0) / denominator) * 10000) / 100;
}

function calcOrderRatePercent(orderedInfluencerCount, sampleCount) {
  if (!Number(sampleCount)) return null;
  return Math.round((Number(orderedInfluencerCount || 0) / Number(sampleCount)) * 10000) / 100;
}

function calcAvgOrderCount(orderCount, sampleCount) {
  if (!Number(sampleCount)) return null;
  return Math.round((Number(orderCount || 0) / Number(sampleCount)) * 10) / 10;
}

function shouldIncludeAllocationTagInStats(filters = {}) {
  return (
    filters.include_allocation_tag === true ||
    filters.include_allocation_tag === 1 ||
    String(filters.include_allocation_tag) === '1'
  );
}

function isAllocationTaggedInfluencerForStats(tags, filters = {}) {
  if (shouldIncludeAllocationTagInStats(filters)) return false;
  return (tags || []).includes('分配');
}

function createEmptySampleShipmentStatsRow() {
  return {
    audit_approved: 0,
    audit_rejected: 0,
    audit_tentative: 0,
    approval_rate: null,
    sample_count: 0,
    published_video_count: 0,
    published_influencer_count: 0,
    ordered_influencer_count: 0,
    video_count: 0,
    order_count: 0,
    video_recovery_rate: null,
    order_rate: null,
    avg_order_count: null,
  };
}

function calcVideoRecoveryRatePercent(publishedInfluencerCount, sampleCount) {
  const publishedInfluencers = Number(publishedInfluencerCount) || 0;
  const samples = Number(sampleCount) || 0;
  if (samples <= 0) return null;
  return (publishedInfluencers / samples) * 100;
}

function finalizeSampleShipmentStatsRow(row) {
  row.approval_rate = calcApprovalRatePercent(
    row.audit_approved,
    row.audit_rejected,
    row.audit_tentative
  );
  row.video_recovery_rate = calcVideoRecoveryRatePercent(row.published_influencer_count, row.sample_count);
  row.order_rate = calcOrderRatePercent(row.ordered_influencer_count, row.sample_count);
  row.avg_order_count = calcAvgOrderCount(row.order_count, row.sample_count);
  return row;
}

function sumSampleShipmentStatsRows(rows = []) {
  const totals = createEmptySampleShipmentStatsRow();
  rows.forEach((row) => {
    totals.audit_approved += row.audit_approved;
    totals.audit_rejected += row.audit_rejected;
    totals.audit_tentative += row.audit_tentative;
    totals.sample_count += row.sample_count;
    totals.published_video_count += row.published_video_count;
    totals.published_influencer_count += row.published_influencer_count;
    totals.ordered_influencer_count += row.ordered_influencer_count;
    totals.video_count += row.video_count;
    totals.order_count += row.order_count;
  });
  return finalizeSampleShipmentStatsRow(totals);
}

function getOrderedAfterSampleInfluencerKeys(filters = {}) {
  const sampleFrom = String(filters.sample_date_from || '').trim();
  const sampleTo = String(filters.sample_date_to || '').trim();
  if (!sampleFrom || !sampleTo) return new Set();

  const metaMap = buildInfluencerMetaMapForStats();
  const sampledInfluencers = new Map();
  const statsFilters = {
    include_allocation_tag: filters.include_allocation_tag,
    scope_assignee: filters.scope_assignee,
  };

  queryRows(
    `SELECT buyer_username, created_time_ymd, created_time_raw
     FROM sample_orders
     WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((order) => {
    const ymd = resolveSampleOrderYmd(order);
    if (!ymdInRangeForStats(ymd, sampleFrom, sampleTo)) return;
    const meta = getInfluencerMetaForStats(metaMap, order.buyer_username, order.buyer_username);
    if (isAllocationTaggedInfluencerForStats(meta.tags, statsFilters)) return;
    if (filters.assignee_filter === SAMPLE_STATS_EMPTY_ASSIGNEE_KEY) {
      if (meta.assignees.length) return;
    } else if (filters.assignee_filter && !meta.assignees.includes(filters.assignee_filter)) return;
    if (filters.scope_assignee && !meta.assignees.includes(filters.scope_assignee)) return;
    if (
      (filters.assignee_filter || filters.scope_assignee) &&
      !meta.assignees.length &&
      filters.assignee_filter !== SAMPLE_STATS_EMPTY_ASSIGNEE_KEY
    ) {
      return;
    }
    const influencerKey = resolveCanonicalInfluencerKey(order.buyer_username);
    if (!influencerKey) return;
    if (!sampledInfluencers.has(influencerKey)) sampledInfluencers.set(influencerKey, new Set());
    sampledInfluencers.get(influencerKey).add(ymd);
  });

  const orderedKeys = new Set();
  queryRows(
    `
    SELECT creator_username, payment_time_ymd, payment_time_raw
    FROM alliance_orders
    WHERE TRIM(COALESCE(creator_username, '')) != ''
    `
  ).forEach((order) => {
    const influencerKey = resolveCanonicalInfluencerKey(order.creator_username);
    const sampleDates = sampledInfluencers.get(influencerKey);
    if (!sampleDates || !sampleDates.size) return;
    const meta = getInfluencerMetaForStats(metaMap, order.creator_username, order.creator_username);
    if (isAllocationTaggedInfluencerForStats(meta.tags, statsFilters)) return;
    const paymentYmd = resolveAlliancePaymentYmd(order);
    if (!paymentYmd) return;
    if ([...sampleDates].some((sampleYmd) => paymentYmd > sampleYmd)) {
      orderedKeys.add(influencerKey);
    }
  });
  return orderedKeys;
}

/** Alliance order IDs matching寄样统计「出单」口径（含达人别名、「分配」标签过滤）。 */
function getAllianceOrderIdsMatchingPaymentAfterSample(filters = {}) {
  const sampleFrom = String(filters.sample_date_from || '').trim();
  const sampleTo = String(filters.sample_date_to || '').trim();
  if (!sampleFrom || !sampleTo) return [];

  const metaMap = buildInfluencerMetaMapForStats();
  const statsFilters = {
    include_allocation_tag: filters.include_allocation_tag,
    scope_assignee: filters.scope_assignee,
  };
  const assignee = filters.assignee_filter;
  const sampledInfluencers = new Map();

  queryRows(
    `SELECT buyer_username, created_time_ymd, created_time_raw
     FROM sample_orders
     WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((order) => {
    const ymd = resolveSampleOrderYmd(order);
    if (!ymdInRangeForStats(ymd, sampleFrom, sampleTo)) return;
    const meta = getInfluencerMetaForStats(metaMap, order.buyer_username, order.buyer_username);
    if (isAllocationTaggedInfluencerForStats(meta.tags, statsFilters)) return;
    const assignees = getSampleStatsAssigneeTargets(meta, statsFilters);
    if (!assignees.length) return;
    if (assignee === SAMPLE_STATS_EMPTY_ASSIGNEE_KEY) {
      if (assignees.length !== 1 || assignees[0] !== SAMPLE_STATS_EMPTY_ASSIGNEE_KEY) return;
    } else if (assignee && !assignees.includes(assignee)) {
      return;
    }
    const influencerKey = resolveCanonicalInfluencerKey(order.buyer_username);
    if (!influencerKey) return;
    if (!sampledInfluencers.has(influencerKey)) sampledInfluencers.set(influencerKey, new Set());
    sampledInfluencers.get(influencerKey).add(ymd);
  });

  const matchedIds = [];
  queryRows(
    `
    SELECT id, creator_username, payment_time_ymd, payment_time_raw
    FROM alliance_orders
    WHERE TRIM(COALESCE(creator_username, '')) != ''
    `
  ).forEach((order) => {
    const influencerKey = resolveCanonicalInfluencerKey(order.creator_username);
    const sampleDates = sampledInfluencers.get(influencerKey);
    if (!sampleDates || !sampleDates.size) return;
    const meta = getInfluencerMetaForStats(metaMap, order.creator_username, order.creator_username);
    if (isAllocationTaggedInfluencerForStats(meta.tags, statsFilters)) return;
    if (assignee === SAMPLE_STATS_EMPTY_ASSIGNEE_KEY) {
      if (meta.assignees.length) return;
    } else if (assignee && !meta.assignees.includes(assignee)) {
      return;
    }
    const paymentYmd = resolveAlliancePaymentYmd(order);
    if (!paymentYmd) return;
    if ([...sampleDates].some((sampleYmd) => paymentYmd > sampleYmd)) {
      matchedIds.push(order.id);
    }
  });
  return matchedIds;
}

function getSampleShipmentStats(filters = {}) {
  const range = resolveSampleStatsDateRange(filters);
  const metaMap = buildInfluencerMetaMapForStats();
  const auditBounds = ymdToDateTimeBounds(range.start, range.end);
  const buckets = new Map();
  const global = {
    audit: { Y: 0, N: 0, X: 0 },
    sample_count: 0,
    sampledInfluencers: new Map(),
    allianceByInfluencer: new Map(),
  };
  const staffUnique = {
    audit: { Y: 0, N: 0, X: 0 },
    sample_count: 0,
    sampledInfluencers: new Map(),
    allianceByInfluencer: new Map(),
  };

  const ensureBucket = (assignee) => {
    if (!buckets.has(assignee)) {
      buckets.set(assignee, {
        audit: { Y: 0, N: 0, X: 0 },
        sample_count: 0,
        sampledInfluencers: new Map(),
        allianceByInfluencer: new Map(),
      });
    }
    return buckets.get(assignee);
  };

  const addSampleDate = (map, influencerKey, ymd) => {
    if (!map.has(influencerKey)) map.set(influencerKey, new Set());
    map.get(influencerKey).add(ymd);
  };

  const addAllianceOrder = (map, influencerKey, order) => {
    if (!map.has(influencerKey)) {
      map.set(influencerKey, { orderCount: 0, videos: new Set() });
    }
    const agg = map.get(influencerKey);
    agg.orderCount += 1;
    const contentId = String(order.content_id || '').trim();
    if (contentId) agg.videos.add(contentId);
  };

  const hasStaffAssignee = (assignees) =>
    assignees.some((name) => name !== SAMPLE_STATS_EMPTY_ASSIGNEE_KEY);

  queryRows(
    `SELECT id, influencer_id, assignee, audit_status, audit_status_at
     FROM records
     WHERE TRIM(COALESCE(influencer_id, '')) != ''`
  ).forEach((record) => {
    const status = normalizeAuditStatusForStats(record.audit_status);
    if (!['Y', 'N', 'X'].includes(status)) return;
    const auditAt = String(record.audit_status_at || '').trim();
    if (!auditAt) return;
    if (auditBounds.start && auditAt < auditBounds.start) return;
    if (auditBounds.end && auditAt > auditBounds.end) return;
    const meta = getInfluencerMetaForStats(metaMap, record.influencer_id, record.influencer_id);
    if (isAllocationTaggedInfluencerForStats(meta.tags, filters)) return;
    const assignees = getSampleStatsAssigneeTargets(meta, filters);
    if (!assignees.length) return;
    global.audit[status] += 1;
    if (hasStaffAssignee(assignees)) staffUnique.audit[status] += 1;
    assignees.forEach((assignee) => {
      ensureBucket(assignee).audit[status] += 1;
    });
  });

  queryRows(
    `SELECT buyer_username, created_time_ymd, created_time_raw
     FROM sample_orders
     WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((order) => {
    const ymd = resolveSampleOrderYmd(order);
    if (!ymdInRangeForStats(ymd, range.start, range.end)) return;
    const meta = getInfluencerMetaForStats(metaMap, order.buyer_username, order.buyer_username);
    if (isAllocationTaggedInfluencerForStats(meta.tags, filters)) return;
    const assignees = getSampleStatsAssigneeTargets(meta, filters);
    if (!assignees.length) return;
    const influencerKey = resolveCanonicalInfluencerKey(order.buyer_username);
    if (!influencerKey) return;
    global.sample_count += 1;
    addSampleDate(global.sampledInfluencers, influencerKey, ymd);
    if (hasStaffAssignee(assignees)) {
      staffUnique.sample_count += 1;
      addSampleDate(staffUnique.sampledInfluencers, influencerKey, ymd);
    }
    assignees.forEach((assignee) => {
      const bucket = ensureBucket(assignee);
      bucket.sample_count += 1;
      addSampleDate(bucket.sampledInfluencers, influencerKey, ymd);
    });
  });

  const videoIndex = buildInfluencerVideosIndexByCreatorKey();
  queryRows(
    `
    SELECT creator_username, content_id, is_refund, payment_time_ymd, payment_time_raw
    FROM alliance_orders
    WHERE TRIM(COALESCE(creator_username, '')) != ''
    `
  ).forEach((order) => {
    const paymentYmd = resolveAlliancePaymentYmd(order);
    if (!paymentYmd) return;
    const influencerKey = resolveCanonicalInfluencerKey(order.creator_username);
    if (!influencerKey) return;
    const meta = getInfluencerMetaForStats(metaMap, order.creator_username, order.creator_username);
    if (isAllocationTaggedInfluencerForStats(meta.tags, filters)) return;
    const assignees = getSampleStatsAssigneeTargets(meta, filters);
    if (!assignees.length) return;

    const globalSampleDates = global.sampledInfluencers.get(influencerKey);
    const matchesGlobal =
      globalSampleDates &&
      globalSampleDates.size &&
      [...globalSampleDates].some((sampleYmd) => paymentYmd > sampleYmd);
    if (matchesGlobal) {
      addAllianceOrder(global.allianceByInfluencer, influencerKey, order);
    }

    const staffSampleDates = staffUnique.sampledInfluencers.get(influencerKey);
    if (
      staffSampleDates &&
      staffSampleDates.size &&
      [...staffSampleDates].some((sampleYmd) => paymentYmd > sampleYmd)
    ) {
      addAllianceOrder(staffUnique.allianceByInfluencer, influencerKey, order);
    }

    assignees.forEach((assignee) => {
      const bucket = ensureBucket(assignee);
      const sampleDates = bucket.sampledInfluencers.get(influencerKey);
      if (!sampleDates || !sampleDates.size) return;
      const hasValidSample = [...sampleDates].some((sampleYmd) => paymentYmd > sampleYmd);
      if (!hasValidSample) return;
      addAllianceOrder(bucket.allianceByInfluencer, influencerKey, order);
    });
  });

  let assigneeNames = [];
  if (filters.scope_assignee) {
    assigneeNames = [filters.scope_assignee];
  } else {
    assigneeNames = queryRows(`SELECT name FROM staff ORDER BY id ASC`).map((row) => row.name);
    buckets.forEach((_value, name) => {
      if (!assigneeNames.includes(name)) assigneeNames.push(name);
    });
    if (!assigneeNames.includes(SAMPLE_STATS_EMPTY_ASSIGNEE_KEY)) {
      assigneeNames.push(SAMPLE_STATS_EMPTY_ASSIGNEE_KEY);
    }
  }

  const buildRowFromBucket = (assignee, bucket) => {
    if (!bucket) return finalizeSampleShipmentStatsRow({ assignee, ...createEmptySampleShipmentStatsRow() });

    let orderedInfluencerCount = 0;
    let videoCount = 0;
    let orderCount = 0;
    const publishedStats = computePublishedVideoStatsAfterSample(bucket.sampledInfluencers, videoIndex);
    bucket.allianceByInfluencer.forEach((agg) => {
      if (agg.orderCount > 0) {
        orderedInfluencerCount += 1;
        videoCount += agg.videos.size;
        orderCount += agg.orderCount;
      }
    });

    return finalizeSampleShipmentStatsRow({
      assignee,
      audit_approved: bucket.audit.Y,
      audit_rejected: bucket.audit.N,
      audit_tentative: bucket.audit.X,
      sample_count: bucket.sample_count,
      published_video_count: publishedStats.published_video_count,
      published_influencer_count: publishedStats.published_influencer_count,
      ordered_influencer_count: orderedInfluencerCount,
      video_count: videoCount,
      order_count: orderCount,
    });
  };

  const buildTotalsFromMaps = (sampledMap, allianceMap, audit, sampleCount) => {
    let orderedInfluencerCount = 0;
    let videoCount = 0;
    let orderCount = 0;
    allianceMap.forEach((agg) => {
      if (agg.orderCount > 0) {
        orderedInfluencerCount += 1;
        videoCount += agg.videos.size;
        orderCount += agg.orderCount;
      }
    });
    const publishedStats = computePublishedVideoStatsAfterSample(sampledMap, videoIndex);
    return finalizeSampleShipmentStatsRow({
      audit_approved: audit.Y,
      audit_rejected: audit.N,
      audit_tentative: audit.X,
      sample_count: sampleCount,
      published_video_count: publishedStats.published_video_count,
      published_influencer_count: publishedStats.published_influencer_count,
      ordered_influencer_count: orderedInfluencerCount,
      video_count: videoCount,
      order_count: orderCount,
    });
  };

  const rows = assigneeNames.map((assignee) => buildRowFromBucket(assignee, buckets.get(assignee)));

  let staffRows = rows;
  let emptyAssigneeRow = null;
  const showEmptyAssigneeRow = !filters.scope_assignee;
  if (showEmptyAssigneeRow) {
    emptyAssigneeRow =
      rows.find((row) => row.assignee === SAMPLE_STATS_EMPTY_ASSIGNEE_KEY) ||
      finalizeSampleShipmentStatsRow({ assignee: SAMPLE_STATS_EMPTY_ASSIGNEE_KEY, ...createEmptySampleShipmentStatsRow() });
    staffRows = rows.filter((row) => row.assignee !== SAMPLE_STATS_EMPTY_ASSIGNEE_KEY);
  }

  const staffTotals = filters.scope_assignee
    ? buildRowFromBucket(filters.scope_assignee, buckets.get(filters.scope_assignee))
    : buildTotalsFromMaps(
        staffUnique.sampledInfluencers,
        staffUnique.allianceByInfluencer,
        staffUnique.audit,
        staffUnique.sample_count
      );

  const grandTotals = filters.scope_assignee
    ? staffTotals
    : buildTotalsFromMaps(
        global.sampledInfluencers,
        global.allianceByInfluencer,
        global.audit,
        global.sample_count
      );

  return Promise.resolve({
    rows: staffRows,
    empty_assignee_row: emptyAssigneeRow,
    show_empty_assignee_row: showEmptyAssigneeRow,
    staff_totals: staffTotals,
    grand_totals: grandTotals,
    range,
  });
}

function getAllianceOrderIdsByFilters(filters = {}) {
  const { where, params } = buildAllianceOrderWhere(filters);
  const rows = queryRows(`SELECT id FROM alliance_orders ${where}`, params);
  return Promise.resolve(rows.map((row) => row.id));
}

function batchDeleteAllianceOrders(ids) {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
  if (!uniqueIds.length) return Promise.resolve(0);
  const placeholders = uniqueIds.map(() => '?').join(', ');
  db.run(`DELETE FROM alliance_orders WHERE id IN (${placeholders})`, uniqueIds);
  saveDb();
  return Promise.resolve(uniqueIds.length);
}

function sanitizeInfluencerVideoData(data = {}) {
  const cleaned = {};
  INFLUENCER_VIDEO_COLUMNS.forEach((column) => {
    cleaned[column.key] = readOrderFieldFromData(data, column.key, column.legacyAliases || []);
  });
  if (cleaned.publish_date_raw) {
    cleaned.publish_date_raw = normalizeImportedDateTimeRaw(cleaned.publish_date_raw, SLASH_DATE_ORDER_MDY);
  }
  return cleaned;
}

function extractInfluencerVideoFields(data) {
  const video_title = readOrderFieldFromData(data, 'video_title', ['视频标题', 'Video Title']);
  const content_id = readOrderFieldFromData(data, 'content_id', ['内容id', '内容 ID', 'Content ID']);
  const publish_date_raw = normalizeImportedDateTimeRaw(
    readOrderFieldFromData(data, 'publish_date_raw', ['发布日期', 'Publish Date']),
    SLASH_DATE_ORDER_MDY
  );
  const video_url = readOrderFieldFromData(data, 'video_url', ['视频链接', 'Video URL', '链接']);
  const creator_username = readOrderFieldFromData(data, 'creator_username', ['达人id', '达人 ID', 'Creator Username']);
  const product_id = readOrderFieldFromData(data, 'product_id', ['商品id', '商品 ID', 'Product ID']);
  const publish_date_ymd = parseCreatedTimeToYmd(publish_date_raw, SLASH_DATE_ORDER_MDY);
  return {
    video_title,
    content_id,
    publish_date_raw,
    publish_date_ymd,
    video_url,
    creator_username,
    product_id,
  };
}

function findInfluencerVideoByUniqueKey(uniqueKey) {
  return Promise.resolve(queryOne('SELECT id FROM influencer_videos WHERE unique_key = ?', [uniqueKey]));
}

function insertInfluencerVideo({ unique_key, data, imported_by, import_time }, options = {}) {
  const cleanedData = sanitizeInfluencerVideoData(data);
  const fields = extractInfluencerVideoFields(cleanedData);
  const resolvedUniqueKey = unique_key || fields.content_id;
  const resolvedImportTime = import_time || formatBeijingDateTime();
  db.run(
    `INSERT INTO influencer_videos (
      unique_key, data_json, video_title, content_id, publish_date_raw, publish_date_ymd,
      video_url, creator_username, product_id, imported_by, import_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      resolvedUniqueKey,
      JSON.stringify(cleanedData || {}),
      fields.video_title,
      fields.content_id,
      fields.publish_date_raw,
      fields.publish_date_ymd,
      fields.video_url,
      fields.creator_username,
      fields.product_id,
      imported_by || '',
      resolvedImportTime,
    ]
  );
  if (!options.deferSave) saveDb();
  return Promise.resolve(getLastInsertRowId());
}

function importInfluencerVideosBatch({ rows, imported_by, import_time }) {
  for (const row of rows) {
    assertImportedDateValue(
      readOrderFieldFromData(row.data || {}, 'publish_date_raw', ['发布日期', 'Publish Date']),
      SLASH_DATE_ORDER_MDY
    );
  }

  let inserted = 0;
  let skipped = 0;
  const duplicateKeys = [];
  const batchImportTime = import_time || formatBeijingDateTime();

  for (const row of rows) {
    const existing = queryOne('SELECT id FROM influencer_videos WHERE unique_key = ?', [row.unique_key]);
    if (existing) {
      skipped++;
      duplicateKeys.push(row.unique_key);
      continue;
    }
    insertInfluencerVideo(
      {
        unique_key: row.unique_key,
        data: row.data,
        imported_by,
        import_time: batchImportTime,
      },
      { deferSave: true }
    );
    inserted++;
  }

  saveDb();
  return Promise.resolve({ inserted, skipped, duplicateKeys, import_time: batchImportTime });
}

function buildInfluencerVideoWhere(filters = {}, tableAlias = '') {
  const col = (name) => (tableAlias ? `${tableAlias}.${name}` : name);
  const conditions = [];
  const params = [];
  if (filters.content_id) {
    conditions.push(`${col('content_id')} LIKE ?`);
    params.push(`%${filters.content_id}%`);
  }
  if (filters.creator_username) {
    const keyword = String(filters.creator_username).trim();
    const aliasValues = getInfluencerAliasDisplayValues(keyword);
    if (aliasValues.length > 1 || resolveCanonicalInfluencerId(keyword) !== keyword) {
      const clauses = aliasValues.map(() => `${col('creator_username')} LIKE ?`);
      conditions.push(`(${clauses.join(' OR ')})`);
      aliasValues.forEach((value) => params.push(`%${value}%`));
    } else {
      conditions.push(`${col('creator_username')} LIKE ?`);
      params.push(`%${keyword}%`);
    }
  }
  if (filters.publish_date_from) {
    conditions.push(`TRIM(COALESCE(${col('publish_date_ymd')}, '')) >= ?`);
    params.push(filters.publish_date_from);
  }
  if (filters.publish_date_to) {
    conditions.push(`TRIM(COALESCE(${col('publish_date_ymd')}, '')) <= ?`);
    params.push(filters.publish_date_to);
  }
  if (filters.import_time) {
    conditions.push(`${col('import_time')} = ?`);
    params.push(filters.import_time);
  }
  if (filters.assignee_filter && filters.sample_date_from && filters.sample_date_to) {
    const publishAfterSample =
      filters.publish_after_sample === '1' ||
      filters.publish_after_sample === 1 ||
      filters.publish_after_sample === true;
    if (publishAfterSample) {
      const contentIds = getPublishedContentIdsAfterSampleForAssignee(
        filters.assignee_filter,
        filters.sample_date_from,
        filters.sample_date_to,
        filters
      );
      if (!contentIds.length) {
        conditions.push('1 = 0');
      } else {
        const placeholders = contentIds.map(() => '?').join(', ');
        conditions.push(`${col('content_id')} IN (${placeholders})`);
        params.push(...contentIds);
      }
    } else {
      const creators = getSampledCreatorUsernamesForAssigneeInRange(
        filters.assignee_filter,
        filters.sample_date_from,
        filters.sample_date_to
      );
      if (!creators.length) {
        conditions.push('1 = 0');
      } else {
        const allNames = new Set();
        creators.forEach((name) => {
          allNames.add(String(name).trim());
          getInfluencerAliasDisplayValues(name).forEach((value) => allNames.add(String(value).trim()));
        });
        const nameList = [...allNames].filter(Boolean);
        if (!nameList.length) {
          conditions.push('1 = 0');
        } else {
          const placeholders = nameList.map(() => '?').join(', ');
          conditions.push(`${col('creator_username')} IN (${placeholders})`);
          params.push(...nameList);
        }
      }
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

function buildAllianceOrderStatsByContentIdSubquerySql() {
  return `
    SELECT TRIM(content_id) AS content_id,
      COUNT(*) AS order_count,
      SUM(CASE WHEN ${allianceOrderIsRefundedSql('ao')} THEN 1 ELSE 0 END) AS refund_count
    FROM alliance_orders ao
    WHERE TRIM(COALESCE(ao.content_id, '')) != ''
      AND ${allianceOrderPaymentTimeValidConditions('ao').join(' AND ')}
    GROUP BY TRIM(ao.content_id)
  `;
}

function resolveInfluencerVideoSort(filters = {}) {
  const validFields = ['publish_date', 'import_time', 'order_count', 'refund_count'];
  const field = validFields.includes(filters.sort_field) ? filters.sort_field : 'order_count';
  const order = filters.sort_order === 'asc' ? 'ASC' : 'DESC';
  return { field, order };
}

function buildInfluencerVideoOrderByClause(sortField, sortOrder) {
  if (sortField === 'publish_date') {
    return `COALESCE(NULLIF(TRIM(iv.publish_date_ymd), ''), '') ${sortOrder}, iv.id DESC`;
  }
  if (sortField === 'import_time') {
    return `iv.import_time ${sortOrder}, iv.id DESC`;
  }
  if (sortField === 'refund_count') {
    return `COALESCE(ao_stats.refund_count, 0) ${sortOrder}, iv.id DESC`;
  }
  return `COALESCE(ao_stats.order_count, 0) ${sortOrder}, iv.id DESC`;
}

function getInfluencerVideos(filters = {}) {
  const { where, params } = buildInfluencerVideoWhere(filters, 'iv');
  const { field: sortField, order: sortOrder } = resolveInfluencerVideoSort(filters);
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(filters.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;
  const statsSubquery = buildAllianceOrderStatsByContentIdSubquerySql();
  const joinFrom = `
    FROM influencer_videos iv
    LEFT JOIN (${statsSubquery}) ao_stats
      ON TRIM(COALESCE(iv.content_id, '')) = ao_stats.content_id
  `;
  // Count without alliance join — stats only affect display/sort of order/refund columns.
  const total = queryOne(`SELECT COUNT(*) AS total FROM influencer_videos iv ${where}`, params)?.total || 0;
  const orderBy = buildInfluencerVideoOrderByClause(sortField, sortOrder);
  const rows = queryRows(
    `
    SELECT iv.id, iv.unique_key, iv.data_json, iv.video_title, iv.content_id, iv.publish_date_raw, iv.publish_date_ymd,
           iv.video_url, iv.creator_username, iv.product_id, iv.imported_by, iv.import_time,
           COALESCE(ao_stats.order_count, 0) AS order_count,
           COALESCE(ao_stats.refund_count, 0) AS refund_count
    ${joinFrom}
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );
  const enrichedRows = rows.map((row) => {
    let data = {};
    try {
      data = JSON.parse(row.data_json || '{}');
    } catch {
      data = {};
    }
    return {
      ...row,
      data,
      order_count: Number(row.order_count) || 0,
      refund_count: Number(row.refund_count) || 0,
    };
  });
  return Promise.resolve({
    rows: enrichedRows,
    total,
    page,
    pageSize,
    columns: INFLUENCER_VIDEO_DISPLAY_COLUMNS,
  });
}

function getInfluencerVideoImportTimeOptions(filters = {}) {
  const { where, params } = buildInfluencerVideoWhere({ ...filters, import_time: undefined });
  const wherePrefix = where ? `${where} AND` : 'WHERE';
  const rows = queryRows(
    `
    SELECT import_time, COUNT(*) AS cnt
    FROM influencer_videos
    ${wherePrefix} import_time IS NOT NULL AND TRIM(import_time) != ''
    GROUP BY import_time
    ORDER BY import_time DESC
    `,
    params
  );
  return Promise.resolve({
    import_times: rows.map((row) => ({
      value: row.import_time,
      count: row.cnt,
    })),
  });
}

function getInfluencerVideoIdsByFilters(filters = {}) {
  const { where, params } = buildInfluencerVideoWhere(filters);
  const rows = queryRows(`SELECT id FROM influencer_videos ${where}`, params);
  return Promise.resolve(rows.map((row) => row.id));
}

function batchDeleteInfluencerVideos(ids) {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
  if (!uniqueIds.length) return Promise.resolve(0);
  const placeholders = uniqueIds.map(() => '?').join(', ');
  db.run(`DELETE FROM influencer_videos WHERE id IN (${placeholders})`, uniqueIds);
  saveDb();
  return Promise.resolve(uniqueIds.length);
}

function getLatestRecordSummaryByInfluencer() {
  const rows = queryRows(`
    SELECT r.id AS record_id, r.influencer_id, r.tags, r.assignee, r.remark, r.sample_date, r.sample_order_id
    FROM records r
    INNER JOIN (
      SELECT influencer_id, MAX(id) AS max_id
      FROM records
      WHERE TRIM(COALESCE(influencer_id, '')) != ''
      GROUP BY influencer_id
    ) latest ON latest.max_id = r.id
  `);
  const map = new Map();
  rows.forEach((row) => {
    map.set(normalizeMatchKey(row.influencer_id), row);
  });
  return map;
}

const ASSIGNEE_CONFLICT_LABEL = '冲突';
const ASSIGNEE_CONFLICT_FILTER = '__conflict__';

function splitAssigneeList(value) {
  return String(value || '')
    .split(/[,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sortAssigneeNames(names) {
  return [...new Set((names || []).map((name) => String(name || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  );
}

function normalizeSingleAssigneeValue(value) {
  return sortAssigneeNames(splitAssigneeList(value))[0] || '';
}

function resolveInfluencerAssigneeInfo(assigneeNames) {
  const names = sortAssigneeNames(assigneeNames);
  if (names.length > 1) {
    return {
      assignee: ASSIGNEE_CONFLICT_LABEL,
      assignee_names: names,
      assignee_conflict: true,
    };
  }
  return {
    assignee: names[0] || '',
    assignee_names: names,
    assignee_conflict: false,
  };
}

function getInfluencerIdsByAssigneeName(assigneeName, metaMap) {
  const map = metaMap || buildInfluencerMetaMapForStats();
  const ids = [];
  map.forEach((entry) => {
    if (entry.influencer_id && entry.assigneeSet.has(assigneeName)) {
      ids.push(String(entry.influencer_id).trim());
    }
  });
  return ids;
}

function getInfluencerIdsWithEmptyAssignee(metaMap) {
  const map = metaMap || buildInfluencerMetaMapForStats();
  const ids = [];
  map.forEach((entry) => {
    if (entry.influencer_id && entry.assigneeSet.size === 0) {
      ids.push(String(entry.influencer_id).trim());
    }
  });
  return ids;
}

function appendInfluencerIdInCondition(conditions, params, influencerCol, influencerIds) {
  const ids = [...new Set((influencerIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) {
    conditions.push('1 = 0');
    return;
  }
  const placeholders = ids.map(() => '?').join(', ');
  conditions.push(`TRIM(${influencerCol}) IN (${placeholders})`);
  params.push(...ids);
}

function appendInfluencerAssigneeConflictFilter(conditions, params, influencerCol, metaMap) {
  const ids = [];
  (metaMap || buildInfluencerMetaMapForStats()).forEach((entry) => {
    if (entry.assigneeSet.size > 1 && entry.influencer_id) {
      ids.push(entry.influencer_id);
    }
  });
  appendInfluencerIdInCondition(conditions, params, influencerCol, ids);
}

function appendInfluencerAssigneeFilter(conditions, params, influencerCol, assigneeName) {
  appendInfluencerIdInCondition(
    conditions,
    params,
    influencerCol,
    getInfluencerIdsByAssigneeName(assigneeName)
  );
}

function appendEmptyInfluencerAssigneeFilter(conditions, params, influencerCol) {
  appendInfluencerIdInCondition(
    conditions,
    params,
    influencerCol,
    getInfluencerIdsWithEmptyAssignee()
  );
}

function influencerMatchesAssigneeFilter(assigneeNames, filter) {
  const names = sortAssigneeNames(assigneeNames);
  if (filter === '__empty__') return !names.length;
  if (filter === ASSIGNEE_CONFLICT_FILTER) return names.length > 1;
  if (!filter) return true;
  return names.includes(filter);
}

function recordMatchesAssigneeFilter(assigneeValue, filter, assigneeNames) {
  if (Array.isArray(assigneeNames)) {
    return influencerMatchesAssigneeFilter(assigneeNames, filter);
  }
  return influencerMatchesAssigneeFilter(splitAssigneeList(assigneeValue), filter);
}

function canStaffAccessInfluencerAssignee(influencerId, staffName, metaMap) {
  if (!staffName) return false;
  const map = metaMap || buildInfluencerMetaMapForStats();
  const meta = getInfluencerMetaForStats(map, influencerId, influencerId);
  if (!meta.assignees.length) return false;
  return meta.assignees.includes(staffName);
}

function recordMatchesFulfillmentFilter(value, filter) {
  if (filter === '__empty__') return !String(value || '').trim();
  if (!filter) return true;
  return String(value || '').trim() === filter;
}

function getCollaboratedSampleDateList(row) {
  const dates = [];
  const seen = new Set();
  const addDate = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    text.split(/[,，、;；]/).forEach((part) => {
      const raw = part.trim();
      if (!raw) return;
      const ymd = normalizeYmdInput(raw) || (/^\d{8}$/.test(raw) ? raw : '');
      const key = ymd || raw;
      if (seen.has(key)) return;
      seen.add(key);
      dates.push(ymd || raw);
    });
  };
  if (Array.isArray(row?.sample_dates)) {
    row.sample_dates.forEach((item) => addDate(item?.date));
  }
  addDate(row?.sample_date);
  return dates;
}

function recordMatchesSampleDateFilter(row, filter) {
  if (!filter) return true;
  const dates = getCollaboratedSampleDateList(row);
  if (filter === '__empty__') return !dates.length;
  if (filter === 'has') return dates.length > 0;
  if (filter === 'recent_15d') return dates.some((date) => sampleDateWithinLast15Days(date));
  if (filter === 'older_15d') return dates.some((date) => sampleDateOlderThan15Days(date));
  return true;
}

function getMergedRecordSummaryByInfluencer() {
  const rows = queryRows(`
    SELECT id AS record_id, influencer_id, tags, assignee, sample_date, sample_order_id
    FROM records
    WHERE TRIM(COALESCE(influencer_id, '')) != ''
    ORDER BY id DESC
  `);
  const map = new Map();
  rows.forEach((row) => {
    const key = resolveCanonicalInfluencerKey(row.influencer_id);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        influencer_id: resolveCanonicalInfluencerId(row.influencer_id),
        record_id: row.record_id,
        tagSet: new Set(),
        assigneeSet: new Set(),
        sampleDateMap: new Map(),
      });
    }
    const entry = map.get(key);
    splitTagsValue(row.tags).forEach((tag) => entry.tagSet.add(tag));
    splitAssigneeList(row.assignee).forEach((name) => entry.assigneeSet.add(name));
    const sampleDate = String(row.sample_date || '').trim();
    if (sampleDate && !entry.sampleDateMap.has(sampleDate)) {
      entry.sampleDateMap.set(sampleDate, row.sample_order_id || null);
    }
  });

  const result = new Map();
  map.forEach((entry, key) => {
    const sampleDates = [...entry.sampleDateMap.entries()]
      .map(([date, sample_order_id]) => ({ date, sample_order_id }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    result.set(key, {
      influencer_id: entry.influencer_id,
      record_id: entry.record_id,
      tags: joinTagsList([...entry.tagSet]),
      assignee: [...entry.assigneeSet].sort((a, b) => a.localeCompare(b, 'zh-CN')).join('、'),
      sample_date: sampleDates.map((item) => item.date).join('、'),
      sample_dates: sampleDates,
      sample_order_id: sampleDates[0]?.sample_order_id || null,
    });
  });
  return result;
}

function recordMatchesTagFilter(tagsValue, tagFilter) {
  if (tagFilter === '__empty__') return !String(tagsValue || '').trim();
  if (!tagFilter) return true;
  return splitTagsValue(tagsValue).includes(tagFilter);
}

function getInfluencerProfileMap() {
  const rows = queryRows(
    'SELECT influencer_id, tags, assignee, influencer_remark, pinned, pinned_at, fulfillment_progress, email FROM influencer_profiles'
  );
  const map = new Map();
  rows.forEach((row) => {
    map.set(normalizeMatchKey(row.influencer_id), row);
  });
  return map;
}

function getInfluencerProfile(influencerId) {
  const canonical = resolveCanonicalInfluencerId(influencerId);
  return Promise.resolve(
    queryOne('SELECT influencer_id, tags, assignee, influencer_remark FROM influencer_profiles WHERE influencer_id = ?', [
      canonical,
    ])
  );
}

function upsertInfluencerProfile(influencerId, fields, updatedBy = '') {
  const id = String(influencerId || '').trim();
  if (!id) return Promise.reject(new Error('达人 id 不能为空'));
  const existing = queryOne('SELECT influencer_id FROM influencer_profiles WHERE influencer_id = ?', [id]);
  if (existing) {
    const updates = [];
    const params = [];
    if (fields.tags !== undefined) {
      updates.push('tags = ?');
      params.push(normalizeTagsValue(fields.tags));
    }
    if (fields.assignee !== undefined) {
      updates.push('assignee = ?');
      params.push(normalizeSingleAssigneeValue(fields.assignee));
    }
    if (fields.influencer_remark !== undefined) {
      updates.push('influencer_remark = ?');
      params.push(fields.influencer_remark || '');
    }
    if (fields.fulfillment_progress !== undefined) {
      updates.push('fulfillment_progress = ?');
      params.push(fields.fulfillment_progress || '');
    }
    if (fields.email !== undefined) {
      updates.push('email = ?');
      params.push(fields.email || '');
    }
    if (!updates.length) return Promise.resolve(id);
    updates.push('updated_by = ?');
    updates.push('update_time = CURRENT_TIMESTAMP');
    params.push(updatedBy || '', id);
    db.run(`UPDATE influencer_profiles SET ${updates.join(', ')} WHERE influencer_id = ?`, params);
  } else {
    let tags = fields.tags !== undefined ? normalizeTagsValue(fields.tags) : '';
    let assignee = fields.assignee !== undefined ? normalizeSingleAssigneeValue(fields.assignee) : '';
    const influencerRemark =
      fields.influencer_remark !== undefined ? fields.influencer_remark || '' : '';
    if (fields.assignee === undefined && !assignee) {
      const rec = queryOne('SELECT assignee FROM records WHERE influencer_id = ? ORDER BY id DESC LIMIT 1', [id]);
      if (rec?.assignee) assignee = rec.assignee;
    }
    db.run(
      `INSERT INTO influencer_profiles (influencer_id, tags, assignee, remark, influencer_remark, fulfillment_progress, email, updated_by)
       VALUES (?, ?, ?, '', ?, ?, ?, ?)`,
      [
        id,
        tags,
        assignee,
        influencerRemark,
        fields.fulfillment_progress !== undefined ? fields.fulfillment_progress || '' : '',
        fields.email !== undefined ? fields.email || '' : '',
        updatedBy || '',
      ]
    );
  }
  saveDb();
  return Promise.resolve(id);
}

function syncInfluencerAssigneeToRecords(influencerId, assignee) {
  const single = normalizeSingleAssigneeValue(assignee);
  db.run('UPDATE records SET assignee = ? WHERE influencer_id = ?', [single, influencerId]);
  saveDb();
}

function updateInfluencerProfileTags(influencerId, tags, updatedBy = '') {
  return upsertInfluencerProfile(influencerId, { tags }, updatedBy);
}

function getInfluencerCurrentTags(influencerId) {
  const profile = queryOne('SELECT tags FROM influencer_profiles WHERE influencer_id = ?', [influencerId]);
  return String(profile?.tags || '').trim();
}

function applyBatchTagsMode(currentTags, inputTags, mode = 'replace') {
  const current = splitTagsValue(currentTags);
  const incoming = splitTagsValue(inputTags);
  if (mode === 'add') {
    const set = new Set([...current, ...incoming]);
    return joinTagsList([...set]);
  }
  if (mode === 'remove') {
    const removeSet = new Set(incoming);
    return joinTagsList(current.filter((tag) => !removeSet.has(tag)));
  }
  return joinTagsList(incoming);
}

function batchUpdateInfluencerTags(influencerIds, tagsInput, mode = 'replace', updatedBy = '') {
  const uniqueIds = [...new Set((influencerIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return Promise.resolve(0);
  const normalizedMode = ['replace', 'add', 'remove'].includes(mode) ? mode : 'replace';
  const tasks = uniqueIds.map((influencerId) => {
    const current = getInfluencerCurrentTags(influencerId);
    const nextTags = applyBatchTagsMode(current, tagsInput, normalizedMode);
    return updateInfluencerProfileTags(influencerId, nextTags, updatedBy);
  });
  return Promise.all(tasks).then((results) => results.length);
}

function updateInfluencerProfileInfluencerRemark(influencerId, influencerRemark, updatedBy = '') {
  return upsertInfluencerProfile(influencerId, { influencer_remark: influencerRemark }, updatedBy);
}

function updateInfluencerProfileFulfillment(influencerId, fulfillmentProgress, updatedBy = '') {
  const value = normalizeFulfillmentProgressValue(fulfillmentProgress);
  return upsertInfluencerProfile(influencerId, { fulfillment_progress: value }, updatedBy);
}

function influencerIdMatchCondition(column = 'influencer_id') {
  return `LOWER(TRIM(${column})) = ?`;
}

function influencerIdAlreadyUsedByOther(oldInfluencerId, newValue) {
  const oldEntityKey = resolveCanonicalInfluencerKey(oldInfluencerId);
  const newKey = normalizeMatchKey(newValue);
  if (newKey === oldEntityKey) return false;

  const aliasOwner = queryOne(
    `SELECT canonical_influencer_id FROM influencer_id_aliases WHERE LOWER(TRIM(alias_influencer_id)) = ? LIMIT 1`,
    [newKey]
  );
  if (aliasOwner && resolveCanonicalInfluencerKey(aliasOwner.canonical_influencer_id) !== oldEntityKey) {
    return true;
  }

  const profile = queryOne(
    `SELECT influencer_id FROM influencer_profiles WHERE LOWER(TRIM(influencer_id)) = ? LIMIT 1`,
    [newKey]
  );
  if (profile && resolveCanonicalInfluencerKey(profile.influencer_id) !== oldEntityKey) {
    return true;
  }

  const record = queryOne(
    `SELECT influencer_id FROM records WHERE LOWER(TRIM(influencer_id)) = ? LIMIT 1`,
    [newKey]
  );
  if (record && resolveCanonicalInfluencerKey(record.influencer_id) !== oldEntityKey) {
    return true;
  }

  return false;
}

function renameInfluencerId(oldInfluencerId, newInfluencerId, updatedBy = '') {
  const oldValue = String(oldInfluencerId || '').trim();
  const newValue = String(newInfluencerId || '').trim();
  if (!oldValue) return Promise.reject(new Error('原达人 id 不能为空'));
  if (!newValue) return Promise.reject(new Error('新达人 id 不能为空'));
  if (/[\s@]/.test(newValue)) return Promise.reject(new Error('达人 id 不能包含空格或 @'));

  const oldCanonical = resolveCanonicalInfluencerId(oldValue);
  const oldEntityKey = resolveCanonicalInfluencerKey(oldCanonical);
  const newKey = normalizeMatchKey(newValue);
  if (oldEntityKey === newKey && oldCanonical === newValue) {
    return Promise.reject(new Error('新 id 与当前相同'));
  }
  if (influencerIdAlreadyUsedByOther(oldCanonical, newValue)) {
    return Promise.reject(new Error('新达人 id 已被其他达人使用'));
  }

  const hasOldData =
    queryOne(`SELECT id FROM records WHERE ${influencerIdMatchCondition()} LIMIT 1`, [oldEntityKey]) ||
    queryOne(`SELECT influencer_id FROM influencer_profiles WHERE ${influencerIdMatchCondition()} LIMIT 1`, [
      oldEntityKey,
    ]) ||
    queryOne(`SELECT id FROM influencer_follow_ups WHERE ${influencerIdMatchCondition()} LIMIT 1`, [oldEntityKey]) ||
    queryOne(`SELECT id FROM email_send_logs WHERE ${influencerIdMatchCondition()} LIMIT 1`, [oldEntityKey]) ||
    queryOne(`SELECT id FROM sample_orders WHERE ${influencerIdMatchCondition('buyer_username')} LIMIT 1`, [
      oldEntityKey,
    ]) ||
    queryOne(`SELECT id FROM alliance_orders WHERE ${influencerIdMatchCondition('creator_username')} LIMIT 1`, [
      oldEntityKey,
    ]) ||
    queryOne(`SELECT id FROM influencer_id_aliases WHERE ${influencerIdMatchCondition('alias_influencer_id')} LIMIT 1`, [
      oldEntityKey,
    ]);
  if (!hasOldData) return Promise.reject(new Error('未找到该达人 id 的相关数据'));

  db.run(`UPDATE records SET influencer_id = ? WHERE ${influencerIdMatchCondition()}`, [newValue, oldEntityKey]);
  db.run(
    `UPDATE influencer_profiles
     SET influencer_id = ?, updated_by = ?, update_time = CURRENT_TIMESTAMP
     WHERE ${influencerIdMatchCondition()}`,
    [newValue, updatedBy || '', oldEntityKey]
  );
  db.run(`UPDATE influencer_follow_ups SET influencer_id = ? WHERE ${influencerIdMatchCondition()}`, [
    newValue,
    oldEntityKey,
  ]);
  db.run(`UPDATE email_send_logs SET influencer_id = ? WHERE ${influencerIdMatchCondition()}`, [newValue, oldEntityKey]);
  db.run(`UPDATE sample_orders SET buyer_username = ? WHERE ${influencerIdMatchCondition('buyer_username')}`, [
    newValue,
    oldEntityKey,
  ]);
  db.run(`UPDATE alliance_orders SET creator_username = ? WHERE ${influencerIdMatchCondition('creator_username')}`, [
    newValue,
    oldEntityKey,
  ]);
  db.run(`UPDATE influencer_videos SET creator_username = ? WHERE ${influencerIdMatchCondition('creator_username')}`, [
    newValue,
    oldEntityKey,
  ]);
  db.run(
    `UPDATE influencer_id_aliases
     SET canonical_influencer_id = ?
     WHERE LOWER(TRIM(canonical_influencer_id)) = ?`,
    [newValue, oldEntityKey]
  );
  if (normalizeMatchKey(oldCanonical) !== newKey) {
    db.run(
      `INSERT OR IGNORE INTO influencer_id_aliases (canonical_influencer_id, alias_influencer_id, created_by)
       VALUES (?, ?, ?)`,
      [newValue, oldCanonical, updatedBy || '']
    );
  }
  db.run(
    `INSERT INTO influencer_id_rename_logs (old_influencer_id, new_influencer_id, changed_by)
     VALUES (?, ?, ?)`,
    [oldCanonical, newValue, updatedBy || '']
  );
  invalidateInfluencerAliasCache();
  saveDb();
  return Promise.resolve({
    old_influencer_id: oldCanonical,
    new_influencer_id: newValue,
  });
}

function toggleInfluencerProfilePin(influencerId, updatedBy = '') {
  const id = String(influencerId || '').trim();
  if (!id) return Promise.reject(new Error('达人 id 不能为空'));
  const existing = queryOne('SELECT influencer_id, pinned FROM influencer_profiles WHERE influencer_id = ?', [id]);
  const nextPinned = existing && Number(existing.pinned) === 1 ? 0 : 1;
  if (existing) {
    if (nextPinned) {
      db.run(
        `UPDATE influencer_profiles
         SET pinned = 1, pinned_at = CURRENT_TIMESTAMP, updated_by = ?, update_time = CURRENT_TIMESTAMP
         WHERE influencer_id = ?`,
        [updatedBy || '', id]
      );
    } else {
      db.run(
        `UPDATE influencer_profiles
         SET pinned = 0, pinned_at = NULL, updated_by = ?, update_time = CURRENT_TIMESTAMP
         WHERE influencer_id = ?`,
        [updatedBy || '', id]
      );
    }
  } else {
    db.run(
      `INSERT INTO influencer_profiles (influencer_id, tags, assignee, remark, pinned, pinned_at, updated_by)
       VALUES (?, '', '', '', 1, CURRENT_TIMESTAMP, ?)`,
      [id, updatedBy || '']
    );
  }
  saveDb();
  return Promise.resolve({ influencer_id: id, pinned: nextPinned });
}

function batchUpdateInfluencerAssignees(influencerIds, assignee, updatedBy = '') {
  const uniqueIds = [...new Set(influencerIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return Promise.resolve(0);
  uniqueIds.forEach((id) => {
    upsertInfluencerProfile(id, { assignee }, updatedBy);
    syncInfluencerAssigneeToRecords(id, assignee);
  });
  return Promise.resolve(uniqueIds.length);
}

function getCollaboratedScopedInfluencerKeys(filters = {}) {
  const metaMap = buildInfluencerMetaMapForStats();
  if (!filters.scope_assignee) {
    return new Set(metaMap.keys());
  }
  const scopedKeys = new Set();
  metaMap.forEach((entry, key) => {
    if (entry.assigneeSet.has(filters.scope_assignee)) {
      scopedKeys.add(key);
    }
  });
  return scopedKeys;
}

function getCollaboratedAssigneeFilterOptions(filters = {}) {
  const baseFilters = {
    ...filters,
    assignee_filter: undefined,
    collab_tab: 'all',
    page: undefined,
    pageSize: undefined,
  };
  const { rows } = buildCollaboratedRows(baseFilters);
  const assigneeSet = new Set();
  let emptyCount = 0;
  let hasConflict = false;
  rows.forEach((row) => {
    const names = sortAssigneeNames(row.assignee_names || []);
    if (!names.length) {
      emptyCount += 1;
      return;
    }
    if (names.length > 1) {
      hasConflict = true;
      return;
    }
    names.forEach((name) => assigneeSet.add(name));
  });
  return {
    assignees: [...assigneeSet].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    has_empty_assignee: emptyCount > 0,
    has_assignee_conflict: hasConflict,
  };
}

function getCollaboratedFilterOptions(filters = {}) {
  const metaMap = buildInfluencerMetaMapForStats();
  const scopedKeys = getCollaboratedScopedInfluencerKeys(filters);
  const tagOptions = getTagFilterOptionsFromMeta(scopedKeys, metaMap);
  const assigneeOptions = getCollaboratedAssigneeFilterOptions(filters);

  return Promise.resolve({
    tags: tagOptions.tags,
    has_empty_tags: tagOptions.has_empty_tags,
    assignees: assigneeOptions.assignees,
    has_empty_assignee: assigneeOptions.has_empty_assignee,
    has_assignee_conflict: assigneeOptions.has_assignee_conflict,
  });
}

function getAllSampleOrderBuyerIdMap() {
  const map = new Map();
  queryRows(
    `SELECT DISTINCT buyer_username FROM sample_orders WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((row) => {
    const key = normalizeMatchKey(row.buyer_username);
    if (!key) return;
    if (!map.has(key)) map.set(key, String(row.buyer_username).trim());
  });
  return map;
}

function getAllAllianceCreatorIdMap() {
  const map = new Map();
  queryRows(
    `SELECT DISTINCT creator_username FROM alliance_orders WHERE TRIM(COALESCE(creator_username, '')) != ''`
  ).forEach((row) => {
    const key = normalizeMatchKey(row.creator_username);
    if (!key) return;
    if (!map.has(key)) map.set(key, String(row.creator_username).trim());
  });
  return map;
}

function collectRealCollaboratedInfluencerKeys({ sampleBuyerMap, aggMap, recordMap }) {
  const allKeys = new Set();
  sampleBuyerMap.forEach((_id, key) => allKeys.add(key));
  aggMap.forEach((_row, key) => allKeys.add(key));
  recordMap.forEach((value, key) => {
    if (Array.isArray(value.sample_dates) && value.sample_dates.length) {
      allKeys.add(key);
    }
  });
  return allKeys;
}

function hasRealCollaboration(row) {
  return (
    Number(row.order_count || 0) > 0 ||
    Number(row.sample_order_count || 0) > 0 ||
    (Array.isArray(row.sample_dates) && row.sample_dates.length > 0)
  );
}

function buildCollaboratedRows(filters = {}) {
  let aggMap = buildAllianceOrderStatsByInfluencerKey();
  if (filters.influencer_id) {
    const aliasKeys = new Set(
      getInfluencerAliasDisplayValues(filters.influencer_id).map((value) => normalizeMatchKey(value))
    );
    aggMap = new Map([...aggMap.entries()].filter(([key]) => aliasKeys.has(key)));
  }

  const sampleOrderMaps = buildSampleOrderIndexMaps();
  const recordMap = getMergedRecordSummaryByInfluencer();
  const profileMap = getInfluencerProfileMap();
  const metaMap = buildInfluencerMetaMapForStats();
  const sampleOrderMap = getLatestSampleOrderSummaryByBuyer();
  const sampleBuyerMap = getAllSampleOrderBuyerIdMap();
  const allianceCreatorMap = getAllAllianceCreatorIdMap();
  const followUpSummaryMap = getInfluencerFollowUpSummaryMap();
  const emailSendMap = getLatestEmailSendSummaryMap();
  const videoMap = buildInfluencerVideoStatsByCreatorKey();
  const auditSummaryMap = getInfluencerApplicationAuditSummaryMap();
  const allKeys = collectRealCollaboratedInfluencerKeys({ sampleBuyerMap, aggMap, recordMap });
  const groupedKeys = groupNormalizedKeysByCanonical(allKeys, sampleBuyerMap, allianceCreatorMap);

  let rows = [...groupedKeys.entries()].map(([canonicalKey, aliasKeysSet]) => {
    const aliasKeys = [...aliasKeysSet];
    const agg = mergeAllianceAggRows(aggMap, aliasKeys);
    const summary = recordMap.get(canonicalKey) || {};
    const sampleOrder = sampleOrderMap.get(canonicalKey) || aliasKeys.map((key) => sampleOrderMap.get(key)).find(Boolean) || {};
    const profile = profileMap.get(canonicalKey);
    const influencer_id = resolveCanonicalInfluencerId(
      profile?.influencer_id ||
        agg.creator_username ||
        sampleBuyerMap.get(canonicalKey) ||
        allianceCreatorMap.get(canonicalKey) ||
        summary.influencer_id ||
        sampleOrder.influencer_id ||
        canonicalKey
    );
    const buyerOrders = collectMapListValues(sampleOrderMaps.byBuyer, aliasKeys, sampleOrderItemKey).sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        Number(b.sample_order_id) - Number(a.sample_order_id)
    );
    const sample_dates = buyerOrders.length
      ? buyerOrders
      : mergeCollaboratedSampleDates(summary.sample_dates, sampleOrder);
    const sample_order_count = buyerOrders.length || sample_dates.length;
    const meta = getInfluencerMetaForStats(metaMap, canonicalKey, influencer_id);
    const assigneeInfo = resolveInfluencerAssigneeInfo(meta.assignees);
    const sendSummary = emailSendMap.get(canonicalKey) || aliasKeys.map((key) => emailSendMap.get(key)).find(Boolean);
    const followSummary =
      followUpSummaryMap.get(canonicalKey) || aliasKeys.map((key) => followUpSummaryMap.get(key)).find(Boolean);
    const auditSummary =
      auditSummaryMap.get(canonicalKey) || aliasKeys.map((key) => auditSummaryMap.get(key)).find(Boolean);
    return {
      influencer_id,
      published_video_count: mergePublishedVideoCount(videoMap, aliasKeys),
      video_count: agg.video_count || 0,
      order_count: agg.order_count || 0,
      refund_count: agg.refund_count || 0,
      tags: profile?.tags ? normalizeTagsValue(profile.tags) : '',
      assignee: assigneeInfo.assignee,
      assignee_names: assigneeInfo.assignee_names,
      assignee_conflict: assigneeInfo.assignee_conflict,
      influencer_remark: profile?.influencer_remark || '',
      email: profile?.email || '',
      latest_email_send_at: sendSummary?.sent_at || '',
      latest_email_send_status: sendSummary?.status || '',
      latest_email_send_error: sendSummary?.error_message || '',
      fulfillment_progress: profile?.fulfillment_progress || '',
      pinned: profile && Number(profile.pinned) === 1 ? 1 : 0,
      pinned_at: profile?.pinned_at || '',
      sample_date: sample_dates.map((item) => item.date).join('、'),
      sample_dates,
      sample_order_count,
      has_duplicate_sample: sample_order_count > 1,
      sample_order_id: sample_dates[0]?.sample_order_id || null,
      record_id: summary.record_id || null,
      follow_up_count: followSummary?.follow_up_count || 0,
      latest_follow_up: followSummary?.latest_follow_up || '',
      latest_follow_up_at: followSummary?.latest_follow_up_at || '',
      influencer_application_count: auditSummary?.application_count || 0,
      influencer_mixed_audit: !!auditSummary?.has_mixed_audit_status,
    };
  });

  rows = rows.filter(hasRealCollaboration);

  if (filters.influencer_id) {
    const keyword = String(filters.influencer_id).trim().toLowerCase();
    rows = rows.filter((row) =>
      getInfluencerAliasDisplayValues(row.influencer_id).some((value) =>
        String(value || '').toLowerCase().includes(keyword)
      )
    );
  }

  if (filters.scope_assignee) {
    rows = rows.filter((row) => influencerMatchesAssigneeFilter(row.assignee_names, filters.scope_assignee));
  }
  if (filters.assignee_filter === '__empty__') {
    rows = rows.filter((row) => !row.assignee_names?.length);
  } else if (filters.assignee_filter) {
    rows = rows.filter((row) => influencerMatchesAssigneeFilter(row.assignee_names, filters.assignee_filter));
  }
  if (filters.tags) {
    rows = rows.filter((row) => recordMatchesTagFilter(row.tags, filters.tags));
  }
  if (filters.fulfillment_progress) {
    rows = rows.filter((row) => recordMatchesFulfillmentFilter(row.fulfillment_progress, filters.fulfillment_progress));
  }
  if (filters.sample_date_filter) {
    rows = rows.filter((row) => recordMatchesSampleDateFilter(row, filters.sample_date_filter));
  }
  if (filters.ordered_after_sample) {
    const orderedKeys = getOrderedAfterSampleInfluencerKeys(filters);
    rows = rows.filter((row) =>
      getInfluencerAliasKeys(row.influencer_id).some((key) => orderedKeys.has(key))
    );
  }

  const tab = filters.collab_tab || 'all';
  if (tab !== 'all') {
    rows = rows.filter((row) => matchesCollaboratedTab(row, tab));
  }

  return { rows };
}

function getBeijingDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    yearStr: get('year'),
    monthStr: get('month'),
    dayStr: get('day'),
  };
}

function getCollaboratedMonthRangesBeijing() {
  const { year, month, day, yearStr, monthStr, dayStr } = getBeijingDateParts();
  const currentStart = `${yearStr}${monthStr}01`;
  const currentEnd = `${yearStr}${monthStr}${dayStr}`;

  let lastY = year;
  let lastM = month - 1;
  if (lastM < 1) {
    lastM = 12;
    lastY -= 1;
  }
  const lastMStr = String(lastM).padStart(2, '0');
  const lastYStr = String(lastY);
  const lastStart = `${lastYStr}${lastMStr}01`;
  const daysInLastMonth = new Date(lastY, lastM, 0).getDate();
  const lastEnd = `${lastYStr}${lastMStr}${String(daysInLastMonth).padStart(2, '0')}`;

  return {
    last_month: {
      start: lastStart,
      end: lastEnd,
      label: `${lastY}年${lastM}月`,
    },
    current_month: {
      start: currentStart,
      end: currentEnd,
      label: `${year}年${month}月（截至${day}日）`,
    },
  };
}

function findAllianceCreatorNamesForInfluencer(influencerId) {
  const names = getInfluencerAliasDisplayValues(influencerId);
  if (!names.length) return [];
  const keys = new Set(names.map((name) => normalizeMatchKey(name)).filter(Boolean));
  if (!keys.size) return names;
  const placeholders = [...keys].map(() => '?').join(', ');
  const matched = queryRows(
    `
    SELECT DISTINCT creator_username
    FROM alliance_orders
    WHERE LOWER(TRIM(creator_username)) IN (${placeholders})
    `,
    [...keys]
  )
    .map((row) => String(row.creator_username || '').trim())
    .filter(Boolean);
  if (matched.length) return matched;
  const fallback = resolveCanonicalInfluencerId(influencerId);
  return fallback ? [fallback] : names;
}

function buildSampleOrderIndexMapsForInfluencer(influencerId) {
  const byBuyerSku = new Map();
  const byBuyer = new Map();
  const keys = getInfluencerAliasKeys(influencerId);
  if (!keys.length) return { byBuyerSku, byBuyer };
  const placeholders = keys.map(() => '?').join(', ');
  queryRows(
    `
    SELECT id, buyer_username, sku_id, created_time_ymd, created_time_raw
    FROM sample_orders
    WHERE LOWER(TRIM(COALESCE(buyer_username, ''))) IN (${placeholders})
      AND TRIM(COALESCE(sku_id, '')) != ''
    `,
    keys
  ).forEach((order) => {
    const date = resolveSampleOrderYmd(order);
    if (!date) return;
    const item = { date, sample_order_id: order.id, sku_id: String(order.sku_id || '').trim() };
    const buyerKey = normalizeMatchKey(order.buyer_username);
    const skuKey = `${buyerKey}|${normalizeMatchKey(order.sku_id)}`;
    if (!byBuyerSku.has(skuKey)) byBuyerSku.set(skuKey, []);
    byBuyerSku.get(skuKey).push(item);
    if (!byBuyer.has(buyerKey)) byBuyer.set(buyerKey, []);
    byBuyer.get(buyerKey).push(item);
  });
  const sortItems = (items) =>
    items.sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        Number(b.sample_order_id) - Number(a.sample_order_id)
    );
  byBuyerSku.forEach((items, key) => byBuyerSku.set(key, sortItems(items)));
  byBuyer.forEach((items, key) => byBuyer.set(key, sortItems(items)));
  return { byBuyerSku, byBuyer };
}

function resolveAssigneeInfoForInfluencer(influencerId, profile = null) {
  const assigneeSet = new Set(splitAssigneeList(profile?.assignee));
  const conditions = [];
  const params = [];
  appendInfluencerIdSqlFilter(conditions, params, 'influencer_id', influencerId);
  if (conditions.length) {
    queryRows(
      `
      SELECT assignee
      FROM records
      WHERE ${conditions.join(' AND ')}
        AND TRIM(COALESCE(assignee, '')) != ''
      `,
      params
    ).forEach((row) => {
      splitAssigneeList(row.assignee).forEach((name) => assigneeSet.add(name));
    });
  }
  return resolveInfluencerAssigneeInfo([...assigneeSet]);
}

function getCollaboratedRowForInfluencer(influencerId) {
  const id = resolveCanonicalInfluencerId(influencerId);
  if (!id) return null;
  const displayValues = getInfluencerAliasDisplayValues(id);
  const profile = queryOne(
    `
    SELECT influencer_id, tags, assignee, influencer_remark, fulfillment_progress, email, pinned, pinned_at
    FROM influencer_profiles
    WHERE influencer_id = ?
    `,
    [id]
  );
  const assigneeInfo = resolveAssigneeInfoForInfluencer(id, profile);
  const allianceNames = findAllianceCreatorNamesForInfluencer(id);
  const agg = aggregateAllianceOrderStatsAllTime(allianceNames.length ? allianceNames : displayValues);
  const sampleMaps = buildSampleOrderIndexMapsForInfluencer(id);
  const sample_dates = collectSampleOrdersForInfluencer(sampleMaps, id);
  const sample_order_count = sample_dates.length;
  return {
    influencer_id: id,
    published_video_count: countPublishedVideosForCreatorNames(displayValues),
    video_count: agg.video_count || 0,
    order_count: agg.order_count || 0,
    refund_count: agg.refund_count || 0,
    tags: profile?.tags ? normalizeTagsValue(profile.tags) : '',
    assignee: assigneeInfo.assignee,
    assignee_names: assigneeInfo.assignee_names,
    assignee_conflict: assigneeInfo.assignee_conflict,
    influencer_remark: profile?.influencer_remark || '',
    email: profile?.email || '',
    fulfillment_progress: profile?.fulfillment_progress || '',
    pinned: profile && Number(profile.pinned) === 1 ? 1 : 0,
    pinned_at: profile?.pinned_at || '',
    sample_date: sample_dates.map((item) => item.date).join('、'),
    sample_dates,
    sample_order_count,
    has_duplicate_sample: sample_order_count > 1,
    sample_order_id: sample_dates[0]?.sample_order_id || null,
    record_id: null,
  };
}

function enrichRecordsForInfluencerDetail(rows, influencerId) {
  const list = rows || [];
  if (!list.length) return [];
  const id = resolveCanonicalInfluencerId(influencerId) || String(influencerId || '').trim();
  const profile = queryOne(
    `
    SELECT influencer_id, tags, assignee, email
    FROM influencer_profiles
    WHERE influencer_id = ?
    `,
    [id]
  );
  const assigneeInfo = resolveAssigneeInfoForInfluencer(id, profile);
  const tags = profile?.tags ? normalizeTagsValue(profile.tags) : '';
  const email = profile?.email || '';
  const sampleOrderMaps = buildSampleOrderIndexMapsForInfluencer(id);
  const skuModelMap = getSkuModelLookupMap();
  const aliasKeys = getInfluencerAliasKeys(id);
  const buyerOrders = collectSampleOrdersForInfluencer(sampleOrderMaps, id);
  const duplicateGroups = aliasKeys.flatMap((key) =>
    buildSameModelDuplicateGroups(key, sampleOrderMaps, skuModelMap)
  );
  const duplicateGroupMap = new Map();
  duplicateGroups.forEach((group) => {
    const groupKey = `${group.sku_id}|${group.model_name}|${group.count}`;
    if (!duplicateGroupMap.has(groupKey)) duplicateGroupMap.set(groupKey, group);
  });
  const mergedDuplicateGroups = [...duplicateGroupMap.values()].sort((a, b) =>
    String(b.sample_dates[0]?.date || '').localeCompare(String(a.sample_dates[0]?.date || ''))
  );

  return list.map((row) => {
    const skuOrders = collectMapListValues(sampleOrderMaps.byBuyerSku, aliasKeys, sampleOrderItemKey).filter(
      (item) => normalizeMatchKey(item.sku_id) === normalizeMatchKey(row.sku_id)
    );
    row.tags = tags;
    row.assignee_names = assigneeInfo.assignee_names;
    row.assignee_conflict = assigneeInfo.assignee_conflict;
    row.assignee = assigneeInfo.assignee || row.assignee || '';
    row.email = email;
    row.influencer_mixed_audit = false;
    row.influencer_application_count = list.length;
    row.influencer_applications = [];
    row.is_collaborated = false;
    row.influencer_sample_dates = buyerOrders;
    row.influencer_sample_order_count = buyerOrders.length;
    row.influencer_same_model_duplicate_groups = mergedDuplicateGroups;
    row.influencer_same_model_duplicate_count = mergedDuplicateGroups.reduce(
      (sum, group) => sum + group.count,
      0
    );
    row.application_sample_dates = skuOrders;
    row.application_sample_order_count = skuOrders.length;
    row.sample_dates = skuOrders;
    row.sample_order_count = skuOrders.length;
    row.sample_date = skuOrders[0]?.date || '';
    row.sample_order_id = skuOrders[0]?.sample_order_id || null;
    row.has_duplicate_sample = skuOrders.length > 1;
    return row;
  });
}

function getInfluencerDetailPayload(influencerId, options = {}) {
  const id = resolveCanonicalInfluencerId(influencerId) || String(influencerId || '').trim();
  if (!id) {
    return Promise.resolve({
      influencer_id: '',
      records: [],
      collab: null,
      rename_logs: [],
      follow_ups: [],
    });
  }
  // Access is enforced by the route; skip assignee-scope SQL here to avoid full meta-map rebuild.
  return getRecordsByInfluencerId(id, { light: true }).then((records) => {
    const collab = getCollaboratedRowForInfluencer(id);
    return getInfluencerIdRenameLogs(id).then((renameLogs) => {
      const payload = {
        influencer_id: id,
        records: records || [],
        collab,
        rename_logs: renameLogs || [],
      };
      if (!options.include_follow_ups) {
        payload.follow_ups = [];
        return payload;
      }
      return getInfluencerFollowUps(id).then((followUps) => {
        payload.follow_ups = followUps || [];
        return payload;
      });
    });
  });
}

function mergeCollaboratedSampleDates(recordDates = [], sampleOrder = {}) {
  const map = new Map();
  (Array.isArray(recordDates) ? recordDates : []).forEach((item) => {
    const date = String(item?.date || '').trim();
    if (!date) return;
    map.set(date, item.sample_order_id || null);
  });
  const sampleDate = String(sampleOrder.sample_date || '').trim();
  if (sampleDate && !map.has(sampleDate)) {
    map.set(sampleDate, sampleOrder.sample_order_id || null);
  }
  return [...map.entries()]
    .map(([date, sample_order_id]) => ({ date, sample_order_id }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function aggregateAllianceOrderStatsAllTime(creatorNames) {
  if (!creatorNames.length) {
    return { video_count: 0, order_count: 0, refund_count: 0 };
  }
  const placeholders = creatorNames.map(() => '?').join(', ');
  const row = queryOne(
    `
    SELECT
      COUNT(*) AS order_count,
      COUNT(DISTINCT CASE WHEN TRIM(COALESCE(content_id, '')) != '' THEN content_id ELSE NULL END) AS video_count,
      SUM(CASE WHEN ${allianceOrderIsRefundedSql()} THEN 1 ELSE 0 END) AS refund_count
    FROM alliance_orders
    WHERE creator_username IN (${placeholders})
      AND ${allianceOrderPaymentTimeValidConditions().join(' AND ')}
    `,
    creatorNames
  );
  return {
    video_count: Number(row?.video_count) || 0,
    order_count: Number(row?.order_count) || 0,
    refund_count: Number(row?.refund_count) || 0,
  };
}

function aggregateAllianceOrderStats(creatorNames, dateFrom, dateTo) {
  if (!creatorNames.length) {
    return { video_count: 0, order_count: 0, refund_count: 0 };
  }
  const placeholders = creatorNames.map(() => '?').join(', ');
  const row = queryOne(
    `
    SELECT
      COUNT(*) AS order_count,
      COUNT(DISTINCT CASE WHEN TRIM(COALESCE(content_id, '')) != '' THEN content_id ELSE NULL END) AS video_count,
      SUM(CASE WHEN ${allianceOrderIsRefundedSql()} THEN 1 ELSE 0 END) AS refund_count
    FROM alliance_orders
    WHERE creator_username IN (${placeholders})
      AND ${allianceOrderPaymentTimeValidConditions().join(' AND ')}
      AND payment_time_ymd >= ?
      AND payment_time_ymd <= ?
    `,
    [...creatorNames, dateFrom, dateTo]
  );
  return {
    video_count: Number(row?.video_count) || 0,
    order_count: Number(row?.order_count) || 0,
    refund_count: Number(row?.refund_count) || 0,
  };
}

function calcTrendPercent(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (previousValue === 0) {
    if (currentValue === 0) return 0;
    return 100;
  }
  return ((currentValue - previousValue) / previousValue) * 100;
}

function getCollaboratedMonthlyStats(influencerId) {
  const allianceNames = findAllianceCreatorNamesForInfluencer(influencerId);
  const videoCreatorNames = getInfluencerAliasDisplayValues(influencerId);
  const ranges = getCollaboratedMonthRangesBeijing();
  const total = aggregateAllianceOrderStatsAllTime(allianceNames);
  const last = aggregateAllianceOrderStats(allianceNames, ranges.last_month.start, ranges.last_month.end);
  const current = aggregateAllianceOrderStats(allianceNames, ranges.current_month.start, ranges.current_month.end);
  const buildMetric = (key) => ({
    total: total[key],
    last_month: last[key],
    current_month: current[key],
    change_pct: calcTrendPercent(current[key], last[key]),
  });
  const buildPublishedMetric = () => {
    const lastMonth = countPublishedVideosForCreatorNames(
      videoCreatorNames,
      ranges.last_month.start,
      ranges.last_month.end
    );
    const currentMonth = countPublishedVideosForCreatorNames(
      videoCreatorNames,
      ranges.current_month.start,
      ranges.current_month.end
    );
    return {
      total: countPublishedVideosForCreatorNames(videoCreatorNames),
      last_month: lastMonth,
      current_month: currentMonth,
      change_pct: calcTrendPercent(currentMonth, lastMonth),
    };
  };

  return Promise.resolve({
    influencer_id: influencerId,
    last_month_label: ranges.last_month.label,
    current_month_label: ranges.current_month.label,
    metrics: {
      published_video_count: buildPublishedMetric(),
      video_count: buildMetric('video_count'),
      order_count: buildMetric('order_count'),
      refund_count: buildMetric('refund_count'),
    },
  });
}

function sortCollaboratedRows(rows, filters = {}) {
  const validFields = ['published_video_count', 'video_count', 'order_count', 'refund_count', 'sample_date'];
  const field = validFields.includes(filters.sort_field) ? filters.sort_field : 'order_count';
  const order = filters.sort_order === 'asc' ? 1 : -1;
  const applyPin = shouldApplyPinSort(filters);
  return [...rows].sort((a, b) => {
    if (applyPin) {
      const ap = Number(a.pinned || 0);
      const bp = Number(b.pinned || 0);
      if (ap !== bp) return bp - ap;
      if (ap && bp) {
        const pinCmp = String(b.pinned_at || '').localeCompare(String(a.pinned_at || ''));
        if (pinCmp !== 0) return pinCmp;
      }
    }
    if (field === 'sample_date') {
      const av = String(a.sample_date || '');
      const bv = String(b.sample_date || '');
      const cmp = av.localeCompare(bv);
      if (cmp !== 0) return order * cmp;
    } else {
      const av = Number(a[field] || 0);
      const bv = Number(b[field] || 0);
      if (av !== bv) return order * (av - bv);
    }
    return String(a.influencer_id || '').localeCompare(String(b.influencer_id || ''), 'zh-CN');
  });
}

function computeCollaboratedTabCounts(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    all: list.length,
    recent_sample: list.filter((row) => matchesCollaboratedTab(row, 'recent_sample')).length,
    ordered: list.filter((row) => matchesCollaboratedTab(row, 'ordered')).length,
    no_order: list.filter((row) => matchesCollaboratedTab(row, 'no_order')).length,
  };
}

function getCollaboratedInfluencerIdsByFilters(filters = {}) {
  const { rows } = buildCollaboratedRows(filters);
  return Promise.resolve(rows.map((row) => row.influencer_id));
}

function getCollaboratedTabCounts(filters = {}) {
  const baseFilters = { ...filters, collab_tab: 'all' };
  const { rows } = buildCollaboratedRows(baseFilters);
  return Promise.resolve(computeCollaboratedTabCounts(rows));
}

function getCollaboratedStats(filters = {}) {
  const baseFilters = { ...filters, collab_tab: 'all' };
  const { rows: allRows } = buildCollaboratedRows(baseFilters);
  const tabCounts = computeCollaboratedTabCounts(allRows);

  const tab = filters.collab_tab || 'all';
  let rows = tab === 'all' ? allRows : allRows.filter((row) => matchesCollaboratedTab(row, tab));
  rows = sortCollaboratedRows(rows, filters);
  const total = rows.length;
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(filters.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;

  return Promise.resolve({
    rows: rows.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
    tabCounts,
  });
}

function getCollaboratedRowsForExport(filters = {}) {
  const baseFilters = { ...filters, collab_tab: 'all' };
  const { rows: allRows } = buildCollaboratedRows(baseFilters);
  const tab = filters.collab_tab || 'all';
  let rows = tab === 'all' ? allRows : allRows.filter((row) => matchesCollaboratedTab(row, tab));
  rows = sortCollaboratedRows(rows, filters);
  return Promise.resolve(rows);
}

function mergeCollaboratedImportRemark(remark, situation) {
  return [String(remark || '').trim(), String(situation || '').trim()].filter(Boolean).join('\n\n');
}

function buildCollaboratedImportIdResolver() {
  const resolver = new Map();
  const { rows } = buildCollaboratedRows({ collab_tab: 'all' });

  rows.forEach((row) => {
    resolver.set(normalizeMatchKey(row.influencer_id), row.influencer_id);
  });

  return resolver;
}

function importCollaboratedFieldsFromExcel(entries, updatedBy = 'excel-import') {
  const idMap = buildCollaboratedImportIdResolver();

  const result = {
    updated: 0,
    skipped: 0,
    notFound: [],
    invalidStatus: [],
  };

  (entries || []).forEach((entry) => {
    const excelId = String(entry.influencer_id || '').trim();
    if (!excelId) {
      result.skipped += 1;
      return;
    }

    const canonicalId = idMap.get(normalizeMatchKey(excelId));
    if (!canonicalId) {
      result.notFound.push(excelId);
      return;
    }

    const fields = {};
    const assignee = String(entry.assignee || '').trim();
    if (assignee) fields.assignee = assignee;

    const status = normalizeFulfillmentProgressValue(entry.fulfillment_progress);
    if (String(entry.fulfillment_progress || '').trim()) {
      if (status) {
        fields.fulfillment_progress = status;
      } else {
        result.invalidStatus.push({ influencer_id: excelId, status: entry.fulfillment_progress });
      }
    }

    const mergedRemark = mergeCollaboratedImportRemark(entry.remark, entry.situation);
    if (mergedRemark) fields.influencer_remark = mergedRemark;

    if (!Object.keys(fields).length) {
      result.skipped += 1;
      return;
    }

    upsertInfluencerProfile(canonicalId, fields, updatedBy);
    if (fields.assignee !== undefined) syncInfluencerAssigneeToRecords(canonicalId, fields.assignee);
    result.updated += 1;
  });

  return Promise.resolve(result);
}

const ASSIGNEE_STATS_ALLOCATION_TAG = '分配';

function normalizeAuditStatusForStats(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'Y') return 'Y';
  if (text === 'N') return 'N';
  if (text === 'X') return 'X';
  return '';
}

function datetimeToYmdForStats(value) {
  const parsed = parseCreatedTimeToYmd(value);
  if (parsed) return parsed;
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getBeijingDateParts(date);
  return `${parts.yearStr}${parts.monthStr}${parts.dayStr}`;
}

function getAssigneeStatsPeriodRanges() {
  const { year, month, day, yearStr, monthStr, dayStr } = getBeijingDateParts();
  const monthRanges = getCollaboratedMonthRangesBeijing();
  return {
    year: {
      start: `${yearStr}0101`,
      end: `${yearStr}${monthStr}${dayStr}`,
      label: `${year}年（截至${month}月${day}日）`,
    },
    last_month: monthRanges.last_month,
    current_month: monthRanges.current_month,
  };
}

function ymdInRangeForStats(ymd, start, end) {
  if (!ymd || !start || !end) return false;
  return ymd >= start && ymd <= end;
}

function periodKeysForYmd(ymd, ranges) {
  const keys = [];
  if (ymdInRangeForStats(ymd, ranges.year.start, ranges.year.end)) keys.push('year');
  if (ymdInRangeForStats(ymd, ranges.last_month.start, ranges.last_month.end)) keys.push('last_month');
  if (ymdInRangeForStats(ymd, ranges.current_month.start, ranges.current_month.end)) keys.push('current_month');
  return keys;
}

function buildInfluencerMetaMapForStats() {
  const map = new Map();
  const upsert = (rawKey, { influencerId = '', assignee = '', tags = '' } = {}) => {
    const key = resolveCanonicalInfluencerKey(rawKey);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        influencer_id: resolveCanonicalInfluencerId(influencerId || rawKey),
        assigneeSet: new Set(),
        tagSet: new Set(),
      });
    }
    const entry = map.get(key);
    if (influencerId) entry.influencer_id = resolveCanonicalInfluencerId(influencerId);
    splitAssigneeList(assignee).forEach((name) => entry.assigneeSet.add(name));
    splitTagsValue(tags).forEach((tag) => entry.tagSet.add(tag));
  };

  getInfluencerProfileMap().forEach((row, key) => {
    upsert(key, { influencerId: row.influencer_id, assignee: row.assignee, tags: row.tags });
  });
  getMergedRecordSummaryByInfluencer().forEach((row, key) => {
    upsert(key, { influencerId: row.influencer_id, assignee: row.assignee });
  });
  queryRows(
    `SELECT influencer_id, assignee FROM records WHERE TRIM(COALESCE(influencer_id, '')) != ''`
  ).forEach((row) => {
    upsert(row.influencer_id, { influencerId: row.influencer_id, assignee: row.assignee });
  });
  return map;
}

function getInfluencerMetaForStats(metaMap, key, fallbackId = '') {
  const canonicalKey = resolveCanonicalInfluencerKey(fallbackId || key);
  const entry = metaMap.get(canonicalKey) || metaMap.get(normalizeMatchKey(key));
  if (!entry) {
    return {
      influencer_id: resolveCanonicalInfluencerId(fallbackId || key || ''),
      assignees: [],
      tags: [],
    };
  }
  return {
    influencer_id: entry.influencer_id,
    assignees: [...entry.assigneeSet],
    tags: [...entry.tagSet],
  };
}

function createEmptyAssigneeStatsPeriodInternal() {
  return {
    audit: { Y: new Set(), N: new Set(), X: new Set() },
    sample: 0,
    alliance: new Map(),
  };
}

function createEmptyAssigneeStatsInternalRow() {
  return {
    year: createEmptyAssigneeStatsPeriodInternal(),
    last_month: createEmptyAssigneeStatsPeriodInternal(),
    current_month: createEmptyAssigneeStatsPeriodInternal(),
  };
}

function finalizeAssigneeStatsPeriod(periodData) {
  let orderedInfluencerCount = 0;
  let videoCount = 0;
  let orderCount = 0;
  let refundCount = 0;
  periodData.alliance.forEach((agg) => {
    if (agg.orderCount > 0) {
      orderedInfluencerCount += 1;
      videoCount += agg.videos.size;
      orderCount += agg.orderCount;
      refundCount += agg.refundCount;
    }
  });
  return {
    audit_approved: periodData.audit.Y.size,
    audit_rejected: periodData.audit.N.size,
    audit_tentative: periodData.audit.X.size,
    sample_count: periodData.sample,
    ordered_influencer_count: orderedInfluencerCount,
    video_count: videoCount,
    order_count: orderCount,
    refund_count: refundCount,
  };
}

function getAssigneeStats(filters = {}) {
  const excludeAllocation = !(
    filters.include_allocation_tag === true ||
    filters.include_allocation_tag === 1 ||
    String(filters.include_allocation_tag) === '1'
  );
  const ranges = getAssigneeStatsPeriodRanges();
  const metaMap = buildInfluencerMetaMapForStats();
  const buckets = new Map();

  const ensureBucket = (assignee) => {
    if (!buckets.has(assignee)) buckets.set(assignee, createEmptyAssigneeStatsInternalRow());
    return buckets.get(assignee);
  };

  const isExcluded = (tags) => excludeAllocation && tags.includes(ASSIGNEE_STATS_ALLOCATION_TAG);

  queryRows(
    `SELECT influencer_id, assignee, audit_status, last_updated_at, import_batch_time, create_time
     FROM records
     WHERE TRIM(COALESCE(influencer_id, '')) != ''`
  ).forEach((record) => {
    const status = normalizeAuditStatusForStats(record.audit_status);
    if (!['Y', 'N', 'X'].includes(status)) return;
    const ymd =
      datetimeToYmdForStats(record.last_updated_at) ||
      datetimeToYmdForStats(record.import_batch_time) ||
      datetimeToYmdForStats(record.create_time);
    const periodKeys = periodKeysForYmd(ymd, ranges);
    if (!periodKeys.length) return;
    const influencerKey = normalizeMatchKey(record.influencer_id);
    const meta = getInfluencerMetaForStats(metaMap, influencerKey, record.influencer_id);
    if (isExcluded(meta.tags)) return;
    const assignees = meta.assignees.length ? meta.assignees : splitAssigneeList(record.assignee);
    assignees.forEach((assignee) => {
      if (!assignee) return;
      periodKeys.forEach((periodKey) => {
        ensureBucket(assignee)[periodKey].audit[status].add(influencerKey);
      });
    });
  });

  queryRows(
    `SELECT buyer_username, created_time_ymd, created_time_raw
     FROM sample_orders
     WHERE TRIM(COALESCE(buyer_username, '')) != ''`
  ).forEach((order) => {
    const ymd = resolveSampleOrderYmd(order);
    const periodKeys = periodKeysForYmd(ymd, ranges);
    if (!periodKeys.length) return;
    const meta = getInfluencerMetaForStats(metaMap, order.buyer_username, order.buyer_username);
    if (isExcluded(meta.tags) || !meta.assignees.length) return;
    meta.assignees.forEach((assignee) => {
      periodKeys.forEach((periodKey) => {
        ensureBucket(assignee)[periodKey].sample += 1;
      });
    });
  });

  rebuildAllianceOrderDerivedFields();
  queryRows(
    `
    SELECT creator_username, content_id, is_refund, full_refund, payment_time_ymd
    FROM alliance_orders
    WHERE TRIM(COALESCE(payment_time_ymd, '')) != ''
      AND payment_time_ymd >= ?
      AND payment_time_ymd <= ?
    `,
    [ranges.year.start, ranges.year.end]
  ).forEach((order) => {
    const periodKeys = periodKeysForYmd(order.payment_time_ymd, ranges);
    if (!periodKeys.length) return;
    const meta = getInfluencerMetaForStats(metaMap, order.creator_username, order.creator_username);
    if (isExcluded(meta.tags) || !meta.assignees.length) return;
    const influencerKey = normalizeMatchKey(order.creator_username);
    meta.assignees.forEach((assignee) => {
      periodKeys.forEach((periodKey) => {
        const periodBucket = ensureBucket(assignee)[periodKey];
        if (!periodBucket.alliance.has(influencerKey)) {
          periodBucket.alliance.set(influencerKey, { orderCount: 0, refundCount: 0, videos: new Set() });
        }
        const agg = periodBucket.alliance.get(influencerKey);
        agg.orderCount += 1;
        if (isAllianceOrderRefunded(order)) agg.refundCount += 1;
        const contentId = String(order.content_id || '').trim();
        if (contentId) agg.videos.add(contentId);
      });
    });
  });

  let assigneeNames = [];
  if (filters.scope_assignee) {
    assigneeNames = [filters.scope_assignee];
  } else {
    assigneeNames = queryRows(`SELECT name FROM staff ORDER BY id ASC`).map((row) => row.name);
    buckets.forEach((_value, name) => {
      if (!assigneeNames.includes(name)) assigneeNames.push(name);
    });
  }

  const rows = assigneeNames.map((assignee) => {
    const bucket = buckets.get(assignee) || createEmptyAssigneeStatsInternalRow();
    return {
      assignee,
      year: finalizeAssigneeStatsPeriod(bucket.year),
      last_month: finalizeAssigneeStatsPeriod(bucket.last_month),
      current_month: finalizeAssigneeStatsPeriod(bucket.current_month),
    };
  });

  return Promise.resolve({
    rows,
    period_labels: {
      year: ranges.year.label,
      last_month: ranges.last_month.label,
      current_month: ranges.current_month.label,
    },
    exclude_allocation_tag: excludeAllocation,
  });
}

const MAX_BATCH_EMAIL_COUNT = 50;

function resolveBatchEmailDelayMs(recipientCount) {
  const count = Math.max(0, Number(recipientCount) || 0);
  if (count <= 1) return 0;
  if (count <= 5) return 300;
  if (count <= 15) return 600;
  return 1000;
}

function applyEmailSendSummaryToRow(row, summary) {
  if (!row) return row;
  row.latest_email_send_at = summary?.sent_at || '';
  row.latest_email_send_status = summary?.status || '';
  row.latest_email_send_error = summary?.error_message || '';
  return row;
}

function getLatestEmailSendSummaryMap() {
  const map = new Map();
  queryRows(
    `
    SELECT influencer_id, status, sent_at, error_message
    FROM email_send_logs
    WHERE status IN ('sent', 'failed')
    ORDER BY datetime(sent_at) DESC, id DESC
    `
  ).forEach((row) => {
    const key = normalizeMatchKey(row.influencer_id);
    if (!key || map.has(key)) return;
    map.set(key, {
      influencer_id: String(row.influencer_id || '').trim(),
      status: String(row.status || '').trim(),
      sent_at: convertUtcStorageToBeijing(row.sent_at) || String(row.sent_at || '').trim(),
      error_message: String(row.error_message || '').trim(),
    });
  });
  return map;
}

function getEmailBatches(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
  const conditions = [];
  const params = [];
  if (filters.created_by) {
    conditions.push('created_by = ?');
    params.push(filters.created_by);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = Number(queryOne(`SELECT COUNT(*) AS cnt FROM email_batches ${where}`, params)?.cnt || 0);
  const rows = queryRows(
    `
    SELECT id, subject_template, body_template, created_by, sender_email, created_at,
           total_count, success_count, failed_count, skipped_count
    FROM email_batches
    ${where}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, pageSize, (page - 1) * pageSize]
  ).map((row) => ({
    ...row,
    created_at: convertUtcStorageToBeijing(row.created_at) || row.created_at,
  }));
  return Promise.resolve({
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

function getEmailBatchDetail(batchId) {
  const batch = queryOne(
    `
    SELECT id, subject_template, body_template, created_by, sender_email, created_at,
           total_count, success_count, failed_count, skipped_count
    FROM email_batches WHERE id = ?
    `,
    [batchId]
  );
  if (!batch) return Promise.resolve(null);
  const logs = queryRows(
    `
    SELECT id, batch_id, influencer_id, to_email, subject, status, error_message, sent_at
    FROM email_send_logs
    WHERE batch_id = ?
    ORDER BY id ASC
    `,
    [batchId]
  ).map((row) => ({
    ...row,
    sent_at: convertUtcStorageToBeijing(row.sent_at) || row.sent_at,
  }));
  return Promise.resolve({
    batch: {
      ...batch,
      created_at: convertUtcStorageToBeijing(batch.created_at) || batch.created_at,
    },
    logs,
  });
}

function getStaffMailSettingsPublic(staffId) {
  const row = queryOne(
    `SELECT id, name, smtp_email, smtp_auth_code_enc, mail_from_name,
            smtp_provider, smtp_host, smtp_port, smtp_secure
     FROM staff WHERE id = ?`,
    [staffId]
  );
  if (!row) return null;
  const smtp_provider = String(row.smtp_provider || 'netease_enterprise').trim() || 'netease_enterprise';
  const smtp = resolveStaffSmtpConfig({
    smtp_provider,
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_secure: row.smtp_secure,
  });
  return {
    staff_id: row.id,
    staff_name: row.name,
    smtp_email: String(row.smtp_email || '').trim(),
    mail_from_name: String(row.mail_from_name || row.name || '').trim(),
    smtp_provider,
    smtp_host: String(row.smtp_host || '').trim() || smtp.host,
    smtp_port: row.smtp_port != null && row.smtp_port !== '' ? Number(row.smtp_port) : smtp.port,
    smtp_secure: row.smtp_secure != null && row.smtp_secure !== '' ? Number(row.smtp_secure) === 1 : smtp.secure,
    configured: Boolean(String(row.smtp_email || '').trim() && String(row.smtp_auth_code_enc || '').trim()),
  };
}

function getStaffMailSettingsForSend(staffId) {
  const row = queryOne(
    `SELECT id, name, smtp_email, smtp_auth_code_enc, mail_from_name,
            smtp_provider, smtp_host, smtp_port, smtp_secure
     FROM staff WHERE id = ?`,
    [staffId]
  );
  if (!row) return null;
  const smtp_email = String(row.smtp_email || '').trim();
  const smtp_auth_code = decryptSecret(row.smtp_auth_code_enc);
  if (!smtp_email || !smtp_auth_code) return null;
  const smtp_provider = String(row.smtp_provider || 'netease_enterprise').trim() || 'netease_enterprise';
  const smtp = resolveStaffSmtpConfig({
    smtp_provider,
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_secure: row.smtp_secure,
  });
  return {
    staff_id: row.id,
    staff_name: row.name,
    smtp_email,
    smtp_auth_code,
    mail_from_name: String(row.mail_from_name || row.name || '').trim() || smtp_email,
    smtp_provider,
    smtp_host: smtp.host,
    smtp_port: smtp.port,
    smtp_secure: smtp.secure,
  };
}

function updateStaffMailSettings(staffId, fields = {}) {
  const existing = queryOne('SELECT id FROM staff WHERE id = ?', [staffId]);
  if (!existing) return Promise.reject(new Error('人员不存在'));

  const updates = [];
  const params = [];
  if (fields.smtp_email !== undefined) {
    updates.push('smtp_email = ?');
    params.push(String(fields.smtp_email || '').trim());
  }
  if (fields.mail_from_name !== undefined) {
    updates.push('mail_from_name = ?');
    params.push(String(fields.mail_from_name || '').trim());
  }
  if (fields.smtp_provider !== undefined) {
    updates.push('smtp_provider = ?');
    params.push(String(fields.smtp_provider || 'netease_enterprise').trim() || 'netease_enterprise');
  }
  if (fields.smtp_host !== undefined) {
    updates.push('smtp_host = ?');
    params.push(String(fields.smtp_host || '').trim());
  }
  if (fields.smtp_port !== undefined) {
    const port = Number(fields.smtp_port);
    updates.push('smtp_port = ?');
    params.push(Number.isFinite(port) && port > 0 ? port : null);
  }
  if (fields.smtp_secure !== undefined) {
    updates.push('smtp_secure = ?');
    params.push(fields.smtp_secure ? 1 : 0);
  }
  if (fields.smtp_auth_code !== undefined) {
    const code = String(fields.smtp_auth_code || '').trim();
    updates.push('smtp_auth_code_enc = ?');
    params.push(code ? encryptSecret(code) : '');
  }
  if (!updates.length) return Promise.resolve(getStaffMailSettingsPublic(staffId));
  params.push(staffId);
  db.run(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`, params);
  saveDb();
  return Promise.resolve(getStaffMailSettingsPublic(staffId));
}

function insertEmailBatch({ subjectTemplate, bodyTemplate, createdBy, senderEmail, totalCount }) {
  db.run(
    `INSERT INTO email_batches (subject_template, body_template, created_by, sender_email, total_count)
     VALUES (?, ?, ?, ?, ?)`,
    [subjectTemplate, bodyTemplate, createdBy || '', senderEmail || '', totalCount || 0]
  );
  const batchId = getLastInsertRowId();
  saveDb();
  return batchId;
}

function insertEmailSendLog({ batchId, influencerId, toEmail, subject, status, errorMessage = '' }) {
  db.run(
    `INSERT INTO email_send_logs (batch_id, influencer_id, to_email, subject, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [batchId, influencerId, toEmail || '', subject || '', status, errorMessage || '']
  );
}

function finalizeEmailBatchCounts(batchId, counts) {
  db.run(
    `UPDATE email_batches
     SET success_count = ?, failed_count = ?, skipped_count = ?
     WHERE id = ?`,
    [counts.success || 0, counts.failed || 0, counts.skipped || 0, batchId]
  );
  saveDb();
}

function getCollaboratedRowsByInfluencerIds(influencerIds = []) {
  const idSet = new Set();
  (influencerIds || []).forEach((id) => {
    getInfluencerAliasKeys(id).forEach((key) => idSet.add(key));
  });
  if (!idSet.size) return [];
  return buildCollaboratedRows({}).filter((row) =>
    getInfluencerAliasKeys(row.influencer_id).some((key) => idSet.has(key))
  );
}

function buildInfluencerEmailVars(row, staff, sampleOrderMaps, skuModelMap) {
  const key = normalizeMatchKey(row?.influencer_id);
  const buyerOrders = sampleOrderMaps.byBuyer.get(key) || [];
  const latestSku = String(buyerOrders[0]?.sku_id || row?.sample_model_sku || '').trim();
  const sample_model =
    String(row?.sample_model || '').trim() ||
    (latestSku ? resolveSkuModelName(latestSku, skuModelMap) || latestSku : '');
  const sample_date =
    String(row?.sample_date || '').trim() ||
    buyerOrders.map((item) => item.date).filter(Boolean).join('、');
  return {
    influencer_id: String(row?.influencer_id || '').trim(),
    email: String(row?.email || '').trim(),
    assignee: String(row?.assignee || '').trim(),
    tags: String(row?.tags || '').trim(),
    sample_date,
    sample_model,
    sender_name: String(staff?.name || '').trim(),
  };
}

function buildCollaboratedEmailVars(row, staff, sampleOrderMaps, skuModelMap) {
  return buildInfluencerEmailVars(row, staff, sampleOrderMaps, skuModelMap);
}

function getPendingAuditEmailRowsByInfluencerIds(influencerIds = []) {
  const uniqueIds = [...new Set(influencerIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const tagMap = getInfluencerProfileTagsMap();
  const emailMap = getInfluencerEmailMap();
  const metaMap = buildInfluencerMetaMapForStats();
  const sampleOrderMaps = buildSampleOrderIndexMaps();
  const skuModelMap = getSkuModelLookupMap();

  return uniqueIds.map((influencerId) => {
    const key = normalizeMatchKey(influencerId);
    const meta = getInfluencerMetaForStats(metaMap, key, influencerId);
    const assigneeInfo = resolveInfluencerAssigneeInfo(meta.assignees);
    const buyerOrders = sampleOrderMaps.byBuyer.get(key) || [];
    const latestSku = String(buyerOrders[0]?.sku_id || '').trim();
    return {
      influencer_id: meta.influencer_id || influencerId,
      email: emailMap.get(key) || '',
      assignee: assigneeInfo.assignee,
      tags: tagMap.get(key) || '',
      sample_date: buyerOrders.map((item) => item.date).filter(Boolean).join('、'),
      sample_model: latestSku ? resolveSkuModelName(latestSku, skuModelMap) || latestSku : '',
      sample_model_sku: latestSku,
    };
  });
}

async function sendInfluencerBatchEmails({
  staffId,
  influencerIds = [],
  subjectTemplate,
  bodyTemplate,
  getRowsByInfluencerIds,
  notFoundMessage = '达人不存在',
  sendDelayMs,
}) {
  const mailSettings = getStaffMailSettingsForSend(staffId);
  if (!mailSettings) {
    throw new Error('请先在「我的邮箱」中配置发件邮箱与 SMTP 授权码');
  }

  const uniqueIds = [...new Set(influencerIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) throw new Error('请先选择达人');
  if (uniqueIds.length > MAX_BATCH_EMAIL_COUNT) {
    throw new Error(`单次最多发送 ${MAX_BATCH_EMAIL_COUNT} 封邮件`);
  }

  const subjectTemplateText = String(subjectTemplate || '').trim();
  const bodyTemplateText = String(bodyTemplate || '').trim();
  if (!subjectTemplateText) throw new Error('邮件主题不能为空');
  if (!bodyTemplateText) throw new Error('邮件正文不能为空');

  const staff = queryOne('SELECT id, name FROM staff WHERE id = ?', [staffId]);
  const rowMap = new Map();
  (getRowsByInfluencerIds(uniqueIds) || []).forEach((row) => {
    rowMap.set(normalizeMatchKey(row.influencer_id), row);
  });
  const sampleOrderMaps = buildSampleOrderIndexMaps();
  const skuModelMap = getSkuModelLookupMap();

  const batchId = insertEmailBatch({
    subjectTemplate: subjectTemplateText,
    bodyTemplate: bodyTemplateText,
    createdBy: staff?.name || '',
    senderEmail: mailSettings.smtp_email,
    totalCount: uniqueIds.length,
  });

  const delayMs = sendDelayMs != null ? Math.max(0, Number(sendDelayMs) || 0) : resolveBatchEmailDelayMs(uniqueIds.length);
  const mailSender = createStaffMailSender(mailSettings);
  const results = [];
  let success = 0;
  let failed = 0;
  let skipped = 0;

  try {
    for (let index = 0; index < uniqueIds.length; index += 1) {
    const influencerId = uniqueIds[index];
    const row = rowMap.get(normalizeMatchKey(influencerId));
    if (!row) {
      skipped += 1;
      results.push({ influencer_id: influencerId, status: 'skipped', error: notFoundMessage });
      insertEmailSendLog({
        batchId,
        influencerId,
        status: 'skipped',
        errorMessage: notFoundMessage,
      });
      continue;
    }

    const recipientEmail = String(row.email || '').trim();
    if (!isValidRecipientEmail(recipientEmail)) {
      skipped += 1;
      results.push({ influencer_id: influencerId, email: recipientEmail, status: 'skipped', error: '无有效邮箱' });
      insertEmailSendLog({
        batchId,
        influencerId,
        toEmail: recipientEmail,
        status: 'skipped',
        errorMessage: '无有效邮箱',
      });
      continue;
    }

    const vars = buildInfluencerEmailVars(row, staff, sampleOrderMaps, skuModelMap);
    const subject = renderEmailTemplate(subjectTemplateText, vars);
    const body = renderEmailTemplate(bodyTemplateText, vars);

    try {
      await mailSender.send({ to: recipientEmail, subject, text: body });
      success += 1;
      results.push({ influencer_id: influencerId, email: recipientEmail, status: 'sent', subject });
      insertEmailSendLog({
        batchId,
        influencerId,
        toEmail: recipientEmail,
        subject,
        status: 'sent',
      });
      if (index < uniqueIds.length - 1 && delayMs > 0) await sleep(delayMs);
    } catch (err) {
      failed += 1;
      const message = err?.message || '发送失败';
      results.push({ influencer_id: influencerId, email: recipientEmail, status: 'failed', error: message, subject });
      insertEmailSendLog({
        batchId,
        influencerId,
        toEmail: recipientEmail,
        subject,
        status: 'failed',
        errorMessage: message,
      });
    }
    }
  } finally {
    mailSender.close();
  }

  finalizeEmailBatchCounts(batchId, { success, failed, skipped });
  saveDb();
  return { batch_id: batchId, sent: success, failed, skipped, results };
}

async function sendCollaboratedBatchEmails(options) {
  return sendInfluencerBatchEmails({
    ...options,
    getRowsByInfluencerIds: getCollaboratedRowsByInfluencerIds,
    notFoundMessage: '达人不在已合作列表',
  });
}

async function sendPendingAuditBatchEmails(options) {
  return sendInfluencerBatchEmails({
    ...options,
    getRowsByInfluencerIds: getPendingAuditEmailRowsByInfluencerIds,
    notFoundMessage: '达人不在当前列表',
  });
}

function bulkAddInfluencerTag(ids, tagName, updatedBy = 'tag-import') {
  const normalizedTag = String(tagName || '').trim();
  if (!normalizedTag) return Promise.reject(new Error('标签名不能为空'));

  const idMap = buildCollaboratedImportIdResolver();
  const result = {
    updated: 0,
    skipped: 0,
    alreadyHas: 0,
    notFound: [],
  };

  (ids || []).forEach((rawId) => {
    const excelId = String(rawId || '').trim();
    if (!excelId) {
      result.skipped += 1;
      return;
    }

    const canonicalId = idMap.get(normalizeMatchKey(excelId));
    if (!canonicalId) {
      result.notFound.push(excelId);
      return;
    }

    const profile = queryOne('SELECT tags FROM influencer_profiles WHERE influencer_id = ?', [canonicalId]);
    const currentTags = profile?.tags || '';
    const nextTags = addTagIfMissing(currentTags, normalizedTag);
    if (nextTags === normalizeTagsValue(currentTags)) {
      result.alreadyHas += 1;
      return;
    }

    upsertInfluencerProfile(canonicalId, { tags: nextTags }, updatedBy);
    result.updated += 1;
  });

  return Promise.resolve(result);
}

module.exports = {
  initDatabase,
  normalizeCommissionRate,
  sanitizeCommission,
  clearZeroCommissionRates,
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
  getAuditTabCounts,
  getAllSkuModels,
  getSkuModelLookupMap,
  getSkuModelById,
  insertSkuModel,
  updateSkuModel,
  deleteSkuModel,
  normalizeTagsValue,
  splitTagsValue,
  getRecordById,
  getRecordsByInfluencerId,
  getInfluencerDetailPayload,
  getCollaboratedRowForInfluencer,
  getInfluencerFollowUps,
  insertInfluencerFollowUp,
  deleteInfluencerFollowUp,
  getInfluencerFollowUpSummaryMap,
  getInfluencerFollowUpCountMap,
  getInfluencerEmailMap,
  updateInfluencerProfileEmail,
  batchScrapeInfluencerEmails,
  batchSaveInfluencerEmails,
  filterInfluencerIdsNeedingEmailScrape,
  influencerHasStoredEmail,
  getRecordIdsByFilters,
  getInfluencerIdsFromRecordIds,
  getInfluencerIdsByRecordFilters,
  batchDistributeAssigneesByInfluencer,
  batchDistributeAssigneesByRecordIds,
  canStaffAccessInfluencerAssignee,
  batchDeleteRecords,
  batchUpdateAssignee,
  updateRecordFields,
  setSampleOrderHeaders,
  getSampleOrderHeaders,
  setLastSampleOrderImport,
  getLastSampleOrderImport,
  findSampleOrderByUniqueKey,
  insertSampleOrder,
  getSampleOrderById,
  getSampleOrderPageNumber,
  getSampleOrders,
  getSampleOrderImportTimeOptions,
  getSampleOrderIdsByFilters,
  batchDeleteSampleOrders,
  syncSampleDatesToRecords,
  getLatestSampleOrderSummaryByBuyer,
  parseCreatedTimeToYmd,
  SAMPLE_ORDER_COLUMNS,
  ALLIANCE_ORDER_COLUMNS,
  RECORD_IMPORT_COLUMNS,
  setAllianceOrderHeaders,
  getAllianceOrderHeaders,
  setLastAllianceOrderImport,
  getLastAllianceOrderImport,
  findAllianceOrderByUniqueKey,
  insertAllianceOrder,
  updateAllianceOrder,
  importAllianceOrdersBatch,
  importSampleOrdersBatch,
  getAllianceOrderById,
  getAllianceOrderPageNumber,
  getAllianceOrders,
  getAllianceOrderImportTimeOptions,
  getAllianceOrderIdsByFilters,
  batchDeleteAllianceOrders,
  importInfluencerVideosBatch,
  getInfluencerVideos,
  getInfluencerVideoImportTimeOptions,
  getInfluencerVideoIdsByFilters,
  batchDeleteInfluencerVideos,
  INFLUENCER_VIDEO_COLUMNS,
  getCollaboratedStats,
  getCollaboratedRowsForExport,
  getCollaboratedMonthlyStats,
  getCollaboratedInfluencerIdsByFilters,
  getCollaboratedTabCounts,
  getCollaboratedFilterOptions,
  getInfluencerProfile,
  updateInfluencerProfileTags,
  batchUpdateInfluencerTags,
  updateInfluencerProfileInfluencerRemark,
  updateInfluencerProfileFulfillment,
  renameInfluencerId,
  getInfluencerIdRenameLogs,
  resolveCanonicalInfluencerId,
  getInfluencerAliasDisplayValues,
  toggleInfluencerProfilePin,
  batchUpdateInfluencerAssignees,
  importCollaboratedFieldsFromExcel,
  bulkAddInfluencerTag,
  getAssigneeStats,
  getSampleShipmentStats,
  FULFILLMENT_PROGRESS_OPTIONS,
  normalizeFulfillmentProgressValue,
  defaultDateFrom30Days,
  formatYmdFromDate,
  formatBeijingDateTime,
  rebuildAllianceOrderDerivedFields,
  getStaffMailSettingsPublic,
  getStaffMailSettingsForSend,
  updateStaffMailSettings,
  getCollaboratedRowsByInfluencerIds,
  buildCollaboratedEmailVars,
  buildInfluencerEmailVars,
  getPendingAuditEmailRowsByInfluencerIds,
  sendInfluencerBatchEmails,
  sendCollaboratedBatchEmails,
  sendPendingAuditBatchEmails,
  getLatestEmailSendSummaryMap,
  getEmailBatches,
  getEmailBatchDetail,
  MAX_BATCH_EMAIL_COUNT,
};
