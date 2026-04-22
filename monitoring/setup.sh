#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VoyageAI Monitoring Droplet Bootstrap
#
# Run once on a fresh Ubuntu 22.04 Droplet:
#   curl -fsSL https://raw.githubusercontent.com/SuhaasNv/VoyageAI-v1/main/monitoring/setup.sh | bash
#
# Or after cloning the repo:
#   sudo bash monitoring/setup.sh
#
# What it does:
#   1. Installs Docker + Docker Compose plugin
#   2. Installs Nginx + certbot (HTTPS for Grafana)
#   3. Creates /opt/voyageai-monitoring with the correct file layout
#   4. Writes systemd service so the stack auto-starts on reboot
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn] ${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"

INSTALL_DIR=/opt/voyageai-monitoring

# ── 1. System packages ────────────────────────────────────────────────────────
log "Updating packages..."
apt-get update -qq
apt-get install -y -qq \
  curl gnupg ca-certificates lsb-release \
  nginx certbot python3-certbot-nginx \
  apache2-utils ufw

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  log "Docker already installed ($(docker --version))"
fi

# ── 3. Create install directory ───────────────────────────────────────────────
log "Creating $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"/{grafana/{provisioning/{datasources,dashboards},dashboards},data}

# ── 4. Write docker-compose.yml ───────────────────────────────────────────────
log "Writing docker-compose.yml ..."
cat > "$INSTALL_DIR/docker-compose.yml" << 'COMPOSE'
services:

  prometheus:
    image: prom/prometheus:v2.51.2
    container_name: voyageai-prometheus
    restart: unless-stopped
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=30d
      - --web.enable-lifecycle
      - --web.listen-address=0.0.0.0:9090
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./alert_rules.yml:/etc/prometheus/alert_rules.yml:ro
      - prometheus_data:/prometheus
    ports:
      - "127.0.0.1:9090:9090"

  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: voyageai-alertmanager
    restart: unless-stopped
    command:
      - --config.file=/etc/alertmanager/alertmanager.yml
      - --storage.path=/alertmanager
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager_data:/alertmanager
    ports:
      - "127.0.0.1:9093:9093"
    environment:
      - SENDGRID_API_KEY=${SENDGRID_API_KEY:-}
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-}

  grafana:
    image: grafana/grafana:10.4.2
    container_name: voyageai-grafana
    restart: unless-stopped
    environment:
      - GF_SERVER_HTTP_PORT=3001
      - GF_SERVER_ROOT_URL=%(protocol)s://%(domain)s/
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-changeme}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_AUTH_ANONYMOUS_ENABLED=false
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/etc/grafana/dashboards:ro
      - grafana_data:/var/lib/grafana
    ports:
      - "127.0.0.1:3001:3001"
    depends_on: [prometheus]

  node-exporter:
    image: prom/node-exporter:v1.8.0
    container_name: voyageai-node-exporter
    restart: unless-stopped
    command: [--path.rootfs=/host]
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/host:ro,rslave
    ports:
      - "127.0.0.1:9100:9100"
    pid: host

volumes:
  prometheus_data:
  alertmanager_data:
  grafana_data:
COMPOSE

# ── 5. Systemd service ────────────────────────────────────────────────────────
log "Installing systemd service..."
cat > /etc/systemd/system/voyageai-monitoring.service << SERVICE
[Unit]
Description=VoyageAI Monitoring Stack (Prometheus + Grafana)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=180

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable voyageai-monitoring

# ── 6. Firewall ───────────────────────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp   # Nginx HTTP (redirect to HTTPS)
ufw allow 443/tcp  # Nginx HTTPS
ufw --force enable

# ── 7. Nginx reverse proxy ────────────────────────────────────────────────────
log "Configuring Nginx..."
cat > /etc/nginx/sites-available/voyageai-monitoring << 'NGINX'
# Loaded by deploy — DOMAIN will be substituted by the deploy script
server {
    listen 80;
    server_name MONITORING_DOMAIN;

    # Let certbot prove ownership
    location /.well-known/acme-challenge/ { root /var/www/html; }

    # All other traffic → HTTPS
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name MONITORING_DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/MONITORING_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/MONITORING_DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Grafana
    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }

    # Prometheus (IP-restricted — only monitoring Droplet loopback)
    location /prometheus/ {
        proxy_pass http://127.0.0.1:9090/;
        auth_basic           "Prometheus";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }

    # Alertmanager
    location /alertmanager/ {
        proxy_pass http://127.0.0.1:9093/;
        auth_basic           "Alertmanager";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/voyageai-monitoring \
        /etc/nginx/sites-enabled/voyageai-monitoring
rm -f /etc/nginx/sites-enabled/default

log "✅ Bootstrap complete!"
log ""
log "Next steps:"
log "  1. Copy your monitoring config files to $INSTALL_DIR/"
log "  2. Create $INSTALL_DIR/.env (see monitoring/.env.example)"
log "  3. Run the deploy workflow or: sudo bash monitoring/deploy.sh <domain> <email>"
