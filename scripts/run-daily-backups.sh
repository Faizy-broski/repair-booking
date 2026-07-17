#!/usr/bin/env bash
# Daily backup driver for /api/cron/business-backups.
#
# The endpoint's ?action=process only exports ONE pending business per call
# (by design — keeps each HTTP request short). This script drives it to
# completion: schedule today's rows, then call process repeatedly until it
# reports nothing pending, then clean up backups older than 7 days.
#
# Usage (add to crontab, once a day, e.g. 2am server time):
#   0 2 * * * BACKUP_APP_URL=https://yourapp.com CRON_SECRET=xxx /opt/repair-booking/scripts/run-daily-backups.sh >> /var/log/repair-backups.log 2>&1
#
# Required env vars: BACKUP_APP_URL, CRON_SECRET
# (or source a .env file before calling this script — see below)

set -uo pipefail

: "${BACKUP_APP_URL:?BACKUP_APP_URL must be set (e.g. https://yourapp.com)}"
: "${CRON_SECRET:?CRON_SECRET must be set}"

# Safety valve — well above any realistic number of businesses, so a stuck
# "always pending" bug can't loop forever instead of just failing loudly.
MAX_ITERATIONS=1000

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

call() {
  local action="$1"
  curl -sS --fail-with-body \
    -H "x-cron-secret: ${CRON_SECRET}" \
    "${BACKUP_APP_URL}/api/cron/business-backups?action=${action}"
}

log "=== Daily backup run starting ==="

log "Scheduling today's backups..."
schedule_resp="$(call schedule)" || { log "FATAL: schedule call failed: ${schedule_resp}"; exit 1; }
log "Schedule response: ${schedule_resp}"

log "Processing pending backups..."
i=0
failures=0
while [ "$i" -lt "$MAX_ITERATIONS" ]; do
  i=$((i + 1))
  resp="$(call process)"
  status=$?
  if [ "$status" -ne 0 ]; then
    log "WARN: process call ${i} failed transport-level, stopping loop: ${resp}"
    failures=$((failures + 1))
    break
  fi

  if echo "$resp" | grep -q '"message":"No pending backups for today"'; then
    log "No more pending backups — processed $((i - 1)) business(es)."
    break
  fi

  if echo "$resp" | grep -q '"ok":false'; then
    failures=$((failures + 1))
    log "Backup FAILED (iteration ${i}): ${resp}"
  else
    log "Backup ok (iteration ${i}): ${resp}"
  fi

  if [ "$i" -eq "$MAX_ITERATIONS" ]; then
    log "WARN: hit MAX_ITERATIONS (${MAX_ITERATIONS}) — stopping to avoid an infinite loop. Investigate backup_registry."
  fi
done

log "Cleaning up backups older than 7 days..."
cleanup_resp="$(call cleanup)" || log "WARN: cleanup call failed: ${cleanup_resp}"
log "Cleanup response: ${cleanup_resp}"

log "=== Daily backup run finished (${failures} failure(s)) ==="

# Non-zero exit if anything failed, so cron's own failure-mail (if configured)
# or a monitoring wrapper picks it up too — belt and braces alongside the
# app's own ADMIN_ALERT_EMAIL.
[ "$failures" -eq 0 ]
