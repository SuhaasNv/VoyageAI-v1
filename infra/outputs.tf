# ─────────────────────────────────────────────────────────────────────────────
#  infra/outputs.tf
#
#  Values surfaced after `terraform apply`.
#  In CI these are captured and written to the GitHub Actions step summary.
# ─────────────────────────────────────────────────────────────────────────────

# ── Container Registry ────────────────────────────────────────────────────────

output "registry_endpoint" {
  description = "DOCR endpoint — prefix for all image push/pull commands"
  value       = digitalocean_container_registry.voyageai.server_url
}

output "registry_name" {
  description = "Container Registry slug"
  value       = digitalocean_container_registry.voyageai.name
}

output "registry_urn" {
  description = "DigitalOcean URN of the Container Registry"
  value       = digitalocean_container_registry.voyageai.urn
}

output "full_image_path" {
  description = "Full path to push the voyageai-langgraph image (without tag)"
  value       = "${digitalocean_container_registry.voyageai.server_url}/voyageai-langgraph"
}

# ── App Platform ──────────────────────────────────────────────────────────────

output "langgraph_app_id" {
  description = "App Platform application ID"
  value       = digitalocean_app.langgraph.id
}

output "langgraph_app_urn" {
  description = "DigitalOcean URN of the App Platform app"
  value       = digitalocean_app.langgraph.urn
}

output "langgraph_live_url" {
  description = "Public HTTPS URL of the LangGraph service — set as LANGGRAPH_SERVICE_URL in Railway"
  value       = digitalocean_app.langgraph.live_url
}

output "langgraph_default_ingress" {
  description = "Default App Platform ingress URL (may differ from live_url before custom domain is set)"
  value       = digitalocean_app.langgraph.default_ingress
}

# ── Project ───────────────────────────────────────────────────────────────────

output "project_id" {
  description = "DigitalOcean project ID"
  value       = digitalocean_project.voyageai.id
}

# ── Railway integration hint ────────────────────────────────────────────────

output "railway_env_hint" {
  description = "Environment variable to set on the Railway Next.js service (Variables tab)"
  value       = "LANGGRAPH_SERVICE_URL=${digitalocean_app.langgraph.live_url}"
}

# Backward compatibility — same value as railway_env_hint
output "vercel_env_hint" {
  description = "Deprecated: use railway_env_hint (same value)"
  value       = "LANGGRAPH_SERVICE_URL=${digitalocean_app.langgraph.live_url}"
}
