'use strict';

const express = require('express');
const { register, login } = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const userModel = require('../models/userModel');
const wrap = require('../utils/wrap');

const router = express.Router();

// Public
router.post('/register', register);
router.post('/login', login);

// Protected example: returns the currently authenticated user
router.get('/me', authenticate, wrap(async (req, res) => {
  const user = await userModel.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({ user });
}));

module.exports = router;