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
  value       = "do:registry:${digitalocean_container_registry.voyageai.name}"
}

output "full_image_path" {
  description = "Full path to push the voyageai-langgraph image (without tag)"
  value       = "${digitalocean_container_registry.voyageai.server_url}/voyageai-langgraph"
}

output "nextjs_image_path" {
  description = "Full path to push the voyageai-nextjs image (without tag)"
  value       = "${digitalocean_container_registry.voyageai.server_url}/voyageai-nextjs"
}

# ── App Platform — LangGraph ──────────────────────────────────────────────────

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

# ── App Platform — Next.js ────────────────────────────────────────────────────

output "nextjs_app_id" {
  description = "App Platform application ID for the Next.js service"
  value       = digitalocean_app.nextjs.id
}

output "nextjs_app_urn" {
  description = "DigitalOcean URN of the Next.js App Platform app"
  value       = digitalocean_app.nextjs.urn
}

output "nextjs_live_url" {
  description = "Public HTTPS URL of the Next.js service — set as NEXT_INTERNAL_URL in LangGraph and PRODUCTION_URL in CI"
  value       = digitalocean_app.nextjs.live_url
}

output "nextjs_default_ingress" {
  description = "Default App Platform ingress URL for the Next.js service"
  value       = digitalocean_app.nextjs.default_ingress
}

# ── Project ───────────────────────────────────────────────────────────────────

output "project_id" {
  description = "DigitalOcean project ID"
  value       = local.voyageai_project_id
}

# ── Post-deploy configuration hints ──────────────────────────────────────────

output "langgraph_env_hint" {
  description = "LangGraph NEXT_INTERNAL_URL is set by Terraform from nextjs.live_url unless TF_VAR_next_internal_url is set"
  value       = "NEXT_INTERNAL_URL auto: ${digitalocean_app.nextjs.live_url} (optional override: GitHub secret TF_VAR_next_internal_url)"
}

output "nextjs_env_hint" {
  description = "Environment variable to set in the Next.js App Platform service after LangGraph is deployed"
  value       = "LANGGRAPH_SERVICE_URL=${digitalocean_app.langgraph.live_url}"
}

# Backward compatibility — kept for CI that reads railway_env_hint
output "railway_env_hint" {
  description = "Deprecated: use nextjs_env_hint (same value)"
  value       = "LANGGRAPH_SERVICE_URL=${digitalocean_app.langgraph.live_url}"
}

# Backward compatibility
output "vercel_env_hint" {
  description = "Deprecated: use nextjs_env_hint"
  value       = "LANGGRAPH_SERVICE_URL=${digitalocean_app.langgraph.live_url}"
}
