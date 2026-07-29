const BLOCKED_EMAIL_DOMAINS = ['tiktok.com', 'byteoversea.com', 'example.com', 'musical.ly'];

function isValidInfluencerEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.split('@')[1].toLowerCase();
  return !BLOCKED_EMAIL_DOMAINS.some((part) => domain.includes(part));
}

function normalizeTikTokHtmlForEmailSearch(html) {
  return String(html || '')
    .replace(/\\u0040/gi, '@')
    .replace(/&#64;|&#x40;/gi, '@')
    .replace(/\s*\[at\]\s*/gi, '@')
    .replace(/\s*\(at\)\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@');
}

function extractEmailFromPlainText(text) {
  const normalized = normalizeTikTokHtmlForEmailSearch(text);
  const emails = normalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  for (const email of emails) {
    if (isValidInfluencerEmail(email)) return email;
  }
  return '';
}

function extractEmailFromTikTokUserObject(user) {
  if (!user || typeof user !== 'object') return '';
  const signature = String(user.signature || user.bio || user.desc || user.bioDescription || '').trim();
  const fromSignature = extractEmailFromPlainText(signature);
  if (fromSignature) return fromSignature;
  const directEmail = String(user.email || user.businessEmail || user.contactEmail || '').trim();
  if (isValidInfluencerEmail(directEmail)) return directEmail;
  const bioLink = user.bioLink || user.bio_link || user.biolink;
  if (bioLink && typeof bioLink === 'object') {
    const link = String(bioLink.link || bioLink.url || bioLink.title || '').trim();
    const mailto = link.match(/mailto:([^?]+)/i);
    if (mailto && isValidInfluencerEmail(mailto[1])) return mailto[1];
    const fromLink = extractEmailFromPlainText(link);
    if (fromLink) return fromLink;
  }
  return '';
}

function walkJsonForTikTokEmail(value, depth = 0) {
  if (depth > 10 || value == null) return '';
  if (typeof value === 'string') {
    if (value.includes('@') || value.includes('\\u0040')) return extractEmailFromPlainText(value);
    return '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = walkJsonForTikTokEmail(item, depth + 1);
      if (email) return email;
    }
    return '';
  }
  if (typeof value === 'object') {
    const fromUser = extractEmailFromTikTokUserObject(value);
    if (fromUser) return fromUser;
    for (const key of Object.keys(value)) {
      const email = walkJsonForTikTokEmail(value[key], depth + 1);
      if (email) return email;
    }
  }
  return '';
}

function extractSignatureFieldsFromRawHtml(html) {
  const normalized = normalizeTikTokHtmlForEmailSearch(html);
  const pattern = /"signature"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = pattern.exec(normalized))) {
    try {
      const decoded = JSON.parse(`"${match[1]}"`);
      const email = extractEmailFromPlainText(decoded);
      if (email) return email;
    } catch {
      const email = extractEmailFromPlainText(match[1]);
      if (email) return email;
    }
  }
  return '';
}

function detectTikTokWafPage(html) {
  const text = String(html || '');
  if (/Please wait|wafchallenge|SlardarWAF|_wafchallengeid|waf-aiso/i.test(text)) return true;
  if (text.trim().startsWith('<!DOCTYPE') && text.length < 8000) {
    if (!text.includes('SIGI_STATE') && !text.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) return true;
  }
  return false;
}

function pageHasTikTokProfileData(html) {
  const text = String(html || '');
  if (detectTikTokWafPage(text)) return false;
  if (text.includes('SIGI_STATE') || text.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) return true;
  if (/"signature"\s*:\s*"[^"]*@/.test(normalizeTikTokHtmlForEmailSearch(text))) return true;
  if (text.trim().startsWith('{') && text.includes('"uniqueId"')) return true;
  return text.length >= 8000;
}

function extractEmailFromTikTokHtml(html) {
  if (detectTikTokWafPage(html)) return '';

  const text = normalizeTikTokHtmlForEmailSearch(html);
  const mailto = text.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (mailto && isValidInfluencerEmail(mailto[1])) return mailto[1];

  const fromRawSignature = extractSignatureFieldsFromRawHtml(text);
  if (fromRawSignature) return fromRawSignature;

  const scriptIds = ['SIGI_STATE', '__UNIVERSAL_DATA_FOR_REHYDRATION__'];
  for (const scriptId of scriptIds) {
    const match = text.match(new RegExp(`<script id="${scriptId}"[^>]*>([\\s\\S]*?)<\\/script>`, 'i'));
    if (!match) continue;
    try {
      const data = JSON.parse(match[1]);
      const users = data?.UserModule?.users;
      if (users && typeof users === 'object') {
        for (const user of Object.values(users)) {
          const email = extractEmailFromTikTokUserObject(user);
          if (email) return email;
        }
      }
      const userInfo =
        data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo ||
        data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
      const fromDefault = extractEmailFromTikTokUserObject(userInfo);
      if (fromDefault) return fromDefault;
      const fromJson = walkJsonForTikTokEmail(data);
      if (fromJson) return fromJson;
    } catch {
      // ignore malformed JSON blocks
    }
  }

  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const fromJson = walkJsonForTikTokEmail(JSON.parse(trimmed));
      if (fromJson) return fromJson;
    }
  } catch {
    // not JSON response
  }

  return extractEmailFromPlainText(text);
}

module.exports = {
  detectTikTokWafPage,
  pageHasTikTokProfileData,
  extractEmailFromTikTokHtml,
};
