/**
 * 样品/联盟订单固定列定义（导入按列序号映射，展示不受 Excel 首行影响）
 */
const SAMPLE_ORDER_COLUMN_INDEXES = [0, 1, 2, 5, 28, 30, 31, 32, 38, 44];

const ALLIANCE_ORDER_COLUMN_INDEXES = [0, 1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 15, 16, 17, 20, 21, 25, 26, 27, 28];

const SAMPLE_ORDER_COLUMNS = [
  { key: 'unique_key', label: '唯一标识', legacyAliases: ['唯一标识', 'Sample Order ID', 'sample order id'] },
  { key: 'order_id', label: '订单 id', legacyAliases: ['Order ID', 'order id', 'OrderID', '订单 ID', '订单id', '订单ID'] },
  { key: 'buyer_username', label: '达人 id', legacyAliases: ['达人id', '达人ID', 'Buyer Username', 'buyer username', 'BuyerUsername'] },
  { key: 'product_name', label: '商品名称', legacyAliases: ['Product Name', 'product name', '商品名称', '商品名'] },
  { key: 'shop_name', label: '店铺', legacyAliases: ['Shop Name', 'shop name', '店铺', '店铺名称'] },
  { key: 'sku_id', label: 'SKU id', legacyAliases: ['SKU ID', 'Sku ID', 'SKU ID ', 'skuid', 'SKU'] },
  { key: 'created_time_raw', label: '寄样日期', legacyAliases: ['Created Time', 'created time', 'CreatedTime', 'Creater Time', '寄样日期', '创建时间'] },
  { key: 'status', label: '状态', legacyAliases: ['Status', 'status', '订单状态', '样品状态'] },
  { key: 'quantity', label: '数量', legacyAliases: ['Quantity', 'quantity', '数量'] },
  { key: 'remark', label: '备注', legacyAliases: ['Remark', 'remark', '备注', 'Note', 'note'] },
];

const ALLIANCE_ORDER_COLUMNS = [
  { key: 'unique_key', label: '唯一标识', legacyAliases: ['唯一标识', '联盟订单号'] },
  { key: 'content_id', label: '内容 id', legacyAliases: ['内容ID', '内容id', 'Content ID', 'content id'] },
  { key: 'creator_username', label: '达人 id', legacyAliases: ['达人id', '达人ID', '达人用户名', 'Creator Username', 'creator username'] },
  { key: 'product_name', label: '商品名称', legacyAliases: ['Product Name', 'product name', '商品名称', '商品名'] },
  { key: 'product_id', label: '商品 id', legacyAliases: ['Product ID', 'product id', '商品 ID', '商品id', '商品ID'] },
  { key: 'sku_id', label: 'SKU id', legacyAliases: ['SKU ID', 'Sku ID', 'skuid', 'SKU', 'Seller SKU'] },
  { key: 'payment_time_raw', label: '支付时间', legacyAliases: ['支付时间', 'Payment Time', 'payment time'] },
  { key: 'order_status', label: '订单状态', legacyAliases: ['Order Status', 'order status', '订单状态', '状态'] },
  { key: 'quantity', label: '数量', legacyAliases: ['Quantity', 'quantity', '数量'] },
  { key: 'product_price', label: '商品价格', legacyAliases: ['Product Price', 'product price', '商品价格', '单价'] },
  { key: 'order_amount', label: '订单金额', legacyAliases: ['Order Amount', 'order amount', '订单金额', '金额'] },
  { key: 'commission_rate', label: '佣金率', legacyAliases: ['Commission Rate', 'commission rate', '佣金率'] },
  { key: 'commission', label: '佣金', legacyAliases: ['Commission', 'commission', '佣金', '预估佣金'] },
  { key: 'currency', label: '币种', legacyAliases: ['Currency', 'currency', '币种'] },
  { key: 'promotion_type', label: '推广类型', legacyAliases: ['Promotion Type', 'promotion type', '推广类型', '推广位置'] },
  { key: 'order_id', label: '订单 id', legacyAliases: ['订单 ID', '订单id', '订单ID', 'Order ID', 'order id'] },
  { key: 'video_id', label: '视频 id', legacyAliases: ['Video ID', 'video id', '视频 ID', '视频id'] },
  { key: 'full_return', label: '已全部退货或全额退款', legacyAliases: ['已全部退货或全额退款', '已全部退货', '全额退款'] },
  { key: 'refund_amount', label: '退款金额', legacyAliases: ['Refund Amount', 'refund amount', '退款金额'] },
  { key: 'full_refund', label: '全额退款', legacyAliases: ['全额退款', 'Full Refund', 'full refund'] },
  { key: 'settlement_status', label: '结算状态', legacyAliases: ['Settlement Status', 'settlement status', '结算状态'] },
];

function normalizeOrderFieldKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
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

function buildImportedOrderData(row, columnIndexes, columns) {
  const data = {};
  columnIndexes.forEach((colIndex, idx) => {
    const column = columns[idx];
    if (!column) return;
    data[column.key] = row[colIndex] ?? '';
  });
  return data;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SAMPLE_ORDER_COLUMN_INDEXES,
    ALLIANCE_ORDER_COLUMN_INDEXES,
    SAMPLE_ORDER_COLUMNS,
    ALLIANCE_ORDER_COLUMNS,
    normalizeOrderFieldKey,
    pickOrderDataField,
    readOrderCellValue,
    readOrderFieldFromData,
    buildImportedOrderData,
  };
}

if (typeof window !== 'undefined') {
  window.SAMPLE_ORDER_COLUMN_INDEXES = SAMPLE_ORDER_COLUMN_INDEXES;
  window.ALLIANCE_ORDER_COLUMN_INDEXES = ALLIANCE_ORDER_COLUMN_INDEXES;
  window.SAMPLE_ORDER_COLUMNS = SAMPLE_ORDER_COLUMNS;
  window.ALLIANCE_ORDER_COLUMNS = ALLIANCE_ORDER_COLUMNS;
  window.readOrderCellValue = readOrderCellValue;
}
