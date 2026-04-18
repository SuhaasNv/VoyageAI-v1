# ─────────────────────────────────────────────────────────────────────────────
#  infra/locals.tf
#
#  Resolves DO project + registry names so a fresh apply does not 409 against
#  account-wide resources created earlier (manual UI or another state file).
#  Override via TF_VAR_project_name / TF_VAR_registry_name or GitHub REGISTRY_NAME (default slug: voyageai-docr).
# ─────────────────────────────────────────────────────────────────────────────

locals {
  project_name = (
    var.project_name != null && trimspace(var.project_name) != ""
    ? trimspace(var.project_name)
    : "VoyageAI-${var.environment}"
  )

  registry_name = (
    var.registry_name != null && trimspace(var.registry_name) != ""
    ? trimspace(var.registry_name)
    : "voyageai-docr"
  )
}
