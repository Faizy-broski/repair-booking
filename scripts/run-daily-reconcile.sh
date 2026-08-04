#!/usr/bin/env bash
# Daily safety-net driver for /api/cron/reconcile-subscriptions.
#
# Re-checks every non-suspended subscription's status/period against live
# Stripe data and corrects any drift caused by a dropped or misrouted
# webhook (e.g. a business that paid but stayed locked because
# customer.subscription.updated / invoice.payment_succeeded never got
# processed). Safe to run daily — it only pulls truth from Stripe and never
# touches 'suspended' (admin-locked) rows.
#
# Usage (add to crontab, once a day, e.g. 3am server time):
#   0 3 * * * APP_URL=https://repairbooking.co.uk CRON_SECRET=xxx /opt/repair-booking/scripts/run-daily-reconcile.sh >> /var/log/repair-reconcile.log 2>&1
#
# Required env vars: APP_URL, CRON_SECRET
# (or source a .env file before calling this script — see below)

set -uo pipefail

: "${APP_URL:?APP_URL must be set (e.g. https://repairbooking.co.uk)}"
: "${CRON_SECRET:?CRON_SECRET must be set}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

log "=== Daily subscription reconciliation starting ==="

resp="$(curl -sS --fail-with-body -H "x-cron-secret: ${CRON_SECRET}" "${APP_URL}/api/cron/reconcile-subscriptions")"
status=$?

if [ "$status" -ne 0 ]; then
  log "FATAL: reconcile call failed transport-level: ${resp}"
  exit 1
fi

log "Response: ${resp}"

if echo "$resp" | grep -q '"ok":true'; then
  log "=== Reconciliation finished OK ==="
  exit 0
else
  log "=== Reconciliation reported a failure ==="
  exit 1
fi
