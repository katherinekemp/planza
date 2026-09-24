# Latest Amazon Linux 2023 for ARM (Graviton).
data "aws_ssm_parameter" "al2023_arm" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# ---- IAM role the server runs as (no access keys on the box) ----

resource "aws_iam_role" "api_server" {
  name = "planza-api-server"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Lets SSM Session Manager (instead of SSH) and Run Command (deploys) reach the server.
resource "aws_iam_role_policy_attachment" "api_server_ssm" {
  role       = aws_iam_role.api_server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "api_server" {
  name = "planza-api-server"
  role = aws_iam_role.api_server.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid      = "PullApiImage"
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = aws_ecr_repository.api.arn
      },
      {
        Sid    = "ReadAppConfig"
        Effect = "Allow"
        Action = ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${var.region}:${local.account_id}:parameter/planza/prod",
          "arn:aws:ssm:${var.region}:${local.account_id}:parameter/planza/prod/*",
        ]
      },
    ]
  })
}

resource "aws_iam_instance_profile" "api_server" {
  name = "planza-api-server"
  role = aws_iam_role.api_server.name
}

# ---- The server ----

resource "aws_instance" "api" {
  ami                    = data.aws_ssm_parameter.al2023_arm.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.api.id]
  iam_instance_profile   = aws_iam_instance_profile.api_server.name

  # T-series "unlimited" mode can bill extra for sustained CPU; "standard" throttles instead.
  credit_specification {
    cpu_credits = "standard"
  }

  # IMDSv2 only, and a hop limit of 1 so containers can't read the server's AWS credentials.
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size = 10
    volume_type = "gp3"
    encrypted   = true
  }

  # First-boot setup: Docker, Compose, and the files in /deploy.
  # The server holds no data, so changing this replaces it rather than patching it in place.
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    region     = var.region
    registry   = split("/", aws_ecr_repository.api.repository_url)[0]
    api_domain = local.api_domain
    compose    = file("${path.module}/../../deploy/compose.yml")
    caddyfile  = file("${path.module}/../../deploy/Caddyfile")
    deploy_sh  = file("${path.module}/../../deploy/deploy.sh")
  })
  user_data_replace_on_change = true

  lifecycle {
    # Don't replace the server every time Amazon publishes a new AMI.
    ignore_changes = [ami]
  }

  tags = { Name = "planza-api" }
}

# A fixed public IP, so DNS keeps working if the server is replaced.
resource "aws_eip" "api" {
  instance = aws_instance.api.id
  domain   = "vpc"
  tags     = { Name = "planza-api" }
}

resource "aws_ecr_repository" "api" {
  name                 = "planza-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

# Keep storage costs near zero by deleting old images.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 10 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ---- Runtime configuration, read by deploy.sh on the server ----

locals {
  app_config = {
    AUTH_MODE            = "cognito"
    COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
    COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.web.id
    CORS_ORIGINS         = "https://${var.app_domain}"
  }
}

resource "aws_ssm_parameter" "app_config" {
  for_each = local.app_config
  name     = "/planza/prod/${each.key}"
  type     = "String"
  value    = each.value
}

resource "aws_ssm_parameter" "database_url" {
  name  = "/planza/prod/DATABASE_URL"
  type  = "SecureString" # Encrypted with KMS at rest.
  value = "postgres://planza:${random_password.db.result}@${aws_db_instance.main.address}:5432/planza?sslmode=require"
}
