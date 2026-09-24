# Planza — Tech Stack & Architecture Plan

Planza is a website for making casual plans with friends. Users join **groups**, and inside a group they post **plans**, which can have a concrete date or just be an idea. An iOS app may come later.

Project goals, in priority order:

1. Ship a real app that real people can use, as quickly as possible.
2. Keep hosting cheap for an MVP (target: **~$27/mo**).
3. Get hands-on with TypeScript, PostgreSQL, Docker, and AWS in ways that match what employers use. Kubernetes comes later.

---

## 1. Stack at a glance

| Layer               | Choice                                                                                 | Why                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Language            | **TypeScript** everywhere                                                              | One language across web, API, shared types, and later React Native.                |
| Monorepo            | **pnpm workspaces**                                                                    | Shared zod schemas and types between web, API, and a future mobile app.            |
| Web frontend        | **React + Vite**, TanStack Query, React Router, Tailwind                               | Static single-page app (SPA), so it can be hosted on S3/CloudFront for pennies.    |
| API                 | **Node.js + Fastify**, REST under `/v1`, zod validation                                | Light, fast, and TypeScript-first. REST works for any client (web now, iOS later). |
| Database            | **PostgreSQL 16 on RDS** (`db.t4g.micro`)                                              | Managed backups and patching for real user data. RDS is what most companies use.   |
| ORM / migrations    | **Drizzle ORM + drizzle-kit**                                                          | SQL-first, so you learn Postgres itself rather than an abstraction over it.        |
| Auth                | **AWS Cognito** (email, later Google + Apple)                                          | Managed and free at MVP scale. Standard OIDC/JWT that works on both web and iOS.   |
| Containers          | **Docker** (multi-stage `arm64` image) + **Docker Compose** on EC2                     | Keeps the container workflow without paying for an orchestrator yet.               |
| Reverse proxy / TLS | **Caddy**                                                                              | Automatic HTTPS certificates from Let's Encrypt, with a two-line config.           |
| Infra as code       | **Terraform**                                                                          | The most-requested IaC tool in job postings.                                       |
| CI/CD               | **GitHub Actions** with AWS OIDC (no long-lived keys); deploys via **SSM Run Command** | No SSH keys and no open management ports.                                          |
| Tests               | **Vitest**                                                                             |                                                                                    |
| Later               | OpenTelemetry → Grafana Cloud, k3s → EKS, React Native + Expo                          | See the roadmap.                                                                   |

---

## 2. Architecture (MVP)

```
                    Route 53 (<domain>)
            ┌───────────────┴────────────────┐
     app.<domain>                        api.<domain>
            ▼                                 ▼
  ┌──────────────────┐            ┌────────────────────────────┐
  │ CloudFront + S3  │  SPA calls │ EC2 t4g.micro (public)     │
  │ (React SPA)      │ ─────────▶ │  docker compose:           │
  └──────────────────┘  API + JWT │   ├─ caddy  (:443, TLS)    │
                                  │   └─ api    (Fastify)      │
  ┌──────────────────┐            └─────────────┬──────────────┘
  │ Cognito User Pool│ ◀── verify JWT ──────────┤ 5432 (security group)
  └──────────────────┘                          ▼
                                  ┌────────────────────────────┐
                                  │ RDS Postgres db.t4g.micro  │
                                  │ (private subnets)          │
                                  └────────────────────────────┘

  GitHub Actions ──OIDC──▶ ECR (API image), S3 (web build), SSM Run Command (deploy)
```

**Cost-saving choices**

- **No NAT gateway** (~$33/mo saved). EC2 sits in a public subnet. Inbound traffic is limited to 80/443, and there's no SSH (use SSM Session Manager instead). RDS is in private subnets and doesn't need internet access.
- **No load balancer** (~$24/mo saved). Caddy on the server terminates TLS directly.
- **No Kubernetes yet.** The same server can run k3s later.

**Accepted trade-off:** with a single server there's no high availability. That's acceptable for an MVP.

### Estimated monthly cost (us-east-1, on-demand)

| Item                                         | ~$/mo        |
| -------------------------------------------- | ------------ |
| RDS `db.t4g.micro` single-AZ                 | 11.70        |
| RDS storage 20 GB                            | 2.30         |
| EC2 `t4g.micro`                              | 6.15         |
| EBS 10 GB                                    | 0.80         |
| Public IPv4 / Elastic IP                     | 3.65         |
| Route 53 hosted zone                         | 0.50         |
| Domain (amortized)                           | ~1           |
| ECR, S3, CloudFront, SSM, Cognito (<10k MAU) | ~0–1         |
| **Total**                                    | **≈ $26–27** |

Set an AWS Budget alert at ~$35 on day one.

### Why RDS instead of Postgres inside the cluster

- **The cost difference mostly disappears.** Running Postgres on a small server needs a larger instance, which costs about as much as RDS.
- **Your data is safer.** If the server dies, the database isn't affected, and backups and point-in-time restore are managed for you.
- **RDS is what most companies use,** so it's what interviewers expect.
- **You learn the same Postgres either way.** Schema design, indexes, query plans, and transactions work identically.
- **You can still practice** running Postgres on Kubernetes (the CloudNativePG operator) in a local cluster, where mistakes cost nothing.

---

## 3. Domain model (MVP)

```
users            id, cognito_sub (unique), email, display_name, created_at
groups           id, name, description, created_by,
                 who_can_post   enum('all_members','admins')
                 who_can_invite enum('all_members','admins'), created_at, updated_at
group_members    group_id, user_id, role enum('owner','admin','member'), joined_at
group_invites    id, group_id, token (unique), created_by, expires_at, revoked_at
plans            id, group_id, author_id, title, description, location,
                 starts_at NULL  -- NULL ⇒ it's an "idea"
                 created_at, updated_at
plan_responses   plan_id, user_id, response enum('going','maybe','interested','cant'), updated_at
```

- **An idea is just a plan with no date.** Setting a date turns it into a plan.
- **Authorization is checked in the API** (membership plus group settings), and every query is scoped to the groups the user belongs to.

---

## 4. Roadmap (fastest path to a live app)

1. **Foundations.** Monorepo, TypeScript, and local Postgres in Docker.
2. **Database.** Drizzle schema and migrations.
3. **API.** Fastify routes for groups, plans, RSVPs, and invites, with a dev-only login for local work.
4. **Web app.** React pages for groups, plans, RSVPs, and joining via an invite link.
5. **Real auth.** Cognito user pool, with the API verifying tokens.
6. **AWS infrastructure.** Terraform for the VPC, EC2, RDS, ECR, S3/CloudFront, Route 53, and Cognito.
7. **Deploy.** Dockerfile, Caddy, and GitHub Actions CI/CD. **App is live 🎉**
8. **Portfolio polish.** README with architecture diagram and screenshots, tests, and resume bullets.

**Later:** observability (OpenTelemetry → Grafana Cloud), comments, notifications (SES, then push), Google/Apple login, k3s → EKS, and an iOS app with Expo.
