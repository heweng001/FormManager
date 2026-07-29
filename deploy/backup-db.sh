#!/usr/bin/env bash
# 备份 data.db 到 backups/ 目录，保留最近 14 天
# 用法: bash deploy/backup-db.sh
# 定时任务示例（每天 3 点）:
#   0 3 * * * cd /opt/form-manager && bash deploy/backup-db.sh >> /var/log/form-manager-backup.log 2>&1

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/data.db"
BACKUP_DIR="$ROOT/backups"
STAMP="$(date +%Y%m%d_%H%M%S)"

if [[ ! -f "$DB" ]]; then
  echo "未找到 data.db: $DB"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
cp "$DB" "$BACKUP_DIR/data_${STAMP}.db"
find "$BACKUP_DIR" -name 'data_*.db' -mtime +14 -delete
echo "已备份: $BACKUP_DIR/data_${STAMP}.db"
