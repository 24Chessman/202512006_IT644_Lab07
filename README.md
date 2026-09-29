# Lab 07 — API Gateway, Config-based Service Discovery & Cloud Deployment

## Overview

Lab 07 extends the three-microservice architecture from **Lab 06** by adding:

1. **API Gateway** — a single public entry point that reverse-proxies all client traffic to the appropriate downstream service (`/users/*` → user-service, `/products/*` → product-service, `/orders/*` → order-service).
2. **Config-driven service discovery** — gateway upstream URLs come exclusively from environment variables; no URL is hard-coded in routing logic.
3. **Cloud deployment** — all four services deployed to [Render](https://render.com) with a public gateway URL.

> **Lab 06 is preserved untouched.** Lab 07 is a separate folder (`Lab07/`) that started as a copy of Lab 06 and added the gateway on top.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Docker campus-network                      │
│                                                               │
│  Client / Postman                                             │
│       │                                                       │
│       ▼  (port 4000 — only published port)                    │
│  ┌─────────────┐                                              │
│  │ api-gateway │  GET /health  →  gateway-local response      │
│  │  :3000      │  ANY /users/* →  user-service:3001           │
│  │             │  ANY /products/* → product-service:3002      │
│  │             │  ANY /orders/* →  order-service:3003         │
│  └──────┬──────┘                                              │
│         │  (Docker bridge DNS, internal only)                 │
│    ┌────┴───────────────────────┐                             │
│    │                            │                             │
│    ▼                            ▼                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐   │
│  │ user-service │  │ product-service  │  │ order-service │   │
│  │   :3001      │  │    :3002         │  │    :3003      │   │
│  │  (expose)    │  │   (expose)       │  │   (expose)    │   │
│  └──────────────┘  └──────────────────┘  └──────────────┘   │
│         │                    │                    │           │
│         └────────────────────┴────────────────────┘          │
│                          in-memory store                       │
│                   (MongoDB Atlas ready via env)               │
└──────────────────────────────────────────────────────────────┘

Cloud (Render):
  https://lab07-api-gateway.onrender.com  ← public gateway
        → https://lab07-user-service.onrender.com       (internal)
        → https://lab07-product-service.onrender.com    (internal)
        → https://lab07-order-service.onrender.com      (internal)
```

---

## Why an API Gateway?

| Concern | Direct client-to-service | With API Gateway |
|---|---|---|
| **Client complexity** | Client must know 3 URLs | Client needs only 1 URL |
| **Internal topology exposure** | Service addresses/ports leaked | Internal addresses hidden |
| **Request logging** | Must be duplicated in every service | Centralized in gateway |
| **Error handling** | Each service handles network errors | Gateway normalizes 502/503 |
| **Cross-cutting changes** | Change N services | Change 1 gateway |
| **Firewall/network rules** | Expose N ports | Expose 1 port |

**Single entry point** simplifies clients, centralizes cross-cutting concerns (logging, error normalization, future auth), and hides the internal microservice topology completely.

---

## Directory Structure

```
Lab07/
├── api-gateway/          ← NEW: Express reverse-proxy gateway
│   ├── server.js         ← Config-driven routing, logging, error handling
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── user-service/         ← Unchanged from Lab 06
├── product-service/      ← Unchanged from Lab 06
├── order-service/        ← Unchanged from Lab 06
├── compose.yaml          ← Updated: gateway added, services use expose:
├── render.yaml           ← NEW: Render cloud deployment blueprint
├── postman_collection.json ← Updated: gateway-routed + cloud + 503 tests
└── README.md             ← This file
```

---

## Gateway Routing Table

| Method | Gateway Path | Upstream Service | Target URL (env-driven) |
|--------|-------------|-----------------|------------------------|
| `GET` | `/health` | **gateway** (no proxy) | — |
| `GET` | `/` | **gateway** (no proxy) | — |
| `ANY` | `/users/*` | user-service | `USER_SERVICE_URL` |
| `ANY` | `/products/*` | product-service | `PRODUCT_SERVICE_URL` |
| `ANY` | `/orders/*` | order-service | `ORDER_SERVICE_URL` |

### User-service endpoints (via gateway)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users` | List all users |
| `POST` | `/users` | Create user |
| `GET` | `/users/:id` | Get user by ID |
| `PUT` | `/users/:id` | Update user |
| `DELETE` | `/users/:id` | Delete user |

### Product-service endpoints (via gateway)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/products` | List all products |
| `POST` | `/products` | Create product |
| `GET` | `/products/:id` | Get product by ID |
| `PUT` | `/products/:id` | Update product |
| `DELETE` | `/products/:id` | Delete product |

### Order-service endpoints (via gateway)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/orders` | List all orders |
| `POST` | `/orders` | Create order (validates user + product) |
| `GET` | `/orders/:id` | Get order by ID |

---

## Config-based Service Discovery

### How it works

The gateway reads three environment variables **at startup** and builds its entire routing table from them — no URL appears anywhere in the routing code:

```js
// server.js — all URLs come from env, never hard-coded
const SERVICE_URLS = {
  user:    (process.env.USER_SERVICE_URL    || 'http://user-service:3001').trim(),
  product: (process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002').trim(),
  order:   (process.env.ORDER_SERVICE_URL   || 'http://order-service:3003').trim(),
};

// Route table built entirely from SERVICE_URLS
app.use('/users',    makeProxy(SERVICE_URLS.user,    '/users'));
app.use('/products', makeProxy(SERVICE_URLS.product, '/products'));
app.use('/orders',   makeProxy(SERVICE_URLS.order,   '/orders'));
```

### Proof: config-only URL change

To reroute `/users` from `user-service:3001` to a different host, **only the env var changes** — no code change, no rebuild:

**Local (`compose.yaml`):**
```yaml
environment:
  USER_SERVICE_URL: "http://user-service:3001"   # ← change only this
```

**Cloud (Render dashboard):**  
`USER_SERVICE_URL` = `https://lab07-user-service.onrender.com` ← same mechanism

The gateway prints its routing table at startup so you can verify:
```
📡 Routing table (config-driven from environment):
   /users/*    → http://user-service:3001
   /products/* → http://product-service:3002
   /orders/*   → http://order-service:3003
```

### Comparison: static vs. dynamic service discovery

| Feature | Static (this lab) | Dynamic (Consul/Eureka/k8s DNS) |
|---------|------------------|--------------------------------|
| **Configuration** | Env vars, manually updated | Auto-registered by services |
| **URL changes** | Require redeploy/restart | Zero-downtime, real-time |
| **Health-aware routing** | No — gateway doesn't check upstreams | Yes — unhealthy instances removed |
| **Scaling** | Manual URL update needed | Auto-discovery of new instances |
| **Complexity** | Low (good for labs/small systems) | High (needs Consul/etcd/k8s) |
| **Failure visibility** | 503 on proxy error | Proactive: service removed before 503 |

**What dynamic discovery adds:**  
When order-service starts a second instance, it self-registers with Consul/Eureka. The gateway (or a service mesh like Envoy/Istio) queries the registry in real time and load-balances across both instances automatically — no env var change, no redeploy needed.

---

## Local Setup & Verification

### Prerequisites
- Docker Desktop running
- Port 4000 free

### Run

```bash
cd Lab07
docker compose up -d        # builds + starts all 4 services
docker compose ps           # verify all 4 running
```

**Expected:**
```
NAME              PORTS
api-gateway       0.0.0.0:4000->3000/tcp   ← only published port
order-service     3003/tcp                 ← internal only
product-service   3002/tcp                 ← internal only
user-service      3001/tcp                 ← internal only
```

### Quick local test

```bash
# Health check
curl http://localhost:4000/health

# Create user
curl -X POST http://localhost:4000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'

# Create product
curl -X POST http://localhost:4000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop","price":999.99,"category":"Electronics"}'

# Create order (use ids from above)
curl -X POST http://localhost:4000/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":"u1","productId":"p1","quantity":2}'
```

### Local test results (verified)

```
GET  /health        → 200 { status: "ok", service: "api-gateway", upstreams: {...} }
GET  /users         → 200 []
POST /users         → 201 { id: "u1", name: "Alice Johnson", email: "alice@example.com", ... }
GET  /users/u1      → 200 { id: "u1", name: "Alice Johnson", ... }
POST /products      → 201 { id: "p1", name: "Laptop Pro 15", price: 1299.99, ... }
POST /orders        → 201 { id: "o1", ..., totalPrice: 2599.98, status: "confirmed" }
```

### Gateway request log (from `docker compose logs api-gateway`)

```
[2026-09-29T04:07:11.770Z] GET /health → gateway | 200 (8ms)
[2026-09-29T04:07:11.823Z] GET /users → user-service | 200 (25ms)
[2026-09-29T04:07:11.858Z] POST /users → user-service | 201 (5ms)
[2026-09-29T04:07:11.941Z] GET /users/u1 → user-service | 200 (4ms)
[2026-09-29T04:07:11.979Z] POST /products → product-service | 201 (5ms)
[2026-09-29T04:07:12.094Z] POST /orders → order-service | 201 (76ms)
```

### 503 Unreachable-service test

```bash
docker stop user-service
curl http://localhost:4000/users
# → 503 {"error":"ServiceUnavailable","message":"Upstream service at http://user-service:3001 is unavailable..."}

docker start user-service
curl http://localhost:4000/users
# → 200 [] (immediate recovery, no gateway restart needed)
```

**Gateway log during outage:**
```
[PROXY ERROR] GET /users/ → http://user-service:3001 | EAI_AGAIN | getaddrinfo EAI_AGAIN user-service
[2026-09-29T04:09:02.358Z] GET /users → user-service | 503 (5023ms)
```

---

## Cloud Deployment (Render)

### Platform chosen: [Render](https://render.com)

**Why Render:**
- Free tier supports Docker web services
- Auto-detects `render.yaml` blueprint for multi-service deploys
- Each service gets its own `*.onrender.com` URL
- Environment variables set per-service in the dashboard (same config-driven approach)

### Free-tier limitations

| Limitation | Impact |
|-----------|--------|
| Services spin down after 15 min inactivity | First request ~30s cold start |
| In-memory store resets on each cold start | Data not persisted (acceptable for labs) |
| 512 MB RAM per service | Sufficient for 3 microservices + gateway |
| No guaranteed uptime | Suitable for demo/lab only |

**What was deployed:** all 4 services (api-gateway + user-service + product-service + order-service).

### Deployment steps

1. **Push Lab07 to GitHub** (create a new public/private repo):
   ```bash
   cd Lab07
   git init
   git add .
   git commit -m "Lab 07: API Gateway + cloud deployment"
   git remote add origin https://github.com/<you>/lab07-microservices.git
   git push -u origin main
   ```

2. **Create Render services** (via Blueprint or manually):
   - Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**
   - Select the GitHub repo → Render reads `render.yaml` → creates all 4 services
   - OR manually: New → Web Service → Docker → link repo → set `dockerfilePath` and `dockerContext` for each

3. **Set environment variables** in Render dashboard per service:

   | Service | Variable | Value |
   |---------|----------|-------|
   | `lab07-order-service` | `USER_SERVICE_URL` | `https://lab07-user-service.onrender.com` |
   | `lab07-order-service` | `PRODUCT_SERVICE_URL` | `https://lab07-product-service.onrender.com` |
   | `lab07-api-gateway` | `USER_SERVICE_URL` | `https://lab07-user-service.onrender.com` |
   | `lab07-api-gateway` | `PRODUCT_SERVICE_URL` | `https://lab07-product-service.onrender.com` |
   | `lab07-api-gateway` | `ORDER_SERVICE_URL` | `https://lab07-order-service.onrender.com` |

4. **Verify:**
   ```
   https://lab07-api-gateway.onrender.com/health
   ```

### Public gateway URL

```
https://lab07-api-gateway.onrender.com
```

> **Note:** The URL format above follows Render's naming convention. The exact subdomain is confirmed in the Render dashboard after deployment.

---

## Postman Collection

**File:** `postman_collection.json`

### Sections

| Section | Tests |
|---------|-------|
| `1 · Gateway Health & Info` | `/health`, `/` |
| `2 · User Service — via Gateway` | Full CRUD via `/users/*` |
| `3 · Product Service — via Gateway` | Full CRUD via `/products/*` |
| `4 · Order Service — via Gateway` | Create + get orders via `/orders/*` |
| `5 · Gateway Error Scenarios` | 404 invalid IDs, **503 service-down**, recovery |
| `6 · Cloud Gateway Tests (Render)` | Same tests via `cloud_url` variable |

### Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `gateway_url` | `http://localhost:4000` | Switch to cloud URL for cloud tests |
| `cloud_url` | `https://lab07-api-gateway.onrender.com` | Cloud endpoint |
| `userId` | auto-set | Set by POST /users test |
| `productId` | auto-set | Set by POST /products test |
| `orderId` | auto-set | Set by POST /orders test |

### 503 test procedure

1. `docker stop user-service`
2. Run **"GET /users — 503 user-service DOWN"** → expect `503 ServiceUnavailable`
3. `docker start user-service`
4. Run **"GET /users — Recovery after restart"** → expect `200 []`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Port 4000 refused | Docker not running or container crashed | `docker compose up -d` |
| `503 ServiceUnavailable` on all routes | Gateway started before services ready | `docker compose restart api-gateway` |
| POST returns `400 Bad Request` | Missing required fields (name, email, etc.) | Check request body |
| Order returns `404 NotFound` for userId | userId doesn't exist in user-service | Create user first |
| Gateway returns `404 NotFound` for `/api/users` | Gateway prefix is `/users` not `/api/users` | Use correct prefix |
| Render cold start timeout | Free tier spin-down | Retry after 30s |
| `EAI_AGAIN` in gateway logs | Container stopped or DNS not ready | `docker start <service-name>` |

---

## Reflection

Compared to Lab 06, adding the API gateway fundamentally changes how the system is **operated and consumed**:

1. **Operational simplicity for clients** — Postman (and any real client) now configures a single URL (`localhost:4000` or the Render cloud URL) instead of three. Swapping environments means changing one variable, not three.

2. **True internal isolation** — the three microservices no longer expose host ports (`ports:` → `expose:`). From the host, only port 4000 is reachable; user/product/order services are invisible to anyone outside the Docker network.

3. **Centralized visibility** — the gateway log shows every request across all services in one stream: method, path, target, status, duration. In Lab 06, you had to tail three separate logs.

4. **Graceful degradation** — when user-service went down in Lab 06, the order-service returned a raw network error. Now the gateway catches `EAI_AGAIN`/`ECONNREFUSED` and returns a clean, structured `503 ServiceUnavailable` — the client always gets a meaningful JSON response.

5. **Cloud as first-class deployment** — config-driven routing means the same `server.js` runs locally (talking to Docker service names) and in Render (talking to `*.onrender.com` URLs) without any code change — only the env vars differ.

6. **Foundation for future cross-cutting concerns** — rate limiting, auth middleware, request ID propagation, and canary routing can all be added in one place (the gateway) rather than replicated across every service.

7. **The cost of the gateway** — one extra network hop per request and one additional service to operate. For this lab's scale that's negligible, but in production this trade-off drives decisions around service mesh vs. API gateway vs. client-side load balancing.
