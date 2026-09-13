'use strict';

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const SALT_ROUNDS = 10;

const ROLES = ['admin', 'field_officer', 'transporter'];

const PUBLIC_FIELDS = 'id, name, email, role, district, created_at';

function toPublic(row) {
  if (!row) return null;
  const { id, name, email, role, district, created_at: createdAt } = row;
  return { id, name, email, role, district, createdAt };
}

const findByEmail = async (email) => {
  const { rows } = await pool.query(
    `SELECT id, name, email, password, role, district, created_at
       FROM users
      WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
};

const findById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_FIELDS}
       FROM users
      WHERE id = $1`,
    [id]
  );
  return toPublic(rows[0]);
};

const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);

const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

const create = async ({ name, email, password, role = 'transporter', district }) => {
  const hashed = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password, role, district)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_FIELDS}`,
    [name, email, hashed, role, district]
  );
  return toPublic(rows[0]);
};

module.exports = { findByEmail, findById, create, hashPassword, verifyPassword, ROLES };