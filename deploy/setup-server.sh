#!/usr/bin/env bash
# 阿里云 ECS 首次环境安装（Ubuntu 22.04/24.04）
# 用法: bash deploy/setup-server.sh

set -euo pipefail

echo "==> 更新系统包"
sudo apt update
sudo apt install -y curl nginx git rsync

if ! command -v node >/dev/null 2>&1; then
  echo "==> 安装 Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "Node: $(node -v)"
echo "npm: $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> 安装 PM2"
  sudo npm install -g pm2
fi

APP_DIR="${APP_DIR:-/opt/form-manager}"
echo "==> 应用目录: $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"

echo ""
echo "完成。下一步:"
echo "  1. 上传代码到 $APP_DIR"
echo "  2. cd $APP_DIR && npm install --omit=dev"
echo "  3. 上传 data.db 和 uploads/"
echo "  4. 编辑 deploy/ecosystem.config.cjs 中的 SESSION_SECRET"
echo "  5. pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup"
echo "  6. 配置 Nginx（deploy/nginx.conf.example）并申请 SSL"
