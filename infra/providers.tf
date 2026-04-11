# ─────────────────────────────────────────────────────────────────────────────
#  infra/providers.tf
#
#  Terraform + DigitalOcean provider configuration.
#
#  Remote state backend: DigitalOcean Spaces (S3-compatible).
#  The bucket must exist before `terraform init` can succeed.
#
#  One-time bootstrap (run locally, once per project):
#    doctl spaces create voyageai-tfstate --region nyc3
#
#  Credentials are injected at init time via -backend-config flags in CI
#  (see .github/workflows/infra.yml) so no secrets are baked into this file.
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.7"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.39"
    }
  }

  # DigitalOcean Spaces is S3-compatible — use the aws backend with DO overrides.
  # Credentials are passed via -backend-config in CI; never hardcode here.
  backend "s3" {
    # Bucket must exist before init. See bootstrap note above.
    bucket = "voyageai-tfstate"
    key    = "voyageai/terraform.tfstate"

    # Spaces does not have real AWS regions; use this placeholder.
    region = "us-east-1"

    # Spaces-specific overrides — endpoint is injected via -backend-config in CI.
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}

# DigitalOcean provider — token injected from DIGITALOCEAN_ACCESS_TOKEN env var in CI.
provider "digitalocean" {
  token = var.do_token
}
