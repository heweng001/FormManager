const crypto = require('crypto');

function getEncryptionKey() {
  const secret = process.env.SESSION_SECRET || 'lujifo-erp-session-secret';
  return crypto.scryptSync(secret, 'lujifo-mail-auth-salt', 32);
}

function encryptSecret(text) {
  const value = String(text || '');
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptSecret(payload) {
  const encoded = String(payload || '').trim();
  if (!encoded) return '';
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = {
  encryptSecret,
  decryptSecret,
};
