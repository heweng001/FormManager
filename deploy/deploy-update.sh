#!/usr/bin/env bash
# Pull latest code and restart the app on the server.
# Usage: bash deploy/deploy-update.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/form-manager}"
cd "$APP_DIR"

echo "==> git pull"
git pull origin master

echo "==> npm install"
npm install --omit=dev

echo "==> pm2 restart"
if pm2 describe form-manager >/dev/null 2>&1; then
  pm2 restart form-manager --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi

pm2 save
echo "==> Done"
