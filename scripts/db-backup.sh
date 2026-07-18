#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Layer 1: Full Supabase PostgreSQL backup via pg_dump
#
# DEPLOY TO VPS AT: /opt/backups/db-backup.sh
# DO NOT commit SUPABASE_DB_URL to git — it contains the database password.
#
# Setup on VPS:
#   sudo apt-get install -y postgresql-client-16
#   sudo mkdir -p /opt/backups/supabase-daily
#   sudo cp scripts/db-backup.sh /opt/backups/db-backup.sh
#   sudo chmod +x /opt/backups/db-backup.sh
#
# Get SUPABASE_DB_URL from:
#   Supabase Dashboard → Project Settings → Database → Connection string
#   Use the "Direct connection" URI (port 5432), NOT the pooler (port 6543).
#   Format: postgresql://postgres:[DB_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
#   NOTE: DB password ≠ SUPABASE_SERVICE_ROLE_KEY. Reset it in the dashboard if unknown.
#
# Add to VPS crontab (/etc/cron.d/supabase-backup):
#   0 2 * * * root SUPABASE_DB_URL="postgresql://postgres:PASS@db.REF.supabase.co:5432/postgres" /opt/backups/db-backup.sh >> /var/log/supabase-backup.log 2>&1
#
# Restore procedure:
#   gunzip -c /opt/backups/supabase-daily/full-backup-YYYY-MM-DD.sql.gz \
#     | psql "postgresql://postgres:PASS@db.REF.supabase.co:5432/postgres"
#
# NOTE: Run a test restore against a blank STAGING Supabase project before
#       you ever need to use this in an emergency. Verify there are no
#       "permission denied" errors on the supabase_admin role — if any appear,
#       they are safe to ignore (use --single-transaction and grep for ERROR lines).
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BACKUP_DIR="/opt/backups/supabase-daily"
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d)
FILENAME="full-backup-${DATE}.sql.gz"
LOG_PREFIX="[$(date -u +%Y-%m-%dT%H:%M:%SZ)]"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "${LOG_PREFIX} ERROR: SUPABASE_DB_URL is not set." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "${LOG_PREFIX} Starting pg_dump for ${DATE} ..."

pg_dump \
  --dbname="${SUPABASE_DB_URL}" \
  --format=plain \
  --no-owner \
  --no-acl \
  --exclude-schema=supabase_functions \
  --exclude-schema=_realtime \
  --exclude-schema=realtime \
  --exclude-schema=pgbouncer \
  --exclude-schema=vault \
  | gzip -6 > "${BACKUP_DIR}/${FILENAME}"

FILESIZE=$(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "${LOG_PREFIX} Backup written: ${BACKUP_DIR}/${FILENAME} (${FILESIZE})"

# 30-day rolling retention
find "${BACKUP_DIR}" -name "full-backup-*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "${LOG_PREFIX} Retention cleanup done. Current backups:"
ls -lh "${BACKUP_DIR}/"
echo "${LOG_PREFIX} Done."
