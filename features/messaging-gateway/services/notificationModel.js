'use strict';

/**
 * Messaging Gateway - notification ledger (feature_messages) data access.
 *
 * Implements persistence, idempotent dedup, retry scheduling (exponential
 * backoff via next_attempt_at) and delivery-status tracking on the exact
 * notification-records contract:
 *   id, incident_id, recipient, channel, provider, status,
 *   provider_message_id (external_id), error, created_at, delivered_at
 */

const pool = require('../../../src/config/db');
const { STATUS } = require('../types');

const MESSAGE_FIELDS = `
  id, incident_id, channel, recipient, subject, body, provider, external_id, status,
  error, attempts, metadata, created_by, created_at, sent_at, delivered_at, dedupe_key`;

/**
 * Insert a notification. Returns { row } or { duplicate:true } when the
 * dedupe_key already exists (DB-level duplicate prevention / idempotency).
 */
const createNotification = async ({
  incidentId = null,
  channel,
  recipient,
  subject = null,
  body,
  provider = null,
  metadata = null,
  dedupeKey = null,
  createdBy = null,
}) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO feature_messages
         (incident_id, channel, recipient, subject, body, provider, metadata, dedupe_key, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued')
       RETURNING ${MESSAGE_FIELDS}`,
      [
        incidentId,
        channel,
        recipient,
        subject,
        body,
        provider,
        metadata ? JSON.stringify(metadata) : null,
        dedupeKey,
        createdBy,
      ]
    );
    return { row: rows[0], duplicate: false };
  } catch (err) {
    if (err.code === '23505' && /uq_feature_messages_dedupe/.test(err.detail || '')) {
      return { row: null, duplicate: true };
    }
    throw err;
  }
};

const getNotification = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_FIELDS} FROM feature_messages WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

const getByExternalId = async (externalId) => {
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_FIELDS} FROM feature_messages WHERE external_id = $1`,
    [String(externalId)]
  );
  return rows[0] || null;
};

const getByDedupeKey = async (dedupeKey) => {
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_FIELDS} FROM feature_messages WHERE dedupe_key = $1`,
    [dedupeKey]
  );
  return rows[0] || null;
};

/** Generic status patch (single row by id). */
const updateStatus = async (id, patch) => {
  const sets = [];
  const params = [];
  const add = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  if (patch.status !== undefined) add('status', patch.status);
  if (patch.externalId !== undefined) add('external_id', patch.externalId);
  if (patch.error !== undefined) add('error', patch.error);
  if (patch.provider !== undefined) add('provider', patch.provider);
  if (patch.attempts !== undefined) add('attempts', patch.attempts);
  if (patch.nextAttemptAt !== undefined) add('next_attempt_at', patch.nextAttemptAt);
  if (patch.metadata !== undefined) add('metadata', JSON.stringify(patch.metadata));
  if (patch.sentAt !== undefined) add('sent_at', patch.sentAt);
  if (patch.deliveredAt !== undefined) add('delivered_at', patch.deliveredAt);

  if (!sets.length) return null;
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE feature_messages SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${MESSAGE_FIELDS}`,
    params
  );
  return rows[0] || null;
};

/**
 * Claim notifications ready for dispatch:
 *  - queued & (next_attempt_at IS NULL OR <= now)  → first attempt
 *  - failed & attempts < maxAttempts & next_attempt_at <= now → retry
 * Returns elements locked to this worker by an atomic guard so multiple
 * replicas never double-send (transition queued->sending in the same step).
 */
const claimDue = async ({ limit = 50, maxAttempts = 3, provider = null }) => {
  const providerCond = provider ? `AND provider = $3` : '';
  const { rows } = await pool.query(
    `WITH due AS (
       SELECT id
         FROM feature_messages
        WHERE (
                status = 'queued'
                  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
              )
           OR (
                status = 'failed'
                  AND attempts < $2
                  AND next_attempt_at IS NOT NULL
                  AND next_attempt_at <= NOW()
              )
          ${providerCond}
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE feature_messages f
        SET status = 'sending'
       FROM due
      WHERE f.id = due.id
      RETURNING f.id, f.channel, f.recipient, f.body, f.subject, f.status, f.external_id,
                f.incident_id, f.attempts, f.provider, f.metadata`,
    provider ? [limit, maxAttempts, provider] : [limit, maxAttempts]
  );
  return rows;
};

/** Register a failed attempt and schedule the next one via backoff. */
const markFailure = async ({ id, attempts, nextAttemptAtMs, error }) => {
  return updateStatus(id, {
    status: STATUS.FAILED,
    attempts,
    error: String(error).slice(0, 500),
    nextAttemptAt: new Date(nextAttemptAtMs).toISOString(),
  });
};

const markSent = async ({ id, externalId, providerStatus }) => {
  return updateStatus(id, {
    status: STATUS.SENT,
    externalId,
    error: null,
    nextAttemptAt: null,
    metadata: providerStatus ? { provider_status: providerStatus } : undefined,
    sentAt: new Date().toISOString(),
  });
};

/** Dev adapter path - clearly SIMULATED, never sent/delivered. */
const markSimulated = async ({ id, externalId }) => {
  return updateStatus(id, {
    status: STATUS.SIMULATED,
    externalId: externalId || `sim-${id}`,
    error: null,
    nextAttemptAt: null,
    sentAt: new Date().toISOString(),
    metadata: { simulated: true },
  });
};

const markDelivered = async ({ id, deliveredAt, providerStatus }) => {
  return updateStatus(id, {
    status: STATUS.DELIVERED,
    error: null,
    deliveredAt: deliveredAt || new Date().toISOString(),
    metadata: providerStatus ? { provider_status: providerStatus } : undefined,
  });
};

/** Admin list with filters. */
const listNotifications = async ({ status = null, channel = null, provider = null, incidentId = null, limit = 50, offset = 0 } = {}) => {
  const params = [];
  const conds = [];
  if (status) { params.push(status); conds.push(`status = $${params.length}`); }
  if (channel) { params.push(channel); conds.push(`channel = $${params.length}`); }
  if (provider) { params.push(provider); conds.push(`provider = $${params.length}`); }
  if (incidentId) { params.push(incidentId); conds.push(`incident_id = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(Math.min(Number(limit) || 50, 200), Number(offset) || 0);
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_FIELDS}
       FROM feature_messages
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
};

const countByStatus = async () => {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM feature_messages GROUP BY status`
  );
  return rows.reduce((acc, r) => {
    acc[r.status] = r.count;
    return acc;
  }, {});
};

const countByProvider = async () => {
  const { rows } = await pool.query(
    `SELECT COALESCE(provider, 'none') AS provider, COUNT(*)::int AS count
       FROM feature_messages GROUP BY COALESCE(provider, 'none')`
  );
  return rows.reduce((acc, r) => {
    acc[r.provider] = r.count;
    return acc;
  }, {});
};

const indexByDedupe = async () => {
  const { rows } = await pool.query(
    `SELECT dedupe_key FROM feature_messages WHERE dedupe_key IS NOT NULL`
  );
  return new Set(rows.map((r) => r.dedupe_key));
};

module.exports = {
  createNotification,
  getNotification,
  getByExternalId,
  getByDedupeKey,
  updateStatus,
  claimDue,
  markFailure,
  markSent,
  markSimulated,
  markDelivered,
  listNotifications,
  countByStatus,
  countByProvider,
  indexByDedupe,
  MESSAGE_FIELDS,
};