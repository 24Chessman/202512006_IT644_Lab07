'use strict';

const express = require('express');
const router  = express.Router();

// ---------------------------------------------------------------------------
// In-memory data store — database-per-service pattern
// No other service accesses this directly; they call the REST API.
// ---------------------------------------------------------------------------
let products = [];
let nextId   = 1;

// ---------------------------------------------------------------------------
// Helper: generate a new product ID
// ---------------------------------------------------------------------------
function generateId() {
  return `p${nextId++}`;
}

// ---------------------------------------------------------------------------
// Helper: find product by id
// ---------------------------------------------------------------------------
function findProduct(id) {
  return products.find(p => p.id === id);
}

// ---------------------------------------------------------------------------
// GET /products — list all products
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  res.status(200).json(products);
});

// ---------------------------------------------------------------------------
// POST /products — create a new product
// Body: { name: string, price: number, category: string }
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const { name, price, category } = req.body || {};

  // Validate required fields
  const errors = [];
  if (!name     || typeof name     !== 'string' || !name.trim())          errors.push('Field "name" is required.');
  if (price     === undefined || price === null)                           errors.push('Field "price" is required.');
  else if (typeof price !== 'number' || isNaN(price) || price < 0)        errors.push('Field "price" must be a non-negative number.');
  if (!category || typeof category !== 'string' || !category.trim())      errors.push('Field "category" is required.');

  if (errors.length) {
    return res.status(400).json({ error: 'ValidationError', details: errors });
  }

  const product = {
    id:        generateId(),
    name:      name.trim(),
    price:     parseFloat(price.toFixed(2)),
    category:  category.trim(),
    createdAt: new Date().toISOString(),
  };

  products.push(product);
  console.log(`✅  Created product: ${product.id} — ${product.name} ($${product.price})`);
  res.status(201).json(product);
});

// ---------------------------------------------------------------------------
// GET /products/:id — get a single product
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Product with id "${req.params.id}" not found.`,
    });
  }
  res.status(200).json(product);
});

// ---------------------------------------------------------------------------
// PUT /products/:id — full update (all fields required)
// Body: { name: string, price: number, category: string }
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Product with id "${req.params.id}" not found.`,
    });
  }

  const { name, price, category } = req.body || {};

  const errors = [];
  if (!name     || typeof name     !== 'string' || !name.trim())          errors.push('Field "name" is required.');
  if (price     === undefined || price === null)                           errors.push('Field "price" is required.');
  else if (typeof price !== 'number' || isNaN(price) || price < 0)        errors.push('Field "price" must be a non-negative number.');
  if (!category || typeof category !== 'string' || !category.trim())      errors.push('Field "category" is required.');

  if (errors.length) {
    return res.status(400).json({ error: 'ValidationError', details: errors });
  }

  product.name      = name.trim();
  product.price     = parseFloat(price.toFixed(2));
  product.category  = category.trim();
  product.updatedAt = new Date().toISOString();

  console.log(`✏️   Updated product: ${product.id} — ${product.name}`);
  res.status(200).json(product);
});

// ---------------------------------------------------------------------------
// DELETE /products/:id — delete a product
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const index = products.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Product with id "${req.params.id}" not found.`,
    });
  }

  const [deleted] = products.splice(index, 1);
  console.log(`🗑️   Deleted product: ${deleted.id} — ${deleted.name}`);
  res.status(204).send();
});

module.exports = router;
