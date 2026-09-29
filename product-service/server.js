'use strict';

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const productsRouter = require('./routes/products');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app  = express();
const PORT = process.env.PORT || 3002;

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
    service: 'product-service',
    version: '1.0.0',
    description: 'Product Microservice — Lab 06',
    port: PORT,
    endpoints: {
      'GET    /products':      'List all products',
      'POST   /products':      'Create a new product',
      'GET    /products/:id':  'Get product by ID',
      'PUT    /products/:id':  'Full update of a product',
      'DELETE /products/:id':  'Delete a product',
    },
  });
});

// ---------------------------------------------------------------------------
// Product resource routes
// ---------------------------------------------------------------------------
app.use('/products', productsRouter);

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
  console.log(`\n🚀 product-service running on http://localhost:${PORT}`);
  console.log(`📦 Products API: http://localhost:${PORT}/products\n`);
});

module.exports = app;
