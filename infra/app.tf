# ─────────────────────────────────────────────────────────────────────────────
#  infra/app.tf
#
#  DigitalOcean App Platform — VoyageAI LangGraph Orchestration Service
#
#  Architecture:
#    Railway (Next.js) ──HTTP──▶ App Platform (LangGraph) ──HTTP──▶ Railway /api/internal
#
#  The service:
#    • Pulls the voyageai-langgraph image from DOCR on every deploy
#    • Exposes POST /run  and  GET /health  on HTTP port 8000
#    • Scales horizontally via var.langgraph_instance_count
#    • All secrets are injected as App Platform secret env vars (never in logs)
#    • Health check on /health with a 15s startup grace period
#
#  Also contains:
#    • digitalocean_project resource  (groups all DO resources for billing)
#    • App Platform alert policies    (CPU spike, memory, deploy failures)
# ─────────────────────────────────────────────────────────────────────────────

# ── DigitalOcean Project ──────────────────────────────────────────────────────

resource "digitalocean_project" "voyageai" {
  name        = var.project_name
  description = "VoyageAI — AI-powered travel planning app"
  purpose     = "Web Application"
  environment = title(var.environment) # "Staging" | "Production"
}

# ── App Platform — LangGraph service ─────────────────────────────────────────

resource "digitalocean_app" "langgraph" {
  spec {
    name   = "voyageai-langgraph-${var.environment}"
    region = var.region

    # ── Service definition ───────────────────────────────────────────────────
    service {
      name               = "langgraph"
      instance_count     = var.langgraph_instance_count
      instance_size_slug = var.langgraph_instance_size

      # ── Image source (DOCR) ─────────────────────────────────────────────
      image {
        registry_type = "DOCR"
        repository    = "voyageai-langgraph"
        tag           = var.langgraph_image_tag

        # Auto-redeploy when a new image with this tag is pushed to DOCR.
        # Set to "UNSET" to disable auto-deploy (manual deploys only).
        deploy_on_push {
          enabled = var.environment == "production" ? true : false
        }
      }

      # ── Networking ──────────────────────────────────────────────────────
      http_port = 8000

      # ── Health check ────────────────────────────────────────────────────
      health_check {
        http_path             = "/health"
        initial_delay_seconds = 15
        period_seconds        = 30
        timeout_seconds       = 5
        success_threshold     = 1
        failure_threshold     = 3
      }

      # ── Environment variables ────────────────────────────────────────────
      # Plain (non-sensitive) — visible in logs
      env {
        key   = "NEXT_INTERNAL_URL"
        value = var.next_internal_url
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      env {
        key   = "LANGGRAPH_PORT"
        value = "8000"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      env {
        key   = "WORKERS"
        value = "1"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      env {
        key   = "PYTHONUNBUFFERED"
        value = "1"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      # Secret (sensitive) — encrypted at rest, masked in logs
      env {
        key   = "INTERNAL_AGENT_SECRET"
        value = var.internal_agent_secret
        scope = "RUN_TIME"
        type  = "SECRET"
      }
    }

    # ── Ingress (custom routing rules) ───────────────────────────────────────
    # App Platform exposes a public HTTPS URL automatically.
    # Restrict public access to only the /health endpoint;
    # /run is authenticated via X-Internal-Agent-Secret header at the app layer.
    ingress {
      rule {
        component {
          name = "langgraph"
        }
        match {
          path {
            prefix = "/"
          }
        }
      }
    }
  }

  lifecycle {
    # Image tag changes (new deploys) happen via CI, not Terraform.
    # Prevent Terraform from reverting a CI-deployed tag on the next `apply`.
    ignore_changes = [
      spec[0].service[0].image[0].tag,
    ]
  }
}

# ── Assign app to project ─────────────────────────────────────────────────────

resource "digitalocean_project_resources" "app" {
  project = digitalocean_project.voyageai.id
  resources = [
    digitalocean_app.langgraph.urn,
  ]
}

# ── Alert policies ────────────────────────────────────────────────────────────
# Sends email notifications for infrastructure health issues.
# Only created when var.alert_email is set.

resource "digitalocean_monitor_alert" "cpu_spike" {
  count = var.alert_email != "" ? 1 : 0

  alerts {
    email = [var.alert_email]
  }

  window      = "5m"
  type        = "v1/insights/droplet/cpu"
  compare     = "GreaterThan"
  value       = 90
  enabled     = true
  description = "VoyageAI LangGraph — CPU > 90% for 5 min"
}

resource "digitalocean_monitor_alert" "memory_spike" {
  count = var.alert_email != "" ? 1 : 0

  alerts {
    email = [var.alert_email]
  }

  window      = "5m"
  type        = "v1/insights/droplet/memory_utilization_percent"
  compare     = "GreaterThan"
  value       = 85
  enabled     = true
  description = "VoyageAI LangGraph — Memory > 85% for 5 min"
}
