# ─────────────────────────────────────────────────────────────────────────────
#  infra/locals.tf
#
#  Resolves DO project + registry names so a fresh apply does not 409 against
#  account-wide resources created earlier (manual UI or another state file).
#  Override via TF_VAR_project_name / TF_VAR_registry_name or GitHub REGISTRY_NAME (default slug: voyageai-docr).
#  Default DO project is always "VoyageAI" (one project for every TF_VAR_environment); apps stay voyageai-*-<environment>.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  project_name = (
    var.project_name != null && trimspace(var.project_name) != ""
    ? trimspace(var.project_name)
    : "VoyageAI"
  )

  registry_name = (
    var.registry_name != null && trimspace(var.registry_name) != ""
    ? trimspace(var.registry_name)
    : "voyageai-docr"
  )

  # DOCR / Spaces use datacenter slugs (e.g. sgp1). App Platform accepts shorter slugs (e.g. sgp).
  registry_region = lookup(
    {
      nyc  = "nyc3"
      nyc1 = "nyc1"
      nyc3 = "nyc3"
      ams  = "ams3"
      ams3 = "ams3"
      sfo  = "sfo3"
      sfo3 = "sfo3"
      sgp  = "sgp1"
      sgp1 = "sgp1"
      lon  = "lon1"
      lon1 = "lon1"
      fra  = "fra1"
      fra1 = "fra1"
      tor  = "tor1"
      tor1 = "tor1"
      blr  = "blr1"
      blr1 = "blr1"
      syd  = "syd1"
      syd1 = "syd1"
    },
    var.region,
    var.region
  )

  # Resolved project id for digitalocean_project_resources (create vs existing project).
  voyageai_project_id = (
    var.manage_digitalocean_project
    ? digitalocean_project.voyageai[0].id
    : data.digitalocean_project.voyageai[0].id
  )
}
