# katherinekemp.com's DNS stays at the registrar. Only planza.katherinekemp.com is
# delegated here (via NS records at the registrar), so Terraform manages everything under it.

resource "aws_route53_zone" "app" {
  name = var.app_domain
}

resource "aws_route53_record" "web_cert_validation" {
  for_each = {
    for o in aws_acm_certificate.web.domain_validation_options : o.domain_name => o
  }
  zone_id = aws_route53_zone.app.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 300
}

resource "aws_route53_record" "web" {
  zone_id = aws_route53_zone.app.zone_id
  name    = var.app_domain
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.app.zone_id
  name    = local.api_domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.api.public_ip]
}
