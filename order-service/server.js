'use strict';

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const ordersRouter = require('./routes/orders');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app  = express();
const PORT = process.env.PORT || 3003;

// Make service URLs available to route handlers via app.locals
// These are read from environment — never hard-coded URLs
app.locals.USER_SERVICE_URL    = (process.env.USER_SERVICE_URL    || 'http://user-service:3001').trim();
app.locals.PRODUCT_SERVICE_URL = (process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002').trim();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Root route — service info
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    service: 'order-service',
    version: '1.0.0',
    description: 'Order Microservice — Lab 06',
    port: PORT,
    dependencies: {
      userService:    app.locals.USER_SERVICE_URL,
      productService: app.locals.PRODUCT_SERVICE_URL,
    },
    endpoints: {
      'POST /orders':      'Create a new order (validates user + product)',
      'GET  /orders':      'List all orders',
      'GET  /orders/:id':  'Get order by ID',
    },
  });
});

// ---------------------------------------------------------------------------
// Order resource routes
// ---------------------------------------------------------------------------
app.use('/orders', ordersRouter);

// ---------------------------------------------------------------------------
// 404 handler for unknown routes
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: `Route ${req.method} ${req.path} not found.`,
  });
});

// ---------------------------------------------------------------------------
// Generic error handler — must be last
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  console.error('❌  Unhandled error:', err.message);
  res.status(500).json({
    error: 'InternalServerError',
    message: err.message || 'An unexpected error occurred.',
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🚀 order-service running on http://localhost:${PORT}`);
  console.log(`📋 Orders API:       http://localhost:${PORT}/orders`);
  console.log(`🔗 User Service URL: ${app.locals.USER_SERVICE_URL}`);
  console.log(`🔗 Product Service:  ${app.locals.PRODUCT_SERVICE_URL}\n`);
});

module.exports = app;
