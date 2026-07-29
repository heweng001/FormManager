const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(path.join(__dirname, '..', 'data.db')));
  const rows = db.exec(`
    SELECT id, title, content
    FROM articles
    WHERE title LIKE '%sop%' OR title LIKE '%SOP%' OR title LIKE '%达人%'
  `);
  if (!rows.length) {
    console.log('No matching articles');
    return;
  }
  rows[0].values.forEach(([id, title, content]) => {
    console.log('---', id, title, 'content length:', content.length);
    const imgs = [...String(content).matchAll(/<img[^>]*>/gi)];
    console.log('img tags:', imgs.length);
    imgs.forEach((m, i) => {
      const tag = m[0];
      const src = tag.match(/src=["']([^"']*)["']/i);
      console.log(`  [${i}] src prefix:`, src ? src[1].slice(0, 120) : 'NO SRC');
    });
    if (!imgs.length) {
      console.log('snippet:', String(content).slice(0, 500));
    }
  });
}

main().catch(console.error);
