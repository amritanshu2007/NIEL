'use strict';

const jwt = require('jsonwebtoken');

const userModel = require('../models/userModel');
const wrap = require('../utils/wrap');

const register = wrap(async (req, res) => {
  const { name, email, password, role = 'transporter', district } = req.body;

  if (!name || !email || !password || !district) {
    return res.status(400).json({ error: 'name, email, password and district are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!userModel.ROLES.includes(role)) {
    return res.status(400).json({
      error: `role must be one of: ${userModel.ROLES.join(', ')}`,
    });
  }

  try {
    const user = await userModel.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role,
      district: district.trim(),
    });
    return res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'users_email_key') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

const login = wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = await userModel.findByEmail(email.trim().toLowerCase());

  if (!user || !(await userModel.verifyPassword(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, district: user.district },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const { password: _omit, ...publicUser } = user;
  return res.json({ token, user: publicUser });
});

module.exports = { register, login };