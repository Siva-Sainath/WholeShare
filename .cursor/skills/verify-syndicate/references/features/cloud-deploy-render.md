# Feature: Cloud Deployment & Microservices Infrastructure

Infrastructure as Code (IaC) deployment blueprint on Render with local Docker Compose containerization for PostgreSQL, Redis, and multi-agent microservices.

## Sub-features
- `render-blueprint`: Declarative `render.yaml` specification declaring web orchestrator and managed PostgreSQL database.
- `docker-compose-stack`: Multi-container local definition orchestrating Next.js, Postgres 16, Redis 7, and Python microservices.
- `prisma-schema-migration`: Declarative ORM schema modeling Clans, Members, A2A Events, Escrows, and Disputes.
- `cloud-health-check`: Live endpoint asserting DB connection pooling, SSL encryption, and API keys.

## How to get to it (user POV)
- Production deployed at `https://wholeshare.onrender.com`.
- Local stack launched via `docker compose up -d` on port 3000 (web) and 5432 (Postgres).

## Driving it with control-syndicate
Preconditions:
- Docker daemon is running locally or Render CLI configured.
- `DATABASE_URL` environment variable is defined or falls back to local container.

Step-by-step driving commands:
```bash
# Verify cloud and containerized environment health
node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor

# Verify Docker container status and microservice topology
node .cursor/skills/verify-syndicate/control-syndicate.mjs docker:status

# Verify database schema, connection pool, and migrations
node .cursor/skills/verify-syndicate/control-syndicate.mjs db:status

# Validate Render IaC configuration blueprint
node .cursor/skills/verify-syndicate/control-syndicate.mjs cloud:verify
```

Proof standards:
- Docker inspect reports all containers in healthy/running state.
- Database connection probe returns latency < 20ms.
- Render blueprint validation passes schema checks with 1 web service and 1 managed database.

## Gotchas
- Render starter instances spin down on idle; keepalive pings are required during live hackathon demos.
- Database connection strings on Render require `sslmode=require`.
