'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const DevAdapter = require('../adapters/devAdapter');
const TwilioAdapter = require('../adapters/twilio');
const Fast2SmsAdapter = require('../adapters/fast2sms');
const { providerFor } = require('../adapters');

test('dev adapter marks its sends as simulated, never delivered', async () => {
  const dev = new DevAdapter();
  const res = await dev.sendSMS({ to: '+919000000001', body: 'test' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.simulated, true);
  assert.ok(res.externalId && res.externalId.startsWith('sim-'));
  assert.strictEqual(res.providerStatus.simulated, true);
});

test('factory returns dev adapter when no credentials are configured', () => {
  const provider = providerFor({
    provider: 'dev',
    twilio: { accountSid: '', authToken: '' },
    fast2sms: { apiKey: '' },
    timeoutMs: 8000,
  });
  assert.strictEqual(provider.name, 'dev');
});

test('factory falls back to dev when twilio credentials are missing', () => {
  const provider = providerFor({
    provider: 'twilio',
    twilio: { accountSid: '', authToken: '' },
    timeoutMs: 8000,
  });
  assert.strictEqual(provider.name, 'dev');
});

test('twilio adapter reflects its configured state from injected config', () => {
  const cfg = { accountSid: 'ACabc', authToken: 'tok', smsFrom: '+15551234', whatsappFrom: 'whatsapp:+15551234' };
  const twilio = new TwilioAdapter(cfg);
  assert.strictEqual(twilio.name, 'twilio');
  assert.strictEqual(twilio.configured, true);
  assert.deepStrictEqual(twilio.supportedChannels, ['sms', 'whatsapp']);
});

test('twilio whatsapp refuses when whatsapp from-number is not configured', async () => {
  const twilio = new TwilioAdapter({
    accountSid: 'ACabc',
    authToken: 'tok',
    smsFrom: '+15551234',
    whatsappFrom: '',
  });
  const res = await twilio.sendWhatsApp({ to: '+919000000001', body: 'test' });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /whatsappFrom/i);
});

test('fast2sms only supports SMS and refuses WhatsApp', async () => {
  const fast = new Fast2SmsAdapter({ apiKey: 'k', route: 'q', senderId: '' });
  assert.deepStrictEqual(fast.supportedChannels, ['sms']);
  const res = await fast.sendWhatsApp({ to: '+919000000001', body: 'x' });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /WhatsApp/);
});

test('fast2sms refuses when no API key is set', async () => {
  const fast = new Fast2SmsAdapter({ apiKey: '' });
  const res = await fast.sendSMS({ to: '+919000000001', body: 'x' });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /not configured/);
});