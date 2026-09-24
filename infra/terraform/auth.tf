resource "aws_cognito_user_pool" "main" {
  name           = "planza"
  user_pool_tier = "ESSENTIALS" # Free up to 10,000 monthly active users; includes the modern login page.

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = "ACTIVE"

  password_policy {
    minimum_length                   = 10
    require_lowercase                = true
    require_numbers                  = true
    require_uppercase                = false
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "random_id" "cognito_domain" {
  byte_length = 3
}

# Hosted login page at https://planza-xxxxxx.auth.<region>.amazoncognito.com
resource "aws_cognito_user_pool_domain" "main" {
  domain                = "planza-${random_id.cognito_domain.hex}"
  user_pool_id          = aws_cognito_user_pool.main.id
  managed_login_version = 2
}

# A public client (no secret): a browser app can't keep a secret, so it uses PKCE instead.
resource "aws_cognito_user_pool_client" "web" {
  name         = "web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = ["https://${var.app_domain}/auth/callback", "http://localhost:5173/auth/callback"]
  logout_urls   = ["https://${var.app_domain}/", "http://localhost:5173/"]

  explicit_auth_flows           = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_managed_login_branding" "web" {
  user_pool_id                = aws_cognito_user_pool.main.id
  client_id                   = aws_cognito_user_pool_client.web.id
  use_cognito_provided_values = true
}
