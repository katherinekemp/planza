variable "region" {
  type    = string
  default = "us-west-2"
}

variable "app_domain" {
  description = "Where the web app is served. Its DNS is delegated to Route 53."
  type        = string
  default     = "planza.katherinekemp.com"
}

variable "github_repo" {
  description = <<-EOT
    Repo allowed to deploy via GitHub Actions, as it appears in GitHub's OIDC "sub" claim:
    owner@<owner id>/repo@<repo id>. The immutable IDs mean a different repo created later
    under the same name can't deploy here.
  EOT
  type        = string
  default     = "katherinekemp@40777203/planza@1384638164"
}

variable "instance_type" {
  type    = string
  default = "t4g.micro"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

locals {
  api_domain = "api.${var.app_domain}"
  account_id = data.aws_caller_identity.current.account_id
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
}
