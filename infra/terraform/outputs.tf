output "name_servers" {
  description = "Add these as NS records for 'planza' at katherinekemp.com's registrar."
  value       = aws_route53_zone.app.name_servers
}

output "web_url" { value = "https://${var.app_domain}" }
output "api_url" { value = "https://${local.api_domain}" }

# Values GitHub Actions needs (none are secret).
output "github_actions_variables" {
  value = {
    AWS_REGION                 = var.region
    AWS_DEPLOY_ROLE_ARN        = aws_iam_role.github_deploy.arn
    ECR_REPOSITORY_URL         = aws_ecr_repository.api.repository_url
    WEB_BUCKET                 = aws_s3_bucket.web.bucket
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.web.id
    API_INSTANCE_ID            = aws_instance.api.id
    VITE_API_URL               = "https://${local.api_domain}"
    VITE_COGNITO_DOMAIN        = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
    VITE_COGNITO_CLIENT_ID     = aws_cognito_user_pool_client.web.id
  }
}
