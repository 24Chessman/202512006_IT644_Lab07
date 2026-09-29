'use strict';

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

// ---------------------------------------------------------------------------
// Config-driven service discovery
// ---------------------------------------------------------------------------
// ALL target URLs come exclusively from environment variables.
// No hard-coded URLs appear anywhere in routing logic.
// To reroute a service, change only the env var — no code change needed.
// ---------------------------------------------------------------------------
const SERVICE_URLS = {
  user:    (process.env.USER_SERVICE_URL    || 'http://user-service:3001').trim(),
  product: (process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002').trim(),
  order:   (process.env.ORDER_SERVICE_URL   || 'http://order-service:3003').trim(),
};

// Validate that all required service URLs are present at startup
const missingEnv = [];
if (!process.env.USER_SERVICE_URL)    missingEnv.push('USER_SERVICE_URL');
if (!process.env.PRODUCT_SERVICE_URL) missingEnv.push('PRODUCT_SERVICE_URL');
if (!process.env.ORDER_SERVICE_URL)   missingEnv.push('ORDER_SERVICE_URL');

if (missingEnv.length > 0) {
  console.warn(`⚠️  Missing env vars (using defaults): ${missingEnv.join(', ')}`);
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app  = express();
const PORT = process.env.PORT || 3000;

// NOTE: express.json() is intentionally NOT used here.
// http-proxy-middleware streams the raw request body directly to the upstream
// service. Consuming/parsing the body with express.json() before the proxy
// runs would consume the stream and break POST/PUT requests.
app.use(cors());

// ---------------------------------------------------------------------------
// Request logging middleware
// Logs: timestamp, method, original path, routed target service, status code
// Applied to every request; status captured on response 'finish' event.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  const start = Date.now();

  // Determine which service this request targets (for logging)
  let targetService = 'gateway';
  if (req.path.startsWith('/users'))    targetService = 'user-service';
  else if (req.path.startsWith('/products')) targetService = 'product-service';
  else if (req.path.startsWith('/orders'))   targetService = 'order-service';

  res.on('finish', () => {
    const ms = Date.now() - start;
    const ts = new Date().toISOString();
    console.log(
      `[${ts}] ${req.method} ${req.originalUrl} → ${targetService} | ${res.statusCode} (${ms}ms)`
    );
  });

  next();
});

// ---------------------------------------------------------------------------
// Health endpoint — gateway-only, no proxying
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    service:   'api-gateway',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    upstreams: {
      'user-service':    SERVICE_URLS.user,
      'product-service': SERVICE_URLS.product,
      'order-service':   SERVICE_URLS.order,
    },
  });
});

// ---------------------------------------------------------------------------
// Root route — gateway info
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    service:     'api-gateway',
    version:     '1.0.0',
    description: 'API Gateway — Lab 07',
    port:        PORT,
    routes: {
      'GET  /health':      'Gateway health check (no proxy)',
      'ANY  /users/*':     `→ user-service    (${SERVICE_URLS.user})`,
      'ANY  /products/*':  `→ product-service (${SERVICE_URLS.product})`,
      'ANY  /orders/*':    `→ order-service   (${SERVICE_URLS.order})`,
    },
  });
});

// ---------------------------------------------------------------------------
// Proxy factory — creates a proxy with consistent error handling
// ---------------------------------------------------------------------------
/**
 * IMPORTANT PATH NOTE:
 * When Express mounts app.use('/users', proxy), it strips the '/users'
 * prefix from req.url before passing control to the proxy. So a request
 * for GET /users/123 arrives at the proxy as GET /123.
 *
 * We use pathRewrite to prepend the prefix back, so the upstream service
 * receives the full path it expects (e.g. GET /users/123).
 *
 * changeOrigin ensures the Host header matches the upstream target.
 * onError returns a clean 502/503 instead of hanging or crashing.
 */
function makeProxy(targetUrl, routePrefix) {
  return createProxyMiddleware({
    target:       targetUrl,
    changeOrigin: true,
    // Prepend the stripped prefix back onto the path so upstream sees /users/...
    pathRewrite: (path) => `${routePrefix}${path}`,
    on: {
      error: (err, req, res) => {
        const code    = err.code || '';
        const isDown  = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code);
        const status  = isDown ? 503 : 502;
        const errName = isDown ? 'ServiceUnavailable' : 'BadGateway';

        console.error(
          `[PROXY ERROR] ${req.method} ${req.url} → ${targetUrl} | ${code} | ${err.message}`
        );

        // Guard: res may already be partially written
        if (!res.headersSent) {
          res.status(status).json({
            error:   errName,
            message: isDown
              ? `Upstream service at ${targetUrl} is unavailable. Please try again later.`
              : `Bad gateway: upstream returned an unexpected error.`,
            upstream: targetUrl,
            path:     req.url,
          });
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Route table — built entirely from SERVICE_URLS (config-driven)
// ---------------------------------------------------------------------------
// Changing USER_SERVICE_URL / PRODUCT_SERVICE_URL / ORDER_SERVICE_URL in env
// is all that's needed to reroute traffic — zero code changes required.
// ---------------------------------------------------------------------------
app.use('/users',    makeProxy(SERVICE_URLS.user,    '/users'));
app.use('/products', makeProxy(SERVICE_URLS.product, '/products'));
app.use('/orders',   makeProxy(SERVICE_URLS.order,   '/orders'));

// ---------------------------------------------------------------------------
// 404 handler for unmatched gateway routes
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    error:   'NotFound',
    message: `Gateway route ${req.method} ${req.path} not found.`,
    hint:    'Available prefixes: /users, /products, /orders, /health',
  });
});

// ---------------------------------------------------------------------------
// Generic error handler — catches any synchronous errors in gateway logic
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  console.error('❌  Gateway error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({
      error:   'GatewayInternalError',
      message: err.message || 'An unexpected gateway error occurred.',
    });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🚀 api-gateway running on http://localhost:${PORT}`);
  console.log(`\n📡 Routing table (config-driven from environment):`);
  console.log(`   /users/*    → ${SERVICE_URLS.user}`);
  console.log(`   /products/* → ${SERVICE_URLS.product}`);
  console.log(`   /orders/*   → ${SERVICE_URLS.order}`);
  console.log(`\n🏥 Health check: http://localhost:${PORT}/health\n`);
});

module.exports = app;
