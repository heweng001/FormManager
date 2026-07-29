const XLSX = require('xlsx');
const db = require('../db');

const EXCEL_PATH = 'c:/Users/12421/Desktop/已寄样.xlsx';

function parseExcel() {
  const workbook = XLSX.readFile(EXCEL_PATH);
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }).map((row) => ({
    influencer_id: String(row['达人ID'] || '').trim(),
    assignee: String(row['负责人'] || '').trim(),
    fulfillment_progress: String(row['目前状态'] || '').trim(),
    remark: String(row['备注'] || '').trim(),
    situation: String(row['情况说明'] || '').trim(),
  }));
}

async function countExcelInCollaborated() {
  const excelIds = parseExcel().map((row) => row.influencer_id).filter(Boolean);
  let visible = 0;
  let withSampleDate = 0;
  let withProfileFields = 0;
  for (const id of excelIds) {
    const stats = await db.getCollaboratedStats({
      collab_tab: 'all',
      date_from: '20200101',
      date_to: '20991231',
      influencer_id: id,
      page: 1,
      pageSize: 1,
    });
    if (!stats.total) continue;
    visible += 1;
    const row = stats.rows[0];
    if (String(row.sample_date || '').trim()) withSampleDate += 1;
    if (row.assignee || row.fulfillment_progress || row.remark) withProfileFields += 1;
  }
  return { excelTotal: excelIds.length, visible, withSampleDate, withProfileFields };
}

async function main() {
  console.log('提示：请先停止正在运行的 server.js，否则导入结果可能被覆盖。');
  await db.initDatabase();
  await db.syncSampleDatesToRecords();
  const importResult = await db.importCollaboratedFieldsFromExcel(parseExcel(), 'excel-import');
  const summary = await countExcelInCollaborated();
  console.log(JSON.stringify({ importResult: { updated: importResult.updated, notFound: importResult.notFound }, summary }, null, 2));
  console.log('导入完成。请重启 server.js 后再刷新已合作列表。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
