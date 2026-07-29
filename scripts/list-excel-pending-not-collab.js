const XLSX = require('xlsx');
const fs = require('fs');
const initSqlJs = require('sql.js');
const db = require('../db');

const EXCEL_PATH = 'c:/Users/12421/Desktop/已寄样.xlsx';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

async function main() {
  await db.initDatabase();
  const SQL = await initSqlJs();
  const d = new SQL.Database(fs.readFileSync('data.db'));

  const workbook = XLSX.readFile(EXCEL_PATH);
  const excelIds = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
    .map((row) => String(row['达人ID'] || '').trim())
    .filter(Boolean);

  const collabStats = await db.getCollaboratedStats({
    collab_tab: 'all',
    date_from: '20200101',
    date_to: '20991231',
    page: 1,
    pageSize: 10000,
  });
  const collabSet = new Set(collabStats.rows.map((row) => normalizeKey(row.influencer_id)));
  const notInCollab = excelIds.filter((id) => !collabSet.has(normalizeKey(id)));

  const onlySample = [];
  for (const id of notInCollab) {
    const rec = d.exec(`SELECT influencer_id, audit_status FROM records WHERE lower(influencer_id)=lower('${id.replace(/'/g, "''")}') LIMIT 1`);
    const sample = d.exec(`SELECT buyer_username FROM sample_orders WHERE lower(buyer_username)=lower('${id.replace(/'/g, "''")}') LIMIT 1`);
    if (!rec[0]?.values?.length && sample[0]?.values?.length) onlySample.push(id);
    if (rec[0]?.values?.length) {
      console.log('in records not collab:', id, rec[0].values[0]);
    }
  }

  console.log('onlySample count', onlySample.length);
  console.log('onlySample ids:', JSON.stringify(onlySample.sort((a, b) => a.localeCompare(b, 'en')), null, 2));
}

main();
