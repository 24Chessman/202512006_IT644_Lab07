'use strict';

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const usersRouter = require('./routes/users');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app  = express();
const PORT = process.env.PORT || 3001;

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
    service: 'user-service',
    version: '1.0.0',
    description: 'User Microservice — Lab 06',
    port: PORT,
    endpoints: {
      'GET    /users':      'List all users',
      'POST   /users':      'Create a new user',
      'GET    /users/:id':  'Get user by ID',
      'PUT    /users/:id':  'Full update of a user',
      'DELETE /users/:id':  'Delete a user',
    },
  });
});

// ---------------------------------------------------------------------------
// User resource routes
// ---------------------------------------------------------------------------
app.use('/users', usersRouter);

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
  console.log(`\n🚀 user-service running on http://localhost:${PORT}`);
  console.log(`👥 Users API:  http://localhost:${PORT}/users\n`);
});

module.exports = app;
