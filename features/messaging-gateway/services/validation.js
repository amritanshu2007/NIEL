'use strict';

/**
 * Messaging Gateway - payload validation for outbound messages.
 * Pure functions (no I/O), unit-testable.
 */

const CHANNELS = ['sms', 'whatsapp', 'email', 'push'];
const STATUSES = ['queued', 'sending', 'sent', 'failed', 'delivered', 'logged', 'simulated'];

// Loose but useful recipient checks per channel.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,19}$/;

function validateRecipient(channel, recipient) {
  if (!recipient || typeof recipient !== 'string') {
    return { ok: false, error: 'recipient is required' };
  }
  const value = recipient.trim();
  if (value.length > 255) {
    return { ok: false, error: 'recipient too long (max 255 chars)' };
  }
  if (channel === 'email' && !EMAIL_RE.test(value)) {
    return { ok: false, error: 'recipient is not a valid email address' };
  }
  if ((channel === 'sms' || channel === 'whatsapp') && !PHONE_RE.test(value)) {
    return { ok: false, error: 'recipient is not a valid phone number' };
  }
  return { ok: true, value };
}

/**
 * Validate and normalize an outbound message payload.
 * @returns {{ok:true, payload:object}|{ok:false, error:string}}
 */
function validateMessage({ channel, recipient, subject, body }) {
  const chan = String(channel || '').trim().toLowerCase();
  if (!CHANNELS.includes(chan)) {
    return { ok: false, error: `channel must be one of: ${CHANNELS.join(', ')}` };
  }
  const rc = validateRecipient(chan, recipient);
  if (!rc.ok) return rc;

  const text = typeof body === 'string' ? body.trim() : '';
  if (!text || text.length > 10000) {
    return { ok: false, error: 'body is required (<= 10000 chars)' };
  }

  const subj = typeof subject === 'string' ? subject.trim() : null;
  if (subj !== null && subj.length > 255) {
    return { ok: false, error: 'subject too long (max 255 chars)' };
  }

  return {
    ok: true,
    payload: {
      channel: chan,
      recipient: rc.value,
      subject: subj,
      body: text,
    },
  };
}

module.exports = { CHANNELS, STATUSES, validateMessage, validateRecipient };