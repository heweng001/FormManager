/**
 * PM2 进程配置
 * 用法（在项目根目录）:
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'form-manager',
      script: 'server.js',
      cwd: path.join(__dirname, '..'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        SESSION_SECRET: '请替换为随机字符串',
        // TIKTOK_PROXY: 'http://127.0.0.1:7890',
      },
    },
  ],
};
