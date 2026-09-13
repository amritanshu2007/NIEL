'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { dedupeKey } = require('../types');
const { backoffMs } = require('../services/notificationService');
const { validateMessage, validateRecipient } = require('../services/validation');

test('dedupeKey is deterministic for identical inputs', () => {
  const a = dedupeKey({ incidentId: 7, recipient: '+919000000001', channel: 'sms', topic: 'incident-alert' });
  const b = dedupeKey({ incidentId: 7, recipient: '+919000000001', channel: 'sms', topic: 'incident-alert' });
  assert.strictEqual(a, b);
});

test('dedupeKey differs across recipient/channel/incident', () => {
  const base = { incidentId: 7, recipient: '+919000000001', channel: 'sms', topic: 'incident-alert' };
  assert.notStrictEqual(dedupeKey({ ...base, recipient: '+919000000002' }), dedupeKey(base));
  assert.notStrictEqual(dedupeKey({ ...base, channel: 'whatsapp' }), dedupeKey(base));
  assert.notStrictEqual(dedupeKey({ ...base, incidentId: 8 }), dedupeKey(base));
});

test('backoff grows exponentially', () => {
  const base = { backoffBaseMs: 10000, backoffFactor: 2 };
  assert.strictEqual(backoffMs(1, base), 10000);
  assert.strictEqual(backoffMs(2, base), 20000);
  assert.strictEqual(backoffMs(3, base), 40000);
});

test('phone validation accepts E.164-ish and rejects garbage', () => {
  assert.strictEqual(validateRecipient('sms', '+919740123456').ok, true);
  assert.strictEqual(validateRecipient('sms', '09740123456').ok, true);
  assert.strictEqual(validateRecipient('sms', 'not-a-number').ok, false);
  assert.strictEqual(validateRecipient('sms', '').ok, false);
});

test('message validation caps body length and rejects bad channels', () => {
  const ok = validateMessage({ channel: 'sms', recipient: '+919000000001', body: 'Alert body' });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(validateMessage({ channel: 'carrier-pigeon', recipient: '+919000000001', body: 'x' }).ok, false);
  assert.strictEqual(validateMessage({ channel: 'sms', recipient: '+919000000001', body: 'x'.repeat(10001) }).ok, false);
});