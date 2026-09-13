-- =====================================================================
-- Migration: users table (Authentication & User Management)
-- Simplified version to avoid script splitting issues with DO blocks
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(100)   NOT NULL,
  email      VARCHAR(255)   NOT NULL UNIQUE,
  password   VARCHAR(255)   NOT NULL,
  role       VARCHAR(20)    NOT NULL DEFAULT 'transporter' CHECK (role IN ('admin', 'field_officer', 'transporter')),
  district   VARCHAR(100)   NOT NULL,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);