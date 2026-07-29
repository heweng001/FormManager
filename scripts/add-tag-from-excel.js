const path = require('path');
const XLSX = require('xlsx');
const { initDatabase, bulkAddInfluencerTag } = require('../db');

const DEFAULT_FILE = path.join('C:', 'Users', '12421', 'Desktop', '达人来源为分配.xlsx');
const TAG_NAME = '分配';

function toCellValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseInfluencerIds(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((row) => toCellValue(row['达人ID'] || row['达人id'] || row.influencer_id)).filter(Boolean);
}

async function main() {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE;
  const tagName = process.argv[3] ? String(process.argv[3]).trim() : TAG_NAME;

  console.log('提示：请先停止正在运行的 server.js，否则结果可能被覆盖。');
  await initDatabase();

  const ids = parseInfluencerIds(filePath);
  const result = await bulkAddInfluencerTag(ids, tagName, 'excel-tag-import');

  console.log(`文件: ${filePath}`);
  console.log(`标签: ${tagName}`);
  console.log(`Excel 达人 id 数: ${ids.length}`);
  console.log(`新增标签: ${result.updated}`);
  console.log(`已有该标签: ${result.alreadyHas}`);
  console.log(`跳过空行: ${result.skipped}`);
  console.log(`未在系统中找到: ${result.notFound.length}`);
  if (result.notFound.length) {
    console.log('未找到示例:', result.notFound.slice(0, 20).join(', '));
  }
  console.log('完成。请重启 server.js 后刷新页面查看。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
