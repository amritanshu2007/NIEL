-- =====================================================================
-- Migration: Messaging Gateway (feature: messaging-gateway)
--
-- ADDITIVE ONLY. Adds a single outbound message ledger used by the
-- messaging gateway (SMS / WhatsApp / Email / Push) so every send attempt,
-- including development "log-only" mode, is auditable. The gateway never
-- fakes a delivery: when no provider credentials are configured the
-- message is persisted with status 'logged'.
--
-- Feature API:  /api/v1/features/messaging/...
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

CREATE TABLE IF NOT EXISTS feature_messages (
  id           BIGSERIAL PRIMARY KEY,
  channel      VARCHAR(20)  NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email', 'push')),
  recipient    VARCHAR(255) NOT NULL,
  subject      VARCHAR(255),
  body         TEXT         NOT NULL,
  provider     VARCHAR(60),
  external_id  VARCHAR(120),
  status       VARCHAR(20)  NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'delivered', 'logged')),
  error        TEXT,
  attempts     SMALLINT     NOT NULL DEFAULT 0,
  metadata     JSONB,
  created_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feature_messages_status    ON feature_messages (status);
CREATE INDEX IF NOT EXISTS idx_feature_messages_channel   ON feature_messages (channel);
CREATE INDEX IF NOT EXISTS idx_feature_messages_external  ON feature_messages (external_id);
CREATE INDEX IF NOT EXISTS idx_feature_messages_created   ON feature_messages (created_at DESC);

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP TABLE IF EXISTS feature_messages;
-- =====================================================================