#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VoyageAI Monitoring — Deploy / Update Script
#
# Called by the GitHub Actions deploy-monitoring.yml workflow (via SSH),
# but can also be run manually on the Droplet:
#   sudo bash /opt/voyageai-monitoring/deploy.sh monitoring.yourdomain.com admin@yourdomain.com
#
# Args:
#   $1  DOMAIN   — subdomain for Grafana (e.g. monitoring.voyageai.app)
#   $2  EMAIL    — Let's Encrypt contact email
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
INSTALL_DIR=/opt/voyageai-monitoring

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]  ${NC} $*"; }
die()  { echo -e "${RED}[error] ${NC} $*"; exit 1; }

[[ -z "$DOMAIN" ]] && die "Usage: $0 <domain> <email>"
[[ -z "$EMAIL"  ]] && die "Usage: $0 <domain> <email>"
[[ $EUID -eq 0 ]] || die "Run as root"

# ── 1. Substitute domain in Nginx config ─────────────────────────────────────
log "Configuring Nginx for domain: $DOMAIN"
sed -i "s/MONITORING_DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/voyageai-monitoring
nginx -t && systemctl reload nginx

# ── 2. Obtain / renew TLS cert ────────────────────────────────────────────────
if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
  log "Obtaining Let's Encrypt certificate for $DOMAIN ..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
else
  log "Certificate already exists — renewing if needed..."
  certbot renew --quiet
fi

# ── 3. Set up certbot auto-renew ─────────────────────────────────────────────
if ! crontab -l 2>/dev/null | grep -q certbot; then
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
  log "Certbot auto-renew cron installed"
fi

# ── 4. Update prometheus.yml domain placeholders ─────────────────────────────
log "Updating prometheus.yml with production service URLs..."
# Replace placeholder targets if they still contain the template value
NEXTJS_URL="${NEXTJS_PROD_URL:-voyageai-nextjs-production-p94x3.ondigitalocean.app}"
LANGGRAPH_URL="${LANGGRAPH_PROD_URL:-voyageai-langgraph-production-ad7zy.ondigitalocean.app}"

sed -i "s|NEXTJS_PROD_HOST|${NEXTJS_URL}|g"       "$INSTALL_DIR/prometheus.yml" 2>/dev/null || true
sed -i "s|LANGGRAPH_PROD_HOST|${LANGGRAPH_URL}|g"  "$INSTALL_DIR/prometheus.yml" 2>/dev/null || true

# ── 5. Pull latest images and restart stack ───────────────────────────────────
log "Pulling latest Docker images..."
cd "$INSTALL_DIR"
docker compose pull --quiet

log "Restarting monitoring stack..."
docker compose up -d --remove-orphans --force-recreate

# ── 6. Wait for services to be healthy ───────────────────────────────────────
log "Waiting for Prometheus to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:9090/-/ready &>/dev/null; then
    log "✅ Prometheus is ready"
    break
  fi
  [[ $i -eq 30 ]] && die "Prometheus did not become ready in 60s"
  sleep 2
done

log "Waiting for Grafana to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/api/health &>/dev/null; then
    log "✅ Grafana is ready"
    break
  fi
  [[ $i -eq 30 ]] && die "Grafana did not become ready in 60s"
  sleep 2
done

# ── 7. Reload Prometheus config (hot-reload, no downtime) ────────────────────
log "Reloading Prometheus configuration..."
curl -s -XPOST http://127.0.0.1:9090/-/reload || warn "Prometheus reload returned non-zero (may already be up to date)"

log ""
log "✅ Monitoring stack deployed!"
log "   Grafana       → https://$DOMAIN"
log "   Prometheus    → https://$DOMAIN/prometheus/"
log "   Alertmanager  → https://$DOMAIN/alertmanager/"
