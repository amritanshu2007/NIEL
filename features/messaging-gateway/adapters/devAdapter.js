'use strict';

/**
 * Development / simulation adapter.
 *
 * Used when NO provider credentials are configured (MESSAGING_PROVIDER=dev).
 * It records exactly what WOULD have been sent and returns simulated:true so
 * the ledger status becomes 'simulated' - it is NEVER reported as sent or
 * delivered. Callers that need a truthy "delivered" signal must use a real
 * provider.
 */

const crypto = require('crypto');

class DevAdapter {
  constructor() {
    this.name = 'dev';
    this.supportedChannels = ['sms', 'whatsapp', 'email', 'push'];
  }

  async _simulate(channel, msg) {
    return {
      ok: true,
      externalId: `sim-${channel}-${crypto.randomBytes(6).toString('hex')}`,
      error: null,
      simulated: true,
      providerStatus: { simulated: true },
    };
  }

  async sendSMS(msg) {
    return this._simulate('sms', msg);
  }

  async sendWhatsApp(msg) {
    return this._simulate('whatsapp', msg);
  }

  async sendEmail(msg) {
    return this._simulate('email', msg);
  }

  async sendPush(msg) {
    return this._simulate('push', msg);
  }
}

module.exports = DevAdapter;