'use strict';

// ---------------------------------------------------------------------------
// node-fetch v3 is ESM-only; we use a dynamic import inside an async helper
// to keep the rest of the file CommonJS compatible.
// ---------------------------------------------------------------------------
const express = require('express');
const router  = express.Router();

// ---------------------------------------------------------------------------
// In-memory data store — database-per-service pattern
// Order Service owns ONLY order data.
// User/Product data is accessed exclusively through their REST APIs.
// ---------------------------------------------------------------------------
let orders = [];
let nextId = 1;

// ---------------------------------------------------------------------------
// Helper: generate a new order ID
// ---------------------------------------------------------------------------
function generateId() {
  return `o${nextId++}`;
}

// ---------------------------------------------------------------------------
// Helper: find order by id
// ---------------------------------------------------------------------------
function findOrder(id) {
  return orders.find(o => o.id === id);
}

// ---------------------------------------------------------------------------
// Helper: call an upstream service with a 5-second timeout
//
// Returns:
//   { ok: true,  status: number, data: object }   — on successful response
//   { ok: false, status: number, error: string }   — on non-2xx response
//   { ok: false, status: 503,    error: string }   — on network error / timeout
// ---------------------------------------------------------------------------
async function callService(url) {
  // Dynamic import for ESM node-fetch (v3)
  const { default: fetch } = await import('node-fetch');

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 5000); // 5-second timeout

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      // Non-JSON body — ignore
    }

    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    clearTimeout(timeoutId);

    // AbortError means our timeout fired
    if (err.name === 'AbortError') {
      return {
        ok:    false,
        status: 503,
        error: `Upstream service at ${url} timed out after 5 seconds.`,
      };
    }
    // ECONNREFUSED, ENOTFOUND, etc. — service is down / unreachable
    return {
      ok:    false,
      status: 503,
      error: `Upstream service at ${url} is unreachable: ${err.message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// POST /orders — create a new order
//
// Body: {
//   userId:    string,  — must exist in user-service
//   productId: string,  — must exist in product-service
//   quantity:  number   — positive integer
// }
//
// Inter-service communication flow:
//   1. Validate userId   → GET {USER_SERVICE_URL}/users/:userId
//   2. Validate productId→ GET {PRODUCT_SERVICE_URL}/products/:productId
//   3. If either service is down  → 503 Service Unavailable
//   4. If either ID is not found  → 404 Not Found
//   5. Both valid → create order  → 201 Created
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const { userId, productId, quantity } = req.body || {};

  // --- Local validation ---
  const errors = [];
  if (!userId    || typeof userId    !== 'string' || !userId.trim())   errors.push('Field "userId" is required.');
  if (!productId || typeof productId !== 'string' || !productId.trim()) errors.push('Field "productId" is required.');
  if (quantity   === undefined || quantity === null)                     errors.push('Field "quantity" is required.');
  else if (!Number.isInteger(quantity) || quantity < 1)                 errors.push('Field "quantity" must be a positive integer.');

  if (errors.length) {
    return res.status(400).json({ error: 'ValidationError', details: errors });
  }

  // --- Inter-service: validate userId ---
  const userServiceUrl = req.app.locals.USER_SERVICE_URL;
  console.log(`🔍 Validating user ${userId} via ${userServiceUrl}/users/${userId}`);

  const userResult = await callService(`${userServiceUrl}/users/${userId.trim()}`);

  if (!userResult.ok) {
    if (userResult.status === 404) {
      return res.status(404).json({
        error:   'NotFound',
        message: `User with id "${userId}" not found.`,
      });
    }
    // Service unavailable (503) — timeout or network failure
    console.error(`⚠️  user-service error: ${userResult.error || userResult.status}`);
    return res.status(503).json({
      error:   'ServiceUnavailable',
      message: `user-service is currently unavailable. Please try again later.`,
      detail:  userResult.error || `HTTP ${userResult.status}`,
    });
  }

  const userData = userResult.data;

  // --- Inter-service: validate productId ---
  const productServiceUrl = req.app.locals.PRODUCT_SERVICE_URL;
  console.log(`🔍 Validating product ${productId} via ${productServiceUrl}/products/${productId}`);

  const productResult = await callService(`${productServiceUrl}/products/${productId.trim()}`);

  if (!productResult.ok) {
    if (productResult.status === 404) {
      return res.status(404).json({
        error:   'NotFound',
        message: `Product with id "${productId}" not found.`,
      });
    }
    console.error(`⚠️  product-service error: ${productResult.error || productResult.status}`);
    return res.status(503).json({
      error:   'ServiceUnavailable',
      message: `product-service is currently unavailable. Please try again later.`,
      detail:  productResult.error || `HTTP ${productResult.status}`,
    });
  }

  const productData = productResult.data;

  // --- Create order ---
  const order = {
    id:        generateId(),
    userId:    userId.trim(),
    productId: productId.trim(),
    quantity,
    // Snapshot user and product info at order creation time
    // (avoids coupling to live data; matches real-world order immutability)
    userSnapshot: {
      id:    userData.id,
      name:  userData.name,
      email: userData.email,
    },
    productSnapshot: {
      id:       productData.id,
      name:     productData.name,
      price:    productData.price,
      category: productData.category,
    },
    totalPrice: parseFloat((productData.price * quantity).toFixed(2)),
    status:    'confirmed',
    createdAt: new Date().toISOString(),
  };

  orders.push(order);
  console.log(`✅  Created order: ${order.id} — User ${order.userId} × Product ${order.productId} × Qty ${quantity}`);
  res.status(201).json(order);
});

// ---------------------------------------------------------------------------
// GET /orders — list all orders
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  res.status(200).json(orders);
});

// ---------------------------------------------------------------------------
// GET /orders/:id — get a single order
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) {
    return res.status(404).json({
      error:   'NotFound',
      message: `Order with id "${req.params.id}" not found.`,
    });
  }
  res.status(200).json(order);
});

module.exports = router;
