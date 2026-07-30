#!/usr/bin/env bash
# Pull latest code and restart the app on the server.
# Note: git pull may fail if the server cannot reach GitHub (common in CN).
# Prefer GitHub Actions deploy or local deploy.ps1 (git archive sync).
# Usage: bash deploy/deploy-update.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/form-manager}"
cd "$APP_DIR"

echo "==> git pull"
if ! git pull origin master; then
  echo "ERROR: git pull failed. Server may be unable to reach GitHub."
  echo "Use GitHub Actions deploy, or from a dev machine run: .\\deploy\\deploy.ps1 -DeployOnly"
  exit 1
fi

bash deploy/deploy-remote-install.sh
