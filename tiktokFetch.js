const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const TIKTOK_HOSTS = new Set(['www.tiktok.com', 'tiktok.com', 'm.tiktok.com']);

function isAllowedTikTokUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && TIKTOK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function buildTikTokProfileUrls(username) {
  const clean = String(username || '').trim().replace(/^@+/, '');
  if (!clean) return [];
  const encoded = encodeURIComponent(clean);
  return [
    `https://www.tiktok.com/@${encoded}?shop_region=US&lang=en`,
    `https://www.tiktok.com/api/user/detail/?uniqueId=${encoded}`,
  ];
}

function getTikTokProxyCandidates(overrideProxy = '') {
  const values = [
    overrideProxy,
    process.env.TIKTOK_PROXY,
    process.env.HTTPS_PROXY,
    process.env.HTTP_PROXY,
    'http://127.0.0.1:7890',
    'http://127.0.0.1:7897',
    'http://127.0.0.1:1080',
    'http://127.0.0.1:10809',
  ];
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

function isAllowedProxyUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

async function fetchUrlViaCurl(targetUrl, proxyUrl = '') {
  const args = [
    '-sS',
    '-L',
    '--max-time',
    '12',
    '-A',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    '-H',
    'Accept-Language: en-US,en;q=0.9',
    '-H',
    'Accept: text/html,application/json;q=0.9,*/*;q=0.8',
  ];
  if (proxyUrl) args.push('-x', proxyUrl);
  args.push(targetUrl);
  const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const { stdout } = await execFileAsync(bin, args, { maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  if (!stdout || stdout.length < 80) {
    throw new Error('TikTok 返回内容为空');
  }
  return stdout;
}

async function fetchTikTokHtmlServerSide(targetUrl, overrideProxy = '') {
  if (!isAllowedTikTokUrl(targetUrl)) {
    throw new Error('非法 TikTok 地址');
  }
  const errors = [];
  const proxies = overrideProxy
    ? [overrideProxy]
    : ['', ...getTikTokProxyCandidates()];
  const seen = new Set();
  for (const proxy of proxies) {
    const key = proxy || 'direct';
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      return await fetchUrlViaCurl(targetUrl, proxy);
    } catch (err) {
      errors.push(`${key}: ${err.message || '失败'}`);
    }
  }
  throw new Error('无法连接 TikTok，请开启 VPN/代理，或在抓取前配置本地代理（如 http://127.0.0.1:7890）');
}

async function fetchTikTokProfileHtmlServerSide(username, overrideProxy = '') {
  const { detectTikTokWafPage, pageHasTikTokProfileData } = require('./tiktokEmailExtract');
  const urls = buildTikTokProfileUrls(username);
  let lastError = null;
  let sawWaf = false;
  for (const url of urls) {
    try {
      const html = await fetchTikTokHtmlServerSide(url, overrideProxy);
      if (detectTikTokWafPage(html)) {
        sawWaf = true;
        continue;
      }
      if (pageHasTikTokProfileData(html)) return html;
    } catch (err) {
      lastError = err;
    }
  }
  if (sawWaf) {
    throw new Error('TikTok 安全验证拦截，请先在浏览器打开该达人 TikTok 主页后再抓取');
  }
  throw lastError || new Error('无法获取 TikTok 页面内容');
}

module.exports = {
  isAllowedTikTokUrl,
  isAllowedProxyUrl,
  buildTikTokProfileUrls,
  fetchTikTokHtmlServerSide,
  fetchTikTokProfileHtmlServerSide,
  getTikTokProxyCandidates,
};
