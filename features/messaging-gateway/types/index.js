'use strict';

/**
 * Messaging Gateway - shared types & provider contract.
 * Backend is CommonJS; these are JSDoc typedefs plus runtime constants so
 * every adapter follows the same interface.
 */

/**
 * Result of a single provider send attempt.
 * @typedef {Object} ProviderSendResult
 * @property {boolean} ok           true when the provider accepted the message
 * @property {string|null} externalId  provider message id (sid/request_id/…)
 * @property {string|null} error    human-readable failure detail
 * @property {boolean} [simulated]  true ONLY for the dev adapter
 * @property {object} [providerStatus] raw provider status fields (no secrets)
 */

/**
 * A message ready to be handed to a provider.
 * @typedef {Object} OutboundMessage
 * @property {string} to      E.164-ish recipient (validated upstream)
 * @property {string} body    message text
 * @property {object} [metadata] optional structured context (never secrets)
 */

/**
 * MessagingProvider interface.
 *
 * @typedef {Object} MessagingProvider
 * @property {string} name
 * @property {string[]} supportedChannels   e.g. ['sms'] or ['sms','whatsapp']
 * @method sendSMS(msg: OutboundMessage): Promise<ProviderSendResult>
 * @method sendWhatsApp(msg: OutboundMessage): Promise<ProviderSendResult>
 */

/** Statuses the ledger can hold. 'simulated' marks dev-adapter messages. */
const STATUS = {
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  LOGGED: 'logged',
  SIMULATED: 'simulated',
};

const CHANNELS = ['sms', 'whatsapp', 'email', 'push'];

/** Deterministic idempotency fingerprint for a logical notification. */
function dedupeKey({ incidentId, recipient, channel, topic }) {
  const crypto = require('crypto');
  const raw = [incidentId, recipient, channel, topic || 'incident-alert'].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
}

module.exports = { STATUS, CHANNELS, dedupeKey };