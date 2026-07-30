/**
 * 导入列定义：忽略表头，按指定 Excel 列号（1-based）取值
 */
/** 样品订单：导入第 1、2、3、6、29、31、32、33、39、45 列（0-based 索引） */
const SAMPLE_ORDER_COLUMN_INDEXES = [0, 1, 2, 5, 28, 30, 31, 32, 38, 44];
const SAMPLE_ORDER_SOURCE_COLUMNS = [1, 2, 3, 6, 29, 31, 32, 33, 39, 45];

/** 联盟订单：导入第 1、2、3、4、5、6、8、9、11、12、13、14、16、17、18、21、22、26、27、28、29 列 */
const ALLIANCE_ORDER_COLUMN_INDEXES = [0, 1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 15, 16, 17, 20, 21, 25, 26, 27, 28];
const ALLIANCE_ORDER_SOURCE_COLUMNS = [1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 16, 17, 18, 21, 22, 26, 27, 28, 29];

const SAMPLE_ORDER_COLUMNS = [
  { key: 'unique_key', label: '唯一标识', legacyAliases: ['唯一标识', 'Sample Order ID', 'Order ID', '订单 ID'] },
  { key: 'order_id', label: '订单 id', legacyAliases: ['Order ID', 'order id', 'OrderID', '订单 ID', '订单id'] },
  { key: 'buyer_username', label: '达人 id', legacyAliases: ['达人id', '达人ID', 'Buyer Username', 'buyer username'] },
  { key: 'product_name', label: '商品名称', legacyAliases: ['Product Name', 'product name', '商品名称'] },
  { key: 'shop_name', label: '店铺', legacyAliases: ['Shop Name', 'shop name', '店铺'] },
  { key: 'sku_id', label: 'SKU id', legacyAliases: ['SKU ID', 'Sku ID', 'skuid', 'SKU'] },
  { key: 'created_time_raw', label: '寄样日期', legacyAliases: ['Created Time', 'created time', '寄样日期', '创建时间'] },
  { key: 'status', label: '状态', legacyAliases: ['Status', 'status', '订单状态'] },
  { key: 'quantity', label: '数量', legacyAliases: ['Quantity', 'quantity', '数量'] },
  { key: 'remark', label: '备注', legacyAliases: ['Remark', 'remark', '备注'] },
];

const ALLIANCE_ORDER_COLUMNS = [
  { key: 'unique_key', label: '唯一标识', legacyAliases: ['唯一标识', '联盟订单号', 'Order ID', '订单 ID'] },
  { key: 'content_id', label: '内容 id', legacyAliases: ['内容ID', '内容id', 'Content ID', 'content id'] },
  { key: 'creator_username', label: '达人 id', legacyAliases: ['达人id', '达人ID', 'Creator Username', 'creator username'] },
  { key: 'product_name', label: '商品名称', legacyAliases: ['Product Name', 'product name', '商品名称'] },
  { key: 'product_id', label: '商品 id', legacyAliases: ['Product ID', 'product id', '商品 ID', '商品id'] },
  { key: 'sku_id', label: 'SKU id', legacyAliases: ['SKU ID', 'Sku ID', 'skuid', 'SKU'] },
  { key: 'payment_time_raw', label: '支付时间', legacyAliases: ['支付时间', 'Payment Time', 'payment time'] },
  { key: 'order_status', label: '订单状态', legacyAliases: ['Order Status', 'order status', '订单状态'] },
  { key: 'quantity', label: '数量', legacyAliases: ['Quantity', 'quantity', '数量'] },
  { key: 'product_price', label: '商品价格', legacyAliases: ['Product Price', 'product price', '商品价格', '单价'] },
  { key: 'order_amount', label: '订单金额', legacyAliases: ['Order Amount', 'order amount', '订单金额', '金额'] },
  { key: 'commission_rate', label: '佣金率', legacyAliases: ['Commission Rate', 'commission rate', '佣金率'] },
  { key: 'commission', label: '佣金', legacyAliases: ['Commission', 'commission', '佣金'] },
  { key: 'currency', label: '币种', legacyAliases: ['Currency', 'currency', '币种'] },
  { key: 'promotion_type', label: '推广类型', legacyAliases: ['Promotion Type', 'promotion type', '推广类型'] },
  { key: 'order_id', label: '订单 id', legacyAliases: ['订单 ID', '订单id', 'Order ID', 'order id'] },
  { key: 'video_id', label: '视频 id', legacyAliases: ['Video ID', 'video id', '视频 ID'] },
  { key: 'full_return', label: '已全部退货或全额退款', legacyAliases: ['已全部退货或全额退款', '已全部退货'] },
  { key: 'refund_amount', label: '退款金额', legacyAliases: ['Refund Amount', 'refund amount', '退款金额'] },
  { key: 'full_refund', label: '全额退款', legacyAliases: ['全额退款', 'Full Refund', 'full refund'] },
  { key: 'settlement_status', label: '结算状态', legacyAliases: ['Settlement Status', 'settlement status', '结算状态'] },
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

function buildRecordImportData(row) {
  return buildImportedOrderData(row, RECORD_IMPORT_COLUMNS);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SAMPLE_ORDER_COLUMN_INDEXES,
    SAMPLE_ORDER_SOURCE_COLUMNS,
    ALLIANCE_ORDER_COLUMN_INDEXES,
    ALLIANCE_ORDER_SOURCE_COLUMNS,
    SAMPLE_ORDER_COLUMNS,
    ALLIANCE_ORDER_COLUMNS,
    RECORD_IMPORT_COLUMNS,
    normalizeOrderFieldKey,
    pickOrderDataField,
    readOrderCellValue,
    readOrderFieldFromData,
    buildImportedOrderData,
    buildSampleOrderImportData,
    buildAllianceOrderImportData,
    buildRecordImportData,
  };
}

if (typeof window !== 'undefined') {
  window.SAMPLE_ORDER_COLUMN_INDEXES = SAMPLE_ORDER_COLUMN_INDEXES;
  window.SAMPLE_ORDER_SOURCE_COLUMNS = SAMPLE_ORDER_SOURCE_COLUMNS;
  window.ALLIANCE_ORDER_COLUMN_INDEXES = ALLIANCE_ORDER_COLUMN_INDEXES;
  window.ALLIANCE_ORDER_SOURCE_COLUMNS = ALLIANCE_ORDER_SOURCE_COLUMNS;
  window.SAMPLE_ORDER_COLUMNS = SAMPLE_ORDER_COLUMNS;
  window.ALLIANCE_ORDER_COLUMNS = ALLIANCE_ORDER_COLUMNS;
  window.RECORD_IMPORT_COLUMNS = RECORD_IMPORT_COLUMNS;
  window.readOrderCellValue = readOrderCellValue;
}
