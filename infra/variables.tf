# ─────────────────────────────────────────────────────────────────────────────
#  infra/variables.tf
#
#  All configurable inputs for the VoyageAI DigitalOcean infrastructure.
#  Values are supplied via:
#    • terraform.tfvars (local development — gitignored)
#    • GitHub Actions secrets + TF_VAR_* env vars (CI/CD)
# ─────────────────────────────────────────────────────────────────────────────

# ── DigitalOcean credentials ──────────────────────────────────────────────────

variable "do_token" {
  description = "DigitalOcean personal access token (write:registry + app platform scopes required)"
  type        = string
  sensitive   = true
}

# ── Region ────────────────────────────────────────────────────────────────────

variable "region" {
  description = "DigitalOcean region slug for all resources (registry, app platform)"
  type        = string
  default     = "nyc3"

  validation {
    condition     = contains(["nyc1", "nyc3", "ams3", "sfo3", "sgp1", "lon1", "fra1", "tor1", "blr1", "syd1"], var.region)
    error_message = "Must be a valid DigitalOcean region slug."
  }
}

# ── Project ───────────────────────────────────────────────────────────────────

variable "project_name" {
  description = "DigitalOcean project name used to group all resources"
  type        = string
  default     = "VoyageAI"
}

variable "environment" {
  description = "Deployment environment (staging | production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

# ── Container Registry ────────────────────────────────────────────────────────

variable "registry_name" {
  description = "DigitalOcean Container Registry name (slug). Must be globally unique."
  type        = string
  default     = "voyageai"
}

variable "registry_tier" {
  description = "Registry subscription tier: basic (1 repo, 500 MB), starter (1 repo, 500 MB free), professional (unlimited)"
  type        = string
  default     = "basic"

  validation {
    condition     = contains(["starter", "basic", "professional"], var.registry_tier)
    error_message = "registry_tier must be starter, basic, or professional."
  }
}

# ── App Platform — LangGraph service ─────────────────────────────────────────

variable "langgraph_image_tag" {
  description = "Docker image tag to deploy on the App Platform (e.g. 'latest' or a specific SHA tag)"
  type        = string
  default     = "placeholder"
}

variable "langgraph_instance_count" {
  description = "Number of LangGraph service instances (horizontal scaling)"
  type        = number
  default     = 1

  validation {
    condition     = var.langgraph_instance_count >= 1 && var.langgraph_instance_count <= 10
    error_message = "instance_count must be between 1 and 10."
  }
}

variable "langgraph_instance_size" {
  description = "App Platform instance size slug for the LangGraph service"
  type        = string
  default     = "professional-xs"

  validation {
    condition = contains([
      "basic-xxs", "basic-xs", "basic-s", "basic-m",
      "professional-xs", "professional-s", "professional-m", "professional-l", "professional-xl",
    ], var.langgraph_instance_size)
    error_message = "Must be a valid App Platform instance size slug."
  }
}

variable "next_internal_url" {
  description = "Public HTTPS URL of the Next.js App Platform service (LangGraph calls /api/internal/agent/execute)"
  type        = string
  default     = ""
}

variable "internal_agent_secret" {
  description = "Shared secret for Next.js ↔ LangGraph internal API authentication (INTERNAL_AGENT_SECRET)"
  type        = string
  sensitive   = true
}

# ── App Platform — Next.js service ───────────────────────────────────────────

variable "nextjs_image_tag" {
  description = "Docker image tag to deploy for the Next.js service on App Platform (e.g. 'latest' or a specific SHA tag)"
  type        = string
  default     = "placeholder"
}

variable "nextjs_instance_count" {
  description = "Number of Next.js service instances (horizontal scaling)"
  type        = number
  default     = 1

  validation {
    condition     = var.nextjs_instance_count >= 1 && var.nextjs_instance_count <= 10
    error_message = "instance_count must be between 1 and 10."
  }
}

variable "nextjs_instance_size" {
  description = "App Platform instance size slug for the Next.js service"
  type        = string
  default     = "professional-xs"

  validation {
    condition = contains([
      "basic-xxs", "basic-xs", "basic-s", "basic-m",
      "professional-xs", "professional-s", "professional-m", "professional-l", "professional-xl",
    ], var.nextjs_instance_size)
    error_message = "Must be a valid App Platform instance size slug."
  }
}

# ── Next.js runtime secrets ───────────────────────────────────────────────────

variable "database_url" {
  description = "Railway PostgreSQL connection string (DATABASE_URL — pooler URL for the app)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "direct_url" {
  description = "Railway PostgreSQL direct connection string for Prisma migrations (DIRECT_URL)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_access_secret" {
  description = "JWT access token signing secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_refresh_secret" {
  description = "JWT refresh token signing secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "csrf_secret" {
  description = "CSRF token HMAC secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "llm_provider" {
  description = "Primary LLM provider: openai | gemini"
  type        = string
  default     = "openai"
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gemini_api_key" {
  description = "Google Gemini API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "mapbox_token" {
  description = "Mapbox public token (NEXT_PUBLIC_MAPBOX_TOKEN — safe to expose to client)"
  type        = string
  default     = ""
}

variable "pexels_api_key" {
  description = "Pexels image API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "upstash_redis_rest_url" {
  description = "Upstash Redis REST URL (LLM response caching, rate limiting)"
  type        = string
  default     = ""
}

variable "upstash_redis_rest_token" {
  description = "Upstash Redis REST token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "langgraph_service_url" {
  description = "Public HTTPS URL of the LangGraph App Platform service (LANGGRAPH_SERVICE_URL in Next.js)"
  type        = string
  default     = ""
}

# ── Alerting ──────────────────────────────────────────────────────────────────

variable "alert_email" {
  description = "Email address for DigitalOcean infrastructure alerts (CPU spike, memory, deploy failures)"
  type        = string
  default     = ""
}
