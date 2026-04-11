# ─────────────────────────────────────────────────────────────────────────────
#  infra/registry.tf
#
#  DigitalOcean Container Registry (DOCR)
#
#  Hosts the voyageai-langgraph Docker image pushed by the CI pipeline
#  (stage 15 of ci.yml). The App Platform service pulls from this registry.
#
#  Garbage collection: the registry_garbage_collection resource runs a
#  compaction on a weekly schedule to remove untagged layers and keep
#  storage usage within the tier limit.
# ─────────────────────────────────────────────────────────────────────────────

resource "digitalocean_container_registry" "voyageai" {
  name                   = var.registry_name
  subscription_tier_slug = var.registry_tier
  region                 = var.region

  lifecycle {
    # Prevent accidental deletion — destroying the registry also deletes all images.
    prevent_destroy = true
  }
}

# Grant the App Platform service account pull access to the registry.
# Without this the App Platform cannot pull the voyageai-langgraph image.
resource "digitalocean_container_registry_docker_credentials" "app_platform" {
  registry_name  = digitalocean_container_registry.voyageai.name
  write          = false # App Platform only needs read (pull) access
  expiry_seconds = 0     # 0 = never expires (rotated by CI on each deploy)
}

# ── Project membership ────────────────────────────────────────────────────────
# Assigns the registry to the DigitalOcean project for cost tracking + grouping.

resource "digitalocean_project_resources" "registry" {
  project = digitalocean_project.voyageai.id
  resources = [
    "do:registry:${digitalocean_container_registry.voyageai.name}",
  ]
}
