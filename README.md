# Nucleus — Notification Engine

> A production-grade, multi-tenant notification microservice that handles the formatting, routing, and delivery of all transactional communications across Email, SMS, and real-time WebSocket channels.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Kafka](https://img.shields.io/badge/Apache%20Kafka-231F20?logo=apache-kafka&logoColor=white)](https://kafka.apache.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)](https://redis.io/)

---

## What It Does

Nucleus is a centralized messaging engine built for multi-tenant SaaS architectures. Instead of embedding notification code and third-party SDKs into every application, client applications act as **event producers** — they fire a single webhook, and Nucleus handles the rest:

1. **Accept** arbitrary JSON events from any authenticated tenant
2. **Route** events through a template matrix to determine which channels (Email, SMS, Push) to activate
3. **Render** dynamic content using MJML + Handlebars templates
4. **Dispatch** through configurable providers (Resend, SendGrid, Twilio)
5. **Deliver** real-time WebSocket notifications via Centrifugo
6. **Track** delivery status with audit logging and retry/DLQ management

---

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Tenant A   │    │   Tenant B   │    │   Tenant C   │    │   Admin UI   │
│  (E-commerce)│    │    (CRM)     │    │  (Fintech)   │    │  (Next.js)   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │                   │
       │   POST /events/trigger (API Key)      │       REST Admin APIs
       ▼───────────────────▼───────────────────▼───────────────────▼
  ┌────────────────────────────────────────────────────────────────────┐
  │                    NestJS Worker (TypeScript)                      │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
  │  │ Webhook  │  │ Template │  │  Render  │  │   Admin CRUD     │ │
  │  │ Ingress  │  │  Router  │  │  Engine  │  │  (Tenants/Tmpl)  │ │
  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────────────────┘ │
  │       │              │              │                              │
  │       ▼              ▼              ▼                              │
  │  ┌─────────────────────────────────────┐                          │
  │  │            Kafka Broker             │◄── Idempotency (Redis)   │
  │  │  tenant.event.received ──────────── │    Rate Limiting (Redis) │
  │  │  notification.dispatch ──────────── │    Tenant Cache (Redis)  │
  │  │  notification.retry ────────────── │                          │
  │  │  notification.dlq ─────────────── │                          │
  │  └──────────────┬──────────────────────┘                          │
  └─────────────────┼──────────────────────────────────────────────────┘
                    │
                    ▼
  ┌─────────────────────────────────────────────┐
  │           Go Gateway (Golang)               │
  │  ┌──────────────────────────────────────┐   │
  │  │     Channel Adapter Registry         │   │
  │  │  ┌─────────┬────────┬────────────┐   │   │
  │  │  │ Resend  │ Twilio │ Centrifugo │   │   │
  │  │  │ (Email) │ (SMS)  │ (WebSocket)│   │   │
  │  │  └─────────┴────────┴────────────┘   │   │
  │  └──────────────────────────────────────┘   │
  │  Retry with exponential backoff → DLQ       │
  └───────────────┬──────────────────────┬──────┘
                  │                      │
                  ▼                      ▼
  ┌──────────────────┐    ┌──────────────────┐
  │   PostgreSQL     │    │    Centrifugo     │
  │  (Audit Logs,    │    │   (WebSocket      │
  │   Templates,     │    │    Server)        │
  │   Tenants)       │    │                   │
  └──────────────────┘    └──────────────────┘
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Multi-Tenant Isolation** | Strict tenant separation at the database level with API key authentication and HMAC webhook signing |
| **Omnichannel Dispatch** | Single webhook trigger fans out to Email, SMS, and In-App Push simultaneously |
| **Template Engine** | MJML + Handlebars rendering with versioning, rollback, and global/tenant-scoped templates |
| **BYOP (Bring Your Own Provider)** | Tenant-level provider configuration for Resend, SendGrid, Twilio, or custom providers |
| **Real-Time WebSockets** | Live in-app notifications via Centrifugo with JWT-secured channel subscriptions |
| **Reliability** | Redis-backed idempotency, rate limiting, retry with exponential backoff, and dead-letter queue |
| **Admin Dashboard** | Next.js admin UI for managing tenants, templates, routing, logs, providers, and DLQ |
| **Offline Sync** | Notification bell history for users who missed real-time messages |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Worker** | NestJS (TypeScript), Prisma ORM |
| **Gateway** | Go, Kafka consumer, Adapter Registry pattern |
| **Admin UI** | Next.js 16, React 19, Tailwind CSS v4 |
| **Messaging** | Apache Kafka (KRaft mode, no Zookeeper) |
| **Database** | PostgreSQL 17 |
| **Cache/State** | Redis 7 |
| **Real-Time** | Centrifugo (WebSocket server) |
| **Email** | MJML for responsive HTML, Handlebars for templating |

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Go 1.21+

### 1. Start Infrastructure

```bash
cd notifications-system
docker compose up -d
```

This starts Kafka, PostgreSQL, Redis, Centrifugo, Kafka UI (`:8080`), and pgAdmin (`:5050`).

### 2. Start the NestJS Worker

```bash
cd worker
cp .env.example .env   # Configure your environment variables
npm install
npx prisma generate
npx prisma db push
npm run start:dev       # Runs on :4000
```

### 3. Start the Go Gateway

```bash
cd gateway
go run main.go          # Listens to Kafka topics
```

### 4. Start the Admin UI

```bash
cd admin-ui
npm install
npm run dev             # Runs on :5173
```

### 5. Trigger a Test Notification

```bash
curl -X POST http://localhost:4000/api/v1/events/trigger \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_TENANT_API_KEY" \
  -d '{
    "eventType": "global.info",
    "payload": {
      "userId": "user-uuid",
      "title": "Welcome!",
      "message": "Your account has been activated."
    }
  }'
```

---

## Project Structure

```
notifications-system/
├── worker/              # NestJS Worker — event processing, rendering, admin APIs
│   ├── src/
│   │   ├── admin/       # Tenant, template, provider, log, DLQ admin controllers
│   │   ├── auth/        # Centrifugo realtime token issuance
│   │   ├── events/      # Webhook ingestion with API key + HMAC auth
│   │   ├── notifications/ # Kafka consumer, template routing, dispatch
│   │   └── common/      # Redis, rate limiting, idempotency, logging
│   └── prisma/          # Database schema and seeds
├── gateway/             # Go Gateway — Kafka consumer, adapter registry, retry/DLQ
│   ├── adapters/        # Channel adapters (Resend, Twilio, Centrifugo)
│   └── types/           # Shared type definitions
├── admin-ui/            # Next.js Admin Dashboard
│   ├── app/             # Pages: Dashboard, Tenants, Templates, Routing, Logs, DLQ
│   └── lib/             # API config, theme config, error boundary
├── centrifugo/          # Centrifugo WebSocket server config
├── init-db/             # PostgreSQL initialization scripts
├── docs/                # Architecture docs, integration guide, roadmap
└── docker-compose.yml   # Infrastructure services
```

---

## Documentation

- [System Architecture](notifications-system/docs/System-Explanation.md)
- [System Design Report](notifications-system/docs/System-Design-Report.md)
- [Integration Guide](notifications-system/docs/Integration-Guide.md)
- [Development Roadmap](notifications-system/docs/Roadmap.md)

---

## License

This project is private and proprietary.
