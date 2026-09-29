'use strict';

const express = require('express');
const router  = express.Router();

// ---------------------------------------------------------------------------
// In-memory data store — database-per-service pattern
// No other service accesses this directly; they call the REST API.
// ---------------------------------------------------------------------------
let users   = [];
let nextId  = 1;

// ---------------------------------------------------------------------------
// Helper: generate a new user ID
// ---------------------------------------------------------------------------
function generateId() {
  return `u${nextId++}`;
}

// ---------------------------------------------------------------------------
// Helper: find user by id
// ---------------------------------------------------------------------------
function findUser(id) {
  return users.find(u => u.id === id);
}

// ---------------------------------------------------------------------------
// GET /users — list all users
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  res.status(200).json(users);
});

// ---------------------------------------------------------------------------
// POST /users — create a new user
// Body: { name: string, email: string }
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const { name, email } = req.body || {};

  // Validate required fields
  const errors = [];
  if (!name  || typeof name  !== 'string' || !name.trim())  errors.push('Field "name" is required.');
  if (!email || typeof email !== 'string' || !email.trim()) errors.push('Field "email" is required.');

  if (errors.length) {
    return res.status(400).json({ error: 'ValidationError', details: errors });
  }

  // Check for duplicate email
  const duplicate = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (duplicate) {
    return res.status(400).json({
      error: 'ValidationError',
      details: [`Field "email" must be unique. "${email}" is already registered.`],
    });
  }

  const user = {
    id:        generateId(),
    name:      name.trim(),
    email:     email.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  console.log(`✅  Created user: ${user.id} — ${user.name}`);
  res.status(201).json(user);
});

// ---------------------------------------------------------------------------
// GET /users/:id — get a single user
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({
      error: 'NotFound',
      message: `User with id "${req.params.id}" not found.`,
    });
  }
  res.status(200).json(user);
});

// ---------------------------------------------------------------------------
// PUT /users/:id — full update (all fields required)
// Body: { name: string, email: string }
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({
      error: 'NotFound',
      message: `User with id "${req.params.id}" not found.`,
    });
  }

  const { name, email } = req.body || {};

  const errors = [];
  if (!name  || typeof name  !== 'string' || !name.trim())  errors.push('Field "name" is required.');
  if (!email || typeof email !== 'string' || !email.trim()) errors.push('Field "email" is required.');

  if (errors.length) {
    return res.status(400).json({ error: 'ValidationError', details: errors });
  }

  // Check duplicate email (excluding this user)
  const duplicate = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase() && u.id !== req.params.id);
  if (duplicate) {
    return res.status(400).json({
      error: 'ValidationError',
      details: [`Field "email" must be unique. "${email}" is already registered.`],
    });
  }

  user.name      = name.trim();
  user.email     = email.trim().toLowerCase();
  user.updatedAt = new Date().toISOString();

  console.log(`✏️   Updated user: ${user.id} — ${user.name}`);
  res.status(200).json(user);
});

// ---------------------------------------------------------------------------
// DELETE /users/:id — delete a user
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const index = users.findIndex(u => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({
      error: 'NotFound',
      message: `User with id "${req.params.id}" not found.`,
    });
  }

  const [deleted] = users.splice(index, 1);
  console.log(`🗑️   Deleted user: ${deleted.id} — ${deleted.name}`);
  res.status(204).send();
});

module.exports = router;
