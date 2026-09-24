#!/bin/bash
# Deploys a given API image tag. Run on the server by GitHub Actions via SSM Run Command:
#   /opt/planza/deploy.sh <git-sha>
set -euo pipefail
TAG="${1:?usage: deploy.sh <image-tag>}"
cd /opt/planza
source host.env # REGION, REGISTRY, API_DOMAIN (written at first boot)

echo "--> Logging in to ECR"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "--> Loading app config from SSM Parameter Store"
aws ssm get-parameters-by-path --path /planza/prod/ --with-decryption --region "$REGION" \
  --query 'Parameters[].[Name,Value]' --output text |
  while IFS=$'\t' read -r name value; do echo "${name##*/}=${value}"; done >app.env.tmp
chmod 600 app.env.tmp && mv app.env.tmp app.env

cat >.env <<ENV
API_IMAGE=${REGISTRY}/planza-api:${TAG}
API_DOMAIN=${API_DOMAIN}
ENV

echo "--> Pulling ${TAG}"
docker compose pull --quiet

echo "--> Running database migrations"
docker compose run --rm --no-deps api node dist/migrate.js

echo "--> Starting new version"
docker compose up -d --remove-orphans

echo "--> Waiting for health check"
for _ in $(seq 1 30); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1; then
    echo "Deployed ${TAG}"
    docker image prune -af --filter "until=72h" >/dev/null
    exit 0
  fi
  sleep 2
done
echo "Health check failed" >&2
docker compose logs --tail 50 api >&2
exit 1
