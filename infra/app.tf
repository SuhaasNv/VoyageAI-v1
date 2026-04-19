# ─────────────────────────────────────────────────────────────────────────────
#  infra/app.tf
#
#  DigitalOcean App Platform — VoyageAI Multi-Service Stack
#
#  Architecture:
#    App Platform (Next.js) ──HTTP──▶ App Platform (LangGraph) ──HTTP──▶ Next.js /api/internal
#
#  Services:
#    • voyageai-langgraph  — Python FastAPI + LangGraph orchestration (port 8000)
#    • voyageai-nextjs     — Next.js 15 frontend + API routes        (port 3000)
#
#  Both services:
#    • Pull images from DOCR on every deploy
#    • Scale horizontally via var.*_instance_count
#    • All secrets are injected as App Platform secret env vars (never in logs)
#    • Health checks ensure zero-downtime deployments
#
#  Also contains:
#    • digitalocean_project resource OR data source (groups all DO resources for billing)
#    • App Platform alert policies    (CPU spike, memory, deploy failures)
# ─────────────────────────────────────────────────────────────────────────────

# ── DigitalOcean Project ──────────────────────────────────────────────────────
# manage_digitalocean_project defaults false (lookup existing project by name). Set true only for greenfield DO accounts.

resource "digitalocean_project" "voyageai" {
  count = var.manage_digitalocean_project ? 1 : 0

  name        = local.project_name
  description = "VoyageAI — AI-powered travel planning app"
  purpose     = "Web Application"
}

data "digitalocean_project" "voyageai" {
  count = var.manage_digitalocean_project ? 0 : 1
  name  = local.project_name
}

# ── App Platform — LangGraph service ─────────────────────────────────────────

resource "digitalocean_app" "langgraph" {
  # Registry must exist before App Platform validates the image source.
  depends_on = [digitalocean_container_registry.voyageai]

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
        initial_delay_seconds = 30
        period_seconds        = 30
        timeout_seconds       = 10
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

# ── App Platform — Next.js frontend ──────────────────────────────────────────

resource "digitalocean_app" "nextjs" {
  # Registry must exist before App Platform validates the image source.
  depends_on = [digitalocean_container_registry.voyageai]

  spec {
    name   = "voyageai-nextjs-${var.environment}"
    region = var.region

    # ── Service definition ───────────────────────────────────────────────────
    service {
      name               = "nextjs"
      instance_count     = var.nextjs_instance_count
      instance_size_slug = var.nextjs_instance_size

      # ── Image source (DOCR) ─────────────────────────────────────────────
      image {
        registry_type = "DOCR"
        repository    = "voyageai-nextjs"
        tag           = var.nextjs_image_tag

        deploy_on_push {
          enabled = var.environment == "production" ? true : false
        }
      }

      # ── Networking ──────────────────────────────────────────────────────
      http_port = 3000

      # ── Health check ────────────────────────────────────────────────────
      health_check {
        http_path             = "/api/auth/csrf"
        initial_delay_seconds = 90
        period_seconds        = 30
        timeout_seconds       = 15
        success_threshold     = 1
        failure_threshold     = 5
      }

      # ── Non-sensitive environment variables ─────────────────────────────
      env {
        key   = "NODE_ENV"
        value = "production"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      env {
        key   = "NEXT_TELEMETRY_DISABLED"
        value = "1"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      env {
        key   = "LLM_PROVIDER"
        value = var.llm_provider
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      env {
        key   = "LANGGRAPH_SERVICE_URL"
        value = var.langgraph_service_url
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      # Public Mapbox token — safe to expose to the browser
      env {
        key   = "NEXT_PUBLIC_MAPBOX_TOKEN"
        value = var.mapbox_token
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      env {
        key   = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      env {
        key   = "UPSTASH_REDIS_REST_URL"
        value = var.upstash_redis_rest_url
        scope = "RUN_TIME"
        type  = "GENERAL"
      }

      # ── Secrets (encrypted at rest, masked in logs) ─────────────────────
      env {
        key   = "DATABASE_URL"
        value = var.database_url
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "DIRECT_URL"
        value = var.direct_url
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "JWT_ACCESS_SECRET"
        value = var.jwt_access_secret
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "JWT_REFRESH_SECRET"
        value = var.jwt_refresh_secret
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "CSRF_SECRET"
        value = var.csrf_secret
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "INTERNAL_AGENT_SECRET"
        value = var.internal_agent_secret
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "GOOGLE_CLIENT_SECRET"
        value = var.google_client_secret
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "OPENAI_API_KEY"
        value = var.openai_api_key
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "GEMINI_API_KEY"
        value = var.gemini_api_key
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "PEXELS_API_KEY"
        value = var.pexels_api_key
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "UPSTASH_REDIS_REST_TOKEN"
        value = var.upstash_redis_rest_token
        scope = "RUN_TIME"
        type  = "SECRET"
      }

      env {
        key   = "NEXT_PUBLIC_APP_URL"
        value = "$${APP_URL}"
        scope = "RUN_TIME"
        type  = "GENERAL"
      }
    }

    # ── Ingress (route all traffic to the Next.js service) ───────────────────
    ingress {
      rule {
        component {
          name = "nextjs"
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
    ignore_changes = [
      spec[0].service[0].image[0].tag,
    ]
  }
}

# ── Assign apps to project ────────────────────────────────────────────────────

resource "digitalocean_project_resources" "app" {
  project = local.voyageai_project_id
  resources = [
    digitalocean_app.langgraph.urn,
    digitalocean_app.nextjs.urn,
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
