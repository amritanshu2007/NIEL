'use strict';

/**
 * Provider factory - switches the active provider via environment config
 * (MESSAGING_PROVIDER=twilio|fast2sms|dev). When credentials are absent the
 * factory INSTEAD returns the dev/simulation adapter so the gateway is never
 * left pretending it sent something.
 */

const DevAdapter = require('./devAdapter');
const TwilioAdapter = require('./twilio');
const Fast2SmsAdapter = require('./fast2sms');

/**
 * @param {object} cfg full config() object
 * @returns {MessagingProvider}
 */
function providerFor(cfg) {
  const provider = (cfg?.provider || 'dev').toLowerCase();

  if (provider === 'twilio' && cfg.twilio && (cfg.twilio.accountSid && cfg.twilio.authToken)) {
    return new TwilioAdapter(cfg.twilio, cfg.timeoutMs);
  }
  if (provider === 'fast2sms' && cfg.fast2sms && cfg.fast2sms.apiKey) {
    return new Fast2SmsAdapter(cfg.fast2sms, cfg.timeoutMs);
  }

  if (provider === 'twilio') {
    console.warn('[messaging-gateway] MESSAGING_PROVIDER=twilio but credentials are missing - falling back to SIMULATED dev adapter');
  }
  if (provider === 'fast2sms') {
    console.warn('[messaging-gateway] MESSAGING_PROVIDER=fast2sms but credentials are missing - falling back to SIMULATED dev adapter');
  }
  return new DevAdapter();
}

module.exports = { providerFor };