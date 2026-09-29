# Lab 07 — API Gateway, Config-based Service Discovery & Cloud Deployment

## Overview

Lab 07 extends the three-microservice architecture from **Lab 06** by adding:

1. **API Gateway** — a single public entry point that reverse-proxies all client traffic to the appropriate downstream service (`/users/*` → user-service, `/products/*` → product-service, `/orders/*` → order-service).
2. **Config-driven service discovery** — gateway upstream URLs come exclusively from environment variables; no URL is hard-coded in routing logic.
3. **Cloud deployment** — all four services deployed to [Render](https://render.com) with a public gateway URL reachable over the internet.

> **Lab 06 is preserved untouched.** Lab 07 is a separate folder that started as a copy of Lab 06 and added the gateway layer on top.

**GitHub:** https://github.com/24Chessman/202512006_IT644_Lab07

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Docker campus-network                       │
│                                                                  │
│  Client / Postman                                                │
│       │                                                          │
│       ▼  port 4000 (ONLY published port — local)                 │
│  ┌──────────────┐                                                │
│  │  api-gateway │  GET /health     → gateway (no proxy)         │
│  │   :3000      │  ANY /users/*    → user-service:3001           │
│  │              │  ANY /products/* → product-service:3002        │
│  │              │  ANY /orders/*   → order-service:3003          │
│  └──────┬───────┘                                                │
│         │  Docker bridge DNS — internal only                     │
│   ┌─────┴──────────────────────────┐                            │
│   ▼                    ▼                         ▼               │
│ ┌──────────────┐ ┌──────────────────┐ ┌──────────────────┐     │
│ │ user-service │ │ product-service  │ │  order-service   │     │
│ │   :3001      │ │    :3002         │ │     :3003        │     │
│ │  (expose)    │ │   (expose)       │ │    (expose)      │     │
│ └──────────────┘ └──────────────────┘ └──────────────────┘     │
│      NOT reachable from host — gateway only                      │
└─────────────────────────────────────────────────────────────────┘

Cloud (Render) — same topology, all HTTPS:
  https://lab07-api-gateway.onrender.com        ← PUBLIC gateway
        → https://lab07-user-service.onrender.com
        → https://lab07-product-service.onrender.com
        → https://lab07-order-service.onrender.com
```

---

## Why an API Gateway?

| Concern | Direct client-to-service | With API Gateway |
|---|---|---|
| **Client complexity** | Client must know 3 URLs | Client needs only 1 URL |
| **Internal topology** | Service ports exposed to host | All internal — only gateway port published |
| **Request logging** | Must be duplicated in every service | Single centralized log stream |
| **Error handling** | Raw network errors reach client | Gateway normalizes 502/503 — always clean JSON |
| **Cross-cutting changes** | Touch N services | Touch 1 gateway |
| **Firewall rules** | Expose N ports | Expose 1 port |

**Single entry point** simplifies clients, centralizes cross-cutting concerns (logging, error normalization, future auth/rate-limiting), and completely hides the internal microservice topology.

---

## Directory Structure

```
Lab07/
├── api-gateway/              ← NEW: Express reverse-proxy gateway
│   ├── server.js             ← Config-driven routing, logging, 502/503 handling
│   ├── package.json          ← http-proxy-middleware dependency
│   ├── Dockerfile
│   └── .dockerignore
├── user-service/             ← Unchanged from Lab 06
├── product-service/          ← Unchanged from Lab 06
├── order-service/            ← Unchanged from Lab 06
├── compose.yaml              ← Updated: gateway added, services use expose:
├── render.yaml               ← NEW: Render cloud deployment blueprint
├── postman_collection.json   ← Updated: all 5 sections, env-variable driven
├── postman_env_local.json    ← NEW: Postman environment for localhost:4000
├── postman_env_cloud.json    ← NEW: Postman environment for Render cloud URL
└── README.md                 ← This file
```

---

## Gateway Routing Table

| Method | Gateway Path | Routed To | Env Variable |
|--------|-------------|-----------|--------------|
| `GET` | `/health` | Gateway (no proxy) | — |
| `GET` | `/` | Gateway (no proxy) | — |
| `ANY` | `/users/*` | user-service | `USER_SERVICE_URL` |
| `ANY` | `/products/*` | product-service | `PRODUCT_SERVICE_URL` |
| `ANY` | `/orders/*` | order-service | `ORDER_SERVICE_URL` |

### Full endpoint list (via gateway)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/health` | Gateway health + upstream URLs | 200 |
| `GET` | `/users` | List all users | 200 |
| `POST` | `/users` | Create user | 201 |
| `GET` | `/users/:id` | Get user by ID | 200 / 404 |
| `PUT` | `/users/:id` | Update user | 200 / 404 |
| `DELETE` | `/users/:id` | Delete user | 204 / 404 |
| `GET` | `/products` | List all products | 200 |
| `POST` | `/products` | Create product | 201 |
| `GET` | `/products/:id` | Get product by ID | 200 / 404 |
| `PUT` | `/products/:id` | Update product | 200 / 404 |
| `DELETE` | `/products/:id` | Delete product | 204 / 404 |
| `GET` | `/orders` | List all orders | 200 |
| `POST` | `/orders` | Create order (validates user + product) | 201 / 404 / 503 |
| `GET` | `/orders/:id` | Get order by ID | 200 / 404 |

---

## Config-based Service Discovery

### How it works

The gateway reads three environment variables **at startup** and builds its entire routing table from them. No URL appears anywhere in the routing logic itself:

```js
// api-gateway/server.js
const SERVICE_URLS = {
  user:    (process.env.USER_SERVICE_URL    || 'http://user-service:3001').trim(),
  product: (process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002').trim(),
  order:   (process.env.ORDER_SERVICE_URL   || 'http://order-service:3003').trim(),
};

// Route table built entirely from SERVICE_URLS — zero hard-coded URLs
app.use('/users',    makeProxy(SERVICE_URLS.user,    '/users'));
app.use('/products', makeProxy(SERVICE_URLS.product, '/products'));
app.use('/orders',   makeProxy(SERVICE_URLS.order,   '/orders'));
```

### Proof: config-only URL change

To reroute `/users` to a completely different host — **only the environment variable changes, no code touched, no rebuild needed**:

**Local (`compose.yaml`):**
```yaml
environment:
  USER_SERVICE_URL: "http://user-service:3001"   # change only this line
```

**Cloud (Render dashboard):**
```
USER_SERVICE_URL = https://lab07-user-service.onrender.com
```

The gateway prints its entire routing table at startup, confirming it reads from env:
```
📡 Routing table (config-driven from environment):
   /users/*    → http://user-service:3001
   /products/* → http://product-service:3002
   /orders/*   → http://order-service:3003
```

The `/health` endpoint also exposes the live upstream URLs, so you can verify config without reading logs:

```json
GET https://lab07-api-gateway.onrender.com/health
{
  "status": "ok",
  "service": "api-gateway",
  "version": "1.0.0",
  "timestamp": "2026-09-29T04:42:44.425Z",
  "upstreams": {
    "user-service":    "https://lab07-user-service.onrender.com",
    "product-service": "https://lab07-product-service.onrender.com",
    "order-service":   "https://lab07-order-service.onrender.com"
  }
}
```

### Static vs. dynamic service discovery

| Feature | Static / config-based (this lab) | Dynamic (Consul / Eureka / k8s DNS) |
|---------|----------------------------------|-------------------------------------|
| **Configuration** | Env vars, set manually | Auto-registered by each service instance |
| **URL changes** | Require env update + redeploy | Zero-downtime, instant |
| **Health-aware routing** | No — gateway doesn't poll upstreams | Yes — unhealthy instances removed automatically |
| **Horizontal scaling** | Manual URL update per new instance | Auto-discovery of new replicas |
| **Complexity** | Very low — ideal for labs | High — needs Consul/etcd/k8s control plane |
| **Failure visibility** | 503 on first failed request | Proactive: instance deregistered before 503 |

**What dynamic discovery adds:** When order-service scales to 3 instances, each self-registers with Consul. The gateway (or a service mesh like Envoy/Istio) queries the registry in real time and load-balances across all three — no env var change, no redeploy. For this lab's scale, static config is the right trade-off.

---

## Local Setup & Verification

### Prerequisites
- Docker Desktop running
- Port 4000 free on your machine

### Run

```bash
cd Lab07
docker compose up -d        # builds & starts all 4 containers
docker compose ps           # verify status
```

**Expected output:**
```
NAME              IMAGE                PORTS
api-gateway       api-gateway:v1       0.0.0.0:4000->3000/tcp  ← only published port
order-service     order-service:v1     3003/tcp                 ← internal only
product-service   product-service:v1   3002/tcp                 ← internal only
user-service      user-service:v1      3001/tcp                 ← internal only
```

### Local test results (verified 2026-09-29)

```
GET  /health        → 200  {"status":"ok","service":"api-gateway","upstreams":{...}}
GET  /users         → 200  []
POST /users         → 201  {"id":"u1","name":"Alice Johnson","email":"alice@example.com",...}
GET  /users/u1      → 200  {"id":"u1","name":"Alice Johnson",...}
PUT  /users/u1      → 200  {"name":"Alice Johnson (Updated)",...}
DELETE /users/u1    → 204
POST /products      → 201  {"id":"p1","name":"Laptop Pro 15","price":1299.99,...}
PUT  /products/p1   → 200  {"price":999,...}
DELETE /products/p1 → 204
POST /orders        → 201  {"id":"o1","totalPrice":2599.98,"status":"confirmed",...}
GET  /orders/o1     → 200  {"id":"o1",...}
```

### Gateway request log

Every proxied request is logged — method, original path, target service, status, duration:

```
[2026-09-29T04:07:11.770Z] GET /health → gateway | 200 (8ms)
[2026-09-29T04:07:11.823Z] GET /users → user-service | 200 (25ms)
[2026-09-29T04:07:11.858Z] POST /users → user-service | 201 (5ms)
[2026-09-29T04:07:11.941Z] GET /users/u1 → user-service | 200 (4ms)
[2026-09-29T04:07:11.979Z] POST /products → product-service | 201 (5ms)
[2026-09-29T04:07:12.094Z] POST /orders → order-service | 201 (76ms)
```

### 503 unreachable-service test

```bash
# Stop user-service to simulate outage
docker stop user-service

# Gateway returns structured 503 — never hangs or crashes
curl http://localhost:4000/users
# → 503 {
#     "error": "ServiceUnavailable",
#     "message": "Upstream service at http://user-service:3001 is unavailable...",
#     "upstream": "http://user-service:3001",
#     "path": "/users/"
#   }

# Restart — gateway recovers with zero changes
docker start user-service
curl http://localhost:4000/users
# → 200 []
```

**Gateway log during outage:**
```
[PROXY ERROR] GET /users/ → http://user-service:3001 | EAI_AGAIN | getaddrinfo EAI_AGAIN user-service
[2026-09-29T04:09:02.358Z] GET /users → user-service | 503 (5023ms)
```

---

## Cloud Deployment (Render)

### Platform: [Render](https://render.com)

**Why Render:**
- Free tier supports Docker web services with no credit card
- `render.yaml` Blueprint auto-creates all 4 services from one file
- Each service gets a `*.onrender.com` HTTPS URL
- Environment variables set per-service in the dashboard — same config-driven approach as local

### Public gateway URL

```
https://lab07-api-gateway.onrender.com
```

**Verified endpoints (tested 2026-09-29):**

```
GET  https://lab07-api-gateway.onrender.com/health   → 200
GET  https://lab07-api-gateway.onrender.com/users    → 200 []
POST https://lab07-api-gateway.onrender.com/users    → 201 {"id":"u1",...}
POST https://lab07-api-gateway.onrender.com/products → 201 {"id":"p1",...}
POST https://lab07-api-gateway.onrender.com/orders   → 201 {"id":"o1","totalPrice":799.99,"status":"confirmed",...}
```

### Deployment steps

1. **Push repo to GitHub**
   ```bash
   git push origin main
   ```

2. **Create Render Blueprint**
   - [dashboard.render.com](https://dashboard.render.com) → New → Blueprint
   - Connect `24Chessman/202512006_IT644_Lab07` repo
   - Blueprint Name: `lab07-microservices` → Apply

3. **Set environment variables** in Render dashboard (after services deploy):

   | Service | Variable | Value |
   |---------|----------|-------|
   | `lab07-order-service` | `USER_SERVICE_URL` | `https://lab07-user-service.onrender.com` |
   | `lab07-order-service` | `PRODUCT_SERVICE_URL` | `https://lab07-product-service.onrender.com` |
   | `lab07-api-gateway` | `USER_SERVICE_URL` | `https://lab07-user-service.onrender.com` |
   | `lab07-api-gateway` | `PRODUCT_SERVICE_URL` | `https://lab07-product-service.onrender.com` |
   | `lab07-api-gateway` | `ORDER_SERVICE_URL` | `https://lab07-order-service.onrender.com` |

4. **Verify** — `https://lab07-api-gateway.onrender.com/health` returns `{"status":"ok",...}`

### Free-tier limitations

| Limitation | Impact |
|-----------|--------|
| Services spin down after 15 min inactivity | First request ~30s cold start |
| In-memory store resets on cold start | Data not persisted (acceptable for demo/lab) |
| 512 MB RAM per service | Sufficient for all 3 microservices + gateway |
| No SLA / guaranteed uptime | Lab/demo use only |

---

## Postman Collection

**Files:**
- `postman_collection.json` — all 5 test sections
- `postman_env_local.json` — environment: `gateway_url = http://localhost:4000`
- `postman_env_cloud.json` — environment: `gateway_url = https://lab07-api-gateway.onrender.com`

### How to switch between local and cloud

1. In Postman → **Import** → import all three files
2. Top-right dropdown → select **"Lab07 — Local (Docker)"** or **"Lab07 — Cloud (Render)"**
3. Run the same collection — `{{gateway_url}}` resolves automatically

### Test sections

| Section | Tests | What it covers |
|---------|-------|----------------|
| `1 · Gateway Health & Info` | 2 | `/health` (upstream URLs from env), `/` routing table |
| `2 · User Service — via Gateway` | 7 | Full CRUD via `/users/*` |
| `3 · Product Service — via Gateway` | 7 | Full CRUD via `/products/*` |
| `4 · Order Service — via Gateway` | 3 | Full 3-service chain via `/orders/*` |
| `5 · Gateway Error Scenarios` | 5 | 404 invalid IDs, **503 service-down**, recovery, unknown route |

### 503 test procedure

```
1. docker stop user-service
2. Postman → "GET /users — 503 user-service DOWN"   → expect 503
3. docker start user-service
4. Postman → "GET /users — Recovery after restart"  → expect 200
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `curl: Connection refused` on port 4000 | Docker not running or gateway crashed | `docker compose up -d` |
| Gateway shows `503` for all routes on startup | Services haven't started yet | `docker compose restart api-gateway` after 5s |
| POST returns `400` missing fields | Required body fields not sent | Check request body (name, email / name, price, category) |
| Order returns `404` for userId | User deleted or service restarted (in-memory) | Re-create user first |
| Render cold start timeout in Postman | Free tier spin-down | Retry after 30s |
| `EAI_AGAIN` in gateway logs | Target container stopped / DNS gone | `docker start <service-name>` |
| `GatewayInternalError` on POST | Express body parsed before proxy (old bug) | Fixed: `express.json()` removed from gateway |

---

## Reflection

Compared to Lab 06, adding the API gateway and cloud deployment fundamentally changed how the system is **used and operated**:

1. **One URL to rule them all** — Postman (and any real client) configures a single endpoint — `localhost:4000` locally or the Render URL in the cloud. Switching from local to cloud means changing one environment variable, not three.

2. **True internal isolation** — the three microservices no longer publish host ports (`ports:` → `expose:`). From outside Docker, only port 4000 is reachable; user/product/order services are invisible to anyone not on the campus-network bridge.

3. **Centralized observability** — the gateway log shows every request across all services in one stream: `[timestamp] METHOD /path → service | status (ms)`. In Lab 06, you had to tail three separate containers to see the full picture.

4. **Graceful degradation** — when user-service goes down, the gateway catches `EAI_AGAIN` / `ECONNREFUSED` and returns a structured `503 ServiceUnavailable` within 5 seconds. The client always gets a meaningful JSON response — no hanging connection, no raw Node.js stack trace.

5. **Same code, two environments** — the exact same `server.js` runs locally (Docker DNS service names) and on Render (HTTPS Render URLs) with zero code changes. Only the env vars differ, proving the config-driven approach works across deployment targets.

6. **Cloud as first-class citizen** — deploying to Render exposed one real-world trade-off: Render free-tier services cold-start after 15 minutes of inactivity. The first request wakes all four services simultaneously, which can cascade delays. This would be solved in production with health-check pings, persistent compute, or a service mesh.

7. **Foundation for future cross-cutting concerns** — rate limiting, JWT auth, request-ID propagation, and A/B routing can now all be added in one place (the gateway) rather than replicated across every service — the key architectural benefit of this pattern.
