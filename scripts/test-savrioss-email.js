const { fetchTikTokHtmlServerSide } = require('../tiktokFetch');

function extractFromText(text) {
  const emails = String(text || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return emails;
}

async function main() {
  const proxy = process.env.TIKTOK_PROXY || '';
  const urls = [
    'https://www.tiktok.com/@savrioss?shop_region=US&lang=en',
    'https://www.tiktok.com/@savrioss?lang=en',
    'https://www.tiktok.com/api/user/detail/?uniqueId=savrioss',
  ];
  for (const url of urls) {
    try {
      const html = await fetchTikTokHtmlServerSide(url, proxy);
      console.log('URL:', url);
      console.log('  len:', html.length);
      console.log('  SIGI:', html.includes('SIGI_STATE'));
      console.log('  has savr0802@gmail.com:', /savr0802@gmail\.com/i.test(html));
      console.log('  emails found:', extractFromText(html).slice(0, 5));
      const sigIdx = html.indexOf('"signature"');
      if (sigIdx >= 0) console.log('  signature area:', html.slice(sigIdx, sigIdx + 200));
    } catch (e) {
      console.log('URL:', url, 'ERR:', e.message);
    }
  }
}

main();
