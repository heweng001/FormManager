const nodemailer = require('nodemailer');

const DEFAULT_SMTP_HOST = process.env.SMTP_HOST || 'smtp.qiye.163.com';
const DEFAULT_SMTP_PORT = Number(process.env.SMTP_PORT || 465);

const SMTP_PROVIDER_PRESETS = {
  netease_enterprise: { label: '网易企业邮', host: 'smtp.qiye.163.com', port: 465, secure: true },
  tencent_enterprise: { label: '腾讯企业邮', host: 'smtp.exmail.qq.com', port: 465, secure: true },
  tencent_personal: { label: 'QQ 邮箱', host: 'smtp.qq.com', port: 465, secure: true },
  aliyun_enterprise: { label: '阿里企业邮', host: 'smtp.mxhichina.com', port: 465, secure: true },
  gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true },
  outlook: { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, secure: false },
  custom: { label: '自定义', host: '', port: 465, secure: true },
};

function normalizeSmtpPort(value, fallback = 465) {
  const port = Number(value);
  if (!Number.isFinite(port) || port <= 0) return fallback;
  return port;
}

function resolveStaffSmtpConfig(settings = {}) {
  const presetKey = String(settings.smtp_provider || '').trim();
  const preset = SMTP_PROVIDER_PRESETS[presetKey];
  const host = String(settings.smtp_host || preset?.host || DEFAULT_SMTP_HOST).trim();
  const port = normalizeSmtpPort(settings.smtp_port ?? preset?.port, DEFAULT_SMTP_PORT);
  let secure = settings.smtp_secure;
  if (secure === undefined || secure === null || secure === '') {
    secure = preset?.secure ?? port === 465;
  } else {
    secure = Number(secure) === 1 || secure === true;
  }
  return { host, port, secure: Boolean(secure) };
}

function renderEmailTemplate(template, vars = {}) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

function createStaffTransporter(settings) {
  const smtp = resolveStaffSmtpConfig(settings);
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: settings.smtp_email,
      pass: settings.smtp_auth_code,
    },
  });
}

function buildStaffMailFrom(settings) {
  const fromName = String(settings.mail_from_name || settings.smtp_email || '').trim();
  const fromEmail = String(settings.smtp_email || '').trim();
  return {
    fromEmail,
    from: `"${fromName}" <${fromEmail}>`,
  };
}

function createStaffMailSender(settings) {
  const transporter = createStaffTransporter(settings);
  const { from, fromEmail } = buildStaffMailFrom(settings);
  return {
    async send({ to, subject, text }) {
      await transporter.sendMail({
        from,
        to,
        replyTo: fromEmail,
        subject: String(subject || '').trim(),
        text: String(text || ''),
      });
    },
    close() {
      if (typeof transporter.close === 'function') {
        transporter.close();
      }
    },
  };
}

async function sendStaffEmail(settings, { to, subject, text }) {
  const sender = createStaffMailSender(settings);
  try {
    await sender.send({ to, subject, text });
  } finally {
    sender.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidRecipientEmail(email) {
  const value = String(email || '').trim();
  if (!value || value === '未留') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = {
  DEFAULT_SMTP_HOST,
  DEFAULT_SMTP_PORT,
  SMTP_PROVIDER_PRESETS,
  resolveStaffSmtpConfig,
  renderEmailTemplate,
  createStaffMailSender,
  sendStaffEmail,
  sleep,
  isValidRecipientEmail,
};
