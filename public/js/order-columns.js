/**
 * 导入列定义：忽略表头，按指定 Excel 列号（1-based）取值
 */
/** 样品订单：忽略前 2 行，从第 3 行起导入第 1、3、6、8、30、33、45 列 */
const SAMPLE_ORDER_COLUMN_INDEXES = [0, 2, 5, 7, 29, 32, 44];
const SAMPLE_ORDER_SOURCE_COLUMNS = [1, 3, 6, 8, 30, 33, 45];
const SAMPLE_ORDER_SKIP_HEADER_ROWS = 2;
const SAMPLE_ORDER_DATA_START_ROW = 3;

/** 联盟订单：TikTok 原始导出共 29 列；导入第 1、2、4、6、9、11、12、14、16、21、27 列（不含 5、8、28、29） */
const ALLIANCE_ORDER_FILE_COLUMN_COUNT = 29;
const ALLIANCE_ORDER_COLUMN_INDEXES = [0, 1, 3, 5, 8, 10, 11, 13, 15, 20, 26];
const ALLIANCE_ORDER_SOURCE_COLUMNS = [1, 2, 4, 6, 9, 11, 12, 14, 16, 21, 27];

const ALLIANCE_ORDER_COLUMNS = [
  { key: 'order_id', label: '订单id', legacyAliases: ['订单id', '订单 ID', 'Order ID', 'order id', 'unique_key'] },
  { key: 'product_id', label: '商品id', legacyAliases: ['商品id', '商品 ID', 'Product ID', 'product_id'] },
  { key: 'sku_id', label: 'skuID', legacyAliases: ['SKU ID', 'Sku ID', 'skuid', 'SKU', 'sku_id'] },
  { key: 'order_amount', label: '支付金额', legacyAliases: ['支付金额', '订单金额', 'Order Amount', 'order_amount'] },
  { key: 'full_refund', label: '已全部退款', legacyAliases: ['已全部退款', '全额退款', 'full_refund'] },
  { key: 'order_status', label: '订单状态', legacyAliases: ['订单状态', 'Order Status', 'order_status'] },
  { key: 'creator_username', label: '达人id', legacyAliases: ['达人id', '达人 ID', 'Creator Username', 'creator_username'] },
  { key: 'content_id', label: '内容id', legacyAliases: ['内容id', '内容 ID', 'Content ID', 'content_id'] },
  { key: 'commission_rate', label: '标准佣金率', legacyAliases: ['标准佣金率', '佣金率', 'Commission Rate', 'commission_rate'] },
  { key: 'ad_commission_rate', label: '广告佣金率', legacyAliases: ['广告佣金率', 'ad_commission_rate'] },
  { key: 'payment_time_raw', label: '支付时间', legacyAliases: ['支付时间', 'Payment Time', 'payment_time_raw'] },
];

/** 达人视频：忽略前 2 行，从第 3 行起导入第 1–6 列 */
const INFLUENCER_VIDEO_SKIP_HEADER_ROWS = 2;
const INFLUENCER_VIDEO_DATA_START_ROW = 3;

const INFLUENCER_VIDEO_COLUMNS = [
  { key: 'video_title', label: '视频标题' },
  { key: 'content_id', label: '内容id', legacyAliases: ['内容id', '内容 ID', 'Content ID', 'content_id'] },
  { key: 'publish_date_raw', label: '发布日期', legacyAliases: ['发布日期', 'Publish Date', 'publish_date'] },
  { key: 'video_url', label: '视频链接', legacyAliases: ['视频链接', 'Video URL', 'video_url', '链接'] },
  { key: 'creator_username', label: '达人id', legacyAliases: ['达人id', '达人 ID', 'Creator Username', 'creator_username'] },
  { key: 'product_id', label: '商品id', legacyAliases: ['商品id', '商品 ID', 'Product ID', 'product_id'] },
];

const INFLUENCER_VIDEO_SORTABLE_FIELDS = ['import_time', 'order_count', 'refund_count'];

const INFLUENCER_VIDEO_DISPLAY_COLUMNS = [
  ...INFLUENCER_VIDEO_COLUMNS,
  { key: 'order_count', label: '出单数', sortable: true },
  { key: 'refund_count', label: '退款数', sortable: true },
];

const SAMPLE_ORDER_COLUMNS = [
  { key: 'order_id', label: '订单id', legacyAliases: ['订单id', '订单 ID', 'Order ID', 'order id'] },
  { key: 'order_status', label: '订单状态', legacyAliases: ['订单状态', 'Order Status', 'order_status', 'Status', 'status'] },
  { key: 'sku_id', label: 'skuID', legacyAliases: ['skuID', 'SKU ID', 'Sku ID', 'skuid', 'SKU', 'sku_id'] },
  { key: 'product_id', label: '商品id', legacyAliases: ['商品id', '商品 ID', 'Product ID', 'product_id'] },
  { key: 'created_time_raw', label: '寄样时间', legacyAliases: ['寄样时间', '寄样日期', 'Created Time', 'created time', 'created_time_raw', 'payment_time_raw', '支付时间'] },
  { key: 'received_time_raw', label: '签收时间', legacyAliases: ['签收时间', '送达时间', 'Received Time', 'received_time'] },
  { key: 'buyer_username', label: '达人id', legacyAliases: ['达人id', '达人ID', 'Buyer Username', 'buyer username', 'Creator Username'] },
];

const RECORD_IMPORT_COLUMNS = [
  { key: 'influencer_id', label: '达人 id' },
  { key: 'follower_count', label: '粉丝数' },
  { key: 'expected_publish_rate', label: '预计发布率' },
  { key: 'transaction_amount', label: '成交金额' },
  { key: 'avg_video_views', label: '平均视频播放量' },
  { key: 'product_title', label: '商品标题' },
  { key: 'product_id', label: '商品 id' },
  { key: 'sku_id', label: 'SKU id' },
  { key: 'commission', label: '佣金率' },
  { key: 'application_id', label: '申请 id' },
  { key: 'update_time', label: '更新时间' },
];

function normalizeOrderFieldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[\s_\-./，,、:：;；()（）[\]【】]/g, '');
}

function pickOrderDataField(data, aliases) {
  if (!data || typeof data !== 'object') return '';
  const keys = Object.keys(data);
  for (const alias of aliases || []) {
    const normalized = normalizeOrderFieldKey(alias);
    const found = keys.find((key) => normalizeOrderFieldKey(key) === normalized);
    if (found) return String(data[found] ?? '').trim();
  }
  return '';
}

function readOrderCellValue(row, column) {
  if (!column || !row) return '';
  const topLevel = row[column.key];
  if (topLevel !== undefined && topLevel !== null && String(topLevel).trim() !== '') {
    return String(topLevel).trim();
  }
  const data = row.data || {};
  const direct = data[column.key];
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
    return String(direct).trim();
  }
  if (column.legacyAliases?.length) {
    return pickOrderDataField(data, column.legacyAliases);
  }
  return '';
}

function readOrderFieldFromData(data, key, legacyAliases) {
  const direct = String(data?.[key] ?? '').trim();
  if (direct) return direct;
  return pickOrderDataField(data, legacyAliases);
}

/** 按 columns 与 columnIndexes（0-based）从行中取值；无 columnIndexes 时按连续列序 */
function buildImportedOrderData(row, columns, columnIndexes) {
  const data = {};
  columns.forEach((column, index) => {
    const colIndex = columnIndexes ? columnIndexes[index] : index;
    data[column.key] = colIndex >= 0 ? (row[colIndex] ?? '') : '';
  });
  return data;
}

function buildSampleOrderImportData(row) {
  return buildImportedOrderData(row, SAMPLE_ORDER_COLUMNS, SAMPLE_ORDER_COLUMN_INDEXES);
}

function buildAllianceOrderImportData(row) {
  return buildImportedOrderData(row, ALLIANCE_ORDER_COLUMNS, ALLIANCE_ORDER_COLUMN_INDEXES);
}

function buildInfluencerVideoImportData(row) {
  return buildImportedOrderData(row, INFLUENCER_VIDEO_COLUMNS);
}

function buildRecordImportData(row) {
  return buildImportedOrderData(row, RECORD_IMPORT_COLUMNS);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SAMPLE_ORDER_COLUMN_INDEXES,
    SAMPLE_ORDER_SOURCE_COLUMNS,
    SAMPLE_ORDER_SKIP_HEADER_ROWS,
    SAMPLE_ORDER_DATA_START_ROW,
    ALLIANCE_ORDER_COLUMN_INDEXES,
    ALLIANCE_ORDER_SOURCE_COLUMNS,
    ALLIANCE_ORDER_FILE_COLUMN_COUNT,
    SAMPLE_ORDER_COLUMNS,
    ALLIANCE_ORDER_COLUMNS,
    INFLUENCER_VIDEO_COLUMNS,
    INFLUENCER_VIDEO_DISPLAY_COLUMNS,
    INFLUENCER_VIDEO_SKIP_HEADER_ROWS,
    INFLUENCER_VIDEO_DATA_START_ROW,
    RECORD_IMPORT_COLUMNS,
    normalizeOrderFieldKey,
    pickOrderDataField,
    readOrderCellValue,
    readOrderFieldFromData,
    buildImportedOrderData,
    buildSampleOrderImportData,
    buildAllianceOrderImportData,
    buildInfluencerVideoImportData,
    buildRecordImportData,
  };
}

if (typeof window !== 'undefined') {
  window.SAMPLE_ORDER_COLUMN_INDEXES = SAMPLE_ORDER_COLUMN_INDEXES;
  window.SAMPLE_ORDER_SOURCE_COLUMNS = SAMPLE_ORDER_SOURCE_COLUMNS;
  window.SAMPLE_ORDER_SKIP_HEADER_ROWS = SAMPLE_ORDER_SKIP_HEADER_ROWS;
  window.SAMPLE_ORDER_DATA_START_ROW = SAMPLE_ORDER_DATA_START_ROW;
  window.ALLIANCE_ORDER_COLUMN_INDEXES = ALLIANCE_ORDER_COLUMN_INDEXES;
  window.ALLIANCE_ORDER_SOURCE_COLUMNS = ALLIANCE_ORDER_SOURCE_COLUMNS;
  window.ALLIANCE_ORDER_FILE_COLUMN_COUNT = ALLIANCE_ORDER_FILE_COLUMN_COUNT;
  window.SAMPLE_ORDER_COLUMNS = SAMPLE_ORDER_COLUMNS;
  window.ALLIANCE_ORDER_COLUMNS = ALLIANCE_ORDER_COLUMNS;
  window.INFLUENCER_VIDEO_COLUMNS = INFLUENCER_VIDEO_COLUMNS;
  window.INFLUENCER_VIDEO_DISPLAY_COLUMNS = INFLUENCER_VIDEO_DISPLAY_COLUMNS;
  window.INFLUENCER_VIDEO_SKIP_HEADER_ROWS = INFLUENCER_VIDEO_SKIP_HEADER_ROWS;
  window.INFLUENCER_VIDEO_DATA_START_ROW = INFLUENCER_VIDEO_DATA_START_ROW;
  window.RECORD_IMPORT_COLUMNS = RECORD_IMPORT_COLUMNS;
  window.readOrderCellValue = readOrderCellValue;
}
