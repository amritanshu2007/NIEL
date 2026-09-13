-- =====================================================================
-- Migration: Messaging Gateway - notification reliability (feature: messaging-gateway)
--
-- ADDITIVE ONLY. Extends the existing feature_messages ledger so it fully
-- represents the notification-records contract:
--   id, incident_id, recipient, channel, provider, status,
--   provider_message_id (external_id), error, created_at, delivered_at
--
-- Adds:
--   * incident_id      - which incident triggered the notification
--   * dedupe_key       - deterministic idempotency key (incident+recipient+channel+topic)
--   * next_attempt_at  - scheduled time for the exponential-backoff retry
--   * 'simulated'      - new status reserved for the development adapter so a
--                        simulated message is ALWAYS clearly marked as such,
--                        never reported as sent/delivered.
--
-- Run via:  node scripts/run-migrations.js
-- =====================================================================

ALTER TABLE feature_messages
  ADD COLUMN IF NOT EXISTS incident_id BIGINT;

-- Idempotency: a unique, deterministic fingerprint per logical notification.
ALTER TABLE feature_messages
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(191);

-- Exponential backoff scheduling (NULL = eligible immediately).
ALTER TABLE feature_messages
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Allow the dev adapter's 'simulated' status (replaces the old CHECK).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'feature_messages_status_check'
       AND conrelid = 'feature_messages'::regclass
       AND pg_get_constraintdef(oid) NOT LIKE '%simulated%'
  ) THEN
    ALTER TABLE feature_messages DROP CONSTRAINT feature_messages_status_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'feature_messages_status_check'
       AND conrelid = 'feature_messages'::regclass
  ) THEN
    ALTER TABLE feature_messages ADD CONSTRAINT feature_messages_status_check
      CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'delivered', 'logged', 'simulated'));
  END IF;
END $$;

-- Deduplication index: one notification per (incident, recipient, channel, topic).
CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_messages_dedupe
  ON feature_messages (dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feature_messages_incident
  ON feature_messages (incident_id);

CREATE INDEX IF NOT EXISTS idx_feature_messages_next_attempt
  ON feature_messages (next_attempt_at) WHERE next_attempt_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feature_messages_provider
  ON feature_messages (provider);

-- =====================================================================
-- Reversibility (down migration, for documentation / manual rollback):
--   DROP INDEX IF EXISTS uq_feature_messages_dedupe;
--   DROP INDEX IF EXISTS idx_feature_messages_next_attempt;
--   DROP INDEX IF EXISTS idx_feature_messages_incident;
--   DROP INDEX IF EXISTS idx_feature_messages_provider;
--   ALTER TABLE feature_messages DROP COLUMN IF EXISTS incident_id;
--   ALTER TABLE feature_messages DROP COLUMN IF EXISTS dedupe_key;
--   ALTER TABLE feature_messages DROP COLUMN IF EXISTS next_attempt_at;
-- =====================================================================