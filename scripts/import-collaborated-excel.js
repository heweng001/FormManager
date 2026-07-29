const path = require('path');
const XLSX = require('xlsx');
const { initDatabase, importCollaboratedFieldsFromExcel } = require('../db');

const DEFAULT_FILE = path.join('C:', 'Users', '12421', 'Desktop', '已寄样.xlsx');

function toCellValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((row) => ({
    influencer_id: toCellValue(row['达人ID']),
    assignee: toCellValue(row['负责人']),
    fulfillment_progress: toCellValue(row['目前状态']),
    remark: toCellValue(row['备注']),
    situation: toCellValue(row['情况说明']),
  }));
}

async function main() {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE;
  await initDatabase();
  const entries = parseExcelRows(filePath);
  const result = await importCollaboratedFieldsFromExcel(entries, 'excel-import');

  console.log(`文件: ${filePath}`);
  console.log(`Excel 行数: ${entries.length}`);
  console.log(`成功更新: ${result.updated}`);
  console.log(`跳过: ${result.skipped}`);
  console.log(`未匹配到已合作达人: ${result.notFound.length}`);
  if (result.notFound.length) {
    console.log('未匹配示例:', result.notFound.slice(0, 20).join(', '));
  }
  if (result.invalidStatus.length) {
    console.log('无效履约进展:', result.invalidStatus);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
